import { getState } from '../state.js';
import { getStationsForCurrentUser } from '../services/stations.js';
import { getDailyReport } from '../services/reports.js';
import { getShifts } from '../services/shifts.js';
import { getTransactions } from '../services/transactions.js';
import { formatCurrency, formatLiters, formatDate } from '../services/calc.js';

export async function reportsView({ root }) {
  const { user, currentStationId } = getState();
  const stations = await getStationsForCurrentUser();
  const stationId = currentStationId || stations[0]?.id;
  if (!stationId) { root.innerHTML=`<div class="container"><div class="neu-card empty"><p>No station</p></div></div>`; return; }

  const isOwner = user.role === 'owner';
  const isManager = user.role === 'manager';
  const isAdmin = user.role === 'admin';
  const isAttendant = user.role === 'attendant';
  const isManagerOrAbove = ['owner','admin','manager'].includes(user.role);

  const todayStr = new Date().toISOString().slice(0,10);
  const report = await getDailyReport(stationId, todayStr);
  const allShifts = await getShifts(stationId);
  const myShifts = allShifts.filter(s=>s.userId===user.uid);
  
  // Role-based: attendant only sees own shifts, no total balances
  const shiftsToShow = isAttendant ? myShifts : allShifts;
  const reportToShow = isAttendant ? await getDailyReportForUser(stationId, todayStr, user.uid) : report;
  const credits = await getTransactions(stationId, { type: 'credit' });
  const myCredits = credits.filter(c=> myShifts.some(s=>s.id===c.shiftId));

  if (isAttendant) {
    root.innerHTML = `
      <div class="container" style="max-width:480px;margin:0 auto">
        <h1 class="page-title" style="font-size:20px">My Reports</h1>
        <p class="page-sub" style="margin-top:4px">${stations.find(s=>s.id===stationId)?.name} • Attendant • My Performance Only</p>
        
        <div class="neu-card" style="margin-top:16px;padding:16px;border-radius:14px;background:linear-gradient(135deg,#f6ffed 0%,#ffffff 100%);border:1px solid #b7eb8f">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h3 style="font-weight:700;font-size:14px">My Performance • ${todayStr}</h3>
            <input type="date" id="datePick" class="neu-input" style="width:auto;padding:6px 10px;border-radius:8px;font-size:12px" value="${todayStr}">
          </div>
          <div class="grid grid-2" style="margin-top:14px;gap:12px">
            <div style="padding:12px;background:white;border-radius:10px;text-align:center"><div style="font-size:11px;color:var(--text-secondary)">My Sales Today</div><div style="font-weight:800;font-size:18px;margin-top:4px">${formatCurrency(reportToShow.totalRevenue)}</div><div style="font-size:10px;color:var(--text-tertiary)">${reportToShow.shifts.length} shift(s)</div></div>
            <div style="padding:12px;background:white;border-radius:10px;text-align:center"><div style="font-size:11px;color:var(--text-secondary)">My Fuel Sold</div><div style="font-weight:800;font-size:18px;margin-top:4px">${formatLiters(reportToShow.totalLiters)}</div><div style="font-size:10px;color:var(--text-tertiary)">My nozzles</div></div>
          </div>
          ${Math.abs(reportToShow.variance)>0.5 ? `
            <div style="margin-top:12px;padding:12px;background:${reportToShow.variance<0?'#fff1f0':'#f6ffed'};border-radius:10px;border:1px solid ${reportToShow.variance<0?'#ffa39e':'#b7eb8f'}">
              <div style="font-size:11px;font-weight:600;color:${reportToShow.variance<0?'#cf1322':'#389e0d'}">${reportToShow.variance<0 ? '💸 To Handover to Owner' : '💰 Excess with You'}</div>
              <div style="font-weight:800;font-size:16px;color:${reportToShow.variance<0?'#cf1322':'#389e0d'};margin-top:4px">${formatCurrency(Math.abs(reportToShow.variance))}</div>
              <div style="font-size:10px;color:var(--text-secondary);margin-top:2px">${reportToShow.variance<0 ? 'Owner will collect after approval' : 'To be adjusted'}</div>
            </div>
          ` : `<div style="margin-top:12px;padding:10px;background:#f0f0f0;border-radius:8px;text-align:center;font-size:12px;color:var(--text-secondary)">✅ Balanced • All settled</div>`}
        </div>

        <div class="neu-card" style="margin-top:16px;padding:16px;border-radius:14px">
          <h3 style="font-weight:700;font-size:14px">My Recent Shifts • ${myShifts.length}</h3>
          <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
            ${myShifts.slice(0,10).map(s=>`
              <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg);border-radius:10px;cursor:pointer" onclick="location.hash='#/shifts/${s.id}'">
                <div><div style="font-weight:600;font-size:13px">${new Date(s.startTime).toLocaleDateString()} • ${formatCurrency(s.totals?.totalRevenue||0)}</div><div style="font-size:11px;color:var(--text-secondary)">${formatLiters(s.totals?.totalLiters||0)} • ${s.status}</div></div>
                <span class="badge ${s.status==='APPROVED'?'badge--success': s.status==='PENDING_REVIEW'?'badge--warning':'badge--danger'}" style="font-size:10px;padding:4px 8px;border-radius:12px">${s.status}</span>
              </div>
            `).join('') || `<p style="font-size:12px;color:var(--text-secondary)">No shifts yet</p>`}
          </div>
        </div>

        <div style="margin-top:14px;padding:12px;background:var(--bg);border-radius:10px;border:0.5px solid var(--border)"><div style="font-size:11px;color:var(--text-secondary);text-align:center">🔒 Attendant view: Only your sales & performance. No station totals, no other staff data. Owner collects money after approval.</div></div>
      </div>
    `;
    root.querySelector('#datePick').addEventListener('change', ()=> reportsView({ root }));
    return;
  }

  // Owner/Manager view - full or mostly
  const toCollect = allShifts.filter(s=> (s.totals?.variance||0) < -0.5).reduce((a,s)=>a+Math.abs(s.totals.variance),0);

  root.innerHTML = `
    <div class="container" style="max-width:480px;margin:0 auto">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><h1 class="page-title" style="font-size:20px">${isOwner ? 'Station Reports' : 'Team Reports'}</h1><p class="page-sub" style="margin-top:4px">${stations.find(s=>s.id===stationId)?.name} • ${isOwner ? 'Owner • All Visibility' : 'Manager • Team Performance'}</p></div>
        <button class="neu-btn" style="min-height:40px;padding:0 14px;border-radius:10px;font-weight:600" id="exportShifts">⬇️ CSV</button>
      </div>

      <div class="neu-card" style="margin-top:16px;padding:16px;border-radius:14px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h3 style="font-weight:700;font-size:14px">Daily Report • ${todayStr}</h3>
          <input type="date" id="datePick" class="neu-input" style="width:auto;padding:6px 10px;border-radius:8px;font-size:12px" value="${todayStr}">
        </div>
        <div class="grid grid-2" style="margin-top:14px;gap:12px">
          <div style="padding:14px;background:linear-gradient(135deg,#e6f4ff 0%,#ffffff 100%);border-radius:12px;border:1px solid #91caff;text-align:center"><div style="font-size:11px;color:var(--text-secondary)">${isOwner ? 'Total Revenue' : 'Team Sales'}</div><div style="font-weight:800;font-size:20px;margin-top:4px">${formatCurrency(report.totalRevenue)}</div><div style="font-size:10px;color:var(--text-tertiary);margin-top:2px">${report.shifts.length} shifts today</div></div>
          <div style="padding:14px;background:var(--bg);border-radius:12px;text-align:center"><div style="font-size:11px;color:var(--text-secondary)">Fuel Sold</div><div style="font-weight:800;font-size:20px;margin-top:4px">${formatLiters(report.totalLiters)}</div><div style="font-size:10px;color:var(--text-tertiary);margin-top:2px">${Object.keys(report.byFuel).length} fuel types</div></div>
        </div>
        <div style="margin-top:14px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-secondary);margin-bottom:8px">By Fuel</div>
          <div style="display:flex;flex-direction:column;gap:6px">${Object.entries(report.byFuel).map(([ft, v])=>`<div style="display:flex;justify-content:space-between;font-size:13px;padding:6px 0;border-bottom:1px solid #f0f0f0"><span>${ft}</span><span style="font-weight:600">${formatLiters(v.liters)} • ${formatCurrency(v.revenue)}</span></div>`).join('') || `<p style="font-size:12px;color:var(--text-secondary)">No data</p>`}</div>
        </div>
        <div style="margin-top:14px;background:#f8f9fa;border-radius:10px;padding:12px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-secondary);margin-bottom:8px">Collections</div>
          ${Object.entries(report.paymentsAgg).map(([k,v])=>`<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0"><span style="text-transform:uppercase;color:var(--text-secondary)">${k}</span><span style="font-weight:600">${formatCurrency(v)}</span></div>`).join('')}
          <div style="height:1px;background:#e0e0e0;margin:8px 0"></div>
          <div style="display:flex;justify-content:space-between;font-weight:700;font-size:14px"><span>To Collect from Staff</span><span style="color:${toCollect>0?'#cf1322':'#389e0d'}">${formatCurrency(toCollect)}</span></div>
          <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px">${toCollect>0 ? 'Collect after approving shifts' : 'All settled'}</div>
        </div>
      </div>

      <div class="neu-card" style="margin-top:16px;padding:16px;border-radius:14px">
        <h3 style="font-weight:700;font-size:14px">Shifts • ${shiftsToShow.length} ${isManager ? '(Team)' : ''}</h3>
        <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
          ${shiftsToShow.slice(0,15).map(s=>`
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg);border-radius:10px;cursor:pointer" onclick="location.hash='#/shifts/${s.id}'">
              <div><div style="font-weight:600;font-size:13px">${s.employeeName} • ${formatDate(s.startTime)}</div><div style="font-size:11px;color:var(--text-secondary)">${formatLiters(s.totals?.totalLiters||0)} • ${s.totals?.variance<0 ? 'To Collect '+formatCurrency(Math.abs(s.totals.variance)) : formatCurrency(s.totals?.totalRevenue||0)} • ${s.status}</div></div>
              <span class="badge ${s.status==='APPROVED'?'badge--success': s.status==='PENDING_REVIEW'?'badge--warning':'badge--neutral'}" style="font-size:10px;padding:4px 8px;border-radius:12px">${s.status}</span>
            </div>
          `).join('') || `<p style="font-size:12px;color:var(--text-secondary)">No shifts</p>`}
        </div>
      </div>

      ${isOwner ? `
        <div class="neu-card" style="margin-top:16px;padding:16px;border-radius:14px">
          <h3 style="font-weight:700;font-size:14px">💰 Outstanding Credits • ${formatCurrency(credits.filter(c=>c.status!=='paid').reduce((a,c)=>a+Number(c.amount||0),0))}</h3>
          <div style="margin-top:10px;display:flex;flex-direction:column;gap:6px">${credits.slice(0,10).map(c=>`<div style="display:flex;justify-content:space-between;font-size:12px;padding:6px 0;border-bottom:1px dashed #eee"><span>${c.customer}</span><span style="font-weight:600">${formatCurrency(c.amount)}</span></div>`).join('') || `<p style="font-size:12px;color:var(--text-secondary)">No credits</p>`}</div>
        </div>
      ` : ''}
    </div>
  `;

  root.querySelector('#datePick').addEventListener('change', ()=> reportsView({ root }));
  root.querySelector('#exportShifts').addEventListener('click', ()=>{
    let csv = `Employee,Start,End,Status,TotalLiters,TotalRevenue,ToCollect\n`;
    shiftsToShow.forEach(s=>{ csv += `${s.employeeName},${s.startTime},${s.endTime||''},${s.status},${s.totals?.totalLiters||0},${s.totals?.totalRevenue||0},${s.totals?.variance<0? Math.abs(s.totals.variance):0}\n`; });
    const blob = new Blob([csv], { type:'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`shifts-${todayStr}.csv`; a.click(); URL.revokeObjectURL(url);
  });
}

async function getDailyReportForUser(stationId, dateStr, userId) {
  const { queryDocs } = await import('../services/firestoreService.js');
  let shifts = await queryDocs('shifts', s => s.stationId === stationId && s.userId===userId);
  const dayShifts = shifts.filter(s => new Date(s.startTime).toISOString().slice(0,10)===dateStr);
  let totalLiters = 0, totalRevenue = 0, variance = 0;
  const byFuel = {};
  const paymentsAgg = { cash:0, card:0, upi:0, credit:0, other:0 };
  dayShifts.forEach(sh => {
    const t = sh.totals || {};
    totalLiters += t.totalLiters || 0;
    totalRevenue += t.totalRevenue || 0;
    variance += t.variance || 0;
    if (t.byFuel) Object.entries(t.byFuel).forEach(([ft, vals]) => { if (!byFuel[ft]) byFuel[ft] = { liters:0, revenue:0 }; byFuel[ft].liters += vals.liters || 0; byFuel[ft].revenue += vals.revenue || 0; });
    if (t.payments) Object.keys(paymentsAgg).forEach(k => paymentsAgg[k] += Number(t.payments[k]||0));
  });
  return { date: dateStr, shifts: dayShifts, totalLiters, totalRevenue, variance, byFuel, paymentsAgg };
}

export async function auditView({ root }) {
  root.innerHTML = `<div class="container"><h1 class="page-title">Removed</h1><p class="page-sub">Audit log removed. Only owner can destroy data.</p><button class="neu-btn neu-btn--primary" style="margin-top:12px;min-height:44px;border-radius:12px" onclick="location.hash='#/reports'">Back to Reports</button></div>`;
}
