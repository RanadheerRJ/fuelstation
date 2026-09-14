import { listDocs, addDocTo, updateDocById, getDocById, queryDocs, logAudit,
         acquireNozzleLock, releaseNozzleLock } from './firestoreService.js';
import { getState } from '../state.js';
import { calcLitersSold, calcRevenue, calcShiftTotals, calcPaymentsTotal, calcVariance } from './calc.js';
import { getPriceForFuelAtTime } from './prices.js';
import { roundMoney, sumMoney, parseReadingInput, validateClosingReading } from './money.js';

// ---------------------------------------------------------------------------
// Authorization helpers (Step 3 / Step 4)
//
// These are a USABILITY layer: they give the user a clear message instead of a
// raw Firestore permission error. They are NOT the security boundary — the same
// constraints are enforced in firestore.rules, which is what actually stops a
// crafted request.
// ---------------------------------------------------------------------------

const REVIEWER_ROLES = ['super_admin', 'owner', 'admin', 'manager'];

function currentUser() {
  const { user } = getState();
  if (!user || !user.uid) throw new Error('You are not signed in.');
  return user;
}

function assertReviewer(user) {
  if (!REVIEWER_ROLES.includes(user.role)) {
    throw new Error('Only a manager, admin or owner can review shifts.');
  }
}

function assertStationAccess(user, stationId) {
  if (user.role === 'super_admin') return;
  const mine = user.stationIds || [];
  if (stationId && !mine.includes(stationId)) {
    throw new Error('You do not have access to this station.');
  }
}

/** Statuses an attendant is still allowed to edit. */
const EDITABLE_BY_OWNER_STATUSES = ['ACTIVE', 'REJECTED'];

export async function getShifts(stationId, opts={}) {
  let shifts = await queryDocs('shifts', null, [{ field: 'stationId', op: '==', value: stationId }]);
  if (opts.userId) shifts = shifts.filter(s => s.userId === opts.userId);
  if (opts.status) shifts = shifts.filter(s => s.status === opts.status);
  return shifts.sort((a,b) => new Date(b.startTime) - new Date(a.startTime));
}

export async function getActiveShiftForUser(userId) {
  const all = await queryDocs('shifts', null, [{ field: 'userId', op: '==', value: userId }, { field: 'status', op: '==', value: 'ACTIVE' }]);
  return all[0] || null;
}

export async function startShift({ stationId, userId, employeeName, nozzles }) {
  const user = currentUser();
  assertStationAccess(user, stationId);

  // An attendant may only open a shift for themselves. Managers may open one
  // on behalf of staff.
  if (userId !== user.uid && !REVIEWER_ROLES.includes(user.role)) {
    throw new Error('You can only start a shift for yourself.');
  }
  if (!Array.isArray(nozzles) || nozzles.length === 0) {
    throw new Error('Select at least one nozzle to start a shift.');
  }

  // One active shift per user.
  const mine = await getActiveShiftForUser(userId);
  if (mine) throw new Error('This employee already has an active shift. Close it before starting another.');

  // Validate every opening reading BEFORE writing anything. Previously
  // `Number(n.openingReading)` turned "abc" into NaN, which was then stored.
  const validated = [];
  const warnings = [];
  for (const n of nozzles) {
    const r = parseReadingInput(n.openingReading, { label: `Opening reading for nozzle ${n.nozzleNumber ?? n.nozzleId}` });
    if (!r.ok) throw new Error(r.error);
    if (r.warning) warnings.push(r.warning);
    validated.push({ ...n, openingReading: r.value });
  }

  // Guard against the same nozzle appearing twice in one request.
  const ids = validated.map(n => n.nozzleId);
  if (new Set(ids).size !== ids.length) throw new Error('The same nozzle was selected more than once.');

  const payload = {
    stationId,
    userId,
    employeeName,
    startTime: new Date().toISOString(),
    status: 'ACTIVE',
    nozzles: validated.map(n => ({
      nozzleId: n.nozzleId,
      pumpId: n.pumpId,
      fuelType: n.fuelType,
      openingReading: n.openingReading,
      closingReading: null,
      litersSold: 0,
      price: 0,
      revenue: 0,
    })),
    totals: { totalLiters:0, totalRevenue:0, payments:{cash:0,card:0,upi:0,credit:0,other:0}, totalPayments:0, variance:0, varianceStatus:'BALANCED' },
    correctionRequests: [],
    createdBy: user.uid,
  };

  const doc = await addDocTo('shifts', payload);

  // Claim each nozzle atomically. If any claim loses the race, roll back the
  // locks we already took and delete the half-created shift.
  const acquired = [];
  try {
    for (const n of payload.nozzles) {
      await acquireNozzleLock(n.nozzleId, {
        shiftId: doc.id, stationId, userId, employeeName,
      });
      acquired.push(n.nozzleId);
    }
  } catch (e) {
    for (const nid of acquired) await releaseNozzleLock(nid, doc.id);
    try {
      const { deleteDocById } = await import('./firestoreService.js');
      await deleteDocById('shifts', doc.id);
    } catch { /* leave the shift for a manager to clean up */ }
    throw e;
  }

  await logAudit({
    stationId, action: 'SHIFT_STARTED', entityType: 'shift', entityId: doc.id,
    metadata: { userId, employeeName, nozzles: ids },
  });

  return { ...doc, warnings };
}

export async function closeShift(shiftId, { closingReadings, payments }) {
  const user = currentUser();
  const shift = await getDocById('shifts', shiftId);
  if (!shift) throw new Error('Shift not found');
  assertStationAccess(user, shift.stationId);

  // Ownership (Step 4): an attendant may only close their OWN shift.
  const isReviewer = REVIEWER_ROLES.includes(user.role);
  if (shift.userId !== user.uid && !isReviewer) {
    throw new Error('You can only close your own shift.');
  }
  if (!EDITABLE_BY_OWNER_STATUSES.includes(shift.status)) {
    throw new Error(`This shift is ${shift.status} and can no longer be edited.`);
  }

  // ---- Validate every closing reading BEFORE any write (Step 6) -----------
  const warnings = [];
  const updatedNozzles = [];
  for (const n of shift.nozzles) {
    const raw = closingReadings[n.nozzleId];
    const label = `Closing reading for nozzle ${n.nozzleNumber ?? n.nozzleId}`;
    const check = validateClosingReading(raw, n.openingReading, { label });
    if (!check.ok) throw new Error(check.error);   // "abc" -> error, never 0
    if (check.warning) warnings.push(check.warning);

    const liters = check.liters;

    // ---- Price snapshot (Step 9) ----------------------------------------
    // Use the price effective when the nozzle actually started dispensing:
    // its own addedAt for mid-shift additions, otherwise the shift start.
    // Previously every nozzle used shift.startTime, so a nozzle added after a
    // price change was billed at the stale price.
    const priceAt = n.addedAt || shift.startTime;
    const priceDoc = await getPriceForFuelAtTime(shift.stationId, n.fuelType, priceAt);
    if (!priceDoc) {
      throw new Error(`No ${n.fuelType} price is configured for the time this shift ran. Ask a manager to set the price, then close the shift.`);
    }
    const price = Number(priceDoc.price);
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`The ${n.fuelType} price on record is invalid (${priceDoc.price}). Ask a manager to correct it.`);
    }
    const revenue = calcRevenue(liters, price);

    updatedNozzles.push({
      ...n,
      closingReading: check.value,
      litersSold: liters,
      // Price provenance, so historical revenue stays explainable even after
      // the price changes again.
      price,
      priceId: priceDoc.id || null,
      priceEffectiveAt: priceDoc.effectiveFrom || priceAt,
      revenue,
    });
  }

  // ---- Validate declared payments (Step 6) --------------------------------
  const { parseMoneyInput } = await import('./money.js');
  const cleanPayments = {};
  for (const key of ['cash','card','upi','credit','other']) {
    const p = parseMoneyInput(payments?.[key], {
      label: `${key.toUpperCase()} amount`, required: false,
    });
    if (!p.ok) throw new Error(p.error);
    cleanPayments[key] = p.value ?? 0;
  }

  const totalsCalc = calcShiftTotals(updatedNozzles);
  const totalPayments = calcPaymentsTotal(cleanPayments);

  // Expenses are removed from gross: that fuel left the nozzle but no cash came
  // back, so the attendant is not accountable for it.
  let totalExpenses = 0;
  const txs = await queryDocs('transactions', null, [
    { field: 'stationId', op: '==', value: shift.stationId },
    { field: 'shiftId', op: '==', value: shift.id },
    { field: 'type', op: '==', value: 'expense' },
  ]);
  totalExpenses = sumMoney(txs.map(t => t.amount));

  const grossRevenue = roundMoney(totalsCalc.totalRevenue);
  const netRevenue = roundMoney(grossRevenue - totalExpenses);
  const { variance, status: varianceStatus } = calcVariance(netRevenue, totalPayments);

  const patch = {
    nozzles: updatedNozzles,

    // ---- Raw inputs, exactly as declared by the attendant (Step 5) --------
    // Kept separate from derived values so a reviewer can always see what was
    // entered versus what was computed from it.
    declared: {
      payments: cleanPayments,
      closingReadings: updatedNozzles.reduce((acc, n) => {
        acc[n.nozzleId] = n.closingReading; return acc;
      }, {}),
      declaredBy: user.uid,
      declaredAt: new Date().toISOString(),
    },

    // ---- Derived values -------------------------------------------------
    // These are recomputed here from raw inputs + server price history. They
    // are marked so a future server-side recompute can verify them, and the
    // Firestore rules stop an attendant editing them after approval.
    totals: {
      totalLiters: totalsCalc.totalLiters,
      totalRevenue: grossRevenue, // keep gross for history
      totalGross: grossRevenue,
      totalExpenses,
      totalNet: netRevenue,
      netRevenue,
      byFuel: totalsCalc.byFuel,
      payments: cleanPayments,
      totalPayments,
      variance,
      varianceStatus,
      computedAt: new Date().toISOString(),
      computedFrom: 'client', // see REPORT section 5: server recompute proposed
    },
    endTime: new Date().toISOString(),
    status: 'PENDING_REVIEW',
    submittedBy: user.uid,
    submittedAt: new Date().toISOString(),
    correctionRequests: shift.status === 'REJECTED' ? [] : (shift.correctionRequests||[]),
    resubmittedAt: shift.status === 'REJECTED' ? new Date().toISOString() : null,
  };

  await updateDocById('shifts', shiftId, patch);

  const { updateNozzle } = await import('./pumps.js');
  for (const n of updatedNozzles) {
    try { await updateNozzle(n.nozzleId, { lastReading: n.closingReading }); } catch {}
  }

  // The shift is no longer active: free its nozzles for the next attendant.
  for (const n of updatedNozzles) {
    await releaseNozzleLock(n.nozzleId, shiftId);
  }

  await logAudit({
    stationId: shift.stationId, action: 'SHIFT_SUBMITTED',
    entityType: 'shift', entityId: shiftId,
    metadata: { grossRevenue, totalExpenses, netRevenue, totalPayments, variance, varianceStatus },
  });

  return { ...shift, ...patch, warnings };
}

export async function approveShift(shiftId) {
  const user = currentUser();
  const shift = await getDocById('shifts', shiftId);
  if (!shift) throw new Error('Shift not found');

  // Step 4: previously ANY signed-in user could call this, so an attendant
  // could approve their own shift and set approvedBy to whoever they liked.
  assertReviewer(user);
  assertStationAccess(user, shift.stationId);
  if (shift.userId === user.uid && user.role !== 'super_admin') {
    throw new Error('You cannot approve your own shift. Ask another manager or the owner to review it.');
  }
  if (shift.status !== 'PENDING_REVIEW') {
    throw new Error(`Only a shift awaiting review can be approved (this one is ${shift.status}).`);
  }

  const res = await updateDocById('shifts', shiftId, {
    status: 'APPROVED',
    approvedBy: user.uid,
    approvedByName: user.name || null,
    approvedAt: new Date().toISOString(),
    correctionRequests: [],
  });

  await logAudit({
    stationId: shift.stationId, action: 'SHIFT_APPROVED',
    entityType: 'shift', entityId: shiftId,
    metadata: { shiftUserId: shift.userId, netRevenue: shift.totals?.netRevenue ?? null },
  });
  return res;
}

export async function rejectShift(shiftId, reason) {
  const user = currentUser();
  const shift = await getDocById('shifts', shiftId);
  if (!shift) throw new Error('Shift not found');

  assertReviewer(user);
  assertStationAccess(user, shift.stationId);
  if (shift.status !== 'PENDING_REVIEW') {
    throw new Error(`Only a shift awaiting review can be rejected (this one is ${shift.status}).`);
  }
  const text = String(reason || '').trim();
  if (!text) throw new Error('Please give a reason so the attendant knows what to fix.');

  const res = await updateDocById('shifts', shiftId, {
    status: 'REJECTED',
    rejectedBy: user.uid,
    rejectedByName: user.name || null,
    rejectedAt: new Date().toISOString(),
    rejectionReason: text,
  });

  await logAudit({
    stationId: shift.stationId, action: 'SHIFT_REJECTED',
    entityType: 'shift', entityId: shiftId,
    metadata: { shiftUserId: shift.userId, reason: text },
  });
  return res;
}

// Manager/owner can point at a particular field that needs fixing.
export async function requestCorrections(shiftId, corrections, generalReason='') {
  // corrections: [{type: 'nozzle'|'payment'|'credit'|'expense'|'note', targetId, field, message}]
  const user = currentUser();
  const shift = await getDocById('shifts', shiftId);
  if (!shift) throw new Error('Shift not found');

  assertReviewer(user);
  assertStationAccess(user, shift.stationId);
  if (shift.status !== 'PENDING_REVIEW') {
    throw new Error(`Corrections can only be requested on a shift awaiting review (this one is ${shift.status}).`);
  }
  if (!Array.isArray(corrections) || corrections.length === 0) {
    throw new Error('Select at least one item that needs correcting.');
  }

  const enriched = corrections.map(c => ({
    id: 'cr_' + Math.random().toString(36).slice(2,8),
    ...c,
    requestedBy: user.uid,
    requestedByName: user.name || 'Manager',
    requestedAt: new Date().toISOString(),
    status: 'PENDING',
  }));

  const patch = {
    status: 'REJECTED',
    rejectedBy: user.uid,
    rejectedAt: new Date().toISOString(),
    rejectionReason: generalReason || 'Correction requested',
    correctionRequests: [...(shift.correctionRequests||[]), ...enriched],
  };

  const res = await updateDocById('shifts', shiftId, patch);
  await logAudit({
    stationId: shift.stationId, action: 'SHIFT_CORRECTION_REQUESTED',
    entityType: 'shift', entityId: shiftId,
    metadata: { count: enriched.length, reason: patch.rejectionReason },
  });
  return res;
}

export async function resolveCorrection(shiftId, correctionId) {
  const user = currentUser();
  const shift = await getDocById('shifts', shiftId);
  if (!shift) throw new Error('Shift not found');
  assertStationAccess(user, shift.stationId);
  if (shift.userId !== user.uid && !REVIEWER_ROLES.includes(user.role)) {
    throw new Error('You can only resolve corrections on your own shift.');
  }
  const updated = (shift.correctionRequests||[]).map(cr => cr.id===correctionId ? {...cr, status:'RESOLVED', resolvedAt: new Date().toISOString(), resolvedBy: user.uid} : cr);
  return await updateDocById('shifts', shiftId, { correctionRequests: updated });
}

export async function getShiftById(id) { return await getDocById('shifts', id); }

export async function addNozzleToShift(shiftId, { nozzleId, pumpId, fuelType, openingReading }) {
  const user = currentUser();
  const shift = await getDocById('shifts', shiftId);
  if (!shift) throw new Error('Shift not found');
  assertStationAccess(user, shift.stationId);
  if (shift.userId !== user.uid && !REVIEWER_ROLES.includes(user.role)) {
    throw new Error('You can only change your own shift.');
  }
  if (shift.status !== 'ACTIVE') throw new Error('Only active shifts can add nozzles');

  if ((shift.nozzles||[]).some(n=>n.nozzleId===nozzleId)) {
    throw new Error('Nozzle already in your shift');
  }

  const r = parseReadingInput(openingReading, { label: 'Opening reading' });
  if (!r.ok) throw new Error(r.error);

  // Atomic claim (Step 10) — replaces the previous read-then-write check,
  // which two attendants could pass simultaneously.
  await acquireNozzleLock(nozzleId, {
    shiftId, stationId: shift.stationId, userId: shift.userId, employeeName: shift.employeeName,
  });

  const newNozzle = {
    nozzleId,
    pumpId,
    fuelType,
    openingReading: r.value,
    closingReading: null,
    litersSold: 0,
    price: 0,
    revenue: 0,
    // Recorded so closeShift prices this nozzle from when it actually started,
    // not from the shift start (Step 9).
    addedAt: new Date().toISOString(),
  };

  try {
    const updatedNozzles = [...(shift.nozzles||[]), newNozzle];
    const res = await updateDocById('shifts', shiftId, { nozzles: updatedNozzles });
    await logAudit({
      stationId: shift.stationId, action: 'SHIFT_NOZZLE_ADDED',
      entityType: 'shift', entityId: shiftId,
      metadata: { nozzleId, openingReading: r.value },
    });
    return res;
  } catch (e) {
    await releaseNozzleLock(nozzleId, shiftId); // don't strand the lock
    throw e;
  }
}

export async function removeNozzleFromShift(shiftId, nozzleId) {
  const user = currentUser();
  const shift = await getDocById('shifts', shiftId);
  if (!shift) throw new Error('Shift not found');
  assertStationAccess(user, shift.stationId);
  if (shift.userId !== user.uid && !REVIEWER_ROLES.includes(user.role)) {
    throw new Error('You can only change your own shift.');
  }
  if (shift.status !== 'ACTIVE') throw new Error('Only active shifts can remove nozzles');
  if ((shift.nozzles||[]).length <= 1) throw new Error('Cannot remove last nozzle - at least one required');

  const updatedNozzles = (shift.nozzles||[]).filter(n=>n.nozzleId!==nozzleId);
  const res = await updateDocById('shifts', shiftId, { nozzles: updatedNozzles });
  await releaseNozzleLock(nozzleId, shiftId);
  await logAudit({
    stationId: shift.stationId, action: 'SHIFT_NOZZLE_REMOVED',
    entityType: 'shift', entityId: shiftId, metadata: { nozzleId },
  });
  return res;
}
