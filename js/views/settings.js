import { getState, setState, clearDemoData } from '../state.js';
import { logout } from '../auth.js';
import { getFirebaseStatus } from '../firebase.js';
import { getStationsForCurrentUser, resetStationData as resetStationDataService, deleteStation } from '../services/stations.js';

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
        <h3 style="font-weight:700">Danger Zone ${user.role==='super_admin' ? '• Super Admin' : ''}</h3>
        <p style="font-size:12px;color:var(--text-secondary);margin-top:6px">Reset deletes operational data. Delete removes station itself. Cannot be undone. Super Admin powers enabled.</p>
        
        <div style="margin-top:16px;display:flex;flex-direction:column;gap:12px">
          ${currentStation ? `
            <div style="padding:12px;background:var(--bg);border-radius:10px;border:0.5px solid var(--border)">
              <div style="font-weight:600;font-size:13px">Current Station: ${currentStation.name}</div>
              <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">ID: ${currentStation.id.slice(0,8)} • ${currentStation.address||''}</div>
              <div style="font-size:11px;color:var(--text-secondary);margin-top:4px">Reset deletes: pumps, nozzles, prices, shifts, credits, expenses, notes (keeps station)</div>
            </div>
            <button id="resetStationBtn" class="neu-btn neu-btn--small" style="background:#fffbe6;border:0.5px solid #ffe58f;color:#ad6800">🗑️ Reset Current Station Data</button>
            ${user.role==='super_admin' ? `
              <button id="deleteStationBtn" class="neu-btn neu-btn--small" style="background:#fff1f0;color:var(--danger);border:0.5px solid #ffccc7">❌ Delete Current Station (Super Admin)</button>
              <p style="font-size:10px;color:var(--text-tertiary);text-align:center">Delete removes station + all its data permanently</p>
            ` : ''}
          ` : `<p style="font-size:12px;color:var(--text-secondary)">No station selected — go to Stations and Select one</p>`}
          
          ${user.role==='super_admin' ? `
            <div style="height:0.5px;background:var(--border);margin:8px 0"></div>
            <div style="font-weight:600;font-size:13px;margin-bottom:4px">Super Admin — All Stations</div>
            <button id="resetAllBtn" class="neu-btn neu-btn--small" style="background:var(--danger);color:white;border:none">⚠️ Reset ALL Stations Data (Keep Stations)</button>
            <p style="font-size:10px;color:var(--text-tertiary);text-align:center">Deletes pumps, nozzles, prices, shifts, transactions, notes for ALL stations (keeps stations & users)</p>
            
            <button id="deleteAllStationsBtn" class="neu-btn neu-btn--small" style="background:#ff4d4f;color:white;border:none">🗑️ Delete ALL Stations (Super Admin)</button>
            <p style="font-size:10px;color:var(--text-tertiary);text-align:center">Deletes ALL stations + all operational data (keeps users)</p>

            <button id="resetEverythingBtn" class="neu-btn neu-btn--small" style="background:#1d1d1f;color:white;border:none">💥 Reset Everything (Wipe DB)</button>
            <p style="font-size:10px;color:var(--text-tertiary);text-align:center">Deletes EVERYTHING including users. Need to create Super Admin via #/dev-setup again</p>
          ` : ''}
        </div>
      </div>

      <div class="neu-card" style="margin-top:16px">
        <h3 style="font-weight:700">Refresh & Cache</h3>
        <div class="grid" style="margin-top:12px;gap:12px">
          <button id="refreshBtn" class="neu-btn neu-btn--small">↻ Refresh Data</button>
          <button id="clearCacheBtn" class="neu-btn neu-btn--small">🧹 Clear Cache & Reload</button>
          <div style="display:flex;gap:8px;align-items:center;padding:8px;background:var(--bg);border-radius:8px">
            <span style="font-size:11px;color:var(--text-secondary)">Floating ↻ button is draggable — drag to adjust position. Saved automatically.</span>
          </div>
        </div>
      </div>

      <div class="neu-card" style="margin-top:16px">
        <h3 style="font-weight:700">App Info</h3>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:8px;line-height:1.5">
          <p>FuelOps • iOS Clean • Simple • Invite Only</p>
          <p>Mode: <b>${isDemo ? 'Local Storage (Demo)' : 'Firebase Firestore Live'}</b></p>
          <p>Station: ${currentStation?.name || 'None'} • Role: ${user?.role}</p>
          <p>Build: v15 • Super Admin delete + reset</p>
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
    if (confirm('Clear cache and reload?')) {
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
    if (!confirm(`Reset ALL data for "${currentStation.name}"?\n\nDeletes: pumps, nozzles, prices, shifts, credits, expenses, notes\nKeeps: station itself\nCannot be undone!`)) return;
    const typed = prompt(`Type station name "${currentStation.name}" to confirm:`);
    if (typed !== currentStation.name) return alert('Mismatch, cancelled');
    
    const btn = root.querySelector('#resetStationBtn');
    btn.disabled = true;
    btn.textContent = 'Resetting...';
    try {
      await resetStationDataService(currentStation.id);
      alert(`✅ Station "${currentStation.name}" data reset!`);
      location.reload();
    } catch(e){
      alert('Reset failed: ' + e.message);
      btn.disabled = false;
      btn.textContent = '🗑️ Reset Current Station Data';
    }
  });

  root.querySelector('#deleteStationBtn')?.addEventListener('click', async ()=>{
    if (!currentStation) return alert('No station selected');
    if (user.role !== 'super_admin') return alert('Only Super Admin');
    if (!confirm(`⚠️ DELETE station "${currentStation.name}" permanently?\n\nDeletes:\n• Station itself\n• ALL pumps & nozzles\n• ALL prices\n• ALL shifts & transactions\n• ALL notes & logs\n\nCannot be undone!`)) return;
    const typed = prompt(`Type "DELETE ${currentStation.name}" to confirm:`);
    if (typed !== `DELETE ${currentStation.name}`) return alert('Mismatch, cancelled');
    
    const btn = root.querySelector('#deleteStationBtn');
    btn.disabled = true;
    btn.textContent = 'Deleting...';
    try {
      await deleteStation(currentStation.id);
      setState({ currentStationId: null });
      alert(`✅ Station "${currentStation.name}" deleted!`);
      location.hash = '#/stations';
      setTimeout(()=> location.reload(), 300);
    } catch(e){
      alert('Delete failed: ' + e.message);
      btn.disabled = false;
      btn.textContent = '❌ Delete Current Station (Super Admin)';
    }
  });

  root.querySelector('#resetAllBtn')?.addEventListener('click', async ()=>{
    if (user.role !== 'super_admin') return alert('Only Super Admin');
    if (!confirm(`⚠️ Reset ALL operational data for ALL stations?\n\nDeletes for ALL:\n- Pumps & nozzles\n- Prices\n- Shifts & transactions\n- Notes & logs\n\nKeeps: Stations + Users\nCannot be undone!`)) return;
    const typed = prompt(`Type "RESET ALL" to confirm:`);
    if (typed !== 'RESET ALL') return alert('Cancelled');

    const btn = root.querySelector('#resetAllBtn');
    btn.disabled = true;
    btn.textContent = 'Resetting all...';
    try {
      for (const st of stations) {
        await resetStationDataService(st.id);
      }
      alert('✅ All stations operational data reset!');
      location.reload();
    } catch(e){
      alert('Failed: ' + e.message);
      btn.disabled = false;
      btn.textContent = '⚠️ Reset ALL Stations Data (Keep Stations)';
    }
  });

  root.querySelector('#deleteAllStationsBtn')?.addEventListener('click', async ()=>{
    if (user.role !== 'super_admin') return alert('Only Super Admin');
    if (!confirm(`🗑️ DELETE ALL STATIONS permanently?\n\nDeletes:\n- ALL stations\n- ALL pumps & nozzles\n- ALL prices\n- ALL shifts & transactions\n- ALL notes & logs\n\nKeeps: Users\nCannot be undone!`)) return;
    const typed = prompt(`Type "DELETE ALL STATIONS" to confirm:`);
    if (typed !== 'DELETE ALL STATIONS') return alert('Cancelled');

    const btn = root.querySelector('#deleteAllStationsBtn');
    btn.disabled = true;
    btn.textContent = 'Deleting all...';
    try {
      for (const st of stations) {
        await deleteStation(st.id);
      }
      setState({ currentStationId: null });
      alert('✅ All stations deleted!');
      location.hash = '#/stations';
      setTimeout(()=> location.reload(), 300);
    } catch(e){
      alert('Failed: ' + e.message);
      btn.disabled = false;
      btn.textContent = '🗑️ Delete ALL Stations (Super Admin)';
    }
  });

  root.querySelector('#resetEverythingBtn')?.addEventListener('click', async ()=>{
    if (user.role !== 'super_admin') return alert('Only Super Admin');
    if (!confirm(`💥 WIPE EVERYTHING?\n\nDeletes:\n- All stations\n- All pumps/nozzles/prices\n- All shifts/transactions\n- All users (including you)\n- All notes/audit logs\n\nNeed to create Super Admin again via #/dev-setup with FUELDEV2024\nCannot be undone!`)) return;
    const typed = prompt(`Type "WIPE EVERYTHING" to confirm:`);
    if (typed !== 'WIPE EVERYTHING') return alert('Cancelled');

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
  }
}
