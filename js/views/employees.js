import { getState } from '../state.js';
import { getEmployees, createEmployee, updateEmployee } from '../services/users.js';
import { getStationsForCurrentUser } from '../services/stations.js';
import { registerUserInFirebase, normalizePhone } from '../auth.js';

export async function employeesView({ root }) {
  const { user, currentStationId } = getState();
  const stations = await getStationsForCurrentUser();
  let stationId = currentStationId || stations[0]?.id;
  
  const isOwner = user.role === 'owner';
  const isManager = user.role === 'manager';
  const isAdmin = user.role === 'admin';
  const isAttendant = user.role === 'attendant';
  const canManage = ['owner','admin','manager'].includes(user.role);

  // Attendant: only own data + stats, no full team list
  if (isAttendant) {
    const myShiftsCount = 0; // could fetch but keep simple
    root.innerHTML = `
      <div class="container" style="max-width:480px;margin:0 auto">
        <h1 class="page-title" style="font-size:20px">My Profile</h1>
        <p class="page-sub" style="margin-top:4px">${user.name} • Attendant • Only your data</p>

        <div class="neu-card" style="margin-top:16px;padding:16px;border-radius:14px;background:linear-gradient(135deg,#f6ffed 0%,#ffffff 100%);border:1px solid #b7eb8f">
          <div style="display:flex;align-items:center;gap:14px">
            <div style="width:56px;height:56px;border-radius:50%;background:#52c41a;color:white;display:grid;place-items:center;font-weight:800;font-size:20px">${(user.name||'?')[0].toUpperCase()}</div>
            <div style="flex:1">
              <div style="font-weight:700;font-size:16px">${user.name}</div>
              <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">📞 ${user.phone} • ${user.role}</div>
              <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${stations[0]?.name||'Station'} • ${user.status||'active'}</div>
            </div>
          </div>
          <div style="margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div style="padding:10px;background:white;border-radius:10px;text-align:center"><div style="font-size:11px;color:var(--text-secondary)">My Stations</div><div style="font-weight:700;font-size:14px;margin-top:2px">${(user.stationIds||[]).length}</div></div>
            <div style="padding:10px;background:white;border-radius:10px;text-align:center"><div style="font-size:11px;color:var(--text-secondary)">Role</div><div style="font-weight:700;font-size:14px;margin-top:2px">Attendant</div></div>
          </div>
        </div>

        <div class="neu-card" style="margin-top:14px;padding:14px;border-radius:12px">
          <h3 style="font-weight:700;font-size:14px">👥 My Team (Limited)</h3>
          <p style="font-size:11px;color:var(--text-secondary);margin-top:4px">You only see who is on which pump, not full details. Contact manager for more.</p>
          <button class="neu-btn" style="margin-top:12px;min-height:44px;border-radius:10px;font-weight:600;width:100%" onclick="location.hash='#/stations/${stationId}/team'">👥 View Team Directory</button>
        </div>

        <div style="margin-top:14px;padding:12px;background:var(--bg);border-radius:10px;border:0.5px solid var(--border)"><div style="font-size:11px;color:var(--text-secondary);text-align:center">🔒 Attendant view: Only your profile & stats. No full employee list, no phone directory of all staff, no sensitive data. Owner/Manager manages team.</div></div>
      </div>
    `;
    return;
  }

  const employees = stationId ? await getEmployees(stationId) : await getEmployees();

  root.innerHTML = `
    <div class="container">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <div><h1 class="page-title">Employees</h1><p class="page-sub">${employees.length} employee(s) • ${isOwner ? 'Owner • All visibility' : isManager ? 'Manager • Team' : user.role}</p></div>
        ${canManage ? `<button id="addEmp" class="neu-btn neu-btn--primary" style="min-height:44px;padding:0 18px;border-radius:12px;font-weight:700">+ Add</button>` : ''}
      </div>

      ${isManager ? `<div class="alert alert--info" style="margin-top:12px;font-size:12px">Manager: You can add/edit attendants & managers, but cannot delete owner or change owner role. Owner only can destroy.</div>` : ''}

      <div class="list" style="margin-top:16px;display:flex;flex-direction:column;gap:10px">
        ${employees.map(emp=>`
          <div class="neu-card" style="display:flex;justify-content:space-between;align-items:center;padding:14px;border-radius:12px">
            <div style="display:flex;gap:12px;align-items:center;flex:1;min-width:0">
              <div class="avatar" style="width:40px;height:40px;border-radius:50%;background:${emp.role==='owner'?'#fa8c16': emp.role==='manager'?'#52c41a':'#8c8c8c'};color:white;display:grid;place-items:center;font-weight:700;flex-shrink:0">${(emp.name||emp.phone||'?').slice(0,2).toUpperCase()}</div>
              <div style="flex:1;min-width:0">
                <div style="font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${emp.name} <span class="badge ${emp.role==='owner'?'badge--info': emp.role==='manager'?'badge--warning':'badge--neutral'}" style="margin-left:6px;font-size:10px;padding:3px 8px;border-radius:10px">${emp.role}</span></div>
                <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">📞 ${emp.phone} • ${(emp.stationIds||[]).length} station(s) • ${emp.status}</div>
              </div>
            </div>
            ${canManage ? `<button class="neu-btn edit-emp" data-id="${emp.id||emp.uid}" style="min-height:36px;padding:0 14px;border-radius:10px;font-size:12px;font-weight:600">Edit</button>` : ''}
          </div>
        `).join('') || `<div class="neu-card empty" style="padding:20px;text-align:center"><p>No employees</p></div>`}
      </div>
    </div>
    <div id="modalRoot"></div>
  `;

  const modalRoot = document.getElementById('modalRoot');

  root.querySelector('#addEmp')?.addEventListener('click', ()=> openEmpModal());
  root.querySelectorAll('.edit-emp').forEach(btn=> btn.addEventListener('click', ()=>{
    const emp = employees.find(e=> (e.id||e.uid)===btn.dataset.id);
    openEmpModal(emp);
  }));

  function openEmpModal(existing=null) {
    const allStationOptions = stations.map(s=>`<label style="display:flex;gap:8px;align-items:center;font-size:13px;padding:6px 0"><input type="checkbox" value="${s.id}" ${existing?.stationIds?.includes(s.id)?'checked':''} class="station-check" style="width:16px;height:16px"> ${s.name}</label>`).join('');
    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="backdrop"><div class="modal" style="border-radius:16px;max-width:400px">
        <div style="display:flex;justify-content:space-between;align-items:center"><h3 style="font-weight:700">${existing?'Edit Employee':'New Employee'}</h3><button id="closeM" class="neu-btn" style="min-height:36px;min-width:36px;border-radius:50%">✕</button></div>
        <div class="grid" style="margin-top:16px;gap:14px">
          <div><label class="label">Name</label><input id="e_name" class="neu-input" value="${existing?.name||''}" placeholder="Rahul" style="min-height:44px;border-radius:10px"></div>
          <div><label class="label">Phone (10 digits)</label><input id="e_phone" class="neu-input" value="${existing?.phone? existing.phone.replace(/\\D/g,'').slice(-10):''}" placeholder="9948288169" inputmode="numeric" maxlength="10" style="min-height:44px;border-radius:10px"></div>
          ${!existing ? `<div><label class="label">4-digit PIN</label><input id="e_pin" class="neu-input" type="password" inputmode="numeric" maxlength="4" placeholder="••••" style="min-height:44px;border-radius:10px"></div>` : ''}
          <div><label class="label">Role</label><select id="e_role" class="neu-select" style="min-height:44px;border-radius:10px">
            <option value="attendant" ${existing?.role==='attendant'?'selected':''}>Attendant</option>
            <option value="manager" ${existing?.role==='manager'?'selected':''}>Manager</option>
            <option value="admin" ${existing?.role==='admin'?'selected':''}>Admin</option>
            ${user.role==='owner'? `<option value="owner" ${existing?.role==='owner'?'selected':''}>Owner</option>`:''}
          </select></div>
          <div><label class="label">Assigned Stations</label><div class="neu-card neu-card--inset" style="padding:12px;display:flex;flex-direction:column;gap:4px;border-radius:10px">${allStationOptions}</div></div>
          <button id="saveEmp" class="neu-btn neu-btn--primary neu-btn--block" style="min-height:48px;border-radius:12px;font-weight:700">${existing?'Update':'Create'}</button>
        </div>
      </div></div>`;
    modalRoot.querySelector('#backdrop').addEventListener('click', e=>{ if(e.target.id==='backdrop') modalRoot.innerHTML=''; });
    modalRoot.querySelector('#closeM').addEventListener('click', ()=> modalRoot.innerHTML='');
    modalRoot.querySelector('#saveEmp').addEventListener('click', async ()=>{
      const name = modalRoot.querySelector('#e_name').value.trim();
      const phoneRaw = modalRoot.querySelector('#e_phone').value.trim();
      const role = modalRoot.querySelector('#e_role').value;
      const pin = modalRoot.querySelector('#e_pin')?.value.trim();
      const stationIds = Array.from(modalRoot.querySelectorAll('.station-check:checked')).map(c=>c.value);
      if (!name || !phoneRaw) return alert('Name and phone required');
      const phone = normalizePhone(phoneRaw);
      if (!existing && (!pin || pin.length!==4)) return alert('4-digit PIN required');
      try {
        if (existing) {
          await updateEmployee(existing.id||existing.uid, { name, phone, role, stationIds });
        } else {
          await registerUserInFirebase({ phone, pin, name, role, stationIds });
        }
        modalRoot.innerHTML='';
        employeesView({ root });
      } catch(e){ alert('Error: '+e.message); }
    });
  }
}
