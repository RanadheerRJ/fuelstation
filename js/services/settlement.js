// Single source of truth for shift money math.
// Every page (Reports, Collections, Dashboard, Shift receipt) MUST use this
// so the same shift never shows two different "To Collect" numbers.
//
// Gross Revenue   = fuel dispensed from nozzles (includes testing fuel)
// Expenses        = testing / breakfast / petty cash logged against the shift
// Net Revenue     = Gross - Expenses  (the whole amount owed to the owner)
// Variance        = Payments - Net    (negative = staff is short = To Collect)
import { queryDocs } from './firestoreService.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Map of shiftId -> total expense amount for a station (one read, reused everywhere)
export async function getExpensesByShift(stationId) {
  const map = {};
  try {
    const txns = await queryDocs('transactions', t => t.stationId === stationId && t.type === 'expense');
    txns.forEach(t => {
      if (!t.shiftId) return;
      map[t.shiftId] = round2((map[t.shiftId] || 0) + Number(t.amount || 0));
    });
  } catch { /* expenses are optional */ }
  return map;
}

// All the money figures for one shift. expenseTotal is optional (falls back to
// totals.expenses stored at close time, then 0 for legacy shifts).
export function computeShiftFinancials(shift, expenseTotal) {
  const t = shift?.totals || {};
  const gross = round2(t.totalRevenue);
  const expenses = round2(expenseTotal !== undefined && expenseTotal !== null ? expenseTotal : (t.expenses || 0));
  const net = round2(Math.max(0, gross - expenses));
  const payments = round2(t.totalPayments);
  const variance = round2(payments - net);

  const toCollect = variance < -0.5 ? Math.abs(variance) : 0;
  const toReturn = variance > 0.5 ? variance : 0;

  const collected = round2(shift?.settlement?.collectedAmount);
  const returned = round2(shift?.settlement?.returnedAmount);

  const pendingCollect = round2(Math.max(0, toCollect - collected));
  const pendingReturn = round2(Math.max(0, toReturn - returned));

  return {
    gross,
    expenses,
    net,
    payments,
    variance,
    status: toCollect > 0 ? 'SHORT' : toReturn > 0 ? 'EXCESS' : 'BALANCED',
    toCollect,
    toReturn,
    collected,
    returned,
    pendingCollect,
    pendingReturn,
    isSettled: pendingCollect <= 0.5 && pendingReturn <= 0.5,
  };
}

// Convenience: financials for a single shift, fetching its expenses.
export async function getShiftFinancials(shift) {
  if (!shift) return null;
  const map = await getExpensesByShift(shift.stationId);
  return computeShiftFinancials(shift, map[shift.id] || 0);
}
