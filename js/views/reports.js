import { getState } from '../state.js';
import { getStationsForCurrentUser } from '../services/stations.js';
import { getReportForRange, toDateKey } from '../services/reports.js';
import { formatLiters } from '../services/calc.js';
import { getEmployees } from '../services/users.js';

// ---------------------------------------------------------------- helpers
const todayKey = () => toDateKey(new Date());
const shiftDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return toDateKey(d); };
const firstOfMonth = () => { const d = new Date(); return toDateKey(new Date(d.getFullYear(), d.getMonth(), 1)); };

// Date ranges offered in the single dropdown.
const RANGES = () => ({
  today:  { label: 'Today',        from: todayKey(),     to: todayKey() },
  yest:   { label: 'Yesterday',    from: shiftDays(-1),  to: shiftDays(-1) },
  '7d':   { label: 'Last 7 days',  from: shiftDays(-6),  to: todayKey() },
  month:  { label: 'This month',   from: firstOfMonth(), to: todayKey() },
  '30d':  { label: 'Last 30 days', from: shiftDays(-29), to: todayKey() },
  all:    { label: 'All time',     from: '2000-01-01',   to: todayKey() },
});

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

  const ranges = RANGES();
  const f = {
    range: ranges[query.range] ? query.range : '7d',
    emp: isAttendant ? user.uid : (query.emp || 'all'),
  };
  const range = ranges[f.range];

  const report = await getReportForRange(stationId, range.from, range.to, { employeeId: f.emp });

  // Staff list for the dropdown — everyone, so you can always switch back.
  let employeeOptions = [];
  if (!isAttendant) {
    try {
      employeeOptions = (await getEmployees(stationId))
        .map(e => ({ id: e.uid || e.id, name: e.name || e.phone || 'Staff' }));
    } catch { employeeOptions = []; }
    if (!employeeOptions.length) {
      const all = await getReportForRange(stationId, range.from, range.to);
      employeeOptions = all.byEmployee.map(e => ({ id: e.userId, name: e.employeeName }));
    }
  }

  const empName = f.emp === 'all'
    ? 'All staff'
    : (employeeOptions.find(e => e.id === f.emp)?.name || report.byEmployee[0]?.employeeName || 'Staff');

  // ------------------------------------------------------------ filters
  const filtersHtml = `
    <div style="display:grid;grid-template-columns:${isAttendant ? '1fr' : '1fr 1fr'};gap:10px;margin-top:14px">
      <select id="rangeFilter" class="neu-select" style="min-height:46px;border-radius:12px;font-weight:600">
        ${Object.entries(ranges).map(([k, r]) => `<option value="${k}" ${f.range === k ? 'selected' : ''}>${r.label}</option>`).join('')}
      </select>
      ${isAttendant ? '' : `
      <select id="empFilter" class="neu-select" style="min-height:46px;border-radius:12px;font-weight:600">
        <option value="all">All staff</option>
        ${employeeOptions.map(e => `<option value="${esc(e.id)}" ${f.emp === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}
      </select>`}
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
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px;background:var(--bg);border-radius:10px">
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
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg);border-radius:10px">
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
      <p style="font-size:12px;color:var(--text-secondary);margin-top:4px">Pick a wider date range${f.emp !== 'all' ? ' or switch back to all staff' : ''}.</p>
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

  root.querySelector('#rangeFilter')?.addEventListener('change', (e) => go({ range: e.target.value }));
  root.querySelector('#empFilter')?.addEventListener('change', (e) => go({ emp: e.target.value }));
  root.querySelectorAll('.emp-row').forEach(el => el.addEventListener('click', () => go({ emp: el.dataset.emp })));

  root.querySelector('#exportBtn').addEventListener('click', () => exportCSV(report, f, empName));
}

function exportCSV(report, f, esc_name) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const L = [];
  L.push(['Work Report', `${report.fromDate} to ${report.toDate}`].map(q).join(','));
  L.push(['Filter', `${esc_name}`].map(q).join(','));
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
