import { getState } from '../state.js';
import { getAllStations, createStation } from '../services/stations.js';
import { getEmployees } from '../services/users.js';
import { registerUserInFirebase } from '../auth.js';
import { formatDateTime } from '../services/calc.js';

export async function superAdminView({ root }) {
  const { user } = getState();
  if (user.role !== 'super_admin') {
    root.innerHTML = `<div class="container"><div class="neu-card" style="text-align:center;padding:32px"><div style="font-size:40px">🔒</div><h3 style="margin-top:12px;font-weight:900">Access Denied</h3><p style="font-size:13px;color:var(--text-muted);margin-top:6px">Only Super Admin (Developer) can access invite panel.</p></div></div>`;
    return;
  }

  const stations = await getAllStations();
  const users = await getEmployees();
  const owners = users.filter(u => u.role === 'owner');

  root.innerHTML = `
    <div class="container">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <h1 class="page-title">Super Admin 🔧</h1>
          <p class="page-sub">Developer Panel • Invite Only System</p>
        </div>
        <div class="neu-card neu-card--sm" style="padding:8px 14px;border-radius:999px;display:flex;align-items:center;gap:8px">
          <div style="width:8px;height:8px;border-radius:50%;background:var(--success);box-shadow:0 0 8px var(--success)"></div>
          <span style="font-size:11px;font-weight:800;letter-spacing:0.06em">SUPER ADMIN</span>
        </div>
      </div>

      <div class="grid grid-2" style="margin-top:20px">
        <div class="neu-card">
          <div style="display:flex;align-items:center;gap:12px">
            <div class="avatar" style="width:52px;height:52px;border-radius:16px">⛽</div>
            <div>
              <div class="stat-label">Total Stations</div>
              <div class="stat-value" style="font-size:28px">${stations.length}</div>
              <div class="stat-sub">${owners.length} owners invited</div>
            </div>
          </div>
        </div>
        <div class="neu-card">
          <div style="display:flex;align-items:center;gap:12px">
            <div class="avatar" style="width:52px;height:52px;border-radius:16px">👥</div>
            <div>
              <div class="stat-label">Total Users</div>
              <div class="stat-value" style="font-size:28px">${users.length}</div>
              <div class="stat-sub">Invite only • No self-reg</div>
            </div>
          </div>
        </div>
      </div>

      <div class="neu-card" style="margin-top:20px;padding:24px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
          <div>
            <h3 style="font-weight:900;font-size:18px;letter-spacing:-0.02em">Invite New Owner 👑</h3>
            <p style="font-size:12px;color:var(--text-muted);margin-top:6px;font-weight:500;line-height:1.5">You as developer invite owners with site name + phone + PIN.<br>They login and setup their own fuel station (pumps, nozzles, prices).</p>
          </div>
          <span class="badge badge--success">Invite Only</span>
        </div>
        
        <div id="inviteAlert" style="margin-top:16px"></div>
        
        <div class="grid" style="margin-top:18px;gap:18px">
          <!-- Owner Details - Neumorphic Inset Section -->
          <div class="invite-section">
            <h4><span class="icon-box">👤</span> Owner Details</h4>
            <div class="grid" style="gap:14px">
              <div><label class="label">Owner Name *</label><input id="o_name" class="neu-input" placeholder="Ramesh Kumar"></div>
              <div><label class="label">Owner Phone *</label><input id="o_phone" class="neu-input" type="tel" placeholder="+91  98765 43210"></div>
              <div><label class="label">4-digit PIN *</label><input id="o_pin" class="neu-input" type="tel" maxlength="4" placeholder="••••"></div>
            </div>
          </div>

          <!-- Station Details - Neumorphic Inset Section -->
          <div class="invite-section">
            <h4><span class="icon-box">⛽</span> Initial Station / Site</h4>
            <div class="grid" style="gap:14px">
              <div><label class="label">Station Name *</label><input id="s_name" class="neu-input" placeholder="MG Road Fuel Station"></div>
              <div><label class="label">Address</label><input id="s_address" class="neu-input" placeholder="123 MG Road, Bangalore"></div>
              <div><label class="label">Station Phone</label><input id="s_phone" class="neu-input" type="tel" placeholder="+91  ..."></div>
            </div>
          </div>

          <button id="inviteBtn" class="neu-btn neu-btn--primary neu-btn--block" style="min-height:56px;font-size:16px">📨 Invite Owner & Create Station</button>
          
          <div class="neu-card neu-card--inset" style="padding:14px;border-radius:14px;text-align:center">
            <p style="font-size:11px;color:var(--text-muted);font-weight:600;line-height:1.5">Creates: 1) Owner user (phone+PIN) 2) Station assigned to owner<br>Owner can then login and add pumps / nozzles / prices / employees</p>
          </div>
        </div>
      </div>

      <div class="neu-card" style="margin-top:20px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h3 style="font-weight:900;font-size:16px">All Owners • ${owners.length}</h3>
          <div class="neu-card neu-card--inset" style="padding:6px 12px;border-radius:999px"><span style="font-size:11px;font-weight:800">${owners.length} invited</span></div>
        </div>
        <div class="list" style="margin-top:16px">
          ${owners.map(o=>`
            <div class="neu-card neu-card--soft" style="display:flex;justify-content:space-between;align-items:center;padding:16px">
              <div style="display:flex;gap:12px;align-items:center">
                <div class="avatar">${(o.name||'O').slice(0,2).toUpperCase()}</div>
                <div>
                  <div style="font-weight:900;font-size:14px;letter-spacing:-0.01em">${o.name} <span class="badge badge--info" style="margin-left:8px">OWNER</span></div>
                  <div style="font-size:12px;color:var(--text-muted);margin-top:2px;font-weight:500">${o.phone} • ${(o.stationIds||[]).length} stations</div>
                  <div style="font-size:10px;color:var(--text-muted);margin-top:2px">Created: ${o.createdAt? formatDateTime(o.createdAt):'—'}</div>
                </div>
              </div>
              <span class="badge badge--neutral">${(o.stationIds||[]).length} sites</span>
            </div>
          `).join('') || `
            <div class="neu-card neu-card--inset" style="text-align:center;padding:28px">
              <div style="font-size:32px">👑</div>
              <p style="font-size:13px;font-weight:700;margin-top:8px">No owners yet</p>
              <p style="font-size:11px;color:var(--text-muted);margin-top:4px">Invite first owner above</p>
            </div>
          `}
        </div>
      </div>

      <div class="neu-card" style="margin-top:18px">
        <h3 style="font-weight:900;font-size:16px">All Stations • ${stations.length}</h3>
        <div class="list" style="margin-top:16px">
          ${stations.map(s=>`
            <div class="neu-card neu-card--soft" style="padding:16px">
              <div style="display:flex;justify-content:space-between;align-items:flex-start">
                <div>
                  <div style="font-weight:900;font-size:14px">${s.name}</div>
                  <div style="font-size:11px;color:var(--text-muted);margin-top:4px;font-weight:500">${s.address||'No address'} • ${s.phone||'No phone'}</div>
                  <div style="font-size:10px;color:var(--text-muted);margin-top:4px">Owner: ${s.ownerId?.slice(0,8)||'N/A'} • ${s.status}</div>
                </div>
                <span class="badge ${s.status==='active'?'badge--success':'badge--neutral'}">${s.status}</span>
              </div>
            </div>
          `).join('') || `
            <div class="neu-card neu-card--inset" style="text-align:center;padding:24px">
              <p style="font-size:12px;color:var(--text-muted)">No stations yet</p>
            </div>
          `}
        </div>
      </div>

      <div class="neu-card neu-card--inset" style="margin-top:18px;padding:18px;border-radius:18px">
        <h3 style="font-weight:900;font-size:14px">🔧 How Invite-Only Works</h3>
        <div style="margin-top:12px;display:flex;flex-direction:column;gap:10px">
          ${[
            {n:1, t:'You (Super Admin) invite Owner with Site Name + Phone + PIN'},
            {n:2, t:'System creates Station + Owner user + links them'},
            {n:3, t:'You share Phone+PIN with Owner via WhatsApp/SMS'},
            {n:4, t:'Owner logs in → Adds Pumps/Nozzles → Sets Prices → Creates Staff'},
            {n:5, t:'Staff login with their phone+PIN and run daily operations'},
            {n:6, t:'No self-registration — only you can invite'},
          ].map(s=>`
            <div style="display:flex;gap:12px;align-items:flex-start">
              <div style="width:26px;height:26px;border-radius:50%;background:var(--card);box-shadow:3px 3px 6px var(--shadow-dark), -3px -3px 6px var(--shadow-light);display:grid;place-items:center;font-size:11px;font-weight:900;flex-shrink:0">${s.n}</div>
              <p style="font-size:12px;color:var(--text-muted);font-weight:500;line-height:1.4">${s.t}</p>
            </div>
          `).join('')}
        </div>
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
      alertEl.innerHTML = `<div class="alert alert--danger">⚠️ Fill all * required fields</div>`;
      return;
    }
    if (o_pin.length!==4 || !/^\d{4}$/.test(o_pin)) {
      alertEl.innerHTML = `<div class="alert alert--danger">⚠️ PIN must be 4 digits</div>`;
      return;
    }

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

      alertEl.innerHTML = `<div class="alert alert--success">✅ <b>${o_name}</b> invited!<br><div style="margin-top:8px;padding:10px;background:rgba(255,255,255,0.6);border-radius:10px"><div>Station: <b>${s_name}</b></div><div>Login: <b>${o_phone}</b> / PIN <b>${o_pin}</b></div><div style="font-size:11px;margin-top:4px">Share these with owner</div></div></div>`;
      
      root.querySelector('#o_name').value = '';
      root.querySelector('#o_phone').value = '';
      root.querySelector('#o_pin').value = '';
      root.querySelector('#s_name').value = '';
      root.querySelector('#s_address').value = '';
      root.querySelector('#s_phone').value = '';

      setTimeout(()=> superAdminView({ root }), 2500);

    } catch(e){
      alertEl.innerHTML = `<div class="alert alert--danger">⚠️ ${e.message}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = '📨 Invite Owner & Create Station';
    }
  });
}
