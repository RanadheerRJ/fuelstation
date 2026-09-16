// DEPRECATED - Collections removed, jackpot confusing, now simple To Handover only - kept for backward compat, not used in UI
import { listDocs, addDocTo, updateDocById, queryDocs, getDocById, whereStation } from './firestoreService.js';
import { getState } from '../state.js';

// Collection name: settlements (to avoid confusion)
const COLL = 'settlements';

export async function getSettlements(stationId) {
  let all = await queryDocs(COLL, s => s.stationId === stationId, whereStation(stationId));
  return all.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function addSettlement({ stationId, staffUserId, staffName, shiftId, shiftIds, amount, type, method, notes }) {
  const { user } = getState();
  const payload = {
    stationId,
    staffUserId,
    staffName,
    shiftId: shiftId || null,
    shiftIds: shiftIds || (shiftId ? [shiftId] : []),
    amount: Number(amount),
    type: type || 'collect', // collect = owner collects from staff, return = owner returns excess to staff
    method: method || 'cash',
    notes: notes || '',
    createdBy: user?.uid,
    createdByName: user?.name || 'Owner',
    createdAt: new Date().toISOString(),
    status: 'completed',
  };
  const doc = await addDocTo(COLL, payload);
  return doc;
}

export async function getStaffBalances(stationId) {
  const { queryDocs: q } = await import('./firestoreService.js');
  const allShifts = await q('shifts', s => s.stationId === stationId && s.status === 'APPROVED', whereStation(stationId));
  const settlements = await getSettlements(stationId);

  // Group shifts by staff
  const staffMap = {};

  allShifts.forEach(shift => {
    const uid = shift.userId;
    if (!staffMap[uid]) {
      staffMap[uid] = {
        staffUserId: uid,
        staffName: shift.employeeName,
        shifts: [],
        totalToCollect: 0,
        totalToReturn: 0,
        collected: 0,
        returned: 0,
        pendingCollect: 0,
        pendingReturn: 0,
      };
    }
    const variance = shift.totals?.variance || 0;
    const toCollect = variance < -0.5 ? Math.abs(variance) : 0;
    const toReturn = variance > 0.5 ? variance : 0;
    const collectedAmt = shift.settlement?.collectedAmount || 0;
    const returnedAmt = shift.settlement?.returnedAmount || 0;

    // If settlement field exists, use it, else calculate from settlements history as fallback
    let pendingCollect = Math.max(0, toCollect - collectedAmt);
    let pendingReturn = Math.max(0, toReturn - returnedAmt);

    // Fallback: if no settlement field but settlements exist for this shift
    if (!shift.settlement) {
      const shiftSettlements = settlements.filter(s => s.shiftId === shift.id || (s.shiftIds && s.shiftIds.includes(shift.id)));
      const collectedViaLedger = shiftSettlements.filter(s => s.type === 'collect').reduce((a,s)=>a+Number(s.amount||0),0);
      const returnedViaLedger = shiftSettlements.filter(s => s.type === 'return').reduce((a,s)=>a+Number(s.amount||0),0);
      pendingCollect = Math.max(0, toCollect - collectedViaLedger);
      pendingReturn = Math.max(0, toReturn - returnedViaLedger);
    }

    staffMap[uid].shifts.push({
      ...shift,
      toCollect,
      toReturn,
      collectedAmt,
      returnedAmt,
      pendingCollect,
      pendingReturn,
    });
    staffMap[uid].totalToCollect += toCollect;
    staffMap[uid].totalToReturn += toReturn;
    staffMap[uid].collected += collectedAmt;
    staffMap[uid].returned += returnedAmt;
    staffMap[uid].pendingCollect += pendingCollect;
    staffMap[uid].pendingReturn += pendingReturn;
  });

  // Also include settlements that are not tied to shifts (general collections)
  settlements.forEach(set => {
    if (set.shiftId) return; // already accounted via shift
    if (!set.staffUserId) return;
    if (!staffMap[set.staffUserId]) {
      staffMap[set.staffUserId] = {
        staffUserId: set.staffUserId,
        staffName: set.staffName || 'Staff',
        shifts: [],
        totalToCollect: 0,
        totalToReturn: 0,
        collected: 0,
        returned: 0,
        pendingCollect: 0,
        pendingReturn: 0,
      };
    }
    if (set.type === 'collect') {
      staffMap[set.staffUserId].collected += Number(set.amount||0);
      staffMap[set.staffUserId].pendingCollect = Math.max(0, staffMap[set.staffUserId].pendingCollect - Number(set.amount||0));
    } else {
      staffMap[set.staffUserId].returned += Number(set.amount||0);
      staffMap[set.staffUserId].pendingReturn = Math.max(0, staffMap[set.staffUserId].pendingReturn - Number(set.amount||0));
    }
  });

  const list = Object.values(staffMap);
  // Calculate totals
  const totals = {
    totalPendingCollect: list.reduce((a,s)=>a+s.pendingCollect,0),
    totalPendingReturn: list.reduce((a,s)=>a+s.pendingReturn,0),
    totalCollected: list.reduce((a,s)=>a+s.collected,0),
    totalReturned: list.reduce((a,s)=>a+s.returned,0),
    totalToCollectEver: list.reduce((a,s)=>a+s.totalToCollect,0),
    totalToReturnEver: list.reduce((a,s)=>a+s.totalToReturn,0),
    staffCount: list.length,
  };

  return { staffList: list, settlements, totals, allShifts };
}

export async function collectFromShift(shiftId, amount, notes, type='collect') {
  const shift = await getDocById('shifts', shiftId);
  if (!shift) throw new Error('Shift not found');
  const { user } = getState();
  const variance = shift.totals?.variance || 0;
  const toCollect = variance < -0.5 ? Math.abs(variance) : 0;
  const toReturn = variance > 0.5 ? variance : 0;

  const currentCollected = shift.settlement?.collectedAmount || 0;
  const currentReturned = shift.settlement?.returnedAmount || 0;

  let patch = {};
  if (type === 'collect') {
    if (amount > (toCollect - currentCollected) + 0.01) throw new Error(`Cannot collect more than pending ₹${(toCollect - currentCollected).toFixed(2)}`);
    patch = {
      settlement: {
        ...(shift.settlement||{}),
        collectedAmount: currentCollected + Number(amount),
        collectedAt: new Date().toISOString(),
        collectedBy: user?.uid,
        collectedByName: user?.name,
        status: (currentCollected + Number(amount) >= toCollect - 0.01) ? 'SETTLED' : 'PARTIAL',
      }
    };
  } else {
    if (amount > (toReturn - currentReturned) + 0.01) throw new Error(`Cannot return more than pending ₹${(toReturn - currentReturned).toFixed(2)}`);
    patch = {
      settlement: {
        ...(shift.settlement||{}),
        returnedAmount: currentReturned + Number(amount),
        returnedAt: new Date().toISOString(),
        returnedBy: user?.uid,
        returnedByName: user?.name,
        status: (currentReturned + Number(amount) >= toReturn - 0.01) ? 'SETTLED' : 'PARTIAL',
      }
    };
  }

  // If both sides settled or no variance, mark SETTLED
  const finalCollected = type==='collect' ? (currentCollected + Number(amount)) : currentCollected;
  const finalReturned = type==='return' ? (currentReturned + Number(amount)) : currentReturned;
  const isFullySettled = (finalCollected >= toCollect - 0.01) && (finalReturned >= toReturn - 0.01);
  if (isFullySettled) {
    patch.settlement.status = 'SETTLED';
    patch.settlement.settledAt = new Date().toISOString();
  }

  await updateDocById('shifts', shiftId, patch);
  const settlement = await addSettlement({
    stationId: shift.stationId,
    staffUserId: shift.userId,
    staffName: shift.employeeName,
    shiftId,
    amount,
    type,
    notes,
  });
  return settlement;
}

export async function collectBulk(stationId, staffUserId, staffName, shiftIds, totalAmount, notes, type='collect') {
  // Distribute totalAmount across shiftIds in order
  const shifts = [];
  for (const sid of shiftIds) {
    const s = await getDocById('shifts', sid);
    if (s) shifts.push(s);
  }
  // Sort by oldest first
  shifts.sort((a,b)=> new Date(a.startTime) - new Date(b.startTime));

  let remaining = Number(totalAmount);
  const results = [];

  for (const shift of shifts) {
    if (remaining <= 0.01) break;
    const variance = shift.totals?.variance || 0;
    const toCollect = variance < -0.5 ? Math.abs(variance) : 0;
    const toReturn = variance > 0.5 ? variance : 0;
    const target = type==='collect' ? toCollect : toReturn;
    const already = type==='collect' ? (shift.settlement?.collectedAmount||0) : (shift.settlement?.returnedAmount||0);
    const pending = Math.max(0, target - already);
    if (pending <= 0.01) continue;
    const take = Math.min(pending, remaining);
    const res = await collectFromShift(shift.id, take, notes, type);
    results.push(res);
    remaining -= take;
  }

  if (remaining > 0.5) {
    // Create general settlement for remaining (if owner wants to collect more than pending? Allow as advance)
    await addSettlement({
      stationId,
      staffUserId,
      staffName,
      shiftId: null,
      shiftIds: shiftIds,
      amount: remaining,
      type,
      notes: (notes||'') + ' (advance/general)',
    });
  }

  return results;
}

export async function settleAllPending(stationId) {
  const { staffList } = await getStaffBalances(stationId);
  const { user } = getState();
  let settledCount = 0;
  let totalSettled = 0;

  for (const staff of staffList) {
    for (const shift of staff.shifts) {
      if (shift.pendingCollect > 0.5) {
        await collectFromShift(shift.id, shift.pendingCollect, 'Settle All - Reset Dashboard', 'collect');
        totalSettled += shift.pendingCollect;
        settledCount++;
      }
      if (shift.pendingReturn > 0.5) {
        await collectFromShift(shift.id, shift.pendingReturn, 'Settle All - Reset Dashboard', 'return');
        settledCount++;
      }
    }
  }

  return { settledCount, totalSettled };
}

export function getHideBalancePref(stationId) {
  return localStorage.getItem(`fuelops_hide_balance_${stationId}`) === '1';
}
export function setHideBalancePref(stationId, hide) {
  localStorage.setItem(`fuelops_hide_balance_${stationId}`, hide ? '1' : '0');
}
export function formatHidden(amount, hidden, currencyFn) {
  if (!hidden) return currencyFn(amount);
  return '••••';
}
