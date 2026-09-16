import { listDocs, addDocTo, updateDocById, getDocById, deleteDocById, logAudit, queryDocs, whereStation } from './firestoreService.js';
import { getState } from '../state.js';

export async function getPumps(stationId) {
  return await queryDocs('pumps', p => p.stationId === stationId, whereStation(stationId));
}
export async function getNozzles(stationId) {
  return await queryDocs('nozzles', n => n.stationId === stationId, whereStation(stationId));
}
export async function getNozzlesForPump(pumpId, stationId) {
  return await queryDocs('nozzles', n => n.pumpId === pumpId, whereStation(stationId));
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

export async function deletePump(id) {
  const { user } = getState();
  // Graceful checks: cannot delete if occupied by active shift
  const pump = await getDocById('pumps', id);
  if (!pump) throw new Error('Pump not found');
  
  // Check active shifts using this pump
  const activeShifts = await queryDocs(
    'shifts',
    s => s.stationId === pump.stationId && s.status === 'ACTIVE',
    whereStation(pump.stationId),
  );
  for (const sh of activeShifts) {
    if ((sh.nozzles||[]).some(n => n.pumpId === id)) {
      throw new Error(`Cannot delete: Pump is busy — ${sh.employeeName} is working on it (active shift). Wait until shift ends.`);
    }
  }

  // Check nozzles
  const pumpNozzles = await getNozzlesForPump(id, pump.stationId);
  if (pumpNozzles.length > 0) {
    // Check if any nozzle has active shift (already checked above, but double)
    // Allow deletion but also delete its nozzles gracefully if not in active shift
    const hasActiveNozzle = activeShifts.some(sh => (sh.nozzles||[]).some(n => pumpNozzles.some(pn => pn.id === n.nozzleId)));
    if (hasActiveNozzle) {
      throw new Error('Cannot delete: One of its nozzles is in active shift');
    }
    // Delete its nozzles first (graceful cleanup)
    for (const nz of pumpNozzles) {
      await deleteDocById('nozzles', nz.id);
    }
  }

  await deleteDocById('pumps', id);
  await logAudit({ userId: user?.uid, stationId: pump.stationId, action: 'PUMP_DELETED', metadata: { pumpId: id, pumpName: pump.name } });
  return true;
}

export async function deleteNozzle(id) {
  const { user } = getState();
  const nozzle = await getDocById('nozzles', id);
  if (!nozzle) throw new Error('Nozzle not found');

  // Check active shifts
  const activeShifts = await queryDocs(
    'shifts',
    s => s.stationId === nozzle.stationId && s.status === 'ACTIVE',
    whereStation(nozzle.stationId),
  );
  for (const sh of activeShifts) {
    if ((sh.nozzles||[]).some(n => n.nozzleId === id)) {
      throw new Error(`Cannot delete: Nozzle is in active shift by ${sh.employeeName}. Wait until shift ends.`);
    }
  }

  // Graceful: allow deletion even if has history, but warn in UI (service allows)
  // If nozzle has past shifts, we keep history but nozzle itself can be deleted (readings remain in old shifts)
  await deleteDocById('nozzles', id);
  await logAudit({ userId: user?.uid, stationId: nozzle.stationId, action: 'NOZZLE_DELETED', metadata: { nozzleId: id, pumpId: nozzle.pumpId } });
  return true;
}
