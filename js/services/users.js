import { listDocs, addDocTo, updateDocById, getDocById, logAudit, queryDocs } from './firestoreService.js';
import { getState } from '../state.js';
import { getIsDemo } from '../firebase.js';

export async function getEmployees(stationId=null) {
  const { user } = getState();
  if (!user) return [];

  if (getIsDemo()) {
    const all = await listDocs('users');
    return stationId ? all.filter(u => (u.stationIds||[]).includes(stationId)) : all;
  }
  if (user.role === 'super_admin') return listDocs('users');
  if (user.role === 'attendant') {
    const self = await getDocById('users', user.uid);
    return self && (!stationId || (self.stationIds || []).includes(stationId)) ? [self] : [];
  }

  // Rules can prove array membership only when the query fixes the complete
  // stationIds array. Query the common single-station assignment plus the
  // caller's own assignment set, then merge duplicates.
  const assignments = stationId
    ? [[stationId], ...(user.stationIds?.includes(stationId) ? [user.stationIds] : [])]
    : (user.stationIds || []).map(id => [id]).concat([user.stationIds || []]);
  const uniqueAssignments = [...new Map(
    assignments.filter(ids => ids.length).map(ids => [JSON.stringify(ids), ids]),
  ).values()];
  const batches = await Promise.all(uniqueAssignments.map(stationIds => listDocs('users', [
    { field: 'stationIds', op: '==', value: stationIds },
  ])));
  return [...new Map(batches.flat().map(item => [item.id, item])).values()]
    .filter(item => !stationId || (item.stationIds || []).includes(stationId));
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
