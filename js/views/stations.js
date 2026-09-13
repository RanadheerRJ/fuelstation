import { getAllStations, getStationsForCurrentUser, createStation, updateStation, deleteStation, resetStationData } from '../services/stations.js';
import { getState, setState } from '../state.js';

export async function stationsView({ root }) {
  const { user } = getState();
  const canCreate = ['owner','admin','manager','super_admin'].includes(user.role);
  const isSuperAdmin = user.role === 'super_admin';
  const isOwner = user.role === 'owner';
  const isAttendant = user.role === 'attendant';
  const canDestroy = isOwner || isSuperAdmin;
  const stations = await getStationsForCurrentUser();

  if (isAttendant) {
    const st = stations[0];
    root.innerHTML = `
      <div class="container" style="max-width:480px;margin:0 auto">
        <h1 class="page-title" style="font-size:20px">My Station</h1>
        <p class="page-sub" style="margin-top:4px">Attendant • Only your assigned station</p>
        ${st ? `
          <div class="neu-card" style="margin-top:16px;padding:18px;border-radius:14px;background:linear-gradient(135deg,#e6f4ff 0%,#ffffff 100%);border:1px solid #91caff">
            <div style="font-weight:700;font-size:18px">⛽ ${st.name}</div>
            <div style="font-size:13px;color:var(--text-secondary);margin-top:6px">${st.address||'No address'}</div>
            <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><span class="badge ${st.status==='active'?'badge--success':'badge--neutral'}" style="padding:6px 12px;border-radius:20px">${st.status}</span><span style="font-size:12px;color:var(--text-secondary)">📞 ${st.phone||''}</span></div>
            <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <button class="neu-btn" style="min-height:44px;border-radius:10px;font-weight:600" onclick="location.hash='#/pumps'">⛽ My Pumps</button>
              <button class="neu-btn" style="min-height:44px;border-radius:10px;font-weight:600" onclick="location.hash='#/stations/${st.id}/team'">👥 Team</button>
            </div>
          </div>
        ` : `<div class="neu-card empty" style="margin-top:16px;padding:20px;text-align:center"><p>No station assigned</p><p style="font-size:12px;color:var(--text-secondary);margin-top:4px">Contact owner/manager</p></div>`}
        <div style="margin-top:14px;padding:12px;background:var(--bg);border-radius:10px;border:0.5px solid var(--border)"><div style="font-size:11px;color:var(--text-secondary);text-align:center">🔒 Attendant view: Only your assigned station, no edit, no delete, no reset. Owner only can destroy data.</div></div>
      </div>
    `;
    return;
  }

  root.innerHTML = `
    <div class="container">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <div><h1 class="page-title">Stations</h1><p class="page-sub">${stations.length} station(s) • ${user.role}${isSuperAdmin ? ' • Super Admin' : ''}</p></div>
        ${canCreate ? `<button id="newStationBtn" class="neu-btn neu-btn--primary" style="min-height:44px;padding:0 18px;border-radius:12px;font-weight:700">+ New</button>` : ''}
      </div>
      ${isSuperAdmin ? `<div class="alert alert--info" style="margin-top:12px;font-size:12px"><b>Super Admin:</b> Select, Edit, Team, Reset Data, Delete any station.</div>` : ''}
      ${isOwner ? `<div class="alert alert--info" style="margin-top:12px;font-size:12px"><b>Owner Powers:</b> Only you can reset data and delete your stations. View Team Directory.</div>` : ''}
      ${!canDestroy ? `<div class="alert alert--warning" style="margin-top:12px;font-size:12px">🔒 Only Station Owner can reset or delete station data.</div>` : ''}
      <div class="list" style="margin-top:16px;display:flex;flex-direction:column;gap:12px">
        ${stations.map(s=>`
          <div class="neu-card" data-id="${s.id}" style="padding:16px;border-radius:14px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
              <div style="flex:1;min-width:0">
                <div style="font-weight:700;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.name}</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.address||'No address'}</div>
                <div style="margin-top:10px;display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span class="badge ${s.status==='active'?'badge--success':'badge--neutral'}" style="padding:5px 10px;border-radius:20px;font-size:11px">${s.status}</span><span style="font-size:11px;color:var(--text-tertiary)">${s.phone||''}</span></div>
              </div>
              <div style="display:flex;flex-direction:column;gap:8px;min-width:100px">
                <button class="neu-btn neu-btn--primary select-btn" data-id="${s.id}" style="min-height:36px;border-radius:10px;font-size:12px;font-weight:600">Select</button>
                <button class="neu-btn team-btn" data-id="${s.id}" style="min-height:36px;border-radius:10px;font-size:12px;background:#f0f0ff;border:1px solid #d0d0ff;color:#4c1d95;font-weight:600">👥 Team</button>
                ${canCreate ? `<button class="neu-btn edit-btn" data-id="${s.id}" style="min-height:36px;border-radius:10px;font-size:12px">Edit</button>` : ''}
                ${canDestroy ? `<button class="neu-btn reset-btn" data-id="${s.id}" data-name="${s.name}" style="min-height:36px;border-radius:10px;font-size:11px;background:#fffbe6;border:1px solid #ffe58f;color:#ad6800;font-weight:600">🗑️ Reset Data</button>` : ''}
                ${canDestroy ? `<button class="neu-btn delete-btn" data-id="${s.id}" data-name="${s.name}" style="min-height:36px;border-radius:10px;font-size:11px;background:#fff1f0;border:1px solid #ffccc7;color:var(--danger);font-weight:600">❌ Delete</button>` : ''}
              </div>
            </div>
          </div>
        `).join('') || `<div class="neu-card empty" style="padding:20px;text-align:center"><div style="font-size:32px">⛽</div><p style="margin-top:8px">No stations found</p></div>`}
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
    btn.addEventListener('click', ()=>{ location.hash = `#/stations/${btn.dataset.id}/team`; });
  });
  root.querySelectorAll('.edit-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> openStationModal(btn.dataset.id, stations.find(s=>s.id===btn.dataset.id)));
  });
  root.querySelectorAll('.reset-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.dataset.id; const name = btn.dataset.name;
      if (!confirm(`Owner: Reset ALL operational data for "${name}"? Keeps station, deletes ops. Cannot be undone!`)) return;
      const typed = prompt(`Type station name "${name}" to confirm reset:`);
      if (typed !== name) return alert('Name mismatch, cancelled');
      btn.disabled = true; btn.textContent = 'Resetting...';
      try { await resetStationData(id); alert(`✅ Station "${name}" data reset!`); stationsView({ root }); } catch(e){ alert('Reset failed: ' + e.message); btn.disabled = false; btn.textContent = '🗑️ Reset Data'; }
    });
  });
  root.querySelectorAll('.delete-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.dataset.id; const name = btn.dataset.name;
      if (!confirm(`⚠️ Owner: DELETE station "${name}" permanently? Deletes station + ALL data. Cannot be undone!`)) return;
      const typed = prompt(`DANGER: Type "DELETE ${name}" to confirm:`);
      if (typed !== `DELETE ${name}`) return alert('Mismatch');
      const typed2 = prompt(`Final check: Type station ID "${id.slice(0,6)}" to confirm:`);
      if (typed2 !== id.slice(0,6) && typed2 !== id) return alert('ID mismatch');
      btn.disabled = true; btn.textContent = 'Deleting...';
      try { await deleteStation(id); alert(`✅ Station "${name}" deleted!`); const { currentStationId } = getState(); if (currentStationId === id) setState({ currentStationId: null }); stationsView({ root }); } catch(e){ alert('Delete failed: ' + e.message); btn.disabled = false; btn.textContent = '❌ Delete'; }
    });
  });
  const newBtn = root.querySelector('#newStationBtn');
  if (newBtn) newBtn.addEventListener('click', ()=> openStationModal(null,null));

  function openStationModal(id, data) {
    const modalRoot = document.getElementById('modalRoot');
    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="backdrop"><div class="modal" style="border-radius:16px;max-width:400px">
        <div style="display:flex;justify-content:space-between;align-items:center"><h3 style="font-weight:700">${id?'Edit Station':'New Station'}</h3><button id="closeModal" class="neu-btn" style="min-height:36px;min-width:36px;border-radius:50%">✕</button></div>
        <div style="margin-top:16px;display:flex;flex-direction:column;gap:14px">
          <div><label class="label">Station Name *</label><input id="f_name" class="neu-input" value="${data?.name||''}" placeholder="Station A" style="min-height:44px;border-radius:10px"></div>
          <div><label class="label">Address</label><input id="f_address" class="neu-input" value="${data?.address||''}" placeholder="123 Main St" style="min-height:44px;border-radius:10px"></div>
          <div><label class="label">Phone</label><input id="f_phone" class="neu-input" value="${data?.phone||''}" placeholder="9948288169" style="min-height:44px;border-radius:10px"></div>
          <div><label class="label">Status</label><select id="f_status" class="neu-select" style="min-height:44px;border-radius:10px"><option value="active" ${data?.status==='active'?'selected':''}>Active</option><option value="inactive" ${data?.status==='inactive'?'selected':''}>Inactive</option></select></div>
          <button id="saveStation" class="neu-btn neu-btn--primary neu-btn--block" style="min-height:48px;border-radius:12px;font-weight:700">${id?'Update':'Create'}</button>
          ${id ? `<div style="height:1px;background:var(--border);margin:4px 0"></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button id="viewTeam" class="neu-btn" style="min-height:40px;border-radius:10px;background:#f0f0ff;border:1px solid #d0d0ff;color:#4c1d95;font-weight:600">👥 Team Directory</button>${canDestroy ? `<button id="modalReset" class="neu-btn" style="min-height:40px;border-radius:10px;background:#fffbe6;border:1px solid #ffe58f;color:#ad6800;font-weight:600">🗑️ Reset Data</button>` : ''}${canDestroy ? `<button id="modalDelete" class="neu-btn" style="min-height:40px;border-radius:10px;background:#fff1f0;border:1px solid #ffccc7;color:var(--danger);font-weight:600">❌ Delete Station</button>` : ''}</div>${!canDestroy ? `<p style="font-size:11px;color:var(--text-secondary);text-align:center;margin-top:8px">🔒 Only Station Owner can reset/delete</p>` : ''}` : ''}
        </div>
      </div></div>
    `;
    modalRoot.querySelector('#backdrop').addEventListener('click', e=>{ if(e.target.id==='backdrop') modalRoot.innerHTML=''; });
    modalRoot.querySelector('#closeModal').addEventListener('click', ()=> modalRoot.innerHTML='');
    modalRoot.querySelector('#saveStation').addEventListener('click', async ()=>{
      const payload = { name: modalRoot.querySelector('#f_name').value.trim(), address: modalRoot.querySelector('#f_address').value.trim(), phone: modalRoot.querySelector('#f_phone').value.trim(), status: modalRoot.querySelector('#f_status').value };
      if (!payload.name) return alert('Name required');
      try { if (id) await updateStation(id, payload); else await createStation(payload); modalRoot.innerHTML=''; stationsView({ root }); } catch(e){ alert(e.message); }
    });
    modalRoot.querySelector('#viewTeam')?.addEventListener('click', ()=>{ modalRoot.innerHTML=''; location.hash = `#/stations/${id}/team`; });
    modalRoot.querySelector('#modalReset')?.addEventListener('click', async ()=>{ const station = stations.find(s=>s.id===id); if (!confirm(`Reset ALL operational data for "${station?.name}"?`)) return; const typed = prompt(`Type "${station?.name}" to confirm:`); if (typed !== station?.name) return alert('Mismatch'); try { await resetStationData(id); alert(`✅ Station "${station?.name}" data reset!`); modalRoot.innerHTML=''; stationsView({ root }); } catch(e){ alert(e.message); } });
    modalRoot.querySelector('#modalDelete')?.addEventListener('click', async ()=>{ const station = stations.find(s=>s.id===id); if (!confirm(`DELETE station "${station?.name}" permanently?`)) return; const typed = prompt(`Type "DELETE ${station?.name}" to confirm:`); if (typed !== `DELETE ${station?.name}`) return alert('Mismatch'); try { await deleteStation(id); alert(`✅ Station "${station?.name}" deleted!`); const { currentStationId } = getState(); if (currentStationId === id) setState({ currentStationId: null }); modalRoot.innerHTML=''; stationsView({ root }); } catch(e){ alert(e.message); } });
  }
}
