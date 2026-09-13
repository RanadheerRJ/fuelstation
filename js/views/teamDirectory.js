import { getState } from '../state.js';
import { getStationsForCurrentUser, getStationById } from '../services/stations.js';
import { getEmployees } from '../services/users.js';

export async function teamDirectoryView({ root, params }) {
  const { user } = getState();
  const stationId = params?.id || getState().currentStationId;
  
  if (!stationId) {
    root.innerHTML = `
      <div class="container">
        <h1 class="page-title">Team Directory</h1>
        <p class="page-sub">No station selected</p>
        <div class="neu-card empty" style="margin-top:16px">
          <div style="font-size:32px">👥</div>
          <p>Select a station first</p>
          <button class="neu-btn neu-btn--primary neu-btn--small" style="margin-top:12px" onclick="location.hash='#/stations'">Go to Stations</button>
        </div>
      </div>
    `;
    return;
  }

  const station = await getStationById(stationId) || (await getStationsForCurrentUser()).find(s=>s.id===stationId);
  const allUsers = await getEmployees(stationId);
  
  // Group by role for family tree
  const superAdmins = allUsers.filter(u => u.role === 'super_admin');
  const owners = allUsers.filter(u => u.role === 'owner');
  const admins = allUsers.filter(u => u.role === 'admin');
  const managers = allUsers.filter(u => u.role === 'manager');
  const attendants = allUsers.filter(u => u.role === 'attendant');
  
  // Also include station owner if not in users list but has ownerId
  const isSuperAdmin = user.role === 'super_admin';

  root.innerHTML = `
    <div class="container">
      <div style="display:flex;align-items:center;gap:12px">
        <button class="neu-btn neu-btn--small" onclick="history.back()">← Back</button>
        <div>
          <h1 class="page-title" style="font-size:20px">Team Directory</h1>
          <p class="page-sub">${station?.name || stationId.slice(0,8)} • ${allUsers.length} members</p>
        </div>
      </div>

      <div class="neu-card" style="margin-top:16px;background:linear-gradient(135deg,var(--primary-light) 0%, #eef2ff 100%);border:0.5px solid var(--primary-light)">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-weight:700;font-size:16px">⛽ ${station?.name || 'Station'}</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${station?.address||''} • ${station?.phone||''}</div>
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">ID: ${stationId} • Status: ${station?.status||'active'}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:22px;font-weight:800">${allUsers.length}</div>
            <div style="font-size:11px;color:var(--text-secondary)">Team Members</div>
          </div>
        </div>
      </div>

      <!-- Family Tree Visualization -->
      <div class="neu-card" style="margin-top:16px;padding:16px">
        <h3 style="font-weight:700;display:flex;align-items:center;gap:8px">🌳 Family Tree — Hierarchy</h3>
        <p style="font-size:11px;color:var(--text-secondary);margin-top:4px">Phone directory • Who reports to whom • Contact directly</p>
        
        <div style="margin-top:18px;position:relative;padding-left:16px">
          <!-- Super Admin Level (only visible to super admin) -->
          ${isSuperAdmin && superAdmins.length ? `
            <div style="position:relative">
              <div style="position:absolute;left:-16px;top:0;bottom:-18px;width:2px;background:var(--border)"></div>
              <div style="font-size:11px;font-weight:700;color:var(--primary);letter-spacing:0.5px;margin-bottom:8px">SUPER ADMIN (Developer)</div>
              ${superAdmins.map(u=> teamCard(u, '#f0f0ff', '👑')).join('')}
              <div style="height:16px;position:relative"><div style="position:absolute;left:20px;top:0;bottom:0;width:2px;background:var(--border);border-left:2px dashed var(--border)"></div></div>
            </div>
          ` : ''}

          <!-- Owner Level -->
          <div style="position:relative">
            <div style="position:absolute;left:-16px;top:0;bottom:-18px;width:2px;background:var(--border)"></div>
            <div style="font-size:11px;font-weight:700;color:#ad6800;letter-spacing:0.5px;margin-bottom:8px">OWNER — Station Owner</div>
            ${owners.length ? owners.map(u=> teamCard(u, '#fffbe6', '🏢')).join('') : `<div style="padding:12px;background:var(--bg);border-radius:10px;border:0.5px dashed var(--border);font-size:12px;color:var(--text-secondary)">No owner assigned • Super Admin needs to invite</div>`}
            <div style="height:16px;position:relative"><div style="position:absolute;left:20px;top:0;bottom:0;width:2px;background:var(--border)"></div></div>
          </div>

          <!-- Admin Level -->
          ${admins.length ? `
            <div style="position:relative">
              <div style="position:absolute;left:-16px;top:0;bottom:-18px;width:2px;background:var(--border)"></div>
              <div style="font-size:11px;font-weight:700;color:#0958d9;letter-spacing:0.5px;margin-bottom:8px">ADMINS — Operations Admins</div>
              ${admins.map(u=> teamCard(u, '#e6f4ff', '🛡️')).join('')}
              <div style="height:16px;position:relative"><div style="position:absolute;left:20px;top:0;bottom:0;width:2px;background:var(--border)"></div></div>
            </div>
          ` : ''}

          <!-- Manager Level -->
          <div style="position:relative">
            <div style="position:absolute;left:-16px;top:0;bottom:0;width:2px;background:var(--border)"></div>
            <div style="font-size:11px;font-weight:700;color:#389e0d;letter-spacing:0.5px;margin-bottom:8px">MANAGERS — Shift Managers</div>
            ${managers.length ? managers.map(u=> teamCard(u, '#f6ffed', '👔')).join('') : `<div style="padding:12px;background:var(--bg);border-radius:10px;border:0.5px dashed var(--border);font-size:12px;color:var(--text-secondary)">No managers yet • Owner/Admin can add</div>`}
            <div style="height:16px;position:relative"><div style="position:absolute;left:20px;top:0;bottom:0;width:2px;background:var(--border)"></div></div>
          </div>

          <!-- Attendant Level -->
          <div style="position:relative">
            <div style="font-size:11px;font-weight:700;color:var(--text-secondary);letter-spacing:0.5px;margin-bottom:8px">ATTENDANTS — Pump Operators</div>
            ${attendants.length ? `
              <div style="display:grid;grid-template-columns:1fr;gap:8px">
                ${attendants.map(u=> teamCard(u, '#fafafa', '⛽')).join('')}
              </div>
            ` : `<div style="padding:12px;background:var(--bg);border-radius:10px;border:0.5px dashed var(--border);font-size:12px;color:var(--text-secondary)">No attendants yet • Managers can add</div>`}
          </div>
        </div>
      </div>

      <!-- Phone Directory Table -->
      <div class="neu-card" style="margin-top:16px">
        <h3 style="font-weight:700">📞 Phone Directory</h3>
        <p style="font-size:11px;color:var(--text-secondary);margin-top:4px">Tap phone to call • 10-digit numbers</p>
        
        <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
          ${allUsers.length ? allUsers
            .sort((a,b)=> roleOrder(a.role) - roleOrder(b.role))
            .map(u=>`
              <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:var(--bg);border-radius:10px;border:0.5px solid var(--border)">
                <div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1">
                  <div style="width:36px;height:36px;border-radius:50%;background:${roleColor(u.role)};display:grid;place-items:center;color:white;font-weight:700;font-size:14px;flex-shrink:0">${(u.name||u.phone||'?')[0].toUpperCase()}</div>
                  <div style="min-width:0;flex:1">
                    <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.name||'No name'}</div>
                    <div style="font-size:11px;color:var(--text-secondary)"><span class="badge badge--neutral" style="font-size:10px">${u.role}</span> • ${u.phone||'No phone'}</div>
                  </div>
                </div>
                <div style="display:flex;gap:6px">
                  <a href="tel:${u.phone}" class="neu-btn neu-btn--small" style="text-decoration:none;font-size:12px">📞 ${u.phone||''}</a>
                </div>
              </div>
            `).join('') : `<div style="text-align:center;padding:20px;color:var(--text-secondary);font-size:13px">No team members found for this station</div>`}
        </div>
      </div>

      <!-- Stats -->
      <div class="neu-card" style="margin-top:16px">
        <h3 style="font-weight:700">📊 Team Stats</h3>
        <div class="grid grid-2" style="margin-top:12px;gap:10px">
          <div style="padding:12px;background:var(--bg);border-radius:10px;text-align:center"><div style="font-size:20px;font-weight:800">${owners.length}</div><div style="font-size:11px;color:var(--text-secondary)">Owners</div></div>
          <div style="padding:12px;background:var(--bg);border-radius:10px;text-align:center"><div style="font-size:20px;font-weight:800">${admins.length + managers.length}</div><div style="font-size:11px;color:var(--text-secondary)">Admins & Managers</div></div>
          <div style="padding:12px;background:var(--bg);border-radius:10px;text-align:center"><div style="font-size:20px;font-weight:800">${attendants.length}</div><div style="font-size:11px;color:var(--text-secondary)">Attendants</div></div>
          <div style="padding:12px;background:var(--bg);border-radius:10px;text-align:center"><div style="font-size:20px;font-weight:800">${allUsers.length}</div><div style="font-size:11px;color:var(--text-secondary)">Total</div></div>
        </div>
      </div>

      <div style="margin-top:16px;display:flex;gap:8px">
        <button class="neu-btn neu-btn--small" style="flex:1" onclick="location.hash='#/stations'">← Stations</button>
        <button class="neu-btn neu-btn--small neu-btn--primary" style="flex:1" onclick="location.hash='#/employees'">👥 Manage Team</button>
      </div>
    </div>
  `;

  function teamCard(u, bg, icon) {
    return `
      <div style="display:flex;align-items:center;gap:12px;padding:12px;background:${bg};border-radius:12px;border:0.5px solid var(--border);margin-bottom:8px;position:relative">
        <div style="position:absolute;left:-24px;top:50%;width:16px;height:2px;background:var(--border)"></div>
        <div style="width:40px;height:40px;border-radius:50%;background:${roleColor(u.role)};display:grid;place-items:center;color:white;font-weight:700;flex-shrink:0">${icon}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.name||'No name'} <span style="font-weight:400;color:var(--text-secondary);font-size:12px">• ${u.role}</span></div>
          <div style="font-size:12px;color:var(--text-secondary);display:flex;align-items:center;gap:6px;margin-top:2px">📞 <a href="tel:${u.phone}" style="color:var(--primary);text-decoration:none;font-weight:600">${u.phone||'No phone'}</a> ${u.status ? `<span class="badge ${u.status==='active'?'badge--success':'badge--neutral'}" style="font-size:9px">${u.status}</span>` : ''}</div>
        </div>
        <a href="tel:${u.phone}" class="neu-btn neu-btn--small" style="text-decoration:none">Call</a>
      </div>
    `;
  }

  function roleColor(role) {
    switch(role){
      case 'super_admin': return '#722ed1';
      case 'owner': return '#fa8c16';
      case 'admin': return '#1677ff';
      case 'manager': return '#52c41a';
      case 'attendant': return '#8c8c8c';
      default: return '#8c8c8c';
    }
  }

  function roleOrder(role) {
    const order = { super_admin:0, owner:1, admin:2, manager:3, attendant:4 };
    return order[role] ?? 5;
  }
}
