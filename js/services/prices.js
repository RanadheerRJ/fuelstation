import { listDocs, addDocTo, updateDocById, queryDocs, logAudit } from './firestoreService.js';
import { getState } from '../state.js';

export async function getPrices(stationId) {
  const all = await queryDocs('prices', p => p.stationId === stationId);
  // sort by effectiveFrom desc
  return all.sort((a,b) => new Date(b.effectiveFrom) - new Date(a.effectiveFrom));
}

export async function getActivePrices(stationId) {
  const prices = await getPrices(stationId);
  const map = {};
  prices.forEach(p => {
    if (!p.effectiveTo && !map[p.fuelType]) map[p.fuelType] = p;
  });
  // also include if effectiveTo null but most recent
  return map;
}

export async function getPriceForFuelAtTime(stationId, fuelType, atTime) {
  const all = await queryDocs('prices', p => p.stationId === stationId && p.fuelType === fuelType);
  const at = new Date(atTime);
  // find price where effectiveFrom <= at and (effectiveTo == null or >= at)
  const candidates = all.filter(p => {
    const from = new Date(p.effectiveFrom);
    const to = p.effectiveTo ? new Date(p.effectiveTo) : null;
    return from <= at && (!to || to >= at);
  }).sort((a,b) => new Date(b.effectiveFrom) - new Date(a.effectiveFrom));
  if (candidates.length) return candidates[0];
  // fallback to latest before at
  const before = all.filter(p => new Date(p.effectiveFrom) <= at).sort((a,b)=> new Date(b.effectiveFrom)-new Date(a.effectiveFrom));
  return before[0] || null;
}

export async function setPrice(stationId, fuelType, price) {
  const { user } = getState();
  // close previous active price
  const active = await queryDocs('prices', p => p.stationId === stationId && p.fuelType === fuelType && !p.effectiveTo);
  const now = new Date();
  for (const old of active) {
    await updateDocById('prices', old.id, { effectiveTo: now.toISOString() });
  }
  const payload = {
    stationId,
    fuelType,
    price: Number(price),
    effectiveFrom: now.toISOString(),
    effectiveTo: null,
    createdBy: user?.uid,
  };
  const doc = await addDocTo('prices', payload);
  await logAudit({ userId: user?.uid, stationId, action: 'PRICE_CHANGED', metadata: { fuelType, price } });
  return doc;
}
