import { listDocs, addDocTo, updateDocById, getDocById, logAudit, queryDocs } from './firestoreService.js';
import { getState } from '../state.js';

export async function getPumps(stationId) {
  return await queryDocs('pumps', p => p.stationId === stationId);
}
export async function getNozzles(stationId) {
  return await queryDocs('nozzles', n => n.stationId === stationId);
}
export async function getNozzlesForPump(pumpId) {
  return await queryDocs('nozzles', n => n.pumpId === pumpId);
}
export async function getNozzleById(id) { return await getDocById('nozzles', id); }

export async function createPump(stationId, data) {
  const { user } = getState();
  const payload = { stationId, name: data.name, number: Number(data.number), status: data.status||'active', createdBy: user?.uid };
  const doc = await addDocTo('pumps', payload);
  await logAudit({ userId: user?.uid, stationId, action: 'PUMP_CREATED', metadata: { pumpName: data.name } });
  return doc;
}
export async function createNozzle(stationId, pumpId, data) {
  const { user } = getState();
  const payload = {
    stationId, pumpId,
    number: Number(data.number),
    fuelType: data.fuelType,
    status: data.status||'active',
    lastReading: Number(data.lastReading)||0,
    createdBy: user?.uid,
  };
  const doc = await addDocTo('nozzles', payload);
  await logAudit({ userId: user?.uid, stationId, action: 'NOZZLE_CREATED', metadata: { pumpId, fuelType: data.fuelType } });
  return doc;
}
export async function updatePump(id, patch) {
  const { user } = getState();
  const res = await updateDocById('pumps', id, patch);
  await logAudit({ userId: user?.uid, stationId: patch.stationId || res?.stationId, action: 'PUMP_UPDATED', metadata: patch });
  return res;
}
export async function updateNozzle(id, patch) {
  const { user } = getState();
  const res = await updateDocById('nozzles', id, patch);
  await logAudit({ userId: user?.uid, stationId: patch.stationId || res?.stationId, action: 'NOZZLE_UPDATED', metadata: patch });
  return res;
}
