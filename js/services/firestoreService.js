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

export function whereStation(stationId) {
  if (!stationId) throw new Error('A station is required for this query');
  return [{ field: 'stationId', op: '==', value: stationId }];
}

export async function queryDocs(collectionName, predicate, whereFilters = []) {
  if (getIsDemo()) {
    return demo.demoQuery(collectionName, predicate);
  }
  // Security Rules are not filters. Every live Firestore collection query must
  // include constraints that prove its station/user scope to the rules engine;
  // the predicate is retained only for secondary client-side filtering.
  if (!whereFilters.length) {
    throw new Error(`Live Firestore query for ${collectionName} requires an authorization scope`);
  }
  const all = await listDocs(collectionName, whereFilters);
  return all.filter(predicate);
}

// Audit log removed as per requirement - no-op
export async function logAudit() {
  // Audit log disabled - only station owner can destroy data, no audit trail needed
  return;
}
