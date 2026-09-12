// Demo store - localStorage based mock of Firestore
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

function createInitialDemoData() {
  const now = new Date();
  const stationId1 = 'st_' + uid();
  const stationId2 = 'st_' + uid();
  const ownerUid = 'user_owner_demo';
  const mgrUid = 'user_mgr_demo';
  const attUid = 'user_att_demo';

  const pumps = [
    { id: 'p1', stationId: stationId1, name: 'Pump 1', number: 1, status: 'active', createdAt: now.toISOString() },
    { id: 'p2', stationId: stationId1, name: 'Pump 2', number: 2, status: 'active', createdAt: now.toISOString() },
    { id: 'p3', stationId: stationId1, name: 'Pump 3', number: 3, status: 'active', createdAt: now.toISOString() },
  ];
  const nozzles = [
    { id: 'n1', stationId: stationId1, pumpId: 'p1', number: 1, fuelType: 'Petrol', status: 'active', lastReading: 125340.20 },
    { id: 'n2', stationId: stationId1, pumpId: 'p1', number: 2, fuelType: 'Petrol', status: 'active', lastReading: 98234.50 },
    { id: 'n3', stationId: stationId1, pumpId: 'p2', number: 1, fuelType: 'Diesel', status: 'active', lastReading: 204821.10 },
    { id: 'n4', stationId: stationId1, pumpId: 'p2', number: 2, fuelType: 'Diesel', status: 'active', lastReading: 187654.30 },
    { id: 'n5', stationId: stationId1, pumpId: 'p3', number: 1, fuelType: 'Premium Petrol', status: 'active', lastReading: 54321.00 },
  ];

  const prices = [
    { id: uid(), stationId: stationId1, fuelType: 'Petrol', price: 104.25, effectiveFrom: new Date(now.getTime()-86400000*2).toISOString(), effectiveTo: null, createdAt: now.toISOString() },
    { id: uid(), stationId: stationId1, fuelType: 'Diesel', price: 92.80, effectiveFrom: new Date(now.getTime()-86400000*2).toISOString(), effectiveTo: null, createdAt: now.toISOString() },
    { id: uid(), stationId: stationId1, fuelType: 'Premium Petrol', price: 110.50, effectiveFrom: new Date(now.getTime()-86400000*2).toISOString(), effectiveTo: null, createdAt: now.toISOString() },
  ];

  return {
    users: [
      { uid: ownerUid, phone: '+919999999999', name: 'Owner Demo', role: 'owner', stationIds: [stationId1, stationId2], status: 'active', pinHash: '1111', createdAt: now.toISOString() },
      { uid: mgrUid, phone: '+919999999998', name: 'Rahul Manager', role: 'manager', stationIds: [stationId1], status: 'active', pinHash: '2222', createdAt: now.toISOString() },
      { uid: attUid, phone: '+919999999997', name: 'Suresh Attendant', role: 'attendant', stationIds: [stationId1], status: 'active', pinHash: '3333', createdAt: now.toISOString() },
      { uid: 'user_att2', phone: '+919999999996', name: 'Priya Attendant', role: 'attendant', stationIds: [stationId1], status: 'active', pinHash: '4444', createdAt: now.toISOString() },
    ],
    stations: [
      { id: stationId1, name: 'Station A - MG Road', address: '123 MG Road, Bangalore', phone: '+919999999999', status: 'active', managerId: mgrUid, ownerId: ownerUid, createdAt: now.toISOString() },
      { id: stationId2, name: 'Station B - Whitefield', address: '456 Whitefield, Bangalore', phone: '+919999999998', status: 'active', managerId: null, ownerId: ownerUid, createdAt: now.toISOString() },
    ],
    pumps,
    nozzles,
    prices,
    assignments: [],
    shifts: [],
    transactions: [],
    notes: [],
    auditLogs: [
      { id: uid(), userId: ownerUid, stationId: stationId1, action: 'STATION_CREATED', timestamp: now.toISOString(), metadata: { stationName: 'Station A' } }
    ],
  };
}

export function demoGet(collection) {
  const data = ensureDemo();
  return data[collection] || [];
}

export function demoAdd(collection, doc) {
  const data = ensureDemo();
  if (!data[collection]) data[collection] = [];
  const id = doc.id || uid();
  const newDoc = { ...doc, id, createdAt: doc.createdAt || new Date().toISOString() };
  data[collection].push(newDoc);
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
