import { loginWithPhonePin, normalizePhone } from '../auth.js';
import { getFirebaseStatus, getIsDemo } from '../firebase.js';
import * as demo from '../services/demoStore.js';
import { registerUserInFirebase } from '../auth.js';

export async function loginView({ root }) {
  const { isDemo } = getFirebaseStatus();
  
  // Check if super admin exists
  let hasSuperAdmin = false;
  let hasUsers = false;
  
  if (isDemo) {
    hasUsers = demo.demoHasUsers();
    hasSuperAdmin = demo.demoHasSuperAdmin();
  } else {
    // Real Firebase - check Firestore for any users
    try {
      const { listDocs } = await import('../services/firestoreService.js');
      const users = await listDocs('users');
      hasUsers = users.length > 0;
      hasSuperAdmin = users.some(u => u.role === 'super_admin');
    } catch {
      hasUsers = true; // assume users exist if check fails, to avoid showing setup to everyone
      hasSuperAdmin = true;
    }
  }

  // BOOTSTRAP: No super admin -> Super Admin setup (only ONE ever) - works for both demo and Firebase
  if (!hasSuperAdmin) {
    root.innerHTML = `
      <div class="login-wrapper">
        <div class="login-brand">
          <div class="brand-mark">F</div>
          <div class="app-name">FuelOps</div>
          <div class="app-sub">Developer Setup • One Time</div>
        </div>

        <div class="login-card">
          <h2 style="font-size:20px;font-weight:700;text-align:center">Super Admin Setup</h2>
          <p style="text-align:center;color:var(--text-secondary);font-size:13px;margin:8px 0 20px">Create single super admin. Only one allowed in whole system.</p>
          <div id="setupAlert"></div>
          <div class="grid" style="gap:16px">
            <div><label class="label">Name</label><input id="setup_name" class="neu-input" placeholder="Your name"></div>
            <div><label class="label">Phone (10 digits)</label><input id="setup_phone" class="neu-input" type="tel" inputmode="numeric" maxlength="10" placeholder="9948288169"></div>
            <div><label class="label">PIN (4 digits)</label><input id="setup_pin" class="neu-input" type="password" inputmode="numeric" maxlength="4" placeholder="••••"></div>
            <div><label class="label">Setup Key</label><input id="setup_key" class="neu-input" type="password" placeholder="FUELDEV2024"></div>
            <button id="setupBtn" class="neu-btn neu-btn--primary neu-btn--block">Create Super Admin</button>
          </div>
          <div style="margin-top:16px;padding:12px;background:var(--bg);border-radius:10px;border:0.5px solid var(--border)">
            <p style="font-size:11px;color:var(--text-tertiary);line-height:1.5">Setup Key: <b>FUELDEV2024</b><br>After this, only Super Admin can invite Owners.<br>Owners login with 10-digit phone + PIN.<br><br>For Firebase prod: This creates real Auth user + Firestore doc.</p>
          </div>
        </div>
      </div>
    `;

    root.querySelector('#setupBtn').addEventListener('click', async ()=>{
      const name = root.querySelector('#setup_name').value.trim();
      const phoneRaw = root.querySelector('#setup_phone').value.trim();
      const pin = root.querySelector('#setup_pin').value.trim();
      const key = root.querySelector('#setup_key').value.trim();
      const alertEl = root.querySelector('#setupAlert');

      if (key !== 'FUELDEV2024' && key !== 'fueldev2024' && key !== 'DEV1234') {
        alertEl.innerHTML = `<div class="alert alert--danger">Invalid Setup Key</div>`;
        return;
      }
      if (!name || !phoneRaw || !pin || pin.length!==4) {
        alertEl.innerHTML = `<div class="alert alert--danger">Fill valid details</div>`;
        return;
      }
      const phone = normalizePhone(phoneRaw);
      const btn = root.querySelector('#setupBtn');
      btn.disabled = true;
      btn.textContent = 'Creating...';
      try {
        const user = await registerUserInFirebase({ phone, pin, name, role: 'super_admin', stationIds: [] });
        if (isDemo) {
          const { setState } = await import('../state.js');
          setState({ user: { uid: user.uid||user.id, phone, name, role: 'super_admin', stationIds: [] }, currentStationId: null });
        } else {
          await loginWithPhonePin(phone, pin);
        }
        location.hash = '#/dashboard';
      } catch(e){
        alertEl.innerHTML = `<div class="alert alert--danger">${e.message}</div>`;
        btn.disabled = false;
        btn.textContent = 'Create Super Admin';
      }
    });
    return;
  }

  // iOS Simple Login - 10 digit phone only - invite only
  root.innerHTML = `
    <div class="login-wrapper">
      <div class="login-brand">
        <div class="brand-mark">F</div>
        <div class="app-name">FuelOps</div>
        <div class="app-sub">Fuel Station Operations</div>
      </div>

      <div class="login-card">
        <h2 style="font-size:22px;font-weight:700;text-align:center">Login</h2>
        <p style="text-align:center;color:var(--text-secondary);font-size:14px;margin:6px 0 24px">10-digit phone + PIN</p>

        <div id="loginAlert"></div>

        <div class="grid" style="gap:18px">
          <div>
            <label class="label">Phone Number</label>
            <input id="phoneInput" class="neu-input" type="tel" inputmode="numeric" maxlength="10" placeholder="9948288169" autocomplete="tel" autofocus />
            <p style="font-size:11px;color:var(--text-tertiary);margin-top:6px">Just 10 digits, no +91 needed</p>
          </div>

          <div>
            <label class="label">4-digit PIN</label>
            <input id="pinInput" class="neu-input" type="password" inputmode="numeric" maxlength="4" placeholder="••••" autocomplete="current-password" />
          </div>

          <button id="loginBtn" class="neu-btn neu-btn--primary neu-btn--block">Login</button>

          <p style="text-align:center;font-size:12px;color:var(--text-secondary)">No account? Contact developer.</p>
        </div>
      </div>
    </div>
  `;

  const phoneInput = root.querySelector('#phoneInput');
  const pinInput = root.querySelector('#pinInput');
  const alertEl = root.querySelector('#loginAlert');
  const loginBtn = root.querySelector('#loginBtn');

  function showAlert(msg, type='danger') {
    alertEl.innerHTML = `<div class="alert alert--${type}">${msg}</div>`;
  }

  async function doLogin() {
    const phoneRaw = phoneInput.value.trim();
    const pin = pinInput.value.trim();
    if (!phoneRaw || phoneRaw.replace(/\D/g,'').length < 10) { showAlert('Enter 10-digit phone'); phoneInput.focus(); return; }
    if (!pin || pin.length!==4 || !/^\d{4}$/.test(pin)) { showAlert('Enter 4-digit PIN'); pinInput.focus(); return; }
    const phone = normalizePhone(phoneRaw);
    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';
    try {
      await loginWithPhonePin(phone, pin);
      location.hash = '#/dashboard';
    } catch (err) {
      showAlert(err.message || 'Login failed', 'danger');
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Login';
    }
  }

  loginBtn.addEventListener('click', doLogin);
  pinInput.addEventListener('keydown', (e)=>{ if (e.key==='Enter') doLogin(); });
  phoneInput.addEventListener('keydown', (e)=>{ if (e.key==='Enter') pinInput.focus(); });
}
