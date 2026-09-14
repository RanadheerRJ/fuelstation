// ============================================================================
// Firebase initialization
//
// IMPORTANT BEHAVIOUR CHANGE (security):
//   This module used to catch any initialization error and silently set
//   `isDemo = true`. A real user whose network blocked the Firebase CDN, or
//   whose config was wrong, was quietly downgraded to a localStorage sandbox.
//   They would see a working app, enter a whole day of real shift data, and
//   that data would never reach the server — while also bypassing every
//   Firestore security rule.
//
//   Demo mode is now EXPLICIT ONLY: it is entered when the config itself says
//   so (isDemoConfig()). A failure to initialize a configured Firebase project
//   is now a hard, visible error.
// ============================================================================
import { firebaseConfig, isDemoConfig } from './firebase-config.js';

let app = null;
let auth = null;
let db = null;

// Demo mode is decided once, from configuration, and never from a failure.
const isDemo = isDemoConfig();

let initError = null;
let initialized = false;

export const getFirebaseStatus = () => ({
  isDemo,
  configured: !isDemo,
  initialized,
  error: initError ? String(initError.message || initError) : null,
});

/** True when Firebase was configured but could not be reached/initialized. */
export function getInitError() { return initError; }

export async function initFirebase() {
  if (isDemo) {
    console.log('[FuelOps] Running in DEMO mode (explicitly configured — data is local only)');
    initialized = true;
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
    initialized = true;
    initError = null;
    console.log('[FuelOps] Firebase initialized');
    return { app, auth, db, isDemo: false };
  } catch (e) {
    // DO NOT fall back to demo. Surface the failure.
    initError = e;
    initialized = false;
    console.error('[FuelOps] Firebase initialization FAILED. Not falling back to demo mode.', e);
    throw new Error(
      'Could not connect to the FuelOps server. Your data will not be saved. ' +
      'Please check your internet connection and reload. (' + (e?.message || e) + ')'
    );
  }
}

export function getAuthInstance() { return auth; }
export function getDbInstance() { return db; }
export function getIsDemo() { return isDemo; }

/**
 * Throws if the app is configured for Firebase but is not usable. Services call
 * this before a write so a broken connection fails loudly instead of writing
 * into a local sandbox the user believes is the server.
 */
export function assertBackendReady() {
  if (isDemo) return;
  if (!initialized || !db) {
    throw new Error(
      'Not connected to the FuelOps server — changes cannot be saved right now. Please reload and try again.'
    );
  }
}

// Helpers to lazy-load firebase submodules
export async function loadAuthModule() {
  if (isDemo) return null;
  assertBackendReady();
  return await import('firebase/auth');
}
export async function loadFirestoreModule() {
  if (isDemo) return null;
  assertBackendReady();
  return await import('firebase/firestore');
}
