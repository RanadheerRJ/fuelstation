import { listDocs, addDocTo, updateDocById, getDocById, logAudit, queryDocs } from './firestoreService.js';
import { getState } from '../state.js';

export async function getEmployees(stationId=null) {
  const all = await listDocs('users');
  if (stationId) return all.filter(u => (u.stationIds||[]).includes(stationId));
  return all;
}

export async function getUserById(uid) { return await getDocById('users', uid); }

export async function createEmployee(data) {
  const { user } = getState();
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
  await logAudit({ userId: user?.uid, stationId: (data.stationIds||[])[0], action: 'EMPLOYEE_CREATED', metadata: { name: data.name, role: data.role } });
  return doc;
}

export async function updateEmployee(id, patch) {
  const { user } = getState();
  const res = await updateDocById('users', id, patch);
  await logAudit({ userId: user?.uid, stationId: (patch.stationIds||[])[0], action: 'EMPLOYEE_UPDATED', metadata: patch });
  return res;
}
