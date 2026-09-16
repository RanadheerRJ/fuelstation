import { listDocs, addDocTo, updateDocById, getDocById, logAudit } from './firestoreService.js';
import { getState } from '../state.js';
import { getIsDemo } from '../firebase.js';

/**
 * Resolve the station IDs this caller can actually use for staff-directory
 * work. An owner's profile stationIds is deliberately never used as proof of
 * ownership: it can be stale or polluted. Owner scope comes from the station
 * documents' ownerId instead.
 */
async function getVerifiedStationIds(user) {
  const claimedIds = [...new Set((user.stationIds || []).filter(id => typeof id === 'string' && id))];

  if (user.role === 'owner') {
    const stations = getIsDemo()
      ? await listDocs('stations')
      : await listDocs('stations', [{ field: 'ownerId', op: '==', value: user.uid }]);
    return stations
      .filter(station => station.ownerId === user.uid)
      .map(station => station.id);
  }

  // Managers and admins remain assignment-scoped. Resolve each claimed
  // assignment to a readable station document before using it in a query.
  if (user.role === 'manager' || user.role === 'admin') {
    if (getIsDemo()) {
      const stations = await listDocs('stations');
      const stationSet = new Set(stations.map(station => station.id));
      return claimedIds.filter(id => stationSet.has(id));
    }

    const stations = await Promise.all(claimedIds.map(async id => {
      try { return await getDocById('stations', id); } catch { return null; }
    }));
    return stations.filter(Boolean).map(station => station.id);
  }

  return [];
}

export async function getEmployees(stationId=null) {
  const { user } = getState();
  if (!user) return [];

  if (user.role === 'super_admin') return listDocs('users');
  if (user.role === 'attendant') {
    const self = await getDocById('users', user.uid);
    return self && (!stationId || (self.stationIds || []).includes(stationId)) ? [self] : [];
  }

  const verifiedStationIds = await getVerifiedStationIds(user);
  const requestedStationIds = stationId
    ? (verifiedStationIds.includes(stationId) ? [stationId] : [])
    : verifiedStationIds;
  if (!requestedStationIds.length) return [];

  if (getIsDemo()) {
    const allowedStationIds = new Set(requestedStationIds);
    const all = await listDocs('users');
    return all.filter(employee => {
      const employeeStationIds = employee.stationIds || [];
      // Match the rules' intentional fail-closed limit for owner directory
      // access: owner authority can be proven only for a single assignment.
      if (user.role === 'owner') {
        return employeeStationIds.length === 1 && allowedStationIds.has(employeeStationIds[0]);
      }
      return employeeStationIds.some(id => allowedStationIds.has(id));
    });
  }

  // Rules can prove directory access only when the query fixes the complete
  // target stationIds array. Build those constraints from verified station
  // documents, not from user.stationIds. Managers/admins retain their
  // assignment-scoped full-set query; owners use single-station lookups so the
  // ownerId model remains the sole source of tenant authority.
  const assignments = user.role === 'owner'
    ? requestedStationIds.map(id => [id])
    : stationId
      ? [[stationId], ...(verifiedStationIds.length > 1 ? [verifiedStationIds] : [])]
      : requestedStationIds.map(id => [id]).concat(verifiedStationIds.length > 1 ? [verifiedStationIds] : []);
  const uniqueAssignments = [...new Map(
    assignments.map(ids => [JSON.stringify(ids), ids]),
  ).values()];
  const batches = await Promise.all(uniqueAssignments.map(stationIds => listDocs('users', [
    { field: 'stationIds', op: '==', value: stationIds },
  ])));
  const allowedStationIds = new Set(requestedStationIds);
  return [...new Map(batches.flat().map(item => [item.id, item])).values()]
    .filter(item => (item.stationIds || []).some(id => allowedStationIds.has(id)));
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
