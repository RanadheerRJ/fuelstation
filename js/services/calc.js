// Centralized calculations.
// All rounding goes through money.js so the same amount rounds identically
// everywhere (previously each function had its own Math.round(x*100)/100).
import { roundMoney, roundLiters } from './money.js';
import { formatBusinessDate, formatBusinessTime, formatBusinessDateTime } from './datetime.js';

export function calcLitersSold(opening, closing) {
  // No `|| 0` fallback: a non-numeric reading is a bug or a typo, and silently
  // treating it as 0 produced fake litres and a fake cash variance.
  const o = Number(opening);
  const c = Number(closing);
  if (!Number.isFinite(o)) throw new Error(`Opening reading is not a valid number (got "${opening}")`);
  if (!Number.isFinite(c)) throw new Error(`Closing reading is not a valid number (got "${closing}")`);
  if (c < o) throw new Error('Closing reading cannot be lower than opening reading');
  return roundLiters(c - o);
}

export function calcRevenue(liters, price) {
  const l = Number(liters), p = Number(price);
  if (!Number.isFinite(l)) throw new Error(`Litres value is invalid (got "${liters}")`);
  if (!Number.isFinite(p)) throw new Error(`Price is invalid (got "${price}")`);
  return roundMoney(l * p);
}

export function calcShiftTotals(nozzleReadings) {
  let totalLiters = 0;
  let totalRevenue = 0;
  const byFuel = {};
  nozzleReadings.forEach(r => {
    totalLiters += r.litersSold || 0;
    totalRevenue += r.revenue || 0;
    const ft = r.fuelType || 'Unknown';
    if (!byFuel[ft]) byFuel[ft] = { liters: 0, revenue: 0 };
    byFuel[ft].liters += r.litersSold || 0;
    byFuel[ft].revenue += r.revenue || 0;
  });
  totalLiters = roundLiters(totalLiters);
  totalRevenue = roundMoney(totalRevenue);
  Object.keys(byFuel).forEach(k => {
    byFuel[k].liters = roundLiters(byFuel[k].liters);
    byFuel[k].revenue = roundMoney(byFuel[k].revenue);
  });
  return { totalLiters, totalRevenue, byFuel };
}

export function calcPaymentsTotal(payments) {
  const { cash=0, card=0, upi=0, credit=0, other=0 } = payments || {};
  for (const [k, v] of Object.entries({ cash, card, upi, credit, other })) {
    if (!Number.isFinite(Number(v))) throw new Error(`${k.toUpperCase()} payment amount is invalid (got "${v}")`);
  }
  return roundMoney(Number(cash)+Number(card)+Number(upi)+Number(credit)+Number(other));
}

export function calcVariance(expected, actual) {
  const e = Number(expected), a = Number(actual);
  if (!Number.isFinite(e) || !Number.isFinite(a)) {
    throw new Error('Cannot compute variance from non-numeric amounts');
  }
  const v = roundMoney(a - e);
  let status = 'BALANCED';
  if (v < -0.5) status = 'SHORT';
  else if (v > 0.5) status = 'EXCESS';
  return { variance: v, status };
}

export function formatCurrency(n) {
  const num = Number(n)||0;
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function formatLiters(n) {
  return (Number(n)||0).toLocaleString('en-IN', { minimumFractionDigits: 2 }) + ' L';
}
// Dates are always rendered in the station's business timezone (Asia/Kolkata),
// not the device timezone — a phone left on the wrong TZ used to relabel shifts.
export function formatDate(d) { return formatBusinessDate(d); }
export function formatTime(d) { return formatBusinessTime(d); }
export function formatDateTime(d) { return formatBusinessDateTime(d); }
