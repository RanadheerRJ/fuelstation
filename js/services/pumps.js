import { listDocs, addDocTo, updateDocById, getDocById, deleteDocById, logAudit, queryDocs } from './firestoreService.js';
import { getState } from '../state.js';
import { parseReadingInput } from './money.js';

// Equipment changes are a manager+ action: adding a nozzle or editing a meter
// reading directly changes what an attendant is held accountable for.
const EQUIPMENT_ROLES = ['super_admin', 'owner', 'admin', 'manager'];

function assertCanManageEquipment(stationId) {
  const { user } = getState();
  if (!user?.uid) throw new Error('You are not signed in.');
  if (!EQUIPMENT_ROLES.includes(user.role)) {
    throw new Error('Only a manager, admin or owner can change pumps and nozzles.');
  }
  if (user.role !== 'super_admin' && stationId && !(user.stationIds || []).includes(stationId)) {
    throw new Error('You do not have access to this station.');
  }
  return user;
}

export async function getPumps(stationId) {
  return await queryDocs('pumps', null, [{ field: 'stationId', op: '==', value: stationId }]);
}
export async function getNozzles(stationId) {
  return await queryDocs('nozzles', null, [{ field: 'stationId', op: '==', value: stationId }]);
}
export async function getNozzlesForPump(pumpId) {
  return await queryDocs('nozzles', null, [{ field: 'pumpId', op: '==', value: pumpId }]);
}
export async function getNozzleById(id) { return await getDocById('nozzles', id); }

export async function createPump(stationId, data) {
  const user = assertCanManageEquipment(stationId);
  const payload = { stationId, name: data.name, number: Number(data.number), status: data.status||'active', createdBy: user?.uid };
  const doc = await addDocTo('pumps', payload);
  await logAudit({ userId: user?.uid, stationId, action: 'PUMP_CREATED', metadata: { pumpName: data.name } });
  return doc;
}
export async function createNozzle(stationId, pumpId, data) {
  const user = assertCanManageEquipment(stationId);
  const lr = parseReadingInput(data.lastReading ?? 0, { label: 'Initial meter reading', required: false });
  if (!lr.ok) throw new Error(lr.error);
  const payload = {
    stationId, pumpId,
    number: Number(data.number),
    fuelType: data.fuelType,
    status: data.status||'active',
    lastReading: lr.value ?? 0,
    createdBy: user?.uid,
  };
  const doc = await addDocTo('nozzles', payload);
  await logAudit({ userId: user?.uid, stationId, action: 'NOZZLE_CREATED', metadata: { pumpId, fuelType: data.fuelType } });
  return doc;
}
export async function updatePump(id, patch) {
  const existing = await getDocById('pumps', id);
  if (!existing) throw new Error('Pump not found');
  const user = assertCanManageEquipment(existing.stationId);
  const res = await updateDocById('pumps', id, patch);
  await logAudit({ userId: user?.uid, stationId: patch.stationId || res?.stationId, action: 'PUMP_UPDATED', metadata: patch });
  return res;
}
export async function updateNozzle(id, patch) {
  const { user } = getState();
  const existing = await getDocById('nozzles', id);
  if (!existing) throw new Error('Nozzle not found');

  // closeShift bumps lastReading on behalf of the attendant, so that single
  // field stays allowed. Anything else (fuel type, pump, station) is manager+,
  // because changing it would silently re-price historical sales.
  const keys = Object.keys(patch);
  const onlyReading = keys.length > 0 && keys.every(k => k === 'lastReading');
  if (!onlyReading) assertCanManageEquipment(existing.stationId);
  if ('lastReading' in patch) {
    const r = parseReadingInput(patch.lastReading, { label: 'Meter reading' });
    if (!r.ok) throw new Error(r.error);
    patch = { ...patch, lastReading: r.value };
  }

  const res = await updateDocById('nozzles', id, patch);
  await logAudit({ userId: user?.uid, stationId: patch.stationId || res?.stationId, action: 'NOZZLE_UPDATED', metadata: patch });
  return res;
}

export async function deletePump(id) {
  const pump = await getDocById('pumps', id);
  if (!pump) throw new Error('Pump not found');
  const user = assertCanManageEquipment(pump.stationId);
  
  // Check active shifts using this pump
  const activeShifts = await queryDocs('shifts', null, [{ field: 'stationId', op: '==', value: pump.stationId }, { field: 'status', op: '==', value: 'ACTIVE' }]);
  for (const sh of activeShifts) {
    if ((sh.nozzles||[]).some(n => n.pumpId === id)) {
      throw new Error(`Cannot delete: Pump is busy — ${sh.employeeName} is working on it (active shift). Wait until shift ends.`);
    }
  }

  // Check nozzles
  const pumpNozzles = await getNozzlesForPump(id);
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
  const nozzle = await getDocById('nozzles', id);
  if (!nozzle) throw new Error('Nozzle not found');
  const user = assertCanManageEquipment(nozzle.stationId);

  // Check active shifts
  const activeShifts = await queryDocs('shifts', null, [{ field: 'stationId', op: '==', value: nozzle.stationId }, { field: 'status', op: '==', value: 'ACTIVE' }]);
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
