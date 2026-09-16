// Ground / Tank stock service
// Owner inputs the measured (dip) ground stock per fuel.
// Available stock is auto-balanced = baseline stock - liters sold since the entry.
import { queryDocs, addDocTo, updateDocById, deleteDocById, logAudit } from './firestoreService.js';
import { getState } from '../state.js';

// One doc per station+fuelType in collection 'tankStocks'
// { stationId, fuelType, baselineLiters, baselineTime, capacityLiters, updatedBy }

export async function getTankStocks(stationId) {
  const all = await queryDocs('tankStocks', t => t.stationId === stationId);
  const map = {};
  all.forEach(t => {
    // keep latest baseline per fuel type
    if (!map[t.fuelType] || new Date(t.baselineTime) > new Date(map[t.fuelType].baselineTime)) {
      map[t.fuelType] = t;
    }
  });
  return map;
}

export async function setTankStock(stationId, fuelType, liters, capacityLiters) {
  const { user } = getState();
  const now = new Date().toISOString();
  const existing = await queryDocs('tankStocks', t => t.stationId === stationId && t.fuelType === fuelType);
  const payload = {
    stationId,
    fuelType,
    baselineLiters: Number(liters),
    baselineTime: now,
    capacityLiters: capacityLiters != null && capacityLiters !== '' ? Number(capacityLiters) : (existing[0]?.capacityLiters ?? null),
    updatedBy: user?.uid || null,
  };
  let doc;
  if (existing.length) {
    doc = await updateDocById('tankStocks', existing[0].id, payload);
  } else {
    doc = await addDocTo('tankStocks', payload);
  }
  try { await logAudit({ userId: user?.uid, stationId, action: 'TANK_STOCK_SET', metadata: { fuelType, liters: Number(liters) } }); } catch {}
  return doc;
}

// Remove the ground stock entry for a fuel at a station (owner / super_admin only per rules)
export async function removeTankStock(stationId, fuelType) {
  const { user } = getState();
  const existing = await queryDocs('tankStocks', t => t.stationId === stationId && t.fuelType === fuelType);
  for (const doc of existing) {
    await deleteDocById('tankStocks', doc.id);
  }
  try { await logAudit({ userId: user?.uid, stationId, action: 'TANK_STOCK_REMOVED', metadata: { fuelType } }); } catch {}
  return existing.length;
}

// Compute liters sold for a fuel bucket ('ms' | 'hsd') since a baseline time, from shifts
export function litersSoldSince(shifts, bucket, sinceISO) {
  const since = sinceISO ? new Date(sinceISO) : null;
  let liters = 0;
  shifts.forEach(s => {
    if (since && new Date(s.startTime) < since) return;
    if (!s.totals?.byFuel) return;
    Object.entries(s.totals.byFuel).forEach(([ft, v]) => {
      const f = ft.toLowerCase();
      const isMs = f.includes('petrol') || f.includes('ms');
      const isHsd = f.includes('diesel') || f.includes('hsd');
      if ((bucket === 'ms' && isMs) || (bucket === 'hsd' && isHsd)) liters += v.liters || 0;
    });
  });
  return liters;
}

// Current available stock for a stock doc, given all shifts of the station
export function availableStock(stockDoc, shifts, bucket) {
  if (!stockDoc) return null;
  const sold = litersSoldSince(shifts, bucket, stockDoc.baselineTime);
  return Math.max(0, (stockDoc.baselineLiters || 0) - sold);
}

// Level classification for coloring
// Returns { level: 'ok'|'low'|'critical'|'unknown', pct: number|null }
export function stockLevel(available, capacityLiters) {
  if (available == null) return { level: 'unknown', pct: null };
  if (capacityLiters && capacityLiters > 0) {
    const pct = (available / capacityLiters) * 100;
    if (pct >= 50) return { level: 'ok', pct };
    if (pct >= 25) return { level: 'low', pct };
    return { level: 'critical', pct };
  }
  // fallback absolute thresholds when capacity unknown
  if (available >= 3000) return { level: 'ok', pct: null };
  if (available >= 1000) return { level: 'low', pct: null };
  return { level: 'critical', pct: null };
}

export const LEVEL_COLORS = {
  ok:       { fg: '#95de64', badgeBg: 'rgba(82,196,26,0.15)',  border: 'rgba(82,196,26,0.4)',  label: 'Healthy' },
  low:      { fg: '#ffd666', badgeBg: 'rgba(250,173,20,0.15)', border: 'rgba(250,173,20,0.4)', label: 'Low' },
  critical: { fg: '#ff7875', badgeBg: 'rgba(255,77,79,0.18)',  border: 'rgba(255,77,79,0.5)',  label: 'Refill soon' },
  unknown:  { fg: 'rgba(255,255,255,0.75)', badgeBg: 'rgba(255,255,255,0.08)', border: 'rgba(255,255,255,0.15)', label: 'Set stock' },
};
