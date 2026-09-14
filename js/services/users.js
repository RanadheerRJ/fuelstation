import { listDocs, addDocTo, updateDocById, getDocById, logAudit, queryDocs } from './firestoreService.js';
import { getState } from '../state.js';

// Roles that may manage other employees.
const ADMIN_ROLES = ['super_admin', 'owner', 'admin'];
const ASSIGNABLE_ROLES = ['owner', 'admin', 'manager', 'attendant'];

function currentUser() {
  const { user } = getState();
  if (!user?.uid) throw new Error('You are not signed in.');
  return user;
}

function assertCanManageUsers(user) {
  if (!ADMIN_ROLES.includes(user.role)) {
    throw new Error('Only an owner or admin can manage employees.');
  }
}

export async function getEmployees(stationId=null) {
  const { user } = getState();
  // Scope the query server-side wherever possible instead of downloading the
  // whole user table (Step 14) and leaking staff from other stations (Step 2).
  if (stationId) {
    return await queryDocs('users', null, [
      { field: 'stationIds', op: 'array-contains', value: stationId },
    ]);
  }
  // No station given: super admin sees everyone, anyone else sees only the
  // staff of the stations they belong to.
  const all = await listDocs('users');
  if (user?.role === 'super_admin') return all;
  const mine = user?.stationIds || [];
  return all.filter(u => (u.stationIds||[]).some(sid => mine.includes(sid)));
}

export async function getUserById(uid) { return await getDocById('users', uid); }

export async function createEmployee(data) {
  const user = currentUser();
  assertCanManageUsers(user);

  // Privilege escalation guards (Step 3). Nothing here is the real boundary —
  // firestore.rules enforce the same constraints — but they give clear errors.
  if (!ASSIGNABLE_ROLES.includes(data.role)) {
    throw new Error(`Invalid role "${data.role}".`);
  }
  if (data.role === 'super_admin') {
    throw new Error('Super admin accounts cannot be created from here.');
  }
  if (data.role === 'owner' && !['super_admin','owner'].includes(user.role)) {
    throw new Error('Only an owner or super admin can create an owner account.');
  }
  // An admin may only place staff in stations they themselves belong to.
  if (user.role !== 'super_admin') {
    const mine = user.stationIds || [];
    const bad = (data.stationIds || []).filter(sid => !mine.includes(sid));
    if (bad.length) throw new Error('You can only add employees to your own station.');
  }

  // data: name, phone, role, stationIds, pin
  // For demo, store pinHash as pin; for firebase, the auth password handles it, we don't store pin
  const payload = {
    uid: data.uid || undefined,
    name: data.name,
    phone: data.phone,
    role: data.role,
    stationIds: data.stationIds || [],
    status: data.status || 'active',
    createdBy: user?.uid,
    pinHash: data.pin ? btoa(data.pin) : undefined, // demo only, not plain but obfuscated; real firebase uses auth
  };
  // In Firestore, uid is document id - but our abstraction uses id field
  const doc = await addDocTo('users', { ...payload, id: payload.uid || undefined });
  await logAudit({ stationId: (data.stationIds||[])[0], action: 'EMPLOYEE_CREATED', entityType: 'user', entityId: doc.id, metadata: { name: data.name, role: data.role } });
  return doc;
}

export async function updateEmployee(id, patch) {
  const user = currentUser();
  const target = await getDocById('users', id);
  if (!target) throw new Error('Employee not found');

  const changingPrivileges = ['role','stationIds','status'].some(k => k in patch);

  if (id === user.uid && changingPrivileges) {
    // Self-escalation: previously nothing stopped a manager granting themselves
    // the owner role or adding stations to their own profile.
    throw new Error('You cannot change your own role, station access or status.');
  }
  if (changingPrivileges) assertCanManageUsers(user);

  if ('role' in patch) {
    if (!ASSIGNABLE_ROLES.includes(patch.role)) throw new Error(`Invalid role "${patch.role}".`);
    if (patch.role === 'owner' && !['super_admin','owner'].includes(user.role)) {
      throw new Error('Only an owner or super admin can grant the owner role.');
    }
  }
  if (target.role === 'super_admin' && user.role !== 'super_admin') {
    throw new Error('You cannot modify a super admin account.');
  }
  if ('stationIds' in patch && user.role !== 'super_admin') {
    const mine = user.stationIds || [];
    const bad = (patch.stationIds || []).filter(sid => !mine.includes(sid));
    if (bad.length) throw new Error('You can only assign employees to your own station.');
  }

  const res = await updateDocById('users', id, patch);
  await logAudit({
    stationId: (patch.stationIds||target.stationIds||[])[0],
    action: 'EMPLOYEE_UPDATED', entityType: 'user', entityId: id,
    metadata: { changed: Object.keys(patch), role: patch.role ?? undefined, status: patch.status ?? undefined },
  });
  return res;
}
