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
 * Work log + totals for a date range.
 * opts: { employeeId, fuelType, pumpId } — all optional.
 *
 * Every shift comes back with `work`: who worked which pump, on which date,
 * with the fuel and liters for each nozzle they ran.
 */
export async function getReportForRange(stationId, fromDateStr, toDateStr, opts = {}) {
  const { userId, employeeId, fuelType, pumpId, status } = opts;

  let shifts = await queryDocs('shifts', s => s.stationId === stationId);
  const expenseByShift = await getExpensesByShift(stationId);

  // Pump names for readable labels
  const pumpNames = {};
  try {
    const pumps = await queryDocs('pumps', p => p.stationId === stationId);
    pumps.forEach(p => { pumpNames[p.id] = p.name || (p.number ? `Pump ${p.number}` : 'Pump'); });
  } catch { /* pumps optional */ }
  const pumpLabel = (id) => pumpNames[id] || (id ? `Pump ${String(id).slice(0, 4)}` : 'Unassigned');

  // ---- Filters -------------------------------------------------------
  shifts = shifts.filter(s => {
    const key = toDateKey(s.startTime);
    return key >= fromDateStr && key <= toDateStr;
  });
  if (userId) shifts = shifts.filter(s => s.userId === userId);
  if (employeeId && employeeId !== 'all') shifts = shifts.filter(s => s.userId === employeeId);
  if (status && status !== 'ALL') shifts = shifts.filter(s => s.status === status);
  if (fuelType && fuelType !== 'ALL') {
    shifts = shifts.filter(s => (s.nozzles || []).some(n => n.fuelType === fuelType));
  }
  if (pumpId && pumpId !== 'ALL') {
    shifts = shifts.filter(s => (s.nozzles || []).some(n => n.pumpId === pumpId));
  }

  // ---- Build the work log -------------------------------------------
  shifts = shifts.map(s => {
    const fin = computeShiftFinancials(s, expenseByShift[s.id] || 0);

    // Only the nozzles that match the active fuel / pump filter
    const nozzles = (s.nozzles || []).filter(n =>
      (!fuelType || fuelType === 'ALL' || n.fuelType === fuelType) &&
      (!pumpId || pumpId === 'ALL' || n.pumpId === pumpId)
    );

    // Group those nozzles by pump
    const pumpMap = {};
    nozzles.forEach(n => {
      const pid = n.pumpId || 'unassigned';
      if (!pumpMap[pid]) pumpMap[pid] = { pumpId: pid, pumpName: pumpLabel(n.pumpId), fuels: {}, liters: 0, revenue: 0 };
      const p = pumpMap[pid];
      p.liters += n.litersSold || 0;
      p.revenue += n.revenue || 0;
      if (!p.fuels[n.fuelType]) p.fuels[n.fuelType] = { liters: 0, revenue: 0 };
      p.fuels[n.fuelType].liters += n.litersSold || 0;
      p.fuels[n.fuelType].revenue += n.revenue || 0;
    });
    const pumps = Object.values(pumpMap).map(p => ({
      ...p,
      liters: round2(p.liters),
      revenue: round2(p.revenue),
      fuelNames: Object.keys(p.fuels),
    })).sort((a, b) => a.pumpName.localeCompare(b.pumpName, undefined, { numeric: true }));

    return {
      ...s,
      fin,
      work: {
        date: toDateKey(s.startTime),
        employeeName: s.employeeName || 'Unknown',
        userId: s.userId,
        pumps,
        pumpNames: pumps.map(p => p.pumpName),
        fuelNames: [...new Set(nozzles.map(n => n.fuelType).filter(Boolean))],
        liters: round2(pumps.reduce((a, p) => a + p.liters, 0)),
        revenue: round2(pumps.reduce((a, p) => a + p.revenue, 0)),
      },
    };
  });

  shifts.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

  // ---- Aggregates ----------------------------------------------------
  let totalLiters = 0, grossRevenue = 0, totalExpenses = 0, totalPayments = 0;
  let pendingCollect = 0, collected = 0;
  const byFuel = {};
  const byEmployee = {};
  const byPump = {};
  const byDate = {};

  shifts.forEach(sh => {
    const f = sh.fin;
    const w = sh.work;

    totalLiters += w.liters;
    grossRevenue += f.gross;
    totalExpenses += f.expenses;
    totalPayments += f.payments;
    collected += f.collected;
    if (sh.status === 'APPROVED') pendingCollect += f.pendingCollect;

    // by fuel (from the filtered nozzles, so the fuel filter is honest)
    w.pumps.forEach(p => {
      Object.entries(p.fuels).forEach(([ft, v]) => {
        if (!byFuel[ft]) byFuel[ft] = { fuelType: ft, liters: 0, revenue: 0, shifts: 0 };
        byFuel[ft].liters += v.liters;
        byFuel[ft].revenue += v.revenue;
      });
      if (!byPump[p.pumpId]) byPump[p.pumpId] = { pumpId: p.pumpId, pumpName: p.pumpName, liters: 0, revenue: 0, shifts: 0, staff: new Set(), fuels: new Set() };
      const bp = byPump[p.pumpId];
      bp.liters += p.liters;
      bp.revenue += p.revenue;
      bp.shifts += 1;
      bp.staff.add(w.employeeName);
      p.fuelNames.forEach(ft => bp.fuels.add(ft));
    });
    new Set(w.fuelNames).forEach(ft => { if (byFuel[ft]) byFuel[ft].shifts += 1; });

    const empKey = sh.userId;
    if (!byEmployee[empKey]) {
      byEmployee[empKey] = {
        employeeName: w.employeeName, userId: sh.userId,
        shifts: 0, liters: 0, revenue: 0, days: new Set(), pumps: new Set(), fuels: new Set(),
      };
    }
    const e = byEmployee[empKey];
    e.shifts += 1;
    e.liters += w.liters;
    e.revenue += w.revenue;
    e.days.add(w.date);
    w.pumpNames.forEach(p => e.pumps.add(p));
    w.fuelNames.forEach(ft => e.fuels.add(ft));

    if (!byDate[w.date]) byDate[w.date] = { date: w.date, shifts: 0, liters: 0, revenue: 0, staff: new Set() };
    byDate[w.date].shifts += 1;
    byDate[w.date].liters += w.liters;
    byDate[w.date].revenue += w.revenue;
    byDate[w.date].staff.add(w.employeeName);
  });

  // Sets -> arrays/counts so views stay dumb
  const employeeList = Object.values(byEmployee).map(e => ({
    ...e,
    liters: round2(e.liters),
    revenue: round2(e.revenue),
    days: e.days.size,
    pumps: [...e.pumps],
    fuels: [...e.fuels],
  })).sort((a, b) => b.liters - a.liters);

  const pumpList = Object.values(byPump).map(p => ({
    ...p,
    liters: round2(p.liters),
    revenue: round2(p.revenue),
    staff: [...p.staff],
    fuels: [...p.fuels],
  })).sort((a, b) => a.pumpName.localeCompare(b.pumpName, undefined, { numeric: true }));

  const fuelList = Object.values(byFuel).map(v => ({
    ...v, liters: round2(v.liters), revenue: round2(v.revenue),
  })).sort((a, b) => b.liters - a.liters);

  const dayList = Object.values(byDate).map(d => ({
    ...d, liters: round2(d.liters), revenue: round2(d.revenue), staff: [...d.staff],
  })).sort((a, b) => b.date.localeCompare(a.date));

  const netRevenue = round2(grossRevenue - totalExpenses);

  return {
    fromDate: fromDateStr,
    toDate: toDateStr,
    shifts,
    count: shifts.length,

    totalLiters: round2(totalLiters),
    grossRevenue: round2(grossRevenue),
    totalExpenses: round2(totalExpenses),
    netRevenue,
    totalRevenue: netRevenue, // legacy callers
    totalPayments: round2(totalPayments),
    pendingCollect: round2(pendingCollect),
    collected: round2(collected),

    byEmployee: employeeList,
    byPump: pumpList,
    byFuel: fuelList,
    byDate: dayList,
  };
}

export async function getAuditLogs() {
  return [];
}
