import { queryDocs } from './firestoreService.js';
import { computeShiftFinancials, getExpensesByShift } from './settlement.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Local (not UTC) YYYY-MM-DD — so a shift at 11pm IST stays on the right day.
export function toDateKey(d) {
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date)) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export async function getDailyReport(stationId, dateStr) {
  return getReportForRange(stationId, dateStr, dateStr);
}

/**
 * One report object used by the whole Reports page.
 * opts: { employeeId, status, fuelType, settlement } — all optional.
 *   settlement: 'ALL' | 'PENDING' | 'SETTLED'
 */
export async function getReportForRange(stationId, fromDateStr, toDateStr, opts = {}) {
  const { userId, status, employeeId, fuelType, settlement } = opts;

  let shifts = await queryDocs('shifts', s => s.stationId === stationId);
  const expenseByShift = await getExpensesByShift(stationId);

  // ---- Filters -------------------------------------------------------
  shifts = shifts.filter(s => {
    const key = toDateKey(s.startTime);
    return key >= fromDateStr && key <= toDateStr;
  });
  if (userId) shifts = shifts.filter(s => s.userId === userId);
  if (employeeId && employeeId !== 'all') shifts = shifts.filter(s => s.userId === employeeId);
  if (status && status !== 'ALL') shifts = shifts.filter(s => s.status === status);
  if (fuelType && fuelType !== 'ALL') {
    shifts = shifts.filter(s => Object.keys(s.totals?.byFuel || {}).includes(fuelType));
  }

  // Attach financials (net of expenses) to every shift so views never recompute.
  shifts = shifts.map(s => ({ ...s, fin: computeShiftFinancials(s, expenseByShift[s.id] || 0) }));

  if (settlement && settlement !== 'ALL') {
    shifts = shifts.filter(s => {
      if (s.status !== 'APPROVED') return settlement === 'PENDING' ? false : false;
      return settlement === 'SETTLED' ? s.fin.isSettled : !s.fin.isSettled;
    });
  }

  shifts.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

  // ---- Aggregates ----------------------------------------------------
  let totalLiters = 0, grossRevenue = 0, totalExpenses = 0, totalPayments = 0;
  let toCollect = 0, toReturn = 0, collected = 0, returned = 0;
  let pendingCollect = 0, pendingReturn = 0;
  const byFuel = {};
  const byEmployee = {};
  const byDate = {};
  const paymentsAgg = { cash: 0, card: 0, upi: 0, credit: 0, other: 0 };

  shifts.forEach(sh => {
    const t = sh.totals || {};
    const f = sh.fin;

    totalLiters += t.totalLiters || 0;
    grossRevenue += f.gross;
    totalExpenses += f.expenses;
    totalPayments += f.payments;

    toCollect += f.toCollect;
    toReturn += f.toReturn;
    collected += f.collected;
    returned += f.returned;
    // Only APPROVED shifts are actually collectable money.
    if (sh.status === 'APPROVED') {
      pendingCollect += f.pendingCollect;
      pendingReturn += f.pendingReturn;
    }

    if (t.byFuel) {
      Object.entries(t.byFuel).forEach(([ft, vals]) => {
        if (fuelType && fuelType !== 'ALL' && ft !== fuelType) return;
        if (!byFuel[ft]) byFuel[ft] = { liters: 0, revenue: 0, shifts: 0 };
        byFuel[ft].liters += vals.liters || 0;
        byFuel[ft].revenue += vals.revenue || 0;
        byFuel[ft].shifts += 1;
      });
    }
    if (t.payments) {
      Object.keys(paymentsAgg).forEach(k => { paymentsAgg[k] += Number(t.payments[k] || 0); });
    }

    const empKey = sh.userId;
    if (!byEmployee[empKey]) {
      byEmployee[empKey] = {
        employeeName: sh.employeeName || 'Unknown', userId: sh.userId,
        shifts: 0, liters: 0, gross: 0, expenses: 0, net: 0, payments: 0,
        toCollect: 0, toReturn: 0, collected: 0, pendingCollect: 0, pendingReturn: 0,
      };
    }
    const e = byEmployee[empKey];
    e.shifts += 1;
    e.liters += t.totalLiters || 0;
    e.gross += f.gross;
    e.expenses += f.expenses;
    e.net += f.net;
    e.payments += f.payments;
    e.toCollect += f.toCollect;
    e.toReturn += f.toReturn;
    e.collected += f.collected;
    if (sh.status === 'APPROVED') {
      e.pendingCollect += f.pendingCollect;
      e.pendingReturn += f.pendingReturn;
    }

    const dateKey = toDateKey(sh.startTime);
    if (!byDate[dateKey]) byDate[dateKey] = { date: dateKey, shifts: 0, liters: 0, revenue: 0, pendingCollect: 0 };
    byDate[dateKey].shifts += 1;
    byDate[dateKey].liters += t.totalLiters || 0;
    byDate[dateKey].revenue += f.net;
    if (sh.status === 'APPROVED') byDate[dateKey].pendingCollect += f.pendingCollect;
  });

  Object.values(byEmployee).forEach(e => {
    ['liters','gross','expenses','net','payments','toCollect','toReturn','collected','pendingCollect','pendingReturn']
      .forEach(k => { e[k] = round2(e[k]); });
  });
  Object.values(byFuel).forEach(v => { v.liters = round2(v.liters); v.revenue = round2(v.revenue); });
  Object.values(byDate).forEach(v => { v.liters = round2(v.liters); v.revenue = round2(v.revenue); v.pendingCollect = round2(v.pendingCollect); });
  Object.keys(paymentsAgg).forEach(k => { paymentsAgg[k] = round2(paymentsAgg[k]); });

  // Settlements (money actually moved) inside the range
  let settlements = [];
  try {
    const allSet = await queryDocs('settlements', s => s.stationId === stationId);
    settlements = allSet.filter(s => {
      const key = toDateKey(s.createdAt);
      return key >= fromDateStr && key <= toDateStr;
    });
    if (employeeId && employeeId !== 'all') settlements = settlements.filter(s => s.staffUserId === employeeId);
    settlements.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch { settlements = []; }

  const netRevenue = round2(grossRevenue - totalExpenses);

  const statusCounts = shifts.reduce((acc, s) => {
    acc[s.status] = (acc[s.status] || 0) + 1;
    return acc;
  }, {});

  return {
    fromDate: fromDateStr,
    toDate: toDateStr,
    shifts,
    count: shifts.length,
    statusCounts,

    totalLiters: round2(totalLiters),
    grossRevenue: round2(grossRevenue),
    totalExpenses: round2(totalExpenses),
    netRevenue,
    // kept for older callers / CSV
    totalRevenue: netRevenue,
    totalPayments: round2(totalPayments),
    variance: round2(totalPayments - netRevenue),

    toCollect: round2(toCollect),
    toReturn: round2(toReturn),
    collected: round2(collected),
    returned: round2(returned),
    pendingCollect: round2(pendingCollect),
    pendingReturn: round2(pendingReturn),

    byFuel,
    byEmployee,
    byDate,
    paymentsAgg,
    settlements,
    settledInRange: round2(settlements.filter(s => s.type === 'collect').reduce((a, s) => a + Number(s.amount || 0), 0)),
  };
}

export async function getAuditLogs() {
  return [];
}
