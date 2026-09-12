// Simple global state store
const STORAGE_KEY = 'fuelops_state_v1';

const defaultState = {
  user: null, // {uid, phone, name, role, stationIds, stationId}
  currentStationId: null,
  demoData: null,
  offline: !navigator.onLine,
};

let state = { ...defaultState };
let listeners = [];

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = { ...state, ...parsed };
    }
  } catch {}
}
loadPersisted();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      user: state.user,
      currentStationId: state.currentStationId,
    }));
  } catch {}
}

export function getState() { return state; }

export function setState(patch) {
  state = { ...state, ...patch };
  persist();
  listeners.forEach(fn => fn(state));
}

export function subscribe(fn) {
  listeners.push(fn);
  return () => { listeners = listeners.filter(l => l !== fn); };
}

export function clearState() {
  state = { ...defaultState, offline: !navigator.onLine };
  localStorage.removeItem(STORAGE_KEY);
  listeners.forEach(fn => fn(state));
}

// Demo data persistence - PROD FINAL CLEAN - no dummy prices/readings
const DEMO_KEY = 'fuelops_demo_v4_prod_final';
export function getDemoData() {
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}
export function setDemoData(data) {
  try { localStorage.setItem(DEMO_KEY, JSON.stringify(data)); } catch {}
}
export function clearDemoData() { localStorage.removeItem(DEMO_KEY); }

window.addEventListener('online', () => setState({ offline: false }));
window.addEventListener('offline', () => setState({ offline: true }));
