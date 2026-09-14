import { getState, setState } from '../state.js';
import { getBusinessDate, formatBusinessDate, formatBusinessTime } from '../services/datetime.js';
import { getStationsForCurrentUser } from '../services/stations.js';
import { getShifts, getActiveShiftForUser } from '../services/shifts.js';
import { formatCurrency, formatLiters } from '../services/calc.js';
import { getStockSummary, normalizeFuel, FUEL_LABEL } from '../services/stock.js';
import { getActivePrices } from '../services/prices.js';

export async function dashboardView({ root }) {
  const { user, currentStationId } = getState();

  if (user.role === 'super_admin') {
    const { getAllStations } = await import('../services/stations.js');
    const { getEmployees } = await import('../services/users.js');
    const stations = await getAllStations();
    const users = await getEmployees();
    const owners = users.filter(u=>u.role==='owner');
    root.innerHTML = `
      <div class="container" style="max-width:520px;margin:0 auto;padding-bottom:100px">
        <div style="background:linear-gradient(135deg,#1a2535 0%,#2c3e50 100%);border-radius:20px;padding:20px;color:white">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div><h1 style="font-size:22px;font-weight:800">Super Admin 🔧</h1><p style="font-size:13px;opacity:0.7;margin-top:4px">${user.name}</p><p style="font-size:11px;opacity:0.5;margin-top:2px">Developer • Invite Only</p></div>
            <button class="neu-btn" style="min-height:40px;min-width:40px;border-radius:12px;background:rgba(255,255,255,0.1);color:white;border:none" onclick="location.hash='#/settings'">⚙️</button>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:20px">
            <div style="background:rgba(255,255,255,0.08);border-radius:14px;padding:14px;text-align:center"><div style="font-size:11px;opacity:0.6">STATIONS</div><div style="font-size:24px;font-weight:800;margin-top:4px">${stations.length}</div><div style="font-size:10px;opacity:0.5">${owners.length} owners</div></div>
            <div style="background:rgba(255,255,255,0.08);border-radius:14px;padding:14px;text-align:center"><div style="font-size:11px;opacity:0.6">USERS</div><div style="font-size:24px;font-weight:800;margin-top:4px">${users.length}</div><div style="font-size:10px;opacity:0.5">Invite only</div></div>
          </div>
        </div>
        <div style="background:white;border-radius:16px;padding:20px;margin-top:16px;border:1px solid var(--border);text-align:center">
          <div style="font-size:32px">👑</div>
          <h3 style="font-weight:800;margin-top:8px">Invite New Owner</h3>
          <p style="font-size:12px;color:var(--text-secondary);margin-top:6px">Developer invites owners with site name + phone + PIN</p>
          <button style="margin-top:14px;min-height:48px;border-radius:12px;padding:0 24px;font-weight:700;background:#1a2535;color:white;border:none;width:100%" onclick="location.hash='#/super-admin'">Go to Invite Panel →</button>
        </div>
      </div>
    `;
    return;
  }

  const stations = await getStationsForCurrentUser();
  if (stations.length === 0) {
    root.innerHTML = `
      <div class="container" style="max-width:480px;margin:0 auto;padding-bottom:100px">
        <div style="padding:20px 0">
          <h1 style="font-size:26px;font-weight:800;letter-spacing:-0.5px">Good Morning 👋</h1>
          <p style="font-size:13px;color:var(--text-secondary);margin-top:4px">${user.name || user.phone} • Let's get started</p>
        </div>
        <div style="background:white;border-radius:20px;padding:24px;text-align:center;border:1px solid var(--border);margin-top:20px">
          <div style="width:64px;height:64px;border-radius:20px;background:#f0f0f0;display:grid;place-items:center;margin:0 auto;font-size:32px">🏗️</div>
          <h3 style="margin-top:16px;font-weight:800;font-size:18px">No Stations Yet</h3>
          <p style="font-size:13px;color:var(--text-secondary);margin-top:8px;line-height:1.5">Create your first fuel station to get started with daily operations</p>
          <button style="margin-top:20px;min-height:52px;border-radius:14px;padding:0 28px;font-weight:700;background:#1a2535;color:white;border:none;width:100%" onclick="location.hash='#/stations'">Create Station →</button>
        </div>
      </div>`;
    return;
  }

  let activeStationId = currentStationId || stations[0].id;
  if (!currentStationId) setState({ currentStationId: activeStationId });
  const activeStation = stations.find(s=>s.id===activeStationId) || stations[0];

  // Fetch all needed data
  const allShifts = await getShifts(activeStation.id);
  const myShifts = allShifts.filter(s=>s.userId===user.uid);
  const todayStr = getBusinessDate(new Date()); // IST business date
  
  const isOwner = user.role === 'owner';
  const isManager = user.role === 'manager';
  const isAdmin = user.role === 'admin';
  const isAttendant = user.role === 'attendant';
  const canSeeAll = isOwner || isManager || isAdmin;

  // Expenses map
  let expenseMap = {};
  try {
    const { queryDocs } = await import('../services/firestoreService.js');
    const allTx = await queryDocs('transactions', null, [{ field: 'stationId', op: '==', value: activeStation.id }, { field: 'type', op: '==', value: 'expense' }]);
    allTx.forEach(tx=>{ if (tx.shiftId) expenseMap[tx.shiftId] = (expenseMap[tx.shiftId]||0)+Number(tx.amount||0); });
  } catch {}

  // Pumps and nozzles for occupancy
  let pumps = [], nozzles = [], employees = [];
  try {
    const { getPumps, getNozzles } = await import('../services/pumps.js');
    const { getEmployees } = await import('../services/users.js');
    pumps = await getPumps(activeStation.id);
    nozzles = await getNozzles(activeStation.id);
    employees = await getEmployees(activeStation.id);
  } catch {}

  // Stock ledger + today's prices for the owner hero box.
  let stockSummary = {}, activePriceMap = {};
  try { stockSummary = await getStockSummary(activeStation.id, allShifts); } catch {}
  try { activePriceMap = await getActivePrices(activeStation.id); } catch {}

  // Present MS and HSD first, then anything else the station actually stocks.
  const priceByFuel = {};
  Object.entries(activePriceMap || {}).forEach(([ft, p]) => { priceByFuel[normalizeFuel(ft)] = p?.price; });
  const fuelKeys = Array.from(new Set(['MS','HSD', ...Object.keys(stockSummary), ...Object.keys(priceByFuel)]));
  const stockRows = fuelKeys.map(f => ({
    fuel: f,
    label: FUEL_LABEL[f] || f,
    available: stockSummary[f]?.available ?? null,
    price: priceByFuel[f] ?? null,
    hasData: !!stockSummary[f] || priceByFuel[f] != null,
  })).filter(r => r.fuel === 'MS' || r.fuel === 'HSD' || r.hasData);

  // Today calculations
  const todayShiftsAll = allShifts.filter(s=> getBusinessDate(s.startTime)===todayStr);
  let totalSalesAll = 0, totalGrossAll = 0, totalExpAll = 0, totalLitersAll = 0, totalPaymentsAll = 0;
  const fuelAgg = {};
  todayShiftsAll.forEach(s=>{ 
    const gross = s.totals?.totalRevenue||0;
    const exp = expenseMap[s.id]||0;
    const net = gross - exp;
    totalGrossAll += gross;
    totalExpAll += exp;
    totalSalesAll += net;
    totalLitersAll += s.totals?.totalLiters||0;
    totalPaymentsAll += s.totals?.totalPayments||0;
    if (s.totals?.byFuel) {
      Object.entries(s.totals.byFuel).forEach(([ft, v])=>{
        if (!fuelAgg[ft]) fuelAgg[ft] = { liters:0, revenue:0 };
        fuelAgg[ft].liters += v.liters||0;
        fuelAgg[ft].revenue += v.revenue||0;
      });
    }
  });
  // MS = Petrol, HSD = Diesel breakdown for small box
  let msLitersAll = 0, hsdLitersAll = 0, otherLitersAll = 0;
  Object.entries(fuelAgg).forEach(([ft, v])=>{
    const f = ft.toLowerCase();
    if (f.includes('petrol') || f.includes('ms')) msLitersAll += v.liters||0;
    else if (f.includes('diesel') || f.includes('hsd')) hsdLitersAll += v.liters||0;
    else otherLitersAll += v.liters||0;
  });

  const todayShiftsMy = myShifts.filter(s=> getBusinessDate(s.startTime)===todayStr);
  let totalSalesMy = 0, totalLitersMy = 0, varianceMy = 0, toHandoverMy = 0, myGross = 0, myExp = 0;
  let msLitersMy = 0, hsdLitersMy = 0;
  const myFuelAgg = {};
  todayShiftsMy.forEach(s=>{ 
    const gross = s.totals?.totalRevenue||0;
    const exp = expenseMap[s.id]||0;
    const net = gross - exp;
    myGross += gross;
    myExp += exp;
    totalSalesMy += net;
    totalLitersMy += s.totals?.totalLiters||0; 
    const payments = s.totals?.totalPayments||0;
    const netVar = payments - net;
    varianceMy += netVar;
    if (netVar < -0.5) toHandoverMy += Math.abs(netVar);
    if (s.totals?.byFuel) {
      Object.entries(s.totals.byFuel).forEach(([ft, v])=>{
        if (!myFuelAgg[ft]) myFuelAgg[ft] = { liters:0 };
        myFuelAgg[ft].liters += v.liters||0;
      });
    }
  });
  Object.entries(myFuelAgg).forEach(([ft, v])=>{
    const f = ft.toLowerCase();
    if (f.includes('petrol') || f.includes('ms')) msLitersMy += v.liters||0;
    else if (f.includes('diesel') || f.includes('hsd')) hsdLitersMy += v.liters||0;
  });

  const activeShifts = allShifts.filter(s=>s.status==='ACTIVE');
  const pendingShifts = allShifts.filter(s=>s.status==='PENDING_REVIEW');
  const myActiveShift = await getActiveShiftForUser(user.uid);
  const myPending = myShifts.filter(s=>s.status==='PENDING_REVIEW').length;
  const myRejected = myShifts.filter(s=>s.status==='REJECTED').length;
  const approvedToday = todayShiftsAll.filter(s=>s.status==='APPROVED').length;

  // Pump occupancy
  const pumpOccupancy = {};
  pumps.forEach(p => { pumpOccupancy[p.id] = { occupied:false, employeeName:null, shift:null }; });
  activeShifts.forEach(shift => {
    (shift.nozzles||[]).forEach(n => {
      if (pumpOccupancy[n.pumpId]) {
        pumpOccupancy[n.pumpId].occupied = true;
        pumpOccupancy[n.pumpId].employeeName = shift.employeeName;
        pumpOccupancy[n.pumpId].shift = shift;
      }
    });
  });
  const freePumps = pumps.filter(p=>!pumpOccupancy[p.id]?.occupied).length;
  const busyPumps = pumps.length - freePumps;

  // Removed from the owner dashboard (kept as one-line derivations so the
  // blocks can be reinstated one at a time, per the staged cleanup):
  //   - per-employee performance ranking  (perfByEmp / topPerformers)
  //   - "To Receive from staff" total     (toHandoverToday)

  if (isAttendant) {
    root.innerHTML = `
      <div class="container" style="max-width:520px;margin:0 auto;padding-bottom:110px">
        <!-- Header Banking -->
        <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0">
          <div>
            <div style="font-size:12px;color:var(--text-secondary);letter-spacing:0.5px">${getGreeting().toUpperCase()} • ${new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}</div>
            <h1 style="font-size:24px;font-weight:800;letter-spacing:-0.5px;margin-top:2px">Hi ${user.name?.split(' ')[0] || 'there'} 👋</h1>
            <p style="font-size:12px;color:var(--text-secondary);margin-top:2px">⛽ ${activeStation.name} • Attendant</p>
          </div>
          <div style="display:flex;gap:8px">
            ${stations.length>1 ? `<select id="stationSwitch" style="min-height:40px;border-radius:12px;border:1.5px solid var(--border);padding:0 10px;font-size:12px;font-weight:600;background:white"><option>${activeStation.name}</option>${stations.map(s=>`<option value="${s.id}" ${s.id===activeStation.id?'selected':''}>${s.name}</option>`).join('')}</select>` : ''}
            <button style="width:40px;height:40px;border-radius:12px;border:1.5px solid var(--border);background:white;display:grid;place-items:center" onclick="location.hash='#/settings'">⚙️</button>
          </div>
        </div>

        <!-- Hero My Performance Banking -->
        <div style="background:linear-gradient(135deg,#1a2535 0%,#2c3e50 100%);border-radius:20px;padding:20px;color:white;margin-top:16px;position:relative;overflow:hidden">
          <div style="position:absolute;top:-30px;right:-30px;width:140px;height:140px;background:rgba(255,90,31,0.12);border-radius:50%"></div>
          <div style="position:absolute;bottom:-20px;left:-20px;width:100px;height:100px;background:rgba(82,196,26,0.08);border-radius:50%"></div>
          <div style="position:relative;z-index:1">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <div>
                <div style="font-size:10px;opacity:0.6;letter-spacing:1px">MY PERFORMANCE TODAY • NET</div>
                <div style="font-size:28px;font-weight:800;margin-top:6px;letter-spacing:-0.8px">${formatCurrency(totalSalesMy)}</div>
                <div style="font-size:10px;opacity:0.5;margin-top:4px">Gross ${formatCurrency(myGross)} - Exp ${formatCurrency(myExp)} = Net • ${todayShiftsMy.length} shifts</div>
              </div>
              <div style="text-align:right">
                <div style="font-size:10px;opacity:0.6;letter-spacing:1px">FUEL SOLD • TODAY</div>
                <div style="margin-top:6px;background:rgba(255,255,255,0.08);border-radius:10px;padding:8px 10px;border:1px solid rgba(255,255,255,0.12)">
                  <div style="display:flex;justify-content:space-between;gap:12px;font-size:11px">
                    <div><span style="opacity:0.6">MS</span><div style="font-weight:700;font-size:13px;margin-top:2px">${formatLiters(msLitersMy).replace(' L','')}</div></div>
                    <div style="width:1px;background:rgba(255,255,255,0.1)"></div>
                    <div><span style="opacity:0.6">HSD</span><div style="font-weight:700;font-size:13px;margin-top:2px">${formatLiters(hsdLitersMy).replace(' L','')}</div></div>
                  </div>
                  <div style="font-size:9px;opacity:0.5;margin-top:6px;text-align:center;border-top:1px solid rgba(255,255,255,0.08);padding-top:4px">Total ${formatLiters(totalLitersMy)} • Avg ${todayShiftsMy.length? formatLiters(totalLitersMy/todayShiftsMy.length):'0 L'}/shift</div>
                </div>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px">
              <div style="background:rgba(255,255,255,0.07);border-radius:12px;padding:12px">
                <div style="font-size:10px;opacity:0.6">TO HANDOVER</div>
                <div style="font-size:16px;font-weight:700;margin-top:2px;color:${toHandoverMy>0?'#ff8c61':'#95de64'}">${formatCurrency(toHandoverMy)}</div>
                <div style="font-size:9px;opacity:0.5;margin-top:2px">${toHandoverMy>0?'Give to owner after approval':'All settled'}</div>
              </div>
              <div style="background:rgba(255,255,255,0.07);border-radius:12px;padding:12px">
                <div style="font-size:10px;opacity:0.6">MY SHIFTS</div>
                <div style="font-size:16px;font-weight:700;margin-top:2px">${myShifts.length} total</div>
                <div style="font-size:9px;opacity:0.5;margin-top:2px">${myPending} pending • ${myRejected} correction</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Active Shift Banking -->
        ${myActiveShift ? `
          <div style="background:white;border-radius:16px;padding:16px;margin-top:14px;border:1.5px solid #91caff;position:relative;overflow:hidden">
            <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#1677ff,#91caff,#1677ff);background-size:200% 100%;animation:shimmer 2s linear infinite"></div>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div style="display:flex;align-items:center;gap:10px">
                <div style="width:12px;height:12px;background:#52c41a;border-radius:50%;animation:pulse 1.2s infinite;box-shadow:0 0 8px #52c41a"></div>
                <span style="font-size:11px;font-weight:700;letter-spacing:0.5px;color:#1677ff">ACTIVE SHIFT • LIVE FUELING</span>
              </div>
              <span style="font-size:10px;background:#e6f4ff;color:#0958d9;padding:4px 8px;border-radius:12px;font-weight:600">${myActiveShift.nozzles?.length||0} nozzles</span>
            </div>
            <div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center">
              <div>
                <div style="font-weight:800;font-size:16px">${myActiveShift.employeeName}</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">Started ${new Date(myActiveShift.startTime).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} • ${myActiveShift.nozzles?.length||0} pumps active</div>
                <div style="margin-top:8px;display:flex;gap:6px">${(myActiveShift.nozzles||[]).map(n=>`<span style="font-size:10px;background:#f0f0f0;padding:4px 8px;border-radius:8px;font-weight:600">${n.fuelType}</span>`).join('')}</div>
              </div>
              <button style="min-height:48px;padding:0 20px;border-radius:12px;background:#1677ff;color:white;border:none;font-weight:700;font-size:14px" onclick="location.hash='#/shifts/${myActiveShift.id}'">Open →</button>
            </div>
          </div>
        ` : `
          <div style="background:white;border-radius:16px;padding:20px;margin-top:14px;border:1px solid var(--border);text-align:center">
            <div style="width:56px;height:56px;border-radius:16px;background:#f6ffed;display:grid;place-items:center;margin:0 auto;font-size:28px">▶️</div>
            <h3 style="font-weight:800;font-size:16px;margin-top:12px">No active shift</h3>
            <p style="font-size:12px;color:var(--text-secondary);margin-top:4px">Start a new shift to begin fueling and track your work</p>
            <button style="margin-top:16px;min-height:52px;border-radius:14px;padding:0 24px;font-weight:800;background:#1a2535;color:white;border:none;width:100%" onclick="location.hash='#/shifts/start'">Start Shift →</button>
          </div>
        `}

        ${myRejected>0 ? `
          <div style="background:#fff1f0;border-radius:14px;padding:14px;margin-top:14px;border:1px solid #ffa39e">
            <div style="display:flex;align-items:center;gap:8px"><span style="font-size:18px">⚠️</span><span style="font-weight:700;font-size:13px;color:#cf1322">${myRejected} correction(s) requested</span></div>
            <p style="font-size:11px;color:var(--text-secondary);margin-top:6px">Manager pointed at specific fields. Fix and resubmit quickly.</p>
            <button style="margin-top:10px;min-height:40px;border-radius:10px;width:100%;background:white;border:1px solid #ffa39e;color:#cf1322;font-weight:600;font-size:13px" onclick="location.hash='#/shifts'">View & Fix →</button>
          </div>
        ` : ''}

        <!-- Pump Overview for Attendant - Banking -->
        <div style="background:white;border-radius:16px;padding:16px;margin-top:14px;border:1px solid var(--border)">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:13px;font-weight:800">⛽ Pump Status • Live</span>
            <span style="font-size:11px;background:var(--bg);padding:4px 10px;border-radius:20px">${pumps.length} pumps • ${freePumps} free • ${busyPumps} busy</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px">
            ${pumps.slice(0,6).map(p=>{
              const occ = pumpOccupancy[p.id];
              const isFree = !occ?.occupied;
              return `<div style="padding:10px;border-radius:12px;background:${isFree?'#f6ffed':'#fff1f0'};border:1px solid ${isFree?'#b7eb8f':'#ffa39e'};text-align:center">
                <div style="font-size:16px">${isFree?'🟢':'🔴'}</div>
                <div style="font-weight:700;font-size:11px;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
                <div style="font-size:9px;color:var(--text-secondary);margin-top:2px">${isFree?'Free':'Busy'}</div>
                ${!isFree ? `<div style="font-size:8px;color:#cf1322;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${occ.employeeName?.split(' ')[0]||''}</div>` : ''}
              </div>`;
            }).join('') || `<div style="grid-column:span 3;text-align:center;padding:12px;color:var(--text-secondary);font-size:12px">No pumps</div>`}
          </div>
          ${pumps.length>6 ? `<div style="text-align:center;margin-top:10px"><button style="font-size:11px;background:var(--bg);border:1px solid var(--border);padding:6px 12px;border-radius:20px;font-weight:600" onclick="location.hash='#/pumps'">View all ${pumps.length} pumps →</button></div>` : ''}
        </div>

        <!-- Quick Actions Banking -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">
          <button style="min-height:56px;border-radius:14px;background:white;border:1px solid var(--border);font-weight:600;font-size:13px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px" onclick="location.hash='#/pumps'"><span style="font-size:20px">⛽</span>My Pumps</button>
          <button style="min-height:56px;border-radius:14px;background:white;border:1px solid var(--border);font-weight:600;font-size:13px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px" onclick="location.hash='#/shifts'"><span style="font-size:20px">🧾</span>My Shifts</button>
          <button style="min-height:56px;border-radius:14px;background:#1a2535;color:white;border:none;font-weight:700;font-size:13px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px" onclick="location.hash='#/shifts/start'"><span style="font-size:20px">▶️</span>Start Shift</button>
          <button style="min-height:56px;border-radius:14px;background:white;border:1px solid var(--border);font-weight:600;font-size:13px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px" onclick="location.hash='#/reports'"><span style="font-size:20px">📊</span>My Reports</button>
        </div>

        <!-- My Recent Shifts -->
        <div style="background:white;border-radius:16px;padding:16px;margin-top:14px;border:1px solid var(--border)">
          <div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:13px;font-weight:800">🧾 My Recent Shifts</span><button style="font-size:11px;background:var(--bg);border:1px solid var(--border);padding:4px 10px;border-radius:20px;font-weight:600" onclick="location.hash='#/shifts'">View all</button></div>
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">
            ${myShifts.slice(0,4).map(s=>{
              const gross = s.totals?.totalRevenue||0;
              const exp = expenseMap[s.id]||0;
              const net = gross - exp;
              const statusColor = s.status==='APPROVED' ? '#52c41a' : s.status==='PENDING_REVIEW' ? '#faad14' : s.status==='REJECTED' ? '#ff4d4f' : '#1677ff';
              return `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:#f8f9fa;border-radius:12px;border-left:3px solid ${statusColor};cursor:pointer" onclick="location.hash='#/shifts/${s.id}'">
                <div><div style="font-weight:600;font-size:13px">${new Date(s.startTime).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})} • ${formatCurrency(net)}</div><div style="font-size:11px;color:var(--text-secondary)">${formatLiters(s.totals?.totalLiters||0)} • ${s.status}</div></div>
                <span style="font-size:10px;background:white;padding:4px 8px;border-radius:12px;border:1px solid ${statusColor};color:${statusColor};font-weight:600">${s.status}</span>
              </div>`;
            }).join('') || `<p style="font-size:12px;color:var(--text-secondary);text-align:center;padding:12px">No shifts yet</p>`}
          </div>
        </div>
      </div>
      <style>@keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.2);opacity:0.7}}@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}</style>
    `;
    const switchEl = root.querySelector('#stationSwitch');
    if (switchEl) switchEl.addEventListener('change', e=>{ setState({ currentStationId: e.target.value }); dashboardView({ root }); });
    return;
  }

  // Owner / Manager Banking Elegant Dashboard
  root.innerHTML = `
    <div class="container" style="max-width:520px;margin:0 auto;padding-bottom:110px">
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0">
        <div>
          <div style="font-size:11px;color:var(--text-secondary);letter-spacing:0.8px;text-transform:uppercase">${getGreeting().toUpperCase()} • ${formatBusinessDate(new Date())}</div>
          <h1 style="font-size:20px;font-weight:800;letter-spacing:-0.4px;margin-top:4px;line-height:1.25">⛽ ${activeStation.name}</h1>
          <p style="font-size:12px;color:var(--text-secondary);margin-top:4px">${user.name?.split(' ')[0] || 'Owner'} 👋</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          ${stations.length>1 ? `<select id="stationSwitch" style="min-height:40px;border-radius:12px;border:1.5px solid var(--border);padding:0 10px;font-size:12px;font-weight:600;background:white;max-width:110px">${stations.map(s=>`<option value="${s.id}" ${s.id===activeStation.id?'selected':''}>${s.name}</option>`).join('')}</select>` : ''}
          <button style="width:40px;height:40px;border-radius:12px;border:1.5px solid var(--border);background:white;display:grid;place-items:center;font-size:16px" onclick="location.hash='#/settings'">⚙️</button>
        </div>
      </div>

      <!-- 1. HERO • Stock in tank + today's price -->
      <div style="background:linear-gradient(135deg,#1a2535 0%,#2c3e50 100%);border-radius:20px;padding:20px;color:white;margin-top:16px;position:relative;overflow:hidden">
        <div style="position:absolute;top:-40px;right:-40px;width:160px;height:160px;background:rgba(255,90,31,0.10);border-radius:50%"></div>
        <div style="position:relative;z-index:1">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div style="font-size:10px;opacity:0.6;letter-spacing:1px">STOCK IN TANK</div>
            <!-- Tanker intake + price updates now live together on #/prices (More > Fuel Prices & Stock). -->
            <button style="background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);color:white;font-size:11px;font-weight:700;padding:6px 12px;border-radius:20px" onclick="location.hash='#/prices'">Manage</button>
          </div>

          <div style="margin-top:12px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:14px;overflow:hidden">
            ${stockRows.map((r,i)=>`
              <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 14px;${i>0?'border-top:1px solid rgba(255,255,255,0.08)':''}">
                <div style="min-width:64px">
                  <div style="font-weight:800;font-size:14px;letter-spacing:0.5px">${r.fuel}</div>
                  <div style="font-size:9px;opacity:0.5">${r.label}</div>
                </div>
                <div style="text-align:right;flex:1">
                  <div style="font-size:9px;opacity:0.5;letter-spacing:0.5px">STOCK</div>
                  <div style="font-weight:800;font-size:17px;margin-top:1px;${r.available!=null&&r.available<=1000?'color:#ff7875':''}">${r.available==null?'—':formatLiters(r.available).replace(' L','')}<span style="font-size:10px;opacity:0.5;font-weight:600"> L</span></div>
                </div>
                <div style="width:1px;align-self:stretch;background:rgba(255,255,255,0.1);margin:0 14px"></div>
                <div style="text-align:right;min-width:78px">
                  <div style="font-size:9px;opacity:0.5;letter-spacing:0.5px">TODAY'S PRICE</div>
                  <div style="font-weight:800;font-size:17px;margin-top:1px">${r.price==null?'—':formatCurrency(r.price)}</div>
                </div>
              </div>`).join('')}
          </div>

          <div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;font-size:11px;opacity:0.65">
            <span>${activeShifts.length} running now</span>
            <span>${formatLiters(totalLitersAll).replace(' L','')} L sold today</span>
          </div>
        </div>
      </div>

      <!-- 2. PUMPS • live status -->
      <div style="background:white;border-radius:16px;padding:16px;margin-top:14px;border:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:13px;font-weight:800">⛽ Pumps • Live</span>
          <span style="font-size:11px;background:#f6ffed;color:#389e0d;padding:4px 10px;border-radius:20px;font-weight:600;border:1px solid #b7eb8f">${freePumps} free • ${busyPumps} busy</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px">
          ${pumps.map(p=>{
            const busy = activeShifts.some(s=>(s.nozzles||[]).some(n=>n.pumpId===p.id));
            const who = busy ? activeShifts.find(s=>(s.nozzles||[]).some(n=>n.pumpId===p.id))?.employeeName : null;
            return `<div style="background:${busy?'#fff7e6':'#f6ffed'};border:1px solid ${busy?'#ffd591':'#b7eb8f'};border-radius:12px;padding:10px 6px;text-align:center">
              <div style="font-size:18px">${busy?'🔴':'🟢'}</div>
              <div style="font-weight:700;font-size:11px;margin-top:2px">${p.name||('P'+p.number)}</div>
              <div style="font-size:9px;color:var(--text-secondary);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${busy? (who||'Busy').split(' ')[0] : 'Free'}</div>
            </div>`;
          }).join('') || `<div style="grid-column:1/-1;text-align:center;padding:12px;font-size:11px;color:var(--text-secondary)">No pumps configured</div>`}
        </div>
      </div>

      <!-- 3. NEEDS ATTENTION • pending review -->
      ${pendingShifts.length>0 ? `
        <div style="background:white;border-radius:16px;padding:16px;margin-top:14px;border:1px solid #ffe58f">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:13px;font-weight:800">⏳ Needs Review • ${pendingShifts.length}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">
            ${pendingShifts.slice(0,3).map(s=>`
              <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:#fffbe6;border-radius:12px;border:1px solid #ffe58f">
                <div style="display:flex;align-items:center;gap:10px">
                  <div style="width:36px;height:36px;border-radius:50%;background:#1a2535;color:white;display:grid;place-items:center;font-weight:700;font-size:12px">${(s.employeeName||'?')[0]}</div>
                  <div>
                    <div style="font-weight:700;font-size:13px">${s.employeeName}</div>
                    <div style="font-size:11px;color:var(--text-secondary)">${formatLiters(s.totals?.totalLiters||0)} • ${formatBusinessTime(s.startTime)}</div>
                  </div>
                </div>
                <button style="min-height:36px;padding:0 14px;border-radius:10px;background:#1a2535;color:white;border:none;font-weight:700;font-size:12px" onclick="location.hash='#/shifts/${s.id}'">Review →</button>
              </div>`).join('')}
          </div>
          ${pendingShifts.length>3 ? `<div style="text-align:center;margin-top:10px"><button style="font-size:11px;background:var(--bg);border:1px solid var(--border);padding:6px 14px;border-radius:20px;font-weight:600" onclick="location.hash='#/shifts'">View all ${pendingShifts.length} →</button></div>` : ''}
        </div>
      ` : `
        <div style="background:white;border-radius:16px;padding:16px;margin-top:14px;border:1px solid var(--border);text-align:center">
          <div style="font-size:22px">✅</div>
          <div style="font-weight:700;font-size:13px;margin-top:6px">All shifts reviewed</div>
        </div>
      `}

      ${myActiveShift ? `
        <div style="background:white;border-radius:16px;padding:14px;margin-top:14px;border:1.5px solid #91caff;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:11px;font-weight:700;letter-spacing:0.5px;color:#0958d9">MY ACTIVE SHIFT</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">Started ${formatBusinessTime(myActiveShift.startTime)}</div>
          </div>
          <button style="min-height:40px;padding:0 16px;border-radius:10px;background:#1677ff;color:white;border:none;font-weight:700" onclick="location.hash='#/shifts/${myActiveShift.id}'">Open →</button>
        </div>
      ` : `
        <button style="width:100%;min-height:52px;border-radius:14px;background:#1a2535;color:white;border:none;font-weight:700;font-size:14px;margin-top:14px;display:flex;align-items:center;justify-content:center;gap:8px" onclick="location.hash='#/shifts/start'"><span style="font-size:18px">▶️</span>Start Shift</button>
      `}
    </div>
    <style>@keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.3);opacity:0.7}}</style>
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
