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

// Firestore rejects `undefined` field values with an unhandled error.
// Strip them so an optional field (e.g. a blank expense description) can never
// silently break a save.
function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out = {};
    Object.entries(value).forEach(([k, v]) => {
      if (v === undefined) return;
      out[k] = stripUndefined(v);
    });
    return out;
  }
  return value;
}

export async function addDocTo(collectionName, data) {
  const clean = stripUndefined(data);
  if (getIsDemo()) {
    return demo.demoAdd(collectionName, clean);
  }
  const mod = await loadFirestoreModule();
  const db = getDbInstance();
  const coll = mod.collection(db, collectionName);
  const withMeta = { ...clean, createdAt: mod.serverTimestamp() };
  const ref = await mod.addDoc(coll, withMeta);
  return { id: ref.id, ...clean };
}

export async function updateDocById(collectionName, id, patch) {
  const clean = stripUndefined(patch);
  if (getIsDemo()) {
    return demo.demoUpdate(collectionName, id, clean);
  }
  const mod = await loadFirestoreModule();
  const db = getDbInstance();
  const ref = mod.doc(db, collectionName, id);
  await mod.updateDoc(ref, { ...clean, updatedAt: mod.serverTimestamp() });
  return { id, ...clean };
}

export async function queryDocs(collectionName, predicate) {
  if (getIsDemo()) {
    return demo.demoQuery(collectionName, predicate);
  }
  // For Firestore, fetch all and filter client side for simplicity unless filters provided
  const all = await listDocs(collectionName);
  return all.filter(predicate);
}

// Audit log removed as per requirement - no-op
export async function logAudit() {
  // Audit log disabled - only station owner can destroy data, no audit trail needed
  return;
}
