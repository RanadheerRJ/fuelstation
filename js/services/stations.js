import { listDocs, addDocTo, updateDocById, getDocById, logAudit, queryDocs } from './firestoreService.js';
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

export async function deleteStation(id) {
  const { user } = getState();
  // Super Admin can delete any, Owner/Admin can delete their own station
  const isSuperAdmin = user?.role === 'super_admin';
  const isOwnerOrAdmin = ['owner','admin'].includes(user?.role);
  
  if (!isSuperAdmin && !isOwnerOrAdmin) throw new Error('Only Super Admin / Owner / Admin can delete stations');
  
  // For non-super-admin, check if station belongs to them
  if (!isSuperAdmin) {
    const all = await listDocs('stations');
    const station = all.find(s => s.id === id);
    if (!station) throw new Error('Station not found');
    const isOwn = station.ownerId === user.uid || (user.stationIds||[]).includes(id);
    if (!isOwn) throw new Error('You can only delete your own station');
  }
  
  // First reset all operational data for this station
  await resetStationData(id);
  
  // Then delete the station itself
  const { getDbInstance, loadFirestoreModule, getIsDemo } = await import('../firebase.js');
  const isDemo = getIsDemo();
  
  if (isDemo) {
    const { getDemoData, setDemoData } = await import('../state.js');
    let data = getDemoData();
    if (data) {
      data.stations = (data.stations||[]).filter(s => s.id !== id);
      setDemoData(data);
    }
  } else {
    const mod = await loadFirestoreModule();
    const db = getDbInstance();
    await mod.deleteDoc(mod.doc(db, 'stations', id));
  }
  
  await logAudit({ userId: user?.uid, stationId: id, action: 'STATION_DELETED', metadata: { stationId: id, by: user.role } });
  return true;
}

export async function resetStationData(stationId) {
  const { getDbInstance, loadFirestoreModule, getIsDemo } = await import('../firebase.js');
  const { user } = getState();
  const isSuperAdmin = user?.role === 'super_admin';
  const isOwnerOrAdmin = ['owner','admin','manager'].includes(user?.role);
  
  // Allow super_admin, owner, admin, manager to reset their station
  if (!isSuperAdmin && !isOwnerOrAdmin) throw new Error('Not allowed to reset');
  
  if (!isSuperAdmin && user) {
    // Check if user has access to this station
    const hasAccess = (user.stationIds||[]).includes(stationId);
    if (!hasAccess && user.role !== 'owner') {
      // For owner, also check if they own it via stations list
      const allStations = await listDocs('stations');
      const station = allStations.find(s => s.id === stationId);
      if (station && station.ownerId !== user.uid) {
        throw new Error('You can only reset your own station');
      }
    }
  }
  
  const isDemo = getIsDemo();
  
  if (isDemo) {
    const { getDemoData, setDemoData } = await import('../state.js');
    let data = getDemoData();
    if (!data) return;
    
    const before = {
      pumps: data.pumps?.length||0,
      nozzles: data.nozzles?.length||0,
      prices: data.prices?.length||0,
      shifts: data.shifts?.length||0,
    };
    
    data.pumps = (data.pumps||[]).filter(p => p.stationId !== stationId);
    data.nozzles = (data.nozzles||[]).filter(n => n.stationId !== stationId);
    data.prices = (data.prices||[]).filter(p => p.stationId !== stationId);
    data.shifts = (data.shifts||[]).filter(s => s.stationId !== stationId);
    data.transactions = (data.transactions||[]).filter(t => t.stationId !== stationId);
    data.notes = (data.notes||[]).filter(n => n.stationId !== stationId);
    data.auditLogs = (data.auditLogs||[]).filter(a => a.stationId !== stationId);
    data.assignments = (data.assignments||[]).filter(a => a.stationId !== stationId);
    
    setDemoData(data);
    console.log(`[Reset Station ${stationId}] Deleted: pumps ${before.pumps}->${data.pumps.length}, nozzles ${before.nozzles}->${data.nozzles.length}, prices ${before.prices}->${data.prices.length}, shifts ${before.shifts}->${data.shifts.length}`);
  } else {
    const mod = await loadFirestoreModule();
    const db = getDbInstance();
    const collections = ['pumps','nozzles','prices','shifts','transactions','notes','auditLogs','assignments'];
    
    for (const coll of collections) {
      const docs = await queryDocs(coll, d => d.stationId === stationId);
      console.log(`[Reset Station ${stationId}] Deleting ${docs.length} docs from ${coll}`);
      for (const doc of docs) {
        try {
          await mod.deleteDoc(mod.doc(db, coll, doc.id));
        } catch(e){ console.warn(`Failed to delete ${coll}/${doc.id}`, e); }
      }
    }
  }
  
  await logAudit({ userId: user?.uid, stationId, action: 'STATION_DATA_RESET', metadata: { stationId, by: user?.role } });
}
