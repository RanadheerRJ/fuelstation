import { getState } from '../state.js';
import { getAllStations, createStation } from '../services/stations.js';
import { getEmployees } from '../services/users.js';
import { registerUserInFirebase } from '../auth.js';
import { formatDateTime } from '../services/calc.js';

export async function superAdminView({ root }) {
  const { user } = getState();
  if (user.role !== 'super_admin') {
    root.innerHTML = `<div class="container"><div class="neu-card"><h3>Access Denied</h3><p>Only Super Admin can access this.</p></div></div>`;
    return;
  }

  const stations = await getAllStations();
  const users = await getEmployees();

  const owners = users.filter(u => u.role === 'owner');
  const superAdmins = users.filter(u => u.role === 'super_admin');

  root.innerHTML = `
    <div class="container">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><h1 class="page-title">Super Admin 🔧</h1><p class="page-sub">Developer Panel • Invite Owners</p></div>
        <span class="badge badge--info">SUPER ADMIN</span>
      </div>

      <div class="grid grid-2" style="margin-top:18px">
        <div class="neu-card stat-card">
          <div class="stat-label">Total Stations</div>
          <div class="stat-value">${stations.length}</div>
          <div class="stat-sub">${owners.length} owners</div>
        </div>
        <div class="neu-card stat-card">
          <div class="stat-label">Total Users</div>
          <div class="stat-value">${users.length}</div>
          <div class="stat-sub">${superAdmins.length} super admins</div>
        </div>
      </div>

      <div class="neu-card" style="margin-top:18px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h3 style="font-weight:800">Invite New Owner</h3>
          <span class="badge badge--success">Invite Only</span>
        </div>
        <p style="font-size:12px;color:var(--text-muted);margin-top:6px">As developer, you invite owners with site name, phone and PIN. They will login and setup their own fuel station (pumps, nozzles, prices).</p>
        
        <div id="inviteAlert" style="margin-top:12px"></div>
        <div class="grid" style="margin-top:14px;gap:14px">
          <div style="border:1px solid rgba(0,0,0,0.08);border-radius:14px;padding:14px;background:rgba(255,255,255,0.4)">
            <h4 style="font-weight:800;font-size:13px;margin-bottom:10px">👤 Owner Details</h4>
            <div class="grid" style="gap:10px">
              <div><label class="label">Owner Name *</label><input id="o_name" class="neu-input" placeholder="Ramesh Kumar"></div>
              <div><label class="label">Owner Phone *</label><input id="o_phone" class="neu-input" type="tel" placeholder="+91 98765 43210"></div>
              <div><label class="label">4-digit PIN *</label><input id="o_pin" class="neu-input" type="tel" maxlength="4" placeholder="1234"></div>
            </div>
          </div>

          <div style="border:1px solid rgba(0,0,0,0.08);border-radius:14px;padding:14px;background:rgba(255,255,255,0.4)">
            <h4 style="font-weight:800;font-size:13px;margin-bottom:10px">⛽ Initial Station (Site)</h4>
            <div class="grid" style="gap:10px">
              <div><label class="label">Station / Site Name *</label><input id="s_name" class="neu-input" placeholder="MG Road Fuel Station"></div>
              <div><label class="label">Address</label><input id="s_address" class="neu-input" placeholder="123 MG Road, Bangalore"></div>
              <div><label class="label">Station Phone</label><input id="s_phone" class="neu-input" type="tel" placeholder="+91 ..."></div>
            </div>
          </div>

          <button id="inviteBtn" class="neu-btn neu-btn--primary neu-btn--block" style="margin-top:4px">📨 Invite Owner & Create Station</button>
          <p style="font-size:11px;color:var(--text-muted);text-align:center">This will create: 1) Owner user (phone+PIN) 2) Station assigned to owner. Owner can then login and add pumps/nozzles/prices.</p>
        </div>
      </div>

      <div class="neu-card" style="margin-top:18px">
        <h3 style="font-weight:800">All Owners (${owners.length})</h3>
        <div class="list" style="margin-top:12px">
          ${owners.map(o=>`
            <div class="neu-card neu-card--sm" style="display:flex;justify-content:space-between;align-items:center">
              <div style="display:flex;gap:10px;align-items:center">
                <div class="avatar">${(o.name||'O').slice(0,2).toUpperCase()}</div>
                <div>
                  <div style="font-weight:800;font-size:13px">${o.name} <span class="badge badge--info" style="margin-left:6px">OWNER</span></div>
                  <div style="font-size:11px;color:var(--text-muted)">${o.phone} • ${(o.stationIds||[]).length} stations • ${o.status}</div>
                  <div style="font-size:10px;color:var(--text-muted)">UID: ${(o.uid||o.id||'').slice(0,10)} • Created: ${o.createdAt? formatDateTime(o.createdAt):''}</div>
                </div>
              </div>
              <div style="display:flex;flex-direction:column;gap:4px">
                <span class="badge badge--neutral">${(o.stationIds||[]).length} sites</span>
              </div>
            </div>
          `).join('') || `<p style="font-size:12px;color:var(--text-muted)">No owners yet. Invite first owner above.</p>`}
        </div>
      </div>

      <div class="neu-card" style="margin-top:16px">
        <h3 style="font-weight:800">All Stations (${stations.length})</h3>
        <div class="list" style="margin-top:12px">
          ${stations.map(s=>`
            <div class="neu-card neu-card--sm" style="display:flex;justify-content:space-between">
              <div>
                <div style="font-weight:800;font-size:13px">${s.name}</div>
                <div style="font-size:11px;color:var(--text-muted)">${s.address||''} • ${s.phone||''}</div>
                <div style="font-size:10px;color:var(--text-muted)">Owner: ${s.ownerId?.slice(0,8)||'N/A'} • ${s.status}</div>
              </div>
              <span class="badge ${s.status==='active'?'badge--success':'badge--neutral'}">${s.status}</span>
            </div>
          `).join('') || `<p style="font-size:12px;color:var(--text-muted)">No stations yet.</p>`}
        </div>
      </div>

      <div class="neu-card" style="margin-top:16px">
        <h3 style="font-weight:800">How It Works</h3>
        <ol style="font-size:12px;color:var(--text-muted);margin-top:8px;padding-left:18px;display:flex;flex-direction:column;gap:6px">
          <li><b>You (Super Admin)</b> invite Owner with Site Name + Phone + PIN</li>
          <li>System creates Station + Owner user + links them</li>
          <li>You share Phone+PIN with Owner (via WhatsApp/SMS)</li>
          <li><b>Owner logs in</b> → Sees their station → Adds Pumps/Nozzles → Sets Prices → Creates Employees (Managers/Attendants)</li>
          <li>Owner's employees login with their phone+PIN and run daily operations</li>
          <li>No one can self-register — only you can invite</li>
        </ol>
      </div>
    </div>
  `;

  root.querySelector('#inviteBtn').addEventListener('click', async ()=>{
    const o_name = root.querySelector('#o_name').value.trim();
    const o_phone = root.querySelector('#o_phone').value.trim();
    const o_pin = root.querySelector('#o_pin').value.trim();
    const s_name = root.querySelector('#s_name').value.trim();
    const s_address = root.querySelector('#s_address').value.trim();
    const s_phone = root.querySelector('#s_phone').value.trim();
    const alertEl = root.querySelector('#inviteAlert');

    if (!o_name || !o_phone || !o_pin || !s_name) {
      alertEl.innerHTML = `<div class="alert alert--danger">Fill all * fields</div>`;
      return;
    }
    if (o_pin.length!==4 || !/^\d{4}$/.test(o_pin)) {
      alertEl.innerHTML = `<div class="alert alert--danger">PIN must be 4 digits</div>`;
      return;
    }

    const btn = root.querySelector('#inviteBtn');
    btn.disabled = true;
    btn.textContent = 'Inviting...';

    try {
      // 1. Create station first with temporary ownerId
      const station = await createStation({
        name: s_name,
        address: s_address,
        phone: s_phone,
        status: 'active',
        managerId: null,
        ownerId: user.uid, // temporary, will update after owner creation
      });

      // 2. Create owner user with this stationId
      const ownerUser = await registerUserInFirebase({
        phone: o_phone,
        pin: o_pin,
        name: o_name,
        role: 'owner',
        stationIds: [station.id],
      });

      // 3. Update station with real ownerId
      const { updateStation } = await import('../services/stations.js');
      await updateStation(station.id, { ownerId: ownerUser.uid || ownerUser.id });

      alertEl.innerHTML = `<div class="alert alert--success">✅ Owner <b>${o_name}</b> invited!<br>Station: <b>${s_name}</b><br>Login: <b>${o_phone}</b> / PIN <b>${o_pin}</b><br>Share these credentials with owner.</div>`;
      
      // Clear form
      root.querySelector('#o_name').value = '';
      root.querySelector('#o_phone').value = '';
      root.querySelector('#o_pin').value = '';
      root.querySelector('#s_name').value = '';
      root.querySelector('#s_address').value = '';
      root.querySelector('#s_phone').value = '';

      // Refresh after 2 sec
      setTimeout(()=> superAdminView({ root }), 2000);

    } catch(e){
      alertEl.innerHTML = `<div class="alert alert--danger">⚠️ ${e.message}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = '📨 Invite Owner & Create Station';
    }
  });
}
