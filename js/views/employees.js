import { getState } from '../state.js';
import { getEmployees, createEmployee, updateEmployee } from '../services/users.js';
import { getStationsForCurrentUser } from '../services/stations.js';
import { registerUserInFirebase } from '../auth.js';

export async function employeesView({ root }) {
  const { user, currentStationId } = getState();
  const stations = await getStationsForCurrentUser();
  let stationId = currentStationId || stations[0]?.id;
  const employees = stationId ? await getEmployees(stationId) : await getEmployees();

  const canManage = ['owner','admin','manager'].includes(user.role);

  root.innerHTML = `
    <div class="container">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><h1 class="page-title">Employees</h1><p class="page-sub">${employees.length} employee(s)</p></div>
        ${canManage ? `<button id="addEmp" class="neu-btn neu-btn--primary neu-btn--small">+ Add</button>` : ''}
      </div>

      <div class="list" style="margin-top:18px">
        ${employees.map(emp=>`
          <div class="neu-card" style="display:flex;justify-content:space-between;align-items:center">
            <div style="display:flex;gap:12px;align-items:center">
              <div class="avatar">${(emp.name||emp.phone||'?').slice(0,2).toUpperCase()}</div>
              <div>
                <div style="font-weight:800;font-size:14px">${emp.name} <span class="badge ${emp.role==='owner'?'badge--info': emp.role==='manager'?'badge--warning':'badge--neutral'}" style="margin-left:6px">${emp.role}</span></div>
                <div style="font-size:11px;color:var(--text-muted)">${emp.phone} • ${(emp.stationIds||[]).length} station(s) • ${emp.status}</div>
              </div>
            </div>
            ${canManage ? `<button class="neu-btn neu-btn--small edit-emp" data-id="${emp.id||emp.uid}">Edit</button>` : ''}
          </div>
        `).join('') || `<div class="neu-card empty"><p>No employees</p></div>`}
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
    const allStationOptions = stations.map(s=>`<label style="display:flex;gap:8px;align-items:center;font-size:13px"><input type="checkbox" value="${s.id}" ${existing?.stationIds?.includes(s.id)?'checked':''} class="station-check"> ${s.name}</label>`).join('');
    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="backdrop"><div class="modal">
        <div style="display:flex;justify-content:space-between"><h3 style="font-weight:800">${existing?'Edit Employee':'New Employee'}</h3><button id="closeM" class="neu-btn neu-btn--small">✕</button></div>
        <div class="grid" style="margin-top:14px">
          <div><label class="label">Name</label><input id="e_name" class="neu-input" value="${existing?.name||''}" placeholder="Rahul"></div>
          <div><label class="label">Phone</label><input id="e_phone" class="neu-input" value="${existing?.phone||''}" placeholder="+91..."></div>
          ${!existing ? `<div><label class="label">4-digit PIN</label><input id="e_pin" class="neu-input" maxlength="4" placeholder="1234"></div>` : ''}
          <div><label class="label">Role</label><select id="e_role" class="neu-select">
            <option value="attendant" ${existing?.role==='attendant'?'selected':''}>Attendant</option>
            <option value="manager" ${existing?.role==='manager'?'selected':''}>Manager</option>
            <option value="admin" ${existing?.role==='admin'?'selected':''}>Admin</option>
            ${user.role==='owner'? `<option value="owner" ${existing?.role==='owner'?'selected':''}>Owner</option>`:''}
          </select></div>
          <div><label class="label">Assigned Stations</label><div class="neu-card neu-card--inset" style="padding:12px;display:flex;flex-direction:column;gap:8px">${allStationOptions}</div></div>
          <button id="saveEmp" class="neu-btn neu-btn--primary neu-btn--block">${existing?'Update':'Create'}</button>
          <p style="font-size:11px;color:var(--text-muted)">In production, Firebase Auth email = phone@fuelops.app and password = derived from PIN (not stored plain). Demo stores obfuscated PIN locally.</p>
        </div>
      </div></div>`;
    modalRoot.querySelector('#backdrop').addEventListener('click', e=>{ if(e.target.id==='backdrop') modalRoot.innerHTML=''; });
    modalRoot.querySelector('#closeM').addEventListener('click', ()=> modalRoot.innerHTML='');
    modalRoot.querySelector('#saveEmp').addEventListener('click', async ()=>{
      const name = modalRoot.querySelector('#e_name').value.trim();
      const phone = modalRoot.querySelector('#e_phone').value.trim();
      const role = modalRoot.querySelector('#e_role').value;
      const pin = modalRoot.querySelector('#e_pin')?.value.trim();
      const stationIds = Array.from(modalRoot.querySelectorAll('.station-check:checked')).map(c=>c.value);
      if (!name || !phone) return alert('Name and phone required');
      if (!existing && (!pin || pin.length!==4)) return alert('4-digit PIN required');
      try {
        if (existing) {
          await updateEmployee(existing.id||existing.uid, { name, phone, role, stationIds });
        } else {
          // try firebase registration
          await registerUserInFirebase({ phone, pin, name, role, stationIds });
          // also create via service for demo consistency if needed, but register already does
          // In demo, registerUserInFirebase already adds
          if (stations.length===0) {
            // fallback via service
            await createEmployee({ name, phone, role, stationIds, pin });
          }
        }
        modalRoot.innerHTML='';
        employeesView({ root });
      } catch(e){ alert('Error: '+e.message); }
    });
  }
}
