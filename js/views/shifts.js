import { getState } from '../state.js';
import { getStationsForCurrentUser } from '../services/stations.js';
import { getShifts, getActiveShiftForUser, startShift, closeShift, getShiftById, approveShift, rejectShift, requestCorrections } from '../services/shifts.js';
import { getPumps, getNozzles } from '../services/pumps.js';
import { getActivePrices } from '../services/prices.js';
import { getTransactions, addCredit, addExpense } from '../services/transactions.js';
import { addNote, getNotes } from '../services/notes.js';
import { formatCurrency, formatLiters, formatDateTime, calcLitersSold, calcRevenue } from '../services/calc.js';

export async function shiftsListView({ root }) {
  const { user, currentStationId } = getState();
  const stations = await getStationsForCurrentUser();
  const stationId = currentStationId || stations[0]?.id;
  if (!stationId) { root.innerHTML=`<div class="container"><div class="neu-card empty"><p>No station</p></div></div>`; return; }
  const shifts = await getShifts(stationId, user.role==='attendant'? { userId: user.uid }: {});
  root.innerHTML = `
    <div class="container">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <div><h1 class="page-title">Shifts</h1><p class="page-sub">${shifts.length} shift(s) • ${stations.find(s=>s.id===stationId)?.name}</p></div>
        <button class="neu-btn neu-btn--primary" style="min-height:44px;padding:0 18px;font-weight:700;border-radius:12px" onclick="location.hash='#/shifts/start'">+ Start Shift</button>
      </div>
      <div style="margin-top:16px;display:flex;gap:8px;overflow:auto;padding-bottom:8px">
        ${['ALL','ACTIVE','PENDING_REVIEW','APPROVED','REJECTED'].map(s=>`<button class="chip filter-btn" data-status="${s}" style="min-height:36px;padding:0 14px;border-radius:20px;font-size:13px;white-space:nowrap">${s}</button>`).join('')}
      </div>
      <div class="list" id="shiftList" style="margin-top:16px">${renderShiftList(shifts)}</div>
    </div>
  `;
  function renderShiftList(list) {
    const { user } = getState();
    const isOwner = user.role === 'owner';
    if (!list.length) return `<div class="neu-card empty" style="padding:24px;text-align:center"><p>No shifts</p></div>`;
    return list.map(sh=>{
      const v = sh.totals?.variance||0;
      const absV = Math.abs(v);
      let varText = '';
      if (absV>0.5) {
        if (v<0) {
          if (sh.userId===user.uid) varText = `💸 To Handover ${formatCurrency(absV)}`;
          else varText = `💰 To Collect ${formatCurrency(absV)} from ${sh.employeeName.split(' ')[0]}`;
        } else {
          if (sh.userId===user.uid) varText = `💰 Excess ${formatCurrency(absV)}`;
          else varText = `↩️ Excess ${formatCurrency(absV)} to ${sh.employeeName.split(' ')[0]}`;
        }
      }
      return `
      <div class="neu-card" style="cursor:pointer;padding:16px;border-radius:14px" onclick="location.hash='#/shifts/${sh.id}'">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sh.employeeName} • ${new Date(sh.startTime).toLocaleDateString()} ${new Date(sh.startTime).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} → ${sh.endTime? new Date(sh.endTime).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'Active'}</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:6px">${sh.nozzles?.length||0} nozzles • ${isOwner || sh.userId===user.uid ? formatCurrency(sh.totals?.totalRevenue||0)+' • ' : ''}${formatLiters(sh.totals?.totalLiters||0)}</div>
            ${sh.correctionRequests?.length ? `<div style="font-size:11px;color:#fa541c;margin-top:6px;display:flex;align-items:center;gap:4px"><span style="background:#fff1f0;color:#cf1322;padding:2px 8px;border-radius:10px;font-size:10px">⚠️ ${sh.correctionRequests.length} correction</span></div>` : ''}
            ${varText ? `<div style="font-size:11px;margin-top:6px;color:${Math.abs(v)>0.5 && v<0?'#cf1322':'#389e0d'};font-weight:600">${varText}</div>` : ''}
          </div>
          <span class="badge ${sh.status==='ACTIVE'?'badge--info': sh.status==='PENDING_REVIEW'?'badge--warning': sh.status==='APPROVED'?'badge--success':'badge--danger'}" style="font-size:11px;padding:6px 10px;border-radius:20px;white-space:nowrap">${sh.status}</span>
        </div>
      </div>
    `}).join('');
  }
  root.querySelectorAll('.filter-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const status = btn.dataset.status;
      const filtered = status==='ALL'? shifts : shifts.filter(s=>s.status===status);
      root.querySelector('#shiftList').innerHTML = renderShiftList(filtered);
    });
  });
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
            return `<div class="neu-card neu-card--sm" style="padding:14px;border-radius:12px;display:flex;flex-direction:column;gap:12px"><label style="display:flex;gap:12px;align-items:center;font-weight:600;font-size:14px;cursor:pointer"><input type="checkbox" class="nz-check" data-id="${n.id}" data-pump="${n.pumpId}" data-fuel="${n.fuelType}" data-last="${n.lastReading||0}" style="width:18px;height:18px"> ${pump?.name||'Pump'} - Nozzle ${n.number} • ${n.fuelType}</label><div><label class="label">Opening Reading</label><input class="neu-input nz-opening" data-id="${n.id}" type="number" step="0.01" value="${n.lastReading||0}" disabled style="min-height:44px;border-radius:10px;font-size:15px"></div></div>`;
          }).join('') || `<p style="font-size:13px;color:var(--text-secondary);padding:12px">No active nozzles</p>`}
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
    root.innerHTML = `
      <div class="container" style="max-width:480px;margin:0 auto;padding-bottom:100px">
        <div style="display:flex;justify-content:space-between;align-items:center"><div><h1 class="page-title" style="font-size:20px">Active Shift</h1><p class="page-sub" style="margin-top:4px">${shift.employeeName} • Started ${formatDateTime(shift.startTime)}</p></div><span class="badge badge--info" style="padding:8px 12px;border-radius:20px">ACTIVE</span></div>
        <div class="neu-card" style="margin-top:16px;padding:16px;border-radius:14px"><h3 style="font-weight:700;font-size:14px">Nozzles (${shift.nozzles?.length||0})</h3><div class="list" style="margin-top:12px;display:flex;flex-direction:column;gap:8px">${(shift.nozzles||[]).map(n=>`<div class="neu-card neu-card--sm" style="padding:12px;border-radius:10px;display:flex;justify-content:space-between;align-items:center"><div><div style="font-weight:600;font-size:13px">${n.fuelType} • Nozzle</div><div style="font-size:11px;color:var(--text-secondary);margin-top:2px">Opening ${Number(n.openingReading).toFixed(2)}</div></div><div class="badge badge--neutral" style="padding:6px 10px;border-radius:20px;font-size:11px">${n.fuelType}</div></div>`).join('')}</div></div>
        
        <!-- Clean handy buttons - major actions out -->
        <div style="margin-top:20px;display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="document.getElementById('creditModal').style.display='flex'">💳 + Credit</button>
          <button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="document.getElementById('expenseModal').style.display='flex'">🧾 + Expense</button>
          <button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="document.getElementById('noteModal').style.display='flex'">📝 + Note</button>
          <button class="neu-btn neu-btn--primary" style="min-height:48px;border-radius:12px;font-weight:700" onclick="location.hash='#/shifts/${shift.id}/close'">Close Shift →</button>
        </div>

        <div class="neu-card" style="margin-top:16px;padding:16px;border-radius:14px"><h3 style="font-weight:700;font-size:14px">Credits (${credits.length})</h3><div style="margin-top:10px;display:flex;flex-direction:column;gap:6px">${credits.map(c=>`<div style="display:flex;justify-content:space-between;font-size:13px;padding:8px 0;border-bottom:1px solid #f0f0f0"><span>${c.customer}</span><span style="font-weight:700">${formatCurrency(c.amount)}</span></div>`).join('') || `<p style="font-size:12px;color:var(--text-secondary);padding:8px 0">No credits</p>`}</div></div>
        <div class="neu-card" style="margin-top:12px;padding:16px;border-radius:14px"><h3 style="font-weight:700;font-size:14px">Expenses (${expenses.length})</h3><div style="margin-top:10px;display:flex;flex-direction:column;gap:6px">${expenses.map(e=>`<div style="display:flex;justify-content:space-between;font-size:13px;padding:8px 0;border-bottom:1px solid #f0f0f0"><span>${e.category}</span><span style="font-weight:700">${formatCurrency(e.amount)}</span></div>`).join('') || `<p style="font-size:12px;color:var(--text-secondary);padding:8px 0">No expenses</p>`}</div></div>
      </div>
      <div id="creditModal" class="modal-backdrop" style="display:none"><div class="modal" style="border-radius:16px"><div style="display:flex;justify-content:space-between;align-items:center"><h3 style="font-weight:700">Add Credit</h3><button class="neu-btn neu-btn--small" style="min-height:36px;min-width:36px;border-radius:50%" onclick="document.getElementById('creditModal').style.display='none'">✕</button></div><div class="grid" style="margin-top:16px;gap:14px"><div><label class="label">Customer</label><input id="cr_customer" class="neu-input" style="min-height:44px;border-radius:10px"></div><div><label class="label">Amount</label><input id="cr_amount" class="neu-input" type="number" style="min-height:44px;border-radius:10px"></div><button id="saveCredit" class="neu-btn neu-btn--primary neu-btn--block" style="min-height:48px;border-radius:12px;font-weight:700">Save Credit</button></div></div></div>
      <div id="expenseModal" class="modal-backdrop" style="display:none"><div class="modal" style="border-radius:16px"><div style="display:flex;justify-content:space-between;align-items:center"><h3 style="font-weight:700">Add Expense</h3><button class="neu-btn neu-btn--small" style="min-height:36px;min-width:36px;border-radius:50%" onclick="document.getElementById('expenseModal').style.display='none'">✕</button></div><div class="grid" style="margin-top:16px;gap:14px"><div><label class="label">Category</label><select id="ex_cat" class="neu-select" style="min-height:44px;border-radius:10px"><option>Maintenance</option><option>Testing</option><option>Breakfast</option><option>Tea & Snacks</option><option>Cleaning</option><option>Petty Cash</option><option>Other</option></select></div><div><label class="label">Amount</label><input id="ex_amount" class="neu-input" type="number" style="min-height:44px;border-radius:10px"></div><button id="saveExpense" class="neu-btn neu-btn--primary neu-btn--block" style="min-height:48px;border-radius:12px;font-weight:700">Save Expense</button></div></div></div>
      <div id="noteModal" class="modal-backdrop" style="display:none"><div class="modal" style="border-radius:16px"><div style="display:flex;justify-content:space-between;align-items:center"><h3 style="font-weight:700">Add Note</h3><button class="neu-btn neu-btn--small" style="min-height:36px;min-width:36px;border-radius:50%" onclick="document.getElementById('noteModal').style.display='none'">✕</button></div><div class="grid" style="margin-top:16px;gap:14px"><div><label class="label">Note</label><textarea id="note_text" class="neu-input" rows="3" style="border-radius:10px"></textarea></div><button id="saveNote" class="neu-btn neu-btn--primary neu-btn--block" style="min-height:48px;border-radius:12px;font-weight:700">Save Note</button></div></div></div>
    `;
    root.querySelector('#saveCredit').addEventListener('click', async ()=>{ const customer = root.querySelector('#cr_customer').value.trim(); const amount = root.querySelector('#cr_amount').value; if (!customer || !amount) return alert('Fill required'); try { await addCredit({ stationId: shift.stationId, shiftId: shift.id, customer, amount }); location.reload(); } catch(e){ alert(e.message); } });
    root.querySelector('#saveExpense').addEventListener('click', async ()=>{ const category = root.querySelector('#ex_cat').value; const amount = root.querySelector('#ex_amount').value; if (!amount) return alert('Amount required'); try { await addExpense({ stationId: shift.stationId, shiftId: shift.id, category, amount }); location.reload(); } catch(e){ alert(e.message); } });
    root.querySelector('#saveNote').addEventListener('click', async ()=>{ const text = root.querySelector('#note_text').value.trim(); if (!text) return alert('Note required'); try { await addNote({ stationId: shift.stationId, shiftId: shift.id, text }); location.reload(); } catch(e){ alert(e.message); } });

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
            <div style="display:flex;justify-content:space-between;padding:16px 0;font-weight:800;font-size:17px;border-bottom:2px solid #232f3e;margin-top:6px"><span>Total Fuel Sales</span><span>${formatCurrency(t.totalRevenue||0)}</span></div>
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
                <div style="display:flex;justify-content:space-between;font-size:14px"><span style="color:var(--text-secondary)">Recorded</span><span style="font-weight:600">${formatCurrency(t.totalPayments||0)}</span></div>
                <div style="display:flex;justify-content:space-between;font-size:14px;margin-top:6px"><span style="color:var(--text-secondary)">Expected</span><span style="font-weight:600">${formatCurrency(t.totalRevenue||0)}</span></div>
                ${(() => {
                  const v = t.variance||0;
                  const absV = Math.abs(v);
                  let label, desc, bg, border, color;
                  if (absV < 0.5) {
                    label = '✅ Balanced'; desc = 'All settled'; bg = '#f0f0f0'; border = '#e0e0e0'; color = 'var(--text)';
                  } else if (v < 0) {
                    if (isOwnerOfShift) {
                      label = '💸 To Handover to Owner'; desc = `You need to give ${formatCurrency(absV)} to owner • Owner will collect after approval`; bg = '#fff1f0'; border = '#ffa39e'; color = '#cf1322';
                    } else {
                      label = `💰 To Collect from ${shift.employeeName}`; desc = `Collect ${formatCurrency(absV)} from ${shift.employeeName} after approval`; bg = '#fff1f0'; border = '#ffa39e'; color = '#cf1322';
                    }
                  } else {
                    if (isOwnerOfShift) {
                      label = '💰 Excess with You'; desc = `You collected ${formatCurrency(absV)} extra • Owner will adjust`; bg = '#f6ffed'; border = '#b7eb8f'; color = '#389e0d';
                    } else {
                      label = `↩️ Excess to Return to ${shift.employeeName}`; desc = `Return ${formatCurrency(absV)} to ${shift.employeeName}`; bg = '#f6ffed'; border = '#b7eb8f'; color = '#389e0d';
                    }
                  }
                  return `<div style="padding:12px;background:${bg};border-radius:10px;margin-top:12px;border:1px solid ${border}"><div style="display:flex;justify-content:space-between;align-items:center"><span style="font-weight:700;font-size:13px;color:${color}">${label}</span><span style="font-weight:800;font-size:15px;color:${color}">${formatCurrency(absV)}</span></div><div style="font-size:10px;color:var(--text-secondary);margin-top:4px">${desc}</div></div>`;
                })()}
              </div>
            </div>
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
    const variance = totalPayments - totalRevenue;
    const quickTotal = quickExpenses.reduce((a,e)=>a+Number(e.amount||0),0);
    const netVariance = variance - quickTotal;
    const absNet = Math.abs(netVariance);
    let varLabel, varDesc, varBg, varBorder, varColor;
    if (absNet < 0.5) {
      varLabel = '✅ Balanced'; varDesc = 'All settled'; varBg = '#f0f0f0'; varBorder = '#e0e0e0'; varColor = 'var(--text)';
    } else if (netVariance < 0) {
      varLabel = '💸 To Handover to Owner'; varDesc = `You need to give ${formatCurrency(absNet)} to owner • Owner will collect after approval`; varBg = '#fff1f0'; varBorder = '#ffa39e'; varColor = '#cf1322';
    } else {
      varLabel = '💰 Excess with You'; varDesc = `You collected ${formatCurrency(absNet)} extra`; varBg = '#f6ffed'; varBorder = '#b7eb8f'; varColor = '#389e0d';
    }
    root.querySelector('#paymentSummary').innerHTML = `
      <div style="background:#f8f9fa;border-radius:12px;padding:14px;font-size:14px">
        <div style="display:flex;justify-content:space-between"><span>Expected Revenue</span><span style="font-weight:700">${formatCurrency(totalRevenue)}</span></div>
        <div style="display:flex;justify-content:space-between;margin-top:6px"><span>Recorded Payments</span><span style="font-weight:700">${formatCurrency(totalPayments)}</span></div>
        ${quickTotal>0 ? `<div style="display:flex;justify-content:space-between;margin-top:6px;color:#fa541c"><span>Quick Expenses</span><span style="font-weight:700">-${formatCurrency(quickTotal)}</span></div>` : ''}
        <div style="padding:12px;background:${varBg};border-radius:10px;margin-top:12px;border:1px solid ${varBorder}">
          <div style="display:flex;justify-content:space-between;align-items:center"><span style="font-weight:700;font-size:13px;color:${varColor}">${varLabel}</span><span style="font-weight:800;font-size:15px;color:${varColor}">${formatCurrency(absNet)}</span></div>
          <div style="font-size:11px;color:var(--text-secondary);margin-top:4px">${varDesc}</div>
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
      closingReadings[inp.dataset.id] = Number(inp.value);
    }
    const payments = { cash: Number(root.querySelector('#pay_cash').value||0), card: Number(root.querySelector('#pay_card').value||0), upi: Number(root.querySelector('#pay_upi').value||0), credit: Number(root.querySelector('#pay_credit').value||0), other: Number(root.querySelector('#pay_other').value||0) };
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
        alert(`✅ Fixed and Approved! Owner will collect money now.`);
        location.hash = `#/shifts/${shift.id}`;
      } else {
        location.hash = `#/shifts/${shift.id}`;
      }
    } catch(e){ root.querySelector('#alertBox').innerHTML=`<div class="alert alert--danger">⚠️ ${e.message}</div>`; }
  }

  root.querySelector('#submitClose').addEventListener('click', ()=> handleSubmit(false));
  root.querySelector('#adminApprove')?.addEventListener('click', ()=> {
    if (!confirm(`Admin: Fix and Approve directly?\n\nThis will:\n• Fix what's wrong\n• Approve shift\n• Owner can collect money now\n\nContinue?`)) return;
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
