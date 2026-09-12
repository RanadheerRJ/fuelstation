import { getState, clearDemoData } from '../state.js';
import { logout } from '../auth.js';
import { getFirebaseStatus } from '../firebase.js';
import { demoReset } from '../services/demoStore.js';

export async function settingsView({ root }) {
  const { user } = getState();
  const { isDemo } = getFirebaseStatus();

  root.innerHTML = `
    <div class="container">
      <h1 class="page-title">Settings</h1>
      <p class="page-sub">${user?.name} • ${user?.role}</p>

      <div class="neu-card" style="margin-top:16px">
        <h3 style="font-weight:800">Profile</h3>
        <div style="margin-top:10px;font-size:13px">
          <div style="display:flex;justify-content:space-between;padding:6px 0"><span style="color:var(--text-muted)">Name</span><span style="font-weight:700">${user?.name||''}</span></div>
          <div style="display:flex;justify-content:space-between;padding:6px 0"><span style="color:var(--text-muted)">Phone</span><span style="font-weight:700">${user?.phone||''}</span></div>
          <div style="display:flex;justify-content:space-between;padding:6px 0"><span style="color:var(--text-muted)">Role</span><span><span class="badge badge--info">${user?.role||''}</span></span></div>
          <div style="display:flex;justify-content:space-between;padding:6px 0"><span style="color:var(--text-muted)">UID</span><span style="font-size:11px">${user?.uid||''}</span></div>
          <div style="display:flex;justify-content:space-between;padding:6px 0"><span style="color:var(--text-muted)">Mode</span><span><span class="badge ${isDemo?'badge--warning':'badge--success'}">${isDemo?'DEMO':'LIVE'}</span></span></div>
        </div>
      </div>

      <div class="neu-card" style="margin-top:16px">
        <h3 style="font-weight:800">Firebase Setup</h3>
        <p style="font-size:12px;color:var(--text-muted);margin-top:6px">To go live, configure Firebase:</p>
        <ol style="font-size:12px;margin-top:8px;padding-left:18px;display:flex;flex-direction:column;gap:6px">
          <li>Create project at <a href="https://console.firebase.google.com" target="_blank">Firebase Console</a></li>
          <li>Enable Email/Password Auth (used under the hood for Phone+PIN)</li>
          <li>Create Firestore Database (test mode then apply rules from firestore.rules)</li>
          <li>Copy config to <code>js/firebase-config.js</code></li>
          <li>Deploy to GitHub Pages (set repo Pages source to main / root)</li>
        </ol>
        <div class="alert alert--info" style="margin-top:12px">PIN is never stored plain in Firestore. Firebase Auth password = derived from PIN (FuelOps#PIN#2024). For extra security, you can switch to Phone OTP + custom claims later.</div>
      </div>

      <div class="neu-card" style="margin-top:16px">
        <h3 style="font-weight:800">Quick Navigation</h3>
        <div class="grid grid-2" style="margin-top:12px">
          <button class="neu-btn neu-btn--small" onclick="location.hash='#/stations'">⛽ Stations</button>
          <button class="neu-btn neu-btn--small" onclick="location.hash='#/pumps'">🔧 Pumps & Nozzles</button>
          <button class="neu-btn neu-btn--small" onclick="location.hash='#/employees'">👥 Employees</button>
          <button class="neu-btn neu-btn--small" onclick="location.hash='#/prices'">💰 Fuel Prices</button>
          <button class="neu-btn neu-btn--small" onclick="location.hash='#/shifts'">🧾 Shifts</button>
          <button class="neu-btn neu-btn--small" onclick="location.hash='#/shifts/start'">▶️ Start Shift</button>
          <button class="neu-btn neu-btn--small" onclick="location.hash='#/reports'">📊 Reports</button>
          <button class="neu-btn neu-btn--small" onclick="location.hash='#/reports/audit'">📜 Audit Log</button>
        </div>
      </div>

      <div class="neu-card" style="margin-top:16px">
        <h3 style="font-weight:800">App Info</h3>
        <div style="font-size:12px;color:var(--text-muted);margin-top:8px">
          <p>FuelOps PWA • v1.0 • Vanilla JS • No build step • GitHub Pages friendly (hash routing, relative paths)</p>
          <p style="margin-top:6px">PWA: Install via browser menu → Add to Home Screen. Service Worker caches shell.</p>
          <p style="margin-top:6px">Data model: users, stations, pumps, nozzles, prices (history), assignments, shifts, transactions, notes, auditLogs</p>
        </div>
      </div>

      <div class="grid" style="margin-top:18px">
        ${isDemo ? `<button id="resetDemo" class="neu-btn">Reset Demo Data</button>` : ''}
        <button id="logoutBtn" class="neu-btn neu-btn--primary">Logout</button>
      </div>

      <div class="neu-card" style="margin-top:16px">
        <h3 style="font-weight:800;font-size:13px">Firestore Rules (copy to Firebase Console)</h3>
        <pre style="font-size:10px;overflow:auto;background:#1a202c;color:#e2e8f0;padding:12px;border-radius:12px;margin-top:8px;max-height:300px">rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() { return request.auth != null; }
    function isOwner() { return isSignedIn() && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'owner'; }
    function userData() { return get(/databases/$(database)/documents/users/$(request.auth.uid)).data; }
    function hasStation(stationId) { return stationId in userData().stationIds || isOwner(); }

    match /users/{userId} {
      allow read: if isSignedIn() && (request.auth.uid == userId || isOwner() || userData().role in ['admin','manager']);
      allow write: if isOwner() || (isSignedIn() && request.auth.uid == userId);
    }
    match /stations/{stationId} {
      allow read: if isSignedIn() && hasStation(stationId);
      allow write: if isOwner() || (isSignedIn() && userData().role in ['admin','manager']);
    }
    match /pumps/{pumpId} {
      allow read: if isSignedIn();
      allow write: if isSignedIn() && userData().role in ['owner','admin','manager'];
    }
    match /nozzles/{nozzleId} {
      allow read: if isSignedIn();
      allow write: if isSignedIn() && userData().role in ['owner','admin','manager'];
    }
    match /prices/{priceId} {
      allow read: if isSignedIn();
      allow write: if isSignedIn() && userData().role in ['owner','admin','manager'];
    }
    match /shifts/{shiftId} {
      allow read: if isSignedIn();
      allow create: if isSignedIn();
      allow update: if isSignedIn() && (resource.data.userId == request.auth.uid || userData().role in ['owner','admin','manager']);
    }
    match /transactions/{txId} {
      allow read: if isSignedIn();
      allow write: if isSignedIn();
    }
    match /notes/{noteId} {
      allow read: if isSignedIn();
      allow write: if isSignedIn();
    }
    match /auditLogs/{logId} {
      allow read: if isSignedIn();
      allow create: if isSignedIn();
    }
  }
}
</pre>
      </div>
    </div>
  `;

  root.querySelector('#logoutBtn').addEventListener('click', async ()=>{
    await logout();
    location.hash = '#/login';
  });
  root.querySelector('#resetDemo')?.addEventListener('click', ()=>{
    if (confirm('Reset all demo data? This will erase local data.')) {
      demoReset();
      alert('Demo reset. Please login again.');
      clearDemoData();
      location.reload();
    }
  });
}
