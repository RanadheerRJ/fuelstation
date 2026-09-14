import { getState } from '../state.js';
import { getStationsForCurrentUser } from '../services/stations.js';
import { getReportForRange, toDateKey } from '../services/reports.js';
import { formatCurrency, formatLiters } from '../services/calc.js';
import { getEmployees } from '../services/users.js';
import { getHideBalancePref } from '../services/collections.js';

// ---------------------------------------------------------------- helpers
const todayKey = () => toDateKey(new Date());
const shiftDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return toDateKey(d); };
const firstOfMonth = () => { const d = new Date(); return toDateKey(new Date(d.getFullYear(), d.getMonth(), 1)); };

function presets() {
  return [
    { key: 'today', label: 'Today', from: todayKey(), to: todayKey() },
    { key: 'yest', label: 'Yesterday', from: shiftDays(-1), to: shiftDays(-1) },
    { key: '7d', label: 'Last 7 Days', from: shiftDays(-6), to: todayKey() },
    { key: 'month', label: 'This Month', from: firstOfMonth(), to: todayKey() },
    { key: '30d', label: 'Last 30 Days', from: shiftDays(-29), to: todayKey() },
  ];
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function buildHash({ from, to, emp, status, fuel, settle }) {
  const p = new URLSearchParams({ from, to, emp, status, fuel, settle });
  return `#/reports?${p.toString()}`;
}

function card(inner, extra = '') {
  return `<div class="neu-card" style="margin-top:14px;padding:16px;border-radius:14px;${extra}">${inner}</div>`;
}

function statBox(label, value, sub, color) {
  return `<div style="padding:12px;background:var(--bg);border-radius:12px">
    <div style="font-size:11px;color:var(--text-secondary)">${label}</div>
    <div style="font-weight:800;font-size:18px;margin-top:4px;${color ? `color:${color}` : ''}">${value}</div>
    ${sub ? `<div style="font-size:10px;color:var(--text-tertiary);margin-top:2px">${sub}</div>` : ''}
  </div>`;
}

function row(label, value, opts = {}) {
  return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:${opts.pad || '8px 0'};font-size:13px;${opts.style || ''}">
    <span style="color:var(--text-secondary)">${label}</span>
    <span style="font-weight:${opts.bold ? 800 : 600};${opts.color ? `color:${opts.color}` : ''}">${value}</span>
  </div>`;
}

function statusBadge(status) {
  const map = { APPROVED: 'badge--success', PENDING_REVIEW: 'badge--warning', REJECTED: 'badge--danger', ACTIVE: 'badge--info' };
  return `<span class="badge ${map[status] || 'badge--neutral'}" style="font-size:10px;padding:4px 8px;border-radius:12px">${status}</span>`;
}

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
    status: query.status || 'ALL',
    fuel: query.fuel || 'ALL',
    settle: query.settle || 'ALL',
  };

  const report = await getReportForRange(stationId, f.from, f.to, {
    employeeId: f.emp,
    status: f.status,
    fuelType: f.fuel,
    settlement: f.settle,
  });

  // Fuel + employee options come from everything in the range, not the filtered slice,
  // so you can always switch back.
  const unfiltered = await getReportForRange(stationId, f.from, f.to);
  const fuelOptions = Object.keys(unfiltered.byFuel).sort();

  let employeesList = [];
  if (!isAttendant) {
    try {
      employeesList = (await getEmployees(stationId)).filter(e => e.role !== 'owner' || true);
    } catch { employeesList = []; }
    if (!employeesList.length) {
      employeesList = Object.values(unfiltered.byEmployee).map(e => ({ uid: e.userId, name: e.employeeName }));
    }
  }

  const hide = getHideBalancePref(stationId);
  const fmt = (v) => hide ? '••••' : formatCurrency(v);
  const fmtL = (v) => hide ? '••••' : formatLiters(v);

  const activeEmpName = f.emp === 'all'
    ? 'All staff'
    : (employeesList.find(e => (e.uid || e.id) === f.emp)?.name || report.byEmployee[f.emp]?.employeeName || 'Selected staff');

  const filtersOn = f.emp !== 'all' || f.status !== 'ALL' || f.fuel !== 'ALL' || f.settle !== 'ALL';

  // ------------------------------------------------------------ filters UI
  const filtersHtml = `
    <div class="neu-card" style="margin-top:14px;padding:14px;border-radius:14px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-secondary)">Filters</div>
        <button id="resetFilter" class="neu-btn" style="min-height:30px;padding:0 12px;border-radius:8px;font-size:11px">Reset</button>
      </div>

      <div style="display:flex;gap:8px;overflow:auto;margin-top:12px;padding-bottom:4px">
        ${presets().map(p => {
          const on = f.from === p.from && f.to === p.to;
          return `<button class="preset-btn neu-btn" data-from="${p.from}" data-to="${p.to}" style="min-height:34px;padding:0 14px;border-radius:20px;font-size:12px;white-space:nowrap;${on ? 'background:#232f3e;color:white;border-color:#232f3e' : ''}">${p.label}</button>`;
        }).join('')}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">
        <div><label class="label" style="font-size:11px">From</label><input type="date" id="fromDate" class="neu-input" style="min-height:44px;border-radius:10px" value="${f.from}" max="${todayKey()}"></div>
        <div><label class="label" style="font-size:11px">To</label><input type="date" id="toDate" class="neu-input" style="min-height:44px;border-radius:10px" value="${f.to}" max="${todayKey()}"></div>

        ${isAttendant ? '' : `
        <div><label class="label" style="font-size:11px">Employee</label>
          <select id="empFilter" class="neu-select" style="min-height:44px;border-radius:10px">
            <option value="all" ${f.emp === 'all' ? 'selected' : ''}>All employees</option>
            ${employeesList.map(e => {
              const id = e.uid || e.id;
              return `<option value="${esc(id)}" ${f.emp === id ? 'selected' : ''}>${esc(e.name || e.phone || 'Staff')}</option>`;
            }).join('')}
          </select>
        </div>`}

        <div><label class="label" style="font-size:11px">Status</label>
          <select id="statusFilter" class="neu-select" style="min-height:44px;border-radius:10px">
            ${['ALL', 'ACTIVE', 'PENDING_REVIEW', 'APPROVED', 'REJECTED'].map(s => `<option value="${s}" ${f.status === s ? 'selected' : ''}>${s === 'ALL' ? 'All status' : s.replace('_', ' ')}</option>`).join('')}
          </select>
        </div>

        <div><label class="label" style="font-size:11px">Fuel</label>
          <select id="fuelFilter" class="neu-select" style="min-height:44px;border-radius:10px">
            <option value="ALL" ${f.fuel === 'ALL' ? 'selected' : ''}>All fuels</option>
            ${fuelOptions.map(ft => `<option value="${esc(ft)}" ${f.fuel === ft ? 'selected' : ''}>${esc(ft)}</option>`).join('')}
          </select>
        </div>

        <div><label class="label" style="font-size:11px">Settlement</label>
          <select id="settleFilter" class="neu-select" style="min-height:44px;border-radius:10px">
            <option value="ALL" ${f.settle === 'ALL' ? 'selected' : ''}>All shifts</option>
            <option value="PENDING" ${f.settle === 'PENDING' ? 'selected' : ''}>Not collected yet</option>
            <option value="SETTLED" ${f.settle === 'SETTLED' ? 'selected' : ''}>Already collected</option>
          </select>
        </div>
      </div>

      <button id="applyFilter" class="neu-btn neu-btn--primary" style="margin-top:12px;min-height:48px;border-radius:12px;width:100%;font-weight:700">Apply</button>

      <div style="margin-top:10px;font-size:11px;color:var(--text-secondary)">
        ${f.from} → ${f.to} • ${esc(activeEmpName)} • ${report.count} shift${report.count === 1 ? '' : 's'}${filtersOn ? ' • filtered' : ''}
      </div>
    </div>`;

  // ------------------------------------------------------------ money card
  // ONE number for money owed. No duplicate totals.
  const owed = report.pendingCollect;
  const owedApprovedCount = report.shifts.filter(s => s.status === 'APPROVED' && !s.fin.isSettled && s.fin.pendingCollect > 0.5).length;
  const awaitingApproval = report.shifts.filter(s => s.status === 'PENDING_REVIEW').reduce((a, s) => a + s.fin.toCollect, 0);

  const moneyCard = `
    <div class="neu-card" style="margin-top:14px;padding:16px;border-radius:14px;${owed > 0.5 ? 'background:#fff1f0;border:1px solid #ffa39e' : 'background:#f6ffed;border:1px solid #b7eb8f'}">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${owed > 0.5 ? '#cf1322' : '#389e0d'}">
        ${isAttendant ? '💸 To Hand Over' : '💰 Still To Collect'}${f.emp !== 'all' && !isAttendant ? ` — ${esc(activeEmpName)}` : ''}
      </div>
      <div style="font-weight:800;font-size:28px;margin-top:4px;color:${owed > 0.5 ? '#cf1322' : '#389e0d'}">${fmt(owed)}</div>
      <div style="font-size:11px;color:var(--text-secondary);margin-top:4px">
        ${owed > 0.5
          ? `From ${owedApprovedCount} approved shift${owedApprovedCount === 1 ? '' : 's'} not yet collected`
          : 'Everything approved in this range is settled'}
      </div>

      <div style="margin-top:12px;padding-top:10px;border-top:1px dashed ${owed > 0.5 ? '#ffa39e' : '#b7eb8f'}">
        ${row('Short in approved shifts', fmt(report.shifts.filter(s => s.status === 'APPROVED').reduce((a, s) => a + s.fin.toCollect, 0)), { pad: '5px 0' })}
        ${row('Already collected', fmt(report.collected), { pad: '5px 0', color: '#389e0d' })}
        ${awaitingApproval > 0.5 ? row('Waiting for approval (not counted)', fmt(awaitingApproval), { pad: '5px 0', color: '#ad6800' }) : ''}
        ${report.pendingReturn > 0.5 ? row('To return to staff (excess)', fmt(report.pendingReturn), { pad: '5px 0', color: '#389e0d' }) : ''}
      </div>
      ${isAttendant ? '' : `<button class="neu-btn" style="margin-top:12px;min-height:42px;border-radius:10px;width:100%;font-weight:600" onclick="location.hash='#/collections'">Go to Collections →</button>`}
    </div>`;

  // ------------------------------------------------------------ sales card
  const salesCard = card(`
    <h3 style="font-weight:700;font-size:14px">Sales</h3>
    <div class="grid grid-2" style="margin-top:12px;gap:10px">
      ${statBox('Net Sales', fmt(report.netRevenue), `${report.count} shift${report.count === 1 ? '' : 's'}`)}
      ${statBox('Fuel Sold', fmtL(report.totalLiters), `${Object.keys(report.byFuel).length} fuel type(s)`)}
    </div>
    <div style="margin-top:12px;padding:12px;background:var(--bg);border-radius:10px">
      ${row('Gross fuel sales', fmt(report.grossRevenue), { pad: '5px 0' })}
      ${report.totalExpenses > 0.5 ? row('Less: expenses / testing', '-' + fmt(report.totalExpenses), { pad: '5px 0', color: '#fa541c' }) : ''}
      ${row('Net sales', fmt(report.netRevenue), { pad: '5px 0', bold: true, color: '#389e0d' })}
      ${row('Payments recorded', fmt(report.totalPayments), { pad: '5px 0' })}
    </div>

    ${Object.keys(report.byFuel).length ? `
      <div style="margin-top:12px">
        <div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:6px">BY FUEL</div>
        ${Object.entries(report.byFuel).sort((a, b) => b[1].revenue - a[1].revenue).map(([ft, v]) =>
          `<div style="display:flex;justify-content:space-between;font-size:12px;padding:8px 10px;background:var(--bg);border-radius:8px;margin-bottom:6px"><span style="font-weight:600">${esc(ft)}</span><span>${fmtL(v.liters)} • ${fmt(v.revenue)}</span></div>`
        ).join('')}
      </div>` : ''}

    <div style="margin-top:12px">
      <div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:6px">BY PAYMENT MODE</div>
      <div style="padding:10px 12px;background:var(--bg);border-radius:10px">
        ${Object.entries(report.paymentsAgg).filter(([, v]) => v > 0).map(([k, v]) => row(k.toUpperCase(), fmt(v), { pad: '4px 0' })).join('')
          || `<div style="font-size:12px;color:var(--text-secondary)">No payments recorded</div>`}
      </div>
    </div>
  `);

  // ------------------------------------------------------------ employees
  const empRows = Object.values(report.byEmployee).sort((a, b) => b.net - a.net);
  const employeeCard = isAttendant || !empRows.length ? '' : card(`
    <h3 style="font-weight:700;font-size:14px">By Employee • ${empRows.length}</h3>
    <div style="margin-top:10px;display:flex;flex-direction:column;gap:8px">
      ${empRows.map(e => `
        <div class="emp-row" data-emp="${esc(e.userId)}" style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg);border-radius:10px;cursor:pointer">
          <div>
            <div style="font-weight:600;font-size:13px">${esc(e.employeeName)}</div>
            <div style="font-size:11px;color:var(--text-secondary)">${e.shifts} shift${e.shifts === 1 ? '' : 's'} • ${fmtL(e.liters)}${e.pendingCollect > 0.5 ? ` • <span style="color:#cf1322">to collect ${fmt(e.pendingCollect)}</span>` : ' • settled'}</div>
          </div>
          <div style="font-weight:700;font-size:13px">${fmt(e.net)}</div>
        </div>`).join('')}
    </div>
  `);

  // ------------------------------------------------------------ daily
  const days = Object.values(report.byDate).sort((a, b) => b.date.localeCompare(a.date));
  const dailyCard = days.length < 2 ? '' : card(`
    <h3 style="font-weight:700;font-size:14px">Daily • ${days.length} days</h3>
    <div style="margin-top:10px;display:flex;flex-direction:column;gap:6px;max-height:240px;overflow:auto">
      ${days.map(d => `<div style="display:flex;justify-content:space-between;font-size:12px;padding:8px 10px;background:var(--bg);border-radius:8px"><span>${d.date} • ${d.shifts} shift${d.shifts === 1 ? '' : 's'}</span><span style="font-weight:600">${fmt(d.revenue)}</span></div>`).join('')}
    </div>
  `);

  // ------------------------------------------------------------ shifts
  const shiftsCard = card(`
    <div style="display:flex;justify-content:space-between;align-items:center">
      <h3 style="font-weight:700;font-size:14px">Shifts • ${report.shifts.length}</h3>
      ${report.shifts.length > 25 ? `<button id="loadMore" class="neu-btn" style="min-height:30px;padding:0 12px;border-radius:10px;font-size:11px">Show all</button>` : ''}
    </div>
    <div id="shiftsList" style="margin-top:10px;display:flex;flex-direction:column;gap:8px">
      ${renderShifts(report.shifts.slice(0, 25), fmt, fmtL, isAttendant)}
    </div>
  `);

  // ------------------------------------------------------------ collections
  const collectionsCard = isAttendant || !report.settlements.length ? '' : card(`
    <h3 style="font-weight:700;font-size:14px">Money Collected in Range • ${fmt(report.settledInRange)}</h3>
    <div style="margin-top:10px;display:flex;flex-direction:column;gap:6px;max-height:260px;overflow:auto">
      ${report.settlements.slice(0, 30).map(s => `<div style="display:flex;justify-content:space-between;font-size:12px;padding:8px 10px;background:var(--bg);border-radius:8px"><span>${esc(s.staffName || 'Staff')} • ${s.type === 'collect' ? 'collected' : 'returned'}</span><span style="font-weight:600">${fmt(s.amount)} • ${new Date(s.createdAt).toLocaleDateString()}</span></div>`).join('')}
    </div>
  `);

  root.innerHTML = `
    <div class="container" style="max-width:520px;margin:0 auto;padding-bottom:100px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <div>
          <h1 class="page-title" style="font-size:20px">${isAttendant ? 'My Reports' : 'Station Reports'}</h1>
          <p class="page-sub" style="margin-top:4px">${esc(station?.name || '')}</p>
        </div>
        <button class="neu-btn" id="exportBtn" style="min-height:40px;padding:0 14px;border-radius:10px;font-weight:600">⬇️ CSV</button>
      </div>

      ${filtersHtml}
      ${report.count === 0
        ? card(`<div style="text-align:center;padding:18px 0"><div style="font-size:28px">📭</div><p style="font-weight:700;margin-top:8px">No shifts match these filters</p><p style="font-size:12px;color:var(--text-secondary);margin-top:4px">Try a wider date range or reset the filters.</p></div>`)
        : `${moneyCard}${salesCard}${employeeCard}${dailyCard}${shiftsCard}${collectionsCard}`}
    </div>`;

  // ------------------------------------------------------------ handlers
  root.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      location.hash = buildHash({ ...f, from: btn.dataset.from, to: btn.dataset.to });
    });
  });

  root.querySelector('#applyFilter')?.addEventListener('click', () => {
    const from = root.querySelector('#fromDate').value;
    const to = root.querySelector('#toDate').value;
    if (!from || !to) return alert('Pick both dates');
    if (from > to) return alert('From date cannot be after To date');
    location.hash = buildHash({
      from, to,
      emp: root.querySelector('#empFilter')?.value || f.emp,
      status: root.querySelector('#statusFilter').value,
      fuel: root.querySelector('#fuelFilter').value,
      settle: root.querySelector('#settleFilter').value,
    });
  });

  root.querySelector('#resetFilter')?.addEventListener('click', () => {
    location.hash = buildHash({ from: shiftDays(-6), to: todayKey(), emp: 'all', status: 'ALL', fuel: 'ALL', settle: 'ALL' });
  });

  root.querySelectorAll('.emp-row').forEach(el => {
    el.addEventListener('click', () => { location.hash = buildHash({ ...f, emp: el.dataset.emp }); });
  });

  root.querySelector('#loadMore')?.addEventListener('click', (e) => {
    root.querySelector('#shiftsList').innerHTML = renderShifts(report.shifts, fmt, fmtL, isAttendant);
    e.target.remove();
  });

  root.querySelector('#exportBtn').addEventListener('click', () => exportCSV(report, f));
}

function renderShifts(shifts, fmt, fmtL, isAttendant) {
  if (!shifts.length) return `<p style="font-size:12px;color:var(--text-secondary)">No shifts</p>`;
  return shifts.map(s => {
    const fin = s.fin;
    let money = 'Balanced';
    let color = 'var(--text-secondary)';
    if (fin.toCollect > 0.5) {
      color = '#cf1322';
      money = s.status === 'APPROVED'
        ? (fin.isSettled ? `Collected ${fmt(fin.toCollect)}` : `To collect ${fmt(fin.pendingCollect)}`)
        : `Short ${fmt(fin.toCollect)}`;
      if (fin.isSettled) color = '#389e0d';
    } else if (fin.toReturn > 0.5) {
      color = '#389e0d';
      money = `Excess ${fmt(fin.toReturn)}`;
    }
    return `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px;background:var(--bg);border-radius:10px;cursor:pointer" onclick="location.hash='#/shifts/${s.id}'">
      <div style="min-width:0">
        <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${isAttendant ? '' : (s.employeeName || 'Staff') + ' • '}${new Date(s.startTime).toLocaleDateString()} ${new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">${fmtL(s.totals?.totalLiters || 0)} • ${fmt(fin.net)}</div>
        <div style="font-size:11px;margin-top:2px;color:${color};font-weight:600">${money}</div>
      </div>
      ${statusBadge(s.status)}
    </div>`;
  }).join('');
}

function exportCSV(report, f) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [];
  lines.push(['Report', `${report.fromDate} to ${report.toDate}`].map(q).join(','));
  lines.push(['Filters', `employee=${f.emp}; status=${f.status}; fuel=${f.fuel}; settlement=${f.settle}`].map(q).join(','));
  lines.push('');
  lines.push(['Summary', 'Amount'].map(q).join(','));
  [
    ['Shifts', report.count],
    ['Gross Fuel Sales', report.grossRevenue],
    ['Expenses', report.totalExpenses],
    ['Net Sales', report.netRevenue],
    ['Payments Recorded', report.totalPayments],
    ['Still To Collect', report.pendingCollect],
    ['Already Collected', report.collected],
    ['To Return to Staff', report.pendingReturn],
    ['Liters Sold', report.totalLiters],
  ].forEach(r => lines.push(r.map(q).join(',')));

  lines.push('');
  lines.push(['By Fuel', 'Liters', 'Revenue'].map(q).join(','));
  Object.entries(report.byFuel).forEach(([ft, v]) => lines.push([ft, v.liters, v.revenue].map(q).join(',')));

  lines.push('');
  lines.push(['By Employee', 'Shifts', 'Liters', 'Net Sales', 'To Collect (pending)', 'Collected'].map(q).join(','));
  Object.values(report.byEmployee).forEach(e => lines.push([e.employeeName, e.shifts, e.liters, e.net, e.pendingCollect, e.collected].map(q).join(',')));

  lines.push('');
  lines.push(['Shifts', 'Employee', 'Start', 'End', 'Status', 'Liters', 'Gross', 'Expenses', 'Net', 'Payments', 'To Collect', 'Pending', 'Collected'].map(q).join(','));
  report.shifts.forEach(s => lines.push([
    s.id, s.employeeName, s.startTime, s.endTime || '', s.status,
    s.totals?.totalLiters || 0, s.fin.gross, s.fin.expenses, s.fin.net, s.fin.payments,
    s.fin.toCollect, s.fin.pendingCollect, s.fin.collected,
  ].map(q).join(',')));

  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `report-${report.fromDate}-to-${report.toDate}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function auditView({ root }) {
  root.innerHTML = `<div class="container"><h1 class="page-title">Removed</h1><p class="page-sub">Audit log removed. Only owner can destroy data.</p><button class="neu-btn neu-btn--primary" style="margin-top:12px;min-height:44px;border-radius:12px" onclick="location.hash='#/reports'">Back to Reports</button></div>`;
}
