import { getState } from '../state.js';
import { logout } from '../auth.js';

export async function settingsView({ root }) {
  const { user } = getState();

  root.innerHTML = `
    <div class="container">
      <h1 class="page-title">Settings</h1>
      <p class="page-sub">${user?.name} • ${user?.role}</p>

      <div class="neu-card" style="margin-top:16px">
        <h3 style="font-weight:800">Profile</h3>
        <div style="margin-top:10px;font-size:13px">
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(0,0,0,0.05)"><span style="color:var(--text-muted)">Name</span><span style="font-weight:700">${user?.name||''}</span></div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(0,0,0,0.05)"><span style="color:var(--text-muted)">Phone</span><span style="font-weight:700">${user?.phone||''}</span></div>
          <div style="display:flex;justify-content:space-between;padding:8px 0"><span style="color:var(--text-muted)">Role</span><span><span class="badge badge--info">${user?.role||''}</span></span></div>
        </div>
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
          <p>FuelOps PWA • Production Ready • Vanilla JS • No build step • GitHub Pages</p>
          <p style="margin-top:6px">Install: Browser menu → Add to Home Screen</p>
        </div>
      </div>

      <div style="margin-top:18px">
        <button id="logoutBtn" class="neu-btn neu-btn--primary neu-btn--block">Logout</button>
      </div>
    </div>
  `;

  root.querySelector('#logoutBtn').addEventListener('click', async ()=>{
    await logout();
    location.hash = '#/login';
  });
}
