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
