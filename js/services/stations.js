import { listDocs, addDocTo, updateDocById, getDocById, logAudit, queryDocs, whereStation } from './firestoreService.js';
import { getState } from '../state.js';
import { getIsDemo } from '../firebase.js';

export async function getStationsForCurrentUser() {
  const { user } = getState();
  if (!user) return [];

  let stations;
  if (getIsDemo() || user.role === 'super_admin') {
    stations = await listDocs('stations');
  } else {
    // Fetch assigned station documents individually so a list request can never
    // expand beyond the station IDs protected in the caller's profile.
    const assigned = (await Promise.all(
      (user.stationIds || []).map(id => getDocById('stations', id)),
    )).filter(Boolean);

    if (user.role === 'owner') {
      const owned = await listDocs('stations', [
        { field: 'ownerId', op: '==', value: user.uid },
      ]);
      stations = [...new Map([...assigned, ...owned].map(item => [item.id, item])).values()];
    } else {
      stations = assigned;
    }
  }

  // Cache for topbar
  try { localStorage.setItem('fuelops_stations_cache', JSON.stringify(stations.map(s=>({id:s.id,name:s.name})))); } catch {}
  return stations;
}

export async function getAllStations() {
  const { user } = getState();
  return user?.role === 'super_admin' || getIsDemo()
    ? listDocs('stations')
    : getStationsForCurrentUser();
}

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

/**
 * Resolve destructive-operation authority for a station.
 *
 * Ownership is proven ONLY by the station document's ownerId matching the
 * authenticated UID. The caller's profile stationIds array is deliberately
 * NOT consulted: it is a role/assignment hint that a compromised or stale
 * session could carry entries for stations the user does not own, so trusting
 * it here would let a polluted array authorize deletes/resets across tenants.
 */
async function assertStationOwnership(stationId, action) {
  const { user } = getState();
  if (!user) throw new Error('You must be signed in to perform this action');
  if (user.role === 'super_admin') return true;
  if (user.role !== 'owner') throw new Error(`Only Station Owner can ${action}`);

  const station = await getDocById('stations', stationId);
  if (!station) throw new Error('Station not found');
  if (station.ownerId !== user.uid) {
    throw new Error(`You can only ${action} your own station`);
  }
  return true;
}

export async function deleteStation(id) {
  await assertStationOwnership(id, 'delete');

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

  await assertStationOwnership(stationId, 'reset data for');

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
      const docs = await queryDocs(coll, d => d.stationId === stationId, whereStation(stationId));
      console.log(`[Reset Station ${stationId}] Deleting ${docs.length} docs from ${coll}`);
      for (const doc of docs) {
        try {
          await mod.deleteDoc(mod.doc(db, coll, doc.id));
        } catch(e){ console.warn(`Failed to delete ${coll}/${doc.id}`, e); }
      }
    }
  }
}
