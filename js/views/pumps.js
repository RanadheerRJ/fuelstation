import { getState } from '../state.js';
import { getPumps, getNozzles, createPump, createNozzle, updatePump, updateNozzle, deletePump, deleteNozzle } from '../services/pumps.js';
import { getStationsForCurrentUser } from '../services/stations.js';
import { getShifts } from '../services/shifts.js';

function fuelTypeClass(fuelType) {
  if (fuelType === 'Petrol') return 'petrol';
  if (fuelType === 'Diesel') return 'diesel';
  if (fuelType === 'CNG') return 'cng';
  return 'premium';
}

function pumpIllustration() {
  return `
    <svg class="pump-illustration__svg" viewBox="0 0 104 120" fill="none" aria-hidden="true" focusable="false">
      <ellipse class="pump-illustration__shadow" cx="46" cy="110" rx="31" ry="5" />
      <circle class="pump-illustration__glow" cx="42" cy="18" r="13" />
      <path class="pump-illustration__hose" d="M69 39c22 0 24 15 24 27 0 10-4 17-12 17h-4" />
      <path class="pump-illustration__nozzle" d="M77 78h10v13H75v-7h7" />
      <rect class="pump-illustration__body" x="19" y="20" width="49" height="82" rx="8" />
      <rect class="pump-illustration__panel" x="27" y="29" width="33" height="27" rx="4" />
      <rect class="pump-illustration__screen" x="31" y="34" width="25" height="10" rx="2" />
      <path class="pump-illustration__line" d="M33 50h20M30 66h27M30 74h27" />
      <path class="pump-illustration__line" d="M25 102h38" />
      <circle class="pump-illustration__wheel" cx="30" cy="102" r="4" />
      <circle class="pump-illustration__wheel" cx="58" cy="102" r="4" />
      <circle class="pump-illustration__indicator" cx="61" cy="26" r="4" />
      <path class="pump-illustration__fuel" d="M81 84c3 4 5 7 5 10a5 5 0 1 1-10 0c0-3 2-6 5-10Z" />
    </svg>`;
}

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
  const activeShifts = await getShifts(station.id, { status: 'ACTIVE' }) || (await getShifts(station.id)).filter(s=>s.status==='ACTIVE');

  const canManage = ['owner','admin','manager','super_admin'].includes(user.role);
  const isAttendant = user.role === 'attendant';

  // Build pump occupancy map: pumpId -> { occupied, employeeName, shift, nozzleIds }
  const pumpOccupancy = {};
  pumps.forEach(p => {
    pumpOccupancy[p.id] = { occupied: false, employeeName: null, shift: null, nozzleIds: [] };
  });
  activeShifts.forEach(shift => {
    (shift.nozzles||[]).forEach(n => {
      if (pumpOccupancy[n.pumpId]) {
        pumpOccupancy[n.pumpId].occupied = true;
        pumpOccupancy[n.pumpId].employeeName = shift.employeeName || shift.userId?.slice(0,6) || 'Someone';
        pumpOccupancy[n.pumpId].shift = shift;
        pumpOccupancy[n.pumpId].nozzleIds.push(n.nozzleId);
      }
    });
  });

  const availableCount = pumps.filter(p => !pumpOccupancy[p.id]?.occupied).length;
  const occupiedCount = pumps.length - availableCount;

  root.innerHTML = `
    <div class="container pump-page">
      <header class="pump-page__header">
        <div>
          <div class="pump-page__eyebrow">Live forecourt</div>
          <h1 class="page-title">Pumps</h1>
          <p class="page-sub">${station.name} · ${pumps.length} configured · ${availableCount} available · ${occupiedCount} busy</p>
        </div>
        <div class="pump-page__actions">
          ${canManage ? `<button id="addPumpBtn" class="neu-btn neu-btn--small neu-btn--primary" type="button">+ Pump</button><button id="addNozzleBtn" class="neu-btn neu-btn--small" type="button">+ Nozzle</button><button id="siteGroundBtn" class="neu-btn neu-btn--small" type="button">Stock</button>` : ''}
        </div>
      </header>

      ${isAttendant ? `<div class="alert alert--info pump-notice">Pump assignments are visible here. Available pumps can be selected to begin a shift; busy pumps show the attendant currently fueling.</div>` : ''}

      <section class="pump-overview" aria-labelledby="pumpOverviewTitle">
        <div class="pump-overview__head">
          <div>
            <div class="pump-overview__eyebrow">At a glance</div>
            <h2 class="pump-overview__title" id="pumpOverviewTitle">All pump status</h2>
            <p class="pump-overview__description">Select any pump for its nozzles and shift details.</p>
          </div>
          <div class="pump-overview__totals" aria-label="Pump status totals">
            <span class="pump-total pump-total--available"><span class="status-light status-light--available"></span>${availableCount} Available</span>
            <span class="pump-total pump-total--busy"><span class="status-light status-light--busy"></span>${occupiedCount} Busy</span>
          </div>
        </div>
        <div class="status-overview">
          ${pumps.map(p => {
            const occ = pumpOccupancy[p.id];
            const isFree = !occ.occupied;
            const status = isFree ? 'available' : 'busy';
            const detail = isFree ? 'Available' : `Busy · ${occ.employeeName}`;
            return `
              <button class="status-overview__item status-overview__item--${status}" type="button" data-overview-pump-id="${p.id}" aria-label="View ${p.name}: ${detail}">
                <span class="status-overview__visual">${pumpIllustration()}</span>
                <span class="status-overview__copy">
                  <span class="status-overview__name">${p.name}</span>
                  <span class="status-overview__detail">${detail}</span>
                </span>
                <span class="status-overview__state"><span class="status-light status-light--${status}"></span>${isFree ? 'Available' : 'Busy'}</span>
              </button>`;
          }).join('') || `<div class="empty" style="grid-column:1/-1;padding:12px">No pumps configured yet.</div>`}
        </div>
      </section>

      <div class="pump-filter-bar" aria-label="Filter pumps by availability">
        <button class="filter-btn active" data-filter="all" type="button">All (${pumps.length})</button>
        <button class="filter-btn filter-btn--available" data-filter="free" type="button">Available (${availableCount})</button>
        <button class="filter-btn filter-btn--busy" data-filter="busy" type="button">Busy (${occupiedCount})</button>
      </div>

      <div class="pump-grid">
        ${pumps.map(p => {
          const occ = pumpOccupancy[p.id];
          const pNozzles = nozzles.filter(n => n.pumpId === p.id);
          const isFree = !occ.occupied;
          const status = isFree ? 'available' : 'busy';
          const fuelNames = pNozzles.map(n => n.fuelType).filter((type, index, all) => all.indexOf(type) === index);
          return `
            <button class="pump-card pump-card--${status} ${isFree ? 'pump-free' : 'pump-busy'}" type="button" data-pump-id="${p.id}" data-status="${isFree ? 'free' : 'busy'}" aria-label="View ${p.name}, ${isFree ? 'available' : `busy with ${occ.employeeName}`}">
              <span class="pump-card__head">
                <span class="pump-card__visual">${pumpIllustration()}</span>
                <span class="pump-card__title-wrap">
                  <span class="pump-card__title">${p.name}</span>
                  <span class="pump-card__subtitle">Pump #${p.number} · ${pNozzles.length} nozzle${pNozzles.length === 1 ? '' : 's'}</span>
                  <span class="pump-card__tag"><span class="status-light status-light--${status}"></span>${isFree ? 'Available now' : 'Fueling in progress'}</span>
                </span>
              </span>
              <span class="pump-card__fuel-row">
                ${pNozzles.map(n => `<span class="fuel-dot fuel-dot--${fuelTypeClass(n.fuelType)}" title="${n.fuelType} nozzle ${n.number}"></span>`).join('') || '<span class="pump-card__fuel-copy">No nozzles configured</span>'}
                ${pNozzles.length ? `<span class="pump-card__fuel-copy">${fuelNames.join(' · ')}</span>` : ''}
              </span>
              <span class="pump-card__footer">
                <span class="pump-card__availability">
                  <span class="status-light status-light--${status}"></span>
                  <span class="pump-card__availability-copy">
                    <span class="pump-card__availability-label">${isFree ? 'Available' : 'Busy'}</span>
                    <span class="pump-card__availability-detail">${isFree ? 'Select to start a shift' : `${occ.employeeName} is fueling`}</span>
                  </span>
                </span>
                <span class="pump-card__open">View details →</span>
              </span>
            </button>`;
        }).join('')}
      </div>

      ${pumps.length === 0 ? `<div class="neu-card empty pump-empty"><div class="emoji">⛽</div><p>No pumps configured</p><p style="font-size:12px;color:var(--text-secondary)">Create a pump and add nozzles to start using the live overview.</p></div>` : ''}

      <aside class="pump-legend" aria-label="Pump status legend">
        <span class="pump-legend__title">Status guide</span>
        <span class="pump-legend__item"><span class="status-light status-light--available"></span>Available — select to start a shift</span>
        <span class="pump-legend__item"><span class="status-light status-light--busy"></span>Busy — an attendant is fueling</span>
        <span class="pump-legend__item"><span class="fuel-dot fuel-dot--petrol"></span>Petrol <span class="fuel-dot fuel-dot--diesel"></span>Diesel <span class="fuel-dot fuel-dot--cng"></span>CNG <span class="fuel-dot fuel-dot--premium"></span>Premium</span>
        ${isAttendant ? '<span class="pump-legend__note">Your view keeps sensitive nozzle readings private.</span>' : ''}
      </aside>
    </div>

    <div id="modalRoot"></div>
  `;

  // Filter logic
  root.querySelectorAll('.filter-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      root.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;
      root.querySelectorAll('.pump-card').forEach(card=>{
        if (filter==='all') card.style.display='flex';
        else if (filter==='free') card.style.display = card.dataset.status==='free' ? 'flex' : 'none';
        else if (filter==='busy') card.style.display = card.dataset.status==='busy' ? 'flex' : 'none';
      });
    });
  });

  // Pump click - show details or take over
  root.querySelectorAll('.pump-card').forEach(card=>{
    card.addEventListener('click', ()=>{
      const pumpId = card.dataset.pumpId;
      const pump = pumps.find(p=>p.id===pumpId);
      const occ = pumpOccupancy[pumpId];
      const pNozzles = nozzles.filter(n=>n.pumpId===pumpId);
      openPumpDetailModal(pump, pNozzles, occ);
    });
  });

  const modalRoot = root.querySelector('#modalRoot') || document.getElementById('modalRoot');

  // The all-pumps overview is a shortcut to the same existing detail modal.
  root.querySelectorAll('.status-overview__item').forEach(item => {
    item.addEventListener('click', () => {
      const pumpId = item.dataset.overviewPumpId;
      const pump = pumps.find(p => p.id === pumpId);
      if (!pump) return;
      openPumpDetailModal(pump, nozzles.filter(n => n.pumpId === pumpId), pumpOccupancy[pumpId]);
    });
  });

  root.querySelector('#addPumpBtn')?.addEventListener('click', ()=> openPumpModal());
  root.querySelector('#addNozzleBtn')?.addEventListener('click', ()=> openNozzleModal());
  root.querySelector('#siteGroundBtn')?.addEventListener('click', ()=>{ location.hash = '#/siteground'; });

  function openPumpDetailModal(pump, pNozzles, occ) {
    const isFree = !occ.occupied;
    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="backdrop">
        <div class="modal" style="max-width:400px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h3 style="font-weight:700;display:flex;align-items:center;gap:8px">
              <span style="width:36px;height:36px;border-radius:10px;background:${isFree ? '#52c41a' : '#ff4d4f'};display:grid;place-items:center;color:white">⛽</span>
              ${pump.name}
            </h3>
            <button id="closeM" class="neu-btn neu-btn--small">✕</button>
          </div>
          
          <div style="margin-top:16px">
            <div style="padding:12px;border-radius:12px;background:${isFree ? '#f6ffed' : '#fff1f0'};border:1px solid ${isFree ? '#b7eb8f' : '#ffa39e'};display:flex;align-items:center;gap:10px">
              <div style="width:12px;height:12px;border-radius:50%;background:${isFree ? '#52c41a' : '#ff4d4f'};${!isFree ? 'animation:pulse 1s infinite' : ''}"></div>
              <div>
                <div style="font-weight:600;font-size:14px;color:${isFree ? '#389e0d' : '#cf1322'}">${isFree ? 'Available — Free to take over' : 'Occupied — Fueling in progress'}</div>
                ${!isFree ? `<div style="font-size:12px;margin-top:2px">👤 ${occ.employeeName} is working here</div>` : `<div style="font-size:11px;color:var(--text-secondary)">No one on this pump</div>`}
              </div>
            </div>

            ${!isFree ? `
              <div style="margin-top:12px;padding:12px;background:var(--bg);border-radius:12px;border:0.5px solid var(--border);text-align:center">
                <div style="font-size:32px;animation:bounce 1s infinite">⛽</div>
                <div style="font-size:12px;font-weight:600;margin-top:6px">${occ.employeeName} fueling...</div>
                <div style="display:flex;justify-content:center;gap:4px;margin-top:8px">
                  <span style="width:8px;height:8px;background:#ff4d4f;border-radius:50%;animation:pulse 0.8s infinite"></span>
                  <span style="width:8px;height:8px;background:#ff4d4f;border-radius:50%;animation:pulse 0.8s infinite 0.2s"></span>
                  <span style="width:8px;height:8px;background:#ff4d4f;border-radius:50%;animation:pulse 0.8s infinite 0.4s"></span>
                </div>
                <div style="font-size:10px;color:var(--text-tertiary);margin-top:6px">Live fueling animation • ${occ.shift?.id?.slice(0,6)||''}</div>
              </div>
            ` : ''}

            <div style="margin-top:16px">
              <div style="font-size:12px;font-weight:700;margin-bottom:8px">Nozzles (${pNozzles.length}) ${isAttendant ? '• Limited view' : ''}</div>
              <div style="display:flex;flex-direction:column;gap:8px">
                ${pNozzles.map(n=>{
                  const fuelColor = n.fuelType==='Petrol' ? '#1677ff' : n.fuelType==='Diesel' ? '#fa8c16' : n.fuelType==='CNG' ? '#52c41a' : '#722ed1';
                  const nozzleOccupied = activeShifts.some(sh => (sh.nozzles||[]).some(nn => nn.nozzleId === n.id));
                  return `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:var(--bg);border-radius:10px;border:0.5px solid var(--border)">
                      <div style="display:flex;align-items:center;gap:8px;flex:1">
                        <span style="width:12px;height:12px;border-radius:50%;background:${fuelColor};display:inline-block"></span>
                        <div style="flex:1">
                          <div style="font-weight:600;font-size:13px">Nozzle ${n.number} • ${n.fuelType} ${nozzleOccupied ? '🔴 Busy' : '🟢 Free'}</div>
                          ${!isAttendant ? `<div style="font-size:11px;color:var(--text-secondary)">Last: ${Number(n.lastReading||0).toFixed(2)} ${nozzleOccupied ? '• In active shift' : '• Free to delete'}</div>` : `<div style="font-size:10px;color:var(--text-secondary)">Fuel type only</div>`}
                        </div>
                      </div>
                      <div style="display:flex;align-items:center;gap:6px">
                        <span class="badge ${n.status==='active'?'badge--success':'badge--neutral'}" style="font-size:10px">${n.status}</span>
                        ${canManage ? (nozzleOccupied ? `<span style="font-size:10px;opacity:0.5">🔒</span>` : `<button class="neu-btn delete-nozzle-btn" data-nozzle="${n.id}" style="min-height:28px;min-width:28px;border-radius:50%;padding:0;font-size:12px;background:#fff1f0;border:1px solid #ffa39e;color:#cf1322">🗑️</button>`) : ''}
                      </div>
                    </div>
                  `;
                }).join('') || `<p style="font-size:12px;color:var(--text-secondary)">No nozzles</p>`}
              </div>
            </div>

            <div style="margin-top:16px;display:flex;gap:8px">
              ${isFree ? `<button id="takeOver" class="neu-btn neu-btn--primary neu-btn--block" style="background:#52c41a;border-color:#52c41a">🟢 Take Over This Pump</button>` : `<button class="neu-btn neu-btn--block" disabled style="opacity:0.6">🔴 Occupied by ${occ.employeeName}</button>`}
            </div>

            ${canManage ? `
              <div style="height:0.5px;background:var(--border);margin:16px 0"></div>
              <div style="display:flex;gap:8px">
                <button id="editPump" class="neu-btn neu-btn--small" style="flex:1">Edit Pump</button>
                <button id="addNozzleHere" class="neu-btn neu-btn--small" style="flex:1">+ Nozzle</button>
              </div>
              <div style="margin-top:10px">
                ${isFree ? `<button id="deletePump" class="neu-btn neu-btn--small" style="width:100%;background:#fff1f0;color:#cf1322;border:1px solid #ffa39e">🗑️ Delete Pump (Free - Safe to Delete)</button>` : `<button class="neu-btn neu-btn--small" style="width:100%;opacity:0.5" disabled>🔒 Cannot Delete - Busy (${occ.employeeName} working)</button><div style="font-size:10px;color:var(--text-tertiary);text-align:center;margin-top:4px">Wait until ${occ.employeeName}'s shift ends, then delete</div>`}
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
    modalRoot.querySelector('#backdrop').addEventListener('click', e=>{ if(e.target.id==='backdrop') modalRoot.innerHTML=''; });
    modalRoot.querySelector('#closeM').addEventListener('click', ()=> modalRoot.innerHTML='');
    modalRoot.querySelector('#takeOver')?.addEventListener('click', ()=>{
      modalRoot.innerHTML='';
      location.hash = '#/shifts/start';
    });
    modalRoot.querySelector('#editPump')?.addEventListener('click', ()=>{
      modalRoot.innerHTML='';
      openPumpModal(pump);
    });
    modalRoot.querySelector('#addNozzleHere')?.addEventListener('click', ()=>{
      modalRoot.innerHTML='';
      openNozzleModal(null, pump.id);
    });
    modalRoot.querySelector('#deletePump')?.addEventListener('click', async ()=>{
      if (!confirm(`Delete pump "${pump.name}"?\n\nThis will also delete its ${pNozzles.length} nozzle(s) if any.\n\nConditions:\n• Pump must be free (no active shift)\n• No one working on it now\n\nGraceful delete: Only if free, safe to delete. Continue?`)) return;
      const second = prompt(`Type "${pump.name}" to confirm delete:`);
      if (second !== pump.name) return alert('Name mismatch - cancelled');
      try {
        await deletePump(pump.id);
        alert(`✅ Pump "${pump.name}" deleted gracefully`);
        modalRoot.innerHTML='';
        pumpsView({ root });
      } catch(e){ alert('Cannot delete: ' + e.message); }
    });
    modalRoot.querySelectorAll('.delete-nozzle-btn').forEach(btn=>{
      btn.addEventListener('click', async (e)=>{
        e.stopPropagation();
        const nozzleId = btn.dataset.nozzle;
        const nz = pNozzles.find(n=>n.id===nozzleId);
        if (!nz) return;
        if (!confirm(`Delete Nozzle ${nz.number} • ${nz.fuelType} from ${pump.name}?\n\nConditions:\n• No active shift using it\n• Graceful: keeps past shift history, only removes nozzle from active list\n\nContinue?`)) return;
        try {
          await deleteNozzle(nozzleId);
          alert(`✅ Nozzle ${nz.number} deleted`);
          modalRoot.innerHTML='';
          pumpsView({ root });
        } catch(err){ alert('Cannot delete: ' + err.message); }
      });
    });
  }

  function openPumpModal(existing=null) {
    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="backdrop"><div class="modal">
        <div style="display:flex;justify-content:space-between"><h3 style="font-weight:800">${existing?'Edit Pump':'New Pump'}</h3><button class="neu-btn neu-btn--small" id="closeM">✕</button></div>
        <div class="grid" style="margin-top:14px">
          <div><label class="label">Pump Name</label><input id="p_name" class="neu-input" value="${existing?.name||''}" placeholder="Pump 1"></div>
          <div><label class="label">Pump Number</label><input id="p_num" class="neu-input" type="number" value="${existing?.number||''}" placeholder="1"></div>
          <button id="savePump" class="neu-btn neu-btn--primary neu-btn--block">${existing?'Update':'Create Pump'}</button>
        </div>
      </div></div>`;
    modalRoot.querySelector('#backdrop').addEventListener('click', e=>{ if(e.target.id==='backdrop') modalRoot.innerHTML=''; });
    modalRoot.querySelector('#closeM').addEventListener('click', ()=> modalRoot.innerHTML='');
    modalRoot.querySelector('#savePump').addEventListener('click', async ()=>{
      const name = modalRoot.querySelector('#p_name').value.trim();
      const number = modalRoot.querySelector('#p_num').value.trim();
      if (!name || !number) return alert('Fill all');
      try { 
        if (existing) await updatePump(existing.id, { name, number });
        else await createPump(station.id, { name, number }); 
        modalRoot.innerHTML=''; pumpsView({ root }); 
      } catch(e){ alert(e.message); }
    });
  }

  function openNozzleModal(existing=null, presetPumpId=null) {
    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="backdrop"><div class="modal">
        <div style="display:flex;justify-content:space-between"><h3 style="font-weight:800">${existing?'Edit Nozzle':'New Nozzle'}</h3><button class="neu-btn neu-btn--small" id="closeM">✕</button></div>
        <div class="grid" style="margin-top:14px">
          <div><label class="label">Pump</label><select id="n_pump" class="neu-select">${pumps.map(p=>`<option value="${p.id}" ${existing?.pumpId===p.id || presetPumpId===p.id?'selected':''}>${p.name}</option>`).join('')}</select></div>
          <div><label class="label">Nozzle Number</label><input id="n_num" class="neu-input" type="number" value="${existing?.number||''}" placeholder="1"></div>
          <div><label class="label">Fuel Type</label><select id="n_fuel" class="neu-select">
            <option value="Petrol" ${existing?.fuelType==='Petrol'?'selected':''}>Petrol</option>
            <option value="Diesel" ${existing?.fuelType==='Diesel'?'selected':''}>Diesel</option>
            <option value="Premium Petrol" ${existing?.fuelType==='Premium Petrol'?'selected':''}>Premium Petrol</option>
            <option value="CNG" ${existing?.fuelType==='CNG'?'selected':''}>CNG</option>
          </select></div>
          ${!isAttendant ? `<div><label class="label">Last Reading</label><input id="n_read" class="neu-input" type="number" step="0.01" value="${existing?.lastReading||0}"></div>` : ''}
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
      const lastReading = modalRoot.querySelector('#n_read')?.value || 0;
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
