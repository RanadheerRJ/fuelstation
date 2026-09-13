import { loginWithPhonePin, normalizePhone } from '../auth.js';
import { getFirebaseStatus } from '../firebase.js';
import * as demo from '../services/demoStore.js';
import { registerUserInFirebase } from '../auth.js';

export async function loginView({ root }) {
  const { isDemo } = getFirebaseStatus();
  
  let hasSuperAdmin = false;
  let hasUsers = false;
  
  if (isDemo) {
    hasUsers = demo.demoHasUsers();
    hasSuperAdmin = demo.demoHasSuperAdmin();
  } else {
    try {
      const { listDocs } = await import('../services/firestoreService.js');
      const users = await listDocs('users');
      hasUsers = users.length > 0;
      hasSuperAdmin = users.some(u => u.role === 'super_admin');
    } catch {
      hasUsers = true;
      hasSuperAdmin = true;
    }
  }

  // Super Admin bootstrap - only ONE
  if (!hasSuperAdmin) {
    root.innerHTML = `
      <div class="login-wrapper">
        <div class="login-brand">
          <div class="brand-mark">F</div>
          <div class="app-name">FuelOps</div>
          <div class="app-sub">Developer Setup • One Time Only</div>
        </div>

        <div class="login-card">
          <h2 style="font-size:20px;font-weight:700;text-align:center">Create Super Admin</h2>
          <p style="text-align:center;color:var(--text-secondary);font-size:13px;margin:8px 0 20px">Only one super admin allowed in whole system</p>
          <div id="setupAlert"></div>
          <div class="grid" style="gap:16px">
            <div><label class="label">Name</label><input id="setup_name" class="neu-input" placeholder="Your name"></div>
            <div><label class="label">Phone (10 digits)</label><input id="setup_phone" class="neu-input" type="tel" inputmode="numeric" maxlength="10" placeholder="9948288169"></div>
            <div><label class="label">PIN (4 digits)</label><input id="setup_pin" class="neu-input" type="password" inputmode="numeric" maxlength="4" placeholder="••••"></div>
            <div><label class="label">Setup Key</label><input id="setup_key" class="neu-input" type="password" placeholder="FUELDEV2024"></div>
            <button id="setupBtn" class="neu-btn neu-btn--primary neu-btn--block">Create Super Admin</button>
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
      if (phone.length !== 10) {
        alertEl.innerHTML = `<div class="alert alert--danger">Phone must be 10 digits</div>`;
        return;
      }
      const btn = root.querySelector('#setupBtn');
      btn.disabled = true;
      btn.textContent = 'Creating...';
      try {
        const user = await registerUserInFirebase({ phone, pin, name, role: 'super_admin', stationIds: [] });
        const { setState } = await import('../state.js');
        setState({ user: { uid: user.uid||user.id, phone, name, role: 'super_admin', stationIds: [] }, currentStationId: null });
        location.hash = '#/dashboard';
      } catch(e){
        alertEl.innerHTML = `<div class="alert alert--danger">${e.message}</div>`;
        btn.disabled = false;
        btn.textContent = 'Create Super Admin';
      }
    });
    return;
  }

  // Login with Dev vs User toggle - iOS simple
  root.innerHTML = `
    <div class="login-wrapper">
      <div class="login-brand">
        <div class="brand-mark">F</div>
        <div class="app-name">FuelOps</div>
        <div class="app-sub">Fuel Station Operations</div>
      </div>

      <div class="login-card">
        <div style="display:flex;background:var(--bg);border-radius:10px;padding:4px;gap:4px;margin-bottom:20px">
          <button id="tabUser" class="neu-btn" style="flex:1;min-height:40px;border-radius:8px;background:var(--card);box-shadow:var(--shadow-sm);font-size:14px">User Login</button>
          <button id="tabDev" class="neu-btn" style="flex:1;min-height:40px;border-radius:8px;background:transparent;box-shadow:none;border:none;font-size:14px;color:var(--text-secondary)">Dev Login</button>
        </div>

        <h2 id="loginTitle" style="font-size:20px;font-weight:700;text-align:center">User Login</h2>
        <p id="loginSub" style="text-align:center;color:var(--text-secondary);font-size:13px;margin:6px 0 20px">Owners, Managers, Attendants</p>

        <div id="loginAlert"></div>

        <div class="grid" style="gap:16px">
          <div>
            <label class="label">Phone Number</label>
            <input id="phoneInput" class="neu-input" type="tel" inputmode="numeric" maxlength="10" placeholder="9948288169" autocomplete="tel" autofocus />
          </div>

          <div>
            <label class="label">PIN</label>
            <input id="pinInput" class="neu-input" type="password" inputmode="numeric" maxlength="4" placeholder="••••" autocomplete="current-password" />
          </div>

          <button id="loginBtn" class="neu-btn neu-btn--primary neu-btn--block">Login</button>

          <div style="text-align:center;padding-top:8px">
            <p style="font-size:12px;color:var(--text-tertiary)">Just 10 digits + 4-digit PIN<br>No +91, no country code</p>
          </div>
        </div>
      </div>
    </div>
  `;

  const phoneInput = root.querySelector('#phoneInput');
  const pinInput = root.querySelector('#pinInput');
  const alertEl = root.querySelector('#loginAlert');
  const loginBtn = root.querySelector('#loginBtn');
  const tabUser = root.querySelector('#tabUser');
  const tabDev = root.querySelector('#tabDev');
  const titleEl = root.querySelector('#loginTitle');
  const subEl = root.querySelector('#loginSub');

  let loginMode = 'user'; // 'user' or 'dev'

  function setMode(mode) {
    loginMode = mode;
    if (mode === 'user') {
      tabUser.style.background = 'var(--card)';
      tabUser.style.boxShadow = 'var(--shadow-sm)';
      tabUser.style.color = 'var(--text)';
      tabDev.style.background = 'transparent';
      tabDev.style.boxShadow = 'none';
      tabDev.style.color = 'var(--text-secondary)';
      titleEl.textContent = 'User Login';
      subEl.textContent = 'Owners, Managers, Attendants';
    } else {
      tabDev.style.background = 'var(--card)';
      tabDev.style.boxShadow = 'var(--shadow-sm)';
      tabDev.style.color = 'var(--text)';
      tabUser.style.background = 'transparent';
      tabUser.style.boxShadow = 'none';
      tabUser.style.color = 'var(--text-secondary)';
      titleEl.textContent = 'Developer Login';
      subEl.textContent = 'Super Admin Only';
    }
    alertEl.innerHTML = '';
  }

  tabUser.addEventListener('click', ()=> setMode('user'));
  tabDev.addEventListener('click', ()=> setMode('dev'));

  function showAlert(msg, type='danger') {
    alertEl.innerHTML = `<div class="alert alert--${type}">${msg}</div>`;
  }

  async function doLogin() {
    const phoneRaw = phoneInput.value.trim();
    const pin = pinInput.value.trim();
    if (!phoneRaw || phoneRaw.replace(/\D/g,'').length !== 10) { showAlert('Enter 10-digit phone'); phoneInput.focus(); return; }
    if (!pin || pin.length!==4 || !/^\d{4}$/.test(pin)) { showAlert('Enter 4-digit PIN'); pinInput.focus(); return; }
    const phone = normalizePhone(phoneRaw);
    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';
    try {
      await loginWithPhonePin(phone, pin, loginMode);
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
  
  setMode('user');
}
