// Centralized calculations
export function calcLitersSold(opening, closing) {
  const o = Number(opening) || 0;
  const c = Number(closing) || 0;
  if (c < o) throw new Error('Closing reading cannot be lower than opening reading');
  const diff = c - o;
  return Math.round(diff * 100) / 100; // 2 decimals
}

export function calcRevenue(liters, price) {
  return Math.round((Number(liters) * Number(price)) * 100) / 100;
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
  totalLiters = Math.round(totalLiters * 100) / 100;
  totalRevenue = Math.round(totalRevenue * 100) / 100;
  Object.keys(byFuel).forEach(k => {
    byFuel[k].liters = Math.round(byFuel[k].liters * 100) / 100;
    byFuel[k].revenue = Math.round(byFuel[k].revenue * 100) / 100;
  });
  return { totalLiters, totalRevenue, byFuel };
}

export function calcPaymentsTotal(payments) {
  const { cash=0, card=0, upi=0, credit=0, other=0 } = payments || {};
  const total = Number(cash)+Number(card)+Number(upi)+Number(credit)+Number(other);
  return Math.round(total*100)/100;
}

export function calcVariance(expected, actual) {
  const v = Math.round((actual - expected)*100)/100;
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
export function formatDate(d) {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}
export function formatTime(d) {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
}
export function formatDateTime(d) {
  const date = d instanceof Date ? d : new Date(d);
  return formatDate(date) + ' ' + formatTime(date);
}
