import { getState, setState } from '../state.js';
import { getStationsForCurrentUser } from '../services/stations.js';
import { getShifts, getActiveShiftForUser } from '../services/shifts.js';
import { formatCurrency, formatLiters } from '../services/calc.js';
import { getStaffBalances, getHideBalancePref, setHideBalancePref } from '../services/collections.js';

export async function dashboardView({ root }) {
  const { user, currentStationId } = getState();

  if (user.role === 'super_admin') {
    const { getAllStations } = await import('../services/stations.js');
    const { getEmployees } = await import('../services/users.js');
    const stations = await getAllStations();
    const users = await getEmployees();
    const owners = users.filter(u=>u.role==='owner');
    root.innerHTML = `
      <div class="container">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div><h1 class="page-title">Super Admin 🔧<br><span style="font-weight:800">${user.name}</span></h1><p class="page-sub">Developer • Invite Only System</p></div>
          <button class="neu-btn neu-btn--small" onclick="location.hash='#/settings'">⚙️</button>
        </div>
        <div class="grid grid-2" style="margin-top:18px">
          <div class="neu-card stat-card"><div class="stat-label">Total Stations</div><div class="stat-value">${stations.length}</div><div class="stat-sub">${owners.length} owners</div></div>
          <div class="neu-card stat-card"><div class="stat-label">Total Users</div><div class="stat-value">${users.length}</div><div class="stat-sub">Invite only</div></div>
        </div>
        <div class="neu-card" style="margin-top:18px;text-align:center;padding:20px;border-radius:14px">
          <h3 style="font-weight:800">👑 Invite New Owner</h3>
          <p style="font-size:12px;color:var(--text-secondary);margin-top:6px">You as developer invite owners with site name + phone + PIN.</p>
          <button class="neu-btn neu-btn--primary" style="margin-top:14px;min-height:44px;border-radius:12px;padding:0 20px;font-weight:700" onclick="location.hash='#/super-admin'">Go to Invite Panel</button>
        </div>
      </div>
    `;
    return;
  }

  const stations = await getStationsForCurrentUser();
  if (stations.length === 0) {
    root.innerHTML = `
      <div class="container">
        <h1 class="page-title">Good Morning 👋<br>${user.name || user.phone}</h1>
        <div class="neu-card" style="margin-top:18px;padding:20px;border-radius:14px">
          <div style="text-align:center">
            <div style="font-size:32px">🏗️</div>
            <h3 style="margin-top:8px">No Stations Yet</h3>
            <p style="font-size:13px;margin-top:6px;color:var(--text-secondary)">Create your first fuel station to get started.</p>
            <button class="neu-btn neu-btn--primary" style="margin-top:14px;min-height:44px;border-radius:12px;padding:0 20px" onclick="location.hash='#/stations'">Create Station</button>
          </div>
        </div>
      </div>`;
    return;
  }

  let activeStationId = currentStationId || stations[0].id;
  if (!currentStationId) setState({ currentStationId: activeStationId });
  const activeStation = stations.find(s=>s.id===activeStationId) || stations[0];

  const allShifts = await getShifts(activeStation.id);
  const myShifts = allShifts.filter(s=>s.userId===user.uid);
  const todayStr = new Date().toISOString().slice(0,10);
  
  const isOwner = user.role === 'owner';
  const isManager = user.role === 'manager';
  const isAdmin = user.role === 'admin';
  const isAttendant = user.role === 'attendant';

  const todayShiftsAll = allShifts.filter(s=> new Date(s.startTime).toISOString().slice(0,10)===todayStr);
  let totalSalesAll = 0, totalLitersAll = 0;
  todayShiftsAll.forEach(s=>{ 
    totalSalesAll += s.totals?.totalRevenue||0; 
    totalLitersAll += s.totals?.totalLiters||0; 
  });

  const todayShiftsMy = myShifts.filter(s=> new Date(s.startTime).toISOString().slice(0,10)===todayStr);
  let totalSalesMy = 0, totalLitersMy = 0, varianceMy = 0, toHandoverMy = 0;
  todayShiftsMy.forEach(s=>{ 
    totalSalesMy += s.totals?.totalRevenue||0; 
    totalLitersMy += s.totals?.totalLiters||0; 
    varianceMy += s.totals?.variance||0;
    if ((s.totals?.variance||0) < -0.5) toHandoverMy += Math.abs(s.totals.variance);
  });

  const activeShifts = allShifts.filter(s=>s.status==='ACTIVE');
  const pendingShifts = allShifts.filter(s=>s.status==='PENDING_REVIEW');
  const myActiveShift = await getActiveShiftForUser(user.uid);
  const myPending = myShifts.filter(s=>s.status==='PENDING_REVIEW').length;
  const myRejected = myShifts.filter(s=>s.status==='REJECTED').length;

  // Get true pending collections for owner/manager
  let balances = null;
  let hideBalance = false;
  if (isOwner || isManager || isAdmin) {
    try {
      balances = await getStaffBalances(activeStation.id);
      hideBalance = getHideBalancePref(activeStation.id);
    } catch(e){ console.warn('balances failed', e); }
  }

  const toCollectPending = balances ? balances.totals.totalPendingCollect : 0;
  const toReturnPending = balances ? balances.totals.totalPendingReturn : 0;
  const pendingStaffCount = balances ? balances.staffList.filter(s=>s.pendingCollect>0.5).length : 0;
  const fmt = (v) => hideBalance ? '••••' : formatCurrency(v);

  if (isAttendant) {
    root.innerHTML = `
      <div class="container" style="max-width:480px;margin:0 auto">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
          <div>
            <h1 class="page-title" style="font-size:20px">Hi ${user.name?.split(' ')[0] || 'there'} 👋</h1>
            <p class="page-sub" style="margin-top:4px">${activeStation.name} • Attendant • My Performance</p>
          </div>
          <button class="neu-btn" style="min-height:40px;min-width:40px;border-radius:10px" onclick="location.hash='#/settings'">⚙️</button>
        </div>

        ${stations.length>1 ? `
          <div class="neu-card" style="margin-top:16px;padding:14px;border-radius:12px">
            <label class="label" style="font-size:11px">My Stations</label>
            <select id="stationSwitch" class="neu-select" style="min-height:40px;border-radius:10px;margin-top:6px">${stations.map(s=>`<option value="${s.id}" ${s.id===activeStation.id?'selected':''}>${s.name}</option>`).join('')}</select>
          </div>` : ''}

        <div class="neu-card" style="margin-top:16px;padding:16px;border-radius:14px;background:linear-gradient(135deg,#f6ffed 0%,#ffffff 100%);border:1px solid #b7eb8f">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#389e0d">My Performance Today</div>
          <div style="display:flex;justify-content:space-between;margin-top:12px">
            <div><div style="font-size:11px;color:var(--text-secondary)">My Sales</div><div style="font-weight:800;font-size:18px;margin-top:2px">${formatCurrency(totalSalesMy)}</div><div style="font-size:10px;color:var(--text-tertiary)">${todayShiftsMy.length} shift(s) today</div></div>
            <div style="text-align:right"><div style="font-size:11px;color:var(--text-secondary)">Fuel Sold</div><div style="font-weight:800;font-size:18px;margin-top:2px">${formatLiters(totalLitersMy)}</div><div style="font-size:10px;color:var(--text-tertiary)">My nozzles</div></div>
          </div>
          ${Math.abs(varianceMy)>0.5 ? `
            <div style="margin-top:12px;padding:10px;background:${varianceMy<-0.5?'#fff1f0':'#f6ffed'};border-radius:10px;border:1px solid ${varianceMy<-0.5?'#ffa39e':'#b7eb8f'}">
              <div style="font-size:11px;color:${varianceMy<-0.5?'#cf1322':'#389e0d'};font-weight:600">${varianceMy<-0.5 ? '💸 To Handover to Owner' : '💰 Excess with You'}</div>
              <div style="font-weight:800;font-size:16px;color:${varianceMy<-0.5?'#cf1322':'#389e0d'};margin-top:2px">${formatCurrency(Math.abs(varianceMy))} ${varianceMy<-0.5?'to give':'extra'}</div>
              <div style="font-size:10px;color:var(--text-secondary);margin-top:2px">${varianceMy<-0.5 ? 'Owner will collect from you after approval' : 'Will be adjusted by owner'}</div>
            </div>
          ` : `<div style="margin-top:12px;padding:8px;background:#f0f0f0;border-radius:8px;text-align:center;font-size:11px;color:var(--text-secondary)">✅ Balanced • All settled</div>`}
        </div>

        <div class="grid grid-2" style="margin-top:14px;gap:12px">
          <div class="neu-card" style="padding:14px;border-radius:12px;text-align:center"><div style="font-size:11px;color:var(--text-secondary)">Active Shift</div><div style="font-weight:800;font-size:20px;margin-top:4px">${myActiveShift? '1 Active' : 'None'}</div><div style="font-size:10px;color:var(--text-tertiary);margin-top:2px">${myActiveShift? 'You are fueling' : 'Start new'}</div></div>
          <div class="neu-card" style="padding:14px;border-radius:12px;text-align:center"><div style="font-size:11px;color:var(--text-secondary)">My Shifts</div><div style="font-weight:800;font-size:20px;margin-top:4px">${myShifts.length}</div><div style="font-size:10px;color:var(--text-tertiary);margin-top:2px">${myPending} pending • ${myRejected} correction</div></div>
        </div>

        ${myActiveShift ? `
          <div class="neu-card" style="margin-top:14px;padding:16px;border-radius:14px;border:1.5px solid var(--primary);background:linear-gradient(135deg,#e6f4ff 0%,#ffffff 100%)">
            <div style="display:flex;justify-content:space-between;align-items:center"><div><div class="badge badge--info" style="padding:6px 10px;border-radius:20px;font-size:11px">ACTIVE SHIFT</div><h3 style="margin-top:10px;font-weight:700;font-size:14px">${myActiveShift.employeeName} • ${new Date(myActiveShift.startTime).toLocaleTimeString()}</h3><p style="font-size:12px;color:var(--text-secondary);margin-top:4px">${myActiveShift.nozzles?.length||0} nozzles • You are on duty</p></div><button class="neu-btn neu-btn--primary" style="min-height:44px;padding:0 18px;border-radius:12px;font-weight:700" onclick="location.hash='#/shifts/${myActiveShift.id}'">Open →</button></div>
          </div>
        ` : `
          <div class="neu-card" style="margin-top:14px;padding:18px;border-radius:14px;text-align:center"><p style="font-size:15px;font-weight:700">No active shift</p><p style="font-size:12px;color:var(--text-secondary);margin-top:6px">Start a new shift to begin fueling</p><button class="neu-btn neu-btn--primary" style="margin-top:14px;min-height:48px;border-radius:12px;padding:0 24px;font-weight:700" onclick="location.hash='#/shifts/start'">Start Shift</button></div>
        `}

        ${myRejected>0 ? `
          <div class="neu-card" style="margin-top:14px;padding:14px;border-radius:12px;background:#fff1f0;border:1px solid #ffa39e"><h3 style="font-size:13px;font-weight:700;color:#cf1322">⚠️ ${myRejected} correction(s) requested</h3><p style="font-size:11px;color:var(--text-secondary);margin-top:4px">Manager pointed at specific fields. Fix and resubmit.</p><button class="neu-btn" style="margin-top:10px;min-height:40px;border-radius:10px;font-size:13px;font-weight:600;background:#fff1f0;border:1px solid #ffa39e;color:#cf1322" onclick="location.hash='#/shifts'">View My Shifts</button></div>
        ` : ''}

        <div style="margin-top:18px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="location.hash='#/pumps'">⛽ My Pumps</button>
          <button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="location.hash='#/shifts'">🧾 My Shifts</button>
          <button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="location.hash='#/shifts/start'">▶️ Start Shift</button>
          <button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="location.hash='#/settings'">⚙️ Settings</button>
        </div>

        <div style="margin-top:14px;padding:12px;background:var(--bg);border-radius:10px;border:0.5px solid var(--border)"><div style="font-size:11px;color:var(--text-secondary);text-align:center">🔒 Attendant view: Only your performance, no station totals. Owner will collect ${formatCurrency(toHandoverMy)} from you after approval.</div></div>
      </div>
    `;
    const switchEl = root.querySelector('#stationSwitch');
    if (switchEl) switchEl.addEventListener('change', e=>{ setState({ currentStationId: e.target.value }); dashboardView({ root }); });
    return;
  }

  if (isManager || isAdmin) {
    root.innerHTML = `
      <div class="container" style="max-width:480px;margin:0 auto">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
          <div><h1 class="page-title" style="font-size:20px">Good ${getGreeting()} 👋<br><span style="font-weight:800">${user.name || user.phone}</span></h1><p class="page-sub" style="margin-top:4px">${activeStation.name} • ${user.role.toUpperCase()} • Team Lead</p></div>
          <div style="display:flex;gap:8px"><button id="hideToggle" class="neu-btn" style="min-height:40px;min-width:40px;border-radius:10px">${hideBalance?'👁️‍🗨️':'👁️'}</button><button class="neu-btn" style="min-height:40px;min-width:40px;border-radius:10px" onclick="location.hash='#/settings'">⚙️</button></div>
        </div>
        ${stations.length>1 ? `<div class="neu-card" style="margin-top:16px;padding:14px;border-radius:12px"><label class="label" style="font-size:11px">My Stations</label><select id="stationSwitch" class="neu-select" style="min-height:40px;border-radius:10px;margin-top:6px">${stations.map(s=>`<option value="${s.id}" ${s.id===activeStation.id?'selected':''}>${s.name} • ${s.status}</option>`).join('')}</select></div>` : ''}
        <div class="grid grid-2" style="margin-top:16px;gap:12px">
          <div class="neu-card stat-card" style="padding:14px;border-radius:12px"><div class="stat-label" style="font-size:11px">Today's Sales</div><div class="stat-value" style="font-size:18px">${fmt(totalSalesAll)}</div><div class="stat-sub" style="font-size:11px">${todayShiftsAll.length} shifts • Station total</div></div>
          <div class="neu-card stat-card" style="padding:14px;border-radius:12px"><div class="stat-label" style="font-size:11px">Fuel Sold</div><div class="stat-value" style="font-size:18px">${hideBalance?'••••':formatLiters(totalLitersAll)}</div><div class="stat-sub" style="font-size:11px">${Object.keys(aggregateByFuel(todayShiftsAll)).length} fuel types</div></div>
          <div class="neu-card stat-card" style="padding:14px;border-radius:12px"><div class="stat-label" style="font-size:11px">Active Shifts</div><div class="stat-value" style="font-size:18px">${activeShifts.length}</div><div class="stat-sub" style="font-size:11px">${pendingShifts.length} pending review</div></div>
          <div class="neu-card stat-card" style="padding:14px;border-radius:12px;cursor:pointer;${toCollectPending>0?'border:1px solid #ffa39e;background:#fff1f0':''}" onclick="location.hash='#/collections'"><div style="display:flex;justify-content:space-between;align-items:center"><div class="stat-label" style="font-size:11px">To Collect</div><span style="font-size:12px">👁️ ${hideBalance?'Show':'Hide'}</span></div><div class="stat-value" style="font-size:16px;color:${toCollectPending>0?'#cf1322':'inherit'}">${fmt(toCollectPending)}</div><div class="stat-sub" style="font-size:10px">${pendingStaffCount} staff pending • Tap to collect</div></div>
        </div>
        ${myActiveShift ? `<div class="neu-card" style="margin-top:14px;padding:14px;border-radius:12px;border:1.5px solid var(--primary)"><div style="display:flex;justify-content:space-between;align-items:center"><div><div class="badge badge--info" style="padding:6px 10px;border-radius:20px;font-size:11px">ACTIVE SHIFT</div><h3 style="margin-top:8px;font-weight:700;font-size:14px">${myActiveShift.employeeName}</h3><p style="font-size:12px;color:var(--text-secondary)">${myActiveShift.nozzles?.length||0} nozzles</p></div><button class="neu-btn neu-btn--primary" style="min-height:44px;padding:0 18px;border-radius:12px;font-weight:700" onclick="location.hash='#/shifts/${myActiveShift.id}'">Open</button></div></div>` : `<div class="neu-card" style="margin-top:14px;padding:16px;border-radius:12px;text-align:center"><p style="font-size:14px;font-weight:700">No active shift</p><button class="neu-btn neu-btn--primary" style="margin-top:12px;min-height:44px;border-radius:12px;padding:0 20px;font-weight:700" onclick="location.hash='#/shifts/start'">Start Shift</button></div>`}
        ${pendingShifts.length>0 ? `<div class="neu-card" style="margin-top:14px;padding:14px;border-radius:12px"><h3 style="font-size:14px;font-weight:700">⚠️ Needs Review (${pendingShifts.length})</h3><p style="font-size:11px;color:var(--text-secondary);margin-top:4px">Tap to review and point corrections</p><div class="list" style="margin-top:12px;display:flex;flex-direction:column;gap:8px">${pendingShifts.slice(0,4).map(s=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:var(--bg);border-radius:10px"><div><div style="font-weight:600;font-size:13px">${s.employeeName} • ${fmt(s.totals?.totalRevenue||0)}</div><div style="font-size:11px;color:var(--text-secondary)">${s.totals?.variance<0? 'To Collect '+fmt(Math.abs(s.totals.variance)) : 'Variance '+fmt(s.totals.variance||0)} • ${new Date(s.startTime).toLocaleTimeString()}</div></div><button class="neu-btn" style="min-height:36px;padding:0 12px;border-radius:10px;font-size:12px;font-weight:600" onclick="location.hash='#/shifts/${s.id}'">Review →</button></div>`).join('')}</div></div>` :''}
        <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:10px"><button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="location.hash='#/collections'">💰 Collections</button><button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="location.hash='#/pumps'">🔧 Pumps</button><button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="location.hash='#/employees'">👥 Employees</button><button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="location.hash='#/prices'">💰 Prices</button><button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="location.hash='#/reports'">📊 Reports</button><button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="location.hash='#/shifts'">🧾 Shifts</button></div>
        <div style="margin-top:12px;padding:10px;background:var(--bg);border-radius:10px;border:0.5px solid var(--border)"><div style="font-size:11px;color:var(--text-secondary);text-align:center">Manager view: Most data, can review shifts, cannot destroy station (owner only)</div></div>
      </div>
    `;
    const switchEl = root.querySelector('#stationSwitch');
    if (switchEl) switchEl.addEventListener('change', e=>{ setState({ currentStationId: e.target.value }); dashboardView({ root }); });
    root.querySelector('#hideToggle')?.addEventListener('click', ()=>{ setHideBalancePref(activeStation.id, !getHideBalancePref(activeStation.id)); dashboardView({ root }); });
    return;
  }

  // Owner dashboard - all visibility + collections control
  root.innerHTML = `
    <div class="container" style="max-width:480px;margin:0 auto">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <div><h1 class="page-title" style="font-size:20px">Good ${getGreeting()} 👋<br><span style="font-weight:800">${user.name || user.phone}</span></h1><p class="page-sub" style="margin-top:4px">${activeStation.name} • OWNER • All Access</p></div>
        <div style="display:flex;gap:8px"><button id="hideToggle" class="neu-btn" style="min-height:40px;min-width:40px;border-radius:10px">${hideBalance?'👁️‍🗨️':'👁️'}</button><button class="neu-btn" style="min-height:40px;min-width:40px;border-radius:10px" onclick="location.hash='#/settings'">⚙️</button></div>
      </div>
      ${stations.length>1 ? `<div class="neu-card" style="margin-top:16px;padding:14px;border-radius:12px"><label class="label" style="font-size:11px">My Stations</label><select id="stationSwitch" class="neu-select" style="min-height:44px;border-radius:10px;margin-top:6px">${stations.map(s=>`<option value="${s.id}" ${s.id===activeStation.id?'selected':''}>${s.name} • ${s.status}</option>`).join('')}</select></div>` : ''}

      <div class="grid grid-2" style="margin-top:16px;gap:12px">
        <div class="neu-card stat-card" style="padding:16px;border-radius:14px;background:linear-gradient(135deg,#e6f4ff 0%,#ffffff 100%);border:1px solid #91caff"><div class="stat-label" style="font-size:11px">Today's Sales</div><div class="stat-value" style="font-size:20px">${fmt(totalSalesAll)}</div><div class="stat-sub" style="font-size:11px">${todayShiftsAll.length} shifts today • Full visibility</div></div>
        <div class="neu-card stat-card" style="padding:16px;border-radius:14px"><div class="stat-label" style="font-size:11px">Fuel Sold</div><div class="stat-value" style="font-size:20px">${hideBalance?'••••':formatLiters(totalLitersAll)}</div><div class="stat-sub" style="font-size:11px">${Object.keys(aggregateByFuel(todayShiftsAll)).length} fuel types • All staff</div></div>
        <div class="neu-card stat-card" style="padding:16px;border-radius:14px"><div class="stat-label" style="font-size:11px">Active Shifts</div><div class="stat-value" style="font-size:20px">${activeShifts.length}</div><div class="stat-sub" style="font-size:11px">${pendingShifts.length} pending review • Approve to collect</div></div>
        <div class="neu-card stat-card" style="padding:16px;border-radius:14px;cursor:pointer;${toCollectPending>0?'background:#fff1f0;border:1.5px solid #ffa39e':''}" onclick="location.hash='#/collections'">
          <div style="display:flex;justify-content:space-between;align-items:center"><div class="stat-label" style="font-size:11px">To Collect from Staff</div><button class="neu-btn" style="min-height:28px;padding:0 8px;border-radius:8px;font-size:11px" onclick="event.stopPropagation(); document.getElementById('hideToggle').click()">${hideBalance?'👁️ Show':'🙈 Hide'}</button></div>
          <div class="stat-value" style="font-size:18px;color:${toCollectPending>0?'#cf1322':'#389e0d'}">${fmt(toCollectPending)}</div>
          <div class="stat-sub" style="font-size:10px">${pendingStaffCount} staff • ${balances ? balances.totals.totalCollected>0 ? 'Collected '+fmt(balances.totals.totalCollected)+' • ' : '' : ''}Tap to collect →</div>
          ${toReturnPending>0 ? `<div style="font-size:10px;color:#faad14;margin-top:4px">↩️ To Return ${fmt(toReturnPending)} to staff</div>` : ''}
        </div>
      </div>

      <!-- Owner control bar - think big -->
      <div class="neu-card" style="margin-top:14px;padding:12px;border-radius:12px;display:flex;gap:8px">
        <button class="neu-btn" style="flex:1;min-height:44px;border-radius:10px;font-weight:600;font-size:13px" onclick="location.hash='#/collections'">💰 Collect Money</button>
        <button class="neu-btn" style="flex:1;min-height:44px;border-radius:10px;font-weight:600;font-size:13px" id="quickSettleBtn">🧹 Reset Dashboard</button>
        <button class="neu-btn" style="min-height:44px;min-width:44px;border-radius:10px" id="hideBtn2">${hideBalance?'👁️‍🗨️':'👁️'}</button>
      </div>

      ${myActiveShift ? `<div class="neu-card" style="margin-top:14px;padding:16px;border-radius:14px;border:1.5px solid var(--primary)"><div style="display:flex;justify-content:space-between;align-items:center"><div><div class="badge badge--info" style="padding:6px 10px;border-radius:20px;font-size:11px">ACTIVE SHIFT</div><h3 style="margin-top:8px;font-weight:700;font-size:14px">${myActiveShift.employeeName}</h3><p style="font-size:12px;color:var(--text-secondary)">${myActiveShift.nozzles?.length||0} nozzles</p></div><button class="neu-btn neu-btn--primary" style="min-height:44px;padding:0 18px;border-radius:12px;font-weight:700" onclick="location.hash='#/shifts/${myActiveShift.id}'">Open</button></div></div>` : `<div class="neu-card" style="margin-top:14px;padding:16px;border-radius:14px;text-align:center"><p style="font-size:14px;font-weight:700">No active shift</p><p style="font-size:12px;color:var(--text-secondary);margin-top:4px">Start a new shift</p><button class="neu-btn neu-btn--primary" style="margin-top:12px;min-height:44px;border-radius:12px;padding:0 20px;font-weight:700" onclick="location.hash='#/shifts/start'">Start Shift</button></div>`}

      ${pendingShifts.length>0 ? `<div class="neu-card" style="margin-top:14px;padding:16px;border-radius:14px;background:#fffbe6;border:1px solid #ffe58f"><h3 style="font-size:14px;font-weight:700">💰 Collections Pending Approval (${pendingShifts.length})</h3><p style="font-size:11px;color:var(--text-secondary);margin-top:4px">Approve to add to To Collect, then collect money</p><div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">${pendingShifts.slice(0,5).map(s=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:white;border-radius:10px;border:0.5px solid #ffe58f"><div><div style="font-weight:600;font-size:13px">${s.employeeName} • ${fmt(s.totals?.totalRevenue||0)}</div><div style="font-size:11px;color:${(s.totals?.variance||0)<0?'#cf1322':'var(--text-secondary)'}">${(s.totals?.variance||0)<0? 'To Collect: '+fmt(Math.abs(s.totals.variance)) : 'Variance '+fmt(s.totals.variance||0)} • ${new Date(s.startTime).toLocaleTimeString()}</div></div><button class="neu-btn neu-btn--primary" style="min-height:36px;padding:0 14px;border-radius:10px;font-size:12px;font-weight:700" onclick="location.hash='#/shifts/${s.id}'">Approve →</button></div>`).join('')}</div></div>` :''}

      ${balances && pendingStaffCount>0 ? `
        <div class="neu-card" style="margin-top:14px;padding:16px;border-radius:14px;background:#fff1f0;border:1px solid #ffa39e">
          <h3 style="font-size:14px;font-weight:700;color:#cf1322">💸 Pending Collections • ${fmt(toCollectPending)} from ${pendingStaffCount} staff</h3>
          <p style="font-size:11px;color:var(--text-secondary);margin-top:4px">Money approved but not yet collected — tap Collect</p>
          <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
            ${balances.staffList.filter(s=>s.pendingCollect>0.5).slice(0,4).map(s=>`
              <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:white;border-radius:10px">
                <div style="display:flex;align-items:center;gap:10px"><div style="width:32px;height:32px;border-radius:50%;background:#232f3e;color:white;display:grid;place-items:center;font-weight:700;font-size:12px">${s.staffName[0]}</div><div><div style="font-weight:600;font-size:13px">${s.staffName}</div><div style="font-size:11px;color:var(--text-secondary)">${s.shifts.filter(sh=>sh.pendingCollect>0.5).length} shifts pending</div></div></div>
                <div style="text-align:right"><div style="font-weight:700;color:#cf1322">${fmt(s.pendingCollect)}</div><button class="neu-btn" style="margin-top:4px;min-height:28px;padding:0 10px;border-radius:8px;font-size:11px;font-weight:700;background:#52c41a;color:white;border:none" onclick="location.hash='#/collections'">Collect</button></div>
              </div>
            `).join('')}
          </div>
          <button class="neu-btn neu-btn--primary" style="margin-top:12px;min-height:44px;border-radius:12px;width:100%;font-weight:700;background:#52c41a;border-color:#52c41a" onclick="location.hash='#/collections'">💰 Go to Collections → Reset Dashboard</button>
        </div>
      ` : ''}

      <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:10px"><button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="location.hash='#/collections'">💰 Collections</button><button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="location.hash='#/stations'">⛽ Stations</button><button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="location.hash='#/pumps'">🔧 Pumps</button><button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="location.hash='#/employees'">👥 Employees</button><button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="location.hash='#/prices'">💰 Prices</button><button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="location.hash='#/reports'">📊 Reports</button></div>
    </div>
  `;
  const switchEl = root.querySelector('#stationSwitch');
  if (switchEl) switchEl.addEventListener('change', e=>{ setState({ currentStationId: e.target.value }); dashboardView({ root }); });

  const hideHandler = () => { setHideBalancePref(activeStation.id, !getHideBalancePref(activeStation.id)); dashboardView({ root }); };
  root.querySelector('#hideToggle')?.addEventListener('click', hideHandler);
  root.querySelector('#hideBtn2')?.addEventListener('click', hideHandler);

  root.querySelector('#quickSettleBtn')?.addEventListener('click', async ()=>{
    if (!balances || balances.totals.totalPendingCollect<=0.5) return alert('No pending to reset');
    if (!confirm(`Reset Dashboard?\n\nMark ${formatCurrency(balances.totals.totalPendingCollect)} as collected and reset To Collect to 0?\n\nHistory stays in Collections. Continue?`)) return;
    const { settleAllPending } = await import('../services/collections.js');
    try {
      const res = await settleAllPending(activeStation.id);
      alert(`✅ Dashboard reset! ${formatCurrency(res.totalSettled)} settled • To Collect now 0`);
      dashboardView({ root });
    } catch(e){ alert(e.message); }
  });
}

function getGreeting(){
  const h = new Date().getHours();
  if (h<12) return 'Morning';
  if (h<17) return 'Afternoon';
  return 'Evening';
}
function aggregateByFuel(shifts){
  const map={};
  shifts.forEach(s=>{ if (s.totals?.byFuel) Object.keys(s.totals.byFuel).forEach(ft=>map[ft]=true); });
  return map;
}
