import { queryDocs } from './firestoreService.js';

export async function getDailyReport(stationId, dateStr) {
  // dateStr YYYY-MM-DD
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

export async function getAuditLogs(stationId, limit=50) {
  const logs = await queryDocs('auditLogs', l => !stationId || l.stationId === stationId);
  return logs.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, limit);
}
