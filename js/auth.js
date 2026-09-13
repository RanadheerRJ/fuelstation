// Auth handling - Simple 10-digit phone + PIN, no country code
import { getIsDemo, getAuthInstance, loadAuthModule, getDbInstance, loadFirestoreModule } from './firebase.js';
import { getState, setState, clearState } from './state.js';
import * as demo from './services/demoStore.js';
import { logAudit } from './services/firestoreService.js';

// Simple: keep only last 10 digits, no +91, no country code
export function normalizePhone(input) {
  if (!input) return '';
  const digits = input.toString().replace(/\D/g, '');
  // Take last 10 digits (Indian mobile)
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits;
}

function phoneToEmail(phone) {
  const normalized = normalizePhone(phone); // 10 digits
  return `${normalized}@fuelops.app`;
}

function pinToPassword(pin) {
  return `FuelOps#${pin}#2024`;
}

export async function loginWithPhonePin(phone, pin, expectedRole = null) {
  if (!phone || !pin) throw new Error('Phone and PIN required');
  if (pin.length !== 4 || !/^\d{4}$/.test(pin)) throw new Error('PIN must be 4 digits');

  const normalizedPhone = normalizePhone(phone);
  if (normalizedPhone.length !== 10) throw new Error('Enter valid 10-digit phone number');

  if (getIsDemo()) {
    const users = demo.demoGet('users');
    if (users.length === 0) throw new Error('No users found. Create Super Admin first.');
    
    const user = users.find(u => {
      const up = normalizePhone(u.phone);
      return up === normalizedPhone;
    });
    
    if (!user) throw new Error('User not found. Check phone or contact developer.');
    
    // If expectedRole provided (dev vs user), validate
    if (expectedRole === 'dev' && user.role !== 'super_admin') {
      throw new Error('This is not a Developer account. Use User Login.');
    }
    if (expectedRole === 'user' && user.role === 'super_admin') {
      throw new Error('Developer account. Use Dev Login.');
    }

    const expected = user.pinHash;
    const isMatch = expected === pin || atobSafe(expected) === pin || expected === btoa(pin);
    if (!isMatch) throw new Error('Invalid PIN');
    
    const sessionUser = { uid: user.uid, phone: user.phone, name: user.name, role: user.role, stationIds: user.stationIds, status: user.status };
    setState({ user: sessionUser, currentStationId: user.stationIds?.[0] || null });
    demo.demoAdd('auditLogs', { userId: user.uid, stationId: user.stationIds?.[0]||null, action: 'LOGIN', timestamp: new Date().toISOString(), metadata: { phone: normalizedPhone } });
    return sessionUser;
  }

  // Firebase real
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
    if (!snap.exists()) throw new Error('User profile not found');
    
    const profile = snap.data();
    
    // Role validation for Dev vs User login
    if (expectedRole === 'dev' && profile.role !== 'super_admin') {
      throw new Error('Not a Developer account. Use User Login.');
    }
    if (expectedRole === 'user' && profile.role === 'super_admin') {
      throw new Error('Developer account. Use Dev Login.');
    }
    
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
  if (normalizedPhone.length !== 10) throw new Error('Phone must be 10 digits');

  if (getIsDemo()) {
    const existing = demo.demoGet('users');
    if (role === 'super_admin') {
      const hasSuper = existing.some(u => u.role === 'super_admin');
      if (hasSuper) throw new Error('Super Admin already exists. Only one allowed.');
    }
    const dup = existing.find(u => normalizePhone(u.phone) === normalizedPhone);
    if (dup) throw new Error('Phone already registered');

    const newUser = demo.demoAdd('users', {
      uid: 'user_' + Math.random().toString(36).slice(2,8),
      phone: normalizedPhone,
      name, role, stationIds, status: 'active', pinHash: pin,
      createdAt: new Date().toISOString(),
    });
    return newUser;
  }

  // Firebase real - ensure data saves correctly
  const fsMod = await loadFirestoreModule();
  const db = getDbInstance();

  if (role === 'super_admin') {
    try {
      const { listDocs } = await import('./services/firestoreService.js');
      const allUsers = await listDocs('users');
      const hasSuper = allUsers.some(u => u.role === 'super_admin');
      if (hasSuper) throw new Error('Super Admin already exists. Only one allowed.');
    } catch (err) {
      if (err.message.includes('Super Admin already exists')) throw err;
      // If list fails, continue - maybe first user
    }
  }

  const authMod = await loadAuthModule();
  const auth = getAuthInstance();
  const email = phoneToEmail(normalizedPhone);
  const password = pinToPassword(pin);
  
  console.log('[Auth] Creating user:', normalizedPhone, role);
  const cred = await authMod.createUserWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;
  const profile = { 
    phone: normalizedPhone, 
    name, 
    role, 
    stationIds: stationIds||[], 
    status: 'active', 
    createdAt: fsMod.serverTimestamp(), 
    createdBy: getState().user?.uid || null 
  };
  
  console.log('[Auth] Saving profile to Firestore:', uid, profile);
  await fsMod.setDoc(fsMod.doc(db, 'users', uid), profile);
  console.log('[Auth] User created successfully');
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
