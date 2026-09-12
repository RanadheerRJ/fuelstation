import { getState } from '../state.js';
import { getPumps, getNozzles, createPump, createNozzle, updatePump, updateNozzle } from '../services/pumps.js';
import { getStationsForCurrentUser } from '../services/stations.js';

export async function pumpsView({ root }) {
  const { currentStationId, user } = getState();
  const stations = await getStationsForCurrentUser();
  let stationId = currentStationId || stations[0]?.id;
  if (!stationId) {
    root.innerHTML = `<div class="container"><div class="neu-card empty"><p>No station selected</p><button class="neu-btn" onclick="location.hash='#/stations'">Go to Stations</button></div></div>`;
    return;
  }
  const station = stations.find(s=>s.id===stationId) || stations[0];
  const pumps = await getPumps(station.id);
  const nozzles = await getNozzles(station.id);

  const canManage = ['owner','admin','manager'].includes(user.role);

  root.innerHTML = `
    <div class="container">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><h1 class="page-title">Pumps & Nozzles</h1><p class="page-sub">${station.name} • ${pumps.length} pumps • ${nozzles.length} nozzles</p></div>
        <div style="display:flex;gap:8px">
          ${canManage ? `<button id="addPumpBtn" class="neu-btn neu-btn--small neu-btn--primary">+ Pump</button><button id="addNozzleBtn" class="neu-btn neu-btn--small">+ Nozzle</button>` : ''}
        </div>
      </div>

      <div class="list" style="margin-top:18px">
        ${pumps.map(p=>{
          const pNozzles = nozzles.filter(n=>n.pumpId===p.id);
          return `
            <div class="neu-card">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <div style="font-weight:800">⛽ ${p.name} <span style="font-weight:400;color:var(--text-muted);font-size:12px">#${p.number}</span></div>
                <span class="badge ${p.status==='active'?'badge--success':'badge--neutral'}">${p.status}</span>
              </div>
              <div class="list" style="margin-top:12px">
                ${pNozzles.map(n=>`
                  <div class="neu-card neu-card--sm" style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                      <div style="font-weight:700;font-size:13px">Nozzle ${n.number} • <span class="fuel-${n.fuelType.toLowerCase().replace(' ','-')}">${n.fuelType}</span></div>
                      <div style="font-size:11px;color:var(--text-muted)">Last: ${Number(n.lastReading||0).toFixed(2)}</div>
                    </div>
                    <div style="display:flex;gap:6px;align-items:center">
                      <span class="badge ${n.status==='active'?'badge--success':'badge--neutral'}">${n.status}</span>
                      ${canManage ? `<button class="neu-btn neu-btn--small edit-nozzle" data-id="${n.id}">Edit</button>` : ''}
                    </div>
                  </div>
                `).join('') || `<p style="font-size:12px;color:var(--text-muted)">No nozzles yet</p>`}
              </div>
            </div>
          `;
        }).join('') || `<div class="neu-card empty"><div class="emoji">🔧</div><p>No pumps configured</p><p style="font-size:12px;color:var(--text-muted)">Create a pump and add nozzles</p></div>`}
      </div>
    </div>
    <div id="modalRoot"></div>
  `;

  const modalRoot = root.querySelector('#modalRoot') || document.getElementById('modalRoot');

  root.querySelector('#addPumpBtn')?.addEventListener('click', ()=> openPumpModal());
  root.querySelector('#addNozzleBtn')?.addEventListener('click', ()=> openNozzleModal());
  root.querySelectorAll('.edit-nozzle').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const nozzle = nozzles.find(n=>n.id===btn.dataset.id);
      openNozzleModal(nozzle);
    });
  });

  function openPumpModal() {
    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="backdrop"><div class="modal">
        <div style="display:flex;justify-content:space-between"><h3 style="font-weight:800">New Pump</h3><button class="neu-btn neu-btn--small" id="closeM">✕</button></div>
        <div class="grid" style="margin-top:14px">
          <div><label class="label">Pump Name</label><input id="p_name" class="neu-input" placeholder="Pump 1"></div>
          <div><label class="label">Pump Number</label><input id="p_num" class="neu-input" type="number" placeholder="1"></div>
          <button id="savePump" class="neu-btn neu-btn--primary neu-btn--block">Create Pump</button>
        </div>
      </div></div>`;
    modalRoot.querySelector('#backdrop').addEventListener('click', e=>{ if(e.target.id==='backdrop') modalRoot.innerHTML=''; });
    modalRoot.querySelector('#closeM').addEventListener('click', ()=> modalRoot.innerHTML='');
    modalRoot.querySelector('#savePump').addEventListener('click', async ()=>{
      const name = modalRoot.querySelector('#p_name').value.trim();
      const number = modalRoot.querySelector('#p_num').value.trim();
      if (!name || !number) return alert('Fill all');
      try { await createPump(station.id, { name, number }); modalRoot.innerHTML=''; pumpsView({ root }); } catch(e){ alert(e.message); }
    });
  }

  function openNozzleModal(existing=null) {
    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="backdrop"><div class="modal">
        <div style="display:flex;justify-content:space-between"><h3 style="font-weight:800">${existing?'Edit Nozzle':'New Nozzle'}</h3><button class="neu-btn neu-btn--small" id="closeM">✕</button></div>
        <div class="grid" style="margin-top:14px">
          <div><label class="label">Pump</label><select id="n_pump" class="neu-select">${pumps.map(p=>`<option value="${p.id}" ${existing?.pumpId===p.id?'selected':''}>${p.name}</option>`).join('')}</select></div>
          <div><label class="label">Nozzle Number</label><input id="n_num" class="neu-input" type="number" value="${existing?.number||''}" placeholder="1"></div>
          <div><label class="label">Fuel Type</label><select id="n_fuel" class="neu-select">
            <option value="Petrol" ${existing?.fuelType==='Petrol'?'selected':''}>Petrol</option>
            <option value="Diesel" ${existing?.fuelType==='Diesel'?'selected':''}>Diesel</option>
            <option value="Premium Petrol" ${existing?.fuelType==='Premium Petrol'?'selected':''}>Premium Petrol</option>
            <option value="CNG" ${existing?.fuelType==='CNG'?'selected':''}>CNG</option>
          </select></div>
          <div><label class="label">Last Reading</label><input id="n_read" class="neu-input" type="number" step="0.01" value="${existing?.lastReading||0}"></div>
          <div><label class="label">Status</label><select id="n_status" class="neu-select"><option value="active" ${existing?.status==='active'?'selected':''}>Active</option><option value="inactive" ${existing?.status==='inactive'?'selected':''}>Inactive</option></select></div>
          <button id="saveNozzle" class="neu-btn neu-btn--primary neu-btn--block">${existing?'Update':'Create'}</button>
        </div>
      </div></div>`;
    modalRoot.querySelector('#backdrop').addEventListener('click', e=>{ if(e.target.id==='backdrop') modalRoot.innerHTML=''; });
    modalRoot.querySelector('#closeM').addEventListener('click', ()=> modalRoot.innerHTML='');
    modalRoot.querySelector('#saveNozzle').addEventListener('click', async ()=>{
      const pumpId = modalRoot.querySelector('#n_pump').value;
      const number = modalRoot.querySelector('#n_num').value;
      const fuelType = modalRoot.querySelector('#n_fuel').value;
      const lastReading = modalRoot.querySelector('#n_read').value;
      const status = modalRoot.querySelector('#n_status').value;
      if (!pumpId || !number) return alert('Fill required');
      try {
        if (existing) await updateNozzle(existing.id, { pumpId, number: Number(number), fuelType, lastReading: Number(lastReading), status });
        else await createNozzle(station.id, pumpId, { number: Number(number), fuelType, lastReading: Number(lastReading), status });
        modalRoot.innerHTML=''; pumpsView({ root });
      } catch(e){ alert(e.message); }
    });
  }
}
