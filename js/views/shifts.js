import { getState } from '../state.js';
import { getStationsForCurrentUser } from '../services/stations.js';
import { getShifts, getActiveShiftForUser, startShift, closeShift, getShiftById, approveShift, rejectShift, requestCorrections } from '../services/shifts.js';
import { getPumps, getNozzles } from '../services/pumps.js';
import { getActivePrices } from '../services/prices.js';
import { getTransactions, addCredit, addExpense } from '../services/transactions.js';
import { addNote, getNotes } from '../services/notes.js';
import { formatCurrency, formatLiters, formatDateTime, calcLitersSold, calcRevenue } from '../services/calc.js';
import { formatBusinessDate, formatBusinessTime } from '../services/datetime.js';
// Collections removed - no jackpot

const STATUS_META = {
  ACTIVE:         { label: 'Running',  badge: 'badge--info',    dot: '#1890ff' },
  PENDING_REVIEW: { label: 'To Review', badge: 'badge--warning', dot: '#fa8c16' },
  APPROVED:       { label: 'Approved', badge: 'badge--success', dot: '#52c41a' },
  REJECTED:       { label: 'Rejected', badge: 'badge--danger',  dot: '#cf1322' },
};

export async function shiftsListView({ root, query = {} }) {
  const { user, currentStationId } = getState();
  const stations = await getStationsForCurrentUser();
  const stationId = currentStationId || stations[0]?.id;
  if (!stationId) { root.innerHTML=`<div class="container"><div class="neu-card empty"><p>No station</p></div></div>`; return; }
  const shifts = await getShifts(stationId, user.role==='attendant'? { userId: user.uid }: {});

  // The list used to dump every shift ever recorded, newest-last, with the
  // work that actually needs attention buried somewhere in the middle.
  // Default to what is live or waiting on someone, and keep history one tap
  // away behind an explicit filter.
  const byNewest = [...shifts].sort((a,b)=> new Date(b.startTime||0) - new Date(a.startTime||0));
  const counts = {
    ALL: byNewest.length,
    ACTIVE: byNewest.filter(s=>s.status==='ACTIVE').length,
    PENDING_REVIEW: byNewest.filter(s=>s.status==='PENDING_REVIEW').length,
    APPROVED: byNewest.filter(s=>s.status==='APPROVED').length,
    REJECTED: byNewest.filter(s=>s.status==='REJECTED').length,
  };
  const openCount = counts.ACTIVE + counts.PENDING_REVIEW;

  // Land on OPEN when there is anything to act on, otherwise show recent history.
  const VALID = ['OPEN','ACTIVE','PENDING_REVIEW','APPROVED','REJECTED','ALL'];
  const initial = VALID.includes(query.status) ? query.status : (openCount ? 'OPEN' : 'ALL');
  let current = initial;
  const RECENT_LIMIT = 15;
  let showingAll = false;

  const applyFilter = (status) => {
    if (status === 'OPEN') return byNewest.filter(s=>s.status==='ACTIVE'||s.status==='PENDING_REVIEW');
    if (status === 'ALL') return byNewest;
    return byNewest.filter(s=>s.status===status);
  };

  const CHIPS = [
    { key:'OPEN',           label:'Open',      count:openCount },
    { key:'ACTIVE',         label:'Running',   count:counts.ACTIVE },
    { key:'PENDING_REVIEW', label:'To Review', count:counts.PENDING_REVIEW },
    { key:'APPROVED',       label:'Approved',  count:counts.APPROVED },
    { key:'REJECTED',       label:'Rejected',  count:counts.REJECTED },
    { key:'ALL',            label:'All',       count:counts.ALL },
  ];

  root.innerHTML = `
    <div class="container" style="padding-bottom:110px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <div style="min-width:0">
          <h1 class="page-title">Shifts</h1>
          <p class="page-sub">${stations.find(s=>s.id===stationId)?.name}</p>
        </div>
        <button class="neu-btn neu-btn--primary" style="min-height:44px;padding:0 18px;font-weight:700;border-radius:12px;white-space:nowrap" onclick="location.hash='#/shifts/start'">+ Start Shift</button>
      </div>

      ${openCount ? `
        <div style="margin-top:14px;display:flex;gap:10px">
          ${counts.ACTIVE ? `<div style="flex:1;background:#e6f7ff;border:1px solid #91d5ff;border-radius:12px;padding:10px 12px">
            <div style="font-size:20px;font-weight:800;color:#0050b3">${counts.ACTIVE}</div>
            <div style="font-size:11px;color:#0050b3;font-weight:600">Running now</div>
          </div>` : ''}
          ${counts.PENDING_REVIEW ? `<div style="flex:1;background:#fff7e6;border:1px solid #ffd591;border-radius:12px;padding:10px 12px">
            <div style="font-size:20px;font-weight:800;color:#ad4e00">${counts.PENDING_REVIEW}</div>
            <div style="font-size:11px;color:#ad4e00;font-weight:600">Waiting for review</div>
          </div>` : ''}
        </div>
      ` : ''}

      <div style="margin-top:14px;display:flex;gap:8px;overflow:auto;padding-bottom:8px">
        ${CHIPS.map(c=>`<button class="chip filter-btn" data-status="${c.key}" style="min-height:36px;padding:0 14px;border-radius:20px;font-size:13px;white-space:nowrap;border:1.5px solid var(--border);background:white;font-weight:600">${c.label}${c.count?` <span style="opacity:0.6">${c.count}</span>`:''}</button>`).join('')}
      </div>

      <div class="list" id="shiftList" style="margin-top:8px"></div>
    </div>
  `;

  function renderShiftList(list) {
    const isOwner = user.role === 'owner';
    if (!list.length) {
      const msg = current==='OPEN'
        ? 'Nothing open right now. Every shift has been reviewed.'
        : 'No shifts here yet.';
      return `<div class="neu-card empty" style="padding:28px 20px;text-align:center"><div style="font-size:28px">✅</div><p style="margin-top:8px;font-size:13px;color:var(--text-secondary)">${msg}</p>${current!=='ALL'?`<button id="seeAll" class="neu-btn" style="margin-top:14px;min-height:40px;padding:0 16px;border-radius:10px;font-weight:600">See all shifts</button>`:''}</div>`;
    }
    const capped = (!showingAll && list.length > RECENT_LIMIT) ? list.slice(0, RECENT_LIMIT) : list;
    const rows = capped.map(sh=>{
      const meta = STATUS_META[sh.status] || { label: sh.status, badge:'badge--info', dot:'#8c8c8c' };
      const v = sh.totals?.variance||0;
      const absV = Math.abs(v);
      let varText = '';
      if (absV>0.5) {
        if (v<0) {
          if (sh.userId===user.uid) varText = `💸 To Handover ${formatCurrency(absV)}`;
          else varText = `💸 To Handover ${formatCurrency(absV)} by ${sh.employeeName.split(' ')[0]}`;
        } else {
          if (sh.userId===user.uid) varText = `💰 Excess ${formatCurrency(absV)}`;
          else varText = `↩️ Excess ${formatCurrency(absV)} to ${sh.employeeName.split(' ')[0]}`;
        }
      }
      const start = new Date(sh.startTime);
      const when = `${formatBusinessDate(start, { year: undefined })} • ${formatBusinessTime(start)}`;
      const until = sh.endTime ? formatBusinessTime(sh.endTime) : null;
      return `
      <div class="neu-card" style="cursor:pointer;padding:14px 16px;border-radius:14px;border-left:4px solid ${meta.dot}" onclick="location.hash='#/shifts/${sh.id}'">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sh.employeeName}</div>
            <div style="font-size:11px;color:var(--text-secondary);margin-top:3px">${when}${until?` → ${until}`:''}</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:5px">${sh.nozzles?.length||0} nozzles • ${isOwner || sh.userId===user.uid ? formatCurrency(sh.totals?.totalRevenue||0)+' • ' : ''}${formatLiters(sh.totals?.totalLiters||0)}</div>
            ${sh.correctionRequests?.length ? `<div style="font-size:11px;color:#fa541c;margin-top:6px;display:flex;align-items:center;gap:4px"><span style="background:#fff1f0;color:#cf1322;padding:2px 8px;border-radius:10px;font-size:10px">⚠️ ${sh.correctionRequests.length} correction</span></div>` : ''}
            ${varText ? `<div style="font-size:11px;margin-top:6px;color:${v<0?'#cf1322':'#389e0d'};font-weight:600">${varText}</div>` : ''}
          </div>
          <span class="badge ${meta.badge}" style="font-size:11px;padding:6px 10px;border-radius:20px;white-space:nowrap">${meta.label}</span>
        </div>
      </div>
    `}).join('');
    const more = (!showingAll && list.length > RECENT_LIMIT)
      ? `<button id="showMore" class="neu-btn" style="margin-top:12px;min-height:44px;border-radius:12px;font-weight:600;width:100%">Show ${list.length - RECENT_LIMIT} older shift(s)</button>`
      : '';
    return rows + more;
  }

  function paint() {
    root.querySelectorAll('.filter-btn').forEach(b=>{
      const on = b.dataset.status === current;
      b.style.background = on ? 'var(--primary, #ff5a1f)' : 'white';
      b.style.color = on ? 'white' : 'var(--text-primary, #222)';
      b.style.borderColor = on ? 'var(--primary, #ff5a1f)' : 'var(--border)';
    });
    root.querySelector('#shiftList').innerHTML = renderShiftList(applyFilter(current));
    root.querySelector('#showMore')?.addEventListener('click', ()=>{ showingAll = true; paint(); });
    root.querySelector('#seeAll')?.addEventListener('click', ()=>{ current='ALL'; showingAll=true; paint(); });
  }

  root.querySelectorAll('.filter-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      current = btn.dataset.status;
      showingAll = false;
      paint();
    });
  });
  paint();
}

export async function startShiftView({ root }) {
  const { user, currentStationId } = getState();
  const stations = await getStationsForCurrentUser();
  let stationId = currentStationId || stations[0]?.id;
  if (!stationId) { root.innerHTML=`<div class="container"><div class="neu-card empty"><p>No station</p></div></div>`; return; }
  const active = await getActiveShiftForUser(user.uid);
  if (active) {
    root.innerHTML = `<div class="container"><div class="neu-card" style="padding:20px;text-align:center"><h3 style="font-weight:700">Active Shift Exists</h3><p style="font-size:13px;color:var(--text-secondary);margin-top:8px">You already have an active shift.</p><button class="neu-btn neu-btn--primary" style="margin-top:16px;min-height:48px;border-radius:12px;padding:0 24px;font-weight:700" onclick="location.hash='#/shifts/${active.id}'">Open Active Shift</button></div></div>`;
    return;
  }
  const pumps = await getPumps(stationId);
  const nozzles = await getNozzles(stationId);
  const activeNozzles = nozzles.filter(n=>n.status==='active');

  // Which nozzles are already claimed by someone else's open shift? Previously
  // every nozzle looked available and the clash only surfaced as an error
  // after submitting.
  const busyByNozzle = {};
  try {
    const openShifts = await getShifts(stationId, { status: 'ACTIVE' });
    openShifts.forEach(sh => (sh.nozzles||[]).forEach(n => {
      busyByNozzle[n.nozzleId] = sh.employeeName || 'another employee';
    }));
  } catch {}
  const freeCount = activeNozzles.filter(n => !busyByNozzle[n.id]).length;

  root.innerHTML = `
    <div class="container" style="max-width:480px;margin:0 auto">
      <h1 class="page-title">Start Shift</h1>
      <p class="page-sub" style="margin-top:4px">${stations.find(s=>s.id===stationId)?.name}</p>
      <div class="neu-card" style="margin-top:16px;padding:16px;border-radius:14px">
        <label class="label">Station</label>
        <select id="stationSel" class="neu-select" style="min-height:44px;border-radius:10px">${stations.map(s=>`<option value="${s.id}" ${s.id===stationId?'selected':''}>${s.name}</option>`).join('')}</select>
      </div>
      <div class="neu-card" style="margin-top:16px;padding:16px;border-radius:14px">
        <h3 style="font-weight:700;font-size:15px">Your Nozzles</h3>
        <p style="font-size:12px;color:var(--text-secondary);margin-top:6px">Select nozzles assigned to you and enter opening readings</p>
        <div class="list" style="margin-top:14px;display:flex;flex-direction:column;gap:10px" id="nozzleList">
          ${activeNozzles.map(n=>{
            const pump = pumps.find(p=>p.id===n.pumpId);
            const busyWith = busyByNozzle[n.id];
            if (busyWith) {
              // Greyed out and unselectable, with a clear reason.
              return `<div class="neu-card neu-card--sm" style="padding:14px;border-radius:12px;opacity:0.65;background:#f5f5f5;border:1px dashed #d9d9d9">
                <div style="display:flex;gap:12px;align-items:center;font-weight:600;font-size:14px;color:var(--text-secondary)">
                  <span style="font-size:16px">🔒</span>
                  <span>${pump?.name||'Pump'} - Nozzle ${n.number} • ${n.fuelType}</span>
                </div>
                <div style="margin-top:8px;font-size:12px;color:#ad6800;background:#fffbe6;border:1px solid #ffe58f;border-radius:8px;padding:8px 10px">
                  Currently in use by <b>${busyWith}</b>. Close that shift before you take over.
                </div>
              </div>`;
            }
            return `<div class="neu-card neu-card--sm" style="padding:14px;border-radius:12px;display:flex;flex-direction:column;gap:12px"><label style="display:flex;gap:12px;align-items:center;font-weight:600;font-size:14px;cursor:pointer"><input type="checkbox" class="nz-check" data-id="${n.id}" data-pump="${n.pumpId}" data-fuel="${n.fuelType}" data-last="${n.lastReading||0}" style="width:18px;height:18px"> ${pump?.name||'Pump'} - Nozzle ${n.number} • ${n.fuelType}</label><div><label class="label">Opening Reading</label><input class="neu-input nz-opening" data-id="${n.id}" type="number" step="0.01" value="${n.lastReading||0}" disabled style="min-height:44px;border-radius:10px;font-size:15px"></div></div>`;
          }).join('') || `<p style="font-size:13px;color:var(--text-secondary);padding:12px">No active nozzles</p>`}
          ${activeNozzles.length>0 && freeCount===0 ? `<div style="padding:14px;background:#fff1f0;border:1px solid #ffccc7;border-radius:12px;font-size:13px;color:#cf1322;text-align:center">
            <b>No nozzles available.</b><br>All nozzles are currently in use. They must be closed before you can start a shift.
          </div>` : ''}
        </div>
      </div>
      <div id="alertBox" style="margin-top:14px"></div>
      <button id="startBtn" class="neu-btn neu-btn--primary neu-btn--block" style="margin-top:20px;min-height:52px;border-radius:14px;font-size:16px;font-weight:700">Start Shift</button>
    </div>
  `;
  root.querySelector('#stationSel').addEventListener('change', async e=>{
    const { setState } = await import('../state.js');
    setState({ currentStationId: e.target.value });
    startShiftView({ root });
  });
  root.querySelectorAll('.nz-check').forEach(chk=>{
    chk.addEventListener('change', e=>{
      const input = root.querySelector(`.nz-opening[data-id="${e.target.dataset.id}"]`);
      input.disabled = !e.target.checked;
    });
  });
  root.querySelector('#startBtn').addEventListener('click', async ()=>{
    const selected = Array.from(root.querySelectorAll('.nz-check:checked')).map(chk=>{
      const id = chk.dataset.id;
      const opening = root.querySelector(`.nz-opening[data-id="${id}"]`).value;
      return { nozzleId: id, pumpId: chk.dataset.pump, fuelType: chk.dataset.fuel, openingReading: Number(opening) };
    });
    if (selected.length===0) { root.querySelector('#alertBox').innerHTML = `<div class="alert alert--warning">Select at least one nozzle</div>`; return; }
    try {
      const shift = await startShift({ stationId, userId: user.uid, employeeName: user.name, nozzles: selected });
      location.hash = `#/shifts/${shift.id}`;
    } catch(e){ root.querySelector('#alertBox').innerHTML = `<div class="alert alert--danger">⚠️ ${e.message}</div>`; }
  });
}

export async function shiftDetailView({ root, params }) {
  const { id } = params;
  const { user } = getState();
  const shift = await getShiftById(id);
  if (!shift) { root.innerHTML=`<div class="container"><div class="neu-card empty"><p>Shift not found</p></div></div>`; return; }

  const canReview = ['owner','manager','admin','super_admin'].includes(user.role);
  const isOwnerOfShift = shift.userId === user.uid;
  const stations = await getStationsForCurrentUser();
  const stationName = stations.find(s=>s.id===shift.stationId)?.name || 'Station';
  const transactions = await getTransactions(shift.stationId, { shiftId: shift.id });
  const notes = await getNotes(shift.stationId, { shiftId: shift.id });
  const credits = transactions.filter(t=>t.type==='credit');
  const expenses = transactions.filter(t=>t.type==='expense');

  if (shift.status === 'ACTIVE') {
    const { getPumps, getNozzles } = await import('../services/pumps.js');
    const { getShifts } = await import('../services/shifts.js');
    const pumps = await getPumps(shift.stationId);
    const allNozzles = await getNozzles(shift.stationId);
    const activeShifts = await getShifts(shift.stationId, { status: 'ACTIVE' });
    const occupiedNozzleIds = new Set();
    activeShifts.forEach(sh => {
      if (sh.id === shift.id) return;
      (sh.nozzles||[]).forEach(n=> occupiedNozzleIds.add(n.nozzleId));
    });
    const myNozzleIds = new Set((shift.nozzles||[]).map(n=>n.nozzleId));
    const availableNozzles = allNozzles.filter(n=> n.status==='active' && !myNozzleIds.has(n.id) && !occupiedNozzleIds.has(n.id));

    root.innerHTML = `
      <div class="container" style="max-width:480px;margin:0 auto;padding-bottom:100px">
        <div style="display:flex;justify-content:space-between;align-items:center"><div><h1 class="page-title" style="font-size:20px">Active Shift</h1><p class="page-sub" style="margin-top:4px">${shift.employeeName} • Started ${formatDateTime(shift.startTime)}</p></div><span class="badge badge--info" style="padding:8px 12px;border-radius:20px">ACTIVE</span></div>
        <div class="neu-card" style="margin-top:16px;padding:16px;border-radius:14px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h3 style="font-weight:700;font-size:14px">My Nozzles (${shift.nozzles?.length||0}) • Active</h3>
            <button id="addNozzleBtn" class="neu-btn neu-btn--primary" style="min-height:36px;padding:0 14px;border-radius:10px;font-size:13px;font-weight:700">+ Add Pump</button>
          </div>
          <div class="list" style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
            ${(shift.nozzles||[]).map(n=>{
              const pump = pumps.find(p=>p.id===n.pumpId);
              return `<div class="neu-card neu-card--sm" style="padding:12px;border-radius:10px;display:flex;justify-content:space-between;align-items:center;border-left:4px solid #52c41a"><div><div style="font-weight:600;font-size:13px">${pump?.name||'Pump'} • ${n.fuelType} • Nozzle</div><div style="font-size:11px;color:var(--text-secondary);margin-top:2px">Opening ${Number(n.openingReading).toFixed(2)} ${n.addedAt?`• Added ${new Date(n.addedAt).toLocaleTimeString()}`:''}</div></div><div style="display:flex;gap:6px;align-items:center"><span class="badge badge--success" style="padding:4px 8px;border-radius:12px;font-size:10px">IN USE</span><button class="neu-btn remove-nozzle-btn" data-id="${n.nozzleId}" style="min-height:28px;min-width:28px;border-radius:50%;padding:0;font-size:12px">✕</button></div></div>`;
            }).join('')}
          </div>
          ${availableNozzles.length===0 ? `<div style="margin-top:10px;padding:10px;background:#f0f0f0;border-radius:8px;text-align:center;font-size:11px;color:var(--text-secondary)">No more free nozzles • All pumps occupied or already in your shift</div>` : `<div style="margin-top:10px;padding:8px;background:#f6ffed;border-radius:8px;border:1px solid #b7eb8f;font-size:11px;color:#389e0d;text-align:center">${availableNozzles.length} free nozzle(s) available • Tap + Add Pump to add another</div>`}
        </div>
        
        <div style="margin-top:20px;display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="document.getElementById('creditModal').style.display='flex'">💳 + Credit</button>
          <button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="document.getElementById('expenseModal').style.display='flex'">🧾 + Expense</button>
          <button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="document.getElementById('noteModal').style.display='flex'">📝 + Note</button>
          <button class="neu-btn neu-btn--primary" style="min-height:48px;border-radius:12px;font-weight:700" onclick="location.hash='#/shifts/${shift.id}/close'">Close Shift →</button>
        </div>

        <!-- Add Pump Modal -->
        <div id="addPumpModal" class="modal-backdrop" style="display:none">
          <div class="modal" style="border-radius:16px;max-width:420px;max-height:80vh;overflow:auto">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <h3 style="font-weight:800">⛽ Add Pump / Nozzle to Active Shift</h3>
              <button class="neu-btn" style="min-height:36px;min-width:36px;border-radius:50%" onclick="document.getElementById('addPumpModal').style.display='none'">✕</button>
            </div>
            <p style="font-size:12px;color:var(--text-secondary);margin-top:8px">You are on 24hr shift and need another pump? Select free nozzle and enter opening reading. It will be added to your current active shift.</p>
            ${availableNozzles.length===0 ? `<div style="margin-top:16px;padding:16px;background:#fff1f0;border-radius:12px;border:1px solid #ffa39e;text-align:center"><div style="font-size:24px">⛽</div><h4 style="margin-top:8px">No free nozzles</h4><p style="font-size:12px;color:var(--text-secondary);margin-top:4px">All nozzles are occupied by other active shifts or already in your shift. Free a pump first or ask manager.</p></div>` : `
            <div style="margin-top:16px;display:flex;flex-direction:column;gap:12px" id="availableList">
              ${availableNozzles.map(n=>{
                const pump = pumps.find(p=>p.id===n.pumpId);
                return `<div class="neu-card" style="padding:14px;border-radius:12px;cursor:pointer;border:1.5px solid var(--border)" data-nozzle="${n.id}" data-pump="${n.pumpId}" data-fuel="${n.fuelType}" data-last="${n.lastReading||0}">
                  <div style="display:flex;justify-content:space-between;align-items:center">
                    <div><div style="font-weight:700;font-size:14px">${pump?.name||'Pump'} • Nozzle ${n.number} • ${n.fuelType}</div><div style="font-size:11px;color:var(--text-secondary);margin-top:2px">Last: ${Number(n.lastReading||0).toFixed(2)} • ${n.status}</div></div>
                    <span class="badge badge--success" style="padding:4px 8px;border-radius:12px;font-size:10px">FREE</span>
                  </div>
                  <div style="margin-top:10px;display:none" class="add-form">
                    <label class="label" style="font-size:11px">Opening Reading for this nozzle</label>
                    <input class="neu-input opening-add" type="number" step="0.01" value="${n.lastReading||0}" style="min-height:44px;border-radius:10px;font-size:15px;font-weight:600">
                    <button class="neu-btn neu-btn--primary confirm-add" style="margin-top:10px;min-height:44px;border-radius:10px;width:100%;font-weight:700">✓ Add to My Shift</button>
                  </div>
                </div>`;
              }).join('')}
            </div>
            `}
          </div>
        </div>


        <div class="neu-card" style="margin-top:16px;padding:16px;border-radius:14px"><h3 style="font-weight:700;font-size:14px">Credits (${credits.length})</h3><div style="margin-top:10px;display:flex;flex-direction:column;gap:6px">${credits.map(c=>`<div style="display:flex;justify-content:space-between;font-size:13px;padding:8px 0;border-bottom:1px solid #f0f0f0"><span>${c.customer}</span><span style="font-weight:700">${formatCurrency(c.amount)}</span></div>`).join('') || `<p style="font-size:12px;color:var(--text-secondary);padding:8px 0">No credits</p>`}</div></div>
        <div class="neu-card" style="margin-top:12px;padding:16px;border-radius:14px"><h3 style="font-weight:700;font-size:14px">Expenses (${expenses.length})</h3><div style="margin-top:10px;display:flex;flex-direction:column;gap:6px">${expenses.map(e=>`<div style="display:flex;justify-content:space-between;font-size:13px;padding:8px 0;border-bottom:1px solid #f0f0f0"><span>${e.category}</span><span style="font-weight:700">${formatCurrency(e.amount)}</span></div>`).join('') || `<p style="font-size:12px;color:var(--text-secondary);padding:8px 0">No expenses</p>`}</div></div>
      </div>
      <div id="creditModal" class="modal-backdrop" style="display:none"><div class="modal" style="border-radius:16px"><div style="display:flex;justify-content:space-between;align-items:center"><h3 style="font-weight:700">Add Credit</h3><button class="neu-btn neu-btn--small" style="min-height:36px;min-width:36px;border-radius:50%" onclick="document.getElementById('creditModal').style.display='none'">✕</button></div><div class="grid" style="margin-top:16px;gap:14px"><div><label class="label">Customer</label><input id="cr_customer" class="neu-input" style="min-height:44px;border-radius:10px"></div><div><label class="label">Amount</label><input id="cr_amount" class="neu-input" type="number" style="min-height:44px;border-radius:10px"></div><button id="saveCredit" class="neu-btn neu-btn--primary neu-btn--block" style="min-height:48px;border-radius:12px;font-weight:700">Save Credit</button></div></div></div>
      <div id="expenseModal" class="modal-backdrop" style="display:none"><div class="modal" style="border-radius:16px"><div style="display:flex;justify-content:space-between;align-items:center"><h3 style="font-weight:700">Add Expense</h3><button class="neu-btn neu-btn--small" style="min-height:36px;min-width:36px;border-radius:50%" onclick="document.getElementById('expenseModal').style.display='none'">✕</button></div><div class="grid" style="margin-top:16px;gap:14px"><div><label class="label">Category</label><select id="ex_cat" class="neu-select" style="min-height:44px;border-radius:10px"><option>Maintenance</option><option>Testing</option><option>Breakfast</option><option>Tea & Snacks</option><option>Cleaning</option><option>Petty Cash</option><option>Other</option></select></div><div><label class="label">Amount</label><input id="ex_amount" class="neu-input" type="number" style="min-height:44px;border-radius:10px"></div><button id="saveExpense" class="neu-btn neu-btn--primary neu-btn--block" style="min-height:48px;border-radius:12px;font-weight:700">Save Expense</button></div></div></div>
      <div id="noteModal" class="modal-backdrop" style="display:none"><div class="modal" style="border-radius:16px"><div style="display:flex;justify-content:space-between;align-items:center"><h3 style="font-weight:700">Add Note</h3><button class="neu-btn neu-btn--small" style="min-height:36px;min-width:36px;border-radius:50%" onclick="document.getElementById('noteModal').style.display='none'">✕</button></div><div class="grid" style="margin-top:16px;gap:14px"><div><label class="label">Note</label><textarea id="note_text" class="neu-input" rows="3" style="border-radius:10px"></textarea></div><button id="saveNote" class="neu-btn neu-btn--primary neu-btn--block" style="min-height:48px;border-radius:12px;font-weight:700">Save Note</button></div></div></div>
    `;
    root.querySelector('#saveCredit').addEventListener('click', async ()=>{ const customer = root.querySelector('#cr_customer').value.trim(); const amount = root.querySelector('#cr_amount').value; if (!customer || !amount) return alert('Fill required'); try { await addCredit({ stationId: shift.stationId, shiftId: shift.id, customer, amount }); location.reload(); } catch(e){ alert(e.message); } });
    root.querySelector('#saveExpense').addEventListener('click', async ()=>{ const category = root.querySelector('#ex_cat').value; const amount = root.querySelector('#ex_amount').value; if (!amount) return alert('Amount required'); try { await addExpense({ stationId: shift.stationId, shiftId: shift.id, category, amount, description: category }); location.reload(); } catch(e){ alert(e.message); } });
    root.querySelector('#saveNote').addEventListener('click', async ()=>{ const text = root.querySelector('#note_text').value.trim(); if (!text) return alert('Note required'); try { await addNote({ stationId: shift.stationId, shiftId: shift.id, text }); location.reload(); } catch(e){ alert(e.message); } });

    // Add Pump / Nozzle to active shift
    root.querySelector('#addNozzleBtn')?.addEventListener('click', ()=>{
      document.getElementById('addPumpModal').style.display='flex';
    });

    // Select nozzle to add - show opening form
    root.querySelectorAll('#availableList .neu-card').forEach(card=>{
      card.addEventListener('click', (e)=>{
        if (e.target.classList.contains('confirm-add') || e.target.classList.contains('opening-add')) return;
        // Hide all forms, show this one
        root.querySelectorAll('#availableList .add-form').forEach(f=>f.style.display='none');
        root.querySelectorAll('#availableList .neu-card').forEach(c=>c.style.borderColor='var(--border)');
        const form = card.querySelector('.add-form');
        if (form) {
          form.style.display='block';
          card.style.borderColor='#52c41a';
          card.style.background='#f6ffed';
        }
      });
    });

    // Confirm add nozzle
    root.querySelectorAll('.confirm-add').forEach(btn=>{
      btn.addEventListener('click', async (e)=>{
        e.stopPropagation();
        const card = btn.closest('.neu-card');
        const nozzleId = card.dataset.nozzle;
        const pumpId = card.dataset.pump;
        const fuelType = card.dataset.fuel;
        const openingInput = card.querySelector('.opening-add');
        const opening = Number(openingInput.value);
        if (isNaN(opening) || opening < 0) return alert('Enter valid opening reading');
        
        if (!confirm(`Add ${fuelType} nozzle to your active shift with opening ${opening}?\n\nThis pump will be added to your account and you can close it together with current shift.`)) return;
        
        btn.disabled = true;
        btn.textContent = 'Adding...';
        try {
          const { addNozzleToShift } = await import('../services/shifts.js');
          await addNozzleToShift(shift.id, { nozzleId, pumpId, fuelType, openingReading: opening });
          alert(`✅ Added ${fuelType} pump to your shift!`);
          location.reload();
        } catch(err){
          alert('Failed: ' + err.message);
          btn.disabled = false;
          btn.textContent = '✓ Add to My Shift';
        }
      });
    });

    // Remove nozzle from active shift
    root.querySelectorAll('.remove-nozzle-btn').forEach(btn=>{
      btn.addEventListener('click', async (e)=>{
        e.stopPropagation();
        const nozzleId = btn.dataset.id;
        if ((shift.nozzles||[]).length <= 1) return alert('Cannot remove last nozzle - at least one required');
        if (!confirm('Remove this nozzle from your active shift? You can add it again later.')) return;
        try {
          const { removeNozzleFromShift } = await import('../services/shifts.js');
          await removeNozzleFromShift(shift.id, nozzleId);
          alert('✅ Removed nozzle from shift');
          location.reload();
        } catch(err){ alert(err.message); }
      });
    });


  } else {
    const t = shift.totals || {};
    const totalCredits = credits.reduce((a,c)=>a+Number(c.amount||0),0);
    const totalExpenses = expenses.reduce((a,c)=>a+Number(c.amount||0),0);
    const isShort = (t.variance||0) < -0.5;
    const isExcess = (t.variance||0) > 0.5;
    const isRejected = shift.status === 'REJECTED';
    const isPending = shift.status === 'PENDING_REVIEW';

    root.innerHTML = `
      <div class="container" style="max-width:480px;margin:0 auto;padding-bottom:${canReview && isPending ? '180px' : '80px'}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <button class="neu-btn" style="min-height:40px;padding:0 14px;border-radius:10px;font-weight:600" onclick="location.hash='#/shifts'">← Back</button>
          <div style="display:flex;gap:8px"><button class="neu-btn" style="min-height:40px;min-width:40px;border-radius:10px" onclick="window.print()">🖨️</button><button class="neu-btn" style="min-height:40px;min-width:40px;border-radius:10px" id="exportCsv">⬇️</button></div>
        </div>

        ${isRejected && shift.correctionRequests?.length ? `
          <div class="neu-card" style="background:#fff1f0;border:1.5px solid #ffa39e;margin-bottom:16px;padding:16px;border-radius:14px">
            <h3 style="font-weight:700;color:#cf1322;display:flex;align-items:center;gap:8px;font-size:15px">⚠️ Correction Requested</h3>
            <p style="font-size:12px;color:var(--text-secondary);margin-top:6px">Manager pointed at specific fields. Fix and resubmit.</p>
            <div style="margin-top:14px;display:flex;flex-direction:column;gap:10px">
              ${shift.correctionRequests.map(cr=>`
                <div style="padding:12px;background:white;border-radius:10px;border-left:4px solid #ff4d4f">
                  <div style="display:flex;justify-content:space-between;align-items:center"><span style="font-weight:600;font-size:12px">${cr.type==='nozzle' ? '⛽ Nozzle' : cr.type==='payment' ? '💰 Payment' : cr.type==='credit' ? '💳 Credit' : cr.type==='expense' ? '🧾 Expense' : '📌'} ${cr.field||cr.type} ${cr.targetId? '('+cr.targetId.slice(0,4)+')':''}</span><span style="font-size:10px;background:#fff1f0;color:#cf1322;padding:4px 8px;border-radius:12px;font-weight:600">${cr.status||'PENDING'}</span></div>
                  <div style="font-size:13px;margin-top:6px;line-height:1.4">${cr.message}</div>
                  <div style="font-size:10px;color:var(--text-tertiary);margin-top:6px">By ${cr.requestedByName||'Manager'} • ${new Date(cr.requestedAt).toLocaleString()}</div>
                </div>
              `).join('')}
            </div>
            ${isOwnerOfShift ? `<button id="fixAndResubmit" class="neu-btn neu-btn--primary neu-btn--block" style="margin-top:16px;min-height:52px;border-radius:14px;background:#fa541c;border-color:#fa541c;font-weight:700;font-size:15px">🔧 Fix & Resubmit Shift</button>` : ''}
            ${canReview ? `<button id="adminFix" class="neu-btn neu-btn--block" style="margin-top:10px;min-height:48px;border-radius:12px;background:#232f3e;color:white;font-weight:700">🔓 Admin: Reopen & Fix What's Wrong</button><p style="font-size:10px;color:var(--text-tertiary);text-align:center;margin-top:6px">Admin can fix readings and approve directly — its money bro, kastam 💸</p>` : ''}
          </div>
        ` : ''}

        ${isRejected && !shift.correctionRequests?.length && shift.rejectionReason ? `
          <div class="neu-card" style="background:#fff1f0;border:1.5px solid #ffa39e;margin-bottom:16px;padding:16px;border-radius:14px">
            <h3 style="font-weight:700;color:#cf1322">⚠️ Rejected</h3>
            <p style="font-size:13px;margin-top:8px;line-height:1.4">${shift.rejectionReason}</p>
            ${isOwnerOfShift ? `<button id="fixAndResubmit" class="neu-btn neu-btn--primary neu-btn--block" style="margin-top:14px;min-height:48px;border-radius:12px;font-weight:700">Fix & Resubmit</button>` : ''}
            ${canReview ? `<button id="adminFix" class="neu-btn neu-btn--block" style="margin-top:10px;min-height:48px;border-radius:12px;background:#232f3e;color:white;font-weight:700">🔓 Admin: Reopen & Fix & Approve</button><p style="font-size:10px;color:var(--text-tertiary);text-align:center;margin-top:6px">Admin can fix and approve directly — money matters</p>` : ''}
          </div>
        ` : ''}

        <div class="neu-card" style="padding:0;overflow:hidden;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
          <div style="background:#232f3e;color:white;padding:18px;display:flex;justify-content:space-between;align-items:center">
            <div><div style="font-weight:800;font-size:18px;letter-spacing:0.5px">FuelOps</div><div style="font-size:11px;opacity:0.8;margin-top:3px">Shift Receipt • ${stationName}</div></div>
            <div style="text-align:right"><div style="font-size:11px;opacity:0.8">Shift ID</div><div style="font-weight:700;font-size:14px">#${shift.id.slice(0,6).toUpperCase()}</div><div style="font-size:10px;margin-top:6px"><span class="badge" style="background:${shift.status==='APPROVED'?'#52c41a': shift.status==='PENDING_REVIEW'?'#faad14':'#ff4d4f'};color:white;border:none;font-size:10px;padding:6px 10px;border-radius:20px">${shift.status}</span></div></div>
          </div>
          <div style="padding:16px;background:#f8f9fa;border-bottom:1px solid #eee">
            <div style="display:flex;justify-content:space-between;font-size:13px"><div><div style="color:var(--text-secondary);font-size:10px;text-transform:uppercase;letter-spacing:0.5px">Employee</div><div style="font-weight:600;margin-top:4px;font-size:14px">${shift.employeeName}</div></div><div style="text-align:right"><div style="color:var(--text-secondary);font-size:10px;text-transform:uppercase;letter-spacing:0.5px">Date</div><div style="font-weight:500;margin-top:4px;font-size:12px">${new Date(shift.startTime).toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'})}</div><div style="font-size:11px;color:var(--text-secondary);margin-top:2px">${new Date(shift.startTime).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} → ${shift.endTime? new Date(shift.endTime).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):''}</div></div></div>
          </div>
          <div style="padding:18px">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-secondary);margin-bottom:14px;display:flex;justify-content:space-between;align-items:center"><span>Fuel Sales</span>${canReview && isPending ? `<span style="font-size:10px;color:#fa541c;background:#fffbe6;padding:4px 8px;border-radius:20px">Tap ⚠️ to flag</span>` : ''}</div>
            ${(shift.nozzles||[]).map(n=>{
              const hasCorrection = shift.correctionRequests?.some(cr=>cr.type==='nozzle' && cr.targetId===n.nozzleId);
              return `
              <div style="display:flex;justify-content:space-between;padding:14px 0;border-bottom:1px solid #f0f0f0;gap:14px;${hasCorrection?'background:#fff1f0;border-radius:10px;padding:14px;margin:6px -8px;border:1px solid #ffa39e':''}">
                <div style="flex:1"><div style="font-weight:600;font-size:14px;display:flex;align-items:center;gap:8px">${n.fuelType} ${hasCorrection?'<span style="font-size:10px;background:#ff4d4f;color:white;padding:3px 8px;border-radius:12px">FLAGGED</span>':''}</div><div style="font-size:12px;color:var(--text-secondary);margin-top:4px">${(n.litersSold||0).toFixed(2)} L × ${formatCurrency(n.price||0)}</div><div style="font-size:11px;color:var(--text-tertiary);margin-top:3px">${Number(n.openingReading).toFixed(0)} → ${Number(n.closingReading||0).toFixed(0)}</div></div>
                <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:8px"><div style="font-weight:700;font-size:15px">${formatCurrency(n.revenue||0)}</div>${canReview && isPending ? `<button class="neu-btn flag-btn" data-type="nozzle" data-target="${n.nozzleId}" data-field="closingReading" style="min-height:32px;padding:0 12px;border-radius:20px;font-size:11px;font-weight:600;background:#fffbe6;border:1px solid #ffe58f;color:#ad6800">⚠️ Flag</button>` : ''}</div>
              </div>
            `}).join('')}
            <div style="margin-top:6px;border:1.5px solid #e0e0e0;border-radius:12px;overflow:hidden">
              <div style="display:flex;justify-content:space-between;padding:12px 16px;background:#f8f9fa;font-weight:600;font-size:14px"><span>Gross Fuel Sales (from nozzles)</span><span>${formatCurrency(t.totalRevenue||0)}</span></div>
              ${totalExpenses>0.5 ? `<div style="display:flex;justify-content:space-between;padding:10px 16px;background:#fffbe6;font-size:13px;color:#ad6800;border-top:1px solid #ffe58f"><span>🧪 Less: Testing/Expenses (fuel came out of nozzle)</span><span style="font-weight:700;color:#fa541c">-${formatCurrency(totalExpenses)}</span></div>` : ''}
              ${totalExpenses>0.5 ? `<div style="display:flex;justify-content:space-between;padding:14px 16px;background:#f6ffed;font-weight:800;font-size:16px;border-top:1.5px solid #b7eb8f;color:#389e0d"><span>Net Fuel Sales (whole amount to owner)</span><span>${formatCurrency(Math.max(0,(t.totalRevenue||0)-totalExpenses))}</span></div>` : `<div style="display:flex;justify-content:space-between;padding:14px 16px;background:#e6f4ff;font-weight:800;font-size:17px;border-top:2px solid #232f3e"><span>Total Fuel Sales</span><span>${formatCurrency(t.totalRevenue||0)}</span></div>`}
            </div>
            <div style="margin-top:18px">
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-secondary);margin-bottom:12px;display:flex;justify-content:space-between;align-items:center"><span>Payments Received</span>${canReview && isPending ? `<button class="neu-btn flag-btn" data-type="payment" data-field="payments" style="min-height:32px;padding:0 12px;border-radius:20px;font-size:11px;font-weight:600;background:#fffbe6;border:1px solid #ffe58f;color:#ad6800">⚠️ Flag Payment</button>` : ''}</div>
              <div style="background:#f8f9fa;border-radius:12px;padding:14px">
                ${[
                  {label:'Cash', val: t.payments?.cash||0, field:'cash'},
                  {label:'Card', val: t.payments?.card||0, field:'card'},
                  {label:'UPI', val: t.payments?.upi||0, field:'upi'},
                  {label:'Credit', val: t.payments?.credit||0, field:'credit'},
                  {label:'Other', val: t.payments?.other||0, field:'other'},
                ].filter(p=>p.val>0).map(p=>`
                  <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:14px;${shift.correctionRequests?.some(cr=>cr.type==='payment' && cr.field===p.field)?'background:#fff1f0;border-radius:8px;padding:8px 10px;border:1px solid #ffa39e;margin:2px 0':''}">
                    <span style="color:var(--text-secondary);display:flex;align-items:center;gap:8px">${p.label} ${shift.correctionRequests?.some(cr=>cr.type==='payment' && cr.field===p.field)?'<span style="font-size:9px;background:#ff4d4f;color:white;padding:2px 6px;border-radius:10px">FLAGGED</span>':''}</span><span style="font-weight:600">${formatCurrency(p.val)}</span>
                  </div>
                `).join('') || `<div style="font-size:13px;color:var(--text-secondary);text-align:center;padding:10px">No payments recorded</div>`}
                <div style="height:1px;background:#e0e0e0;margin:10px 0"></div>
                <div style="display:flex;justify-content:space-between;font-size:14px"><span style="color:var(--text-secondary)">Recorded Payments</span><span style="font-weight:600">${formatCurrency(t.totalPayments||0)}</span></div>
                <div style="display:flex;justify-content:space-between;font-size:14px;margin-top:6px"><span style="color:var(--text-secondary)">Gross Expected</span><span style="font-weight:600">${formatCurrency(t.totalRevenue||0)}</span></div>
                ${totalExpenses>0.5 ? `<div style="display:flex;justify-content:space-between;font-size:13px;margin-top:6px;padding:8px;background:#fffbe6;border-radius:8px;border:1px solid #ffe58f"><span style="color:#ad6800">Less: Expenses (testing)</span><span style="font-weight:700;color:#fa541c">-${formatCurrency(totalExpenses)}</span></div>` : ''}
                <div style="display:flex;justify-content:space-between;font-size:14px;margin-top:6px;padding:10px;background:#f6ffed;border-radius:8px;border:1px solid #b7eb8f;font-weight:700"><span style="color:#389e0d">Net Expected (whole amount to owner)</span><span style="font-weight:800;color:#389e0d">${formatCurrency(Math.max(0,(t.totalRevenue||0)-totalExpenses))}</span></div>
                ${(() => {
                  const gross = t.totalRevenue||0;
                  const net = Math.max(0, gross - totalExpenses);
                  const paid = t.totalPayments||0;
                  const netVariance = paid - net;
                  const absNet = Math.abs(netVariance);
                  let label, desc, bg, border, color, amount;
                  if (absNet < 0.5) {
                    label = '✅ Balanced'; desc = `Gross ${formatCurrency(gross)} - Expenses ${formatCurrency(totalExpenses)} = Net ${formatCurrency(net)} • Payments ${formatCurrency(paid)} match • All settled`; bg = '#f0f0f0'; border = '#e0e0e0'; color = 'var(--text)'; amount = 0;
                  } else if (netVariance < -0.5) {
                    amount = absNet;
                    if (isOwnerOfShift) {
                      label = '💸 To Handover to Owner'; desc = `Net ${formatCurrency(net)} (Gross ${formatCurrency(gross)} - Expenses ${formatCurrency(totalExpenses)}) - Payments ${formatCurrency(paid)} = ${formatCurrency(absNet)} to give • Owner will receive after approval • Testing reduces whole balance`; bg = '#fff1f0'; border = '#ffa39e'; color = '#cf1322';
                    } else {
                      label = `💸 To Handover to Owner`; desc = `Net ${formatCurrency(net)} (Gross ${formatCurrency(gross)} - Expenses ${formatCurrency(totalExpenses)}) - Payments ${formatCurrency(paid)} = ${formatCurrency(absNet)} to handover • Simple, no jackpot`; bg = '#fff1f0'; border = '#ffa39e'; color = '#cf1322';
                    }
                  } else {
                    amount = absNet;
                    if (isOwnerOfShift) {
                      label = '💰 Excess with You'; desc = `You have ${formatCurrency(absNet)} extra over net ${formatCurrency(net)} • Owner will adjust`; bg = '#f6ffed'; border = '#b7eb8f'; color = '#389e0d';
                    } else {
                      label = `↩️ Excess to Return to ${shift.employeeName}`; desc = `Return ${formatCurrency(absNet)} to ${shift.employeeName} • Net ${formatCurrency(net)}`; bg = '#f6ffed'; border = '#b7eb8f'; color = '#389e0d';
                    }
                  }
                  return `<div style="padding:14px;background:${bg};border-radius:12px;margin-top:14px;border:1.5px solid ${border}"><div style="display:flex;justify-content:space-between;align-items:center"><span style="font-weight:800;font-size:14px;color:${color}">${label}</span><span style="font-weight:800;font-size:18px;color:${color}">${formatCurrency(amount)}</span></div><div style="font-size:11px;color:var(--text-secondary);margin-top:6px;line-height:1.4">${desc}</div>${totalExpenses>0.5 ? `<div style="margin-top:8px;padding:8px;background:white;border-radius:8px;border:1px solid ${border};font-size:10px"><span style="color:#389e0d;font-weight:700">✓ Color coding: Gross (gray) - Expenses (orange -${formatCurrency(totalExpenses)}) = Net (green ${formatCurrency(net)}) • To Handover = Net - Payments = ${formatCurrency(net)} - ${formatCurrency(paid)} = ${formatCurrency(amount)}</span></div>` : ''}</div>`;
                })()}
              </div>
            </div>
            <div style="margin-top:14px;padding:10px;background:#f8f9fa;border-radius:10px;border:1px solid #eee;text-align:center"><div style="font-size:11px;color:var(--text-secondary)">✅ Simple: No jackpot collections • To Handover = Net - Payments • Check Reports for totals</div></div>
            ${credits.length ? `<div style="margin-top:18px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-secondary);margin-bottom:10px;display:flex;justify-content:space-between;align-items:center"><span>Credits • ${formatCurrency(totalCredits)}</span>${canReview && isPending ? `<button class="neu-btn flag-btn" data-type="credit" data-field="credits" style="min-height:32px;padding:0 12px;border-radius:20px;font-size:11px;background:#fffbe6;border:1px solid #ffe58f;color:#ad6800">⚠️ Flag</button>` : ''}</div>${credits.map(c=>`<div style="display:flex;justify-content:space-between;font-size:13px;padding:8px 0;border-bottom:1px dashed #eee"><span>${c.customer}</span><span style="font-weight:600">${formatCurrency(c.amount)}</span></div>`).join('')}</div>` : ''}
            ${expenses.length ? `<div style="margin-top:18px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-secondary);margin-bottom:10px;display:flex;justify-content:space-between;align-items:center"><span>Expenses • ${formatCurrency(totalExpenses)}</span>${canReview && isPending ? `<button class="neu-btn flag-btn" data-type="expense" data-field="expenses" style="min-height:32px;padding:0 12px;border-radius:20px;font-size:11px;background:#fffbe6;border:1px solid #ffe58f;color:#ad6800">⚠️ Flag</button>` : ''}</div>${expenses.map(e=>`<div style="display:flex;justify-content:space-between;font-size:13px;padding:8px 0;border-bottom:1px dashed #eee"><span>${e.category}</span><span style="font-weight:600">${formatCurrency(e.amount)}</span></div>`).join('')}</div>` : ''}
            ${notes.length ? `<div style="margin-top:18px;padding:12px;background:#fffbe6;border-radius:10px;border:0.5px solid #ffe58f"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#ad6800;margin-bottom:8px">Note</div><div style="font-size:13px;line-height:1.4">${notes[0]?.text||''}</div></div>` : ''}
          </div>
          <div style="padding:14px 18px;background:#f8f9fa;border-top:1px solid #eee;text-align:center"><div style="font-size:11px;color:var(--text-tertiary)">Thank you • FuelOps • ${stationName}</div><div style="font-size:10px;color:var(--text-tertiary);margin-top:3px">Generated ${new Date().toLocaleString('en-IN')}</div></div>
        </div>

        ${isPending && canReview ? `
          <div id="pendingCorrectionsBox" style="margin-top:18px;display:none">
            <div class="neu-card" style="background:#fffbe6;border:1.5px solid #ffe58f;padding:16px;border-radius:14px">
              <h3 style="font-weight:700;color:#ad6800;font-size:14px">📝 Corrections to Request (<span id="correctionCount">0</span>)</h3>
              <div id="correctionList" style="margin-top:12px;display:flex;flex-direction:column;gap:8px"></div>
              <div style="margin-top:14px"><label class="label" style="font-size:12px">General Reason (optional)</label><textarea id="generalReason" class="neu-input" rows="2" placeholder="Overall issue..." style="min-height:60px;border-radius:10px"></textarea></div>
              <div style="margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:12px"><button id="clearCorrections" class="neu-btn" style="min-height:44px;border-radius:10px;font-weight:600">Clear All</button><button id="sendCorrections" class="neu-btn neu-btn--primary" style="min-height:44px;border-radius:10px;background:#fa541c;border-color:#fa541c;font-weight:700">Send Request</button></div>
            </div>
          </div>
        ` : ''}

        <div style="margin-top:20px;display:flex;justify-content:center"><button class="neu-btn" style="min-height:44px;padding:0 18px;border-radius:12px;font-weight:600" onclick="location.hash='#/shifts'">Back to Shifts</button></div>
      </div>

      <!-- Sticky handy approve bar - major things out handy -->
      ${isPending && canReview ? `
        <div style="position:fixed;bottom:0;left:0;right:0;background:white;border-top:1px solid #eee;padding:12px 16px;display:flex;gap:12px;z-index:100;box-shadow:0 -4px 20px rgba(0,0,0,0.08);max-width:480px;margin:0 auto;left:50%;transform:translateX(-50%);width:100%;border-radius:16px 16px 0 0">
          <button id="approveBtn" class="neu-btn neu-btn--primary" style="flex:1;min-height:52px;border-radius:12px;background:#52c41a;border-color:#52c41a;font-weight:700;font-size:15px">✓ Approve</button>
          <button id="rejectBtn" class="neu-btn" style="flex:1;min-height:52px;border-radius:12px;font-weight:700;font-size:15px;background:#fff1f0;border:1px solid #ffa39e;color:#cf1322">✗ Reject</button>
        </div>
      ` : ''}
    `;

    let pendingCorrections = [];
    if (canReview) {
      root.querySelectorAll('.flag-btn').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const type = btn.dataset.type;
          const target = btn.dataset.target || '';
          const field = btn.dataset.field || type;
          const message = prompt(`Request correction for ${type} ${field} ${target? '('+target.slice(0,4)+')':''}:\nEnter what is wrong:`);
          if (!message) return;
          pendingCorrections.push({ type, targetId: target, field, message });
          updateCorrectionBox();
          btn.textContent = '✓ Flagged';
          btn.style.background = '#fff1f0';
          btn.style.borderColor = '#ffa39e';
          btn.style.color = '#cf1322';
          btn.disabled = true;
        });
      });
      function updateCorrectionBox() {
        const box = root.querySelector('#pendingCorrectionsBox');
        const list = root.querySelector('#correctionList');
        const count = root.querySelector('#correctionCount');
        if (pendingCorrections.length===0) { box.style.display='none'; return; }
        box.style.display='block';
        count.textContent = pendingCorrections.length;
        list.innerHTML = pendingCorrections.map((cr,i)=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:white;border-radius:10px;border:0.5px solid #ffe58f"><div style="flex:1"><div style="font-weight:600;font-size:12px">${cr.type} • ${cr.field} ${cr.targetId? '('+cr.targetId.slice(0,4)+')':''}</div><div style="font-size:12px;margin-top:4px;line-height:1.3">${cr.message}</div></div><button class="neu-btn remove-corr" data-idx="${i}" style="min-height:32px;min-width:32px;border-radius:50%;font-size:12px;margin-left:8px">✕</button></div>`).join('');
        root.querySelectorAll('.remove-corr').forEach(b=>{
          b.addEventListener('click', ()=>{
            pendingCorrections.splice(Number(b.dataset.idx),1);
            root.querySelectorAll('.flag-btn').forEach(fb=>{ fb.disabled=false; fb.textContent=fb.dataset.type==='payment'?'⚠️ Flag Payment':'⚠️ Flag'; fb.style.background='#fffbe6'; });
            pendingCorrections.forEach(pc=>{
              root.querySelectorAll(`.flag-btn[data-type="${pc.type}"][data-target="${pc.targetId||''}"]`).forEach(fb=>{ fb.textContent='✓ Flagged'; fb.disabled=true; fb.style.background='#fff1f0'; });
            });
            updateCorrectionBox();
          });
        });
      }
      root.querySelector('#clearCorrections')?.addEventListener('click', ()=>{
        pendingCorrections = [];
        root.querySelectorAll('.flag-btn').forEach(fb=>{ fb.disabled=false; fb.textContent=fb.dataset.type==='payment'?'⚠️ Flag Payment':'⚠️ Flag'; fb.style.background='#fffbe6'; });
        updateCorrectionBox();
      });
      root.querySelector('#sendCorrections')?.addEventListener('click', async ()=>{
        if (pendingCorrections.length===0) return alert('Flag at least one field');
        const reason = root.querySelector('#generalReason').value.trim();
        if (!confirm(`Send ${pendingCorrections.length} correction(s) to ${shift.employeeName}?`)) return;
        try { await requestCorrections(shift.id, pendingCorrections, reason); alert(`✅ ${pendingCorrections.length} correction(s) sent`); location.reload(); } catch(e){ alert('Failed: ' + e.message); }
      });
    }

    // Collections removed - no jackpot collect buttons, simple To Handover in receipt only

    root.querySelector('#approveBtn')?.addEventListener('click', async ()=>{
      if (!confirm('Approve this shift?')) return;
      try { await approveShift(shift.id); alert('Approved'); location.hash='#/shifts'; } catch(e){ alert(e.message); }
    });
    root.querySelector('#rejectBtn')?.addEventListener('click', async ()=>{
      const reason = prompt('Reason for rejection?');
      if (!reason) return;
      try { await rejectShift(shift.id, reason); alert('Rejected'); location.hash='#/shifts'; } catch(e){ alert(e.message); }
    });
    root.querySelector('#fixAndResubmit')?.addEventListener('click', ()=>{ location.hash = `#/shifts/${shift.id}/close`; });
    root.querySelector('#adminFix')?.addEventListener('click', ()=>{
      if (!confirm(`Admin: Reopen and fix this rejected shift?\n\nYou will be able to:\n• See what's wrong\n• Edit closing readings\n• Fix payments\n• Approve directly\n\nIts money bro, kastam 💸\n\nContinue?`)) return;
      location.hash = `#/shifts/${shift.id}/close?admin=1`;
    });
    root.querySelector('#exportCsv')?.addEventListener('click', ()=>{
      const csv = generateShiftCSV(shift, credits, expenses);
      const blob = new Blob([csv], { type:'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href=url; a.download=`shift-${shift.id}.csv`; a.click(); URL.revokeObjectURL(url);
    });
  }
}

export async function closeShiftView({ root, params }) {
  const { id } = params;
  const shift = await getShiftById(id);
  if (!shift || (shift.status!=='ACTIVE' && shift.status!=='REJECTED')) { root.innerHTML=`<div class="container"><div class="neu-card empty"><p>Shift not active or rejected</p></div></div>`; return; }
  const activePrices = await getActivePrices(shift.stationId);
  const isResubmit = shift.status === 'REJECTED';
  const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const isAdminFix = urlParams.get('admin')==='1' || location.hash.includes('admin=1');
  const { user } = getState();
  const canReview = ['owner','manager','admin','super_admin'].includes(user.role);

  root.innerHTML = `
    <div class="container" style="max-width:480px;margin:0 auto;padding-bottom:100px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px">
        <button class="neu-btn" style="min-height:40px;padding:0 14px;border-radius:10px;font-weight:600" onclick="history.back()">← Back</button>
        <div><h1 class="page-title" style="font-size:18px">${isResubmit?'Fix & Resubmit Shift':'Close Shift'}</h1><p class="page-sub" style="font-size:12px;margin-top:2px">${shift.employeeName} • ${formatDateTime(shift.startTime)} ${isResubmit? '• Fix requested' : ''}</p></div>
      </div>

      ${isResubmit && shift.correctionRequests?.length ? `
        <div class="neu-card" style="background:#fff1f0;border:1.5px solid #ffa39e;margin-bottom:16px;padding:14px;border-radius:12px">
          <h3 style="font-weight:700;color:#cf1322;font-size:13px">⚠️ Fix These Fields</h3>
          <div style="margin-top:10px;display:flex;flex-direction:column;gap:8px">${shift.correctionRequests.map(cr=>`<div style="font-size:12px;padding:8px;background:white;border-radius:8px;border-left:3px solid #ff4d4f"><b>${cr.type} ${cr.field}</b>: ${cr.message}</div>`).join('')}</div>
        </div>
      ` : ''}

      <div id="closeForm" style="display:flex;flex-direction:column;gap:14px">
        ${(shift.nozzles||[]).map(n=>{
          const flagged = shift.correctionRequests?.some(cr=>cr.type==='nozzle' && cr.targetId===n.nozzleId);
          return `
          <div class="neu-card" style="padding:16px;border-radius:14px;${flagged?'border:1.5px solid #ff4d4f;background:#fff1f0':''}">
            <div style="display:flex;justify-content:space-between;align-items:center"><div style="font-weight:700;font-size:14px">${n.fuelType} ${flagged?'<span style="font-size:10px;background:#ff4d4f;color:white;padding:3px 8px;border-radius:12px;margin-left:6px">NEEDS FIX</span>':''}</div><span style="font-size:11px;background:var(--bg);padding:6px 10px;border-radius:20px">Nozzle</span></div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:6px">Opening: ${Number(n.openingReading).toFixed(2)} • Price ${formatCurrency(activePrices[n.fuelType]?.price||0)}</div>
            <div style="margin-top:12px"><label class="label" style="font-size:12px">Closing Reading ${flagged?'<span style="color:#ff4d4f">* Fix this</span>':''}</label><input class="neu-input closing-input" data-id="${n.nozzleId}" type="number" step="0.01" value="${n.closingReading||''}" placeholder="${Number(n.openingReading).toFixed(2)}" style="min-height:48px;border-radius:10px;font-size:16px;font-weight:600;${flagged?'border-color:#ff4d4f;background:white':''}"></div>
            <div style="margin-top:10px;font-size:13px;font-weight:600;padding:8px;background:var(--bg);border-radius:8px" id="calc-${n.nozzleId}">Sold: - • Revenue: -</div>
          </div>
        `}).join('')}
      </div>

      <div class="neu-card" style="margin-top:18px;padding:16px;border-radius:14px">
        <h3 style="font-weight:700;font-size:15px">💰 Payments Received</h3>
        <div class="grid grid-2" style="margin-top:14px;gap:12px">
          <div><label class="label">Cash</label><input id="pay_cash" class="neu-input" type="number" value="${shift.totals?.payments?.cash||0}" style="min-height:48px;border-radius:10px;font-size:15px"></div>
          <div><label class="label">Card</label><input id="pay_card" class="neu-input" type="number" value="${shift.totals?.payments?.card||0}" style="min-height:48px;border-radius:10px;font-size:15px"></div>
          <div><label class="label">UPI</label><input id="pay_upi" class="neu-input" type="number" value="${shift.totals?.payments?.upi||0}" style="min-height:48px;border-radius:10px;font-size:15px"></div>
          <div><label class="label">Credit</label><input id="pay_credit" class="neu-input" type="number" value="${shift.totals?.payments?.credit||0}" style="min-height:48px;border-radius:10px;font-size:15px"></div>
          <div style="grid-column:span 2"><label class="label">Other</label><input id="pay_other" class="neu-input" type="number" value="${shift.totals?.payments?.other||0}" style="min-height:48px;border-radius:10px;font-size:15px"></div>
        </div>
        <div style="margin-top:14px" id="paymentSummary"></div>
      </div>

      <!-- Quick expense buttons + notes while closing - as requested -->
      <div class="neu-card" style="margin-top:18px;padding:16px;border-radius:14px">
        <h3 style="font-weight:700;font-size:15px">🧾 Quick Expenses</h3>
        <p style="font-size:12px;color:var(--text-secondary);margin-top:4px">Add testing, breakfast etc. while closing shift</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
          ${[
            {label:'Testing', icon:'🧪', cat:'Testing'},
            {label:'Breakfast', icon:'🍳', cat:'Breakfast'},
            {label:'Tea & Snacks', icon:'☕', cat:'Tea & Snacks'},
            {label:'Cleaning', icon:'🧹', cat:'Cleaning'},
            {label:'Maintenance', icon:'🔧', cat:'Maintenance'},
            {label:'Petty Cash', icon:'💵', cat:'Petty Cash'},
            {label:'Other', icon:'➕', cat:'Other'},
          ].map(b=>`<button class="neu-btn quick-exp-btn" data-cat="${b.cat}" style="min-height:40px;padding:0 14px;border-radius:20px;font-size:13px;font-weight:600">${b.icon} ${b.label}</button>`).join('')}
        </div>
        <div id="quickExpensesList" style="margin-top:12px;display:flex;flex-direction:column;gap:8px"></div>
      </div>

      <div class="neu-card" style="margin-top:18px;padding:16px;border-radius:14px">
        <h3 style="font-weight:700;font-size:15px">📝 Notes While Closing</h3>
        <p style="font-size:12px;color:var(--text-secondary);margin-top:4px">Add note about shift issues, pump problems etc.</p>
        <textarea id="closingNote" class="neu-input" rows="3" placeholder="e.g., Pump 2 slow, testing done 2 times, breakfast for team..." style="margin-top:12px;min-height:80px;border-radius:10px;font-size:14px"></textarea>
      </div>

      <div id="alertBox" style="margin-top:16px"></div>
    </div>

    <!-- Sticky handy submit bar - admin can fix and approve directly -->
    <div style="position:fixed;bottom:0;left:0;right:0;background:white;border-top:1px solid #eee;padding:12px 16px;z-index:100;box-shadow:0 -4px 20px rgba(0,0,0,0.08);max-width:480px;margin:0 auto;left:50%;transform:translateX(-50%);width:100%;border-radius:16px 16px 0 0">
      ${isAdminFix && canReview ? `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <button id="submitClose" class="neu-btn neu-btn--primary" style="min-height:52px;border-radius:12px;background:#fa541c;border-color:#fa541c;font-weight:700;font-size:14px">🔧 Fix & Resubmit</button>
          <button id="adminApprove" class="neu-btn neu-btn--primary" style="min-height:52px;border-radius:12px;background:#52c41a;border-color:#52c41a;font-weight:700;font-size:14px">✓ Fix & Approve Directly</button>
        </div>
        <p style="font-size:10px;color:var(--text-tertiary);text-align:center;margin-top:8px">Admin: Fix what's wrong and approve — money bro 💸</p>
      ` : `
        <button id="submitClose" class="neu-btn neu-btn--primary neu-btn--block" style="min-height:56px;border-radius:14px;background:${isResubmit?'#fa541c':'#232f3e'};border-color:${isResubmit?'#fa541c':'#232f3e'};font-weight:700;font-size:16px">${isResubmit?'🔧 Fix & Resubmit for Review':'✓ Submit & Close Shift'}</button>
      `}
    </div>
  `;

  const closingInputs = root.querySelectorAll('.closing-input');
  let quickExpenses = [];

  function recalc() {
    let totalRevenue = 0;
    closingInputs.forEach(inp=>{
      const nozzle = shift.nozzles.find(n=>n.nozzleId===inp.dataset.id);
      const closingVal = Number(inp.value);
      const calcEl = root.querySelector(`#calc-${inp.dataset.id}`);
      if (!inp.value || isNaN(closingVal)) { calcEl.textContent = `Sold: - • Revenue: -`; return; }
      try {
        const liters = calcLitersSold(nozzle.openingReading, closingVal);
        const price = activePrices[nozzle.fuelType]?.price || 0;
        const revenue = calcRevenue(liters, price);
        calcEl.textContent = `Sold: ${liters.toFixed(2)} L • Revenue: ${formatCurrency(revenue)}`;
        totalRevenue += revenue;
      } catch(e){ calcEl.textContent = `⚠️ ${e.message}`; }
    });
    const cash = Number(root.querySelector('#pay_cash').value||0);
    const card = Number(root.querySelector('#pay_card').value||0);
    const upi = Number(root.querySelector('#pay_upi').value||0);
    const credit = Number(root.querySelector('#pay_credit').value||0);
    const other = Number(root.querySelector('#pay_other').value||0);
    const totalPayments = cash+card+upi+credit+other;
    const quickTotal = quickExpenses.reduce((a,e)=>a+Number(e.amount||0),0);

    // CORRECTED ACCOUNTING - as per owner: testing fuel came out of nozzle, so it's part of revenue
    // but it's an expense that should REDUCE whole balance you owe to owner
    // Gross Revenue = fuel dispensed * price (includes testing fuel)
    // Net Revenue = Gross - Expenses (what you actually owe owner after testing/breakfast etc)
    // Variance = Payments - Net Revenue (if negative, short = Net - Payments to handover)
    const netRevenue = Math.max(0, totalRevenue - quickTotal);
    const variance = totalPayments - netRevenue;
    const absVariance = Math.abs(variance);
    const cashAfterExpenses = Math.max(0, cash - quickTotal);

    let toHandover = 0;
    let toHandoverLabel = '';
    let varBg, varBorder, varColor, varDesc;

    if (Math.abs(variance) < 0.5) {
      toHandover = cashAfterExpenses > 0 ? cashAfterExpenses : 0;
      toHandoverLabel = '✅ Balanced • Cash to Handover';
      varDesc = `Gross ${formatCurrency(totalRevenue)} - Expenses ${formatCurrency(quickTotal)} = Net ${formatCurrency(netRevenue)} • Payments ${formatCurrency(totalPayments)} match net • Cash after expenses ${formatCurrency(cashAfterExpenses)} to give`;
      varBg = '#f0f0f0'; varBorder = '#e0e0e0'; varColor = 'var(--text)';
    } else if (variance < -0.5) {
      // SHORT: payments < net revenue
      // To Handover = Net Revenue - Payments = (Gross - Expenses) - Payments
      // This is what attendant needs to give to owner
      toHandover = Math.max(0, netRevenue - totalPayments);
      // If cash entered, physical cash to give is cashAfterExpenses, but total owed is net - payments
      // Show both: total to handover (short) and cash in hand
      toHandoverLabel = '💸 To Handover to Owner';
      varDesc = `Gross ${formatCurrency(totalRevenue)} - Expenses ${formatCurrency(quickTotal)} = Net ${formatCurrency(netRevenue)} • Payments ${formatCurrency(totalPayments)} • Short ${formatCurrency(absVariance)} to give • Cash in hand after expenses ${formatCurrency(cashAfterExpenses)}`;
      varBg = '#fff1f0'; varBorder = '#ffa39e'; varColor = '#cf1322';
      // If cash is entered and cashAfterExpenses is less than short, show cashAfterExpenses as physical to give now, short as total owed
      if (cash > 0.5) {
        // Physical cash to give now is cashAfterExpenses, but total short is net - payments
        // For simplicity, toHandover = cashAfterExpenses if cashAfterExpenses <= absVariance, else absVariance
        // Actually correct: attendant gives cashAfterExpenses now, remaining short tracked as To Handover
        // But user wants expense to reduce whole balance, so toHandover = net - payments
        toHandover = Math.max(0, netRevenue - totalPayments);
      }
    } else {
      // EXCESS
      toHandover = cashAfterExpenses;
      toHandoverLabel = '💰 Excess with You';
      varDesc = `You have ${formatCurrency(absVariance)} extra over net revenue ${formatCurrency(netRevenue)} • Cash after expenses ${formatCurrency(cashAfterExpenses)} to handover (excess will be returned)`;
      varBg = '#f6ffed'; varBorder = '#b7eb8f'; varColor = '#389e0d';
    }

    root.querySelector('#paymentSummary').innerHTML = `
      <div style="background:#f8f9fa;border-radius:12px;padding:14px;font-size:14px">
        <div style="display:flex;justify-content:space-between"><span>Gross Revenue (fuel from nozzles)</span><span style="font-weight:700">${formatCurrency(totalRevenue)}</span></div>
        ${quickTotal>0 ? `<div style="display:flex;justify-content:space-between;margin-top:6px;color:#fa541c;padding:8px;background:#fffbe6;border-radius:8px"><span>Quick Expenses (testing fuel came out of nozzle)</span><span style="font-weight:700">-${formatCurrency(quickTotal)}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;margin-top:6px;padding:8px;background:#f6ffed;border-radius:8px;border:1px solid #b7eb8f"><span>Net Revenue (gross - expenses) = Whole balance to owner</span><span style="font-weight:800">${formatCurrency(netRevenue)}</span></div>
        <div style="display:flex;justify-content:space-between;margin-top:8px"><span>Recorded Payments (cash+card+upi+credit+other)</span><span style="font-weight:700">${formatCurrency(totalPayments)}</span></div>
        <div style="display:flex;justify-content:space-between;margin-top:6px;padding:8px;background:${Math.abs(variance)<0.5?'#f0f0f0': variance<0?'#fff1f0':'#f6ffed'};border-radius:8px"><span>Variance: ${variance<0?'SHORT': variance>0.5?'EXCESS':'BALANCED'} (payments - net)</span><span style="font-weight:700;color:${variance<0?'#cf1322': variance>0.5?'#389e0d':'inherit'}">${formatCurrency(variance)} ${Math.abs(variance)>0.5 ? (variance<0?`• Short ${formatCurrency(absVariance)}`:`• Excess ${formatCurrency(absVariance)}`) : ''}</span></div>
        <div style="display:flex;justify-content:space-between;margin-top:8px;padding:8px;background:white;border-radius:8px;border:1px solid #e0e0e0"><span>Cash Entered</span><span style="font-weight:700">${formatCurrency(cash)}</span></div>
        ${quickTotal>0 ? `<div style="display:flex;justify-content:space-between;margin-top:6px;padding:8px;background:white;border-radius:8px;border:1px solid #e0e0e0"><span>Cash After Expenses (cash - ${formatCurrency(quickTotal)})</span><span style="font-weight:700;color:#389e0d">${formatCurrency(cashAfterExpenses)}</span></div>` : ''}
        <div style="padding:12px;background:${varBg};border-radius:10px;margin-top:12px;border:1px solid ${varBorder}">
          <div style="display:flex;justify-content:space-between;align-items:center"><span style="font-weight:700;font-size:13px;color:${varColor}">${toHandoverLabel}</span><span style="font-weight:800;font-size:20px;color:${varColor}">${formatCurrency(toHandover)}</span></div>
          <div style="font-size:11px;color:var(--text-secondary);margin-top:4px">${varDesc}</div>
          ${quickTotal>0 ? `<div style="font-size:10px;color:#389e0d;margin-top:8px;background:#f6ffed;padding:8px;border-radius:6px;border:1px solid #b7eb8f">✓ Fixed: Expenses now REDUCE whole balance. Old bug: Gross + Expenses - Payments = ${formatCurrency(totalRevenue + quickTotal - totalPayments)} (₹${(quickTotal*2).toFixed(0)} extra). Correct: (Gross - Expenses) - Payments = Gross - Expenses - Payments = ${formatCurrency(totalRevenue)} - ${formatCurrency(quickTotal)} - ${formatCurrency(totalPayments)} = ${formatCurrency(toHandover)}. Testing fuel came out of nozzle, so net revenue = gross - testing.</div>` : ''}
        </div>
      </div>
    `;
  }

  // Quick expense buttons
  root.querySelectorAll('.quick-exp-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const cat = btn.dataset.cat;
      const amountStr = prompt(`Enter amount for ${cat} expense:`);
      if (!amountStr) return;
      const amount = Number(amountStr);
      if (isNaN(amount) || amount<=0) return alert('Enter valid amount');
      const desc = prompt(`Description for ${cat} (optional):`, `${cat} expense`) || cat;
      quickExpenses.push({ category: cat, amount, description: desc, id: Date.now() });
      renderQuickExpenses();
      recalc();
    });
  });

  function renderQuickExpenses() {
    const list = root.querySelector('#quickExpensesList');
    if (quickExpenses.length===0) { list.innerHTML = `<div style="font-size:12px;color:var(--text-secondary);text-align:center;padding:8px">No quick expenses added</div>`; return; }
    list.innerHTML = quickExpenses.map((e,i)=>`
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:var(--bg);border-radius:10px;border:0.5px solid var(--border)">
        <div><div style="font-weight:600;font-size:13px">${e.category}</div><div style="font-size:11px;color:var(--text-secondary)">${e.description}</div></div>
        <div style="display:flex;align-items:center;gap:8px"><span style="font-weight:700">${formatCurrency(e.amount)}</span><button class="neu-btn remove-exp" data-idx="${i}" style="min-height:28px;min-width:28px;border-radius:50%;padding:0;font-size:12px">✕</button></div>
      </div>
    `).join('');
    root.querySelectorAll('.remove-exp').forEach(b=>{
      b.addEventListener('click', ()=>{
        quickExpenses.splice(Number(b.dataset.idx),1);
        renderQuickExpenses();
        recalc();
      });
    });
  }
  renderQuickExpenses();

  closingInputs.forEach(inp=> inp.addEventListener('input', recalc));
  ['pay_cash','pay_card','pay_upi','pay_credit','pay_other'].forEach(id=> root.querySelector('#'+id).addEventListener('input', recalc));
  recalc();

  async function handleSubmit(isDirectApprove=false) {
    const closingReadings = {};
    for (const inp of closingInputs) {
      if (!inp.value) { root.querySelector('#alertBox').innerHTML=`<div class="alert alert--danger">Enter closing reading for all nozzles</div>`; return; }
      closingReadings[inp.dataset.id] = inp.value; // raw: closeShift validates and reports the actual bad input
    }
    // Raw strings: closeShift validates each one and names the offending field.
    const payments = { cash: root.querySelector('#pay_cash').value, card: root.querySelector('#pay_card').value, upi: root.querySelector('#pay_upi').value, credit: root.querySelector('#pay_credit').value, other: root.querySelector('#pay_other').value };
    const closingNote = root.querySelector('#closingNote').value.trim();

    try {
      for (const exp of quickExpenses) {
        await addExpense({ stationId: shift.stationId, shiftId: shift.id, category: exp.category, amount: exp.amount, description: exp.description });
      }
      if (closingNote) {
        await addNote({ stationId: shift.stationId, shiftId: shift.id, text: closingNote });
      }
      const updatedShift = await closeShift(shift.id, { closingReadings, payments });
      if (isDirectApprove && canReview) {
        // Admin fixing and approving directly
        await approveShift(shift.id);
        alert(`✅ Fixed and Approved! Owner will receive money now.`);
        location.hash = `#/shifts/${shift.id}`;
      } else {
        location.hash = `#/shifts/${shift.id}`;
      }
    } catch(e){ root.querySelector('#alertBox').innerHTML=`<div class="alert alert--danger">⚠️ ${e.message}</div>`; }
  }

  root.querySelector('#submitClose').addEventListener('click', ()=> handleSubmit(false));
  root.querySelector('#adminApprove')?.addEventListener('click', ()=> {
    if (!confirm(`Admin: Fix and Approve directly?\n\nThis will:\n• Fix what's wrong\n• Approve shift\n• Owner can handover now\n\nContinue?`)) return;
    handleSubmit(true);
  });
}

function generateShiftCSV(shift, credits, expenses) {
  let csv = `Shift ID,${shift.id}\nEmployee,${shift.employeeName}\nStart,${shift.startTime}\nEnd,${shift.endTime||''}\nStatus,${shift.status}\n\n`;
  csv += `Nozzle ID,Fuel Type,Opening,Closing,Liters,Price,Revenue\n`;
  (shift.nozzles||[]).forEach(n=>{ csv += `${n.nozzleId},${n.fuelType},${n.openingReading},${n.closingReading||''},${n.litersSold||''},${n.price||''},${n.revenue||''}\n`; });
  csv += `\nTotal Revenue,${shift.totals?.totalRevenue||0}\nTotal Payments,${shift.totals?.totalPayments||0}\nVariance,${shift.totals?.variance||0}\n\n`;
  if (shift.correctionRequests?.length) { csv += `Correction Requests\nType,Field,Message,Requested By\n`; shift.correctionRequests.forEach(cr=>{ csv += `${cr.type},${cr.field},${cr.message},${cr.requestedByName||''}\n`; }); }
  return csv;
}
