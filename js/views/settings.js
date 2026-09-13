import { getState, clearDemoData } from '../state.js';
import { logout } from '../auth.js';
import { getFirebaseStatus } from '../firebase.js';
import { getStationsForCurrentUser } from '../services/stations.js';

export async function settingsView({ root }) {
  const { user, currentStationId } = getState();
  const { isDemo } = getFirebaseStatus();
  const stations = await getStationsForCurrentUser();
  const currentStation = stations.find(s => s.id === currentStationId) || stations[0];

  root.innerHTML = `
    <div class="container">
      <h1 class="page-title">Settings</h1>
      <p class="page-sub">${user?.name} • ${user?.role} • ${isDemo ? 'Local DB' : 'Firebase Live'}</p>

      <div class="neu-card" style="margin-top:16px">
        <h3 style="font-weight:700">Profile</h3>
        <div style="margin-top:12px">
          <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:0.5px solid var(--border)"><span style="color:var(--text-secondary);font-size:14px">Name</span><span style="font-weight:600;font-size:14px">${user?.name||''}</span></div>
          <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:0.5px solid var(--border)"><span style="color:var(--text-secondary);font-size:14px">Phone</span><span style="font-weight:600;font-size:14px">${user?.phone||''}</span></div>
          <div style="display:flex;justify-content:space-between;padding:10px 0"><span style="color:var(--text-secondary);font-size:14px">Role</span><span><span class="badge badge--info">${user?.role||''}</span></span></div>
        </div>
      </div>

      <div class="neu-card" style="margin-top:16px">
        <h3 style="font-weight:700">Quick Navigation</h3>
        <div class="grid grid-2" style="margin-top:14px">
          <button class="neu-btn neu-btn--small" onclick="location.hash='#/stations'">⛽ Stations</button>
          <button class="neu-btn neu-btn--small" onclick="location.hash='#/pumps'">🔧 Pumps & Nozzles</button>
          <button class="neu-btn neu-btn--small" onclick="location.hash='#/employees'">👥 Employees</button>
          <button class="neu-btn neu-btn--small" onclick="location.hash='#/prices'">💰 Fuel Prices</button>
          <button class="neu-btn neu-btn--small" onclick="location.hash='#/shifts'">🧾 Shifts</button>
          <button class="neu-btn neu-btn--small" onclick="location.hash='#/shifts/start'">▶️ Start Shift</button>
          <button class="neu-btn neu-btn--small" onclick="location.hash='#/reports'">📊 Reports</button>
          <button class="neu-btn neu-btn--small" onclick="location.hash='#/reports/audit'">📜 Audit Log</button>
          ${user.role==='super_admin' ? `<button class="neu-btn neu-btn--small" style="background:var(--primary-light);color:var(--primary)" onclick="location.hash='#/super-admin'">👑 Invite Owners</button>` : ''}
        </div>
      </div>

      <div class="neu-card" style="margin-top:16px">
        <h3 style="font-weight:700">Danger Zone</h3>
        <p style="font-size:12px;color:var(--text-secondary);margin-top:6px">Reset will permanently delete station operational data. Cannot be undone.</p>
        
        <div style="margin-top:16px;display:flex;flex-direction:column;gap:12px">
          ${currentStation ? `
            <div style="padding:12px;background:var(--bg);border-radius:10px;border:0.5px solid var(--border)">
              <div style="font-weight:600;font-size:13px">Current Station: ${currentStation.name}</div>
              <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">Will delete: pumps, nozzles, prices, shifts, credits, expenses, notes for this station</div>
            </div>
            <button id="resetStationBtn" class="neu-btn neu-btn--small" style="background:#fff1f0;color:var(--danger);border:0.5px solid #ffccc7">🗑️ Reset Current Station Data</button>
          ` : `<p style="font-size:12px;color:var(--text-secondary)">No station selected</p>`}
          
          ${user.role==='super_admin' ? `
            <div style="height:0.5px;background:var(--border);margin:8px 0"></div>
            <button id="resetAllBtn" class="neu-btn neu-btn--small" style="background:var(--danger);color:white;border:none">⚠️ Reset ALL Stations & Data (Super Admin)</button>
            <p style="font-size:10px;color:var(--text-tertiary);text-align:center">Deletes ALL stations, pumps, nozzles, prices, shifts, transactions, notes, audit logs (keeps users)</p>
            
            <button id="resetEverythingBtn" class="neu-btn neu-btn--small" style="background:#1d1d1f;color:white;border:none">💥 Reset Everything (Wipe DB)</button>
            <p style="font-size:10px;color:var(--text-tertiary);text-align:center">Deletes EVERYTHING including users. You will need to create Super Admin again via #/dev-setup</p>
          ` : ''}
        </div>
      </div>

      <div class="neu-card" style="margin-top:16px">
        <h3 style="font-weight:700">Refresh & Cache</h3>
        <div class="grid" style="margin-top:12px;gap:12px">
          <button id="refreshBtn" class="neu-btn neu-btn--small">↻ Refresh Data</button>
          <button id="clearCacheBtn" class="neu-btn neu-btn--small">🧹 Clear Cache & Reload</button>
          <div style="display:flex;gap:8px;align-items:center;padding:8px;background:var(--bg);border-radius:8px">
            <span style="font-size:11px;color:var(--text-secondary)">Floating ↻ button is draggable — drag to adjust its position. Position saved automatically.</span>
          </div>
        </div>
      </div>

      <div class="neu-card" style="margin-top:16px">
        <h3 style="font-weight:700">App Info</h3>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:8px;line-height:1.5">
          <p>FuelOps • iOS Clean • Simple • Invite Only</p>
          <p style="margin-top:4px">Mode: <b>${isDemo ? 'Local Storage (Demo)' : 'Firebase Firestore Live'}</b></p>
          <p style="margin-top:4px">Station: ${currentStation?.name || 'None'} • Role: ${user?.role}</p>
          <p style="margin-top:4px">Build: v13 • 10-digit phone + PIN, no country code</p>
        </div>
      </div>

      <div style="margin-top:20px">
        <button id="logoutBtn" class="neu-btn neu-btn--primary neu-btn--block">Logout</button>
      </div>
    </div>
  `;

  root.querySelector('#logoutBtn').addEventListener('click', async ()=>{
    await logout();
    location.hash = '#/login';
  });

  root.querySelector('#refreshBtn')?.addEventListener('click', ()=>{
    location.reload();
  });

  root.querySelector('#clearCacheBtn')?.addEventListener('click', async ()=>{
    if (confirm('Clear cache and reload? This will clear service worker cache.')) {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k=>caches.delete(k)));
      }
      localStorage.removeItem('fuelops_refresh_pos');
      location.reload();
    }
  });

  root.querySelector('#resetStationBtn')?.addEventListener('click', async ()=>{
    if (!currentStation) return alert('No station selected');
    const confirm1 = confirm(`Reset ALL data for station "${currentStation.name}"?\n\nThis will delete:\n- Pumps\n- Nozzles\n- Prices\n- Shifts\n- Credits & Expenses\n- Notes\n\nCannot be undone!`);
    if (!confirm1) return;
    const confirm2 = prompt(`Type station name "${currentStation.name}" to confirm:`);
    if (confirm2 !== currentStation.name) return alert('Station name did not match, cancelled.');

    try {
      await resetStationData(currentStation.id, isDemo);
      alert(`✅ Station "${currentStation.name}" data reset!`);
      location.reload();
    } catch(e){
      alert('Reset failed: ' + e.message);
    }
  });

  root.querySelector('#resetAllBtn')?.addEventListener('click', async ()=>{
    const confirm1 = confirm(`⚠️ SUPER ADMIN: Reset ALL stations and operational data?\n\nDeletes:\n- All stations\n- All pumps & nozzles\n- All prices\n- All shifts\n- All transactions\n- All notes & audit logs\n\nKeeps: Users (so you stay super_admin)\n\nCannot be undone!`);
    if (!confirm1) return;
    const confirm2 = prompt(`Type "RESET ALL" to confirm:`);
    if (confirm2 !== 'RESET ALL') return alert('Cancelled');

    try {
      await resetAllStationsData(isDemo);
      alert('✅ All stations data reset! Users kept.');
      location.reload();
    } catch(e){
      alert('Reset failed: ' + e.message);
    }
  });

  root.querySelector('#resetEverythingBtn')?.addEventListener('click', async ()=>{
    const confirm1 = confirm(`💥 SUPER ADMIN: WIPE EVERYTHING?\n\nDeletes EVERYTHING:\n- All stations\n- All pumps/nozzles/prices\n- All shifts/transactions\n- All users (including you)\n- All notes/audit logs\n\nYou will need to create Super Admin again via #/dev-setup with key FUELDEV2024\n\nCannot be undone!`);
    if (!confirm1) return;
    const confirm2 = prompt(`Type "WIPE EVERYTHING" to confirm:`);
    if (confirm2 !== 'WIPE EVERYTHING') return alert('Cancelled');

    try {
      await resetEverything(isDemo);
      alert('💥 Everything wiped! Redirecting to Super Admin setup...');
      const { clearState } = await import('../state.js');
      clearState();
      clearDemoData();
      location.hash = '#/dev-setup';
      setTimeout(()=> location.reload(), 500);
    } catch(e){
      alert('Wipe failed: ' + e.message);
    }
  });
}

async function resetStationData(stationId, isDemo) {
  if (isDemo) {
    const { getDemoData, setDemoData } = await import('../state.js');
    let data = getDemoData();
    if (!data) return;
    
    // Delete all collections for this station
    data.pumps = (data.pumps||[]).filter(p => p.stationId !== stationId);
    data.nozzles = (data.nozzles||[]).filter(n => n.stationId !== stationId);
    data.prices = (data.prices||[]).filter(p => p.stationId !== stationId);
    data.shifts = (data.shifts||[]).filter(s => s.stationId !== stationId);
    data.transactions = (data.transactions||[]).filter(t => t.stationId !== stationId);
    data.notes = (data.notes||[]).filter(n => n.stationId !== stationId);
    data.auditLogs = (data.auditLogs||[]).filter(a => a.stationId !== stationId);
    data.assignments = (data.assignments||[]).filter(a => a.stationId !== stationId);
    
    setDemoData(data);
    console.log('[Reset] Station data cleared for:', stationId);
  } else {
    // Firebase real - delete Firestore docs
    const { getDbInstance, loadFirestoreModule } = await import('../firebase.js');
    const { queryDocs } = await import('../services/firestoreService.js');
    const mod = await loadFirestoreModule();
    const db = getDbInstance();
    
    const collections = ['pumps','nozzles','prices','shifts','transactions','notes','auditLogs','assignments'];
    
    for (const coll of collections) {
      const docs = await queryDocs(coll, d => d.stationId === stationId);
      console.log(`[Reset] Deleting ${docs.length} docs from ${coll}`);
      for (const doc of docs) {
        try {
          await mod.deleteDoc(mod.doc(db, coll, doc.id));
        } catch(e){ console.warn(`Failed to delete ${coll}/${doc.id}`, e); }
      }
    }
  }
}

async function resetAllStationsData(isDemo) {
  if (isDemo) {
    const { getDemoData, setDemoData } = await import('../state.js');
    let data = getDemoData();
    if (!data) return;
    
    data.stations = [];
    data.pumps = [];
    data.nozzles = [];
    data.prices = [];
    data.shifts = [];
    data.transactions = [];
    data.notes = [];
    data.auditLogs = [];
    data.assignments = [];
    
    setDemoData(data);
  } else {
    const { getDbInstance, loadFirestoreModule } = await import('../firebase.js');
    const { listDocs } = await import('../services/firestoreService.js');
    const mod = await loadFirestoreModule();
    const db = getDbInstance();
    
    const collections = ['stations','pumps','nozzles','prices','shifts','transactions','notes','auditLogs','assignments'];
    
    for (const coll of collections) {
      const docs = await listDocs(coll);
      console.log(`[Reset All] Deleting ${docs.length} from ${coll}`);
      for (const doc of docs) {
        try {
          await mod.deleteDoc(mod.doc(db, coll, doc.id));
        } catch(e){ console.warn(`Failed ${coll}/${doc.id}`, e); }
      }
    }
  }
}

async function resetEverything(isDemo) {
  if (isDemo) {
    const { clearDemoData } = await import('../state.js');
    clearDemoData();
    localStorage.removeItem('fuelops_refresh_pos');
  } else {
    const { getDbInstance, loadFirestoreModule } = await import('../firebase.js');
    const { listDocs } = await import('../services/firestoreService.js');
    const mod = await loadFirestoreModule();
    const db = getDbInstance();
    
    const collections = ['stations','pumps','nozzles','prices','shifts','transactions','notes','auditLogs','assignments','users'];
    
    for (const coll of collections) {
      const docs = await listDocs(coll);
      console.log(`[Wipe] Deleting ${docs.length} from ${coll}`);
      for (const doc of docs) {
        try {
          const docId = doc.id || doc.uid;
          await mod.deleteDoc(mod.doc(db, coll, docId));
        } catch(e){ console.warn(`Failed ${coll}`, e); }
      }
    }
    
    // Also delete Auth users? Can't delete other auth users from client, only own. So we keep auth but firestore users wiped.
    // For full wipe, super admin will need to manually delete auth users in console, or we clear local state
  }
}
