// ============================================================================
// Fuel stock / tanker intake
//
// The app had no inventory concept at all. Stock is now tracked as a simple
// ledger:
//
//     available stock = Σ(deliveries received) − Σ(litres dispensed)
//
// Deliveries are recorded by hand when a tanker arrives. Dispensed litres come
// from closed shifts (the nozzle meter readings), so sales are already being
// counted accurately and never need re-entering.
//
// Deliveries are append-only: a wrong entry is corrected with an adjustment
// entry, never by rewriting history, so the tank ledger stays auditable.
// ============================================================================

import { queryDocs, addDocTo, logAudit } from './firestoreService.js';
import { getState } from '../state.js';
import { parseNumericInput, roundLiters } from './money.js';
import { getBusinessDate } from './datetime.js';

// Strictly increasing within a session; only used to break receivedAt ties.
let _seq = 0;
function nextSeq() { return Date.now() * 1000 + (++_seq % 1000); }

const STOCK_ROLES = ['super_admin', 'owner', 'admin', 'manager'];

/** Normalise the many spellings of a fuel type to MS / HSD. */
export function normalizeFuel(fuelType) {
  const f = String(fuelType || '').toLowerCase();
  if (f.includes('petrol') || f === 'ms' || f.includes('motor spirit')) return 'MS';
  if (f.includes('diesel') || f === 'hsd' || f.includes('high speed')) return 'HSD';
  return String(fuelType || 'OTHER').toUpperCase();
}

export const FUEL_LABEL = { MS: 'Petrol', HSD: 'Diesel' };

/**
 * Record a tanker delivery.
 * @param {object} p
 *   stationId, fuelType, liters   - required
 *   note                          - free text, e.g. "IOC tanker TS09 1234"
 *   invoiceRef, receivedAt        - optional
 */
export async function addDelivery({ stationId, fuelType, liters, note = '', invoiceRef = '', receivedAt = null }) {
  const { user } = getState();
  if (!user?.uid) throw new Error('You are not signed in.');
  if (!STOCK_ROLES.includes(user.role)) {
    throw new Error('Only a manager, admin or owner can record a fuel delivery.');
  }
  if (user.role !== 'super_admin' && !(user.stationIds || []).includes(stationId)) {
    throw new Error('You do not have access to this station.');
  }
  if (!fuelType) throw new Error('Select which fuel this tanker delivered.');

  // A tanker load is large; warn above a typical full load rather than block.
  const qty = parseNumericInput(liters, {
    label: 'Delivered litres', decimals: 3, min: 0, warnAbove: 50000,
  });
  if (!qty.ok) throw new Error(qty.error);
  if (qty.value <= 0) throw new Error('Delivered litres must be greater than zero.');

  const payload = {
    stationId,
    fuelType: normalizeFuel(fuelType),
    fuelTypeRaw: fuelType,
    liters: roundLiters(qty.value),
    note: String(note || '').trim(),
    invoiceRef: String(invoiceRef || '').trim(),
    receivedAt: receivedAt || new Date().toISOString(),
    // Monotonic tiebreaker: two tankers logged in the same millisecond would
    // otherwise sort arbitrarily. Ordering falls back to this, never to
    // insertion order, which Firestore does not guarantee.
    recordedSeq: nextSeq(),
    businessDate: getBusinessDate(receivedAt || new Date()),
    type: 'DELIVERY',
    recordedBy: user.uid,
    recordedByName: user.name || null,
  };

  const doc = await addDocTo('deliveries', payload);
  await logAudit({
    stationId, action: 'FUEL_DELIVERY_RECORDED',
    entityType: 'delivery', entityId: doc.id,
    metadata: { fuelType: payload.fuelType, liters: payload.liters, note: payload.note },
  });
  return { ...doc, warning: qty.warning || null };
}

/** All deliveries for a station, newest first. */
export async function getDeliveries(stationId, { fuelType = null, limit = null } = {}) {
  if (!stationId) return [];
  const filters = [{ field: 'stationId', op: '==', value: stationId }];
  if (fuelType) filters.push({ field: 'fuelType', op: '==', value: normalizeFuel(fuelType) });
  const all = await queryDocs('deliveries', null, filters);
  all.sort((a, b) => {
    const t = new Date(b.receivedAt) - new Date(a.receivedAt);
    if (t !== 0) return t;
    return (b.recordedSeq || 0) - (a.recordedSeq || 0);
  });
  return limit ? all.slice(0, limit) : all;
}

/**
 * Current stock per fuel.
 *
 * Returns { MS: {received, sold, available, lastDelivery}, HSD: {...}, ... }
 *
 * `sold` counts litres from every shift that has recorded closing readings.
 * ACTIVE shifts have not been closed yet, so their fuel is not deducted until
 * the attendant submits — that is intentional and matches how the meter works.
 */
export async function getStockSummary(stationId, shifts = null) {
  if (!stationId) return {};

  const deliveries = await getDeliveries(stationId);

  let allShifts = shifts;
  if (!allShifts) {
    allShifts = await queryDocs('shifts', null, [{ field: 'stationId', op: '==', value: stationId }]);
  }

  const summary = {};
  const ensure = (f) => {
    if (!summary[f]) summary[f] = { fuel: f, received: 0, sold: 0, available: 0, lastDelivery: null };
    return summary[f];
  };

  for (const d of deliveries) {
    const row = ensure(normalizeFuel(d.fuelType));
    row.received += Number(d.liters) || 0;
    const newer = !row.lastDelivery
      || new Date(d.receivedAt) > new Date(row.lastDelivery.receivedAt)
      || (new Date(d.receivedAt).getTime() === new Date(row.lastDelivery.receivedAt).getTime()
          && (d.recordedSeq || 0) > (row.lastDelivery.recordedSeq || 0));
    if (newer) {
      row.lastDelivery = d;
    }
  }

  for (const s of allShifts) {
    // byFuel is written when a shift is closed; ACTIVE shifts have none yet.
    const byFuel = s.totals?.byFuel;
    if (byFuel) {
      for (const [ft, v] of Object.entries(byFuel)) {
        ensure(normalizeFuel(ft)).sold += Number(v.liters) || 0;
      }
    } else {
      for (const n of s.nozzles || []) {
        if (n.litersSold) ensure(normalizeFuel(n.fuelType)).sold += Number(n.litersSold) || 0;
      }
    }
  }

  for (const row of Object.values(summary)) {
    row.received = roundLiters(row.received);
    row.sold = roundLiters(row.sold);
    row.available = roundLiters(row.received - row.sold);
  }
  return summary;
}
