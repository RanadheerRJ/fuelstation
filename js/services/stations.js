import { listDocs, addDocTo, updateDocById, getDocById, logAudit, queryDocs } from './firestoreService.js';
import { getState } from '../state.js';

export async function getStationsForCurrentUser() {
  const { user } = getState();
  if (!user) return [];
  const all = await listDocs('stations');
  // Cache for topbar
  try { localStorage.setItem('fuelops_stations_cache', JSON.stringify(all.map(s=>({id:s.id,name:s.name})))); } catch {}
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
  const isSuperAdmin = user?.role === 'super_admin';
  const isOwner = user?.role === 'owner';
  
  // Only Station Owner and Super Admin can delete
  if (!isSuperAdmin && !isOwner) throw new Error('Only Station Owner can delete stations');
  
  // For owner, check if station belongs to them
  if (isOwner && !isSuperAdmin) {
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
  
  // Audit log removed - no longer logging
  return true;
}

export async function resetStationData(stationId) {
  const { getDbInstance, loadFirestoreModule, getIsDemo } = await import('../firebase.js');
  const { user } = getState();
  const isSuperAdmin = user?.role === 'super_admin';
  const isOwner = user?.role === 'owner';
  
  // Only Station Owner and Super Admin can reset
  if (!isSuperAdmin && !isOwner) throw new Error('Only Station Owner can reset data');
  
  if (isOwner && !isSuperAdmin && user) {
    const hasAccess = (user.stationIds||[]).includes(stationId);
    if (!hasAccess) {
      const allStations = await listDocs('stations');
      const station = allStations.find(s => s.id === stationId);
      if (!station || station.ownerId !== user.uid) {
        throw new Error('You can only reset your own station');
      }
    }
  }
  
  const isDemo = getIsDemo();
  
  if (isDemo) {
    const { getDemoData, setDemoData } = await import('../state.js');
    let data = getDemoData();
    if (!data) return;
    
    data.pumps = (data.pumps||[]).filter(p => p.stationId !== stationId);
    data.nozzles = (data.nozzles||[]).filter(n => n.stationId !== stationId);
    data.prices = (data.prices||[]).filter(p => p.stationId !== stationId);
    data.shifts = (data.shifts||[]).filter(s => s.stationId !== stationId);
    data.transactions = (data.transactions||[]).filter(t => t.stationId !== stationId);
    data.notes = (data.notes||[]).filter(n => n.stationId !== stationId);
    data.assignments = (data.assignments||[]).filter(a => a.stationId !== stationId);
    
    setDemoData(data);
    console.log(`[Reset Station ${stationId}] Owner reset completed`);
  } else {
    const mod = await loadFirestoreModule();
    const db = getDbInstance();
    const collections = ['pumps','nozzles','prices','shifts','transactions','notes','assignments'];
    
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
}
