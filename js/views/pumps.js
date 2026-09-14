import { getState } from '../state.js';
import { getPumps, getNozzles, createPump, createNozzle, updatePump, updateNozzle, deletePump, deleteNozzle } from '../services/pumps.js';
import { getStationsForCurrentUser } from '../services/stations.js';
import { getShifts } from '../services/shifts.js';

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

  const isOwner = user.role === 'owner';
  const isSuperAdmin = user.role === 'super_admin';
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
    <div class="container">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <div>
          <h1 class="page-title">Pumps</h1>
          <p class="page-sub">${station.name} • ${pumps.length} pumps • <span style="color:#52c41a">${availableCount} free</span> • <span style="color:#ff4d4f">${occupiedCount} busy</span></p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${canManage ? `<button id="addPumpBtn" class="neu-btn neu-btn--small neu-btn--primary">+ Pump</button><button id="addNozzleBtn" class="neu-btn neu-btn--small">+ Nozzle</button>` : ''}
        </div>
      </div>

      ${isAttendant ? `<div class="alert alert--info" style="margin-top:12px;font-size:12px">🔒 Slack-style: You only see who is on which pump. No sensitive data. Green = free to take over, Red = busy.</div>` : ''}

      <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
        <button class="neu-btn neu-btn--small filter-btn active" data-filter="all" style="font-size:12px">All (${pumps.length})</button>
        <button class="neu-btn neu-btn--small filter-btn" data-filter="free" style="font-size:12px;background:#f6ffed;border:0.5px solid #b7eb8f;color:#389e0d">🟢 Free (${availableCount})</button>
        <button class="neu-btn neu-btn--small filter-btn" data-filter="busy" style="font-size:12px;background:#fff1f0;border:0.5px solid #ffa39e;color:#cf1322">🔴 Busy (${occupiedCount})</button>
      </div>

      <div class="pump-grid" style="margin-top:16px;display:grid;grid-template-columns:repeat(2,1fr);gap:12px">
        ${pumps.map(p=>{
          const occ = pumpOccupancy[p.id];
          const pNozzles = nozzles.filter(n=>n.pumpId===p.id);
          const isFree = !occ.occupied;
          
          return `
            <div class="pump-card ${isFree ? 'pump-free' : 'pump-busy'}" data-pump-id="${p.id}" data-status="${isFree ? 'free' : 'busy'}" style="
              position:relative;
              background:${isFree ? 'linear-gradient(135deg,#f6ffed 0%,#ffffff 100%)' : 'linear-gradient(135deg,#fff1f0 0%,#ffffff 100%)'};
              border:2px solid ${isFree ? '#52c41a' : '#ff4d4f'};
              border-radius:16px;
              padding:14px;
              cursor:pointer;
              transition:all 0.2s ease;
              overflow:hidden;
              min-height:140px;
              display:flex;
              flex-direction:column;
              justify-content:space-between;
              box-shadow:${isFree ? '0 2px 8px rgba(82,196,26,0.15)' : '0 2px 8px rgba(255,77,79,0.15)'};
            ">
              ${!isFree ? `
                <div class="fueling-animation" style="
                  position:absolute;
                  top:0;left:0;right:0;height:4px;
                  background:linear-gradient(90deg,#ff4d4f,#ffa39e,#ff4d4f);
                  background-size:200% 100%;
                  animation:fuelFlow 1.5s linear infinite;
                "></div>
                <div style="position:absolute;top:8px;right:8px;width:8px;height:8px;background:#ff4d4f;border-radius:50%;animation:pulse 1.2s ease-in-out infinite;box-shadow:0 0 8px #ff4d4f"></div>
              ` : `
                <div style="position:absolute;top:8px;right:8px;width:8px;height:8px;background:#52c41a;border-radius:50%;box-shadow:0 0 8px #52c41a"></div>
              `}

              <div>
                <div style="display:flex;align-items:center;gap:8px">
                  <div style="
                    width:44px;height:44px;
                    border-radius:12px;
                    background:${isFree ? '#52c41a' : '#ff4d4f'};
                    display:grid;place-items:center;
                    font-size:22px;
                    color:white;
                    flex-shrink:0;
                    ${!isFree ? 'animation:bounce 1s ease-in-out infinite' : ''}
                  ">⛽</div>
                  <div style="flex:1;min-width:0">
                    <div style="font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
                    <div style="font-size:11px;color:var(--text-secondary)">#${p.number} • ${pNozzles.length} nozzles</div>
                  </div>
                </div>

                <div style="margin-top:10px;display:flex;gap:4px;flex-wrap:wrap">
                  ${pNozzles.map(n=>{
                    const fuelColor = n.fuelType==='Petrol' ? '#1677ff' : n.fuelType==='Diesel' ? '#fa8c16' : n.fuelType==='CNG' ? '#52c41a' : '#722ed1';
                    return `<span style="width:10px;height:10px;border-radius:50%;background:${fuelColor};display:inline-block;border:1.5px solid white;box-shadow:0 0 0 1px ${fuelColor}33" title="${n.fuelType} #${n.number}"></span>`;
                  }).join('') || `<span style="font-size:10px;color:var(--text-tertiary)">No nozzles</span>`}
                  <span style="font-size:10px;color:var(--text-tertiary);margin-left:4px">${pNozzles.map(n=>n.fuelType[0]).join('')}</span>
                </div>
              </div>

              <div style="margin-top:12px">
                ${isFree ? `
                  <div style="display:flex;align-items:center;gap:6px">
                    <span style="width:8px;height:8px;background:#52c41a;border-radius:50%;display:inline-block"></span>
                    <span style="font-size:12px;font-weight:600;color:#389e0d">Available</span>
                  </div>
                  <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">Tap to take over</div>
                ` : `
                  <div style="background:rgba(255,77,79,0.08);border-radius:8px;padding:8px;border:0.5px solid rgba(255,77,79,0.15)">
                    <div style="display:flex;align-items:center;gap:6px">
                      <span style="width:8px;height:8px;background:#ff4d4f;border-radius:50%;display:inline-block;animation:pulse 1s infinite"></span>
                      <span style="font-size:12px;font-weight:600;color:#cf1322">Occupied</span>
                      <span style="font-size:10px;background:#ff4d4f;color:white;padding:2px 6px;border-radius:10px;animation:pulse 1.5s infinite">● LIVE</span>
                    </div>
                    <div style="margin-top:6px;display:flex;align-items:center;gap:6px">
                      <div style="width:24px;height:24px;border-radius:50%;background:#ff4d4f;color:white;display:grid;place-items:center;font-size:11px;font-weight:700;flex-shrink:0">${(occ.employeeName||'?')[0].toUpperCase()}</div>
                      <div style="min-width:0;flex:1">
                        <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${occ.employeeName}</div>
                        <div style="font-size:10px;color:var(--text-secondary)">is fueling ⛽</div>
                      </div>
                      <div style="font-size:16px;animation:fuelDrop 1s ease-in-out infinite">💧</div>
                    </div>
                    ${!isAttendant ? `<div style="font-size:10px;color:var(--text-tertiary);margin-top:4px">Shift: ${occ.shift?.id?.slice(0,6)||''} • Tap for details</div>` : ''}
                  </div>
                `}
              </div>

              ${!isFree ? `
                <div style="position:absolute;bottom:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,#ff4d4f,transparent);animation:fuelFlow 2s linear infinite;opacity:0.6"></div>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>

      ${pumps.length===0 ? `<div class="neu-card empty" style="margin-top:16px"><div style="font-size:32px">🔧</div><p>No pumps configured</p><p style="font-size:12px;color:var(--text-secondary)">Create a pump and add nozzles</p></div>` : ''}

      <div style="margin-top:20px;padding:12px;background:var(--bg);border-radius:12px;border:0.5px solid var(--border)">
        <div style="font-size:12px;font-weight:600">Legend • Slack-style operations</div>
        <div style="display:flex;gap:12px;margin-top:8px;flex-wrap:wrap;font-size:11px;color:var(--text-secondary)">
          <span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;background:#52c41a;border-radius:50%;display:inline-block"></span> Free — tap to start shift</span>
          <span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;background:#ff4d4f;border-radius:50%;display:inline-block"></span> Busy — someone fueling</span>
          <span>🔵 Petrol • 🟠 Diesel • 🟢 CNG • 🟣 Premium</span>
        </div>
        <div style="font-size:10px;color:var(--text-tertiary);margin-top:6px">Attendants only see who is on which pump. No sensitive readings leaked.</div>
      </div>
    </div>

    <style>
      @keyframes fuelFlow {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
      @keyframes pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.3); opacity: 0.7; }
      }
      @keyframes bounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-2px); }
      }
      @keyframes fuelDrop {
        0%, 100% { transform: translateY(0) scale(1); }
        50% { transform: translateY(3px) scale(1.1); }
      }
      .pump-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 20px rgba(0,0,0,0.12) !important;
      }
      .pump-free:hover {
        border-color: #389e0d !important;
      }
      .pump-busy:hover {
        border-color: #cf1322 !important;
      }
      .filter-btn.active {
        background: var(--primary) !important;
        color: white !important;
        border-color: var(--primary) !important;
      }
      @media (min-width: 768px) {
        .pump-grid {
          grid-template-columns: repeat(3, 1fr) !important;
        }
      }
    </style>

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

  root.querySelector('#addPumpBtn')?.addEventListener('click', ()=> openPumpModal());
  root.querySelector('#addNozzleBtn')?.addEventListener('click', ()=> openNozzleModal());

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
        else await createNozzle(station.id, pumpId, { number: Number(number), fuelType, lastReading, status }); // lastReading raw: validated in the service
        modalRoot.innerHTML=''; pumpsView({ root });
      } catch(e){ alert(e.message); }
    });
  }
}
