import { getState } from '../state.js';
import { getStationsForCurrentUser } from '../services/stations.js';
import { getPrices, getActivePrices, setPrice } from '../services/prices.js';
import { getShifts } from '../services/shifts.js';
import { addDelivery, getDeliveries, getStockSummary, FUEL_LABEL } from '../services/stock.js';
import { formatCurrency, formatDateTime, formatLiters } from '../services/calc.js';

export async function pricesView({ root }) {
  const { currentStationId, user } = getState();
  const stations = await getStationsForCurrentUser();
  const stationId = currentStationId || stations[0]?.id;
  if (!stationId) { root.innerHTML=`<div class="container"><div class="neu-card empty"><p>No station</p></div></div>`; return; }
  const station = stations.find(s=>s.id===stationId);
  const activePrices = await getActivePrices(stationId);
  const history = await getPrices(stationId);

  const isOwner = user.role === 'owner';
  const isAttendant = user.role === 'attendant';
  const canManage = ['super_admin','owner','admin','manager'].includes(user.role);

  if (isAttendant) {
    root.innerHTML = `
      <div class="container" style="max-width:480px;margin:0 auto">
        <h1 class="page-title" style="font-size:20px">Fuel Prices</h1>
        <p class="page-sub" style="margin-top:4px">${station.name} • Current prices only • No history</p>
        <div class="grid" style="margin-top:16px;gap:12px">
          ${['Petrol','Diesel','Premium Petrol','CNG'].map(ft=>{
            const p = activePrices[ft];
            return `<div class="neu-card" style="padding:16px;border-radius:14px;text-align:center"><div style="font-weight:700;font-size:13px">${ft}</div><div style="font-size:22px;font-weight:800;margin-top:8px">${p?formatCurrency(p.price)+' /L': 'Not set'}</div><div style="font-size:11px;color:var(--text-secondary);margin-top:4px">${p? 'Active now' : ''}</div></div>`;
          }).join('')}
        </div>
        <div style="margin-top:14px;padding:12px;background:var(--bg);border-radius:10px;border:0.5px solid var(--border)"><div style="font-size:11px;color:var(--text-secondary);text-align:center">🔒 Attendant view: Only current active prices. No price history, no edit. Owner/Manager manages prices.</div></div>
      </div>
    `;
    return;
  }

  // ---- Stock side ----------------------------------------------------------
  // Reuse one shifts read for both the summary and the recent-intake list.
  let allShifts = [];
  try { allShifts = await getShifts(stationId); } catch {}
  let stockSummary = {}, deliveries = [];
  try { stockSummary = await getStockSummary(stationId, allShifts); } catch {}
  try { deliveries = await getDeliveries(stationId, { limit: 8 }); } catch {}

  const stockKeys = Array.from(new Set(['MS','HSD', ...Object.keys(stockSummary)]));
  const stockRows = stockKeys.map(f => ({
    fuel: f,
    label: FUEL_LABEL[f] || f,
    received: stockSummary[f]?.received ?? null,
    sold: stockSummary[f]?.sold ?? null,
    available: stockSummary[f]?.available ?? null,
  }));
  const litres = v => v == null ? '—' : formatLiters(v).replace(' L','');

  root.innerHTML = `
    <div class="container" style="max-width:520px;margin:0 auto;padding-bottom:110px">
      <h1 class="page-title">Fuel Prices & Stock</h1>
      <p class="page-sub">${station.name} • ${isOwner ? 'Owner • Full visibility' : 'Manager • Can edit'}</p>

      <!-- 1. PRICES -->
      <div class="neu-card" style="margin-top:16px;padding:16px;border-radius:16px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h3 style="font-weight:800;font-size:14px">💰 Today's Prices</h3>
          <span style="font-size:11px;color:var(--text-secondary)">Tap Edit to change</span>
        </div>
        <div class="grid" style="margin-top:12px;gap:10px">
          ${['Petrol','Diesel','Premium Petrol','CNG'].map(ft=>{
            const p = activePrices[ft];
            return `
              <div style="border:1px solid var(--border);border-radius:12px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center">
                <div>
                  <div style="font-weight:700;font-size:13px">${ft}</div>
                  <div style="font-size:20px;font-weight:800;margin-top:4px">${p?formatCurrency(p.price)+' /L': '<span style="font-size:14px;color:var(--text-secondary)">Not set</span>'}</div>
                  <div style="font-size:10px;color:var(--text-secondary);margin-top:2px">${p? 'From '+formatDateTime(p.effectiveFrom):''}</div>
                </div>
                ${canManage ? `<button class="neu-btn edit-price" data-fuel="${ft}" style="min-height:38px;padding:0 14px;border-radius:10px;font-weight:600">Edit</button>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- 2. TANKER INTAKE / STOCK -->
      <div class="neu-card" style="margin-top:14px;padding:16px;border-radius:16px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h3 style="font-weight:800;font-size:14px">🚛 Tanker Intake</h3>
          ${canManage ? `<button id="addDelivery" class="neu-btn neu-btn--primary" style="min-height:38px;padding:0 14px;border-radius:10px;font-weight:700;font-size:12px">+ Tanker</button>` : ''}
        </div>
        <p style="font-size:11px;color:var(--text-secondary);margin-top:6px">Record every tanker you receive. Stock = litres received − litres sold from closed shifts.</p>

        <div style="margin-top:12px;border:1px solid var(--border);border-radius:12px;overflow:hidden">
          ${stockRows.map((r,i)=>`
            <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;${i>0?'border-top:1px solid var(--border)':''}">
              <div style="min-width:60px">
                <div style="font-weight:800;font-size:13px">${r.fuel}</div>
                <div style="font-size:10px;color:var(--text-secondary)">${r.label}</div>
              </div>
              <div style="text-align:right"><div style="font-size:9px;color:var(--text-secondary);letter-spacing:0.5px">RECEIVED</div><div style="font-weight:700;font-size:13px">${litres(r.received)}</div></div>
              <div style="text-align:right"><div style="font-size:9px;color:var(--text-secondary);letter-spacing:0.5px">SOLD</div><div style="font-weight:700;font-size:13px">${litres(r.sold)}</div></div>
              <div style="text-align:right;min-width:66px"><div style="font-size:9px;color:var(--text-secondary);letter-spacing:0.5px">IN TANK</div><div style="font-weight:800;font-size:15px;${r.available!=null&&r.available<=1000?'color:#cf1322':''}">${litres(r.available)}<span style="font-size:10px;font-weight:600;color:var(--text-secondary)"> L</span></div></div>
            </div>`).join('')}
        </div>

        <div style="margin-top:14px">
          <div style="font-size:11px;font-weight:700;color:var(--text-secondary);letter-spacing:0.5px">RECENT INTAKE</div>
          ${deliveries.length ? `
            <div style="margin-top:8px;display:flex;flex-direction:column;gap:8px">
              ${deliveries.map(d=>`
                <div style="border:1px solid var(--border);border-radius:10px;padding:10px 12px">
                  <div style="display:flex;justify-content:space-between;align-items:center">
                    <span style="font-weight:700;font-size:13px">${d.fuelType} • ${litres(d.liters)} L</span>
                    <span style="font-size:10px;color:var(--text-secondary)">${formatDateTime(d.receivedAt)}</span>
                  </div>
                  ${d.note ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:4px">${d.note}</div>` : ''}
                  ${d.recordedByName ? `<div style="font-size:10px;color:var(--text-secondary);margin-top:2px">by ${d.recordedByName}</div>` : ''}
                </div>`).join('')}
            </div>
          ` : `<p style="font-size:12px;color:var(--text-secondary);margin-top:8px">No tanker recorded yet. Add your current tank level as the first entry so stock lines up.</p>`}
        </div>
      </div>

      <!-- 3. PRICE HISTORY -->
      ${canManage ? `
        <div class="neu-card" style="margin-top:14px;padding:16px;border-radius:16px">
          <h3 style="font-weight:800;font-size:14px">Price History</h3>
          <div class="table-wrap" style="margin-top:12px">
            <table>
              <thead><tr><th>Fuel</th><th>Price</th><th>From</th><th>To</th></tr></thead>
              <tbody>${history.slice(0,20).map(h=>`<tr><td>${h.fuelType}</td><td>${formatCurrency(h.price)}</td><td>${formatDateTime(h.effectiveFrom)}</td><td>${h.effectiveTo? formatDateTime(h.effectiveTo):'<span class="badge badge--success">Active</span>'}</td></tr>`).join('') || `<tr><td colspan="4">No history</td></tr>`}</tbody>
            </table>
          </div>
          <p style="font-size:11px;color:var(--text-secondary);margin-top:10px">Historical prices are never overwritten. A new price closes the previous one.</p>
        </div>
      ` : ''}
    </div>
    <div id="modalRoot"></div>
  `;

  const modalRoot = document.getElementById('modalRoot');
  root.querySelectorAll('.edit-price').forEach(btn=>{
    btn.addEventListener('click', ()=> openPriceModal(btn.dataset.fuel));
  });
  root.querySelector('#addDelivery')?.addEventListener('click', openDeliveryModal);

  function openPriceModal(fuelType) {
    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="backdrop"><div class="modal" style="border-radius:16px;max-width:400px">
        <div style="display:flex;justify-content:space-between;align-items:center"><h3 style="font-weight:700">Update ${fuelType} Price</h3><button id="closeM" class="neu-btn" style="min-height:36px;min-width:36px;border-radius:50%">✕</button></div>
        <div class="grid" style="margin-top:16px;gap:14px">
          <div><label class="label">New Price (₹ / L)</label><input id="priceInput" class="neu-input" type="number" step="0.01" placeholder="e.g. 105.50" style="min-height:48px;border-radius:12px;font-size:16px;font-weight:600"></div>
          <button id="savePrice" class="neu-btn neu-btn--primary neu-btn--block" style="min-height:48px;border-radius:12px;font-weight:700">Update Price</button>
          <p style="font-size:11px;color:var(--text-secondary)">This will close previous active price and start new history entry.</p>
        </div>
      </div></div>`;
    modalRoot.querySelector('#backdrop').addEventListener('click', e=>{ if(e.target.id==='backdrop') modalRoot.innerHTML=''; });
    modalRoot.querySelector('#closeM').addEventListener('click', ()=> modalRoot.innerHTML='');
    modalRoot.querySelector('#savePrice').addEventListener('click', async ()=>{
      const val = modalRoot.querySelector('#priceInput').value;
      if (!val || isNaN(val) || Number(val)<=0) return alert('Invalid price');
      // Pass the raw value: setPrice validates it and reports the actual bad input.
      try { await setPrice(stationId, fuelType, val); modalRoot.innerHTML=''; pricesView({ root }); } catch(e){ alert(e.message); }
    });
  }

  function openDeliveryModal() {
    const fuelOpts = stockRows.map(r=>`<option value="${r.fuel}">${r.fuel} • ${r.label}</option>`).join('');
    modalRoot.innerHTML = `
      <div id="dlBackdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.45);display:grid;place-items:center;z-index:100;padding:16px">
        <div style="background:white;border-radius:18px;padding:20px;width:100%;max-width:400px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h3 style="font-weight:800;font-size:16px">🚛 Tanker Intake</h3>
            <button id="dlClose" style="min-height:36px;min-width:36px;border-radius:50%;border:1px solid var(--border);background:white">✕</button>
          </div>
          <div id="dlAlert"></div>
          <div style="margin-top:14px;display:flex;flex-direction:column;gap:12px">
            <div>
              <label class="label">Fuel</label>
              <select id="dlFuel" class="neu-select" style="min-height:46px;border-radius:10px;width:100%">${fuelOpts}</select>
            </div>
            <div>
              <label class="label">Litres received</label>
              <input id="dlLiters" class="neu-input" type="text" inputmode="decimal" placeholder="e.g. 12000" style="min-height:46px;border-radius:10px;width:100%">
            </div>
            <div>
              <label class="label">Note (tanker number, supplier, invoice)</label>
              <input id="dlNote" class="neu-input" type="text" placeholder="e.g. IOC tanker TS09 AB 1234" style="min-height:46px;border-radius:10px;width:100%">
            </div>
            <button id="dlSave" class="neu-btn neu-btn--primary" style="min-height:50px;border-radius:12px;font-weight:700">Save Intake</button>
            <p style="font-size:11px;color:var(--text-secondary)">Entries cannot be edited or deleted. Fix a mistake by adding a correcting entry.</p>
          </div>
        </div>
      </div>`;
    const close = ()=> modalRoot.innerHTML='';
    modalRoot.querySelector('#dlClose').addEventListener('click', close);
    modalRoot.querySelector('#dlBackdrop').addEventListener('click', e=>{ if(e.target.id==='dlBackdrop') close(); });
    modalRoot.querySelector('#dlSave').addEventListener('click', async ()=>{
      const btn = modalRoot.querySelector('#dlSave');
      const alertBox = modalRoot.querySelector('#dlAlert');
      alertBox.innerHTML='';
      btn.disabled = true; btn.textContent = 'Saving...';
      try {
        await addDelivery({
          stationId,
          fuelType: modalRoot.querySelector('#dlFuel').value,
          liters: modalRoot.querySelector('#dlLiters').value,
          note: modalRoot.querySelector('#dlNote').value,
        });
        close();
        pricesView({ root });
      } catch(e) {
        alertBox.innerHTML = `<div style="margin-top:12px;padding:10px;background:#fff1f0;border:1px solid #ffccc7;border-radius:10px;color:#cf1322;font-size:12px">${e.message}</div>`;
        btn.disabled = false; btn.textContent = 'Save Intake';
      }
    });
  }
}
