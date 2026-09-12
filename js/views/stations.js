import { getAllStations, getStationsForCurrentUser, createStation, updateStation } from '../services/stations.js';
import { getState, setState } from '../state.js';

export async function stationsView({ root }) {
  const { user } = getState();
  const canCreate = ['owner','admin','manager'].includes(user.role);
  const stations = await getStationsForCurrentUser();

  root.innerHTML = `
    <div class="container">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><h1 class="page-title">Stations</h1><p class="page-sub">${stations.length} station(s) • ${user.role}</p></div>
        ${canCreate ? `<button id="newStationBtn" class="neu-btn neu-btn--primary neu-btn--small">+ New</button>` : ''}
      </div>

      <div class="list" style="margin-top:18px">
        ${stations.map(s=>`
          <div class="neu-card" data-id="${s.id}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <div>
                <div style="font-weight:800;font-size:16px">${s.name}</div>
                <div style="font-size:12px;color:var(--text-muted);margin-top:4px">${s.address||''}</div>
                <div style="margin-top:8px;display:flex;gap:6px;align-items:center"><span class="badge ${s.status==='active'?'badge--success':'badge--neutral'}">${s.status}</span><span style="font-size:11px;color:var(--text-muted)">${s.phone||''}</span></div>
              </div>
              <div style="display:flex;flex-direction:column;gap:6px">
                <button class="neu-btn neu-btn--small select-btn" data-id="${s.id}">Select</button>
                ${canCreate ? `<button class="neu-btn neu-btn--small edit-btn" data-id="${s.id}">Edit</button>` : ''}
              </div>
            </div>
          </div>
        `).join('') || `<div class="neu-card empty"><div class="emoji">⛽</div><p>No stations found</p></div>`}
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

  root.querySelectorAll('.edit-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> openStationModal(btn.dataset.id, stations.find(s=>s.id===btn.dataset.id)));
  });

  const newBtn = root.querySelector('#newStationBtn');
  if (newBtn) newBtn.addEventListener('click', ()=> openStationModal(null,null));

  function openStationModal(id, data) {
    const modalRoot = document.getElementById('modalRoot');
    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="backdrop">
        <div class="modal">
          <div style="display:flex;justify-content:space-between;align-items:center"><h3 style="font-weight:800">${id?'Edit Station':'New Station'}</h3><button id="closeModal" class="neu-btn neu-btn--small">✕</button></div>
          <div style="margin-top:16px" class="grid">
            <div><label class="label">Station Name</label><input id="f_name" class="neu-input" value="${data?.name||''}" placeholder="Station A"></div>
            <div><label class="label">Address</label><input id="f_address" class="neu-input" value="${data?.address||''}" placeholder="123 Main St"></div>
            <div><label class="label">Phone</label><input id="f_phone" class="neu-input" value="${data?.phone||''}" placeholder="+91..."></div>
            <div><label class="label">Status</label><select id="f_status" class="neu-select"><option value="active" ${data?.status==='active'?'selected':''}>Active</option><option value="inactive" ${data?.status==='inactive'?'selected':''}>Inactive</option></select></div>
            <button id="saveStation" class="neu-btn neu-btn--primary neu-btn--block">${id?'Update':'Create'}</button>
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
  }
}
