// Auth handling - Firebase + Demo
import { getIsDemo, getAuthInstance, loadAuthModule, getDbInstance, loadFirestoreModule } from './firebase.js';
import { getState, setState, clearState } from './state.js';
import * as demo from './services/demoStore.js';
import { logAudit } from './services/firestoreService.js';

function phoneToEmail(phone) {
  const cleaned = phone.replace(/[^+0-9]/g,'');
  return `${cleaned}@fuelops.app`;
}
function pinToPassword(pin) {
  // Firebase requires 6+ chars, so pad
  return `FuelOps#${pin}#2024`;
}

export async function loginWithPhonePin(phone, pin) {
  if (!phone || !pin) throw new Error('Phone and PIN required');
  if (pin.length !== 4 || !/^\d{4}$/.test(pin)) throw new Error('PIN must be 4 digits');

  if (getIsDemo()) {
    // Demo auth: check users collection
    const users = demo.demoGet('users');
    const user = users.find(u => u.phone === phone);
    if (!user) throw new Error('User not found in demo. Try +919999999999 / 1111 (owner), +919999999998 / 2222 (manager), +919999999997 / 3333 (attendant)');
    // check pinHash
    const expected = user.pinHash;
    // pinHash stored as plain for demo simplicity (1111 etc) or base64
    const isMatch = expected === pin || atobSafe(expected) === pin || expected === btoa(pin);
    if (!isMatch) throw new Error('Invalid PIN');
    const sessionUser = { uid: user.uid, phone: user.phone, name: user.name, role: user.role, stationIds: user.stationIds, status: user.status };
    setState({ user: sessionUser, currentStationId: user.stationIds?.[0] || null });
    // log
    demo.demoAdd('auditLogs', { userId: user.uid, stationId: user.stationIds?.[0]||null, action: 'LOGIN', timestamp: new Date().toISOString(), metadata: { phone } });
    return sessionUser;
  }

  // Firebase mode
  const authMod = await loadAuthModule();
  const auth = getAuthInstance();
  const email = phoneToEmail(phone);
  const password = pinToPassword(pin);
  try {
    const cred = await authMod.signInWithEmailAndPassword(auth, email, password);
    // fetch user profile from Firestore
    const fsMod = await loadFirestoreModule();
    const db = getDbInstance();
    const userRef = fsMod.doc(db, 'users', cred.user.uid);
    const snap = await fsMod.getDoc(userRef);
    if (!snap.exists()) throw new Error('User profile not found');
    const profile = snap.data();
    const sessionUser = { uid: cred.user.uid, phone: profile.phone, name: profile.name, role: profile.role, stationIds: profile.stationIds || [], status: profile.status };
    setState({ user: sessionUser, currentStationId: profile.stationIds?.[0] || null });
    await logAudit({ userId: cred.user.uid, stationId: profile.stationIds?.[0], action: 'LOGIN', metadata: { phone } });
    return sessionUser;
  } catch (e) {
    if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
      throw new Error('Invalid phone or PIN');
    }
    throw e;
  }
}

function atobSafe(str) {
  try { return atob(str); } catch { return null; }
}

export async function registerUserInFirebase({ phone, pin, name, role, stationIds }) {
  if (getIsDemo()) {
    const newUser = demo.demoAdd('users', {
      uid: 'user_' + Math.random().toString(36).slice(2,8),
      phone, name, role, stationIds, status: 'active', pinHash: pin,
      createdAt: new Date().toISOString(),
    });
    return newUser;
  }
  const authMod = await loadAuthModule();
  const fsMod = await loadFirestoreModule();
  const auth = getAuthInstance();
  const db = getDbInstance();
  const email = phoneToEmail(phone);
  const password = pinToPassword(pin);
  const cred = await authMod.createUserWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;
  const profile = { phone, name, role, stationIds: stationIds||[], status: 'active', createdAt: fsMod.serverTimestamp(), createdBy: getState().user?.uid };
  await fsMod.setDoc(fsMod.doc(db, 'users', uid), profile);
  return { uid, ...profile };
}

export async function logout() {
  const { user } = getState();
  if (!getIsDemo()) {
    try {
      const authMod = await loadAuthModule();
      const auth = getAuthInstance();
      await authMod.signOut(auth);
    } catch {}
  } else {
    if (user) {
      demo.demoAdd('auditLogs', { userId: user.uid, stationId: user.stationIds?.[0]||null, action: 'LOGOUT', timestamp: new Date().toISOString(), metadata: {} });
    }
  }
  clearState();
}

export function getCurrentUser() { return getState().user; }
export function requireAuth() {
  const u = getState().user;
  if (!u) throw new Error('Not authenticated');
  return u;
}

export function hasRole(roles) {
  const u = getState().user;
  if (!u) return false;
  return roles.includes(u.role);
}
