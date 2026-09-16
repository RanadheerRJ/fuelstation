import { getState } from '../state.js';
import { getStationsForCurrentUser } from '../services/stations.js';
import { getPrices, getActivePrices, setPrice } from '../services/prices.js';
import { formatCurrency, formatDateTime } from '../services/calc.js';

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
  const canManage = ['owner','admin','manager'].includes(user.role);

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

  root.innerHTML = `
    <div class="container">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div>
          <h1 class="page-title">Fuel Prices</h1>
          <p class="page-sub">${station.name} • Live prices • ${isOwner ? 'Owner • Full visibility' : 'Manager • Can edit'}</p>
        </div>
        ${canManage ? `<button class="neu-btn neu-btn--small" onclick="location.hash='#/siteground'">🛢️ Update Stock</button>` : ''}
      </div>
      <div class="grid" style="margin-top:16px;gap:12px">
        ${['Petrol','Diesel','Premium Petrol','CNG'].map(ft=>{
          const p = activePrices[ft];
          return `
            <div class="neu-card" style="padding:16px;border-radius:14px">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <div><div style="font-weight:700;font-size:14px">${ft}</div><div style="font-size:22px;font-weight:800;margin-top:6px">${p?formatCurrency(p.price)+' /L': 'Not set'}</div><div style="font-size:11px;color:var(--text-secondary);margin-top:4px">${p? 'From '+formatDateTime(p.effectiveFrom):''}</div></div>
                ${canManage ? `<button class="neu-btn edit-price" data-fuel="${ft}" style="min-height:40px;padding:0 14px;border-radius:10px;font-weight:600">Edit</button>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
      ${isOwner || canManage ? `
        <div class="neu-card" style="margin-top:18px;padding:16px;border-radius:14px">
          <h3 style="font-weight:700;font-size:14px">Price History • Owner/Manager Only</h3>
          <div class="table-wrap" style="margin-top:12px">
            <table>
              <thead><tr><th>Fuel</th><th>Price</th><th>From</th><th>To</th></tr></thead>
              <tbody>${history.slice(0,20).map(h=>`<tr><td>${h.fuelType}</td><td>${formatCurrency(h.price)}</td><td>${formatDateTime(h.effectiveFrom)}</td><td>${h.effectiveTo? formatDateTime(h.effectiveTo):'<span class="badge badge--success">Active</span>'}</td></tr>`).join('') || `<tr><td colspan="4">No history</td></tr>`}</tbody>
            </table>
          </div>
          <p style="font-size:11px;color:var(--text-secondary);margin-top:10px">Historical prices never overwritten. New price closes previous.</p>
        </div>
      ` : ''}
    </div>
    <div id="modalRoot"></div>
  `;

  const modalRoot = document.getElementById('modalRoot');
  root.querySelectorAll('.edit-price').forEach(btn=>{
    btn.addEventListener('click', ()=> openPriceModal(btn.dataset.fuel));
  });

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
      try { await setPrice(stationId, fuelType, Number(val)); modalRoot.innerHTML=''; pricesView({ root }); } catch(e){ alert(e.message); }
    });
  }
}
