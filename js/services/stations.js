import { listDocs, addDocTo, updateDocById, getDocById, logAudit } from './firestoreService.js';
import { getState } from '../state.js';

export async function getStationsForCurrentUser() {
  const { user } = getState();
  if (!user) return [];
  const all = await listDocs('stations');
  if (user.role === 'super_admin') {
    return all; // super admin sees all
  }
  if (user.role === 'owner') {
    return all.filter(s => s.ownerId === user.uid || (user.stationIds||[]).includes(s.id));
  }
  return all.filter(s => (user.stationIds||[]).includes(s.id));
}

export async function getAllStations() { return await listDocs('stations'); }

export async function createStation(data) {
  const { user } = getState();
  const payload = {
    name: data.name,
    address: data.address,
    phone: data.phone || '',
    status: data.status || 'active',
    managerId: data.managerId || null,
    ownerId: user?.uid || data.ownerId,
    createdBy: user?.uid,
  };
  const doc = await addDocTo('stations', payload);
  await logAudit({ userId: user?.uid, stationId: doc.id, action: 'STATION_CREATED', metadata: { name: data.name } });
  return doc;
}

export async function updateStation(id, patch) {
  const { user } = getState();
  const res = await updateDocById('stations', id, patch);
  await logAudit({ userId: user?.uid, stationId: id, action: 'STATION_UPDATED', metadata: patch });
  return res;
}

export async function getStationById(id) { return await getDocById('stations', id); }
