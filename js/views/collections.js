import { getState } from '../state.js';
import { getStationsForCurrentUser } from '../services/stations.js';
import { getStaffBalances, collectFromShift, collectBulk, settleAllPending, getHideBalancePref, setHideBalancePref } from '../services/collections.js';
import { formatCurrency } from '../services/calc.js';

export async function collectionsView({ root }) {
  const { user, currentStationId } = getState();
  const stations = await getStationsForCurrentUser();
  const stationId = currentStationId || stations[0]?.id;
  if (!stationId) { root.innerHTML = `<div class="container"><div class="neu-card empty"><p>No station</p></div></div>`; return; }

  const isOwner = user.role === 'owner';
  const isManagerOrAbove = ['owner','admin','manager'].includes(user.role);
  if (!isManagerOrAbove) {
    root.innerHTML = `<div class="container"><div class="neu-card" style="padding:20px;text-align:center"><h3>🔒 Access Denied</h3><p style="font-size:13px;color:var(--text-secondary);margin-top:8px">Only Owner/Manager can view collections</p><button class="neu-btn neu-btn--primary" style="margin-top:12px;min-height:44px;border-radius:12px" onclick="location.hash='#/dashboard'">Back</button></div></div>`;
    return;
  }

  const station = stations.find(s=>s.id===stationId);
  const data = await getStaffBalances(stationId);
  const { staffList, settlements, totals } = data;
  const hideBalance = getHideBalancePref(stationId);
  const pendingList = staffList.filter(s=> s.pendingCollect>0.5 || s.pendingReturn>0.5).sort((a,b)=>b.pendingCollect - a.pendingCollect);
  const settledList = staffList.filter(s=> s.pendingCollect<=0.5 && s.pendingReturn<=0.5 && (s.collected>0 || s.returned>0));

  function fmt(v) { return hideBalance ? '••••' : formatCurrency(v); }

  root.innerHTML = `
    <div class="container" style="max-width:520px;margin:0 auto;padding-bottom:100px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <div>
          <h1 class="page-title" style="font-size:22px">💰 Collections</h1>
          <p class="page-sub" style="margin-top:4px">${station?.name} • Settlement & Handover</p>
        </div>
        <div style="display:flex;gap:8px">
          <button id="hideToggle" class="neu-btn" style="min-height:40px;min-width:40px;border-radius:10px" title="${hideBalance?'Show Balance':'Hide Balance'}">${hideBalance?'👁️‍🗨️':'👁️'}</button>
          <button class="neu-btn" style="min-height:40px;min-width:40px;border-radius:10px" onclick="location.hash='#/dashboard'">🏠</button>
        </div>
      </div>

      <!-- Summary cards - think big -->
      <div class="neu-card" style="margin-top:16px;padding:16px;border-radius:16px;background:linear-gradient(135deg,#232f3e 0%,#1a252f 100%);color:white">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:11px;opacity:0.7;letter-spacing:0.5px;text-transform:uppercase">To Collect from Staff</div>
            <div style="font-weight:800;font-size:28px;margin-top:4px">${fmt(totals.totalPendingCollect)}</div>
            <div style="font-size:11px;opacity:0.6;margin-top:4px">${pendingList.length} staff • ${data.allShifts.filter(s=>{ const v=s.totals?.variance||0; const c=s.settlement?.collectedAmount||0; return v<-0.5 && (Math.abs(v)-c)>0.5; }).length} shifts pending</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:11px;opacity:0.7">To Return to Staff</div>
            <div style="font-weight:700;font-size:18px;margin-top:4px;color:${totals.totalPendingReturn>0?'#ffd666':'#52c41a'}">${fmt(totals.totalPendingReturn)}</div>
            <div style="font-size:10px;opacity:0.5;margin-top:4px">Excess</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:16px">
          <div style="background:rgba(255,255,255,0.08);border-radius:10px;padding:10px;text-align:center"><div style="font-size:10px;opacity:0.6">Collected Today</div><div style="font-weight:700;font-size:14px;margin-top:2px">${fmt(settlements.filter(s=> new Date(s.createdAt).toISOString().slice(0,10)===new Date().toISOString().slice(0,10) && s.type==='collect').reduce((a,s)=>a+Number(s.amount||0),0))}</div></div>
          <div style="background:rgba(255,255,255,0.08);border-radius:10px;padding:10px;text-align:center"><div style="font-size:10px;opacity:0.6">Ever Collected</div><div style="font-weight:700;font-size:14px;margin-top:2px">${fmt(totals.totalCollected)}</div></div>
          <div style="background:rgba(255,255,255,0.08);border-radius:10px;padding:10px;text-align:center"><div style="font-size:10px;opacity:0.6">Staff</div><div style="font-weight:700;font-size:14px;margin-top:2px">${totals.staffCount}</div></div>
        </div>
      </div>

      <!-- Owner controls - think big -->
      <div class="neu-card" style="margin-top:16px;padding:14px;border-radius:14px">
        <h3 style="font-weight:700;font-size:14px">🎛️ Owner Controls</h3>
        <p style="font-size:11px;color:var(--text-secondary);margin-top:4px">Control your dashboard balance — hide, reset, or manage</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">
          <button id="hideBalanceBtn" class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600;font-size:13px">${hideBalance?'👁️ Show Balance':'🙈 Hide Balance'}</button>
          <button id="exportBtn" class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600;font-size:13px">⬇️ Export CSV</button>
          <button id="settleAllBtn" class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:700;font-size:13px;background:#fffbe6;border:1px solid #ffe58f;color:#ad6800;grid-column:span 2">🧹 Reset Dashboard • Settle All Pending (₹${hideBalance?'••••':formatCurrency(totals.totalPendingCollect)})</button>
        </div>
        <div style="margin-top:10px;padding:10px;background:#f6ffed;border-radius:10px;border:1px solid #b7eb8f">
          <div style="font-size:11px;font-weight:700;color:#389e0d">💡 How it works</div>
          <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;line-height:1.4">To Collect keeps increasing because approved shifts are not marked as collected. Tap Collect on staff or shift to mark money received. After collecting, balance goes to 0 but history stays in Reports. Hide Balance hides amount from screen if someone looks over your shoulder.</div>
        </div>
      </div>

      <!-- Tabs -->
      <div style="margin-top:18px;display:flex;gap:8px;overflow:auto;padding-bottom:4px">
        <button class="tab-btn active" data-tab="pending" style="min-height:36px;padding:0 16px;border-radius:20px;font-size:13px;font-weight:700;white-space:nowrap;background:#232f3e;color:white;border:none">Pending • ${pendingList.length}</button>
        <button class="tab-btn" data-tab="staff" style="min-height:36px;padding:0 16px;border-radius:20px;font-size:13px;font-weight:600;white-space:nowrap;background:var(--bg);border:0.5px solid var(--border)">All Staff • ${staffList.length}</button>
        <button class="tab-btn" data-tab="history" style="min-height:36px;padding:0 16px;border-radius:20px;font-size:13px;font-weight:600;white-space:nowrap;background:var(--bg);border:0.5px solid var(--border)">History • ${settlements.length}</button>
      </div>

      <!-- Pending Tab -->
      <div id="tab-pending" class="tab-content" style="margin-top:14px">
        ${pendingList.length===0 ? `
          <div class="neu-card" style="padding:24px;text-align:center;border-radius:14px">
            <div style="font-size:32px">✅</div>
            <h3 style="margin-top:8px;font-weight:700">All Settled!</h3>
            <p style="font-size:12px;color:var(--text-secondary);margin-top:6px">No pending collections. Your dashboard To Collect is 0.</p>
          </div>
        ` : pendingList.map(staff=>`
          <div class="neu-card" style="padding:0;overflow:hidden;border-radius:14px;margin-bottom:12px;border:1px solid ${staff.pendingCollect>0?'#ffa39e':'#b7eb8f'}">
            <div style="padding:14px;background:${staff.pendingCollect>0?'#fff1f0':'#f6ffed'};display:flex;justify-content:space-between;align-items:center">
              <div style="display:flex;align-items:center;gap:10px">
                <div style="width:40px;height:40px;border-radius:50%;background:#232f3e;color:white;display:grid;place-items:center;font-weight:800;font-size:14px">${staff.staffName.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}</div>
                <div>
                  <div style="font-weight:700;font-size:14px">${staff.staffName}</div>
                  <div style="font-size:11px;color:var(--text-secondary)">${staff.shifts.filter(s=>s.pendingCollect>0.5||s.pendingReturn>0.5).length} pending shifts • Total ever ${fmt(staff.totalToCollect)}</div>
                </div>
              </div>
              <div style="text-align:right">
                <div style="font-weight:800;font-size:16px;color:${staff.pendingCollect>0?'#cf1322':'#389e0d'}">${fmt(staff.pendingCollect>0?staff.pendingCollect:staff.pendingReturn)} ${staff.pendingCollect>0?'to collect':'to return'}</div>
                <div style="font-size:10px;color:var(--text-tertiary)">Pending</div>
              </div>
            </div>
            <div style="padding:12px;display:flex;flex-direction:column;gap:8px;max-height:300px;overflow:auto">
              ${staff.shifts.filter(s=>s.pendingCollect>0.5||s.pendingReturn>0.5).slice(0,10).map(sh=>`
                <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:var(--bg);border-radius:10px">
                  <div>
                    <div style="font-weight:600;font-size:12px">${new Date(sh.startTime).toLocaleDateString()} • ${new Date(sh.startTime).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>
                    <div style="font-size:11px;color:var(--text-secondary)">${sh.pendingCollect>0.5 ? `To Collect ${fmt(sh.pendingCollect)}` : `To Return ${fmt(sh.pendingReturn)}`} • ${sh.totals?.totalRevenue ? formatCurrency(sh.totals.totalRevenue)+' sales' : ''}</div>
                  </div>
                  <button class="neu-btn collect-shift-btn" data-shift="${sh.id}" data-staff="${staff.staffUserId}" data-name="${staff.staffName}" data-amount="${sh.pendingCollect>0?sh.pendingCollect:sh.pendingReturn}" data-type="${sh.pendingCollect>0?'collect':'return'}" style="min-height:36px;padding:0 14px;border-radius:10px;font-size:12px;font-weight:700;background:${sh.pendingCollect>0?'#52c41a':'#faad14'};color:white;border:none">${sh.pendingCollect>0?'Collect':'Return'}</button>
                </div>
              `).join('')}
            </div>
            <div style="padding:12px;display:grid;grid-template-columns:1fr 1fr;gap:10px;border-top:0.5px solid var(--border)">
              <button class="neu-btn collect-staff-btn" data-staff="${staff.staffUserId}" data-name="${staff.staffName}" data-amount="${staff.pendingCollect}" data-type="collect" style="min-height:44px;border-radius:10px;font-weight:700;background:#52c41a;color:white;border:none" ${staff.pendingCollect<=0.5?'disabled style="opacity:0.4;min-height:44px;border-radius:10px"':''}>💰 Collect All ${fmt(staff.pendingCollect)}</button>
              <button class="neu-btn" onclick="location.hash='#/shifts?staff=${staff.staffUserId}'" style="min-height:44px;border-radius:10px;font-weight:600">View Shifts</button>
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Staff Tab -->
      <div id="tab-staff" class="tab-content" style="display:none;margin-top:14px">
        ${staffList.map(staff=>`
          <div class="neu-card" style="padding:14px;border-radius:14px;margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div style="display:flex;align-items:center;gap:10px">
                <div style="width:36px;height:36px;border-radius:50%;background:var(--bg);display:grid;place-items:center;font-weight:700">${staff.staffName[0]}</div>
                <div><div style="font-weight:700;font-size:13px">${staff.staffName}</div><div style="font-size:11px;color:var(--text-secondary)">${staff.shifts.length} shifts • Ever ${fmt(staff.totalToCollect)}</div></div>
              </div>
              <div style="text-align:right"><div style="font-weight:700;font-size:13px;color:${staff.pendingCollect>0?'#cf1322':'#389e0d'}">${staff.pendingCollect>0? fmt(staff.pendingCollect)+' pending' : '✅ Settled'}</div><div style="font-size:10px;color:var(--text-tertiary)">Collected ${fmt(staff.collected)}</div></div>
            </div>
          </div>
        `).join('') || `<p style="font-size:12px;color:var(--text-secondary)">No staff</p>`}
      </div>

      <!-- History Tab -->
      <div id="tab-history" class="tab-content" style="display:none;margin-top:14px">
        <div class="neu-card" style="padding:14px;border-radius:14px">
          <h3 style="font-weight:700;font-size:14px">Collection History • ${settlements.length}</h3>
          <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px;max-height:500px;overflow:auto">
            ${settlements.slice(0,50).map(s=>`
              <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:var(--bg);border-radius:10px">
                <div>
                  <div style="font-weight:600;font-size:12px">${s.staffName} • ${s.type==='collect'?'Collected':'Returned'} ${formatCurrency(s.amount)}</div>
                  <div style="font-size:11px;color:var(--text-secondary)">${new Date(s.createdAt).toLocaleString()} • By ${s.createdByName}</div>
                  ${s.notes ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">Note: ${s.notes}</div>` : ''}
                </div>
                <span style="font-size:10px;padding:4px 8px;border-radius:12px;background:${s.type==='collect'?'#f6ffed':'#fffbe6'};border:1px solid ${s.type==='collect'?'#b7eb8f':'#ffe58f'}">${s.type}</span>
              </div>
            `).join('') || `<p style="font-size:12px;color:var(--text-secondary)">No collections yet</p>`}
          </div>
        </div>
      </div>

    </div>

    <!-- Collect Modal -->
    <div id="collectModal" class="modal-backdrop" style="display:none">
      <div class="modal" style="border-radius:16px;max-width:400px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h3 style="font-weight:800" id="collectModalTitle">Collect</h3>
          <button class="neu-btn" style="min-height:36px;min-width:36px;border-radius:50%" onclick="document.getElementById('collectModal').style.display='none'">✕</button>
        </div>
        <div style="margin-top:16px;display:flex;flex-direction:column;gap:14px">
          <div style="padding:12px;background:#f8f9fa;border-radius:10px">
            <div style="font-size:11px;color:var(--text-secondary)">Staff</div>
            <div style="font-weight:700;font-size:14px;margin-top:2px" id="collectStaffName">-</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:4px" id="collectDetails">-</div>
          </div>
          <div><label class="label">Amount to Collect (₹)</label><input id="collectAmount" class="neu-input" type="number" style="min-height:48px;border-radius:10px;font-size:16px;font-weight:700"></div>
          <div><label class="label">Notes (optional)</label><input id="collectNotes" class="neu-input" placeholder="e.g., Cash collected at office" style="min-height:44px;border-radius:10px"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <button id="cancelCollect" class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600">Cancel</button>
            <button id="confirmCollect" class="neu-btn neu-btn--primary" style="min-height:48px;border-radius:12px;font-weight:700;background:#52c41a;border-color:#52c41a">✓ Confirm Collect</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Tabs
  root.querySelectorAll('.tab-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      root.querySelectorAll('.tab-btn').forEach(b=>{ b.classList.remove('active'); b.style.background='var(--bg)'; b.style.color='var(--text)'; b.style.border='0.5px solid var(--border)'; });
      btn.classList.add('active'); btn.style.background='#232f3e'; btn.style.color='white'; btn.style.border='none';
      root.querySelectorAll('.tab-content').forEach(c=>c.style.display='none');
      root.querySelector(`#tab-${btn.dataset.tab}`).style.display='block';
    });
  });

  // Hide toggle
  const toggleHide = () => {
    const newHide = !getHideBalancePref(stationId);
    setHideBalancePref(stationId, newHide);
    collectionsView({ root });
  };
  root.querySelector('#hideToggle').addEventListener('click', toggleHide);
  root.querySelector('#hideBalanceBtn').addEventListener('click', toggleHide);

  // Export
  root.querySelector('#exportBtn').addEventListener('click', ()=>{
    let csv = `Staff,Shift ID,Date,To Collect,Collected,Pending,Type\n`;
    staffList.forEach(staff=>{
      staff.shifts.forEach(sh=>{
        csv += `${staff.staffName},${sh.id},${sh.startTime},${sh.toCollect},${sh.collectedAmt},${sh.pendingCollect},collect\n`;
      });
    });
    csv += `\nSettlements\nStaff,Amount,Type,Date,By,Notes\n`;
    settlements.forEach(s=>{
      csv += `${s.staffName},${s.amount},${s.type},${s.createdAt},${s.createdByName},${(s.notes||'').replace(/,/g,' ')}\n`;
    });
    const blob = new Blob([csv], { type:'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`collections-${stationId}-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
  });

  // Settle All
  root.querySelector('#settleAllBtn').addEventListener('click', async ()=>{
    if (totals.totalPendingCollect<=0.5 && totals.totalPendingReturn<=0.5) return alert('No pending to settle');
    if (!confirm(`🧹 Reset Dashboard — Settle All Pending?\n\nThis will:\n• Mark ${formatCurrency(totals.totalPendingCollect)} as collected from staff\n• Mark ${formatCurrency(totals.totalPendingReturn)} as returned to staff\n• Reset your To Collect to ₹0\n• History remains in Reports & Collections History\n• Cannot be undone, but you can see history\n\nContinue?`)) return;
    const second = prompt(`Type "SETTLE ${formatCurrency(totals.totalPendingCollect)}" to confirm:`);
    if (second !== `SETTLE ${formatCurrency(totals.totalPendingCollect)}`) return alert('Confirmation mismatch — cancelled');
    const btn = root.querySelector('#settleAllBtn');
    btn.disabled = true;
    btn.textContent = 'Settling...';
    try {
      const res = await settleAllPending(stationId);
      alert(`✅ Settled ${res.settledCount} shifts • ${formatCurrency(res.totalSettled)} marked as collected\n\nDashboard To Collect is now ₹0`);
      collectionsView({ root });
    } catch(e){
      alert('Failed: ' + e.message);
      btn.disabled = false;
      btn.textContent = `🧹 Reset Dashboard • Settle All Pending (${formatCurrency(totals.totalPendingCollect)})`;
    }
  });

  // Collect modal logic
  let currentCollect = null;
  function openCollectModal({ staffUserId, staffName, shiftId, shiftIds, amount, type }) {
    currentCollect = { staffUserId, staffName, shiftId, shiftIds, type };
    root.querySelector('#collectStaffName').textContent = staffName;
    root.querySelector('#collectDetails').textContent = shiftId ? `Shift ${shiftId.slice(0,6)} • ${type==='collect'?'To Collect':'To Return'} ${formatCurrency(amount)}` : `Bulk collect for ${staffName} • ${shiftIds?.length||1} shifts`;
    root.querySelector('#collectAmount').value = amount;
    root.querySelector('#collectNotes').value = '';
    root.querySelector('#collectModalTitle').textContent = type==='collect' ? '💰 Collect Money' : '↩️ Return Money';
    root.querySelector('#collectModal').style.display = 'flex';
  }

  root.querySelectorAll('.collect-shift-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      openCollectModal({
        staffUserId: btn.dataset.staff,
        staffName: btn.dataset.name,
        shiftId: btn.dataset.shift,
        amount: Number(btn.dataset.amount),
        type: btn.dataset.type,
      });
    });
  });

  root.querySelectorAll('.collect-staff-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const staff = staffList.find(s=>s.staffUserId===btn.dataset.staff);
      if (!staff) return;
      const pendingShifts = staff.shifts.filter(s=>s.pendingCollect>0.5).map(s=>s.id);
      openCollectModal({
        staffUserId: btn.dataset.staff,
        staffName: btn.dataset.name,
        shiftIds: pendingShifts,
        amount: Number(btn.dataset.amount),
        type: btn.dataset.type,
      });
    });
  });

  root.querySelector('#cancelCollect').addEventListener('click', ()=> root.querySelector('#collectModal').style.display='none');

  root.querySelector('#confirmCollect').addEventListener('click', async ()=>{
    const amount = Number(root.querySelector('#collectAmount').value);
    const notes = root.querySelector('#collectNotes').value.trim();
    if (!amount || amount<=0) return alert('Enter valid amount');
    if (!currentCollect) return;
    const btn = root.querySelector('#confirmCollect');
    btn.disabled = true;
    btn.textContent = 'Collecting...';
    try {
      if (currentCollect.shiftId) {
        await collectFromShift(currentCollect.shiftId, amount, notes, currentCollect.type);
      } else if (currentCollect.shiftIds) {
        await collectBulk(stationId, currentCollect.staffUserId, currentCollect.staffName, currentCollect.shiftIds, amount, notes, currentCollect.type);
      }
      alert(`✅ ${formatCurrency(amount)} ${currentCollect.type==='collect'?'collected from':'returned to'} ${currentCollect.staffName}`);
      root.querySelector('#collectModal').style.display='none';
      collectionsView({ root });
    } catch(e){
      alert('Failed: ' + e.message);
      btn.disabled = false;
      btn.textContent = '✓ Confirm Collect';
    }
  });
}
