// Auth handling - Firebase + Demo - Invite Only - 10 digit phone + PIN
import { getIsDemo, getAuthInstance, loadAuthModule, getDbInstance, loadFirestoreModule } from './firebase.js';
import { getState, setState, clearState } from './state.js';
import * as demo from './services/demoStore.js';
import { logAudit } from './services/firestoreService.js';

// Normalize phone: accept 9948288169, 09948288169, +919948288169 -> +919948288169
export function normalizePhone(input) {
  if (!input) return '';
  let cleaned = input.toString().replace(/\D/g, ''); // only digits
  // Remove leading 0
  if (cleaned.startsWith('0')) cleaned = cleaned.slice(1);
  // If 10 digits, add 91
  if (cleaned.length === 10) cleaned = '91' + cleaned;
  // If 12 digits starting with 91, keep
  // If 11 digits starting with 0+10? already handled
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return '+' + cleaned;
  }
  if (cleaned.length === 10) {
    return '+91' + cleaned;
  }
  // If already has +91 and 13 chars with +, handle
  // Fallback: if input already has +, preserve
  if (input.toString().trim().startsWith('+')) {
    return '+' + input.toString().replace(/\D/g,'');
  }
  // Default: add +91 if 10 digits
  if (cleaned.length >= 10) {
    // take last 10 digits as Indian number
    const last10 = cleaned.slice(-10);
    return '+91' + last10;
  }
  return '+91' + cleaned;
}

function phoneToEmail(phone) {
  const normalized = normalizePhone(phone);
  const cleaned = normalized.replace(/[^+0-9]/g,'');
  return `${cleaned}@fuelops.app`;
}

function pinToPassword(pin) {
  return `FuelOps#${pin}#2024`;
}

export async function loginWithPhonePin(phone, pin) {
  if (!phone || !pin) throw new Error('Phone and PIN required');
  if (pin.length !== 4 || !/^\d{4}$/.test(pin)) throw new Error('PIN must be 4 digits');

  const normalizedPhone = normalizePhone(phone);

  if (getIsDemo()) {
    const users = demo.demoGet('users');
    if (users.length === 0) throw new Error('No users found. Contact developer for Super Admin setup.');
    // Try normalized and raw
    const user = users.find(u => {
      const up = normalizePhone(u.phone);
      return up === normalizedPhone || u.phone === phone || u.phone.replace(/\D/g,'').slice(-10) === normalizedPhone.slice(-10);
    });
    if (!user) throw new Error('User not found. Check phone number or contact developer.');
    const expected = user.pinHash;
    const isMatch = expected === pin || atobSafe(expected) === pin || expected === btoa(pin);
    if (!isMatch) throw new Error('Invalid PIN');
    const sessionUser = { uid: user.uid, phone: user.phone, name: user.name, role: user.role, stationIds: user.stationIds, status: user.status };
    setState({ user: sessionUser, currentStationId: user.stationIds?.[0] || null });
    demo.demoAdd('auditLogs', { userId: user.uid, stationId: user.stationIds?.[0]||null, action: 'LOGIN', timestamp: new Date().toISOString(), metadata: { phone: normalizedPhone } });
    return sessionUser;
  }

  // Firebase mode - real auth
  const authMod = await loadAuthModule();
  const auth = getAuthInstance();
  const email = phoneToEmail(normalizedPhone);
  const password = pinToPassword(pin);
  try {
    const cred = await authMod.signInWithEmailAndPassword(auth, email, password);
    const fsMod = await loadFirestoreModule();
    const db = getDbInstance();
    const userRef = fsMod.doc(db, 'users', cred.user.uid);
    const snap = await fsMod.getDoc(userRef);
    if (!snap.exists()) throw new Error('User profile not found. Contact developer.');
    const profile = snap.data();
    const sessionUser = { uid: cred.user.uid, phone: profile.phone, name: profile.name, role: profile.role, stationIds: profile.stationIds || [], status: profile.status };
    setState({ user: sessionUser, currentStationId: profile.stationIds?.[0] || null });
    await logAudit({ userId: cred.user.uid, stationId: profile.stationIds?.[0], action: 'LOGIN', metadata: { phone: normalizedPhone } });
    return sessionUser;
  } catch (e) {
    if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password') {
      throw new Error('Invalid phone or PIN');
    }
    throw e;
  }
}

function atobSafe(str) {
  try { return atob(str); } catch { return null; }
}

export async function registerUserInFirebase({ phone, pin, name, role, stationIds }) {
  const normalizedPhone = normalizePhone(phone);

  if (getIsDemo()) {
    // Enforce only ONE super_admin
    const existing = demo.demoGet('users');
    if (role === 'super_admin') {
      const hasSuper = existing.some(u => u.role === 'super_admin');
      if (hasSuper) throw new Error('Super Admin already exists. Only one allowed.');
    }
    // Check duplicate phone
    const dup = existing.find(u => normalizePhone(u.phone) === normalizedPhone);
    if (dup) throw new Error('Phone number already registered');

    const newUser = demo.demoAdd('users', {
      uid: 'user_' + Math.random().toString(36).slice(2,8),
      phone: normalizedPhone,
      name, role, stationIds, status: 'active', pinHash: pin,
      createdAt: new Date().toISOString(),
    });
    return newUser;
  }

  // Firebase real
  const fsMod = await loadFirestoreModule();
  const db = getDbInstance();

  // Check only one super_admin in Firestore
  if (role === 'super_admin') {
    const { listDocs } = await import('./services/firestoreService.js');
    const allUsers = await listDocs('users');
    const hasSuper = allUsers.some(u => u.role === 'super_admin');
    if (hasSuper) throw new Error('Super Admin already exists. Only one allowed.');
  }

  const authMod = await loadAuthModule();
  const auth = getAuthInstance();
  const email = phoneToEmail(normalizedPhone);
  const password = pinToPassword(pin);
  const cred = await authMod.createUserWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;
  const profile = { phone: normalizedPhone, name, role, stationIds: stationIds||[], status: 'active', createdAt: fsMod.serverTimestamp(), createdBy: getState().user?.uid || null };
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
