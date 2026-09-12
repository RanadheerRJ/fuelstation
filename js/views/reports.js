import { getState } from '../state.js';
import { getStationsForCurrentUser } from '../services/stations.js';
import { getDailyReport, getAuditLogs } from '../services/reports.js';
import { getShifts } from '../services/shifts.js';
import { getTransactions } from '../services/transactions.js';
import { formatCurrency, formatLiters, formatDateTime, formatDate } from '../services/calc.js';

export async function reportsView({ root }) {
  const { currentStationId } = getState();
  const stations = await getStationsForCurrentUser();
  const stationId = currentStationId || stations[0]?.id;
  if (!stationId) { root.innerHTML=`<div class="container"><div class="neu-card empty"><p>No station</p></div></div>`; return; }

  const todayStr = new Date().toISOString().slice(0,10);
  const report = await getDailyReport(stationId, todayStr);
  const shifts = await getShifts(stationId);
  const credits = await getTransactions(stationId, { type: 'credit' });
  const auditLogs = await getAuditLogs(stationId, 20);

  root.innerHTML = `
    <div class="container">
      <h1 class="page-title">Reports</h1>
      <p class="page-sub">${stations.find(s=>s.id===stationId)?.name}</p>

      <div class="neu-card" style="margin-top:16px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h3 style="font-weight:800">Daily Report • ${todayStr}</h3>
          <input type="date" id="datePick" class="neu-input" style="width:auto;padding:8px 12px" value="${todayStr}">
        </div>
        <div class="grid grid-2" style="margin-top:12px">
          <div class="neu-card neu-card--sm"><div style="font-size:11px;color:var(--text-muted)">Total Revenue</div><div style="font-weight:800;font-size:18px">${formatCurrency(report.totalRevenue)}</div></div>
          <div class="neu-card neu-card--sm"><div style="font-size:11px;color:var(--text-muted)">Fuel Sold</div><div style="font-weight:800;font-size:18px">${formatLiters(report.totalLiters)}</div></div>
        </div>
        <div style="margin-top:12px">
          <h4 style="font-size:12px;font-weight:800">By Fuel</h4>
          <div class="list" style="margin-top:6px">
            ${Object.entries(report.byFuel).map(([ft, v])=>`<div style="display:flex;justify-content:space-between;font-size:12px"><span>${ft}</span><span>${formatLiters(v.liters)} • ${formatCurrency(v.revenue)}</span></div>`).join('') || `<p style="font-size:11px;color:var(--text-muted)">No data</p>`}
          </div>
        </div>
        <div style="margin-top:12px">
          <h4 style="font-size:12px;font-weight:800">Payments</h4>
          <div style="font-size:12px;margin-top:6px">
            ${Object.entries(report.paymentsAgg).map(([k,v])=>`<div style="display:flex;justify-content:space-between"><span>${k.toUpperCase()}</span><span>${formatCurrency(v)}</span></div>`).join('')}
            <div style="display:flex;justify-content:space-between;font-weight:800;margin-top:6px;border-top:1px dashed #ccc;padding-top:6px"><span>Variance</span><span>${formatCurrency(report.variance)}</span></div>
          </div>
        </div>
      </div>

      <div class="neu-card" style="margin-top:16px">
        <h3 style="font-weight:800;font-size:14px">Credit Report • Outstanding ${formatCurrency(credits.filter(c=>c.status!=='paid').reduce((a,c)=>a+Number(c.amount||0),0))}</h3>
        <div class="table-wrap" style="margin-top:10px">
          <table>
            <thead><tr><th>Customer</th><th>Amount</th><th>Date</th><th>Shift</th></tr></thead>
            <tbody>
              ${credits.slice(0,15).map(c=>`<tr><td>${c.customer}</td><td>${formatCurrency(c.amount)}</td><td>${formatDate(c.createdAt)}</td><td>${(c.shiftId||'').slice(0,6)}</td></tr>`).join('') || `<tr><td colspan="4">No credits</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      <div class="neu-card" style="margin-top:16px">
        <div style="display:flex;justify-content:space-between"><h3 style="font-weight:800;font-size:14px">Shifts • ${shifts.length}</h3><button class="neu-btn neu-btn--small" id="exportShifts">Export CSV</button></div>
        <div class="table-wrap" style="margin-top:10px">
          <table>
            <thead><tr><th>Employee</th><th>Date</th><th>Liters</th><th>Revenue</th><th>Variance</th><th>Status</th></tr></thead>
            <tbody>
              ${shifts.slice(0,20).map(s=>`<tr><td>${s.employeeName}</td><td>${formatDate(s.startTime)}</td><td>${(s.totals?.totalLiters||0).toFixed(1)}</td><td>${formatCurrency(s.totals?.totalRevenue||0)}</td><td>${formatCurrency(s.totals?.variance||0)}</td><td><span class="badge ${s.status==='APPROVED'?'badge--success': s.status==='PENDING_REVIEW'?'badge--warning':'badge--neutral'}">${s.status}</span></td></tr>`).join('') || `<tr><td colspan="6">No shifts</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      <div class="neu-card" style="margin-top:16px">
        <h3 style="font-weight:800;font-size:14px">Audit Log</h3>
        <div class="list" style="margin-top:10px">
          ${auditLogs.map(l=>`<div style="display:flex;gap:10px;font-size:11px;padding:6px 0;border-bottom:1px solid rgba(0,0,0,0.05)"><span style="font-weight:800">${l.action}</span><span style="color:var(--text-muted)">${l.userId?.slice(0,6)} • ${formatDateTime(l.timestamp)}</span><span>${l.metadata? JSON.stringify(l.metadata).slice(0,60):''}</span></div>`).join('') || `<p style="font-size:11px;color:var(--text-muted)">No logs</p>`}
        </div>
        <button class="neu-btn neu-btn--small" style="margin-top:10px" onclick="location.hash='#/reports/audit'">View Full Audit</button>
      </div>
    </div>
  `;

  root.querySelector('#datePick').addEventListener('change', async e=>{
    const date = e.target.value;
    const newReport = await getDailyReport(stationId, date);
    // simple re-render: update numbers? For simplicity reload view
    // replace daily report card
    reportsView({ root });
  });

  root.querySelector('#exportShifts').addEventListener('click', ()=>{
    let csv = `Employee,Start,End,Status,TotalLiters,TotalRevenue,Variance\n`;
    shifts.forEach(s=>{ csv += `${s.employeeName},${s.startTime},${s.endTime||''},${s.status},${s.totals?.totalLiters||0},${s.totals?.totalRevenue||0},${s.totals?.variance||0}\n`; });
    const blob = new Blob([csv], { type:'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`shifts-${todayStr}.csv`; a.click(); URL.revokeObjectURL(url);
  });
}

export async function auditView({ root }) {
  const { currentStationId } = getState();
  const stations = await getStationsForCurrentUser();
  const stationId = currentStationId || stations[0]?.id;
  const logs = await getAuditLogs(stationId, 100);

  root.innerHTML = `
    <div class="container">
      <h1 class="page-title">Audit Log</h1>
      <p class="page-sub">${logs.length} events • ${stations.find(s=>s.id===stationId)?.name||''}</p>
      <div class="neu-card" style="margin-top:16px">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Action</th><th>User</th><th>Station</th><th>Time</th><th>Meta</th></tr></thead>
            <tbody>
              ${logs.map(l=>`<tr><td><span class="badge badge--neutral">${l.action}</span></td><td>${(l.userId||'').slice(0,8)}</td><td>${(l.stationId||'').slice(0,6)}</td><td>${formatDateTime(l.timestamp)}</td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis">${l.metadata? JSON.stringify(l.metadata):''}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}
