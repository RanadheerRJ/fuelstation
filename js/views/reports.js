import { getState } from '../state.js';
import { getStationsForCurrentUser } from '../services/stations.js';
import { getReportForRange } from '../services/reports.js';
import { getShifts } from '../services/shifts.js';
import { formatCurrency, formatLiters } from '../services/calc.js';
import { getEmployees } from '../services/users.js';

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
  let fuelFilter = query.fuel || 'all';
  let statusFilter = query.status || 'ALL';

  if (isAttendant) employeeFilter = user.uid;

  const allShiftsRaw = await getShifts(stationId);

  let employeesList = [];
  try {
    employeesList = await getEmployees(stationId);
    if (employeesList.length===0) {
      const uniq = {};
      allShiftsRaw.forEach(s=>{ uniq[s.userId]=s.employeeName; });
      employeesList = Object.entries(uniq).map(([uid, name])=>({ uid, id: uid, name, role: 'attendant' }));
    }
  } catch { employeesList = []; }

  // Fetch pumps for mapping
  let pumps = [], nozzles = [];
  try {
    const { getPumps, getNozzles } = await import('../services/pumps.js');
    pumps = await getPumps(stationId);
    nozzles = await getNozzles(stationId);
  } catch {}

  const report = await getReportForRange(stationId, fromDate, toDate, {
    employeeId: employeeFilter,
    status: statusFilter,
  });

  // Fuel type filtering (MS = Petrol, HSD = Diesel)
  let filteredShifts = report.shifts;
  if (fuelFilter !== 'all') {
    filteredShifts = filteredShifts.filter(s=>{
      return (s.nozzles||[]).some(n=>{
        const ft = (n.fuelType||'').toLowerCase();
        if (fuelFilter==='MS') return ft.includes('petrol') || ft.includes('ms');
        if (fuelFilter==='HSD') return ft.includes('diesel') || ft.includes('hsd');
        if (fuelFilter==='CNG') return ft.includes('cng');
        return ft === fuelFilter.toLowerCase() || ft.includes(fuelFilter.toLowerCase());
      });
    });
  }

  // Recalculate totals for filtered by fuel
  let totalLitersFiltered = 0, totalNetFiltered = 0, msFiltered = 0, hsdFiltered = 0;
  filteredShifts.forEach(s=>{
    const gross = s.totals?.totalRevenue||0;
    const exp = (report.expenseByShift||{})[s.id]||0;
    const net = gross - exp;
    totalNetFiltered += net;
    const liters = s.totals?.totalLiters||0;
    totalLitersFiltered += liters;
    (s.nozzles||[]).forEach(n=>{
      const ft = (n.fuelType||'').toLowerCase();
      if (ft.includes('petrol') || ft.includes('ms')) msFiltered += n.litersSold||0;
      else if (ft.includes('diesel') || ft.includes('hsd')) hsdFiltered += n.litersSold||0;
    });
  });

  const fmt = (v) => formatCurrency(v);
  const fmtLit = (v) => formatLiters(v);

  const rangeLabel = fromDate===todayStr && toDate===todayStr ? 'Today' :
                     fromDate===yesterdayStr && toDate===yesterdayStr ? 'Yesterday' :
                     fromDate===weekStr && toDate===todayStr ? 'Last 7 Days' :
                     fromDate===monthStart && toDate===todayStr ? 'This Month' :
                     fromDate===last30Str && toDate===todayStr ? 'Last 30 Days' :
                     fromDate===allTime ? 'All Time' : `${fromDate.slice(5)} → ${toDate.slice(5)}`;

  // Fuel types available
  const fuelTypesAvailable = [...new Set(allShiftsRaw.flatMap(s=> (s.nozzles||[]).map(n=>n.fuelType)).filter(Boolean))];

  root.innerHTML = `
    <div class="container" style="max-width:520px;margin:0 auto;padding-bottom:110px">
      <!-- Header Clean -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div>
          <h1 style="font-size:22px;font-weight:800;letter-spacing:-0.5px">Reports</h1>
          <p style="font-size:12px;color:var(--text-secondary);margin-top:2px">${stations.find(s=>s.id===stationId)?.name} • ${rangeLabel} • ${filteredShifts.length} shifts • ${fuelFilter!=='all'? fuelFilter+' filtered' : 'All fuel'}</p>
        </div>
        <button style="min-height:40px;padding:0 14px;border-radius:12px;background:white;border:1.5px solid var(--border);font-weight:700;font-size:13px" id="exportBtn">⬇️ Export</button>
      </div>

      <!-- Summary Clean - Only what we want to see -->
      <div style="background:linear-gradient(135deg,#1a2535 0%,#2c3e50 100%);border-radius:20px;padding:18px;color:white;position:relative;overflow:hidden">
        <div style="position:absolute;top:-20px;right:-20px;width:120px;height:120px;background:rgba(255,90,31,0.12);border-radius:50%"></div>
        <div style="position:relative;z-index:1">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-size:10px;opacity:0.6;letter-spacing:1px">TOTAL SHIFTS • ${rangeLabel}</div>
              <div style="font-size:28px;font-weight:800;margin-top:4px">${filteredShifts.length}</div>
              <div style="font-size:10px;opacity:0.5;margin-top:2px">${fmt(totalNetFiltered)} net • ${todayStr===fromDate&&todayStr===toDate?'Today':'Filtered'}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:10px;opacity:0.6;letter-spacing:1px">FUEL SOLD</div>
              <div style="margin-top:6px;background:rgba(255,255,255,0.08);border-radius:10px;padding:8px 10px;border:1px solid rgba(255,255,255,0.12);min-width:130px">
                <div style="display:flex;justify-content:space-between;gap:12px">
                  <div style="text-align:center"><div style="font-size:9px;opacity:0.6">MS</div><div style="font-weight:800;font-size:13px;margin-top:2px">${fmtLit(msFiltered).replace(' L','')}</div></div>
                  <div style="width:1px;background:rgba(255,255,255,0.1)"></div>
                  <div style="text-align:center"><div style="font-size:9px;opacity:0.6">HSD</div><div style="font-weight:800;font-size:13px;margin-top:2px">${fmtLit(hsdFiltered).replace(' L','')}</div></div>
                </div>
                <div style="font-size:9px;opacity:0.5;margin-top:6px;text-align:center;border-top:1px solid rgba(255,255,255,0.08);padding-top:4px">Total ${fmtLit(totalLitersFiltered)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Filters Clean - Date, Employee, Fuel Type -->
      <div style="background:white;border-radius:16px;padding:14px;margin-top:14px;border:1px solid var(--border)">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.5px">🔍 FILTERS • Date • Employee • Fuel</div>
        
        <!-- Date Quick -->
        <div style="margin-top:12px">
          <div style="font-size:10px;color:var(--text-secondary);font-weight:600;margin-bottom:6px">DATE</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">
            ${[
              {label:'Today', from: todayStr, to: todayStr, active: fromDate===todayStr && toDate===todayStr},
              {label:'Yesterday', from: yesterdayStr, to: yesterdayStr, active: fromDate===yesterdayStr && toDate===yesterdayStr},
              {label:'7 Days', from: weekStr, to: todayStr, active: fromDate===weekStr && toDate===todayStr},
              {label:'Month', from: monthStart, to: todayStr, active: fromDate===monthStart && toDate===todayStr},
              {label:'30 Days', from: last30Str, to: todayStr, active: fromDate===last30Str && toDate===todayStr},
              {label:'All', from: allTime, to: todayStr, active: fromDate===allTime},
            ].map(b=>`<button class="preset-btn" data-from="${b.from}" data-to="${b.to}" style="min-height:40px;border-radius:10px;border:1.5px solid ${b.active?'#1a2535':'var(--border)'};background:${b.active?'#1a2535':'white'};color:${b.active?'white':'var(--text-primary)'};font-weight:600;font-size:12px">${b.label}</button>`).join('')}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
            <input type="date" id="fromDate" value="${fromDate}" style="min-height:40px;border-radius:10px;border:1.5px solid var(--border);padding:0 10px;font-size:12px;width:100%">
            <input type="date" id="toDate" value="${toDate}" style="min-height:40px;border-radius:10px;border:1.5px solid var(--border);padding:0 10px;font-size:12px;width:100%">
          </div>
        </div>

        <!-- Employee Filter -->
        ${canSeeAll ? `
        <div style="margin-top:14px">
          <div style="font-size:10px;color:var(--text-secondary);font-weight:600;margin-bottom:6px">EMPLOYEE • Who worked</div>
          <div style="display:flex;gap:6px;overflow:auto;padding-bottom:4px;flex-wrap:wrap">
            <button class="emp-chip" data-emp="all" style="min-height:36px;padding:0 12px;border-radius:20px;border:1.5px solid ${employeeFilter==='all'?'#1a2535':'var(--border)'};background:${employeeFilter==='all'?'#1a2535':'white'};color:${employeeFilter==='all'?'white':'var(--text-primary)'};font-size:12px;font-weight:600;white-space:nowrap">All (${employeesList.length})</button>
            ${employeesList.map(emp=>{
              const active = employeeFilter===(emp.uid||emp.id);
              return `<button class="emp-chip" data-emp="${emp.uid||emp.id}" style="min-height:36px;padding:0 12px;border-radius:20px;border:1.5px solid ${active?'#ff5a1f':'var(--border)'};background:${active?'#fff7e6':'white'};color:${active?'#d4380d':'var(--text-primary)'};font-size:12px;font-weight:600;white-space:nowrap">${(emp.name||'U')[0]} ${emp.name||emp.phone}</button>`;
            }).join('')}
          </div>
        </div>
        ` : ''}

        <!-- Fuel Type Filter -->
        <div style="margin-top:14px">
          <div style="font-size:10px;color:var(--text-secondary);font-weight:600;margin-bottom:6px">FUEL TYPE • MS / HSD</div>
          <div style="display:flex;gap:6px;overflow:auto;padding-bottom:4px;flex-wrap:wrap">
            <button class="fuel-chip" data-fuel="all" style="min-height:36px;padding:0 14px;border-radius:20px;border:1.5px solid ${fuelFilter==='all'?'#1a2535':'var(--border)'};background:${fuelFilter==='all'?'#1a2535':'white'};color:${fuelFilter==='all'?'white':'var(--text-primary)'};font-size:12px;font-weight:600">All Fuel</button>
            <button class="fuel-chip" data-fuel="MS" style="min-height:36px;padding:0 14px;border-radius:20px;border:1.5px solid ${fuelFilter==='MS'?'#1677ff':'var(--border)'};background:${fuelFilter==='MS'?'#e6f4ff':'white'};color:${fuelFilter==='MS'?'#0958d9':'var(--text-primary)'};font-size:12px;font-weight:600">MS • Petrol</button>
            <button class="fuel-chip" data-fuel="HSD" style="min-height:36px;padding:0 14px;border-radius:20px;border:1.5px solid ${fuelFilter==='HSD'?'#fa8c16':'var(--border)'};background:${fuelFilter==='HSD'?'#fff7e6':'white'};color:${fuelFilter==='HSD'?'#d4380d':'var(--text-primary)'};font-size:12px;font-weight:600">HSD • Diesel</button>
            ${fuelTypesAvailable.filter(ft=> !ft.toLowerCase().includes('petrol') && !ft.toLowerCase().includes('diesel')).map(ft=>`<button class="fuel-chip" data-fuel="${ft}" style="min-height:36px;padding:0 12px;border-radius:20px;border:1.5px solid ${fuelFilter===ft?'#52c41a':'var(--border)'};background:${fuelFilter===ft?'#f6ffed':'white'};color:${fuelFilter===ft?'#389e0d':'var(--text-primary)'};font-size:12px;font-weight:600">${ft}</button>`).join('')}
          </div>
        </div>

        <!-- Status minimal -->
        <div style="margin-top:12px;display:flex;gap:6px;overflow:auto;padding-bottom:4px">
          ${[
            {id:'ALL', label:'All Status'},
            {id:'APPROVED', label:'Approved'},
            {id:'PENDING_REVIEW', label:'Pending'},
            {id:'REJECTED', label:'Rejected'},
          ].map(st=>`<button class="status-chip" data-status="${st.id}" style="min-height:32px;padding:0 12px;border-radius:20px;border:1.5px solid ${statusFilter===st.id?'#1a2535':'var(--border)'};background:${statusFilter===st.id?'#1a2535':'white'};color:${statusFilter===st.id?'white':'var(--text-secondary)'};font-size:11px;font-weight:600;white-space:nowrap">${st.label}</button>`).join('')}
        </div>

        <button id="applyFilter" style="margin-top:14px;width:100%;min-height:48px;border-radius:12px;background:#1a2535;color:white;border:none;font-weight:700;font-size:14px">Apply Filters • ${filteredShifts.length} shifts • ${fmtLit(totalLitersFiltered)}</button>
        <div style="margin-top:8px;text-align:center;font-size:10px;color:var(--text-tertiary)">Filters: 📅 ${fromDate} → ${toDate} • 👤 ${employeeFilter==='all'?'All': employeesList.find(e=>(e.uid||e.id)===employeeFilter)?.name||employeeFilter} • ⛽ ${fuelFilter}</div>
      </div>

      <!-- Shifts List - Who worked on which pump which date - No clutter -->
      <div style="background:white;border-radius:16px;padding:16px;margin-top:14px;border:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:13px;font-weight:800">🧾 Reports • Who worked on which pump which date</span>
          <span style="font-size:11px;background:var(--bg);padding:4px 8px;border-radius:12px">${filteredShifts.length} shifts</span>
        </div>
        <div style="margin-top:12px;display:flex;flex-direction:column;gap:10px;max-height:800px;overflow:auto" id="shiftsList">
          ${filteredShifts.length===0 ? `<div style="text-align:center;padding:24px;color:var(--text-secondary)"><div style="font-size:32px">📭</div><p style="margin-top:8px;font-size:13px">No shifts in this filter</p><p style="font-size:11px;margin-top:4px">Try different date / employee / fuel</p></div>` : filteredShifts.slice(0,50).map(s=>{
            const gross = s.totals?.totalRevenue||0;
            const exp = (report.expenseByShift||{})[s.id]||0;
            const net = Math.round((gross - exp)*100)/100;
            const liters = s.totals?.totalLiters||0;
            const payments = s.totals?.totalPayments||0;
            const toHandover = Math.round((net - payments)*100)/100;
            const statusColor = s.status==='APPROVED' ? '#52c41a' : s.status==='PENDING_REVIEW' ? '#faad14' : s.status==='REJECTED' ? '#ff4d4f' : '#1677ff';
            const date = new Date(s.startTime);
            const dateStr = date.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
            const timeStr = date.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
            
            return `
            <div style="background:#f8f9fa;border-radius:14px;padding:12px;border:1px solid var(--border);cursor:pointer" onclick="location.hash='#/shifts/${s.id}'">
              <!-- Who + When -->
              <div style="display:flex;justify-content:space-between;align-items:center">
                <div style="display:flex;align-items:center;gap:8px">
                  <div style="width:36px;height:36px;border-radius:50%;background:#1a2535;color:white;display:grid;place-items:center;font-weight:700;font-size:12px">${(s.employeeName||'?')[0]}</div>
                  <div>
                    <div style="font-weight:700;font-size:13px;display:flex;align-items:center;gap:6px">${s.employeeName} <span style="width:8px;height:8px;border-radius:50%;background:${statusColor};display:inline-block"></span></div>
                    <div style="font-size:11px;color:var(--text-secondary)">📅 ${dateStr} • ⏰ ${timeStr} • ${s.status}</div>
                  </div>
                </div>
                <div style="text-align:right">
                  <div style="font-weight:700;font-size:13px">${fmt(net)}</div>
                  <div style="font-size:10px;color:${toHandover>0.5?'#cf1322':'#389e0d'}">${toHandover>0.5? 'To Handover '+fmt(toHandover) : toHandover<-0.5? 'Excess '+fmt(Math.abs(toHandover)) : 'Balanced'}</div>
                </div>
              </div>

              <!-- Which Pump Which Date -->
              <div style="margin-top:10px;background:white;border-radius:10px;padding:10px;border:1px solid #eee">
                <div style="font-size:10px;font-weight:700;color:var(--text-secondary);letter-spacing:0.5px;margin-bottom:6px">⛽ WHICH PUMP • WHICH DATE • FUEL</div>
                <div style="display:flex;flex-direction:column;gap:6px">
                  ${(s.nozzles||[]).map(n=>{
                    const pump = pumps.find(p=>p.id===n.pumpId);
                    const fuelLabel = (n.fuelType||'').toLowerCase().includes('petrol') ? 'MS' : (n.fuelType||'').toLowerCase().includes('diesel') ? 'HSD' : n.fuelType;
                    const fuelColor = fuelLabel==='MS' ? '#1677ff' : fuelLabel==='HSD' ? '#fa8c16' : '#52c41a';
                    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:#f8f9fa;border-radius:8px;border-left:3px solid ${fuelColor}">
                      <div>
                        <div style="font-weight:600;font-size:12px">${pump?.name||'Pump'} • Nozzle ${n.nozzleId?.slice(0,4)||''} • <span style="color:${fuelColor};font-weight:700">${fuelLabel}</span> • ${n.fuelType}</div>
                        <div style="font-size:10px;color:var(--text-secondary);margin-top:2px">Opening ${Number(n.openingReading).toFixed(2)} → Closing ${Number(n.closingReading||0).toFixed(2)} • ${fmtLit(n.litersSold||0)} • ${fmt(n.revenue||0)}</div>
                      </div>
                      <span style="font-size:10px;background:white;padding:3px 6px;border-radius:8px;border:1px solid ${fuelColor};color:${fuelColor};font-weight:600">${fmtLit(n.litersSold||0).replace(' L',' L')}</span>
                    </div>`;
                  }).join('')}
                </div>
                <div style="margin-top:8px;display:flex;justify-content:space-between;font-size:10px;color:var(--text-secondary);border-top:1px dashed #eee;padding-top:6px">
                  <span>📅 Worked on: ${dateStr}</span>
                  <span>⛽ ${ (s.nozzles||[]).length } pump(s) • Total ${fmtLit(liters)}</span>
                </div>
              </div>
            </div>
            `;
          }).join('')}
        </div>
        ${filteredShifts.length>50 ? `<div style="text-align:center;margin-top:12px"><button id="loadMore" style="min-height:40px;padding:0 16px;border-radius:12px;background:white;border:1px solid var(--border);font-weight:600;font-size:12px">Load 50 more • ${filteredShifts.length-50} remaining</button></div>` : ''}
      </div>

      <div style="margin-top:12px;padding:10px;background:#e6f4ff;border-radius:10px;border:1px solid #91caff;font-size:11px;color:#0958d9;line-height:1.4">
        💡 <b>Simple Reports:</b> Shows only who worked on which pump which date • No clutter • Filter by Date (Today/7 Days/Month/All), Employee (who worked), Fuel Type (MS/HSD) • Tap shift to view full receipt with Gross - Expenses = Net
      </div>
    </div>
  `;

  // Handlers
  root.querySelectorAll('.preset-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      root.querySelector('#fromDate').value = btn.dataset.from;
      root.querySelector('#toDate').value = btn.dataset.to;
      root.querySelectorAll('.preset-btn').forEach(b=>{ b.style.background='white'; b.style.color='var(--text-primary)'; b.style.borderColor='var(--border)'; });
      btn.style.background='#1a2535'; btn.style.color='white'; btn.style.borderColor='#1a2535';
    });
  });

  root.querySelectorAll('.emp-chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      root.querySelectorAll('.emp-chip').forEach(c=>{ c.style.background='white'; c.style.borderColor='var(--border)'; c.style.color='var(--text-primary)'; });
      chip.style.background='#fff7e6'; chip.style.borderColor='#ff5a1f'; chip.style.color='#d4380d';
      // store selected
      root.querySelector('#fromDate').dataset.emp = chip.dataset.emp;
    });
  });

  root.querySelectorAll('.fuel-chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      root.querySelectorAll('.fuel-chip').forEach(c=>{
        c.style.background='white'; c.style.borderColor='var(--border)'; c.style.color='var(--text-primary)';
        if (c.dataset.fuel==='MS') { c.style.background='white'; }
        if (c.dataset.fuel==='HSD') { c.style.background='white'; }
      });
      chip.style.background = chip.dataset.fuel==='MS' ? '#e6f4ff' : chip.dataset.fuel==='HSD' ? '#fff7e6' : '#1a2535';
      chip.style.color = chip.dataset.fuel==='MS' ? '#0958d9' : chip.dataset.fuel==='HSD' ? '#d4380d' : 'white';
      chip.style.borderColor = chip.dataset.fuel==='MS' ? '#1677ff' : chip.dataset.fuel==='HSD' ? '#fa8c16' : '#1a2535';
      root.querySelector('#fromDate').dataset.fuel = chip.dataset.fuel;
    });
  });

  root.querySelectorAll('.status-chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      root.querySelectorAll('.status-chip').forEach(c=>{ c.style.background='white'; c.style.color='var(--text-secondary)'; c.style.borderColor='var(--border)'; });
      chip.style.background='#1a2535'; chip.style.color='white'; chip.style.borderColor='#1a2535';
      root.querySelector('#fromDate').dataset.status = chip.dataset.status;
    });
  });

  // Set initial dataset for fuel/status from query
  root.querySelector('#fromDate').dataset.emp = employeeFilter;
  root.querySelector('#fromDate').dataset.fuel = fuelFilter;
  root.querySelector('#fromDate').dataset.status = statusFilter;

  root.querySelector('#applyFilter')?.addEventListener('click', ()=>{
    const from = root.querySelector('#fromDate').value;
    const to = root.querySelector('#toDate').value;
    const emp = root.querySelector('#fromDate').dataset.emp || employeeFilter;
    const fuel = root.querySelector('#fromDate').dataset.fuel || fuelFilter;
    const status = root.querySelector('#fromDate').dataset.status || statusFilter;
    if (!from || !to) return alert('Select dates');
    if (new Date(from) > new Date(to)) return alert('From date cannot be after To date');
    location.hash = `#/reports?from=${from}&to=${to}&emp=${emp}&fuel=${fuel}&status=${status}`;
  });

  let visible = 50;
  root.querySelector('#loadMore')?.addEventListener('click', ()=>{
    visible += 50;
    const list = root.querySelector('#shiftsList');
    list.innerHTML = filteredShifts.slice(0, visible).map(s=>{
      const gross = s.totals?.totalRevenue||0;
      const exp = (report.expenseByShift||{})[s.id]||0;
      const net = Math.round((gross - exp)*100)/100;
      const liters = s.totals?.totalLiters||0;
      const payments = s.totals?.totalPayments||0;
      const toHandover = Math.round((net - payments)*100)/100;
      const statusColor = s.status==='APPROVED' ? '#52c41a' : s.status==='PENDING_REVIEW' ? '#faad14' : s.status==='REJECTED' ? '#ff4d4f' : '#1677ff';
      const date = new Date(s.startTime);
      const dateStr = date.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
      const timeStr = date.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
      return `
      <div style="background:#f8f9fa;border-radius:14px;padding:12px;border:1px solid var(--border);cursor:pointer" onclick="location.hash='#/shifts/${s.id}'">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="display:flex;align-items:center;gap:8px">
            <div style="width:36px;height:36px;border-radius:50%;background:#1a2535;color:white;display:grid;place-items:center;font-weight:700;font-size:12px">${(s.employeeName||'?')[0]}</div>
            <div><div style="font-weight:700;font-size:13px;display:flex;align-items:center;gap:6px">${s.employeeName} <span style="width:8px;height:8px;border-radius:50%;background:${statusColor};display:inline-block"></span></div><div style="font-size:11px;color:var(--text-secondary)">📅 ${dateStr} • ⏰ ${timeStr} • ${s.status}</div></div>
          </div>
          <div style="text-align:right"><div style="font-weight:700;font-size:13px">${formatCurrency(net)}</div><div style="font-size:10px;color:${toHandover>0.5?'#cf1322':'#389e0d'}">${toHandover>0.5? 'To Handover '+formatCurrency(toHandover) : 'Balanced'}</div></div>
        </div>
        <div style="margin-top:10px;background:white;border-radius:10px;padding:10px;border:1px solid #eee">
          <div style="font-size:10px;font-weight:700;color:var(--text-secondary);margin-bottom:6px">⛽ WHICH PUMP • FUEL</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${(s.nozzles||[]).map(n=>{
              const pump = pumps.find(p=>p.id===n.pumpId);
              const fuelLabel = (n.fuelType||'').toLowerCase().includes('petrol') ? 'MS' : (n.fuelType||'').toLowerCase().includes('diesel') ? 'HSD' : n.fuelType;
              return `<div style="display:flex;justify-content:space-between;font-size:11px;padding:6px;background:#f8f9fa;border-radius:6px"><span>${pump?.name||'Pump'} • ${fuelLabel} • ${n.fuelType}</span><span style="font-weight:600">${formatLiters(n.litersSold||0)}</span></div>`;
            }).join('')}
          </div>
        </div>
      </div>`;
    }).join('');
  });

  root.querySelector('#exportBtn')?.addEventListener('click', ()=>{
    let csv = `Reports - Who worked on which pump which date,${fromDate} to ${toDate},${filteredShifts.length} shifts,Fuel:${fuelFilter}\\n`;
    csv += `Employee,Date,Pump,Fuel Type (MS/HSD),Liters,Net Amount,To Handover,Status\\n`;
    filteredShifts.forEach(s=>{
      const gross = s.totals?.totalRevenue||0;
      const exp = (report.expenseByShift||{})[s.id]||0;
      const net = gross - exp;
      const toHandover = net - (s.totals?.totalPayments||0);
      const date = new Date(s.startTime).toLocaleDateString('en-IN');
      (s.nozzles||[]).forEach(n=>{
        const pump = pumps.find(p=>p.id===n.pumpId);
        const fuelLabel = (n.fuelType||'').toLowerCase().includes('petrol') ? 'MS' : (n.fuelType||'').toLowerCase().includes('diesel') ? 'HSD' : n.fuelType;
        csv += `${s.employeeName},${date},${pump?.name||''},${fuelLabel} (${n.fuelType}),${n.litersSold||0},${n.revenue||0},${toHandover},${s.status}\\n`;
      });
    });
    const blob = new Blob([csv], { type:'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`reports-${fromDate}-${toDate}-${fuelFilter}.csv`; a.click(); URL.revokeObjectURL(url);
  });
}

export async function auditView({ root }) {
  root.innerHTML = `<div class="container"><h1 class="page-title">Removed</h1><p class="page-sub">Only owner can destroy data.</p><button style="min-height:44px;border-radius:12px;background:#1a2535;color:white;border:none;padding:0 16px;font-weight:600" onclick="location.hash='#/reports'">Back to Reports</button></div>`;
}
