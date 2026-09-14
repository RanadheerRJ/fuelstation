import { getState } from '../state.js';
import { getStationsForCurrentUser } from '../services/stations.js';
import { getReportForRange } from '../services/reports.js';
import { getShifts } from '../services/shifts.js';
import { getTransactions } from '../services/transactions.js';
import { formatCurrency, formatLiters, formatDate } from '../services/calc.js';
import { getEmployees } from '../services/users.js';
import { getHideBalancePref } from '../services/collections.js';

export async function reportsView({ root, query }) {
  const { user, currentStationId } = getState();
  const stations = await getStationsForCurrentUser();
  const stationId = currentStationId || stations[0]?.id;
  if (!stationId) { root.innerHTML=`<div class="container"><div class="neu-card empty"><p>No station</p></div></div>`; return; }

  const isOwner = user.role === 'owner';
  const isManager = user.role === 'manager';
  const isAdmin = user.role === 'admin';
  const isAttendant = user.role === 'attendant';

  // Parse filters from query or defaults
  const today = new Date();
  const todayStr = today.toISOString().slice(0,10);
  const last7 = new Date(today); last7.setDate(today.getDate()-6);
  const last7Str = last7.toISOString().slice(0,10);
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0,10);

  let fromDate = query.from || last7Str;
  let toDate = query.to || todayStr;
  let employeeFilter = query.emp || 'all';
  let statusFilter = query.status || 'ALL';

  // For attendant, force own data
  if (isAttendant) employeeFilter = user.uid;

  const allShiftsRaw = await getShifts(stationId);
  const myShiftsRaw = allShiftsRaw.filter(s=>s.userId===user.uid);
  const shiftsBase = isAttendant ? myShiftsRaw : allShiftsRaw;

  // Get employees for filter dropdown (owner/manager)
  let employeesList = [];
  try {
    employeesList = await getEmployees(stationId);
    if (employeesList.length===0) {
      // fallback from shifts
      const uniq = {};
      allShiftsRaw.forEach(s=>{ uniq[s.userId]=s.employeeName; });
      employeesList = Object.entries(uniq).map(([uid, name])=>({ uid, id: uid, name }));
    }
  } catch { employeesList = []; }

  const report = await getReportForRange(stationId, fromDate, toDate, {
    employeeId: employeeFilter,
    status: statusFilter,
  });

  const credits = await getTransactions(stationId, { type: 'credit' });
  const filteredCredits = credits.filter(c=>{
    const d = new Date(c.createdAt).toISOString().slice(0,10);
    return d >= fromDate && d <= toDate && (employeeFilter==='all' || myShiftsRaw.some(s=>s.id===c.shiftId) || true);
  });

  const hideBalance = getHideBalancePref(stationId);
  const fmt = (v) => hideBalance ? '••••' : formatCurrency(v);
  const fmtLit = (v) => hideBalance ? '••••' : formatLiters(v);

  if (isAttendant) {
    root.innerHTML = `
      <div class="container" style="max-width:520px;margin:0 auto;padding-bottom:100px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div><h1 class="page-title" style="font-size:20px">My Reports</h1><p class="page-sub" style="margin-top:4px">${stations.find(s=>s.id===stationId)?.name} • My Performance • Filtered</p></div>
          <button class="neu-btn" style="min-height:40px;padding:0 14px;border-radius:10px;font-weight:600" id="exportBtn">⬇️ CSV</button>
        </div>

        <!-- Filters -->
        <div class="neu-card" style="margin-top:16px;padding:14px;border-radius:14px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-secondary)">Filters • Date Range</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
            <div><label class="label" style="font-size:11px">From</label><input type="date" id="fromDate" class="neu-input" style="min-height:44px;border-radius:10px" value="${fromDate}"></div>
            <div><label class="label" style="font-size:11px">To</label><input type="date" id="toDate" class="neu-input" style="min-height:44px;border-radius:10px" value="${toDate}"></div>
          </div>
          <div style="display:flex;gap:8px;overflow:auto;margin-top:12px;padding-bottom:4px">
            ${[
              {label:'Today', from: todayStr, to: todayStr},
              {label:'Yesterday', from: new Date(new Date().setDate(new Date().getDate()-1)).toISOString().slice(0,10), to: new Date(new Date().setDate(new Date().getDate()-1)).toISOString().slice(0,10)},
              {label:'Last 7 Days', from: last7Str, to: todayStr},
              {label:'This Month', from: firstOfMonth, to: todayStr},
              {label:'Last 30 Days', from: new Date(new Date().setDate(new Date().getDate()-29)).toISOString().slice(0,10), to: todayStr},
            ].map(p=>`<button class="preset-btn neu-btn" data-from="${p.from}" data-to="${p.to}" style="min-height:36px;padding:0 14px;border-radius:20px;font-size:12px;white-space:nowrap;${fromDate===p.from && toDate===p.to ? 'background:#232f3e;color:white;border-color:#232f3e' : ''}">${p.label}</button>`).join('')}
          </div>
          <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div><label class="label" style="font-size:11px">Status</label><select id="statusFilter" class="neu-select" style="min-height:44px;border-radius:10px"><option value="ALL" ${statusFilter==='ALL'?'selected':''}>All Status</option><option value="APPROVED" ${statusFilter==='APPROVED'?'selected':''}>Approved</option><option value="PENDING_REVIEW" ${statusFilter==='PENDING_REVIEW'?'selected':''}>Pending</option><option value="REJECTED" ${statusFilter==='REJECTED'?'selected':''}>Rejected</option><option value="ACTIVE" ${statusFilter==='ACTIVE'?'selected':''}>Active</option></select></div>
            <div style="display:flex;align-items:flex-end"><button id="applyFilter" class="neu-btn neu-btn--primary" style="min-height:44px;border-radius:10px;width:100%;font-weight:700">Apply Filter</button></div>
          </div>
        </div>

        <div class="neu-card" style="margin-top:16px;padding:16px;border-radius:14px;background:linear-gradient(135deg,#f6ffed 0%,#ffffff 100%);border:1px solid #b7eb8f">
          <div style="display:flex;justify-content:space-between;align-items:center"><h3 style="font-weight:700;font-size:14px">My Performance • ${fromDate} → ${toDate}</h3><span style="font-size:11px;background:white;padding:4px 10px;border-radius:20px;border:0.5px solid #b7eb8f">${report.count} shifts</span></div>
          <div class="grid grid-2" style="margin-top:14px;gap:12px">
            <div style="padding:12px;background:white;border-radius:10px;text-align:center"><div style="font-size:11px;color:var(--text-secondary)">My Sales</div><div style="font-weight:800;font-size:18px;margin-top:4px">${fmt(report.totalRevenue)}</div><div style="font-size:10px;color:var(--text-tertiary)">${report.count} shift(s) filtered</div></div>
            <div style="padding:12px;background:white;border-radius:10px;text-align:center"><div style="font-size:11px;color:var(--text-secondary)">My Fuel Sold</div><div style="font-weight:800;font-size:18px;margin-top:4px">${fmtLit(report.totalLiters)}</div><div style="font-size:10px;color:var(--text-tertiary)">In range</div></div>
          </div>
          <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div style="padding:10px;background:white;border-radius:10px;text-align:center"><div style="font-size:10px;color:var(--text-secondary)">To Handover</div><div style="font-weight:700;font-size:14px;color:#cf1322;margin-top:2px">${fmt(report.toCollect)}</div></div>
            <div style="padding:10px;background:white;border-radius:10px;text-align:center"><div style="font-size:10px;color:var(--text-secondary)">Excess</div><div style="font-weight:700;font-size:14px;color:#389e0d;margin-top:2px">${fmt(report.toReturn)}</div></div>
          </div>
          <div style="margin-top:12px"><div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:6px">By Fuel</div><div style="display:flex;flex-direction:column;gap:6px">${Object.entries(report.byFuel).map(([ft,v])=>`<div style="display:flex;justify-content:space-between;font-size:12px;padding:6px 10px;background:white;border-radius:8px"><span>${ft}</span><span style="font-weight:600">${fmtLit(v.liters)} • ${fmt(v.revenue)}</span></div>`).join('') || `<p style="font-size:12px;color:var(--text-secondary)">No data</p>`}</div></div>
        </div>

        <div class="neu-card" style="margin-top:16px;padding:16px;border-radius:14px">
          <h3 style="font-weight:700;font-size:14px">My Shifts • ${report.shifts.length} filtered</h3>
          <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px;max-height:500px;overflow:auto">
            ${report.shifts.slice(0,50).map(s=>`
              <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg);border-radius:10px;cursor:pointer" onclick="location.hash='#/shifts/${s.id}'">
                <div><div style="font-weight:600;font-size:13px">${new Date(s.startTime).toLocaleDateString()} ${new Date(s.startTime).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} • ${fmt(s.totals?.totalRevenue||0)}</div><div style="font-size:11px;color:var(--text-secondary)">${fmtLit(s.totals?.totalLiters||0)} • ${s.status} ${s.totals?.variance<0? '• To Handover '+fmt(Math.abs(s.totals.variance)) : ''}</div></div>
                <span class="badge ${s.status==='APPROVED'?'badge--success': s.status==='PENDING_REVIEW'?'badge--warning':'badge--danger'}" style="font-size:10px;padding:4px 8px;border-radius:12px">${s.status}</span>
              </div>
            `).join('') || `<p style="font-size:12px;color:var(--text-secondary)">No shifts in range</p>`}
          </div>
        </div>
      </div>
    `;
    attachFilterHandlers(root, stationId);
    root.querySelector('#exportBtn').addEventListener('click', ()=> exportCSV(report, `my-report-${fromDate}-${toDate}`));
    return;
  }

  // Owner/Manager view - full powerful filtering
  root.innerHTML = `
    <div class="container" style="max-width:520px;margin:0 auto;padding-bottom:100px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><h1 class="page-title" style="font-size:20px">${isOwner ? 'Station Reports' : 'Team Reports'}</h1><p class="page-sub" style="margin-top:4px">${stations.find(s=>s.id===stationId)?.name} • ${isOwner ? 'Owner • All Visibility' : 'Manager'} • ${report.count} shifts filtered</p></div>
        <button class="neu-btn" style="min-height:40px;padding:0 14px;border-radius:10px;font-weight:600" id="exportBtn">⬇️ Export</button>
      </div>

      <!-- Filters - think big -->
      <div class="neu-card" style="margin-top:16px;padding:14px;border-radius:14px">
        <div style="display:flex;justify-content:space-between;align-items:center"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-secondary)">🔍 Filters • Employee + Date Range</div><button id="clearFilter" class="neu-btn" style="min-height:28px;padding:0 10px;border-radius:8px;font-size:11px">Clear</button></div>
        
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">
          <div><label class="label" style="font-size:11px">From Date</label><input type="date" id="fromDate" class="neu-input" style="min-height:44px;border-radius:10px" value="${fromDate}"></div>
          <div><label class="label" style="font-size:11px">To Date</label><input type="date" id="toDate" class="neu-input" style="min-height:44px;border-radius:10px" value="${toDate}"></div>
        </div>

        <div style="display:flex;gap:8px;overflow:auto;margin-top:12px;padding-bottom:4px">
          ${[
            {label:'Today', from: todayStr, to: todayStr},
            {label:'Yesterday', from: new Date(new Date().setDate(new Date().getDate()-1)).toISOString().slice(0,10), to: new Date(new Date().setDate(new Date().getDate()-1)).toISOString().slice(0,10)},
            {label:'Last 7 Days', from: last7Str, to: todayStr},
            {label:'This Month', from: firstOfMonth, to: todayStr},
            {label:'Last 30 Days', from: new Date(new Date().setDate(new Date().getDate()-29)).toISOString().slice(0,10), to: todayStr},
          ].map(p=>`<button class="preset-btn neu-btn" data-from="${p.from}" data-to="${p.to}" style="min-height:36px;padding:0 14px;border-radius:20px;font-size:12px;white-space:nowrap;${fromDate===p.from && toDate===p.to ? 'background:#232f3e;color:white;border-color:#232f3e' : ''}">${p.label}</button>`).join('')}
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">
          <div><label class="label" style="font-size:11px">Employee</label><select id="empFilter" class="neu-select" style="min-height:44px;border-radius:10px"><option value="all" ${employeeFilter==='all'?'selected':''}>All Employees (${employeesList.length})</option>${employeesList.map(emp=>`<option value="${emp.uid||emp.id}" ${employeeFilter===(emp.uid||emp.id)?'selected':''}>${emp.name||emp.phone} • ${emp.role||''}</option>`).join('')}</select></div>
          <div><label class="label" style="font-size:11px">Status</label><select id="statusFilter" class="neu-select" style="min-height:44px;border-radius:10px"><option value="ALL" ${statusFilter==='ALL'?'selected':''}>All Status</option><option value="APPROVED" ${statusFilter==='APPROVED'?'selected':''}>Approved</option><option value="PENDING_REVIEW" ${statusFilter==='PENDING_REVIEW'?'selected':''}>Pending Review</option><option value="REJECTED" ${statusFilter==='REJECTED'?'selected':''}>Rejected</option><option value="ACTIVE" ${statusFilter==='ACTIVE'?'selected':''}>Active</option></select></div>
        </div>

        <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <button id="applyFilter" class="neu-btn neu-btn--primary" style="min-height:48px;border-radius:12px;font-weight:700">Apply Filters</button>
          <button id="resetFilter" class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600">Reset to 7 Days</button>
        </div>

        <div style="margin-top:10px;padding:10px;background:#e6f4ff;border-radius:10px;border:1px solid #91caff">
          <div style="font-size:11px;font-weight:700;color:#0958d9">Active Filters</div>
          <div style="font-size:11px;color:var(--text-secondary);margin-top:4px">📅 ${fromDate} → ${toDate} • 👤 ${employeeFilter==='all'?'All Employees': employeesList.find(e=>(e.uid||e.id)===employeeFilter)?.name || employeeFilter} • 📊 ${statusFilter} • ${report.count} shifts</div>
        </div>
      </div>

      <!-- Summary -->
      <div class="neu-card" style="margin-top:16px;padding:16px;border-radius:14px">
        <div style="display:flex;justify-content:space-between;align-items:center"><h3 style="font-weight:700;font-size:14px">Summary • ${fromDate} → ${toDate}</h3><span style="font-size:11px;background:var(--bg);padding:4px 10px;border-radius:20px">${report.count} shifts</span></div>
        
        <div class="grid grid-2" style="margin-top:14px;gap:12px">
          <div style="padding:14px;background:linear-gradient(135deg,#e6f4ff 0%,#ffffff 100%);border-radius:12px;border:1px solid #91caff;text-align:center"><div style="font-size:11px;color:var(--text-secondary)">Total Revenue</div><div style="font-weight:800;font-size:20px;margin-top:4px">${fmt(report.totalRevenue)}</div><div style="font-size:10px;color:var(--text-tertiary);margin-top:2px">${report.count} shifts • Avg ${report.count? fmt(report.totalRevenue/report.count) : fmt(0)}/shift</div></div>
          <div style="padding:14px;background:var(--bg);border-radius:12px;text-align:center"><div style="font-size:11px;color:var(--text-secondary)">Fuel Sold</div><div style="font-weight:800;font-size:20px;margin-top:4px">${fmtLit(report.totalLiters)}</div><div style="font-size:10px;color:var(--text-tertiary);margin-top:2px">${Object.keys(report.byFuel).length} fuel types</div></div>
          <div style="padding:12px;background:#fff1f0;border-radius:12px;text-align:center;border:1px solid #ffa39e"><div style="font-size:11px;color:var(--text-secondary)">To Collect</div><div style="font-weight:800;font-size:16px;margin-top:4px;color:#cf1322">${fmt(report.toCollect)}</div><div style="font-size:10px;color:var(--text-tertiary)">Pending ${fmt(report.pendingCollect)} • Collected ${fmt(report.collected)}</div></div>
          <div style="padding:12px;background:#f6ffed;border-radius:12px;text-align:center;border:1px solid #b7eb8f"><div style="font-size:11px;color:var(--text-secondary)">To Return</div><div style="font-weight:800;font-size:16px;margin-top:4px;color:#389e0d">${fmt(report.toReturn)}</div><div style="font-size:10px;color:var(--text-tertiary)">Pending ${fmt(report.pendingReturn)} • Returned ${fmt(report.returned)}</div></div>
        </div>

        <div style="margin-top:14px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-secondary);margin-bottom:8px">By Fuel • ${Object.keys(report.byFuel).length} types</div>
          <div style="display:flex;flex-direction:column;gap:6px">${Object.entries(report.byFuel).map(([ft, v])=>`<div style="display:flex;justify-content:space-between;font-size:13px;padding:8px 12px;background:var(--bg);border-radius:10px"><span style="font-weight:600">${ft} • ${v.shifts} shifts</span><span style="font-weight:600">${fmtLit(v.liters)} • ${fmt(v.revenue)}</span></div>`).join('') || `<p style="font-size:12px;color:var(--text-secondary)">No data</p>`}</div>
        </div>

        <div style="margin-top:14px;background:#f8f9fa;border-radius:10px;padding:12px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-secondary);margin-bottom:8px">By Payment Mode</div>
          ${Object.entries(report.paymentsAgg).map(([k,v])=>`<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0"><span style="text-transform:uppercase;color:var(--text-secondary)">${k}</span><span style="font-weight:600">${fmt(v)}</span></div>`).join('')}
        </div>

        ${Object.keys(report.byDate).length>1 ? `
          <div style="margin-top:14px">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-secondary);margin-bottom:8px">Daily Trend • ${Object.keys(report.byDate).length} days</div>
            <div style="display:flex;flex-direction:column;gap:4px;max-height:200px;overflow:auto">${Object.values(report.byDate).sort((a,b)=>b.date.localeCompare(a.date)).map(d=>`<div style="display:flex;justify-content:space-between;font-size:12px;padding:6px 10px;background:var(--bg);border-radius:8px"><span>${d.date} • ${d.shifts} shifts</span><span style="font-weight:600">${fmt(d.revenue)} • ${fmtLit(d.liters)}</span></div>`).join('')}</div>
          </div>
        ` : ''}
      </div>

      <!-- By Employee -->
      <div class="neu-card" style="margin-top:16px;padding:16px;border-radius:14px">
        <div style="display:flex;justify-content:space-between;align-items:center"><h3 style="font-weight:700;font-size:14px">By Employee • ${Object.keys(report.byEmployee).length} staff</h3><button class="neu-btn" style="min-height:32px;padding:0 12px;border-radius:10px;font-size:11px" onclick="document.getElementById('empTable').style.display=document.getElementById('empTable').style.display==='none'?'block':'none'">Toggle</button></div>
        <div id="empTable" style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
          ${Object.values(report.byEmployee).sort((a,b)=>b.revenue-a.revenue).map(emp=>`
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg);border-radius:10px;cursor:pointer" onclick="location.hash='#/reports?from=${fromDate}&to=${toDate}&emp=${emp.userId}&status=${statusFilter}'">
              <div style="display:flex;align-items:center;gap:10px"><div style="width:36px;height:36px;border-radius:50%;background:#232f3e;color:white;display:grid;place-items:center;font-weight:700;font-size:12px">${emp.employeeName.split(' ').map(n=>n[0]).join('').slice(0,2)}</div><div><div style="font-weight:600;font-size:13px">${emp.employeeName}</div><div style="font-size:11px;color:var(--text-secondary)">${emp.shifts} shifts • To Collect ${fmt(emp.toCollect)}</div></div></div>
              <div style="text-align:right"><div style="font-weight:700;font-size:13px">${fmt(emp.revenue)}</div><div style="font-size:11px;color:var(--text-secondary)">${fmtLit(emp.liters)}</div></div>
            </div>
          `).join('') || `<p style="font-size:12px;color:var(--text-secondary)">No employees</p>`}
        </div>
      </div>

      <!-- Shifts List Filtered -->
      <div class="neu-card" style="margin-top:16px;padding:16px;border-radius:14px">
        <div style="display:flex;justify-content:space-between;align-items:center"><h3 style="font-weight:700;font-size:14px">Shifts • ${report.shifts.length} filtered</h3><div style="display:flex;gap:8px"><button id="loadMore" class="neu-btn" style="min-height:32px;padding:0 12px;border-radius:10px;font-size:11px">Load 50 more</button></div></div>
        <div id="shiftsList" style="margin-top:12px;display:flex;flex-direction:column;gap:8px;max-height:600px;overflow:auto">
          ${renderShifts(report.shifts.slice(0,30), hideBalance)}
        </div>
      </div>

      ${isOwner ? `
        <div class="neu-card" style="margin-top:16px;padding:16px;border-radius:14px">
          <h3 style="font-weight:700;font-size:14px">💰 Collections in Range • ${fmt(report.settlements.reduce((a,s)=>a+Number(s.amount||0),0))} • ${report.settlements.length} records</h3>
          <div style="margin-top:10px;display:flex;flex-direction:column;gap:6px;max-height:300px;overflow:auto">${report.settlements.slice(0,20).map(s=>`<div style="display:flex;justify-content:space-between;font-size:12px;padding:6px 10px;background:var(--bg);border-radius:8px"><span>${s.staffName} • ${s.type}</span><span style="font-weight:600">${fmt(s.amount)} • ${new Date(s.createdAt).toLocaleDateString()}</span></div>`).join('') || `<p style="font-size:12px;color:var(--text-secondary)">No collections in range</p>`}</div>
          <button class="neu-btn" style="margin-top:10px;min-height:40px;border-radius:10px;width:100%;font-weight:600" onclick="location.hash='#/collections'">Go to Collections</button>
        </div>
      ` : ''}
    </div>
  `;

  attachFilterHandlers(root, stationId);
  let visible = 30;
  root.querySelector('#loadMore')?.addEventListener('click', ()=>{
    visible += 50;
    root.querySelector('#shiftsList').innerHTML = renderShifts(report.shifts.slice(0, visible), hideBalance);
  });
  root.querySelector('#exportBtn').addEventListener('click', ()=> exportCSV(report, `report-${fromDate}-${toDate}-${employeeFilter}`));
}

function attachFilterHandlers(root, stationId) {
  root.querySelectorAll('.preset-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      root.querySelector('#fromDate').value = btn.dataset.from;
      root.querySelector('#toDate').value = btn.dataset.to;
    });
  });
  root.querySelector('#applyFilter')?.addEventListener('click', ()=>{
    const from = root.querySelector('#fromDate').value;
    const to = root.querySelector('#toDate').value;
    const emp = root.querySelector('#empFilter')?.value || 'all';
    const status = root.querySelector('#statusFilter')?.value || 'ALL';
    if (!from || !to) return alert('Select dates');
    if (new Date(from) > new Date(to)) return alert('From date cannot be after To date');
    location.hash = `#/reports?from=${from}&to=${to}&emp=${emp}&status=${status}`;
  });
  root.querySelector('#clearFilter')?.addEventListener('click', ()=>{
    const today = new Date().toISOString().slice(0,10);
    const last7 = new Date(); last7.setDate(last7.getDate()-6);
    location.hash = `#/reports?from=${last7.toISOString().slice(0,10)}&to=${today}&emp=all&status=ALL`;
  });
  root.querySelector('#resetFilter')?.addEventListener('click', ()=>{
    const today = new Date().toISOString().slice(0,10);
    const last7 = new Date(); last7.setDate(last7.getDate()-6);
    location.hash = `#/reports?from=${last7.toISOString().slice(0,10)}&to=${today}&emp=all&status=ALL`;
  });
}

function renderShifts(shifts, hideBalance) {
  const fmt = (v) => hideBalance ? '••••' : formatCurrency(v);
  const fmtLit = (v) => hideBalance ? '••••' : formatLiters(v);
  if (!shifts.length) return `<p style="font-size:12px;color:var(--text-secondary)">No shifts</p>`;
  return shifts.map(s=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg);border-radius:10px;cursor:pointer" onclick="location.hash='#/shifts/${s.id}'">
      <div><div style="font-weight:600;font-size:13px">${s.employeeName} • ${new Date(s.startTime).toLocaleDateString()} ${new Date(s.startTime).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div><div style="font-size:11px;color:var(--text-secondary)">${fmtLit(s.totals?.totalLiters||0)} • ${fmt(s.totals?.totalRevenue||0)} • ${s.totals?.variance<0 ? 'To Collect '+fmt(Math.abs(s.totals.variance)) : 'Balanced'} • ${s.status}</div></div>
      <span class="badge ${s.status==='APPROVED'?'badge--success': s.status==='PENDING_REVIEW'?'badge--warning':'badge--neutral'}" style="font-size:10px;padding:4px 8px;border-radius:12px">${s.status}</span>
    </div>
  `).join('');
}

function exportCSV(report, name) {
  let csv = `FuelOps Report,${report.fromDate} to ${report.toDate},${report.count} shifts\n`;
  csv += `Total Revenue,${report.totalRevenue}\nTotal Liters,${report.totalLiters}\nTo Collect,${report.toCollect}\nTo Return,${report.toReturn}\nCollected,${report.collected}\n\n`;
  csv += `By Fuel\nFuel, Liters, Revenue, Shifts\n`;
  Object.entries(report.byFuel).forEach(([ft,v])=>{ csv += `${ft},${v.liters},${v.revenue},${v.shifts}\n`; });
  csv += `\nBy Employee\nEmployee,Shifts,Liters,Revenue,ToCollect,ToReturn\n`;
  Object.values(report.byEmployee).forEach(emp=>{ csv += `${emp.employeeName},${emp.shifts},${emp.liters},${emp.revenue},${emp.toCollect},${emp.toReturn}\n`; });
  csv += `\nShifts\nEmployee,Start,End,Status,Liters,Revenue,Variance,Collected\n`;
  report.shifts.forEach(s=>{ csv += `${s.employeeName},${s.startTime},${s.endTime||''},${s.status},${s.totals?.totalLiters||0},${s.totals?.totalRevenue||0},${s.totals?.variance||0},${s.settlement?.collectedAmount||0}\n`; });
  const blob = new Blob([csv], { type:'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=`${name}.csv`; a.click(); URL.revokeObjectURL(url);
}

export async function auditView({ root }) {
  root.innerHTML = `<div class="container"><h1 class="page-title">Removed</h1><p class="page-sub">Audit log removed. Only owner can destroy data.</p><button class="neu-btn neu-btn--primary" style="margin-top:12px;min-height:44px;border-radius:12px" onclick="location.hash='#/reports'">Back to Reports</button></div>`;
}
