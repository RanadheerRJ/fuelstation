import { getState } from '../state.js';

// Collections removed - was confusing like jackpot, now simple To Handover in shift receipt only
export async function collectionsView({ root }) {
  root.innerHTML = `
    <div class="container" style="max-width:480px;margin:0 auto;padding-bottom:100px">
      <div style="text-align:center;padding:40px 20px">
        <div style="font-size:48px">🧾</div>
        <h1 style="font-size:20px;font-weight:800;margin-top:12px">Collections Removed</h1>
        <p style="font-size:13px;color:var(--text-secondary);margin-top:8px;line-height:1.5">
          Collections / Collect Money was confusing like jackpot.<br>
          Now it's simple: shift receipt shows <b>To Handover</b> = Net - Payments.<br>
          No separate collection page needed. Just check shift receipt and Reports.
        </p>
        <div style="margin-top:20px;display:grid;gap:10px">
          <button class="neu-btn neu-btn--primary" style="min-height:48px;border-radius:12px;font-weight:700" onclick="location.hash='#/reports'">Go to Reports →</button>
          <button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="location.hash='#/shifts'">View Shifts →</button>
          <button class="neu-btn" style="min-height:48px;border-radius:12px;font-weight:600" onclick="location.hash='#/dashboard'">Back to Dashboard</button>
        </div>
        <div style="margin-top:16px;padding:12px;background:#f6ffed;border-radius:12px;border:1px solid #b7eb8f;font-size:11px;color:#389e0d;text-align:left">
          <b>How it works now (simple):</b><br>
          • Gross = fuel from nozzles<br>
          • Expenses (Testing) minus from Gross = Net = whole amount to owner<br>
          • To Handover = Net - Payments (UPI/Cash/Card)<br>
          • No jackpot, no extra collection step
        </div>
      </div>
    </div>
  `;
}
