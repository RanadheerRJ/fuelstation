import { getState, setState } from '../state.js';
import { getStationsForCurrentUser } from '../services/stations.js';
import { getShifts, getActiveShiftForUser } from '../services/shifts.js';
import { getNozzles, getPumps } from '../services/pumps.js';
import { getActivePrices } from '../services/prices.js';
import { getAuditLogs } from '../services/reports.js';
import { formatCurrency, formatLiters, formatDateTime } from '../services/calc.js';

export async function dashboardView({ root }) {
  const { user, currentStationId } = getState();
  const stations = await getStationsForCurrentUser();
  if (stations.length === 0) {
    root.innerHTML = `
      <div class="container">
        <h1 class="page-title">Good Morning 👋<br>${user.name || user.phone}</h1>
        <div class="neu-card" style="margin-top:18px">
          <div class="empty">
            <div class="emoji">🏗️</div>
            <h3>No Stations Yet</h3>
            <p style="font-size:13px;margin-top:6px">Create your first fuel station to get started.</p>
            <button class="neu-btn neu-btn--primary" style="margin-top:14px" onclick="location.hash='#/stations'">Create Station</button>
          </div>
        </div>
      </div>`;
    return;
  }

  let activeStationId = currentStationId || stations[0].id;
  // ensure currentStationId set
  if (!currentStationId) setState({ currentStationId: activeStationId });
  const activeStation = stations.find(s=>s.id===activeStationId) || stations[0];

  // fetch data for active station
  const shifts = await getShifts(activeStation.id);
  const activeShifts = shifts.filter(s=>s.status==='ACTIVE');
  const pendingShifts = shifts.filter(s=>s.status==='PENDING_REVIEW');
  const todayStr = new Date().toISOString().slice(0,10);
  const todayShifts = shifts.filter(s=> new Date(s.startTime).toISOString().slice(0,10)===todayStr);

  let totalSales = 0, totalLiters = 0, variance = 0;
  todayShifts.forEach(s=>{ totalSales += s.totals?.totalRevenue||0; totalLiters += s.totals?.totalLiters||0; variance += s.totals?.variance||0; });

  const myActiveShift = await getActiveShiftForUser(user.uid);

  const auditLogs = await getAuditLogs(activeStation.id, 6);

  root.innerHTML = `
    <div class="container">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <div>
          <h1 class="page-title">Good ${getGreeting()} 👋<br><span style="font-weight:800">${user.name || user.phone}</span></h1>
          <p class="page-sub">${activeStation.name} • ${user.role.toUpperCase()}</p>
        </div>
        <button class="neu-btn neu-btn--small" onclick="location.hash='#/settings'">⚙️</button>
      </div>

      ${stations.length>1 ? `
        <div class="neu-card neu-card--sm" style="margin-top:16px">
          <label class="label">My Stations</label>
          <select id="stationSwitch" class="neu-select">
            ${stations.map(s=>`<option value="${s.id}" ${s.id===activeStation.id?'selected':''}>${s.name} • ${s.status}</option>`).join('')}
          </select>
        </div>` : ''}

      <div class="grid grid-2" style="margin-top:18px">
        <div class="neu-card stat-card">
          <div class="stat-label">Today's Sales</div>
          <div class="stat-value">${formatCurrency(totalSales)}</div>
          <div class="stat-sub">${todayShifts.length} shifts today</div>
        </div>
        <div class="neu-card stat-card">
          <div class="stat-label">Fuel Sold</div>
          <div class="stat-value">${formatLiters(totalLiters)}</div>
          <div class="stat-sub">Across ${Object.keys(aggregateByFuel(todayShifts)).length} fuel types</div>
        </div>
        <div class="neu-card stat-card">
          <div class="stat-label">Active Shifts</div>
          <div class="stat-value">${activeShifts.length}</div>
          <div class="stat-sub">${pendingShifts.length} pending review</div>
        </div>
        <div class="neu-card stat-card" style="${Math.abs(variance)>100?'border:1px solid #f59f0a':''}">
          <div class="stat-label">Variance</div>
          <div class="stat-value" style="color:${variance<-0.5?'var(--danger)': variance>0.5?'var(--success)':'inherit'}">${formatCurrency(variance)} ${Math.abs(variance)>1?'⚠️':''}</div>
          <div class="stat-sub">${variance<-0.5?'Short': variance>0.5?'Excess':'Balanced'}</div>
        </div>
      </div>

      ${myActiveShift ? `
        <div class="neu-card" style="margin-top:16px;border:1px solid var(--primary);">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div><div class="badge badge--info">ACTIVE SHIFT</div><h3 style="margin-top:8px">${myActiveShift.employeeName} • ${new Date(myActiveShift.startTime).toLocaleTimeString()}</h3><p style="font-size:12px;color:var(--text-muted)">${myActiveShift.nozzles?.length||0} nozzles assigned</p></div>
            <button class="neu-btn neu-btn--primary neu-btn--small" onclick="location.hash='#/shifts/${myActiveShift.id}'">Open</button>
          </div>
        </div>
      ` : `
        <div class="neu-card" style="margin-top:16px;text-align:center">
          <p style="font-size:14px;font-weight:700">No active shift</p>
          <p style="font-size:12px;color:var(--text-muted);margin-top:4px">Start a new shift to begin operations</p>
          <button class="neu-btn neu-btn--primary" style="margin-top:12px" onclick="location.hash='#/shifts/start'">Start Shift</button>
        </div>
      `}

      ${pendingShifts.length>0 && ['owner','manager','admin'].includes(user.role) ? `
        <div class="neu-card" style="margin-top:16px">
          <h3 style="font-size:14px;font-weight:800">⚠️ Needs Attention</h3>
          <div class="list" style="margin-top:12px">
            ${pendingShifts.slice(0,4).map(s=>`
              <div class="list-item">
                <div><div style="font-weight:700;font-size:13px">${s.employeeName} • ${formatCurrency(s.totals?.totalRevenue||0)}</div><div style="font-size:11px;color:var(--text-muted)">Variance ${formatCurrency(s.totals?.variance||0)} • ${new Date(s.startTime).toLocaleTimeString()}</div></div>
                <button class="neu-btn neu-btn--small" onclick="location.hash='#/shifts/${s.id}'">Review</button>
              </div>
            `).join('')}
          </div>
        </div>
      `:''}

      <div class="neu-card" style="margin-top:16px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h3 style="font-size:14px;font-weight:800">Recent Activity</h3>
          <button class="neu-btn neu-btn--small" onclick="location.hash='#/reports/audit'">View All</button>
        </div>
        <div class="list" style="margin-top:12px">
          ${auditLogs.length ? auditLogs.map(l=>`
            <div class="list-item">
              <div style="display:flex;gap:10px;align-items:center">
                <div class="avatar" style="width:32px;height:32px;font-size:12px">${(l.action||'?')[0]}</div>
                <div><div style="font-size:12px;font-weight:700">${l.action.replaceAll('_',' ')}</div><div style="font-size:11px;color:var(--text-muted)">${l.metadata? JSON.stringify(l.metadata).slice(0,50):''} • ${formatDateTime(l.timestamp)}</div></div>
              </div>
            </div>
          `).join('') : `<p style="font-size:12px;color:var(--text-muted)">No activity yet</p>`}
        </div>
      </div>

      <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">
        <button class="neu-btn neu-btn--small" onclick="location.hash='#/stations'">⛽ Stations</button>
        <button class="neu-btn neu-btn--small" onclick="location.hash='#/pumps'">🔧 Pumps</button>
        <button class="neu-btn neu-btn--small" onclick="location.hash='#/employees'">👥 Employees</button>
        <button class="neu-btn neu-btn--small" onclick="location.hash='#/prices'">💰 Prices</button>
        <button class="neu-btn neu-btn--small" onclick="location.hash='#/reports'">📊 Reports</button>
      </div>
    </div>
  `;

  const switchEl = root.querySelector('#stationSwitch');
  if (switchEl) {
    switchEl.addEventListener('change', e=>{
      setState({ currentStationId: e.target.value });
      dashboardView({ root });
    });
  }
}

function getGreeting(){
  const h = new Date().getHours();
  if (h<12) return 'Morning';
  if (h<17) return 'Afternoon';
  return 'Evening';
}
function aggregateByFuel(shifts){
  const map={};
  shifts.forEach(s=>{
    if (s.totals?.byFuel) Object.keys(s.totals.byFuel).forEach(ft=>map[ft]=true);
  });
  return map;
}
