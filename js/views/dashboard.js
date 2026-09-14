import { getState, setState } from '../state.js';
import { getStationsForCurrentUser } from '../services/stations.js';
import { getShifts, getActiveShiftForUser } from '../services/shifts.js';
import { formatCurrency, formatLiters } from '../services/calc.js';

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

  // Fetch expenses to compute net = gross - expenses (fuel came out but not sale)
  let expenseMap = {};
  try {
    const { queryDocs } = await import('../services/firestoreService.js');
    const allTx = await queryDocs('transactions', tx=> tx.stationId===activeStation.id && tx.type==='expense');
    allTx.forEach(tx=>{ if (tx.shiftId) expenseMap[tx.shiftId] = (expenseMap[tx.shiftId]||0)+Number(tx.amount||0); });
  } catch {}

  const todayShiftsAll = allShifts.filter(s=> new Date(s.startTime).toISOString().slice(0,10)===todayStr);
  let totalSalesAll = 0, totalGrossAll = 0, totalExpAll = 0, totalLitersAll = 0;
  todayShiftsAll.forEach(s=>{ 
    const gross = s.totals?.totalRevenue||0;
    const exp = expenseMap[s.id]||0;
    const net = gross - exp;
    totalGrossAll += gross;
    totalExpAll += exp;
    totalSalesAll += net;
    totalLitersAll += s.totals?.totalLiters||0; 
  });

  const todayShiftsMy = myShifts.filter(s=> new Date(s.startTime).toISOString().slice(0,10)===todayStr);
  let totalSalesMy = 0, totalLitersMy = 0, varianceMy = 0, toHandoverMy = 0;
  todayShiftsMy.forEach(s=>{ 
    const gross = s.totals?.totalRevenue||0;
    const exp = expenseMap[s.id]||0;
    const net = gross - exp;
    totalSalesMy += net;
    totalLitersMy += s.totals?.totalLiters||0; 
    const payments = s.totals?.totalPayments||0;
    const netVar = payments - net;
    varianceMy += netVar;
    if (netVar < -0.5) toHandoverMy += Math.abs(netVar);
  });

  const activeShifts = allShifts.filter(s=>s.status==='ACTIVE');
  const pendingShifts = allShifts.filter(s=>s.status==='PENDING_REVIEW');
  const myActiveShift = await getActiveShiftForUser(user.uid);
  const myPending = myShifts.filter(s=>s.status==='PENDING_REVIEW').length;
  const myRejected = myShifts.filter(s=>s.status==='REJECTED').length;

  if (isAttendant) {
    root.innerHTML = `
      <div class="container" style="max-width:480px;margin:0 auto">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
          <div>
            <h1 class="page-title" style="font-size:20px">Hi ${user.name?.split(' ')[0] || 'there'} 👋</h1>
            <p class="page-sub" style="margin-top:4px">${activeStation.name} • Attendant</p>
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
            <div><div style="font-size:11px;color:var(--text-secondary)">My Sales (Net)</div><div style="font-weight:800;font-size:18px;margin-top:2px">${formatCurrency(totalSalesMy)}</div><div style="font-size:10px;color:var(--text-tertiary)">${todayShiftsMy.length} shift(s) today</div></div>
            <div style="text-align:right"><div style="font-size:11px;color:var(--text-secondary)">Fuel Sold</div><div style="font-weight:800;font-size:18px;margin-top:2px">${formatLiters(totalLitersMy)}</div><div style="font-size:10px;color:var(--text-tertiary)">My nozzles</div></div>
          </div>
          ${Math.abs(varianceMy)>0.5 ? `
            <div style="margin-top:12px;padding:10px;background:${varianceMy<-0.5?'#fff1f0':'#f6ffed'};border-radius:10px;border:1px solid ${varianceMy<-0.5?'#ffa39e':'#b7eb8f'}">
              <div style="font-size:11px;color:${varianceMy<-0.5?'#cf1322':'#389e0d'};font-weight:600">${varianceMy<-0.5 ? '💸 To Handover to Owner' : '💰 Excess with You'}</div>
              <div style="font-weight:800;font-size:16px;color:${varianceMy<-0.5?'#cf1322':'#389e0d'};margin-top:2px">${formatCurrency(Math.abs(varianceMy))} ${varianceMy<-0.5?'to give':'extra'}</div>
              <div style="font-size:10px;color:var(--text-secondary);margin-top:2px">${varianceMy<-0.5 ? 'Handover after approval' : 'Will be adjusted'}</div>
            </div>
          ` : `<div style="margin-top:12px;padding:8px;background:#f0f0f0;border-radius:8px;text-align:center;font-size:11px;color:var(--text-secondary)">✅ Balanced</div>`}
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
          <div><h1 class="page-title" style="font-size:20px">Good ${getGreeting()} 👋<br><span style="font-weight:800">${user.name || user.phone}</span></h1><p class="page-sub" style="margin-top:4px">${activeStation.name} • ${user.role.toUpperCase()}</p></div>
          <button class="neu-btn" style="min-height:40px;min-width:40px;border-radius:10px" onclick="location.hash='#/settings'">⚙️</button>
        </div>
        ${stations.length>1 ? `<div class="neu-card" style="margin-top:16px;padding:14px;border-radius:12px"><label class="label" style="font-size:11px">My Stations</label><select id="stationSwitch" class="neu-select" style="min-height:40px;border-radius:10px;margin-top:6px">${stations.map(s=>`<option value="${s.id}" ${s.id===activeStation.id?'selected':''}>${s.name} • ${s.status}</option>`).join('')}</select></div>` : ''}
        <div class="grid grid-2" style="margin-top:16px;gap:12px">
          <div class="neu-card stat-card" style="padding:14px;border-radius:12px"><div class="stat-label" style="font-size:11px">Today's Sales (Net)</div><div class="stat-value" style="font-size:18px">${formatCurrency(totalSalesAll)}</div><div class="stat-sub" style="font-size:11px">${todayShiftsAll.length} shifts • Net = Gross - Expenses</div></div>
          <div class="neu-card stat-card" style="padding:14px;border-radius:12px"><div class="stat-label" style="font-size:11px">Fuel Sold</div><div class="stat-value" style="font-size:18px">${formatLiters(totalLitersAll)}</div><div class="stat-sub" style="font-size:11px">${Object.keys(aggregateByFuel(todayShiftsAll)).length} fuel types</div></div>
          <div class="neu-card stat-card" style="padding:14px;border-radius:12px"><div class="stat-label" style="font-size:11px">Active Shifts</div><div class="stat-value" style="font-size:18px">${activeShifts.length}</div><div class="stat-sub" style="font-size:11px">${pendingShifts.length} pending review</div></div>
          <div class="neu-card stat-card" style="padding:14px;border-radius:12px"><div class="stat-label" style="font-size:11px">To Handover Today</div><div class="stat-value" style="font-size:18px">${formatCurrency(todayShiftsAll.reduce((a,s)=>{ const gross=s.totals?.totalRevenue||0; const exp=expenseMap[s.id]||0; const net=gross-exp; const pay=s.totals?.totalPayments||0; return a + Math.max(0, net-pay); },0))}</div><div class="stat-sub" style="font-size:11px">Net - Payments</div></div>
        </div>
        ${myActiveShift ? `<div class="neu-card" style="margin-top:14px;padding:14px;border-radius:12px;border:1.5px solid var(--primary)"><div style="display:flex;justify-content:space-between;align-items:center"><div><div class="badge badge--info" style="padding:6px 10px;border-radius:20px;font-size:11px">ACTIVE SHIFT</div><h3 style="margin-top:8px;font-weight:700;font-size:14px">${myActiveShift.employeeName}</h3><p style="font-size:12px;color:var(--text-secondary)">${myActiveShift.nozzles?.length||0} nozzles</p></div><button class="neu-btn neu-btn--primary" style="min-height:44px;padding:0 18px;border-radius:12px;font-weight:700" onclick="location.hash='#/shifts/${myActiveShift.id}'">Open</button></div></div>` : `<div class="neu-card" style="margin-top:14px;padding:16px;border-radius:12px;text-align:center"><p style="font-size:14px;font-weight:700">No active shift</p><button class="neu-btn neu-btn--primary" style="margin-top:12px;min-height:44px;border-radius:12px;padding:0 20px;font-weight:700" onclick="location.hash='#/shifts/start'">Start Shift</button></div>`}
        ${pendingShifts.length>0 ? `<div class="neu-card" style="margin-top:14px;padding:14px;border-radius:12px"><h3 style="font-size:14px;font-weight:700">⚠️ Needs Review (${pendingShifts.length})</h3><p style="font-size:11px;color:var(--text-secondary);margin-top:4px">Tap to review</p><div class="list" style="margin-top:12px;display:flex;flex-direction:column;gap:8px">${pendingShifts.slice(0,4).map(s=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:var(--bg);border-radius:10px"><div><div style="font-weight:600;font-size:13px">${s.employeeName} • ${formatCurrency((s.totals?.totalRevenue||0) - (expenseMap[s.id]||0))}</div><div style="font-size:11px;color:var(--text-secondary)">${new Date(s.startTime).toLocaleTimeString()}</div></div><button class="neu-btn" style="min-height:36px;padding:0 12px;border-radius:10px;font-size:12px;font-weight:600" onclick="location.hash='#/shifts/${s.id}'">Review →</button></div>`).join('')}</div></div>` :''}
        <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:10px"><button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="location.hash='#/pumps'">🔧 Pumps</button><button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="location.hash='#/employees'">👥 Employees</button><button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="location.hash='#/prices'">💰 Prices</button><button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="location.hash='#/reports'">📊 Reports</button><button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="location.hash='#/shifts'">🧾 Shifts</button><button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="location.hash='#/stations'">⛽ Stations</button></div>
      </div>
    `;
    const switchEl = root.querySelector('#stationSwitch');
    if (switchEl) switchEl.addEventListener('change', e=>{ setState({ currentStationId: e.target.value }); dashboardView({ root }); });
    return;
  }

  // Owner dashboard - simple, no collections jackpot
  root.innerHTML = `
    <div class="container" style="max-width:480px;margin:0 auto">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <div><h1 class="page-title" style="font-size:20px">Good ${getGreeting()} 👋<br><span style="font-weight:800">${user.name || user.phone}</span></h1><p class="page-sub" style="margin-top:4px">${activeStation.name} • OWNER</p></div>
        <button class="neu-btn" style="min-height:40px;min-width:40px;border-radius:10px" onclick="location.hash='#/settings'">⚙️</button>
      </div>
      ${stations.length>1 ? `<div class="neu-card" style="margin-top:16px;padding:14px;border-radius:12px"><label class="label" style="font-size:11px">My Stations</label><select id="stationSwitch" class="neu-select" style="min-height:40px;border-radius:10px;margin-top:6px">${stations.map(s=>`<option value="${s.id}" ${s.id===activeStation.id?'selected':''}>${s.name} • ${s.status}</option>`).join('')}</select></div>` : ''}

      <div class="grid grid-2" style="margin-top:16px;gap:12px">
        <div class="neu-card stat-card" style="padding:16px;border-radius:14px;background:linear-gradient(135deg,#e6f4ff 0%,#ffffff 100%);border:1px solid #91caff"><div class="stat-label" style="font-size:11px">Today's Sales (Net)</div><div class="stat-value" style="font-size:20px">${formatCurrency(totalSalesAll)}</div><div class="stat-sub" style="font-size:11px">${todayShiftsAll.length} shifts today • Net = Gross - Expenses</div></div>
        <div class="neu-card stat-card" style="padding:16px;border-radius:14px"><div class="stat-label" style="font-size:11px">Fuel Sold</div><div class="stat-value" style="font-size:20px">${formatLiters(totalLitersAll)}</div><div class="stat-sub" style="font-size:11px">${Object.keys(aggregateByFuel(todayShiftsAll)).length} fuel types • All staff</div></div>
        <div class="neu-card stat-card" style="padding:16px;border-radius:14px"><div class="stat-label" style="font-size:11px">Active Shifts</div><div class="stat-value" style="font-size:20px">${activeShifts.length}</div><div class="stat-sub" style="font-size:11px">${pendingShifts.length} pending review</div></div>
        <div class="neu-card stat-card" style="padding:16px;border-radius:14px"><div class="stat-label" style="font-size:11px">To Handover Today</div><div class="stat-value" style="font-size:20px">${formatCurrency(todayShiftsAll.reduce((a,s)=>{ const gross=s.totals?.totalRevenue||0; const exp=expenseMap[s.id]||0; const net=gross-exp; const pay=s.totals?.totalPayments||0; return a + Math.max(0, net-pay); },0))}</div><div class="stat-sub" style="font-size:11px">Net - Payments • Simple</div></div>
      </div>

      ${myActiveShift ? `<div class="neu-card" style="margin-top:14px;padding:16px;border-radius:14px;border:1.5px solid var(--primary)"><div style="display:flex;justify-content:space-between;align-items:center"><div><div class="badge badge--info" style="padding:6px 10px;border-radius:20px;font-size:11px">ACTIVE SHIFT</div><h3 style="margin-top:8px;font-weight:700;font-size:14px">${myActiveShift.employeeName}</h3><p style="font-size:12px;color:var(--text-secondary)">${myActiveShift.nozzles?.length||0} nozzles</p></div><button class="neu-btn neu-btn--primary" style="min-height:44px;padding:0 18px;border-radius:12px;font-weight:700" onclick="location.hash='#/shifts/${myActiveShift.id}'">Open</button></div></div>` : `<div class="neu-card" style="margin-top:14px;padding:16px;border-radius:14px;text-align:center"><p style="font-size:14px;font-weight:700">No active shift</p><p style="font-size:12px;color:var(--text-secondary);margin-top:4px">Start a new shift</p><button class="neu-btn neu-btn--primary" style="margin-top:12px;min-height:44px;border-radius:12px;padding:0 20px;font-weight:700" onclick="location.hash='#/shifts/start'">Start Shift</button></div>`}

      ${pendingShifts.length>0 ? `<div class="neu-card" style="margin-top:14px;padding:16px;border-radius:14px;background:#fffbe6;border:1px solid #ffe58f"><h3 style="font-size:14px;font-weight:700">⏳ Pending Review (${pendingShifts.length})</h3><p style="font-size:11px;color:var(--text-secondary);margin-top:4px">Approve shifts to see final To Handover</p><div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">${pendingShifts.slice(0,5).map(s=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:white;border-radius:10px;border:0.5px solid #ffe58f"><div><div style="font-weight:600;font-size:13px">${s.employeeName} • ${formatCurrency((s.totals?.totalRevenue||0) - (expenseMap[s.id]||0))}</div><div style="font-size:11px;color:var(--text-secondary)">${new Date(s.startTime).toLocaleTimeString()}</div></div><button class="neu-btn neu-btn--primary" style="min-height:36px;padding:0 14px;border-radius:10px;font-size:12px;font-weight:700" onclick="location.hash='#/shifts/${s.id}'">Review →</button></div>`).join('')}</div></div>` :''}

      <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:10px"><button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="location.hash='#/stations'">⛽ Stations</button><button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="location.hash='#/pumps'">🔧 Pumps</button><button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="location.hash='#/employees'">👥 Employees</button><button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="location.hash='#/prices'">💰 Prices</button><button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="location.hash='#/reports'">📊 Reports</button><button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="location.hash='#/shifts'">🧾 Shifts</button></div>

      <div style="margin-top:12px;padding:10px;background:#f6ffed;border-radius:10px;border:1px solid #b7eb8f"><div style="font-size:11px;color:#389e0d;text-align:center">✅ Simple: Gross - Expenses = Net = whole amount to owner • To Handover = Net - Payments • No jackpot collections</div></div>
    </div>
  `;
  const switchEl = root.querySelector('#stationSwitch');
  if (switchEl) switchEl.addEventListener('change', e=>{ setState({ currentStationId: e.target.value }); dashboardView({ root }); });
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
