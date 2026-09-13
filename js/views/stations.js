import { getAllStations, getStationsForCurrentUser, createStation, updateStation, deleteStation, resetStationData } from '../services/stations.js';
import { getState, setState } from '../state.js';

export async function stationsView({ root }) {
  const { user } = getState();
  const canCreate = ['owner','admin','manager','super_admin'].includes(user.role);
  const isSuperAdmin = user.role === 'super_admin';
  const isAdmin = ['owner','admin','super_admin'].includes(user.role);
  const isManagerOrAbove = ['owner','admin','manager','super_admin'].includes(user.role);
  const stations = await getStationsForCurrentUser();

  root.innerHTML = `
    <div class="container">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><h1 class="page-title">Stations</h1><p class="page-sub">${stations.length} station(s) • ${user.role}${isSuperAdmin ? ' • Super Admin' : ''}</p></div>
        ${canCreate ? `<button id="newStationBtn" class="neu-btn neu-btn--primary neu-btn--small">+ New</button>` : ''}
      </div>

      ${isSuperAdmin ? `<div class="alert alert--info" style="margin-top:12px"><b>Super Admin:</b> Select, Edit, Team, Reset Data, Delete any station. Phone directory shows full family tree.</div>` : ''}
      ${isAdmin && !isSuperAdmin ? `<div class="alert alert--info" style="margin-top:12px"><b>Admin Powers:</b> You can reset data and delete your own stations. View Team Directory to see who is there.</div>` : ''}

      <div class="list" style="margin-top:18px">
        ${stations.map(s=>`
          <div class="neu-card" data-id="${s.id}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
              <div style="flex:1;min-width:0">
                <div style="font-weight:700;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.name}</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.address||'No address'}</div>
                <div style="margin-top:8px;display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span class="badge ${s.status==='active'?'badge--success':'badge--neutral'}">${s.status}</span><span style="font-size:11px;color:var(--text-tertiary)">${s.phone||''}</span><span style="font-size:10px;color:var(--text-tertiary)">ID: ${s.id.slice(0,6)}</span></div>
              </div>
              <div style="display:flex;flex-direction:column;gap:6px;min-width:90px">
                <button class="neu-btn neu-btn--small neu-btn--primary select-btn" data-id="${s.id}" style="font-size:12px">Select</button>
                <button class="neu-btn neu-btn--small team-btn" data-id="${s.id}" style="font-size:11px;background:#f0f0ff;border:0.5px solid #d0d0ff;color:#4c1d95">👥 Team</button>
                ${canCreate ? `<button class="neu-btn neu-btn--small edit-btn" data-id="${s.id}" style="font-size:12px">Edit</button>` : ''}
                ${isManagerOrAbove ? `<button class="neu-btn neu-btn--small reset-btn" data-id="${s.id}" data-name="${s.name}" style="font-size:11px;background:#fffbe6;border:0.5px solid #ffe58f;color:#ad6800">🗑️ Reset Data</button>` : ''}
                ${isAdmin ? `<button class="neu-btn neu-btn--small delete-btn" data-id="${s.id}" data-name="${s.name}" style="font-size:11px;background:#fff1f0;border:0.5px solid #ffccc7;color:var(--danger)">❌ Delete</button>` : ''}
              </div>
            </div>
          </div>
        `).join('') || `<div class="neu-card empty"><div style="font-size:32px">⛽</div><p style="margin-top:8px">No stations found</p><p style="font-size:12px;color:var(--text-secondary);margin-top:4px">${isSuperAdmin ? 'Create your first station' : 'Contact Super Admin'}</p></div>`}
      </div>
    </div>

    <div id="modalRoot"></div>
  `;

  root.querySelectorAll('.select-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      setState({ currentStationId: btn.dataset.id });
      location.hash = '#/dashboard';
    });
  });

  root.querySelectorAll('.team-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      location.hash = `#/stations/${btn.dataset.id}/team`;
    });
  });

  root.querySelectorAll('.edit-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> openStationModal(btn.dataset.id, stations.find(s=>s.id===btn.dataset.id)));
  });

  root.querySelectorAll('.reset-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.dataset.id;
      const name = btn.dataset.name;
      if (!confirm(`${isSuperAdmin ? 'Super Admin' : 'Admin'}: Reset ALL operational data for "${name}"?\n\nWill DELETE:\n• Pumps & Nozzles\n• Prices\n• Shifts & Transactions\n• Notes & Audit logs\n\nKeeps: Station itself\n\nCannot be undone!`)) return;
      const typed = prompt(`Type station name "${name}" to confirm reset:`);
      if (typed !== name) return alert('Name mismatch, cancelled');
      
      btn.disabled = true;
      btn.textContent = 'Resetting...';
      try {
        await resetStationData(id);
        alert(`✅ Station "${name}" data reset! Pumps, nozzles, prices, shifts cleared.`);
        stationsView({ root });
      } catch(e){
        alert('Reset failed: ' + e.message);
        btn.disabled = false;
        btn.textContent = '🗑️ Reset Data';
      }
    });
  });

  root.querySelectorAll('.delete-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.dataset.id;
      const name = btn.dataset.name;
      if (!confirm(`⚠️ ${isSuperAdmin ? 'SUPER ADMIN' : 'ADMIN'}: DELETE station "${name}" permanently?\n\nThis will DELETE:\n• Station "${name}"\n• ALL pumps & nozzles\n• ALL prices\n• ALL shifts & transactions\n• ALL notes & logs for this station\n\nCannot be undone!`)) return;
      const typed = prompt(`DANGER: Type "DELETE ${name}" to confirm:`);
      if (typed !== `DELETE ${name}`) return alert('Confirmation mismatch, cancelled');
      const typed2 = prompt(`Final check: Type station ID "${id.slice(0,6)}" to confirm:`);
      if (typed2 !== id.slice(0,6) && typed2 !== id) return alert('ID mismatch, cancelled');

      btn.disabled = true;
      btn.textContent = 'Deleting...';
      try {
        await deleteStation(id);
        alert(`✅ Station "${name}" deleted!`);
        // If current station was deleted, clear it
        const { currentStationId } = getState();
        if (currentStationId === id) setState({ currentStationId: null });
        stationsView({ root });
      } catch(e){
        alert('Delete failed: ' + e.message);
        btn.disabled = false;
        btn.textContent = '❌ Delete';
      }
    });
  });

  const newBtn = root.querySelector('#newStationBtn');
  if (newBtn) newBtn.addEventListener('click', ()=> openStationModal(null,null));

  function openStationModal(id, data) {
    const modalRoot = document.getElementById('modalRoot');
    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="backdrop">
        <div class="modal">
          <div style="display:flex;justify-content:space-between;align-items:center"><h3 style="font-weight:700">${id?'Edit Station':'New Station'}</h3><button id="closeModal" class="neu-btn neu-btn--small">✕</button></div>
          <div style="margin-top:16px" class="grid" style="gap:14px">
            <div><label class="label">Station Name *</label><input id="f_name" class="neu-input" value="${data?.name||''}" placeholder="Station A"></div>
            <div><label class="label">Address</label><input id="f_address" class="neu-input" value="${data?.address||''}" placeholder="123 Main St"></div>
            <div><label class="label">Phone</label><input id="f_phone" class="neu-input" value="${data?.phone||''}" placeholder="9948288169"></div>
            <div><label class="label">Status</label><select id="f_status" class="neu-select"><option value="active" ${data?.status==='active'?'selected':''}>Active</option><option value="inactive" ${data?.status==='inactive'?'selected':''}>Inactive</option></select></div>
            <button id="saveStation" class="neu-btn neu-btn--primary neu-btn--block">${id?'Update':'Create'}</button>
            ${id ? `
              <div style="height:0.5px;background:var(--border);margin:4px 0"></div>
              <div class="grid grid-2" style="gap:8px">
                <button id="viewTeam" class="neu-btn neu-btn--small" style="background:#f0f0ff;border:0.5px solid #d0d0ff;color:#4c1d95">👥 Team Directory</button>
                ${isManagerOrAbove ? `<button id="modalReset" class="neu-btn neu-btn--small" style="background:#fffbe6;border:0.5px solid #ffe58f;color:#ad6800">🗑️ Reset Data</button>` : ''}
                ${isAdmin ? `<button id="modalDelete" class="neu-btn neu-btn--small" style="background:#fff1f0;border:0.5px solid #ffccc7;color:var(--danger)">❌ Delete Station</button>` : ''}
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
    modalRoot.querySelector('#backdrop').addEventListener('click', e=>{ if(e.target.id==='backdrop') modalRoot.innerHTML=''; });
    modalRoot.querySelector('#closeModal').addEventListener('click', ()=> modalRoot.innerHTML='');
    modalRoot.querySelector('#saveStation').addEventListener('click', async ()=>{
      const payload = {
        name: modalRoot.querySelector('#f_name').value.trim(),
        address: modalRoot.querySelector('#f_address').value.trim(),
        phone: modalRoot.querySelector('#f_phone').value.trim(),
        status: modalRoot.querySelector('#f_status').value,
      };
      if (!payload.name) return alert('Name required');
      try {
        if (id) await updateStation(id, payload);
        else await createStation(payload);
        modalRoot.innerHTML='';
        stationsView({ root });
      } catch(e){ alert(e.message); }
    });

    modalRoot.querySelector('#viewTeam')?.addEventListener('click', ()=>{
      modalRoot.innerHTML='';
      location.hash = `#/stations/${id}/team`;
    });

    modalRoot.querySelector('#modalReset')?.addEventListener('click', async ()=>{
      const station = stations.find(s=>s.id===id);
      if (!confirm(`Reset ALL operational data for "${station?.name}"?`)) return;
      const typed = prompt(`Type "${station?.name}" to confirm:`);
      if (typed !== station?.name) return alert('Mismatch');
      try {
        await resetStationData(id);
        alert(`✅ Station "${station?.name}" data reset!`);
        modalRoot.innerHTML='';
        stationsView({ root });
      } catch(e){ alert(e.message); }
    });

    modalRoot.querySelector('#modalDelete')?.addEventListener('click', async ()=>{
      const station = stations.find(s=>s.id===id);
      if (!confirm(`DELETE station "${station?.name}" permanently?`)) return;
      const typed = prompt(`Type "DELETE ${station?.name}" to confirm:`);
      if (typed !== `DELETE ${station?.name}`) return alert('Mismatch');
      try {
        await deleteStation(id);
        alert(`✅ Station "${station?.name}" deleted!`);
        const { currentStationId } = getState();
        if (currentStationId === id) setState({ currentStationId: null });
        modalRoot.innerHTML='';
        stationsView({ root });
      } catch(e){ alert(e.message); }
    });
  }
}
