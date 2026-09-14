import { getState } from '../state.js';
import { getStationsForCurrentUser } from '../services/stations.js';
import { getReportForRange } from '../services/reports.js';
import { getShifts } from '../services/shifts.js';
import { formatLiters } from '../services/calc.js';
import { getEmployees } from '../services/users.js';
import { getBusinessDate, addBusinessDays } from '../services/datetime.js';

export async function reportsView({ root, query }) {
  const { user, currentStationId } = getState();
  const stations = await getStationsForCurrentUser();
  const stationId = currentStationId || stations[0]?.id;
  if (!stationId) { root.innerHTML=`<div class="container"><div style="background:white;border-radius:16px;padding:24px;text-align:center;border:1px solid #e5e7eb">No station</div></div>`; return; }

  const isAttendant = user.role === 'attendant';

  // All range maths in IST business dates. The previous code mixed UTC
  // (toISOString) with device-local getDate(), so between 00:00 and 05:30 IST
  // "Today" showed yesterday's shifts.
  const todayStr = getBusinessDate(new Date());
  const yesterdayStr = addBusinessDays(todayStr, -1);
  const weekStr = addBusinessDays(todayStr, -6);
  const monthStart = todayStr.slice(0,8) + '01';
  const last30Str = addBusinessDays(todayStr, -29);
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

  // totals
  let totalLiters = 0, msLiters = 0, hsdLiters = 0;
  filteredShifts.forEach(s=>{
    totalLiters += s.totals?.totalLiters||0;
    (s.nozzles||[]).forEach(n=>{
      const ft = (n.fuelType||'').toLowerCase();
      if (ft.includes('petrol') || ft.includes('ms')) msLiters += n.litersSold||0;
      else if (ft.includes('diesel') || ft.includes('hsd')) hsdLiters += n.litersSold||0;
    });
  });

  // group by date
  const grouped = {};
  filteredShifts.sort((a,b)=> new Date(b.startTime) - new Date(a.startTime));
  filteredShifts.forEach(s=>{
    const d = getBusinessDate(s.startTime); // IST bucket
    if (!grouped[d]) grouped[d]=[];
    grouped[d].push(s);
  });
  const datesSorted = Object.keys(grouped).sort((a,b)=> b.localeCompare(a));

  const fmtLit = (v)=> formatLiters(v).replace(' L','L').replace('.00','');
  const fmtDateLong = (iso)=>{
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN',{weekday:'short', day:'2-digit', month:'short', year:'numeric'});
  };
  const fmtDateShort = (iso)=>{
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN',{day:'2-digit', month:'short'});
  };
  const fmtTime = (iso)=> new Date(iso).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});

  root.innerHTML = `
    <div class="container" style="max-width:540px;margin:0 auto;padding-bottom:110px">
      <!-- Header - only title -->
      <div style="padding:6px 4px 12px 4px">
        <h1 style="font-size:28px;font-weight:900;letter-spacing:-1px;line-height:1">Reports</h1>
        <div style="font-size:12px;color:#6b7280;margin-top:4px">${stations.find(s=>s.id===stationId)?.name||''} • ${filteredShifts.length} reports • ${fmtLit(msLiters)} MS • ${fmtLit(hsdLiters)} HSD • ${fmtLit(totalLiters)} total</div>
      </div>

      <!-- Filters - minimal iOS -->
      <div style="background:white;border-radius:20px;border:1px solid #e5e7eb;overflow:hidden">
        <div style="padding:14px 14px 10px 14px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div style="font-size:11px;font-weight:800;letter-spacing:1px">FILTERS</div>
            <div style="font-size:11px;color:#6b7280">${fromDate===weekStr && toDate===todayStr ? 'Last 7 Days' : fromDate===todayStr ? 'Today' : fromDate===allTime ? 'All Time' : fmtDateShort(fromDate)+' → '+fmtDateShort(toDate)} • ${employeeFilter==='all'?'All': employeesList.find(e=>(e.uid||e.id)===employeeFilter)?.name?.split(' ')[0]||'1'} • ${fuelFilter}</div>
          </div>

          <!-- Date pills - only what needed -->
          <div style="margin-top:12px;display:flex;gap:6px;overflow:auto;padding-bottom:2px;scrollbar-width:none">
            ${[
              {label:'Today', from: todayStr, to: todayStr},
              {label:'Yesterday', from: yesterdayStr, to: yesterdayStr},
              {label:'7 Days', from: weekStr, to: todayStr},
              {label:'Month', from: monthStart, to: todayStr},
              {label:'All', from: allTime, to: todayStr},
            ].map(b=>{
              const active = fromDate===b.from && toDate===b.to;
              return `<button data-from="${b.from}" data-to="${b.to}" class="date-pill" style="min-height:32px;padding:0 12px;border-radius:20px;border:1.5px solid ${active?'#111':'#e5e7eb'};background:${active?'#111':'white'};color:${active?'white':'#111'};font-weight:700;font-size:11px;white-space:nowrap">${b.label}</button>`;
            }).join('')}
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">
            <input type="date" id="fromDate" value="${fromDate}" style="width:100%;min-height:40px;border-radius:12px;border:1px solid #e5e7eb;padding:0 10px;font-size:12px;background:#f9fafb">
            <input type="date" id="toDate" value="${toDate}" style="width:100%;min-height:40px;border-radius:12px;border:1px solid #e5e7eb;padding:0 10px;font-size:12px;background:#f9fafb">
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">
            <select id="empSelect" style="width:100%;min-height:42px;border-radius:12px;border:1px solid #e5e7eb;padding:0 10px;font-size:12px;background:#f9fafb;font-weight:600" ${isAttendant?'disabled':''}>
              <option value="all" ${employeeFilter==='all'?'selected':''}>👤 All Employees</option>
              ${employeesList.map(e=>`<option value="${e.uid||e.id}" ${employeeFilter===(e.uid||e.id)?'selected':''}>${e.name||e.phone}</option>`).join('')}
            </select>
            <select id="fuelSelect" style="width:100%;min-height:42px;border-radius:12px;border:1px solid #e5e7eb;padding:0 10px;font-size:12px;background:#f9fafb;font-weight:600">
              <option value="all" ${fuelFilter==='all'?'selected':''}>⛽ All Fuel</option>
              <option value="MS" ${fuelFilter==='MS'?'selected':''}>MS • Petrol</option>
              <option value="HSD" ${fuelFilter==='HSD'?'selected':''}>HSD • Diesel</option>
            </select>
          </div>

          <button id="applyBtn" style="margin-top:12px;width:100%;min-height:46px;border-radius:12px;background:#111;color:white;border:none;font-weight:700;font-size:13px">Show • ${filteredShifts.length} reports • ${fmtLit(totalLiters)}</button>
        </div>
      </div>

      <!-- Reports list - only who worked which pump which date -->
      <div style="margin-top:16px">
        <div style="padding:0 4px 8px 4px;display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:12px;font-weight:800;letter-spacing:0.5px">REPORTS • WHO WORKED WHICH PUMP WHICH DATE</div>
          <button id="exportBtn" style="min-height:28px;padding:0 10px;border-radius:20px;background:white;border:1px solid #e5e7eb;font-size:11px;font-weight:600">⬇️ CSV</button>
        </div>

        ${filteredShifts.length===0 ? `
          <div style="background:white;border-radius:20px;padding:36px 16px;text-align:center;border:1px solid #e5e7eb">
            <div style="font-size:40px">📋</div>
            <div style="font-weight:800;margin-top:8px;font-size:14px">No reports found</div>
            <div style="font-size:12px;color:#6b7280;margin-top:4px;line-height:1.4">No shifts for<br>📅 ${fromDate} → ${toDate}<br>👤 ${employeeFilter} • ⛽ ${fuelFilter}<br><br>Try All / different filter</div>
          </div>
        ` : datesSorted.map(dateKey=>{
          const shiftsForDate = grouped[dateKey];
          const dayLiters = shiftsForDate.reduce((s,x)=> s + (x.totals?.totalLiters||0),0);
          const dayMs = shiftsForDate.reduce((s,x)=> s + (x.nozzles||[]).filter(n=> (n.fuelType||'').toLowerCase().includes('petrol')|| (n.fuelType||'').toLowerCase().includes('ms')).reduce((a,n)=>a+(n.litersSold||0),0),0);
          const dayHsd = shiftsForDate.reduce((s,x)=> s + (x.nozzles||[]).filter(n=> (n.fuelType||'').toLowerCase().includes('diesel')|| (n.fuelType||'').toLowerCase().includes('hsd')).reduce((a,n)=>a+(n.litersSold||0),0),0);
          return `
          <div style="margin-bottom:16px">
            <!-- Date header sticky style -->
            <div style="position:sticky;top:0;z-index:1;background:#f6f7f8;padding:6px 4px;display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <div style="font-size:12px;font-weight:800">📅 ${fmtDateLong(dateKey)}</div>
              <div style="font-size:11px;color:#6b7280;background:white;border:1px solid #e5e7eb;padding:2px 8px;border-radius:20px">${shiftsForDate.length} • ${fmtLit(dayMs)} MS • ${fmtLit(dayHsd)} HSD • ${fmtLit(dayLiters)}</div>
            </div>
            <div style="background:white;border-radius:20px;border:1px solid #e5e7eb;overflow:hidden">
              ${shiftsForDate.map((s,i)=>{
                const time = fmtTime(s.startTime);
                const liters = s.totals?.totalLiters||0;
                const nozzles = s.nozzles||[];
                const pumpsLine = nozzles.map(n=>{
                  const pump = pumps.find(p=>p.id===n.pumpId);
                  const ft = (n.fuelType||'').toLowerCase();
                  const label = ft.includes('petrol')||ft.includes('ms') ? 'MS' : ft.includes('diesel')||ft.includes('hsd') ? 'HSD' : (n.fuelType||'').slice(0,3);
                  const color = label==='MS' ? '#1677ff' : label==='HSD' ? '#fa8c16' : '#111';
                  return `<span style="display:inline-flex;align-items:center;gap:4px;background:#f9fafb;border:1px solid #eee;border-radius:8px;padding:3px 7px;font-size:11px;font-weight:600;margin:2px 4px 2px 0"><span style="width:5px;height:5px;border-radius:50%;background:${color}"></span>${pump?.name||'Pump'} • ${label} • ${fmtLit(n.litersSold||0)}</span>`;
                }).join('');
                return `
                <div onclick="location.hash='#/shifts/${s.id}'" style="padding:12px 14px;display:flex;gap:10px;align-items:flex-start;cursor:pointer;${i!==shiftsForDate.length-1?'border-bottom:1px solid #f0f0f0':''}">
                  <div style="width:32px;height:32px;border-radius:50%;background:#111;color:white;display:grid;place-items:center;font-weight:800;font-size:12px;flex-shrink:0;margin-top:1px">${(s.employeeName||'?')[0]}</div>
                  <div style="flex:1;min-width:0">
                    <div style="display:flex;justify-content:space-between;gap:8px">
                      <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.employeeName}</div>
                      <div style="font-size:11px;color:#6b7280;flex-shrink:0">⏰ ${time} • ${fmtLit(liters)}</div>
                    </div>
                    <div style="margin-top:5px;display:flex;flex-wrap:wrap">${pumpsLine || `<span style="font-size:11px;color:#9ca3af">No pump</span>`}</div>
                    <div style="margin-top:4px;font-size:10px;color:#9ca3af">Who worked • Which pump • Which date • Fuel</div>
                  </div>
                  <div style="color:#d1d5db;font-size:14px;margin-top:6px">›</div>
                </div>
                `;
              }).join('')}
            </div>
          </div>
          `;
        }).join('')}
      </div>

      <div style="margin-top:12px;padding:12px 14px;background:white;border-radius:16px;border:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:11px;color:#6b7280"><b style="color:#111">${filteredShifts.length} reports</b> • Tap to view receipt • Filter by Date, Employee, Fuel</div>
        <button onclick="location.hash='#/dashboard'" style="min-height:32px;padding:0 12px;border-radius:20px;background:#f9fafb;border:1px solid #e5e7eb;font-size:11px;font-weight:600">Home</button>
      </div>
    </div>
  `;

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
    let csv = `Date,Employee,Pump,Fuel,MS/HSD,Liters\\n`;
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
    const a = document.createElement('a'); a.href=url; a.download=`reports-${fromDate}-${toDate}.csv`; a.click(); URL.revokeObjectURL(url);
  });
}

export async function auditView({ root }) {
  root.innerHTML = `<div class="container" style="max-width:540px;margin:0 auto"><div style="background:white;border-radius:16px;padding:20px;border:1px solid #e5e7eb"><h1 style="font-size:20px;font-weight:800">Removed</h1><p style="font-size:12px;color:#6b7280;margin-top:6px">Only owner can destroy data.</p><button style="margin-top:12px;min-height:40px;border-radius:12px;background:#111;color:white;border:none;padding:0 14px;font-weight:600" onclick="location.hash='#/reports'">Back</button></div></div>`;
}
