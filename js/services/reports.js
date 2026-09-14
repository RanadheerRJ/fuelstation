import { queryDocs } from './firestoreService.js';

export async function getDailyReport(stationId, dateStr) {
  const shifts = await queryDocs('shifts', s => s.stationId === stationId);
  const dayShifts = shifts.filter(s => {
    const d = new Date(s.startTime).toISOString().slice(0,10);
    return d === dateStr;
  });
  let totalLiters = 0, totalRevenue = 0, totalPayments = 0, variance = 0;
  const byFuel = {};
  const paymentsAgg = { cash:0, card:0, upi:0, credit:0, other:0 };
  dayShifts.forEach(sh => {
    const t = sh.totals || {};
    totalLiters += t.totalLiters || 0;
    totalRevenue += t.totalRevenue || 0;
    totalPayments += t.totalPayments || 0;
    variance += t.variance || 0;
    if (t.byFuel) {
      Object.entries(t.byFuel).forEach(([ft, vals]) => {
        if (!byFuel[ft]) byFuel[ft] = { liters:0, revenue:0 };
        byFuel[ft].liters += vals.liters || 0;
        byFuel[ft].revenue += vals.revenue || 0;
      });
    }
    if (t.payments) {
      Object.keys(paymentsAgg).forEach(k => paymentsAgg[k] += Number(t.payments[k]||0));
    }
  });
  return { date: dateStr, shifts: dayShifts, totalLiters, totalRevenue, totalPayments, variance, byFuel, paymentsAgg };
}

export async function getReportForRange(stationId, fromDateStr, toDateStr, opts={}) {
  // fromDateStr, toDateStr YYYY-MM-DD inclusive
  const { userId, status, employeeId } = opts;
  let shifts = await queryDocs('shifts', s => s.stationId === stationId);
  
  // Date range filter
  const from = new Date(fromDateStr + 'T00:00:00');
  const to = new Date(toDateStr + 'T23:59:59');
  shifts = shifts.filter(s => {
    const d = new Date(s.startTime);
    return d >= from && d <= to;
  });

  if (userId) shifts = shifts.filter(s => s.userId === userId);
  if (employeeId && employeeId !== 'all') shifts = shifts.filter(s => s.userId === employeeId);
  if (status && status !== 'ALL') shifts = shifts.filter(s => s.status === status);

  shifts.sort((a,b)=> new Date(b.startTime) - new Date(a.startTime));

  let totalLiters = 0, totalRevenue = 0, totalPayments = 0, variance = 0;
  let toCollect = 0, toReturn = 0, collected = 0, returned = 0;
  const byFuel = {};
  const byEmployee = {};
  const byDate = {};
  const paymentsAgg = { cash:0, card:0, upi:0, credit:0, other:0 };

  shifts.forEach(sh => {
    const t = sh.totals || {};
    totalLiters += t.totalLiters || 0;
    totalRevenue += t.totalRevenue || 0;
    totalPayments += t.totalPayments || 0;
    variance += t.variance || 0;
    const v = t.variance || 0;
    if (v < -0.5) toCollect += Math.abs(v);
    if (v > 0.5) toReturn += v;
    if (sh.settlement) {
      collected += sh.settlement.collectedAmount || 0;
      returned += sh.settlement.returnedAmount || 0;
    }

    if (t.byFuel) {
      Object.entries(t.byFuel).forEach(([ft, vals]) => {
        if (!byFuel[ft]) byFuel[ft] = { liters:0, revenue:0, shifts:0 };
        byFuel[ft].liters += vals.liters || 0;
        byFuel[ft].revenue += vals.revenue || 0;
        byFuel[ft].shifts += 1;
      });
    }
    if (t.payments) {
      Object.keys(paymentsAgg).forEach(k => paymentsAgg[k] += Number(t.payments[k]||0));
    }

    const empKey = sh.userId;
    if (!byEmployee[empKey]) byEmployee[empKey] = { employeeName: sh.employeeName, userId: sh.userId, shifts:0, liters:0, revenue:0, variance:0, toCollect:0, toReturn:0 };
    byEmployee[empKey].shifts += 1;
    byEmployee[empKey].liters += t.totalLiters || 0;
    byEmployee[empKey].revenue += t.totalRevenue || 0;
    byEmployee[empKey].variance += t.variance || 0;
    if (v < -0.5) byEmployee[empKey].toCollect += Math.abs(v);
    if (v > 0.5) byEmployee[empKey].toReturn += v;

    const dateKey = new Date(sh.startTime).toISOString().slice(0,10);
    if (!byDate[dateKey]) byDate[dateKey] = { date: dateKey, shifts:0, liters:0, revenue:0 };
    byDate[dateKey].shifts += 1;
    byDate[dateKey].liters += t.totalLiters || 0;
    byDate[dateKey].revenue += t.totalRevenue || 0;
  });

  // Get settlements for range
  let settlements = [];
  try {
    const allSet = await queryDocs('settlements', s => s.stationId === stationId);
    settlements = allSet.filter(s => {
      const d = new Date(s.createdAt);
      return d >= from && d <= to;
    });
    if (employeeId && employeeId !== 'all') settlements = settlements.filter(s => s.staffUserId === employeeId);
  } catch {}

  return {
    fromDate: fromDateStr,
    toDate: toDateStr,
    shifts,
    totalLiters,
    totalRevenue,
    totalPayments,
    variance,
    toCollect,
    toReturn,
    collected,
    returned,
    pendingCollect: Math.max(0, toCollect - collected),
    pendingReturn: Math.max(0, toReturn - returned),
    byFuel,
    byEmployee,
    byDate,
    paymentsAgg,
    settlements,
    count: shifts.length,
  };
}

export async function getAuditLogs() {
  return [];
}
