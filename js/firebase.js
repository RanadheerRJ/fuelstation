// Firebase initialization with demo fallback
import { firebaseConfig, isDemoConfig } from './firebase-config.js';

let app = null;
let auth = null;
let db = null;
let isDemo = isDemoConfig();

let firebaseModules = null;

export const getFirebaseStatus = () => ({ isDemo, configured: !isDemo });

export async function initFirebase() {
  if (isDemo) {
    console.log('[FuelOps] Running in DEMO mode (no Firebase config)');
    return { app: null, auth: null, db: null, isDemo: true };
  }
  try {
    // Use CDN imports via importmap in index.html
    const { initializeApp } = await import('firebase/app');
    const { getAuth } = await import('firebase/auth');
    const { getFirestore } = await import('firebase/firestore');

    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    firebaseModules = { initializeApp, getAuth, getFirestore };
    console.log('[FuelOps] Firebase initialized');
    return { app, auth, db, isDemo: false };
  } catch (e) {
    console.warn('[FuelOps] Firebase init failed, falling back to demo', e);
    isDemo = true;
    return { app: null, auth: null, db: null, isDemo: true };
  }
}

export function getAuthInstance() { return auth; }
export function getDbInstance() { return db; }
export function getIsDemo() { return isDemo; }

// Helpers to lazy-load firebase submodules
export async function loadAuthModule() {
  if (isDemo) return null;
  return await import('firebase/auth');
}
export async function loadFirestoreModule() {
  if (isDemo) return null;
  return await import('firebase/firestore');
}
