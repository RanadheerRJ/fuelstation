import { listDocs, addDocTo, updateDocById, getDocById, queryDocs } from './firestoreService.js';
import { getState } from '../state.js';
import { calcLitersSold, calcRevenue, calcShiftTotals, calcPaymentsTotal, calcVariance } from './calc.js';
import { getPriceForFuelAtTime } from './prices.js';

export async function getShifts(stationId, opts={}) {
  let shifts = await queryDocs('shifts', s => s.stationId === stationId);
  if (opts.userId) shifts = shifts.filter(s => s.userId === opts.userId);
  if (opts.status) shifts = shifts.filter(s => s.status === opts.status);
  return shifts.sort((a,b) => new Date(b.startTime) - new Date(a.startTime));
}

export async function getActiveShiftForUser(userId) {
  const all = await queryDocs('shifts', s => s.userId === userId && s.status === 'ACTIVE');
  return all[0] || null;
}

export async function startShift({ stationId, userId, employeeName, nozzles }) {
  const activeShifts = await queryDocs('shifts', s => s.stationId === stationId && s.status === 'ACTIVE');
  for (const sh of activeShifts) {
    for (const n of sh.nozzles || []) {
      if (nozzles.some(nn => nn.nozzleId === n.nozzleId)) {
        throw new Error(`Nozzle already has an active shift`);
      }
    }
  }
  const payload = {
    stationId,
    userId,
    employeeName,
    startTime: new Date().toISOString(),
    status: 'ACTIVE',
    nozzles: nozzles.map(n => ({
      nozzleId: n.nozzleId,
      pumpId: n.pumpId,
      fuelType: n.fuelType,
      openingReading: Number(n.openingReading),
      closingReading: null,
      litersSold: 0,
      price: 0,
      revenue: 0,
    })),
    totals: { totalLiters:0, totalRevenue:0, payments:{cash:0,card:0,upi:0,credit:0,other:0}, totalPayments:0, variance:0, varianceStatus:'BALANCED' },
    correctionRequests: [],
  };
  const doc = await addDocTo('shifts', payload);
  return doc;
}

export async function closeShift(shiftId, { closingReadings, payments }) {
  const shift = await getDocById('shifts', shiftId);
  if (!shift) throw new Error('Shift not found');
  if (shift.status !== 'ACTIVE' && shift.status !== 'REJECTED') throw new Error('Shift not active or rejected');

  const updatedNozzles = [];
  for (const n of shift.nozzles) {
    const closing = closingReadings[n.nozzleId];
    if (closing === undefined || closing === null || closing === '') throw new Error(`Missing closing reading for nozzle ${n.nozzleId}`);
    const liters = calcLitersSold(n.openingReading, closing);
    const priceDoc = await getPriceForFuelAtTime(shift.stationId, n.fuelType, shift.startTime);
    const price = priceDoc ? priceDoc.price : 0;
    const revenue = calcRevenue(liters, price);
    updatedNozzles.push({
      ...n,
      closingReading: Number(closing),
      litersSold: liters,
      price,
      revenue,
      priceId: priceDoc?.id || null,
    });
  }

  const totalsCalc = calcShiftTotals(updatedNozzles);
  const totalPayments = calcPaymentsTotal(payments);
  const { variance, status: varianceStatus } = calcVariance(totalsCalc.totalRevenue, totalPayments);

  const patch = {
    nozzles: updatedNozzles,
    totals: {
      totalLiters: totalsCalc.totalLiters,
      totalRevenue: totalsCalc.totalRevenue,
      byFuel: totalsCalc.byFuel,
      payments,
      totalPayments,
      variance,
      varianceStatus,
    },
    endTime: new Date().toISOString(),
    status: 'PENDING_REVIEW',
    // Clear previous correction requests if resubmitting, or keep history
    correctionRequests: shift.status === 'REJECTED' ? [] : (shift.correctionRequests||[]),
    resubmittedAt: shift.status === 'REJECTED' ? new Date().toISOString() : null,
  };

  const updated = await updateDocById('shifts', shiftId, patch);

  const { updateNozzle } = await import('./pumps.js');
  for (const n of updatedNozzles) {
    try { await updateNozzle(n.nozzleId, { lastReading: n.closingReading }); } catch {}
  }

  return { ...shift, ...patch };
}

export async function approveShift(shiftId) {
  const { user } = getState();
  const shift = await getDocById('shifts', shiftId);
  if (!shift) throw new Error('Shift not found');
  const res = await updateDocById('shifts', shiftId, { status: 'APPROVED', approvedBy: user?.uid, approvedAt: new Date().toISOString(), correctionRequests: [] });
  return res;
}

export async function rejectShift(shiftId, reason) {
  const { user } = getState();
  const shift = await getDocById('shifts', shiftId);
  if (!shift) throw new Error('Shift not found');
  const res = await updateDocById('shifts', shiftId, { status: 'REJECTED', rejectedBy: user?.uid, rejectedAt: new Date().toISOString(), rejectionReason: reason });
  return res;
}

// NEW: Request specific corrections - manager/owner can point at particular field
export async function requestCorrections(shiftId, corrections, generalReason='') {
  // corrections: [{type: 'nozzle'|'payment'|'credit'|'expense'|'note', targetId, field, message}]
  const { user } = getState();
  const shift = await getDocById('shifts', shiftId);
  if (!shift) throw new Error('Shift not found');
  
  const enriched = corrections.map(c => ({
    id: 'cr_' + Math.random().toString(36).slice(2,8),
    ...c,
    requestedBy: user?.uid,
    requestedByName: user?.name || 'Manager',
    requestedAt: new Date().toISOString(),
    status: 'PENDING',
  }));

  const patch = {
    status: 'REJECTED',
    rejectedBy: user?.uid,
    rejectedAt: new Date().toISOString(),
    rejectionReason: generalReason || 'Correction requested',
    correctionRequests: [...(shift.correctionRequests||[]), ...enriched],
  };

  const res = await updateDocById('shifts', shiftId, patch);
  return res;
}

export async function resolveCorrection(shiftId, correctionId) {
  const shift = await getDocById('shifts', shiftId);
  if (!shift) throw new Error('Shift not found');
  const updated = (shift.correctionRequests||[]).map(cr => cr.id===correctionId ? {...cr, status:'RESOLVED', resolvedAt: new Date().toISOString()} : cr);
  return await updateDocById('shifts', shiftId, { correctionRequests: updated });
}

export async function getShiftById(id) { return await getDocById('shifts', id); }
