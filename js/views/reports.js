import { getState } from '../state.js';
import { getStationsForCurrentUser } from '../services/stations.js';
import { getReportForRange } from '../services/reports.js';
import { getShifts } from '../services/shifts.js';
import { formatLiters } from '../services/calc.js';
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
  if (isAttendant) employeeFilter = user.uid;

  const allShiftsRaw = await getShifts(stationId);

  let employeesList = [];
  try {
    employeesList = await getEmployees(stationId);
    if (employeesList.length===0) {
      const uniq = {};
      allShiftsRaw.forEach(s=>{ uniq[s.userId]=s.employeeName; });
      employeesList = Object.entries(uniq).map(([uid, name])=>({ uid, id: uid, name }));
    }
  } catch { employeesList = []; }

  let pumps = [];
  try {
    const { getPumps } = await import('../services/pumps.js');
    pumps = await getPumps(stationId);
  } catch {}

  const report = await getReportForRange(stationId, fromDate, toDate, {
    employeeId: employeeFilter,
    status: 'ALL',
  });

  let filteredShifts = report.shifts;
  if (fuelFilter !== 'all') {
    filteredShifts = filteredShifts.filter(s=>{
      return (s.nozzles||[]).some(n=>{
        const ft = (n.fuelType||'').toLowerCase();
        if (fuelFilter==='MS') return ft.includes('petrol') || ft.includes('ms');
        if (fuelFilter==='HSD') return ft.includes('diesel') || ft.includes('hsd');
        return ft.includes(fuelFilter.toLowerCase());
      });
    });
  }

  // Totals
  let totalLiters = 0, msLiters = 0, hsdLiters = 0;
  filteredShifts.forEach(s=>{
    totalLiters += s.totals?.totalLiters||0;
    (s.nozzles||[]).forEach(n=>{
      const ft = (n.fuelType||'').toLowerCase();
      if (ft.includes('petrol') || ft.includes('ms')) msLiters += n.litersSold||0;
      else if (ft.includes('diesel') || ft.includes('hsd')) hsdLiters += n.litersSold||0;
    });
  });

  // Group by date
  const grouped = {};
  filteredShifts.sort((a,b)=> new Date(b.startTime) - new Date(a.startTime));
  filteredShifts.forEach(s=>{
    const d = new Date(s.startTime).toISOString().slice(0,10);
    if (!grouped[d]) grouped[d]=[];
    grouped[d].push(s);
  });
  const datesSorted = Object.keys(grouped).sort((a,b)=> b.localeCompare(a));

  const fmtLit = (v)=> formatLiters(v).replace(' L','L').replace('.00','');
  const fmtDateLong = (iso)=>{
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric', weekday:'short'});
  };
  const fmtTime = (iso)=> new Date(iso).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});

  root.innerHTML = `
    <div class="container" style="max-width:520px;margin:0 auto;padding-bottom:110px">
      <!-- Header ultra clean -->
      <div style="padding:4px 2px 14px 2px">
        <h1 style="font-size:26px;font-weight:800;letter-spacing:-0.8px">Reports</h1>
        <p style="font-size:12px;color:var(--text-secondary);margin-top:2px">${stations.find(s=>s.id===stationId)?.name||''} • Who worked on which pump • which date</p>
      </div>

      <!-- Filters ultra clean iOS -->
      <div style="background:white;border-radius:18px;padding:14px;border:1px solid #e5e7eb">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:11px;font-weight:800;letter-spacing:0.8px;color:#111">FILTERS</span>
          <span style="font-size:11px;color:#6b7280">${filteredShifts.length} shifts • ${fmtLit(totalLiters)}</span>
        </div>

        <!-- Date quick pills -->
        <div style="margin-top:12px;display:flex;gap:6px;overflow:auto;padding-bottom:2px">
          ${[
            {label:'Today', from: todayStr, to: todayStr},
            {label:'Yesterday', from: yesterdayStr, to: yesterdayStr},
            {label:'7 Days', from: weekStr, to: todayStr},
            {label:'Month', from: monthStart, to: todayStr},
            {label:'30 Days', from: last30Str, to: todayStr},
            {label:'All', from: allTime, to: todayStr},
          ].map(b=>{
            const active = fromDate===b.from && toDate===b.to;
            return `<button data-from="${b.from}" data-to="${b.to}" class="date-pill" style="min-height:34px;padding:0 14px;border-radius:20px;border:1.5px solid ${active?'#111':'#e5e7eb'};background:${active?'#111':'white'};color:${active?'white':'#111'};font-weight:700;font-size:12px;white-space:nowrap">${b.label}</button>`;
          }).join('')}
        </div>

        <!-- Custom date inputs -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">
          <div>
            <div style="font-size:10px;color:#6b7280;font-weight:600;margin-bottom:4px">FROM</div>
            <input type="date" id="fromDate" value="${fromDate}" style="width:100%;min-height:42px;border-radius:10px;border:1.5px solid #e5e7eb;padding:0 10px;font-size:13px;background:#f9fafb">
          </div>
          <div>
            <div style="font-size:10px;color:#6b7280;font-weight:600;margin-bottom:4px">TO</div>
            <input type="date" id="toDate" value="${toDate}" style="width:100%;min-height:42px;border-radius:10px;border:1.5px solid #e5e7eb;padding:0 10px;font-size:13px;background:#f9fafb">
          </div>
        </div>

        <!-- Employee + Fuel row -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">
          <div>
            <div style="font-size:10px;color:#6b7280;font-weight:600;margin-bottom:4px">EMPLOYEE</div>
            <select id="empSelect" style="width:100%;min-height:42px;border-radius:10px;border:1.5px solid #e5e7eb;padding:0 10px;font-size:13px;background:#f9fafb;font-weight:600" ${isAttendant?'disabled':''}>
              <option value="all" ${employeeFilter==='all'?'selected':''}>All Employees</option>
              ${employeesList.map(e=>`<option value="${e.uid||e.id}" ${employeeFilter===(e.uid||e.id)?'selected':''}>${e.name||e.phone}</option>`).join('')}
            </select>
          </div>
          <div>
            <div style="font-size:10px;color:#6b7280;font-weight:600;margin-bottom:4px">FUEL TYPE</div>
            <select id="fuelSelect" style="width:100%;min-height:42px;border-radius:10px;border:1.5px solid #e5e7eb;padding:0 10px;font-size:13px;background:#f9fafb;font-weight:600">
              <option value="all" ${fuelFilter==='all'?'selected':''}>All Fuel</option>
              <option value="MS" ${fuelFilter==='MS'?'selected':''}>MS • Petrol</option>
              <option value="HSD" ${fuelFilter==='HSD'?'selected':''}>HSD • Diesel</option>
            </select>
          </div>
        </div>

        <button id="applyBtn" style="margin-top:12px;width:100%;min-height:48px;border-radius:12px;background:#111;color:white;border:none;font-weight:700;font-size:14px">Show Reports • ${filteredShifts.length} shifts</button>
        ${employeeFilter!=='all' || fuelFilter!=='all' || fromDate!==weekStr ? `<div style="margin-top:8px;text-align:center;font-size:11px;color:#6b7280">📅 ${fromDate} → ${toDate} • 👤 ${employeeFilter==='all'?'All': employeesList.find(e=>(e.uid||e.id)===employeeFilter)?.name||employeeFilter} • ⛽ ${fuelFilter}</div>` : ''}
      </div>

      <!-- Summary minimal -->
      <div style="margin-top:14px;display:flex;gap:8px">
        <div style="flex:1;background:white;border-radius:14px;padding:12px;border:1px solid #e5e7eb;text-align:center">
          <div style="font-size:10px;color:#6b7280;letter-spacing:0.5px;font-weight:600">TOTAL SHIFTS</div>
          <div style="font-size:22px;font-weight:800;margin-top:2px">${filteredShifts.length}</div>
        </div>
        <div style="flex:1.6;background:white;border-radius:14px;padding:12px;border:1px solid #e5e7eb">
          <div style="font-size:10px;color:#6b7280;letter-spacing:0.5px;font-weight:600;text-align:center">FUEL SOLD</div>
          <div style="display:flex;justify-content:center;gap:14px;margin-top:6px">
            <div style="text-align:center"><div style="font-size:10px;color:#6b7280">MS</div><div style="font-weight:800;font-size:14px">${fmtLit(msLiters)}</div></div>
            <div style="width:1px;background:#e5e7eb"></div>
            <div style="text-align:center"><div style="font-size:10px;color:#6b7280">HSD</div><div style="font-weight:800;font-size:14px">${fmtLit(hsdLiters)}</div></div>
            <div style="width:1px;background:#e5e7eb"></div>
            <div style="text-align:center"><div style="font-size:10px;color:#6b7280">TOTAL</div><div style="font-weight:800;font-size:14px">${fmtLit(totalLiters)}</div></div>
          </div>
        </div>
      </div>

      <!-- Reports List - Grouped by date -->
      <div style="margin-top:16px">
        ${filteredShifts.length===0 ? `
          <div style="background:white;border-radius:18px;padding:32px 16px;text-align:center;border:1px solid #e5e7eb">
            <div style="font-size:36px">📭</div>
            <div style="font-weight:700;margin-top:8px">No reports</div>
            <div style="font-size:12px;color:#6b7280;margin-top:4px">No shifts for this filter<br>Try Today / All / different employee</div>
          </div>
        ` : datesSorted.map(dateKey=>{
          const shiftsForDate = grouped[dateKey];
          const dayLiters = shiftsForDate.reduce((s,x)=> s + (x.totals?.totalLiters||0),0);
          return `
          <div style="margin-bottom:18px">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:0 4px 8px 4px">
              <div style="font-size:13px;font-weight:800">📅 ${fmtDateLong(dateKey)}</div>
              <div style="font-size:11px;color:#6b7280;background:white;border:1px solid #e5e7eb;padding:3px 8px;border-radius:20px">${shiftsForDate.length} shifts • ${fmtLit(dayLiters)}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px">
              ${shiftsForDate.map(s=>{
                const time = fmtTime(s.startTime);
                const liters = s.totals?.totalLiters||0;
                const nozzles = s.nozzles||[];
                // Build pump summary: Pump name • MS/HSD • liters
                const pumpLines = nozzles.map(n=>{
                  const pump = pumps.find(p=>p.id===n.pumpId);
                  const ft = (n.fuelType||'').toLowerCase();
                  const label = ft.includes('petrol')||ft.includes('ms') ? 'MS' : ft.includes('diesel')||ft.includes('hsd') ? 'HSD' : (n.fuelType||'Fuel');
                  const color = label==='MS' ? '#1677ff' : label==='HSD' ? '#fa8c16' : '#111';
                  return `<span style="display:inline-flex;align-items:center;gap:4px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:4px 8px;font-size:11px;font-weight:600;margin:2px 4px 2px 0">
                    <span style="width:6px;height:6px;border-radius:50%;background:${color};display:inline-block"></span>
                    ${pump?.name||'Pump'} • <span style="color:${color}">${label}</span> • ${fmtLit(n.litersSold||0)}
                  </span>`;
                }).join('');
                const statusDot = s.status==='APPROVED' ? '#22c55e' : s.status==='PENDING_REVIEW' ? '#f59e0b' : s.status==='REJECTED' ? '#ef4444' : '#6b7280';
                return `
                <div onclick="location.hash='#/shifts/${s.id}'" style="background:white;border-radius:16px;padding:12px 14px;border:1px solid #e5e7eb;cursor:pointer;display:flex;gap:10px;align-items:flex-start">
                  <div style="width:36px;height:36px;border-radius:50%;background:#111;color:white;display:grid;place-items:center;font-weight:800;font-size:13px;flex-shrink:0">${(s.employeeName||'?')[0]}</div>
                  <div style="flex:1;min-width:0">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
                      <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.employeeName}</div>
                      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
                        <span style="font-size:11px;color:#6b7280">⏰ ${time}</span>
                        <span style="width:8px;height:8px;border-radius:50%;background:${statusDot};display:inline-block"></span>
                      </div>
                    </div>
                    <div style="margin-top:6px;display:flex;flex-wrap:wrap">${pumpLines || `<span style="font-size:11px;color:#6b7280">No pump data</span>`}</div>
                    <div style="margin-top:6px;display:flex;justify-content:space-between;align-items:center">
                      <span style="font-size:11px;color:#6b7280">Which pump • which date • fuel</span>
                      <span style="font-size:12px;font-weight:700;background:#f9fafb;border:1px solid #e5e7eb;padding:2px 8px;border-radius:20px">${fmtLit(liters)} • ${nozzles.length} pump${nozzles.length>1?'s':''}</span>
                    </div>
                  </div>
                </div>
                `;
              }).join('')}
            </div>
          </div>
          `;
        }).join('')}
      </div>

      <div style="margin-top:10px;display:flex;gap:8px">
        <button id="exportBtn" style="flex:1;min-height:44px;border-radius:12px;background:white;border:1.5px solid #e5e7eb;font-weight:700;font-size:13px">⬇️ Export CSV</button>
        <button onclick="location.hash='#/dashboard'" style="flex:1;min-height:44px;border-radius:12px;background:#f9fafb;border:1.5px solid #e5e7eb;font-weight:600;font-size:13px">← Home</button>
      </div>

      <div style="margin-top:14px;padding:12px;background:#f9fafb;border-radius:12px;border:1px solid #e5e7eb;font-size:11px;color:#6b7280;line-height:1.5">
        <b style="color:#111">How to read:</b> Each row = who worked, on which pump, which date, which fuel, how many liters. Tap any row to see full receipt. Filter by Date, Employee, Fuel Type (MS/HSD) above.
      </div>
    </div>
  `;

  // Handlers
  root.querySelectorAll('.date-pill').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const from = btn.dataset.from;
      const to = btn.dataset.to;
      root.querySelector('#fromDate').value = from;
      root.querySelector('#toDate').value = to;
      root.querySelectorAll('.date-pill').forEach(b=>{ b.style.background='white'; b.style.color='#111'; b.style.borderColor='#e5e7eb'; });
      btn.style.background='#111'; btn.style.color='white'; btn.style.borderColor='#111';
    });
  });

  root.querySelector('#applyBtn')?.addEventListener('click', ()=>{
    const from = root.querySelector('#fromDate').value;
    const to = root.querySelector('#toDate').value;
    const emp = root.querySelector('#empSelect').value;
    const fuel = root.querySelector('#fuelSelect').value;
    if (!from || !to) return alert('Select dates');
    if (new Date(from) > new Date(to)) return alert('From date cannot be after To date');
    location.hash = `#/reports?from=${from}&to=${to}&emp=${emp}&fuel=${fuel}`;
  });

  root.querySelector('#exportBtn')?.addEventListener('click', ()=>{
    let csv = `Date,Employee,Pump,Fuel Type,MS/HSD,Liters\\n`;
    filteredShifts.forEach(s=>{
      const date = new Date(s.startTime).toLocaleDateString('en-IN');
      (s.nozzles||[]).forEach(n=>{
        const pump = pumps.find(p=>p.id===n.pumpId);
        const ft = (n.fuelType||'').toLowerCase();
        const label = ft.includes('petrol')||ft.includes('ms') ? 'MS' : ft.includes('diesel')||ft.includes('hsd') ? 'HSD' : n.fuelType;
        csv += `${date},${s.employeeName},${pump?.name||''},${n.fuelType},${label},${n.litersSold||0}\\n`;
      });
    });
    const blob = new Blob([csv], { type:'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`reports-${fromDate}-${toDate}-${fuelFilter}.csv`; a.click(); URL.revokeObjectURL(url);
  });
}

export async function auditView({ root }) {
  root.innerHTML = `<div class="container" style="max-width:520px;margin:0 auto"><h1 style="font-size:22px;font-weight:800">Removed</h1><p style="font-size:12px;color:#6b7280;margin-top:6px">Only owner can destroy data.</p><button style="margin-top:12px;min-height:44px;border-radius:12px;background:#111;color:white;border:none;padding:0 16px;font-weight:600" onclick="location.hash='#/reports'">Back to Reports</button></div>`;
}
