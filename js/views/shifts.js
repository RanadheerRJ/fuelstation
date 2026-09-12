import { getState } from '../state.js';
import { getStationsForCurrentUser } from '../services/stations.js';
import { getShifts, getActiveShiftForUser, startShift, closeShift, getShiftById, approveShift, rejectShift } from '../services/shifts.js';
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
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><h1 class="page-title">Shifts</h1><p class="page-sub">${shifts.length} shift(s) • ${stations.find(s=>s.id===stationId)?.name}</p></div>
        <button class="neu-btn neu-btn--primary neu-btn--small" onclick="location.hash='#/shifts/start'">+ Start Shift</button>
      </div>

      <div style="margin-top:14px;display:flex;gap:8px;overflow:auto;padding-bottom:6px">
        ${['ALL','ACTIVE','PENDING_REVIEW','APPROVED','REJECTED'].map(s=>`<button class="chip filter-btn" data-status="${s}">${s}</button>`).join('')}
      </div>

      <div class="list" id="shiftList" style="margin-top:14px">
        ${renderShiftList(shifts)}
      </div>
    </div>
  `;

  function renderShiftList(list) {
    if (!list.length) return `<div class="neu-card empty"><p>No shifts</p></div>`;
    return list.map(sh=>`
      <div class="neu-card" style="cursor:pointer" onclick="location.hash='#/shifts/${sh.id}'">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div style="font-weight:800;font-size:14px">${sh.employeeName} • ${new Date(sh.startTime).toLocaleDateString()} ${new Date(sh.startTime).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} → ${sh.endTime? new Date(sh.endTime).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'Active'}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${sh.nozzles?.length||0} nozzles • ${formatCurrency(sh.totals?.totalRevenue||0)} • ${formatLiters(sh.totals?.totalLiters||0)}</div>
            ${sh.totals?.variance ? `<div style="font-size:11px;margin-top:4px;color:${Math.abs(sh.totals.variance)>0.5?'var(--danger)':'var(--text-muted)'}">Variance ${formatCurrency(sh.totals.variance)} • ${sh.totals.varianceStatus}</div>` : ''}
          </div>
          <span class="badge ${sh.status==='ACTIVE'?'badge--info': sh.status==='PENDING_REVIEW'?'badge--warning': sh.status==='APPROVED'?'badge--success':'badge--danger'}">${sh.status}</span>
        </div>
      </div>
    `).join('');
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

  // check active shift
  const active = await getActiveShiftForUser(user.uid);
  if (active) {
    root.innerHTML = `<div class="container"><div class="neu-card"><h3>Active Shift Exists</h3><p style="font-size:13px;color:var(--text-muted);margin-top:6px">You already have an active shift.</p><button class="neu-btn neu-btn--primary" style="margin-top:12px" onclick="location.hash='#/shifts/${active.id}'">Open Active Shift</button></div></div>`;
    return;
  }

  const pumps = await getPumps(stationId);
  const nozzles = await getNozzles(stationId);
  const activeNozzles = nozzles.filter(n=>n.status==='active');

  root.innerHTML = `
    <div class="container">
      <h1 class="page-title">Start Shift</h1>
      <p class="page-sub">${stations.find(s=>s.id===stationId)?.name}</p>

      <div class="neu-card" style="margin-top:16px">
        <label class="label">Station</label>
        <select id="stationSel" class="neu-select">
          ${stations.map(s=>`<option value="${s.id}" ${s.id===stationId?'selected':''}>${s.name}</option>`).join('')}
        </select>
      </div>

      <div class="neu-card" style="margin-top:16px">
        <h3 style="font-weight:800">Your Nozzles</h3>
        <p style="font-size:11px;color:var(--text-muted);margin-top:4px">Select nozzles assigned to you and enter opening readings</p>
        <div class="list" style="margin-top:12px" id="nozzleList">
          ${activeNozzles.map(n=>{
            const pump = pumps.find(p=>p.id===n.pumpId);
            return `
              <div class="neu-card neu-card--sm" style="display:flex;flex-direction:column;gap:10px">
                <label style="display:flex;gap:10px;align-items:center;font-weight:700;font-size:13px"><input type="checkbox" class="nz-check" data-id="${n.id}" data-pump="${n.pumpId}" data-fuel="${n.fuelType}" data-last="${n.lastReading||0}"> ${pump?.name||'Pump'} - Nozzle ${n.number} • ${n.fuelType}</label>
                <div><label class="label">Opening Reading</label><input class="neu-input nz-opening" data-id="${n.id}" type="number" step="0.01" value="${n.lastReading||0}" disabled></div>
              </div>
            `;
          }).join('') || `<p style="font-size:12px;color:var(--text-muted)">No active nozzles</p>`}
        </div>
      </div>

      <div id="alertBox" style="margin-top:12px"></div>
      <button id="startBtn" class="neu-btn neu-btn--primary neu-btn--block" style="margin-top:16px">Start Shift</button>
    </div>
  `;

  root.querySelector('#stationSel').addEventListener('change', async e=>{
    const newId = e.target.value;
    // reload
    const { setState } = await import('../state.js');
    setState({ currentStationId: newId });
    startShiftView({ root });
  });

  root.querySelectorAll('.nz-check').forEach(chk=>{
    chk.addEventListener('change', e=>{
      const id = e.target.dataset.id;
      const input = root.querySelector(`.nz-opening[data-id="${id}"]`);
      input.disabled = !e.target.checked;
    });
  });

  root.querySelector('#startBtn').addEventListener('click', async ()=>{
    const selected = Array.from(root.querySelectorAll('.nz-check:checked')).map(chk=>{
      const id = chk.dataset.id;
      const opening = root.querySelector(`.nz-opening[data-id="${id}"]`).value;
      return { nozzleId: id, pumpId: chk.dataset.pump, fuelType: chk.dataset.fuel, openingReading: Number(opening) };
    });
    if (selected.length===0) {
      root.querySelector('#alertBox').innerHTML = `<div class="alert alert--warning">Select at least one nozzle</div>`;
      return;
    }
    for (const s of selected) {
      if (isNaN(s.openingReading) || s.openingReading<0) {
        root.querySelector('#alertBox').innerHTML = `<div class="alert alert--danger">Invalid opening reading for nozzle ${s.nozzleId}</div>`;
        return;
      }
    }
    try {
      const shift = await startShift({ stationId, userId: user.uid, employeeName: user.name, nozzles: selected });
      location.hash = `#/shifts/${shift.id}`;
    } catch(e){
      root.querySelector('#alertBox').innerHTML = `<div class="alert alert--danger">⚠️ ${e.message}</div>`;
    }
  });
}

export async function shiftDetailView({ root, params }) {
  const { id } = params;
  const { user } = getState();
  const shift = await getShiftById(id);
  if (!shift) { root.innerHTML=`<div class="container"><div class="neu-card empty"><p>Shift not found</p></div></div>`; return; }

  const isOwner = shift.userId === user.uid;
  const canReview = ['owner','manager','admin'].includes(user.role);
  const transactions = await getTransactions(shift.stationId, { shiftId: shift.id });
  const notes = await getNotes(shift.stationId, { shiftId: shift.id });

  const credits = transactions.filter(t=>t.type==='credit');
  const expenses = transactions.filter(t=>t.type==='expense');

  if (shift.status === 'ACTIVE') {
    root.innerHTML = `
      <div class="container">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div><h1 class="page-title">My Active Shift</h1><p class="page-sub">${shift.employeeName} • Started ${formatDateTime(shift.startTime)}</p></div>
          <span class="badge badge--info">ACTIVE</span>
        </div>

        <div class="neu-card" style="margin-top:16px">
          <h3 style="font-weight:800;font-size:14px">Nozzles (${shift.nozzles?.length||0})</h3>
          <div class="list" style="margin-top:10px">
            ${(shift.nozzles||[]).map(n=>`
              <div class="neu-card neu-card--sm" style="display:flex;justify-content:space-between">
                <div><div style="font-weight:700;font-size:13px">${n.fuelType} • Nozzle ${n.nozzleId.slice(0,4)}</div><div style="font-size:11px;color:var(--text-muted)">Opening ${Number(n.openingReading).toFixed(2)}</div></div>
                <div class="badge badge--neutral">${n.fuelType}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="grid grid-2" style="margin-top:16px">
          <button class="neu-btn" onclick="document.getElementById('creditModal').style.display='flex'">+ Credit</button>
          <button class="neu-btn" onclick="document.getElementById('expenseModal').style.display='flex'">+ Expense</button>
          <button class="neu-btn" onclick="document.getElementById('noteModal').style.display='flex'">+ Note</button>
          <button class="neu-btn neu-btn--primary" onclick="location.hash='#/shifts/${shift.id}/close'">Close Shift</button>
        </div>

        <div class="neu-card" style="margin-top:16px">
          <h3 style="font-weight:800;font-size:14px">Credits (${credits.length})</h3>
          <div class="list" style="margin-top:8px">${credits.map(c=>`<div style="display:flex;justify-content:space-between;font-size:12px"><span>${c.customer} • ${c.reference||''}</span><span style="font-weight:700">${formatCurrency(c.amount)}</span></div>`).join('') || `<p style="font-size:11px;color:var(--text-muted)">No credits</p>`}</div>
        </div>
        <div class="neu-card" style="margin-top:12px">
          <h3 style="font-weight:800;font-size:14px">Expenses (${expenses.length})</h3>
          <div class="list" style="margin-top:8px">${expenses.map(e=>`<div style="display:flex;justify-content:space-between;font-size:12px"><span>${e.category} • ${e.description?.slice(0,30)}</span><span style="font-weight:700">${formatCurrency(e.amount)}</span></div>`).join('') || `<p style="font-size:11px;color:var(--text-muted)">No expenses</p>`}</div>
        </div>
        <div class="neu-card" style="margin-top:12px">
          <h3 style="font-weight:800;font-size:14px">Notes (${notes.length})</h3>
          <div class="list" style="margin-top:8px">${notes.map(n=>`<div style="font-size:12px;border-left:2px solid var(--primary);padding-left:8px;margin-bottom:8px"><div>${n.text}</div><div style="font-size:10px;color:var(--text-muted)">${n.userName} • ${formatDateTime(n.createdAt)}</div></div>`).join('') || `<p style="font-size:11px;color:var(--text-muted)">No notes</p>`}</div>
        </div>
      </div>

      <!-- Modals -->
      <div id="creditModal" class="modal-backdrop" style="display:none"><div class="modal">
        <div style="display:flex;justify-content:space-between"><h3 style="font-weight:800">Add Credit</h3><button class="neu-btn neu-btn--small" onclick="document.getElementById('creditModal').style.display='none'">✕</button></div>
        <div class="grid" style="margin-top:12px">
          <div><label class="label">Customer</label><input id="cr_customer" class="neu-input" placeholder="ABC Transport"></div>
          <div><label class="label">Amount</label><input id="cr_amount" class="neu-input" type="number" placeholder="5000"></div>
          <div><label class="label">Reference</label><input id="cr_ref" class="neu-input" placeholder="Truck APXX1234"></div>
          <div><label class="label">Note</label><input id="cr_note" class="neu-input" placeholder="Diesel supplied on credit"></div>
          <button id="saveCredit" class="neu-btn neu-btn--primary neu-btn--block">Save Credit</button>
        </div>
      </div></div>

      <div id="expenseModal" class="modal-backdrop" style="display:none"><div class="modal">
        <div style="display:flex;justify-content:space-between"><h3 style="font-weight:800">Add Expense</h3><button class="neu-btn neu-btn--small" onclick="document.getElementById('expenseModal').style.display='none'">✕</button></div>
        <div class="grid" style="margin-top:12px">
          <div><label class="label">Category</label><select id="ex_cat" class="neu-select"><option>Maintenance</option><option>Cleaning</option><option>Electricity</option><option>Water</option><option>Transportation</option><option>Employee Advance</option><option>Petty Cash</option><option>Other</option></select></div>
          <div><label class="label">Amount</label><input id="ex_amount" class="neu-input" type="number" placeholder="750"></div>
          <div><label class="label">Description</label><input id="ex_desc" class="neu-input" placeholder="Pump nozzle repair"></div>
          <button id="saveExpense" class="neu-btn neu-btn--primary neu-btn--block">Save Expense</button>
        </div>
      </div></div>

      <div id="noteModal" class="modal-backdrop" style="display:none"><div class="modal">
        <div style="display:flex;justify-content:space-between"><h3 style="font-weight:800">Add Note</h3><button class="neu-btn neu-btn--small" onclick="document.getElementById('noteModal').style.display='none'">✕</button></div>
        <div class="grid" style="margin-top:12px">
          <div><label class="label">Note</label><textarea id="note_text" class="neu-input" rows="3" placeholder="Pump 4 stopped working around 11:20 AM..."></textarea></div>
          <button id="saveNote" class="neu-btn neu-btn--primary neu-btn--block">Save Note</button>
        </div>
      </div></div>
    `;

    root.querySelector('#saveCredit').addEventListener('click', async ()=>{
      const customer = root.querySelector('#cr_customer').value.trim();
      const amount = root.querySelector('#cr_amount').value;
      const reference = root.querySelector('#cr_ref').value.trim();
      const note = root.querySelector('#cr_note').value.trim();
      if (!customer || !amount) return alert('Fill required');
      try { await addCredit({ stationId: shift.stationId, shiftId: shift.id, customer, amount, reference, note }); location.reload(); } catch(e){ alert(e.message); }
    });
    root.querySelector('#saveExpense').addEventListener('click', async ()=>{
      const category = root.querySelector('#ex_cat').value;
      const amount = root.querySelector('#ex_amount').value;
      const description = root.querySelector('#ex_desc').value;
      if (!amount) return alert('Amount required');
      try { await addExpense({ stationId: shift.stationId, shiftId: shift.id, category, amount, description }); location.reload(); } catch(e){ alert(e.message); }
    });
    root.querySelector('#saveNote').addEventListener('click', async ()=>{
      const text = root.querySelector('#note_text').value.trim();
      if (!text) return alert('Note required');
      try { await addNote({ stationId: shift.stationId, shiftId: shift.id, text }); location.reload(); } catch(e){ alert(e.message); }
    });

  } else {
    // Closed / review / approved view -> ledger
    const t = shift.totals || {};
    root.innerHTML = `
      <div class="container">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div><h1 class="page-title">Shift #${shift.id.slice(0,6)}</h1><p class="page-sub">${shift.employeeName} • ${formatDateTime(shift.startTime)} → ${shift.endTime? formatDateTime(shift.endTime):''}</p></div>
          <span class="badge ${shift.status==='PENDING_REVIEW'?'badge--warning': shift.status==='APPROVED'?'badge--success': shift.status==='REJECTED'?'badge--danger':'badge--neutral'}">${shift.status}</span>
        </div>

        <div class="ledger" style="margin-top:18px">
          <h3>SHIFT CLOSING LEDGER</h3>
          <div>Station: ${shift.stationId.slice(0,8)}</div>
          <div>Employee: ${shift.employeeName}</div>
          <div>Shift: ${formatDateTime(shift.startTime)} - ${shift.endTime? formatDateTime(shift.endTime):''}</div>
          <div class="line"></div>
          ${(shift.nozzles||[]).map(n=>`
            <div style="margin-bottom:12px">
              <div style="font-weight:800">${n.fuelType} • Nozzle ${n.nozzleId.slice(0,6)}</div>
              <div class="row"><span>Opening</span><span>${Number(n.openingReading).toFixed(2)}</span></div>
              <div class="row"><span>Closing</span><span>${Number(n.closingReading||0).toFixed(2)}</span></div>
              <div class="row"><span>Sold</span><span>${(n.litersSold||0).toFixed(2)} L</span></div>
              <div class="row"><span>Price</span><span>${formatCurrency(n.price||0)}</span></div>
              <div class="row" style="font-weight:800"><span>Revenue</span><span>${formatCurrency(n.revenue||0)}</span></div>
            </div>
          `).join('')}
          <div class="line"></div>
          <div class="row" style="font-weight:800;font-size:14px"><span>TOTAL FUEL SALES</span><span>${formatCurrency(t.totalRevenue||0)}</span></div>
          <div class="line"></div>
          <div style="margin-top:10px">
            <div class="row"><span>Cash</span><span>${formatCurrency(t.payments?.cash||0)}</span></div>
            <div class="row"><span>Card</span><span>${formatCurrency(t.payments?.card||0)}</span></div>
            <div class="row"><span>UPI</span><span>${formatCurrency(t.payments?.upi||0)}</span></div>
            <div class="row"><span>Credit</span><span>${formatCurrency(t.payments?.credit||0)}</span></div>
            <div class="row"><span>Other</span><span>${formatCurrency(t.payments?.other||0)}</span></div>
            <div class="line"></div>
            <div class="row"><span>Expected</span><span>${formatCurrency(t.totalRevenue||0)}</span></div>
            <div class="row"><span>Recorded</span><span>${formatCurrency(t.totalPayments||0)}</span></div>
            <div class="row" style="font-weight:800;color:${(t.variance||0)<-0.5?'#e03131':(t.variance||0)>0.5?'#0ca678':'inherit'}"><span>Variance (${t.varianceStatus||''})</span><span>${formatCurrency(t.variance||0)}</span></div>
          </div>
        </div>

        <div class="neu-card" style="margin-top:16px">
          <h3 style="font-weight:800;font-size:14px">Credits (${credits.length}) • ${formatCurrency(credits.reduce((a,c)=>a+Number(c.amount||0),0))}</h3>
          <div style="margin-top:8px">${credits.map(c=>`<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid rgba(0,0,0,0.05)"><span>${c.customer} ${c.reference? '• '+c.reference:''}</span><span>${formatCurrency(c.amount)}</span></div>`).join('') || `<p style="font-size:11px;color:var(--text-muted)">None</p>`}</div>
        </div>
        <div class="neu-card" style="margin-top:12px">
          <h3 style="font-weight:800;font-size:14px">Expenses (${expenses.length}) • ${formatCurrency(expenses.reduce((a,c)=>a+Number(c.amount||0),0))}</h3>
          <div style="margin-top:8px">${expenses.map(e=>`<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid rgba(0,0,0,0.05)"><span>${e.category} • ${e.description?.slice(0,30)}</span><span>${formatCurrency(e.amount)}</span></div>`).join('') || `<p style="font-size:11px;color:var(--text-muted)">None</p>`}</div>
        </div>
        <div class="neu-card" style="margin-top:12px">
          <h3 style="font-weight:800;font-size:14px">Notes (${notes.length})</h3>
          <div style="margin-top:8px">${notes.map(n=>`<div style="font-size:12px;margin-bottom:8px"><div>${n.text}</div><div style="font-size:10px;color:var(--text-muted)">${n.userName} • ${formatDateTime(n.createdAt)}</div></div>`).join('') || `<p style="font-size:11px;color:var(--text-muted)">None</p>`}</div>
        </div>

        ${shift.status==='PENDING_REVIEW' && canReview ? `
          <div class="grid grid-2" style="margin-top:18px">
            <button id="approveBtn" class="neu-btn neu-btn--primary">Approve</button>
            <button id="rejectBtn" class="neu-btn">Request Correction</button>
          </div>
        ` : ''}

        <div style="margin-top:16px;display:flex;gap:8px">
          <button class="neu-btn neu-btn--small" onclick="window.print()">🖨️ Print</button>
          <button class="neu-btn neu-btn--small" id="exportCsv">⬇️ CSV</button>
          <button class="neu-btn neu-btn--small" onclick="location.hash='#/shifts'">Back to Shifts</button>
        </div>
      </div>
    `;

    root.querySelector('#approveBtn')?.addEventListener('click', async ()=>{
      if (!confirm('Approve this shift? It will be locked.')) return;
      try { await approveShift(shift.id); alert('Approved'); location.hash='#/shifts'; } catch(e){ alert(e.message); }
    });
    root.querySelector('#rejectBtn')?.addEventListener('click', async ()=>{
      const reason = prompt('Reason for correction?');
      if (!reason) return;
      try { await rejectShift(shift.id, reason); alert('Rejected'); location.hash='#/shifts'; } catch(e){ alert(e.message); }
    });
    root.querySelector('#exportCsv')?.addEventListener('click', ()=>{
      const csv = generateShiftCSV(shift, credits, expenses);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href=url; a.download=`shift-${shift.id}.csv`; a.click(); URL.revokeObjectURL(url);
    });
  }
}

export async function closeShiftView({ root, params }) {
  const { id } = params;
  const shift = await getShiftById(id);
  if (!shift || shift.status!=='ACTIVE') { root.innerHTML=`<div class="container"><div class="neu-card empty"><p>Shift not active</p></div></div>`; return; }
  const activePrices = await getActivePrices(shift.stationId);

  root.innerHTML = `
    <div class="container">
      <h1 class="page-title">Close Shift</h1>
      <p class="page-sub">${shift.employeeName} • Started ${formatDateTime(shift.startTime)}</p>

      <div id="closeForm" class="grid" style="margin-top:18px">
        ${(shift.nozzles||[]).map(n=>`
          <div class="neu-card">
            <div style="font-weight:800;font-size:14px">${n.fuelType} • Nozzle ${n.nozzleId.slice(0,6)}</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:4px">Opening: ${Number(n.openingReading).toFixed(2)} • Price ${formatCurrency(activePrices[n.fuelType]?.price||0)}</div>
            <div style="margin-top:10px"><label class="label">Closing Reading</label><input class="neu-input closing-input" data-id="${n.nozzleId}" type="number" step="0.01" placeholder="${Number(n.openingReading).toFixed(2)}"></div>
            <div style="margin-top:8px;font-size:12px" id="calc-${n.nozzleId}">Sold: - • Revenue: -</div>
          </div>
        `).join('')}
      </div>

      <div class="neu-card" style="margin-top:18px">
        <h3 style="font-weight:800">Payment Breakdown</h3>
        <div class="grid grid-2" style="margin-top:12px">
          <div><label class="label">Cash</label><input id="pay_cash" class="neu-input" type="number" value="0"></div>
          <div><label class="label">Card</label><input id="pay_card" class="neu-input" type="number" value="0"></div>
          <div><label class="label">UPI</label><input id="pay_upi" class="neu-input" type="number" value="0"></div>
          <div><label class="label">Credit</label><input id="pay_credit" class="neu-input" type="number" value="0"></div>
          <div><label class="label">Other</label><input id="pay_other" class="neu-input" type="number" value="0"></div>
        </div>
        <div style="margin-top:12px" id="paymentSummary"></div>
      </div>

      <div id="alertBox" style="margin-top:12px"></div>
      <button id="submitClose" class="neu-btn neu-btn--primary neu-btn--block" style="margin-top:16px">Submit & Close Shift</button>
    </div>
  `;

  const closingInputs = root.querySelectorAll('.closing-input');
  function recalc() {
    let totalRevenue = 0, totalLiters = 0;
    closingInputs.forEach(inp=>{
      const nozzleId = inp.dataset.id;
      const nozzle = shift.nozzles.find(n=>n.nozzleId===nozzleId);
      const closingVal = Number(inp.value);
      const calcEl = root.querySelector(`#calc-${nozzleId}`);
      if (!inp.value || isNaN(closingVal)) { calcEl.textContent = `Sold: - • Revenue: -`; return; }
      try {
        const liters = calcLitersSold(nozzle.openingReading, closingVal);
        const price = activePrices[nozzle.fuelType]?.price || 0;
        const revenue = calcRevenue(liters, price);
        calcEl.textContent = `Sold: ${liters.toFixed(2)} L • Revenue: ${formatCurrency(revenue)}`;
        totalLiters += liters;
        totalRevenue += revenue;
      } catch(e){
        calcEl.textContent = `⚠️ ${e.message}`;
      }
    });
    const cash = Number(root.querySelector('#pay_cash').value||0);
    const card = Number(root.querySelector('#pay_card').value||0);
    const upi = Number(root.querySelector('#pay_upi').value||0);
    const credit = Number(root.querySelector('#pay_credit').value||0);
    const other = Number(root.querySelector('#pay_other').value||0);
    const totalPayments = cash+card+upi+credit+other;
    const variance = totalPayments - totalRevenue;
    root.querySelector('#paymentSummary').innerHTML = `
      <div style="font-size:13px"><div style="display:flex;justify-content:space-between"><span>Expected Revenue</span><span style="font-weight:800">${formatCurrency(totalRevenue)}</span></div><div style="display:flex;justify-content:space-between"><span>Recorded Payments</span><span>${formatCurrency(totalPayments)}</span></div><div style="display:flex;justify-content:space-between;font-weight:800;color:${Math.abs(variance)>0.5? variance<0?'var(--danger)':'var(--success)':'inherit'}"><span>Variance</span><span>${formatCurrency(variance)} ${variance<-0.5?'SHORT': variance>0.5?'EXCESS':'BALANCED'}</span></div></div>
    `;
  }

  closingInputs.forEach(inp=> inp.addEventListener('input', recalc));
  ['pay_cash','pay_card','pay_upi','pay_credit','pay_other'].forEach(id=> root.querySelector('#'+id).addEventListener('input', recalc));
  recalc();

  root.querySelector('#submitClose').addEventListener('click', async ()=>{
    const closingReadings = {};
    for (const inp of closingInputs) {
      if (!inp.value) { root.querySelector('#alertBox').innerHTML=`<div class="alert alert--danger">Enter closing reading for all nozzles</div>`; return; }
      closingReadings[inp.dataset.id] = Number(inp.value);
    }
    const payments = {
      cash: Number(root.querySelector('#pay_cash').value||0),
      card: Number(root.querySelector('#pay_card').value||0),
      upi: Number(root.querySelector('#pay_upi').value||0),
      credit: Number(root.querySelector('#pay_credit').value||0),
      other: Number(root.querySelector('#pay_other').value||0),
    };
    try {
      await closeShift(shift.id, { closingReadings, payments });
      location.hash = `#/shifts/${shift.id}`;
    } catch(e){
      root.querySelector('#alertBox').innerHTML=`<div class="alert alert--danger">⚠️ ${e.message}</div>`;
    }
  });
}

function generateShiftCSV(shift, credits, expenses) {
  let csv = `Shift ID,${shift.id}\nEmployee,${shift.employeeName}\nStart,${shift.startTime}\nEnd,${shift.endTime||''}\nStatus,${shift.status}\n\n`;
  csv += `Nozzle ID,Fuel Type,Opening,Closing,Liters,Price,Revenue\n`;
  (shift.nozzles||[]).forEach(n=>{ csv += `${n.nozzleId},${n.fuelType},${n.openingReading},${n.closingReading||''},${n.litersSold||''},${n.price||''},${n.revenue||''}\n`; });
  csv += `\nTotal Revenue,${shift.totals?.totalRevenue||0}\nTotal Payments,${shift.totals?.totalPayments||0}\nVariance,${shift.totals?.variance||0}\n\n`;
  csv += `Credits\nCustomer,Amount,Reference,Note\n`;
  credits.forEach(c=>{ csv += `${c.customer},${c.amount},${c.reference||''},${c.description||''}\n`; });
  csv += `\nExpenses\nCategory,Amount,Description\n`;
  expenses.forEach(e=>{ csv += `${e.category},${e.amount},${e.description||''}\n`; });
  return csv;
}
