import { getState } from '../state.js';
import { getAllStations, createStation } from '../services/stations.js';
import { getEmployees } from '../services/users.js';
import { registerUserInFirebase, normalizePhone } from '../auth.js';
import { formatDateTime } from '../services/calc.js';

export async function superAdminView({ root }) {
  const { user } = getState();
  if (user.role !== 'super_admin') {
    root.innerHTML = `<div class="container"><div class="neu-card" style="text-align:center;padding:40px"><div style="font-size:32px">🔒</div><h3 style="margin-top:12px;font-weight:700">Access Denied</h3><p style="font-size:14px;color:var(--text-secondary);margin-top:6px">Only Super Admin can access.</p></div></div>`;
    return;
  }

  const stations = await getAllStations();
  const users = await getEmployees();
  const owners = users.filter(u => u.role === 'owner');

  root.innerHTML = `
    <div class="container">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <h1 class="page-title">Super Admin</h1>
          <p class="page-sub">Invite Owners • Developer Panel</p>
        </div>
        <span class="badge badge--info">Super Admin</span>
      </div>

      <div class="grid grid-2" style="margin-top:20px">
        <div class="neu-card">
          <div class="stat-label">Total Stations</div>
          <div class="stat-value">${stations.length}</div>
          <div class="stat-sub">${owners.length} owners</div>
        </div>
        <div class="neu-card">
          <div class="stat-label">Total Users</div>
          <div class="stat-value">${users.length}</div>
          <div class="stat-sub">Invite only system</div>
        </div>
      </div>

      <div class="neu-card" style="margin-top:20px">
        <h3 style="font-weight:700;font-size:18px">Invite New Owner</h3>
        <p style="font-size:13px;color:var(--text-secondary);margin-top:6px">Invite owners with site name, phone and PIN. They will setup their station.</p>
        
        <div id="inviteAlert" style="margin-top:16px"></div>
        
        <div class="grid" style="margin-top:20px;gap:20px">
          <div class="invite-section">
            <h4>👤 Owner Details</h4>
            <div class="grid" style="gap:14px">
              <div><label class="label">Owner Name *</label><input id="o_name" class="neu-input" placeholder="Ramesh Kumar"></div>
              <div><label class="label">Phone (10 digits) *</label><input id="o_phone" class="neu-input" type="tel" inputmode="numeric" maxlength="10" placeholder="9948288169"></div>
              <div><label class="label">PIN *</label><input id="o_pin" class="neu-input" type="tel" inputmode="numeric" maxlength="4" placeholder="1234"></div>
            </div>
          </div>

          <div class="invite-section">
            <h4>⛽ Station Details</h4>
            <div class="grid" style="gap:14px">
              <div><label class="label">Station Name *</label><input id="s_name" class="neu-input" placeholder="MG Road Fuel Station"></div>
              <div><label class="label">Address</label><input id="s_address" class="neu-input" placeholder="123 MG Road, Bangalore"></div>
              <div><label class="label">Station Phone</label><input id="s_phone" class="neu-input" type="tel" placeholder="+91 ..."></div>
            </div>
          </div>

          <button id="inviteBtn" class="neu-btn neu-btn--primary neu-btn--block">Invite Owner & Create Station</button>
          <p style="font-size:12px;color:var(--text-secondary);text-align:center">Creates owner user + station. Share phone+PIN with owner.</p>
        </div>
      </div>

      <div class="neu-card" style="margin-top:20px">
        <h3 style="font-weight:700">All Owners • ${owners.length}</h3>
        <div class="list" style="margin-top:16px">
          ${owners.map(o=>`
            <div class="neu-card" style="display:flex;justify-content:space-between;align-items:center;padding:14px">
              <div style="display:flex;gap:12px;align-items:center">
                <div class="avatar">${(o.name||'O').slice(0,2).toUpperCase()}</div>
                <div>
                  <div style="font-weight:700;font-size:14px">${o.name}</div>
                  <div style="font-size:12px;color:var(--text-secondary)">${o.phone} • ${(o.stationIds||[]).length} stations</div>
                </div>
              </div>
              <span class="badge badge--neutral">${(o.stationIds||[]).length} sites</span>
            </div>
          `).join('') || `<div style="text-align:center;padding:24px;color:var(--text-secondary)"><p style="font-size:13px">No owners yet</p></div>`}
        </div>
      </div>

      <div class="neu-card" style="margin-top:16px">
        <h3 style="font-weight:700">All Stations • ${stations.length}</h3>
        <div class="list" style="margin-top:16px">
          ${stations.map(s=>`
            <div class="neu-card" style="padding:14px;display:flex;justify-content:space-between">
              <div>
                <div style="font-weight:700;font-size:14px">${s.name}</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${s.address||''}</div>
              </div>
              <span class="badge ${s.status==='active'?'badge--success':'badge--neutral'}">${s.status}</span>
            </div>
          `).join('') || `<div style="text-align:center;padding:24px;color:var(--text-secondary)"><p>No stations</p></div>`}
        </div>
      </div>
    </div>
  `;

  root.querySelector('#inviteBtn').addEventListener('click', async ()=>{
    const o_name = root.querySelector('#o_name').value.trim();
    const o_phoneRaw = root.querySelector('#o_phone').value.trim();
    const o_pin = root.querySelector('#o_pin').value.trim();
    const s_name = root.querySelector('#s_name').value.trim();
    const s_address = root.querySelector('#s_address').value.trim();
    const s_phoneRaw = root.querySelector('#s_phone').value.trim();
    const alertEl = root.querySelector('#inviteAlert');

    if (!o_name || !o_phoneRaw || !o_pin || !s_name) {
      alertEl.innerHTML = `<div class="alert alert--danger">Fill required fields</div>`;
      return;
    }
    if (o_pin.length!==4) {
      alertEl.innerHTML = `<div class="alert alert--danger">PIN must be 4 digits</div>`;
      return;
    }
    const o_phone = normalizePhone(o_phoneRaw);
    const s_phone = s_phoneRaw ? normalizePhone(s_phoneRaw) : '';

    const btn = root.querySelector('#inviteBtn');
    btn.disabled = true;
    btn.textContent = 'Inviting...';

    try {
      const station = await createStation({
        name: s_name,
        address: s_address,
        phone: s_phone,
        status: 'active',
        managerId: null,
        ownerId: user.uid,
      });

      const ownerUser = await registerUserInFirebase({
        phone: o_phone,
        pin: o_pin,
        name: o_name,
        role: 'owner',
        stationIds: [station.id],
      });

      const { updateStation } = await import('../services/stations.js');
      await updateStation(station.id, { ownerId: ownerUser.uid || ownerUser.id });

      alertEl.innerHTML = `<div class="alert alert--success">✅ ${o_name} invited!<br>Station: ${s_name}<br>Login: ${o_phone} / ${o_pin}</div>`;
      
      root.querySelector('#o_name').value = '';
      root.querySelector('#o_phone').value = '';
      root.querySelector('#o_pin').value = '';
      root.querySelector('#s_name').value = '';
      root.querySelector('#s_address').value = '';
      root.querySelector('#s_phone').value = '';

      setTimeout(()=> superAdminView({ root }), 2000);

    } catch(e){
      alertEl.innerHTML = `<div class="alert alert--danger">${e.message}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Invite Owner & Create Station';
    }
  });
}
