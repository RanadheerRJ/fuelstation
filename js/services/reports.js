import { queryDocs } from './firestoreService.js';

export async function getDailyReport(stationId, dateStr) {
  const shifts = await queryDocs('shifts', null, [{ field: 'stationId', op: '==', value: stationId }]);
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
  const { userId, status, employeeId } = opts;
  let shifts = await queryDocs('shifts', null, [{ field: 'stationId', op: '==', value: stationId }]);
  
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

  // Fetch all transactions for this station in range to compute expenses per shift
  // Expenses must be subtracted from gross because fuel came out of nozzle (testing etc)
  let allTx = [];
  try {
    allTx = await queryDocs('transactions', null, [{ field: 'stationId', op: '==', value: stationId }]);
  } catch { allTx = []; }

  // Map shiftId -> total expenses
  const expenseByShift = {};
  const creditsByShift = {};
  allTx.forEach(tx => {
    if (!tx.shiftId) return;
    const d = new Date(tx.createdAt);
    if (d < from || d > to) return; // only in range
    if (tx.type === 'expense') {
      expenseByShift[tx.shiftId] = (expenseByShift[tx.shiftId]||0) + Number(tx.amount||0);
    }
    if (tx.type === 'credit') {
      creditsByShift[tx.shiftId] = (creditsByShift[tx.shiftId]||0) + Number(tx.amount||0);
    }
  });

  let totalLiters = 0, totalGross = 0, totalExpenses = 0, totalNet = 0, totalPayments = 0, variance = 0;
  let toCollect = 0, toReturn = 0, collected = 0, returned = 0;
  const byFuel = {};
  const byEmployee = {};
  const byDate = {};
  const paymentsAgg = { cash:0, card:0, upi:0, credit:0, other:0 };
  let totalCredits = 0;

  shifts.forEach(sh => {
    const t = sh.totals || {};
    const gross = Number(t.totalRevenue||0);
    const liters = Number(t.totalLiters||0);
    const exp = Number(expenseByShift[sh.id]||0);
    const net = Math.round((gross - exp)*100)/100; // Net = Gross - Expenses = whole amount to owner

    totalLiters += liters;
    totalGross += gross;
    totalExpenses += exp;
    totalNet += net;
    totalCredits += Number(creditsByShift[sh.id]||0);

    const payments = Number(t.totalPayments||0);
    totalPayments += payments;

    // Variance now based on NET, not gross: Payments - Net = what is still to handover
    const netVariance = Math.round((payments - net)*100)/100;
    variance += netVariance;

    if (netVariance < -0.5) toCollect += Math.abs(netVariance);
    if (netVariance > 0.5) toReturn += netVariance;

    if (sh.settlement) {
      collected += sh.settlement.collectedAmount || 0;
      returned += sh.settlement.returnedAmount || 0;
    }

    if (t.byFuel) {
      Object.entries(t.byFuel).forEach(([ft, vals]) => {
        if (!byFuel[ft]) byFuel[ft] = { liters:0, gross:0, net:0, revenue:0, shifts:0 };
        byFuel[ft].liters += vals.liters || 0;
        byFuel[ft].gross += vals.revenue || 0;
        byFuel[ft].revenue += vals.revenue || 0;
        byFuel[ft].shifts += 1;
      });
    }
    // Adjust net per fuel proportionally? For now net = gross - expenses overall, not per fuel
    if (t.payments) {
      Object.keys(paymentsAgg).forEach(k => paymentsAgg[k] += Number(t.payments[k]||0));
    }

    const empKey = sh.userId;
    if (!byEmployee[empKey]) byEmployee[empKey] = { employeeName: sh.employeeName, userId: sh.userId, shifts:0, liters:0, gross:0, expenses:0, net:0, revenue:0, variance:0, toCollect:0, toReturn:0 };
    byEmployee[empKey].shifts += 1;
    byEmployee[empKey].liters += liters;
    byEmployee[empKey].gross += gross;
    byEmployee[empKey].expenses += exp;
    byEmployee[empKey].net += net;
    byEmployee[empKey].revenue += net; // revenue = net for reporting
    byEmployee[empKey].variance += netVariance;
    if (netVariance < -0.5) byEmployee[empKey].toCollect += Math.abs(netVariance);
    if (netVariance > 0.5) byEmployee[empKey].toReturn += netVariance;

    const dateKey = new Date(sh.startTime).toISOString().slice(0,10);
    if (!byDate[dateKey]) byDate[dateKey] = { date: dateKey, shifts:0, liters:0, gross:0, expenses:0, net:0, revenue:0 };
    byDate[dateKey].shifts += 1;
    byDate[dateKey].liters += liters;
    byDate[dateKey].gross += gross;
    byDate[dateKey].expenses += exp;
    byDate[dateKey].net += net;
    byDate[dateKey].revenue += net;
  });

  // Adjust byFuel net proportionally based on total expenses share
  if (totalGross > 0 && totalExpenses > 0) {
    Object.keys(byFuel).forEach(ft => {
      const share = byFuel[ft].gross / totalGross;
      const fuelExp = Math.round(totalExpenses * share * 100)/100;
      byFuel[ft].net = Math.round((byFuel[ft].gross - fuelExp)*100)/100;
    });
  } else {
    Object.keys(byFuel).forEach(ft => { byFuel[ft].net = byFuel[ft].gross; });
  }

  let settlements = [];
  try {
    const allSet = await queryDocs('settlements', null, [{ field: 'stationId', op: '==', value: stationId }]);
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
    totalGross,
    totalExpenses,
    totalNet,
    totalRevenue: totalNet, // keep backward compat - now net is whole amount to owner
    totalPayments,
    totalCredits,
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
    expenseByShift,
  };
}

export async function getAuditLogs() {
  return [];
}
