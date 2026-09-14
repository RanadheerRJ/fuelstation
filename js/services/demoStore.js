// Demo store - localStorage based mock of Firestore
// PROD READY: starts empty, no dummy data
import { getDemoData, setDemoData } from '../state.js';

function uid() { return Math.random().toString(36).slice(2,10) + Date.now().toString(36); }

function ensureDemo() {
  let data = getDemoData();
  if (!data) {
    data = createInitialDemoData();
    setDemoData(data);
  }
  return data;
}

// PROD READY: Empty initial data - no dummy stations/pumps/users
function createInitialDemoData() {
  return {
    users: [],
    stations: [],
    pumps: [],
    nozzles: [],
    prices: [],
    assignments: [],
    shifts: [],
    transactions: [],
    notes: [],
    auditLogs: [],
  };
}

export function demoGet(collection) {
  const data = ensureDemo();
  return data[collection] || [];
}

export function demoAdd(collection, doc) {
  const data = ensureDemo();
  if (!data[collection]) data[collection] = [];
  const id = doc.id || doc.uid || uid();
  // Preserve uid as id for users collection compatibility
  const newDoc = { 
    ...doc, 
    id: doc.id || id, 
    uid: doc.uid || id,
    createdAt: doc.createdAt || new Date().toISOString() 
  };
  data[collection].push(newDoc);
  setDemoData(data);
  return newDoc;
}

/**
 * Create-or-replace a document at a caller-chosen id.
 * Needed for documents whose id IS the key (e.g. nozzleLocks/{nozzleId}).
 */
export function demoSet(collection, id, doc) {
  const data = ensureDemo();
  if (!data[collection]) data[collection] = [];
  const arr = data[collection];
  const idx = arr.findIndex(d => d.id === id);
  const newDoc = { ...doc, id };
  if (idx >= 0) arr[idx] = newDoc; else arr.push(newDoc);
  setDemoData(data);
  return newDoc;
}

export function demoUpdate(collection, id, patch) {
  const data = ensureDemo();
  const arr = data[collection] || [];
  const idx = arr.findIndex(d => d.id === id || d.uid === id);
  if (idx >= 0) {
    arr[idx] = { ...arr[idx], ...patch, updatedAt: new Date().toISOString() };
    setDemoData(data);
    return arr[idx];
  }
  return null;
}

export function demoGetById(collection, id) {
  const data = ensureDemo();
  const arr = data[collection] || [];
  return arr.find(d => d.id === id || d.uid === id) || null;
}

export function demoQuery(collection, fn) {
  const data = ensureDemo();
  return (data[collection] || []).filter(fn);
}

export function demoDelete(collection, id) {
  const data = ensureDemo();
  const arr = data[collection] || [];
  data[collection] = arr.filter(d => d.id !== id && d.uid !== id);
  setDemoData(data);
}

export function demoReset() {
  const data = createInitialDemoData();
  setDemoData(data);
  return data;
}

export function demoHasUsers() {
  const data = ensureDemo();
  return (data.users || []).length > 0;
}

export function demoHasSuperAdmin() {
  const data = ensureDemo();
  return (data.users || []).some(u => u.role === 'super_admin');
}

export function demoGetSuperAdmin() {
  const data = ensureDemo();
  return (data.users || []).find(u => u.role === 'super_admin') || null;
}
