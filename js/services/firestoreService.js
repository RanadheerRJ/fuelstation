// Unified Firestore + Demo service
import { getIsDemo, getDbInstance, loadFirestoreModule } from '../firebase.js';
import * as demo from './demoStore.js';

async function getCollRef(collectionName) {
  if (getIsDemo()) return null;
  const mod = await loadFirestoreModule();
  const db = getDbInstance();
  return mod.collection(db, collectionName);
}

export async function listDocs(collectionName, whereFilters = []) {
  if (getIsDemo()) {
    let docs = demo.demoGet(collectionName);
    // simple where filtering for demo
    whereFilters.forEach(({ field, op, value }) => {
      docs = docs.filter(d => {
        const v = d[field];
        if (op === '==') return v === value;
        if (op === 'in') return value.includes(v);
        if (op === 'array-contains') return Array.isArray(v) && v.includes(value);
        return true;
      });
    });
    return docs;
  }
  const mod = await loadFirestoreModule();
  const db = getDbInstance();
  let q = mod.collection(db, collectionName);
  if (whereFilters.length) {
    const constraints = whereFilters.map(f => mod.where(f.field, f.op, f.value));
    q = mod.query(q, ...constraints);
  }
  const snap = await mod.getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getDocById(collectionName, id) {
  if (getIsDemo()) return demo.demoGetById(collectionName, id);
  const mod = await loadFirestoreModule();
  const db = getDbInstance();
  const ref = mod.doc(db, collectionName, id);
  const snap = await mod.getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function addDocTo(collectionName, data) {
  // Sanitize: Firestore rejects undefined values
  const cleanData = {};
  Object.entries(data).forEach(([k,v])=>{
    if (v !== undefined) cleanData[k]=v;
  });
  if (getIsDemo()) {
    return demo.demoAdd(collectionName, cleanData);
  }
  const mod = await loadFirestoreModule();
  const db = getDbInstance();
  const coll = mod.collection(db, collectionName);
  const withMeta = { ...cleanData, createdAt: mod.serverTimestamp() };
  const ref = await mod.addDoc(coll, withMeta);
  return { id: ref.id, ...cleanData };
}

export async function updateDocById(collectionName, id, patch) {
  if (getIsDemo()) {
    return demo.demoUpdate(collectionName, id, patch);
  }
  const mod = await loadFirestoreModule();
  const db = getDbInstance();
  const ref = mod.doc(db, collectionName, id);
  await mod.updateDoc(ref, { ...patch, updatedAt: mod.serverTimestamp() });
  return { id, ...patch };
}

export async function deleteDocById(collectionName, id) {
  if (getIsDemo()) {
    return demo.demoDelete(collectionName, id);
  }
  const mod = await loadFirestoreModule();
  const db = getDbInstance();
  const ref = mod.doc(db, collectionName, id);
  await mod.deleteDoc(ref);
  return true;
}

/**
 * Filter a collection.
 *
 * PERFORMANCE / COST (Step 14): this used to ALWAYS download the entire
 * collection and filter in JS. On a station with a year of shifts that is tens
 * of thousands of document reads for one screen, and it also means the client
 * receives data it may not be entitled to.
 *
 * Callers should pass `whereFilters` so the constraint runs server-side in
 * Firestore (and is enforceable by security rules). The JS `predicate` is now
 * only a refinement applied to the already-narrowed result set.
 *
 * @param {string}   collectionName
 * @param {function} predicate     optional client-side refinement
 * @param {Array}    whereFilters  [{field, op, value}] pushed down to Firestore
 */
export async function queryDocs(collectionName, predicate, whereFilters = []) {
  if (getIsDemo()) {
    const docs = await listDocs(collectionName, whereFilters);
    return predicate ? docs.filter(predicate) : docs;
  }
  const docs = await listDocs(collectionName, whereFilters);
  return predicate ? docs.filter(predicate) : docs;
}

/**
 * Convenience wrapper: everything in one station, narrowed server-side.
 * This is the correct entry point for almost every read in the app.
 */
export async function queryByStation(collectionName, stationId, predicate = null, extraFilters = []) {
  if (!stationId) return [];
  const filters = [{ field: 'stationId', op: '==', value: stationId }, ...extraFilters];
  return await queryDocs(collectionName, predicate, filters);
}

/**
 * Append an audit entry (Step 12).
 *
 * Previously this was an explicit no-op, so the app had no accountability trail
 * at all: nobody could tell who approved a shift, changed a price or deleted a
 * pump. Entries are append-only — the Firestore rules forbid update and delete
 * on /auditLogs, and only manager+ may read them.
 *
 * Never throws: a failure to log must not roll back the user's actual action,
 * but it is reported to the console so it is not invisible.
 */
export async function logAudit(entry = {}) {
  try {
    const { getState } = await import('../state.js');
    const { user } = getState();

    const record = {
      // Who
      actorUserId: user?.uid || entry.userId || null,
      actorName: user?.name || null,
      actorRole: user?.role || null,
      // Where
      stationId: entry.stationId || null,
      // What
      action: entry.action || 'UNKNOWN',
      entityType: entry.entityType || null,
      entityId: entry.entityId || null,
      metadata: entry.metadata ?? null,
      // When (client clock, for ordering only; createdAt is the server stamp)
      clientTime: new Date().toISOString(),
    };

    if (!record.actorUserId) return; // unauthenticated: rules would reject anyway
    await addDocTo('auditLogs', record);
  } catch (e) {
    console.warn('[FuelOps] audit log write failed', entry?.action, e);
  }
}

// ============================================================================
// Atomic primitives (Step 10)
// ============================================================================

/**
 * Run fn inside a Firestore transaction. In demo mode the callback is executed
 * directly against the local store (single-threaded, so effectively atomic).
 *
 * fn receives a tx-like helper: { get(coll,id), set(coll,id,data), update(coll,id,patch), delete(coll,id) }
 */
// Serializes demo-mode transactions. The local store is synchronous, but an
// `await` inside a transaction body yields the event loop, which would let two
// concurrent callers interleave their read/write and both "win" a lock. Real
// Firestore gives us atomicity via runTransaction; in demo we emulate it with a
// promise-chain mutex so both code paths behave identically.
let demoTxChain = Promise.resolve();

export async function runInTransaction(fn) {
  if (getIsDemo()) {
    const run = demoTxChain.then(() => demoRunTx(fn), () => demoRunTx(fn));
    // Keep the chain alive even if this transaction rejects.
    demoTxChain = run.then(() => undefined, () => undefined);
    return await run;
  }
  return await firestoreRunTx(fn);
}

async function demoRunTx(fn) {
  {
    const helper = {
      get: async (coll, id) => demo.demoGetById(coll, id),
      set: async (coll, id, data) => demo.demoSet ? demo.demoSet(coll, id, data) : demo.demoAdd(coll, { ...data, id }),
      update: async (coll, id, patch) => demo.demoUpdate(coll, id, patch),
      delete: async (coll, id) => demo.demoDelete(coll, id),
    };
    return await fn(helper);
  }
}

async function firestoreRunTx(fn) {
  const mod = await loadFirestoreModule();
  const db = getDbInstance();
  return await mod.runTransaction(db, async (tx) => {
    const helper = {
      get: async (coll, id) => {
        const snap = await tx.get(mod.doc(db, coll, id));
        return snap.exists() ? { id: snap.id, ...snap.data() } : null;
      },
      set: async (coll, id, data) => { tx.set(mod.doc(db, coll, id), data); return { id, ...data }; },
      update: async (coll, id, patch) => { tx.update(mod.doc(db, coll, id), patch); return { id, ...patch }; },
      delete: async (coll, id) => { tx.delete(mod.doc(db, coll, id)); return true; },
    };
    return await fn(helper);
  });
}

/**
 * Claim a nozzle for a shift, atomically.
 *
 * Why a lock document: the old code did "query for active shifts, check none
 * uses this nozzle, then write". Two attendants tapping Start at the same
 * moment both read an empty result and both succeed — the same nozzle ends up
 * in two active shifts and its litres are counted twice. Firestore client
 * transactions cannot run queries, so the mutual-exclusion point is a document
 * whose ID is the nozzle ID: creating it is the atomic compare-and-set.
 *
 * @throws if the nozzle is already held by another shift.
 */
export async function acquireNozzleLock(nozzleId, { shiftId, stationId, userId, employeeName }) {
  return await runInTransaction(async (tx) => {
    const existing = await tx.get('nozzleLocks', nozzleId);
    if (existing && existing.shiftId && existing.shiftId !== shiftId) {
      throw new Error(
        `Nozzle is already in an active shift${existing.employeeName ? ' by ' + existing.employeeName : ''}. Ask them to close it first.`
      );
    }
    await tx.set('nozzleLocks', nozzleId, {
      nozzleId,
      shiftId,
      stationId,
      userId,
      employeeName: employeeName || null,
      acquiredAt: new Date().toISOString(),
    });
    return true;
  });
}

/** Release a nozzle lock, but only if this shift still owns it. */
export async function releaseNozzleLock(nozzleId, shiftId) {
  try {
    await runInTransaction(async (tx) => {
      const existing = await tx.get('nozzleLocks', nozzleId);
      if (!existing) return true;
      if (shiftId && existing.shiftId !== shiftId) return true; // not ours
      await tx.delete('nozzleLocks', nozzleId);
      return true;
    });
  } catch (e) {
    console.warn('[FuelOps] failed to release nozzle lock', nozzleId, e);
  }
}
