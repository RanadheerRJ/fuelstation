import { listDocs, addDocTo, updateDocById, queryDocs, logAudit } from './firestoreService.js';
import { getState } from '../state.js';
import { parseMoneyInput } from './money.js';

const PRICE_SETTER_ROLES = ['super_admin', 'owner', 'admin', 'manager'];

export async function getPrices(stationId) {
  const all = await queryDocs('prices', null, [{ field: 'stationId', op: '==', value: stationId }]);
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
  const all = await queryDocs('prices', null, [{ field: 'stationId', op: '==', value: stationId }, { field: 'fuelType', op: '==', value: fuelType }]);
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
  if (!user?.uid) throw new Error('You are not signed in.');

  // Fuel price drives every rupee the station books. Previously any signed-in
  // user could change it — an attendant could have lowered the price, sold at
  // the real rate and pocketed the difference.
  if (!PRICE_SETTER_ROLES.includes(user.role)) {
    throw new Error('Only a manager, admin or owner can change fuel prices.');
  }
  if (user.role !== 'super_admin' && !(user.stationIds || []).includes(stationId)) {
    throw new Error('You do not have access to this station.');
  }
  if (!fuelType) throw new Error('Fuel type is required.');

  // `Number(price)` accepted "abc" as NaN and stored it, which then made every
  // shift closed at that price compute NaN revenue.
  const p = parseMoneyInput(price, { label: 'Price', warnAbove: 500 });
  if (!p.ok) throw new Error(p.error);
  if (p.value <= 0) throw new Error('Price must be greater than zero.');

  // close previous active price
  const active = await queryDocs('prices', p => !p.effectiveTo, [{ field: 'stationId', op: '==', value: stationId }, { field: 'fuelType', op: '==', value: fuelType }]);
  const now = new Date();
  for (const old of active) {
    await updateDocById('prices', old.id, { effectiveTo: now.toISOString() });
  }
  const previous = active[0]?.price ?? null;
  const payload = {
    stationId,
    fuelType,
    price: p.value,
    effectiveFrom: now.toISOString(),
    effectiveTo: null,
    createdBy: user.uid,
    createdByName: user.name || null,
  };
  const doc = await addDocTo('prices', payload);
  await logAudit({
    stationId, action: 'PRICE_CHANGED', entityType: 'price', entityId: doc.id,
    metadata: { fuelType, from: previous, to: p.value },
  });
  return { ...doc, warning: p.warning || null };
}
