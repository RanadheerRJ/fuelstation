import { getState } from '../state.js';
import { getStationsForCurrentUser } from '../services/stations.js';
import { getReportForRange } from '../services/reports.js';
import { getShifts } from '../services/shifts.js';
import { formatCurrency, formatLiters, formatDate } from '../services/calc.js';
import { getEmployees } from '../services/users.js';
// Collections removed - no jackpot

export async function reportsView({ root, query }) {
  const { user, currentStationId } = getState();
  const stations = await getStationsForCurrentUser();
  const stationId = currentStationId || stations[0]?.id;
  if (!stationId) { root.innerHTML=`<div class="container"><div class="neu-card empty"><p>No station</p></div></div>`; return; }

  const isOwner = ['owner','admin','super_admin'].includes(user.role);
  const isManager = user.role === 'manager';
  const isAttendant = user.role === 'attendant';
  const canSeeAll = isOwner || isManager;

  const today = new Date();
  const todayStr = today.toISOString().slice(0,10);
  const yesterday = new Date(); yesterday.setDate(today.getDate()-1);
  const yesterdayStr = yesterday.toISOString().slice(0,10);
  const weekStart = new Date(); weekStart.setDate(today.getDate()-6);
  const weekStr = weekStart.toISOString().slice(0,10);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0,10);
  const last30 = new Date(); last30.setDate(today.getDate()-29);
  const last30Str = last30.toISOString().slice(0,10);
  const allTime = '2024-01-01';

  let fromDate = query.from || weekStr;
  let toDate = query.to || todayStr;
  let employeeFilter = query.emp || 'all';
  let statusFilter = query.status || 'ALL';

  if (isAttendant) employeeFilter = user.uid;

  const allShiftsRaw = await getShifts(stationId);
  const myShiftsRaw = allShiftsRaw.filter(s=>s.userId===user.uid);

  let employeesList = [];
  try {
    employeesList = await getEmployees(stationId);
    if (employeesList.length===0) {
      const uniq = {};
      allShiftsRaw.forEach(s=>{ uniq[s.userId]=s.employeeName; });
      employeesList = Object.entries(uniq).map(([uid, name])=>({ uid, id: uid, name, role: 'attendant' }));
    }
  } catch { employeesList = []; }

  const report = await getReportForRange(stationId, fromDate, toDate, {
    employeeId: employeeFilter,
    status: statusFilter,
  });

  const fmt = (v) => formatCurrency(v);
  const fmtLit = (v) => formatLiters(v);
  const fmtNum = (v) => Number(v||0).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 });

  const rangeLabel = fromDate===todayStr && toDate===todayStr ? 'Today' :
                     fromDate===yesterdayStr && toDate===yesterdayStr ? 'Yesterday' :
                     fromDate===weekStr && toDate===todayStr ? 'Last 7 Days' :
                     fromDate===monthStart && toDate===todayStr ? 'This Month' :
                     fromDate===last30Str && toDate===todayStr ? 'Last 30 Days' :
                     fromDate===allTime ? 'All Time' : `${fromDate} → ${toDate}`;

  const avgLitPerShift = report.count ? (report.totalLiters / report.count) : 0;
  const avgNetPerShift = report.count ? (report.totalNet / report.count) : 0;

  // Clean banking UI
  root.innerHTML = `
    <div class="container" style="max-width:520px;margin:0 auto;padding-bottom:120px">
      <!-- Header - Banking style -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div>
          <h1 style="font-size:22px;font-weight:800;letter-spacing:-0.5px">Reports</h1>
          <p style="font-size:12px;color:var(--text-secondary);margin-top:2px">${stations.find(s=>s.id===stationId)?.name} • ${rangeLabel} • ${report.count} shifts</p>
        </div>
        <button class="neu-btn" style="min-height:40px;padding:0 14px;border-radius:12px;font-weight:700;font-size:13px" id="exportBtn">⬇️ Export</button>
      </div>

      <!-- Hero Card - Net is whole amount to owner -->
      <div style="background:linear-gradient(135deg,#1a2535 0%,#2c3e50 100%);border-radius:20px;padding:20px;color:white;position:relative;overflow:hidden">
        <div style="position:absolute;top:-20px;right:-20px;width:120px;height:120px;background:rgba(255,90,31,0.15);border-radius:50%"></div>
        <div style="position:relative;z-index:1">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div>
              <div style="font-size:11px;opacity:0.7;letter-spacing:1px;text-transform:uppercase">Whole Amount to Owner • Net</div>
              <div style="font-size:32px;font-weight:800;margin-top:6px;letter-spacing:-1px">${fmt(report.totalNet)}</div>
              <div style="font-size:11px;opacity:0.6;margin-top:4px">Gross ${fmt(report.totalGross)} - Expenses ${fmt(report.totalExpenses)} = Net</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:11px;opacity:0.7;letter-spacing:1px;text-transform:uppercase">Fuel Sold</div>
              <div style="font-size:20px;font-weight:700;margin-top:4px">${fmtLit(report.totalLiters)}</div>
              <div style="font-size:10px;opacity:0.6;margin-top:2px">${report.count} shifts • Avg ${fmtLit(avgLitPerShift)}/shift</div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:18px">
            <div style="background:rgba(255,255,255,0.08);border-radius:12px;padding:10px;text-align:center">
              <div style="font-size:10px;opacity:0.6">GROSS</div>
              <div style="font-size:13px;font-weight:700;margin-top:2px">${fmt(report.totalGross)}</div>
              <div style="font-size:9px;opacity:0.5;margin-top:2px;background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:6px;display:inline-block">From nozzles</div>
            </div>
            <div style="background:rgba(255,90,31,0.15);border-radius:12px;padding:10px;text-align:center;border:1px solid rgba(255,90,31,0.3)">
              <div style="font-size:10px;opacity:0.8;color:#ff8c61">EXPENSES</div>
              <div style="font-size:13px;font-weight:700;margin-top:2px;color:#ff8c61">- ${fmt(report.totalExpenses)}</div>
              <div style="font-size:9px;opacity:0.6;margin-top:2px">Testing etc - fuel out</div>
            </div>
            <div style="background:rgba(82,196,26,0.15);border-radius:12px;padding:10px;text-align:center;border:1px solid rgba(82,196,26,0.3)">
              <div style="font-size:10px;opacity:0.8;color:#95de64">TO HANDOVER</div>
              <div style="font-size:13px;font-weight:700;margin-top:2px;color:#95de64">${fmt(report.toCollect)}</div>
              <div style="font-size:9px;opacity:0.6;margin-top:2px">${report.pendingCollect>0? fmt(report.pendingCollect)+' pending' : 'All settled'}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick Date Buttons - Banking clean -->
      <div style="margin-top:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <span style="font-size:12px;font-weight:700;letter-spacing:0.5px">📅 DATE RANGE</span>
          <span style="font-size:10px;color:var(--text-tertiary)">${fromDate} → ${toDate}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
          ${[
            {label:'Today', sub: fmtLit(report.totalLiters), from: todayStr, to: todayStr, active: fromDate===todayStr && toDate===todayStr},
            {label:'Yesterday', sub: '1 day', from: yesterdayStr, to: yesterdayStr, active: fromDate===yesterdayStr && toDate===yesterdayStr},
            {label:'7 Days', sub: 'Week', from: weekStr, to: todayStr, active: fromDate===weekStr && toDate===todayStr},
            {label:'This Month', sub: 'Month', from: monthStart, to: todayStr, active: fromDate===monthStart && toDate===todayStr},
            {label:'30 Days', sub: '30 days', from: last30Str, to: todayStr, active: fromDate===last30Str && toDate===todayStr},
            {label:'All Time', sub: `${allShiftsRaw.length} shifts`, from: allTime, to: todayStr, active: fromDate===allTime},
          ].map(b=>`
            <button class="preset-btn" data-from="${b.from}" data-to="${b.to}" style="padding:12px 8px;border-radius:14px;border:1.5px solid ${b.active ? '#1a2535' : 'var(--border)'};background:${b.active ? '#1a2535' : 'white'};color:${b.active ? 'white' : 'var(--text-primary)'};text-align:center;cursor:pointer;transition:all 0.2s">
              <div style="font-weight:700;font-size:13px">${b.label}</div>
              <div style="font-size:10px;opacity:${b.active?0.7:0.5};margin-top:2px">${b.sub}</div>
            </button>
          `).join('')}
        </div>
        <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <input type="date" id="fromDate" value="${fromDate}" style="min-height:44px;border-radius:10px;border:1.5px solid var(--border);padding:0 12px;font-size:13px;width:100%">
          <input type="date" id="toDate" value="${toDate}" style="min-height:44px;border-radius:10px;border:1.5px solid var(--border);padding:0 12px;font-size:13px;width:100%">
        </div>
      </div>

      <!-- Liters Filter - Think big -->
      <div style="margin-top:16px;background:white;border-radius:16px;padding:14px;border:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:12px;font-weight:700">⛽ LITERS FILTER</span>
          <span style="font-size:11px;background:#f6ffed;color:#389e0d;padding:4px 10px;border-radius:20px;font-weight:600">${fmtLit(report.totalLiters)} total • ${fmtNum(avgLitPerShift)} avg/shift</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">
          <div style="background:#f8f9fa;border-radius:12px;padding:10px;text-align:center">
            <div style="font-size:10px;color:var(--text-secondary)">TODAY LITERS</div>
            <div style="font-weight:800;font-size:14px;margin-top:2px">${fmtLit(Object.values(report.byDate).find(d=>d.date===todayStr)?.liters||0)}</div>
          </div>
          <div style="background:#f8f9fa;border-radius:12px;padding:10px;text-align:center">
            <div style="font-size:10px;color:var(--text-secondary)">THIS MONTH</div>
            <div style="font-weight:800;font-size:14px;margin-top:2px">${fmtLit(Object.values(report.byDate).filter(d=>d.date>=monthStart).reduce((a,b)=>a+b.liters,0))}</div>
          </div>
        </div>
        <div style="margin-top:10px;padding:8px;background:#e6f4ff;border-radius:10px;border:1px solid #91caff;font-size:11px;color:#0958d9">
          💡 <b>Liters = fuel that came out of nozzle.</b> Gross liters includes testing. Net revenue = Gross - Expenses = whole amount to owner. Filter by date to see liters per day/month/overall.
        </div>
      </div>

      ${canSeeAll ? `
      <!-- Employee Filter - Clean chips -->
      <div style="margin-top:16px;background:white;border-radius:16px;padding:14px;border:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:12px;font-weight:700">👥 EMPLOYEE • Tap to filter</span>
          <button id="clearEmp" style="font-size:11px;background:var(--bg);border:1px solid var(--border);padding:4px 10px;border-radius:20px;cursor:pointer">Clear</button>
        </div>
        <div style="display:flex;gap:8px;overflow:auto;margin-top:10px;padding-bottom:4px;flex-wrap:wrap">
          <button class="emp-chip" data-emp="all" style="min-height:40px;padding:0 14px;border-radius:20px;border:1.5px solid ${employeeFilter==='all' ? '#1a2535' : 'var(--border)'};background:${employeeFilter==='all' ? '#1a2535' : 'white'};color:${employeeFilter==='all' ? 'white' : 'var(--text-primary)'};font-size:12px;font-weight:600;white-space:nowrap;cursor:pointer">All (${employeesList.length})</button>
          ${employeesList.map(emp=>{
            const isActive = employeeFilter===(emp.uid||emp.id);
            const empData = report.byEmployee[emp.uid||emp.id];
            return `<button class="emp-chip" data-emp="${emp.uid||emp.id}" style="min-height:40px;padding:0 14px;border-radius:20px;border:1.5px solid ${isActive ? '#ff5a1f' : 'var(--border)'};background:${isActive ? '#fff7e6' : 'white'};color:${isActive ? '#d4380d' : 'var(--text-primary)'};font-size:12px;font-weight:600;white-space:nowrap;cursor:pointer;display:flex;align-items:center;gap:6px">
              <span style="width:20px;height:20px;border-radius:50%;background:${isActive ? '#ff5a1f' : '#f0f0f0'};color:${isActive ? 'white' : '#666'};display:grid;place-items:center;font-size:10px;font-weight:800">${(emp.name||'U')[0]}</span>
              ${emp.name||emp.phone} ${empData ? `• ${fmtLit(empData.liters)}` : ''}
            </button>`;
          }).join('')}
        </div>
        ${employeeFilter!=='all' ? `<div style="margin-top:8px;padding:8px;background:#fff7e6;border-radius:8px;font-size:11px;color:#d4380d;border:1px solid #ffd591">Filtered: <b>${employeesList.find(e=>(e.uid||e.id)===employeeFilter)?.name || employeeFilter}</b> • ${report.count} shifts • ${fmtLit(report.totalLiters)} • ${fmt(report.totalNet)} net</div>` : ''}
      </div>
      ` : ''}

      <!-- Status - Minimal -->
      <div style="margin-top:12px;display:flex;gap:8px;overflow:auto;padding-bottom:4px">
        ${[
          {id:'ALL', label:'All', count: allShiftsRaw.filter(s=>{const d=new Date(s.startTime).toISOString().slice(0,10); return d>=fromDate && d<=toDate;}).length},
          {id:'APPROVED', label:'Approved', count: report.shifts.filter(s=>s.status==='APPROVED').length},
          {id:'PENDING_REVIEW', label:'Pending', count: report.shifts.filter(s=>s.status==='PENDING_REVIEW').length},
          {id:'REJECTED', label:'Rejected', count: report.shifts.filter(s=>s.status==='REJECTED').length},
          {id:'ACTIVE', label:'Active', count: report.shifts.filter(s=>s.status==='ACTIVE').length},
        ].map(st=>`
          <button class="status-chip" data-status="${st.id}" style="min-height:36px;padding:0 14px;border-radius:20px;border:1.5px solid ${statusFilter===st.id ? '#1a2535' : 'var(--border)'};background:${statusFilter===st.id ? '#1a2535' : 'white'};color:${statusFilter===st.id ? 'white' : 'var(--text-secondary)'};font-size:12px;font-weight:600;white-space:nowrap;cursor:pointer">${st.label} ${st.count>0?`(${st.count})`:''}</button>
        `).join('')}
      </div>

      <!-- Apply Button - Banking -->
      <button id="applyFilter" style="margin-top:14px;width:100%;min-height:52px;border-radius:14px;background:#1a2535;color:white;border:none;font-weight:800;font-size:15px;cursor:pointer;letter-spacing:0.3px">Apply Filters • ${report.count} shifts • ${fmtLit(report.totalLiters)}</button>

      <!-- Summary Grid - Banking cards -->
      <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div style="background:white;border-radius:16px;padding:14px;border:1px solid var(--border)">
          <div style="font-size:10px;color:var(--text-secondary);letter-spacing:0.5px">GROSS SALES</div>
          <div style="font-weight:800;font-size:16px;margin-top:4px">${fmt(report.totalGross)}</div>
          <div style="font-size:10px;color:var(--text-tertiary);margin-top:2px">${fmtLit(report.totalLiters)} • ${report.count} shifts</div>
        </div>
        <div style="background:white;border-radius:16px;padding:14px;border:1px solid #ffd591">
          <div style="font-size:10px;color:#d4380d;letter-spacing:0.5px">LESS EXPENSES</div>
          <div style="font-weight:800;font-size:16px;margin-top:4px;color:#d4380d">- ${fmt(report.totalExpenses)}</div>
          <div style="font-size:10px;color:var(--text-tertiary);margin-top:2px">Fuel out but not sale</div>
        </div>
        <div style="background:#f6ffed;border-radius:16px;padding:14px;border:1px solid #b7eb8f">
          <div style="font-size:10px;color:#389e0d;letter-spacing:0.5px">NET • TO OWNER</div>
          <div style="font-weight:800;font-size:16px;margin-top:4px;color:#389e0d">${fmt(report.totalNet)}</div>
          <div style="font-size:10px;color:var(--text-tertiary);margin-top:2px">Whole amount • ${fmtNum(avgNetPerShift)}/shift avg</div>
        </div>
        <div style="background:white;border-radius:16px;padding:14px;border:1px solid var(--border)">
          <div style="font-size:10px;color:var(--text-secondary);letter-spacing:0.5px">PAYMENTS + CREDITS</div>
          <div style="font-weight:800;font-size:16px;margin-top:4px">${fmt(report.totalPayments)}</div>
          <div style="font-size:10px;color:var(--text-tertiary);margin-top:2px">UPI/Cash/Card • Credit ${fmt(report.totalCredits)}</div>
        </div>
      </div>

      <!-- By Fuel - Clean -->
      <div style="margin-top:16px;background:white;border-radius:16px;padding:16px;border:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:13px;font-weight:800">⛽ By Fuel • ${Object.keys(report.byFuel).length} types</span>
          <span style="font-size:11px;background:var(--bg);padding:4px 10px;border-radius:20px">${fmtLit(report.totalLiters)} total</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">
          ${Object.entries(report.byFuel).sort((a,b)=>b[1].net-a[1].net).map(([ft,v])=>`
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:#f8f9fa;border-radius:12px">
              <div style="display:flex;align-items:center;gap:10px">
                <div style="width:36px;height:36px;border-radius:10px;background:${ft.toLowerCase().includes('petrol') ? '#fff7e6' : ft.toLowerCase().includes('diesel') ? '#e6f4ff' : '#f6ffed'};border:1px solid ${ft.toLowerCase().includes('petrol') ? '#ffd591' : ft.toLowerCase().includes('diesel') ? '#91caff' : '#b7eb8f'};display:grid;place-items:center;font-size:14px">${ft.toLowerCase().includes('petrol') ? '🟠' : ft.toLowerCase().includes('diesel') ? '🔵' : '⛽'}</div>
                <div>
                  <div style="font-weight:700;font-size:13px">${ft}</div>
                  <div style="font-size:11px;color:var(--text-secondary)">${v.shifts} shifts • ${fmtLit(v.liters)} • Avg ${fmtLit(v.liters/v.shifts)}/shift</div>
                </div>
              </div>
              <div style="text-align:right">
                <div style="font-weight:700;font-size:13px">${fmt(v.net)}</div>
                <div style="font-size:10px;color:var(--text-tertiary)">Gross ${fmt(v.gross)} • Net after expenses</div>
              </div>
            </div>
          `).join('') || `<p style="font-size:12px;color:var(--text-secondary)">No fuel data</p>`}
        </div>
      </div>

      ${canSeeAll ? `
      <!-- By Employee - Clean ranking -->
      <div style="margin-top:16px;background:white;border-radius:16px;padding:16px;border:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:13px;font-weight:800">🏆 By Employee • Liters ranking</span>
          <span style="font-size:11px;background:var(--bg);padding:4px 10px;border-radius:20px">${Object.keys(report.byEmployee).length} staff</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">
          ${Object.values(report.byEmployee).sort((a,b)=>b.liters-a.liters).map((emp,idx)=>`
            <div class="emp-row" data-emp="${emp.userId}" style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:${idx===0 ? '#fff7e6' : '#f8f9fa'};border-radius:12px;border:1px solid ${idx===0 ? '#ffd591' : 'transparent'};cursor:pointer">
              <div style="display:flex;align-items:center;gap:10px">
                <div style="width:32px;height:32px;border-radius:50%;background:${idx===0 ? '#ff5a1f' : idx===1 ? '#8c8c8c' : idx===2 ? '#d48806' : '#1a2535'};color:white;display:grid;place-items:center;font-weight:800;font-size:11px">${idx+1}</div>
                <div style="width:36px;height:36px;border-radius:50%;background:#1a2535;color:white;display:grid;place-items:center;font-weight:700;font-size:12px">${emp.employeeName.split(' ').map(n=>n[0]).join('').slice(0,2)}</div>
                <div>
                  <div style="font-weight:700;font-size:13px;display:flex;align-items:center;gap:6px">${emp.employeeName} ${idx===0 ? '👑' : ''}</div>
                  <div style="font-size:11px;color:var(--text-secondary)">${emp.shifts} shifts • To Handover ${fmt(emp.toCollect)}</div>
                </div>
              </div>
              <div style="text-align:right">
                <div style="font-weight:800;font-size:13px">${fmtLit(emp.liters)}</div>
                <div style="font-size:11px;color:var(--text-secondary)">${fmt(emp.net)} net • Avg ${fmtLit(emp.liters/emp.shifts)}/shift</div>
              </div>
            </div>
          `).join('') || `<p style="font-size:12px;color:var(--text-secondary)">No employees</p>`}
        </div>
      </div>
      ` : `
      <!-- Attendant own ranking -->
      <div style="margin-top:16px;background:white;border-radius:16px;padding:16px;border:1px solid var(--border)">
        <div style="font-size:13px;font-weight:800">📊 My Performance • ${rangeLabel}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">
          <div style="background:#f6ffed;border-radius:12px;padding:12px;text-align:center;border:1px solid #b7eb8f">
            <div style="font-size:10px;color:var(--text-secondary)">MY LITERS</div>
            <div style="font-weight:800;font-size:18px;margin-top:4px;color:#389e0d">${fmtLit(report.totalLiters)}</div>
            <div style="font-size:10px;color:var(--text-tertiary)">Avg ${fmtLit(avgLitPerShift)}/shift</div>
          </div>
          <div style="background:#fff7e6;border-radius:12px;padding:12px;text-align:center;border:1px solid #ffd591">
            <div style="font-size:10px;color:var(--text-secondary)">MY NET SALES</div>
            <div style="font-weight:800;font-size:18px;margin-top:4px">${fmt(report.totalNet)}</div>
            <div style="font-size:10px;color:var(--text-tertiary)">${report.count} shifts</div>
          </div>
        </div>
      </div>
      `}

      <!-- Daily trend - clean -->
      ${Object.keys(report.byDate).length>1 ? `
      <div style="margin-top:16px;background:white;border-radius:16px;padding:16px;border:1px solid var(--border)">
        <div style="font-size:13px;font-weight:800">📈 Daily Trend • ${Object.keys(report.byDate).length} days • Liters & Net</div>
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:12px;max-height:240px;overflow:auto">
          ${Object.values(report.byDate).sort((a,b)=>b.date.localeCompare(a.date)).map(d=>`
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:#f8f9fa;border-radius:10px">
              <div><div style="font-weight:600;font-size:12px">${new Date(d.date).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})} • ${d.date}</div><div style="font-size:10px;color:var(--text-secondary)">${d.shifts} shifts • Gross ${fmt(d.gross)} - Exp ${fmt(d.expenses)} = Net</div></div>
              <div style="text-align:right"><div style="font-weight:700;font-size:12px">${fmtLit(d.liters)} • ${fmt(d.net)}</div><div style="font-size:10px;color:var(--text-tertiary)">Avg ${fmtLit(d.liters/d.shifts)}/shift</div></div>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}

      <!-- Shifts list - banking receipt style -->
      <div style="margin-top:16px;background:white;border-radius:16px;padding:16px;border:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:13px;font-weight:800">🧾 Shifts • ${report.shifts.length} • Tap to view receipt</span>
          <button id="loadMore" style="min-height:32px;padding:0 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-size:11px;font-weight:600;cursor:pointer">Load 50 more</button>
        </div>
        <div id="shiftsList" style="margin-top:12px;display:flex;flex-direction:column;gap:8px;max-height:700px;overflow:auto">
          ${renderShiftsBanking(report.shifts.slice(0,30), report.expenseByShift)}
        </div>
      </div>

      

      <!-- Explain -->
      <div style="margin-top:16px;padding:12px;background:#fffbe6;border-radius:12px;border:1px solid #ffe58f;font-size:11px;line-height:1.5">
        <div style="font-weight:700;color:#d46b08">💡 How calculations work (expenses minus from gross)</div>
        <div style="margin-top:6px;color:var(--text-secondary)">
          • <b>Gross Sales</b> = sum of (closing - opening) × price from nozzles = fuel that came out<br>
          • <b>Expenses (Testing etc)</b> = fuel that came out but not sold, so <b>minus from gross</b><br>
          • <b>Net Sales = Gross - Expenses</b> = <b>whole amount to owner</b> (what owner should get)<br>
          • <b>To Handover = Net - Payments (UPI/Cash/Card)</b> = what attendant must handover<br>
          • <b>Liters</b> = total liters sold (gross liters). Filter by Today/Month/All Time to see liters per day/month/overall.<br>
          • Colors: Gross (gray) - Expenses (orange) = Net (green) • To Handover (red)
        </div>
      </div>
    </div>
  `;

  attachBankingHandlers(root, stationId);
  let visible = 30;
  root.querySelector('#loadMore')?.addEventListener('click', ()=>{
    visible += 50;
    root.querySelector('#shiftsList').innerHTML = renderShiftsBanking(report.shifts.slice(0, visible), report.expenseByShift);
  });
  root.querySelector('#exportBtn').addEventListener('click', ()=> exportCSV(report, `report-${fromDate}-${toDate}-${employeeFilter}`));
}

function attachBankingHandlers(root, stationId) {
  root.querySelectorAll('.preset-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      root.querySelector('#fromDate').value = btn.dataset.from;
      root.querySelector('#toDate').value = btn.dataset.to;
      // visual active
      root.querySelectorAll('.preset-btn').forEach(b=>{
        b.style.background='white';
        b.style.color='var(--text-primary)';
        b.style.borderColor='var(--border)';
      });
      btn.style.background='#1a2535';
      btn.style.color='white';
      btn.style.borderColor='#1a2535';
    });
  });
  root.querySelectorAll('.emp-chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      root.querySelectorAll('.emp-chip').forEach(c=>{
        c.style.background='white';
        c.style.borderColor='var(--border)';
        c.style.color='var(--text-primary)';
      });
      chip.style.background='#fff7e6';
      chip.style.borderColor='#ff5a1f';
      chip.style.color='#d4380d';
      // auto apply
      const from = root.querySelector('#fromDate').value;
      const to = root.querySelector('#toDate').value;
      const status = root.querySelector('.status-chip[data-status].active')?.dataset.status || document.querySelector('.status-chip[style*=\"#1a2535\"]')?.dataset.status || 'ALL';
      const emp = chip.dataset.emp;
      // find active status
      let activeStatus = 'ALL';
      root.querySelectorAll('.status-chip').forEach(s=>{
        if (s.style.background.includes('1a2535') || s.style.background.includes('rgb(26, 37, 53)')) activeStatus = s.dataset.status;
      });
      location.hash = `#/reports?from=${from}&to=${to}&emp=${emp}&status=${activeStatus}`;
    });
  });
  root.querySelectorAll('.status-chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      root.querySelectorAll('.status-chip').forEach(c=>{
        c.style.background='white';
        c.style.color='var(--text-secondary)';
        c.style.borderColor='var(--border)';
      });
      chip.style.background='#1a2535';
      chip.style.color='white';
      chip.style.borderColor='#1a2535';
    });
  });
  root.querySelectorAll('.emp-row').forEach(row=>{
    row.addEventListener('click', ()=>{
      const from = root.querySelector('#fromDate').value;
      const to = root.querySelector('#toDate').value;
      const emp = row.dataset.emp;
      location.hash = `#/reports?from=${from}&to=${to}&emp=${emp}&status=ALL`;
    });
  });
  root.querySelector('#clearEmp')?.addEventListener('click', ()=>{
    const from = root.querySelector('#fromDate').value;
    const to = root.querySelector('#toDate').value;
    let activeStatus = 'ALL';
    root.querySelectorAll('.status-chip').forEach(s=>{
      if (s.style.background.includes('1a2535')) activeStatus = s.dataset.status;
    });
    location.hash = `#/reports?from=${from}&to=${to}&emp=all&status=${activeStatus}`;
  });
  root.querySelector('#applyFilter')?.addEventListener('click', ()=>{
    const from = root.querySelector('#fromDate').value;
    const to = root.querySelector('#toDate').value;
    let emp = 'all';
    let status = 'ALL';
    root.querySelectorAll('.emp-chip').forEach(c=>{
      if (c.style.background.includes('#fff7e6') || c.style.background.includes('rgb(26, 37, 53)')) emp = c.dataset.emp;
    });
    // fallback check for all
    const allActive = root.querySelector('.emp-chip[data-emp="all"]');
    if (allActive && allActive.style.background.includes('#1a2535')) emp='all';

    root.querySelectorAll('.status-chip').forEach(c=>{
      if (c.style.background.includes('#1a2535') || c.style.background.includes('rgb(26, 37, 53)')) status = c.dataset.status;
    });
    if (!from || !to) return alert('Select dates');
    if (new Date(from) > new Date(to)) return alert('From date cannot be after To date');
    location.hash = `#/reports?from=${from}&to=${to}&emp=${emp}&status=${status}`;
  });
}

function renderShiftsBanking(shifts, expenseByShift) {
  const fmt = (v) => formatCurrency(v);
  const fmtLit = (v) => formatLiters(v);
  if (!shifts.length) return `<p style="font-size:12px;color:var(--text-secondary);padding:20px;text-align:center">No shifts in this range • Try different date</p>`;
  return shifts.map(s=>{
    const gross = Number(s.totals?.totalRevenue||0);
    const exp = Number((expenseByShift||{})[s.id]||0);
    const net = Math.round((gross - exp)*100)/100;
    const liters = Number(s.totals?.totalLiters||0);
    const payments = Number(s.totals?.totalPayments||0);
    const toHandoverVal = Math.round((net - payments)*100)/100;
    const statusColor = s.status==='APPROVED' ? '#52c41a' : s.status==='PENDING_REVIEW' ? '#faad14' : s.status==='REJECTED' ? '#ff4d4f' : '#1890ff';
    return `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:#f8f9fa;border-radius:12px;cursor:pointer;border-left:3px solid ${statusColor}" onclick="location.hash='#/shifts/${s.id}'">
      <div>
        <div style="font-weight:700;font-size:13px;display:flex;align-items:center;gap:6px">${s.employeeName} <span style="width:8px;height:8px;border-radius:50%;background:${statusColor};display:inline-block"></span> <span style="font-size:10px;background:white;padding:2px 6px;border-radius:10px;border:0.5px solid ${statusColor};color:${statusColor}">${s.status}</span></div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">${new Date(s.startTime).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})} ${new Date(s.startTime).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} • ${fmtLit(liters)} • Gross ${fmt(gross)} ${exp>0?`- Exp ${fmt(exp)} = Net ${fmt(net)}`:''}</div>
      </div>
      <div style="text-align:right">
        <div style="font-weight:700;font-size:13px">${fmt(net)}</div>
        <div style="font-size:10px;color:${toHandoverVal>0.5?'#cf1322':'#389e0d'}">${toHandoverVal>0.5 ? 'To Handover '+fmt(toHandoverVal) : toHandoverVal<-0.5 ? 'To Return '+fmt(Math.abs(toHandoverVal)) : 'Balanced'}</div>
      </div>
    </div>
  `}).join('');
}

function exportCSV(report, name) {
  let csv = `FuelOps Banking Report,${report.fromDate} to ${report.toDate},${report.count} shifts\n`;
  csv += `Total Gross,${report.totalGross}\nTotal Expenses (fuel out but not sale),${report.totalExpenses}\nTotal Net (whole amount to owner),${report.totalNet}\nTotal Liters,${report.totalLiters}\nTotal Payments,${report.totalPayments}\nTo Handover (Net - Payments),${report.toCollect}\nCollected,${report.collected}\nPending Collect,${report.pendingCollect}\n\n`;
  csv += `By Fuel\nFuel, Liters, Gross, Net, Shifts\n`;
  Object.entries(report.byFuel).forEach(([ft,v])=>{ csv += `${ft},${v.liters},${v.gross},${v.net},${v.shifts}\n`; });
  csv += `\nBy Employee - Liters Ranking\nEmployee,Shifts,Liters,Gross,Expenses,Net,ToHandover\n`;
  Object.values(report.byEmployee).sort((a,b)=>b.liters-a.liters).forEach(emp=>{ csv += `${emp.employeeName},${emp.shifts},${emp.liters},${emp.gross},${emp.expenses},${emp.net},${emp.toCollect}\n`; });
  csv += `\nDaily\nDate,Shifts,Liters,Gross,Expenses,Net\n`;
  Object.values(report.byDate).sort((a,b)=>b.date.localeCompare(a.date)).forEach(d=>{ csv += `${d.date},${d.shifts},${d.liters},${d.gross},${d.expenses},${d.net}\n`; });
  csv += `\nShifts - Net = Gross - Expenses = whole amount to owner\nEmployee,Start,End,Status,Liters,Gross,Expenses,Net,Payments,ToHandover\n`;
  report.shifts.forEach(s=>{
    const exp = report.expenseByShift[s.id]||0;
    const gross = s.totals?.totalRevenue||0;
    const net = gross - exp;
    const toHandover = net - (s.totals?.totalPayments||0);
    csv += `${s.employeeName},${s.startTime},${s.endTime||''},${s.status},${s.totals?.totalLiters||0},${gross},${exp},${net},${s.totals?.totalPayments||0},${toHandover}\n`;
  });
  const blob = new Blob([csv], { type:'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=`${name}.csv`; a.click(); URL.revokeObjectURL(url);
}

export async function auditView({ root }) {
  root.innerHTML = `<div class="container"><h1 class="page-title">Removed</h1><p class="page-sub">Audit log removed. Only owner can destroy data.</p><button class="neu-btn neu-btn--primary" style="margin-top:12px;min-height:44px;border-radius:12px" onclick="location.hash='#/reports'">Back to Reports</button></div>`;
}
