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

  const canManage = ['owner','admin','manager'].includes(user.role);

  root.innerHTML = `
    <div class="container">
      <h1 class="page-title">Fuel Prices</h1>
      <p class="page-sub">${station.name} • Live prices</p>

      <div class="grid" style="margin-top:18px">
        ${['Petrol','Diesel','Premium Petrol','CNG'].map(ft=>{
          const p = activePrices[ft];
          return `
            <div class="neu-card">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <div><div style="font-weight:800" class="fuel-${ft.toLowerCase().replace(' ','-')}">${ft}</div><div style="font-size:22px;font-weight:900;margin-top:6px">${p?formatCurrency(p.price)+' / L': 'Not set'}</div><div style="font-size:11px;color:var(--text-muted);margin-top:4px">${p? 'From '+formatDateTime(p.effectiveFrom):''}</div></div>
                ${canManage ? `<button class="neu-btn neu-btn--small edit-price" data-fuel="${ft}">Edit</button>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <div class="neu-card" style="margin-top:18px">
        <h3 style="font-weight:800;font-size:14px">Price History</h3>
        <div class="table-wrap" style="margin-top:12px">
          <table>
            <thead><tr><th>Fuel</th><th>Price</th><th>From</th><th>To</th></tr></thead>
            <tbody>
              ${history.slice(0,20).map(h=>`<tr><td>${h.fuelType}</td><td>${formatCurrency(h.price)}</td><td>${formatDateTime(h.effectiveFrom)}</td><td>${h.effectiveTo? formatDateTime(h.effectiveTo):'<span class="badge badge--success">Active</span>'}</td></tr>`).join('') || `<tr><td colspan="4">No history</td></tr>`}
            </tbody>
          </table>
        </div>
        <p style="font-size:11px;color:var(--text-muted);margin-top:8px">Historical prices are never overwritten. New price closes previous active price with effectiveTo.</p>
      </div>
    </div>
    <div id="modalRoot"></div>
  `;

  const modalRoot = document.getElementById('modalRoot');
  root.querySelectorAll('.edit-price').forEach(btn=>{
    btn.addEventListener('click', ()=> openPriceModal(btn.dataset.fuel));
  });

  function openPriceModal(fuelType) {
    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="backdrop"><div class="modal">
        <div style="display:flex;justify-content:space-between"><h3 style="font-weight:800">Update ${fuelType} Price</h3><button id="closeM" class="neu-btn neu-btn--small">✕</button></div>
        <div class="grid" style="margin-top:14px">
          <div><label class="label">New Price (₹ / L)</label><input id="priceInput" class="neu-input" type="number" step="0.01" placeholder="e.g. 105.50"></div>
          <button id="savePrice" class="neu-btn neu-btn--primary neu-btn--block">Update Price</button>
          <p style="font-size:11px;color:var(--text-muted)">This will close previous active price and start new history entry.</p>
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
