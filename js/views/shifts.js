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
            <div style="font-weight:700;font-size:14px">${sh.employeeName} • ${new Date(sh.startTime).toLocaleDateString()} ${new Date(sh.startTime).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} → ${sh.endTime? new Date(sh.endTime).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'Active'}</div>
            <div style="font-size:11px;color:var(--text-secondary);margin-top:4px">${sh.nozzles?.length||0} nozzles • ${formatCurrency(sh.totals?.totalRevenue||0)} • ${formatLiters(sh.totals?.totalLiters||0)}</div>
            ${sh.totals?.variance ? `<div style="font-size:11px;margin-top:4px;color:${Math.abs(sh.totals.variance)>0.5?'var(--danger)':'var(--text-secondary)'}">Variance ${formatCurrency(sh.totals.variance)} • ${sh.totals.varianceStatus}</div>` : ''}
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

  const active = await getActiveShiftForUser(user.uid);
  if (active) {
    root.innerHTML = `<div class="container"><div class="neu-card"><h3>Active Shift Exists</h3><p style="font-size:13px;color:var(--text-secondary);margin-top:6px">You already have an active shift.</p><button class="neu-btn neu-btn--primary" style="margin-top:12px" onclick="location.hash='#/shifts/${active.id}'">Open Active Shift</button></div></div>`;
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
        <h3 style="font-weight:700">Your Nozzles</h3>
        <p style="font-size:11px;color:var(--text-secondary);margin-top:4px">Select nozzles assigned to you and enter opening readings</p>
        <div class="list" style="margin-top:12px" id="nozzleList">
          ${activeNozzles.map(n=>{
            const pump = pumps.find(p=>p.id===n.pumpId);
            return `
              <div class="neu-card neu-card--sm" style="display:flex;flex-direction:column;gap:10px">
                <label style="display:flex;gap:10px;align-items:center;font-weight:700;font-size:13px"><input type="checkbox" class="nz-check" data-id="${n.id}" data-pump="${n.pumpId}" data-fuel="${n.fuelType}" data-last="${n.lastReading||0}"> ${pump?.name||'Pump'} - Nozzle ${n.number} • ${n.fuelType}</label>
                <div><label class="label">Opening Reading</label><input class="neu-input nz-opening" data-id="${n.id}" type="number" step="0.01" value="${n.lastReading||0}" disabled></div>
              </div>
            `;
          }).join('') || `<p style="font-size:12px;color:var(--text-secondary)">No active nozzles</p>`}
        </div>
      </div>

      <div id="alertBox" style="margin-top:12px"></div>
      <button id="startBtn" class="neu-btn neu-btn--primary neu-btn--block" style="margin-top:16px">Start Shift</button>
    </div>
  `;

  root.querySelector('#stationSel').addEventListener('change', async e=>{
    const newId = e.target.value;
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

  const canReview = ['owner','manager','admin','super_admin'].includes(user.role);
  const stations = await getStationsForCurrentUser();
  const stationName = stations.find(s=>s.id===shift.stationId)?.name || 'Station';
  const transactions = await getTransactions(shift.stationId, { shiftId: shift.id });
  const notes = await getNotes(shift.stationId, { shiftId: shift.id });
  const credits = transactions.filter(t=>t.type==='credit');
  const expenses = transactions.filter(t=>t.type==='expense');

  if (shift.status === 'ACTIVE') {
    root.innerHTML = `
      <div class="container">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div><h1 class="page-title">Active Shift</h1><p class="page-sub">${shift.employeeName} • Started ${formatDateTime(shift.startTime)}</p></div>
          <span class="badge badge--info">ACTIVE</span>
        </div>

        <div class="neu-card" style="margin-top:16px">
          <h3 style="font-weight:700;font-size:14px">Nozzles (${shift.nozzles?.length||0})</h3>
          <div class="list" style="margin-top:10px">
            ${(shift.nozzles||[]).map(n=>`
              <div class="neu-card neu-card--sm" style="display:flex;justify-content:space-between">
                <div><div style="font-weight:700;font-size:13px">${n.fuelType} • Nozzle</div><div style="font-size:11px;color:var(--text-secondary)">Opening ${Number(n.openingReading).toFixed(2)}</div></div>
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
          <h3 style="font-weight:700;font-size:14px">Credits (${credits.length})</h3>
          <div class="list" style="margin-top:8px">${credits.map(c=>`<div style="display:flex;justify-content:space-between;font-size:12px"><span>${c.customer}</span><span style="font-weight:700">${formatCurrency(c.amount)}</span></div>`).join('') || `<p style="font-size:11px;color:var(--text-secondary)">No credits</p>`}</div>
        </div>
        <div class="neu-card" style="margin-top:12px">
          <h3 style="font-weight:700;font-size:14px">Expenses (${expenses.length})</h3>
          <div class="list" style="margin-top:8px">${expenses.map(e=>`<div style="display:flex;justify-content:space-between;font-size:12px"><span>${e.category}</span><span style="font-weight:700">${formatCurrency(e.amount)}</span></div>`).join('') || `<p style="font-size:11px;color:var(--text-secondary)">No expenses</p>`}</div>
        </div>
        <div class="neu-card" style="margin-top:12px">
          <h3 style="font-weight:700;font-size:14px">Notes (${notes.length})</h3>
          <div class="list" style="margin-top:8px">${notes.map(n=>`<div style="font-size:12px;border-left:2px solid var(--primary);padding-left:8px;margin-bottom:8px"><div>${n.text}</div><div style="font-size:10px;color:var(--text-secondary)">${n.userName} • ${formatDateTime(n.createdAt)}</div></div>`).join('') || `<p style="font-size:11px;color:var(--text-secondary)">No notes</p>`}</div>
        </div>
      </div>

      <div id="creditModal" class="modal-backdrop" style="display:none"><div class="modal">
        <div style="display:flex;justify-content:space-between"><h3 style="font-weight:700">Add Credit</h3><button class="neu-btn neu-btn--small" onclick="document.getElementById('creditModal').style.display='none'">✕</button></div>
        <div class="grid" style="margin-top:12px">
          <div><label class="label">Customer</label><input id="cr_customer" class="neu-input" placeholder="ABC Transport"></div>
          <div><label class="label">Amount</label><input id="cr_amount" class="neu-input" type="number" placeholder="5000"></div>
          <div><label class="label">Reference</label><input id="cr_ref" class="neu-input" placeholder="Truck APXX1234"></div>
          <button id="saveCredit" class="neu-btn neu-btn--primary neu-btn--block">Save Credit</button>
        </div>
      </div></div>

      <div id="expenseModal" class="modal-backdrop" style="display:none"><div class="modal">
        <div style="display:flex;justify-content:space-between"><h3 style="font-weight:700">Add Expense</h3><button class="neu-btn neu-btn--small" onclick="document.getElementById('expenseModal').style.display='none'">✕</button></div>
        <div class="grid" style="margin-top:12px">
          <div><label class="label">Category</label><select id="ex_cat" class="neu-select"><option>Maintenance</option><option>Cleaning</option><option>Electricity</option><option>Water</option><option>Petty Cash</option><option>Other</option></select></div>
          <div><label class="label">Amount</label><input id="ex_amount" class="neu-input" type="number" placeholder="750"></div>
          <div><label class="label">Description</label><input id="ex_desc" class="neu-input" placeholder="Pump repair"></div>
          <button id="saveExpense" class="neu-btn neu-btn--primary neu-btn--block">Save Expense</button>
        </div>
      </div></div>

      <div id="noteModal" class="modal-backdrop" style="display:none"><div class="modal">
        <div style="display:flex;justify-content:space-between"><h3 style="font-weight:700">Add Note</h3><button class="neu-btn neu-btn--small" onclick="document.getElementById('noteModal').style.display='none'">✕</button></div>
        <div class="grid" style="margin-top:12px">
          <div><label class="label">Note</label><textarea id="note_text" class="neu-input" rows="3" placeholder="Pump 4 stopped working..."></textarea></div>
          <button id="saveNote" class="neu-btn neu-btn--primary neu-btn--block">Save Note</button>
        </div>
      </div></div>
    `;

    root.querySelector('#saveCredit').addEventListener('click', async ()=>{
      const customer = root.querySelector('#cr_customer').value.trim();
      const amount = root.querySelector('#cr_amount').value;
      const reference = root.querySelector('#cr_ref').value.trim();
      if (!customer || !amount) return alert('Fill required');
      try { await addCredit({ stationId: shift.stationId, shiftId: shift.id, customer, amount, reference }); location.reload(); } catch(e){ alert(e.message); }
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
    // Amazon-style clean bill - no clutter
    const t = shift.totals || {};
    const totalCredits = credits.reduce((a,c)=>a+Number(c.amount||0),0);
    const totalExpenses = expenses.reduce((a,c)=>a+Number(c.amount||0),0);
    const isShort = (t.variance||0) < -0.5;
    const isExcess = (t.variance||0) > 0.5;

    root.innerHTML = `
      <div class="container" style="max-width:480px;margin:0 auto">
        <!-- Header like Amazon invoice -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <button class="neu-btn neu-btn--small" onclick="location.hash='#/shifts'">← Back</button>
          <div style="display:flex;gap:8px">
            <button class="neu-btn neu-btn--small" onclick="window.print()">🖨️</button>
            <button class="neu-btn neu-btn--small" id="exportCsv">⬇️</button>
          </div>
        </div>

        <div class="neu-card" style="padding:0;overflow:hidden;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
          <!-- Top bar -->
          <div style="background:#232f3e;color:white;padding:16px;display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-weight:800;font-size:18px;letter-spacing:0.5px">FuelOps</div>
              <div style="font-size:11px;opacity:0.8;margin-top:2px">Shift Receipt • ${stationName}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:12px;opacity:0.8">Shift ID</div>
              <div style="font-weight:700;font-size:14px">#${shift.id.slice(0,6).toUpperCase()}</div>
              <div style="font-size:10px;margin-top:4px"><span class="badge" style="background:${shift.status==='APPROVED'?'#52c41a': shift.status==='PENDING_REVIEW'?'#faad14':'#ff4d4f'};color:white;border:none;font-size:10px">${shift.status}</span></div>
            </div>
          </div>

          <!-- Meta like Amazon order info -->
          <div style="padding:16px;background:#f8f9fa;border-bottom:1px solid #eee">
            <div style="display:flex;justify-content:space-between;font-size:12px">
              <div>
                <div style="color:var(--text-secondary);font-size:10px;text-transform:uppercase;letter-spacing:0.5px">Employee</div>
                <div style="font-weight:600;margin-top:2px">${shift.employeeName}</div>
              </div>
              <div style="text-align:right">
                <div style="color:var(--text-secondary);font-size:10px;text-transform:uppercase;letter-spacing:0.5px">Date</div>
                <div style="font-weight:500;margin-top:2px;font-size:11px">${new Date(shift.startTime).toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'})}</div>
                <div style="font-size:10px;color:var(--text-secondary)">${new Date(shift.startTime).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} → ${shift.endTime? new Date(shift.endTime).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):''}</div>
              </div>
            </div>
          </div>

          <!-- Items like Amazon order items -->
          <div style="padding:16px">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-secondary);margin-bottom:12px">Fuel Sales</div>
            ${(shift.nozzles||[]).map(n=>`
              <div style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #f0f0f0;gap:12px">
                <div style="flex:1">
                  <div style="font-weight:600;font-size:13px">${n.fuelType}</div>
                  <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">${(n.litersSold||0).toFixed(2)} L × ${formatCurrency(n.price||0)}</div>
                  <div style="font-size:10px;color:var(--text-tertiary);margin-top:2px">Nozzle • ${Number(n.openingReading).toFixed(0)} → ${Number(n.closingReading||0).toFixed(0)}</div>
                </div>
                <div style="text-align:right">
                  <div style="font-weight:700;font-size:14px">${formatCurrency(n.revenue||0)}</div>
                </div>
              </div>
            `).join('')}

            <!-- Total like Amazon -->
            <div style="display:flex;justify-content:space-between;padding:14px 0;font-weight:800;font-size:16px;border-bottom:2px solid #232f3e;margin-top:4px">
              <span>Total Fuel Sales</span>
              <span>${formatCurrency(t.totalRevenue||0)}</span>
            </div>

            <!-- Payments like Amazon payment breakdown -->
            <div style="margin-top:16px">
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-secondary);margin-bottom:10px">Payments Received</div>
              <div style="background:#f8f9fa;border-radius:10px;padding:12px">
                ${[
                  {label:'Cash', val: t.payments?.cash||0},
                  {label:'Card', val: t.payments?.card||0},
                  {label:'UPI', val: t.payments?.upi||0},
                  {label:'Credit', val: t.payments?.credit||0},
                  {label:'Other', val: t.payments?.other||0},
                ].filter(p=>p.val>0).map(p=>`
                  <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px">
                    <span style="color:var(--text-secondary)">${p.label}</span>
                    <span style="font-weight:500">${formatCurrency(p.val)}</span>
                  </div>
                `).join('') || `<div style="font-size:12px;color:var(--text-secondary);text-align:center;padding:8px">No payments recorded</div>`}
                <div style="height:1px;background:#e0e0e0;margin:8px 0"></div>
                <div style="display:flex;justify-content:space-between;font-size:13px">
                  <span style="color:var(--text-secondary)">Recorded</span>
                  <span style="font-weight:600">${formatCurrency(t.totalPayments||0)}</span>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:13px;margin-top:4px">
                  <span style="color:var(--text-secondary)">Expected</span>
                  <span style="font-weight:600">${formatCurrency(t.totalRevenue||0)}</span>
                </div>
                <div style="display:flex;justify-content:space-between;padding:10px;background:${isShort?'#fff1f0': isExcess?'#f6ffed':'#f0f0f0'};border-radius:8px;margin-top:10px;border:1px solid ${isShort?'#ffa39e': isExcess?'#b7eb8f':'#e0e0e0'}">
                  <span style="font-weight:700;font-size:13px;color:${isShort?'#cf1322': isExcess?'#389e0d':'var(--text)'}">${isShort?'Short': isExcess?'Excess':'Variance'}</span>
                  <span style="font-weight:800;font-size:14px;color:${isShort?'#cf1322': isExcess?'#389e0d':'var(--text)'}">${formatCurrency(t.variance||0)}</span>
                </div>
              </div>
            </div>

            ${credits.length ? `
              <div style="margin-top:16px">
                <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-secondary);margin-bottom:8px">Credits • ${formatCurrency(totalCredits)}</div>
                ${credits.map(c=>`<div style="display:flex;justify-content:space-between;font-size:12px;padding:6px 0;border-bottom:1px dashed #eee"><span>${c.customer}</span><span style="font-weight:600">${formatCurrency(c.amount)}</span></div>`).join('')}
              </div>
            ` : ''}

            ${expenses.length ? `
              <div style="margin-top:16px">
                <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-secondary);margin-bottom:8px">Expenses • ${formatCurrency(totalExpenses)}</div>
                ${expenses.map(e=>`<div style="display:flex;justify-content:space-between;font-size:12px;padding:6px 0;border-bottom:1px dashed #eee"><span>${e.category}</span><span style="font-weight:600">${formatCurrency(e.amount)}</span></div>`).join('')}
              </div>
            ` : ''}

            ${notes.length ? `
              <div style="margin-top:16px;padding:10px;background:#fffbe6;border-radius:8px;border:0.5px solid #ffe58f">
                <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#ad6800;margin-bottom:6px">Note</div>
                <div style="font-size:12px">${notes[0]?.text||''}</div>
              </div>
            ` : ''}
          </div>

          <!-- Footer like Amazon -->
          <div style="padding:12px 16px;background:#f8f9fa;border-top:1px solid #eee;text-align:center">
            <div style="font-size:10px;color:var(--text-tertiary)">Thank you • FuelOps • ${stationName}</div>
            <div style="font-size:9px;color:var(--text-tertiary);margin-top:2px">Generated ${new Date().toLocaleString('en-IN')}</div>
          </div>
        </div>

        ${shift.status==='PENDING_REVIEW' && canReview ? `
          <div class="grid grid-2" style="margin-top:16px">
            <button id="approveBtn" class="neu-btn neu-btn--primary" style="background:#52c41a;border-color:#52c41a">✓ Approve</button>
            <button id="rejectBtn" class="neu-btn">✗ Correction</button>
          </div>
        ` : ''}

        <div style="margin-top:16px;display:flex;gap:8px;justify-content:center">
          <button class="neu-btn neu-btn--small" onclick="location.hash='#/shifts'">Back to Shifts</button>
        </div>
      </div>
    `;

    root.querySelector('#approveBtn')?.addEventListener('click', async ()=>{
      if (!confirm('Approve this shift?')) return;
      try { await approveShift(shift.id); alert('Approved'); location.hash='#/shifts'; } catch(e){ alert(e.message); }
    });
    root.querySelector('#rejectBtn')?.addEventListener('click', async ()=>{
      const reason = prompt('Reason?');
      if (!reason) return;
      try { await rejectShift(shift.id, reason); alert('Rejected'); location.hash='#/shifts'; } catch(e){ alert(e.message); }
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
  if (!shift || shift.status!=='ACTIVE') { root.innerHTML=`<div class="container"><div class="neu-card empty"><p>Shift not active</p></div></div>`; return; }
  const activePrices = await getActivePrices(shift.stationId);

  root.innerHTML = `
    <div class="container" style="max-width:480px;margin:0 auto">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
        <button class="neu-btn neu-btn--small" onclick="history.back()">← Back</button>
        <div>
          <h1 class="page-title" style="font-size:18px">Close Shift</h1>
          <p class="page-sub" style="font-size:12px">${shift.employeeName} • ${formatDateTime(shift.startTime)}</p>
        </div>
      </div>

      <div id="closeForm" class="grid" style="gap:12px">
        ${(shift.nozzles||[]).map(n=>`
          <div class="neu-card" style="padding:14px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div style="font-weight:700;font-size:13px">${n.fuelType}</div>
              <span style="font-size:10px;background:var(--bg);padding:4px 8px;border-radius:20px">Nozzle</span>
            </div>
            <div style="font-size:11px;color:var(--text-secondary);margin-top:4px">Opening: ${Number(n.openingReading).toFixed(2)} • Price ${formatCurrency(activePrices[n.fuelType]?.price||0)}</div>
            <div style="margin-top:10px"><label class="label" style="font-size:11px">Closing Reading</label><input class="neu-input closing-input" data-id="${n.nozzleId}" type="number" step="0.01" placeholder="${Number(n.openingReading).toFixed(2)}" style="font-size:16px;font-weight:600"></div>
            <div style="margin-top:8px;font-size:12px;font-weight:500" id="calc-${n.nozzleId}">Sold: - • Revenue: -</div>
          </div>
        `).join('')}
      </div>

      <div class="neu-card" style="margin-top:16px">
        <h3 style="font-weight:700;font-size:14px">Payment Breakdown</h3>
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
      <button id="submitClose" class="neu-btn neu-btn--primary neu-btn--block" style="margin-top:16px;background:#232f3e;border-color:#232f3e">Submit & Close Shift</button>
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
      <div style="background:#f8f9fa;border-radius:10px;padding:12px;font-size:13px">
        <div style="display:flex;justify-content:space-between"><span>Expected</span><span style="font-weight:700">${formatCurrency(totalRevenue)}</span></div>
        <div style="display:flex;justify-content:space-between;margin-top:4px"><span>Recorded</span><span style="font-weight:700">${formatCurrency(totalPayments)}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:800;margin-top:8px;padding-top:8px;border-top:1px solid #e0e0e0;color:${Math.abs(variance)>0.5? variance<0?'#cf1322':'#389e0d':'inherit'}"><span>Variance</span><span>${formatCurrency(variance)}</span></div>
      </div>
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
  csv += `Credits\nCustomer,Amount\n`;
  credits.forEach(c=>{ csv += `${c.customer},${c.amount}\n`; });
  csv += `\nExpenses\nCategory,Amount\n`;
  expenses.forEach(e=>{ csv += `${e.category},${e.amount}\n`; });
  return csv;
}
