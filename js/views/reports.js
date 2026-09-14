import { getState } from '../state.js';
import { getStationsForCurrentUser } from '../services/stations.js';
import { getReportForRange, toDateKey } from '../services/reports.js';
import { formatLiters } from '../services/calc.js';
import { getEmployees } from '../services/users.js';
import { getPumps } from '../services/pumps.js';

// ---------------------------------------------------------------- helpers
const todayKey = () => toDateKey(new Date());
const shiftDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return toDateKey(d); };
const firstOfMonth = () => { const d = new Date(); return toDateKey(new Date(d.getFullYear(), d.getMonth(), 1)); };

const PRESETS = () => [
  { label: 'Today', from: todayKey(), to: todayKey() },
  { label: 'Yesterday', from: shiftDays(-1), to: shiftDays(-1) },
  { label: 'Last 7 Days', from: shiftDays(-6), to: todayKey() },
  { label: 'This Month', from: firstOfMonth(), to: todayKey() },
  { label: 'Last 30 Days', from: shiftDays(-29), to: todayKey() },
];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const buildHash = (f) => `#/reports?${new URLSearchParams(f).toString()}`;

const dayLabel = (key) => {
  if (key === todayKey()) return 'Today';
  if (key === shiftDays(-1)) return 'Yesterday';
  const d = new Date(key + 'T12:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
};

const timeOf = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const initials = (name) => String(name || '?').trim().split(/\s+/).map(n => n[0]).join('').slice(0, 2).toUpperCase();

const chip = (text, tone = 'neutral') => {
  const tones = {
    neutral: 'background:var(--bg);color:var(--text-secondary)',
    pump: 'background:#e6f4ff;color:#0958d9',
    fuel: 'background:#f6ffed;color:#389e0d',
  };
  return `<span style="display:inline-block;font-size:11px;padding:3px 9px;border-radius:20px;font-weight:600;white-space:nowrap;${tones[tone]}">${esc(text)}</span>`;
};

const statusBadge = (status) => {
  const map = { APPROVED: 'badge--success', PENDING_REVIEW: 'badge--warning', REJECTED: 'badge--danger', ACTIVE: 'badge--info' };
  return `<span class="badge ${map[status] || 'badge--neutral'}" style="font-size:10px;padding:3px 8px;border-radius:12px">${status === 'PENDING_REVIEW' ? 'PENDING' : status}</span>`;
};

// ---------------------------------------------------------------- view
export async function reportsView({ root, query }) {
  const { user, currentStationId } = getState();
  const stations = await getStationsForCurrentUser();
  const stationId = currentStationId || stations[0]?.id;
  if (!stationId) { root.innerHTML = `<div class="container"><div class="neu-card empty"><p>No station</p></div></div>`; return; }

  const isAttendant = user.role === 'attendant';
  const station = stations.find(s => s.id === stationId);

  const f = {
    from: query.from || shiftDays(-6),
    to: query.to || todayKey(),
    emp: isAttendant ? user.uid : (query.emp || 'all'),
    pump: query.pump || 'ALL',
    fuel: query.fuel || 'ALL',
  };

  const report = await getReportForRange(stationId, f.from, f.to, {
    employeeId: f.emp,
    pumpId: f.pump,
    fuelType: f.fuel,
  });

  // Dropdown options from everything in range, so you can always switch back
  const all = await getReportForRange(stationId, f.from, f.to);
  const fuelOptions = all.byFuel.map(v => v.fuelType);

  let pumpOptions = [];
  try {
    pumpOptions = (await getPumps(stationId)).map(p => ({ id: p.id, name: p.name || `Pump ${p.number}` }));
  } catch { pumpOptions = []; }
  if (!pumpOptions.length) pumpOptions = all.byPump.map(p => ({ id: p.pumpId, name: p.pumpName }));

  let employeeOptions = [];
  if (!isAttendant) {
    try {
      employeeOptions = (await getEmployees(stationId)).map(e => ({ id: e.uid || e.id, name: e.name || e.phone || 'Staff' }));
    } catch { employeeOptions = []; }
    if (!employeeOptions.length) employeeOptions = all.byEmployee.map(e => ({ id: e.userId, name: e.employeeName }));
  }

  const empName = f.emp === 'all'
    ? 'All staff'
    : (employeeOptions.find(e => e.id === f.emp)?.name || report.byEmployee[0]?.employeeName || 'Staff');
  const pumpName = f.pump === 'ALL' ? 'All pumps' : (pumpOptions.find(p => p.id === f.pump)?.name || 'Pump');
  const activeCount = [f.emp !== 'all', f.pump !== 'ALL', f.fuel !== 'ALL'].filter(Boolean).length;

  // ------------------------------------------------------------ filters
  const filtersHtml = `
    <div class="neu-card" style="margin-top:14px;padding:14px;border-radius:14px">
      <div style="display:flex;gap:8px;overflow:auto;padding-bottom:4px">
        ${PRESETS().map(p => {
          const on = f.from === p.from && f.to === p.to;
          return `<button class="preset-btn neu-btn" data-from="${p.from}" data-to="${p.to}" style="min-height:34px;padding:0 14px;border-radius:20px;font-size:12px;white-space:nowrap;${on ? 'background:#232f3e;color:white;border-color:#232f3e' : ''}">${p.label}</button>`;
        }).join('')}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">
        <div><label class="label" style="font-size:11px">From</label><input type="date" id="fromDate" class="neu-input" style="min-height:44px;border-radius:10px" value="${f.from}" max="${todayKey()}"></div>
        <div><label class="label" style="font-size:11px">To</label><input type="date" id="toDate" class="neu-input" style="min-height:44px;border-radius:10px" value="${f.to}" max="${todayKey()}"></div>
      </div>

      <div style="display:grid;grid-template-columns:${isAttendant ? '1fr 1fr' : '1fr 1fr 1fr'};gap:10px;margin-top:10px">
        ${isAttendant ? '' : `
        <div><label class="label" style="font-size:11px">Employee</label>
          <select id="empFilter" class="neu-select" style="min-height:44px;border-radius:10px">
            <option value="all">All staff</option>
            ${employeeOptions.map(e => `<option value="${esc(e.id)}" ${f.emp === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}
          </select>
        </div>`}
        <div><label class="label" style="font-size:11px">Pump</label>
          <select id="pumpFilter" class="neu-select" style="min-height:44px;border-radius:10px">
            <option value="ALL">All pumps</option>
            ${pumpOptions.map(p => `<option value="${esc(p.id)}" ${f.pump === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
          </select>
        </div>
        <div><label class="label" style="font-size:11px">Fuel</label>
          <select id="fuelFilter" class="neu-select" style="min-height:44px;border-radius:10px">
            <option value="ALL">All fuels</option>
            ${fuelOptions.map(ft => `<option value="${esc(ft)}" ${f.fuel === ft ? 'selected' : ''}>${esc(ft)}</option>`).join('')}
          </select>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:${activeCount ? '2fr 1fr' : '1fr'};gap:10px;margin-top:12px">
        <button id="applyFilter" class="neu-btn neu-btn--primary" style="min-height:46px;border-radius:12px;font-weight:700">Apply</button>
        ${activeCount ? `<button id="resetFilter" class="neu-btn" style="min-height:46px;border-radius:12px;font-weight:600">Clear ${activeCount}</button>` : ''}
      </div>

      <div style="margin-top:10px;font-size:11px;color:var(--text-secondary)">
        ${f.from === f.to ? dayLabel(f.from) : `${f.from} → ${f.to}`} • ${esc(empName)} • ${esc(pumpName)}${f.fuel !== 'ALL' ? ' • ' + esc(f.fuel) : ''}
      </div>
    </div>`;

  // ------------------------------------------------------------ totals
  const totalsHtml = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:14px">
      <div class="neu-card" style="padding:12px;border-radius:12px;text-align:center">
        <div style="font-size:10px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.4px">Fuel Sold</div>
        <div style="font-weight:800;font-size:17px;margin-top:4px">${formatLiters(report.totalLiters)}</div>
      </div>
      <div class="neu-card" style="padding:12px;border-radius:12px;text-align:center">
        <div style="font-size:10px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.4px">Shifts</div>
        <div style="font-weight:800;font-size:17px;margin-top:4px">${report.count}</div>
      </div>
      <div class="neu-card" style="padding:12px;border-radius:12px;text-align:center">
        <div style="font-size:10px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.4px">${isAttendant ? 'Days' : 'Staff'}</div>
        <div style="font-weight:800;font-size:17px;margin-top:4px">${isAttendant ? report.byDate.length : report.byEmployee.length}</div>
      </div>
    </div>`;

  // ------------------------------------------------------------ who worked what
  const staffHtml = isAttendant || !report.byEmployee.length ? '' : `
    <div class="neu-card" style="margin-top:14px;padding:16px;border-radius:14px">
      <h3 style="font-weight:700;font-size:14px">Who Worked What</h3>
      <div style="margin-top:12px;display:flex;flex-direction:column;gap:10px">
        ${report.byEmployee.map(e => `
          <div class="emp-row" data-emp="${esc(e.userId)}" style="padding:12px;background:var(--bg);border-radius:12px;cursor:pointer">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
              <div style="display:flex;align-items:center;gap:10px;min-width:0">
                <div style="width:34px;height:34px;flex:none;border-radius:50%;background:#232f3e;color:white;display:grid;place-items:center;font-weight:700;font-size:12px">${initials(e.employeeName)}</div>
                <div style="min-width:0">
                  <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.employeeName)}</div>
                  <div style="font-size:11px;color:var(--text-secondary)">${e.shifts} shift${e.shifts === 1 ? '' : 's'} • ${e.days} day${e.days === 1 ? '' : 's'}</div>
                </div>
              </div>
              <div style="font-weight:800;font-size:14px;white-space:nowrap">${formatLiters(e.liters)}</div>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">
              ${e.pumps.map(p => chip(p, 'pump')).join('')}
              ${e.fuels.map(ft => chip(ft, 'fuel')).join('')}
            </div>
          </div>`).join('')}
      </div>
    </div>`;

  // ------------------------------------------------------------ pumps
  const pumpsHtml = !report.byPump.length ? '' : `
    <div class="neu-card" style="margin-top:14px;padding:16px;border-radius:14px">
      <h3 style="font-weight:700;font-size:14px">By Pump</h3>
      <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
        ${report.byPump.map(p => `
          <div class="pump-row" data-pump="${esc(p.pumpId)}" style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px;background:var(--bg);border-radius:10px;cursor:pointer">
            <div style="min-width:0">
              <div style="font-weight:700;font-size:13px">${esc(p.pumpName)}</div>
              <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.staff.join(', '))} • ${esc(p.fuels.join(', '))}</div>
            </div>
            <div style="font-weight:700;font-size:13px;white-space:nowrap">${formatLiters(p.liters)}</div>
          </div>`).join('')}
      </div>
    </div>`;

  // ------------------------------------------------------------ fuels
  const fuelsHtml = !report.byFuel.length ? '' : `
    <div class="neu-card" style="margin-top:14px;padding:16px;border-radius:14px">
      <h3 style="font-weight:700;font-size:14px">By Fuel</h3>
      <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
        ${report.byFuel.map(v => `
          <div class="fuel-row" data-fuel="${esc(v.fuelType)}" style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg);border-radius:10px;cursor:pointer">
            <div style="font-weight:600;font-size:13px">${esc(v.fuelType)}</div>
            <div style="font-weight:700;font-size:13px">${formatLiters(v.liters)}</div>
          </div>`).join('')}
      </div>
    </div>`;

  // ------------------------------------------------------------ day log
  const byDay = {};
  report.shifts.forEach(s => { (byDay[s.work.date] ||= []).push(s); });
  const dayKeys = Object.keys(byDay).sort((a, b) => b.localeCompare(a));

  const logHtml = `
    <div class="neu-card" style="margin-top:14px;padding:16px;border-radius:14px">
      <h3 style="font-weight:700;font-size:14px">Work Log</h3>
      <div style="margin-top:12px;display:flex;flex-direction:column;gap:16px">
        ${dayKeys.map(dk => {
          const list = byDay[dk].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
          const liters = list.reduce((a, s) => a + s.work.liters, 0);
          return `
          <div>
            <div style="display:flex;justify-content:space-between;align-items:baseline;padding-bottom:6px;border-bottom:1px solid var(--border)">
              <span style="font-weight:700;font-size:12px">${dayLabel(dk)}</span>
              <span style="font-size:11px;color:var(--text-secondary)">${list.length} shift${list.length === 1 ? '' : 's'} • ${formatLiters(liters)}</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
              ${list.map(s => `
                <div style="padding:12px;background:var(--bg);border-radius:10px;cursor:pointer" onclick="location.hash='#/shifts/${s.id}'">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
                    <div style="font-weight:600;font-size:13px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                      ${isAttendant ? '' : esc(s.work.employeeName) + ' • '}${timeOf(s.startTime)}${s.endTime ? ' → ' + timeOf(s.endTime) : ''}
                    </div>
                    ${statusBadge(s.status)}
                  </div>
                  <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">
                    ${s.work.pumps.map(p => chip(`${p.pumpName} · ${formatLiters(p.liters)}`, 'pump')).join('')}
                    ${s.work.fuelNames.map(ft => chip(ft, 'fuel')).join('')}
                  </div>
                </div>`).join('')}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;

  // ------------------------------------------------------------ render
  const empty = `
    <div class="neu-card" style="margin-top:14px;padding:24px;border-radius:14px;text-align:center">
      <div style="font-size:28px">📭</div>
      <p style="font-weight:700;margin-top:8px">Nothing in this range</p>
      <p style="font-size:12px;color:var(--text-secondary);margin-top:4px">Try a wider date range${activeCount ? ' or clear the filters' : ''}.</p>
    </div>`;

  root.innerHTML = `
    <div class="container" style="max-width:520px;margin:0 auto;padding-bottom:100px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <div>
          <h1 class="page-title" style="font-size:20px">${isAttendant ? 'My Work' : 'Reports'}</h1>
          <p class="page-sub" style="margin-top:4px">${esc(station?.name || '')}</p>
        </div>
        <button class="neu-btn" id="exportBtn" style="min-height:40px;padding:0 14px;border-radius:10px;font-weight:600">⬇️ CSV</button>
      </div>

      ${filtersHtml}
      ${report.count === 0 ? empty : `${totalsHtml}${staffHtml}${pumpsHtml}${fuelsHtml}${logHtml}`}
    </div>`;

  // ------------------------------------------------------------ handlers
  const go = (patch) => { location.hash = buildHash({ ...f, ...patch }); };

  root.querySelectorAll('.preset-btn').forEach(b =>
    b.addEventListener('click', () => go({ from: b.dataset.from, to: b.dataset.to })));

  root.querySelector('#applyFilter')?.addEventListener('click', () => {
    const from = root.querySelector('#fromDate').value;
    const to = root.querySelector('#toDate').value;
    if (!from || !to) return alert('Pick both dates');
    if (from > to) return alert('From date cannot be after To date');
    go({
      from, to,
      emp: root.querySelector('#empFilter')?.value || f.emp,
      pump: root.querySelector('#pumpFilter').value,
      fuel: root.querySelector('#fuelFilter').value,
    });
  });

  root.querySelector('#resetFilter')?.addEventListener('click', () => go({ emp: 'all', pump: 'ALL', fuel: 'ALL' }));
  root.querySelectorAll('.emp-row').forEach(el => el.addEventListener('click', () => go({ emp: el.dataset.emp })));
  root.querySelectorAll('.pump-row').forEach(el => el.addEventListener('click', () => go({ pump: el.dataset.pump })));
  root.querySelectorAll('.fuel-row').forEach(el => el.addEventListener('click', () => go({ fuel: el.dataset.fuel })));

  root.querySelector('#exportBtn').addEventListener('click', () => exportCSV(report, f));
}

function exportCSV(report, f) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const L = [];
  L.push(['Work Report', `${report.fromDate} to ${report.toDate}`].map(q).join(','));
  L.push(['Filters', `employee=${f.emp}; pump=${f.pump}; fuel=${f.fuel}`].map(q).join(','));
  L.push('');
  L.push(['Date', 'Employee', 'Start', 'End', 'Status', 'Pump', 'Fuel', 'Liters'].map(q).join(','));
  report.shifts.forEach(s => {
    if (!s.work.pumps.length) {
      L.push([s.work.date, s.work.employeeName, s.startTime, s.endTime || '', s.status, '', '', 0].map(q).join(','));
      return;
    }
    s.work.pumps.forEach(p => {
      Object.entries(p.fuels).forEach(([ft, v]) => {
        L.push([s.work.date, s.work.employeeName, s.startTime, s.endTime || '', s.status, p.pumpName, ft, v.liters].map(q).join(','));
      });
    });
  });
  L.push('');
  L.push(['By Employee', 'Shifts', 'Days', 'Pumps', 'Fuels', 'Liters'].map(q).join(','));
  report.byEmployee.forEach(e => L.push([e.employeeName, e.shifts, e.days, e.pumps.join(' / '), e.fuels.join(' / '), e.liters].map(q).join(',')));
  L.push('');
  L.push(['By Pump', 'Staff', 'Fuels', 'Liters'].map(q).join(','));
  report.byPump.forEach(p => L.push([p.pumpName, p.staff.join(' / '), p.fuels.join(' / '), p.liters].map(q).join(',')));
  L.push('');
  L.push(['By Fuel', 'Liters'].map(q).join(','));
  report.byFuel.forEach(v => L.push([v.fuelType, v.liters].map(q).join(',')));

  const blob = new Blob([L.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `work-report-${report.fromDate}-to-${report.toDate}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function auditView({ root }) {
  root.innerHTML = `<div class="container"><h1 class="page-title">Removed</h1><p class="page-sub">Audit log removed. Only owner can destroy data.</p><button class="neu-btn neu-btn--primary" style="margin-top:12px;min-height:44px;border-radius:12px" onclick="location.hash='#/reports'">Back to Reports</button></div>`;
}
