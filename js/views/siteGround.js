// SiteGround - the ONE place where ground (underground tank) stock is managed.
// Shows two large animated cylindrical tanks (MS green / HSD blue) with liquid
// waves, rising bubbles, a % badge and 25/50/75 level marks.
//
// Units: everything the user sees or types here is in KL (1 KL = 1000 L).
// Internally the tankStock service stores liters, so we convert at the edges.
import { getState } from '../state.js';
import { getStationsForCurrentUser } from '../services/stations.js';
import { getShifts } from '../services/shifts.js';
import { getActivePrices } from '../services/prices.js';
import {
  getTankStocks, setTankStock, removeTankStock,
  availableStock, stockLevel, LEVEL_COLORS,
} from '../services/tankStock.js';
import { formatKL, formatLiters, formatCurrency, formatDateTime } from '../services/calc.js';

const L_PER_KL = 1000;
const toKL = (liters) => (Number(liters) || 0) / L_PER_KL;
const toLiters = (kl) => (Number(kl) || 0) * L_PER_KL;

const TANK_THEME = {
  ms: {
    label: 'MS', sub: 'Petrol', emoji: '🟩',
    liquidTop: '#95de64', liquidBottom: '#237804', glow: 'rgba(82,196,26,0.35)',
  },
  hsd: {
    label: 'HSD', sub: 'Diesel', emoji: '🟦',
    liquidTop: '#69c0ff', liquidBottom: '#0050b3', glow: 'rgba(24,144,255,0.35)',
  },
};

function matchBucket(fuelType, bucket) {
  const f = (fuelType || '').toLowerCase();
  if (bucket === 'ms') return f.includes('petrol') || f === 'ms';
  return f.includes('diesel') || f === 'hsd';
}

// One big cylindrical tank with animated liquid
function tankSVG(bucket, pct, lvl) {
  const theme = TANK_THEME[bucket];
  const c = LEVEL_COLORS[lvl.level];
  const known = pct != null;
  const fillPct = known ? Math.max(0, Math.min(100, pct)) : 0;

  // Geometry of the cylinder body
  const X = 10, W = 160, TOP = 18, BOT = 250, RY = 16;
  const bodyH = BOT - TOP;
  const surfaceY = BOT - (bodyH * fillPct / 100);
  const uid = `tank-${bucket}`;

  const bubbles = known && fillPct > 4 ? [
    { cx: 40,  r: 3.2, dur: 4.2, delay: 0.0 },
    { cx: 72,  r: 2.2, dur: 5.1, delay: 1.1 },
    { cx: 104, r: 4.0, dur: 3.6, delay: 0.6 },
    { cx: 136, r: 2.6, dur: 4.8, delay: 2.0 },
    { cx: 56,  r: 2.0, dur: 6.0, delay: 2.8 },
  ].map(b => `
      <circle cx="${b.cx}" cy="${BOT - 6}" r="${b.r}" fill="rgba(255,255,255,0.5)">
        <animate attributeName="cy" values="${BOT - 6};${surfaceY + 4}" dur="${b.dur}s" begin="${b.delay}s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;0.75;0" dur="${b.dur}s" begin="${b.delay}s" repeatCount="indefinite" />
      </circle>`).join('') : '';

  // 25 / 50 / 75 level marks
  const marks = [25, 50, 75].map(m => {
    const y = BOT - (bodyH * m / 100);
    return `
      <line x1="${X}" y1="${y}" x2="${X + W}" y2="${y}" stroke="rgba(255,255,255,0.28)" stroke-width="1" stroke-dasharray="4 5" />
      <text x="${X + W + 6}" y="${y + 3.5}" font-size="9" font-weight="700" fill="rgba(255,255,255,0.55)">${m}%</text>`;
  }).join('');

  return `
  <svg viewBox="0 0 200 276" width="100%" style="max-width:200px;display:block;margin:0 auto;overflow:visible" role="img" aria-label="${theme.label} tank ${known ? fillPct.toFixed(0) + ' percent full' : 'level unknown'}">
    <defs>
      <linearGradient id="${uid}-liquid" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${theme.liquidTop}" />
        <stop offset="100%" stop-color="${theme.liquidBottom}" />
      </linearGradient>
      <linearGradient id="${uid}-shell" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%"   stop-color="rgba(255,255,255,0.05)" />
        <stop offset="35%"  stop-color="rgba(255,255,255,0.16)" />
        <stop offset="65%"  stop-color="rgba(255,255,255,0.04)" />
        <stop offset="100%" stop-color="rgba(0,0,0,0.20)" />
      </linearGradient>
      <clipPath id="${uid}-clip">
        <path d="M ${X} ${TOP} a ${W / 2} ${RY} 0 0 1 ${W} 0 L ${X + W} ${BOT} a ${W / 2} ${RY} 0 0 1 ${-W} 0 Z" />
      </clipPath>
    </defs>

    <!-- tank shell -->
    <path d="M ${X} ${TOP} a ${W / 2} ${RY} 0 0 1 ${W} 0 L ${X + W} ${BOT} a ${W / 2} ${RY} 0 0 1 ${-W} 0 Z"
          fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.22)" stroke-width="1.5" />

    <g clip-path="url(#${uid}-clip)">
      ${known && fillPct > 0 ? `
        <!-- liquid body -->
        <rect x="${X - 10}" y="${surfaceY}" width="${W + 20}" height="${BOT - surfaceY + 30}" fill="url(#${uid}-liquid)" />
        <!-- animated surface waves -->
        <g>
          <path d="M -200 8 q 50 -8 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 V 60 H -200 Z"
                fill="${theme.liquidTop}" opacity="0.55" transform="translate(0 ${surfaceY - 8})">
            <animateTransform attributeName="transform" type="translate"
              values="-100 ${surfaceY - 8}; 0 ${surfaceY - 8}" dur="3.4s" repeatCount="indefinite" />
          </path>
          <path d="M -200 8 q 50 8 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 V 60 H -200 Z"
                fill="${theme.liquidTop}" opacity="0.35" transform="translate(0 ${surfaceY - 6})">
            <animateTransform attributeName="transform" type="translate"
              values="0 ${surfaceY - 6}; -100 ${surfaceY - 6}" dur="4.6s" repeatCount="indefinite" />
          </path>
        </g>
        ${bubbles}
      ` : ''}
      <!-- glass highlight -->
      <rect x="${X}" y="${TOP}" width="${W}" height="${bodyH}" fill="url(#${uid}-shell)" />
    </g>

    ${marks}

    <!-- top rim -->
    <ellipse cx="${X + W / 2}" cy="${TOP}" rx="${W / 2}" ry="${RY}"
             fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" />
    <!-- bottom rim -->
    <path d="M ${X} ${BOT} a ${W / 2} ${RY} 0 0 0 ${W} 0" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" />

    <!-- percentage badge -->
    <g>
      <rect x="${X + W / 2 - 34}" y="${TOP + 42}" width="68" height="30" rx="15"
            fill="rgba(0,0,0,0.42)" stroke="${c.border}" stroke-width="1.5" />
      <text x="${X + W / 2}" y="${TOP + 62}" text-anchor="middle" font-size="15" font-weight="800" fill="${c.fg}">
        ${known ? fillPct.toFixed(0) + '%' : '—'}
      </text>
    </g>
  </svg>`;
}

function tankCard(bucket, rate, avail, lvl, stockDoc, canManage) {
  const theme = TANK_THEME[bucket];
  const c = LEVEL_COLORS[lvl.level];
  const pct = lvl.pct != null ? Math.min(100, lvl.pct) : null;
  const capKL = stockDoc?.capacityLiters ? toKL(stockDoc.capacityLiters) : null;

  return `
    <div style="flex:1;min-width:250px;background:linear-gradient(160deg,#16202e 0%,#243546 100%);border:1px solid ${c.border};border-radius:20px;padding:16px;color:white;box-shadow:0 10px 30px ${theme.glow}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div style="font-size:16px;font-weight:800;letter-spacing:-0.3px">${theme.emoji} ${theme.label}</div>
          <div style="font-size:11px;opacity:0.6">${theme.sub}</div>
        </div>
        <div style="text-align:right">
          <div style="display:inline-block;padding:4px 10px;border-radius:20px;background:${c.badgeBg};border:1px solid ${c.border};font-size:10px;font-weight:800;color:${c.fg}">${c.label}</div>
          <div style="font-size:11px;opacity:0.65;margin-top:5px">${rate != null ? formatCurrency(rate) + '/L' : 'Rate not set'}</div>
        </div>
      </div>

      <div style="margin-top:12px">${tankSVG(bucket, pct, lvl)}</div>

      <div style="margin-top:14px;text-align:center">
        <div style="font-size:9px;opacity:0.55;letter-spacing:1px;font-weight:700">AVAILABLE GROUND STOCK</div>
        <div style="font-size:26px;font-weight:800;margin-top:2px;color:${c.fg};letter-spacing:-0.8px">${avail != null ? formatKL(avail) : '—'}</div>
        <div style="font-size:10px;opacity:0.5;margin-top:2px">${avail != null ? formatLiters(avail) : 'No dip reading yet'}</div>
      </div>

      <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div style="background:rgba(255,255,255,0.06);border-radius:10px;padding:8px;text-align:center">
          <div style="font-size:9px;opacity:0.55;letter-spacing:0.5px">CAPACITY</div>
          <div style="font-size:13px;font-weight:700;margin-top:2px">${capKL != null ? formatKL(stockDoc.capacityLiters) : 'Not set'}</div>
        </div>
        <div style="background:rgba(255,255,255,0.06);border-radius:10px;padding:8px;text-align:center">
          <div style="font-size:9px;opacity:0.55;letter-spacing:0.5px">FILL LEVEL</div>
          <div style="font-size:13px;font-weight:700;margin-top:2px;color:${c.fg}">${pct != null ? pct.toFixed(1) + '%' : '—'}</div>
        </div>
      </div>

      ${stockDoc ? `
        <div style="margin-top:10px;font-size:9px;opacity:0.45;line-height:1.5;text-align:center">
          Dip baseline ${formatKL(stockDoc.baselineLiters)} on ${formatDateTime(stockDoc.baselineTime)}<br/>minus liters sold in shifts since then
        </div>` : ''}

      ${canManage ? `
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="sg-edit" data-bucket="${bucket}" style="flex:1;min-height:42px;border-radius:12px;background:rgba(255,255,255,0.14);color:white;border:1px solid rgba(255,255,255,0.22);font-weight:700;font-size:12px;cursor:pointer">${stockDoc ? '✏️ Update' : '➕ Add stock'}</button>
          ${stockDoc ? `<button class="sg-remove" data-bucket="${bucket}" style="min-height:42px;padding:0 14px;border-radius:12px;background:rgba(255,77,79,0.16);color:#ff7875;border:1px solid rgba(255,77,79,0.4);font-weight:700;font-size:12px;cursor:pointer">🗑️</button>` : ''}
        </div>` : ''}
    </div>`;
}

export async function siteGroundView({ root }) {
  const { currentStationId, user } = getState();
  const stations = await getStationsForCurrentUser();
  const stationId = currentStationId || stations[0]?.id;
  if (!stationId) {
    root.innerHTML = `<div class="container"><div class="neu-card empty"><p>No station selected</p></div></div>`;
    return;
  }
  const station = stations.find(s => s.id === stationId) || stations[0];
  const canManage = ['owner', 'admin', 'manager'].includes(user?.role);

  let activePrices = {}, tankStocks = {}, shifts = [];
  try { activePrices = await getActivePrices(stationId); } catch {}
  try { tankStocks = await getTankStocks(stationId); } catch {}
  try { shifts = await getShifts(stationId); } catch {}

  const findRate = (bucket) => {
    const entry = Object.entries(activePrices).find(([ft]) => {
      const f = ft.toLowerCase();
      return bucket === 'ms' ? (f.includes('petrol') && !f.includes('premium')) || f === 'ms' : matchBucket(ft, 'hsd');
    });
    return entry ? entry[1].price : null;
  };
  const findStockDoc = (bucket) => {
    const entry = Object.entries(tankStocks).find(([ft]) => matchBucket(ft, bucket));
    return entry ? entry[1] : null;
  };

  const msDoc = findStockDoc('ms');
  const hsdDoc = findStockDoc('hsd');
  const msAvail = availableStock(msDoc, shifts, 'ms');
  const hsdAvail = availableStock(hsdDoc, shifts, 'hsd');
  const msLvl = stockLevel(msAvail, msDoc?.capacityLiters);
  const hsdLvl = stockLevel(hsdAvail, hsdDoc?.capacityLiters);

  root.innerHTML = `
    <div class="container" style="max-width:720px;margin:0 auto;padding-bottom:110px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <div>
          <h1 class="page-title" style="font-size:22px">🛢️ SiteGround</h1>
          <p class="page-sub" style="margin-top:2px">${station.name} • Underground tank stock ${canManage ? '• Add / update / remove here' : '• View only'}</p>
        </div>
        <button class="neu-btn neu-btn--small" onclick="location.hash='#/dashboard'">← Home</button>
      </div>

      <div class="alert alert--info" style="margin-top:12px;font-size:11px;line-height:1.6">
        ${canManage
          ? 'This is the only page where ground stock is entered. Type the measured <b>dip reading in KL</b> (1 KL = 1000 L). Available stock then auto-balances down as fuel is sold in shifts. Tank capacity is optional — it drives the % fill level and colours.'
          : '🔒 Attendant view: ground stock is read-only. Owner or manager updates the dip reading.'}
      </div>

      <div style="display:flex;gap:14px;margin-top:16px;flex-wrap:wrap">
        ${tankCard('ms', findRate('ms'), msAvail, msLvl, msDoc, canManage)}
        ${tankCard('hsd', findRate('hsd'), hsdAvail, hsdLvl, hsdDoc, canManage)}
      </div>

      <div style="margin-top:16px;padding:12px;background:var(--bg);border-radius:12px;border:0.5px solid var(--border)">
        <div style="font-size:11px;font-weight:800;margin-bottom:8px">Level colour guide</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;font-size:11px;color:var(--text-secondary)">
          <span>🟢 Healthy — 50% or more of capacity</span>
          <span>🟡 Low — 25% to 50%</span>
          <span>🔴 Refill soon — under 25%</span>
        </div>
        <div style="font-size:10px;color:var(--text-secondary);margin-top:8px">If tank capacity is not set, absolute litre thresholds are used instead (≥3000 L healthy, ≥1000 L low).</div>
      </div>
    </div>
    <div id="sgModalRoot"></div>
  `;

  if (!canManage) return;

  const modalRoot = root.querySelector('#sgModalRoot');
  const closeModal = () => { modalRoot.innerHTML = ''; };

  const openEditor = (bucket) => {
    const theme = TANK_THEME[bucket];
    const doc = bucket === 'ms' ? msDoc : hsdDoc;
    const dipKL = doc ? toKL(doc.baselineLiters).toFixed(2) : '';
    const capKL = doc?.capacityLiters ? toKL(doc.capacityLiters).toFixed(2) : '';
    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="sgBackdrop">
        <div class="modal" style="max-width:420px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h3 style="font-weight:800">${theme.emoji} ${theme.label} • ${theme.sub} stock</h3>
            <button id="sgClose" class="neu-btn" style="min-height:36px;min-width:36px;border-radius:50%">✕</button>
          </div>
          <p style="font-size:11px;color:var(--text-secondary);margin-top:6px">All values in <b>KL</b> (1 KL = 1000 litres). Saving sets a fresh dip baseline from right now.</p>

          <label style="font-size:11px;color:var(--text-secondary);display:block;margin-top:14px">Dip reading — ground stock (KL) *</label>
          <input id="sgDip" type="number" inputmode="decimal" min="0" step="0.01" value="${dipKL}" placeholder="e.g. 8.50"
                 style="width:100%;min-height:48px;border-radius:12px;border:1.5px solid var(--border);padding:0 12px;font-size:16px;font-weight:700;margin-top:4px" />

          <label style="font-size:11px;color:var(--text-secondary);display:block;margin-top:12px">Tank capacity (KL) — optional</label>
          <input id="sgCap" type="number" inputmode="decimal" min="0" step="0.01" value="${capKL}" placeholder="e.g. 20.00"
                 style="width:100%;min-height:48px;border-radius:12px;border:1.5px solid var(--border);padding:0 12px;font-size:16px;font-weight:700;margin-top:4px" />
          <p style="font-size:10px;color:var(--text-secondary);margin-top:6px">Capacity powers the % fill level and the green / amber / red colours.</p>

          <div id="sgErr" style="display:none;margin-top:10px;font-size:12px;color:#cf1322;font-weight:600"></div>
          <button id="sgSave" style="margin-top:14px;width:100%;min-height:50px;border-radius:12px;background:#1a2535;color:white;border:none;font-weight:700;font-size:14px">Save ground stock</button>
        </div>
      </div>`;

    modalRoot.querySelector('#sgBackdrop').addEventListener('click', e => { if (e.target.id === 'sgBackdrop') closeModal(); });
    modalRoot.querySelector('#sgClose').addEventListener('click', closeModal);
    modalRoot.querySelector('#sgSave').addEventListener('click', async () => {
      const errEl = modalRoot.querySelector('#sgErr');
      const showErr = (m) => { errEl.style.display = 'block'; errEl.textContent = m; };
      const dipVal = modalRoot.querySelector('#sgDip').value;
      const capVal = modalRoot.querySelector('#sgCap').value;
      if (dipVal === '') { showErr('Enter the dip reading in KL'); return; }
      if (Number(dipVal) < 0) { showErr('Stock cannot be negative'); return; }
      if (capVal !== '' && Number(capVal) < 0) { showErr('Capacity cannot be negative'); return; }
      if (capVal !== '' && Number(capVal) > 0 && Number(dipVal) > Number(capVal)) { showErr('Dip reading cannot exceed tank capacity'); return; }

      const btn = modalRoot.querySelector('#sgSave');
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const fuelKey = doc?.fuelType || (bucket === 'ms' ? 'Petrol' : 'Diesel');
        await setTankStock(stationId, fuelKey, toLiters(dipVal), capVal === '' ? '' : toLiters(capVal));
        closeModal();
        siteGroundView({ root });
      } catch (e) {
        showErr(e.message || 'Failed to save');
        btn.disabled = false; btn.textContent = 'Save ground stock';
      }
    });
  };

  root.querySelectorAll('.sg-edit').forEach(b => b.addEventListener('click', () => openEditor(b.dataset.bucket)));

  root.querySelectorAll('.sg-remove').forEach(b => b.addEventListener('click', async () => {
    const bucket = b.dataset.bucket;
    const doc = bucket === 'ms' ? msDoc : hsdDoc;
    if (!doc) return;
    if (!confirm(`Remove the ${TANK_THEME[bucket].label} ground stock entry? The tank will show no reading until a new dip is entered.`)) return;
    b.disabled = true; b.textContent = '…';
    try {
      await removeTankStock(stationId, doc.fuelType);
      siteGroundView({ root });
    } catch (e) {
      alert(e.message || 'Failed to remove');
      b.disabled = false; b.textContent = '🗑️';
    }
  }));
}
