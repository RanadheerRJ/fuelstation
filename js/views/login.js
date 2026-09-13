import { loginWithPhonePin } from '../auth.js';
import { getFirebaseStatus } from '../firebase.js';
import * as demo from '../services/demoStore.js';
import { registerUserInFirebase } from '../auth.js';

export async function loginView({ root }) {
  const { isDemo } = getFirebaseStatus();
  const hasUsers = isDemo ? demo.demoHasUsers() : true;

  // Super Admin bootstrap - invite only
  if (isDemo && !hasUsers) {
    root.innerHTML = `
      <div class="login-wrapper">
        <div class="login-brand">
          <div class="brand-mark">F</div>
          <div class="app-name">FuelOps</div>
          <div class="app-sub">Developer Setup</div>
        </div>

        <div class="login-card">
          <h2 style="font-size:20px;font-weight:700;text-align:center;letter-spacing:-0.02em">Super Admin Setup</h2>
          <p style="text-align:center;color:var(--text-secondary);font-size:14px;margin:8px 0 20px">First time only — create developer account</p>
          <div id="setupAlert"></div>
          <div class="grid" style="gap:16px;margin-top:16px">
            <div><label class="label">Developer Name</label><input id="setup_name" class="neu-input" placeholder="Your name"></div>
            <div><label class="label">Phone Number</label><input id="setup_phone" class="neu-input" type="tel" placeholder="+91  98765 43210"></div>
            <div><label class="label">4-digit PIN</label><input id="setup_pin" class="neu-input" type="tel" maxlength="4" placeholder="••••"></div>
            <div><label class="label">Setup Key</label><input id="setup_key" class="neu-input" type="password" placeholder="FUELDEV2024"></div>
            <button id="setupBtn" class="neu-btn neu-btn--primary neu-btn--block">Create Super Admin</button>
          </div>
        </div>
      </div>
    `;

    root.querySelector('#setupBtn').addEventListener('click', async ()=>{
      const name = root.querySelector('#setup_name').value.trim();
      const phone = root.querySelector('#setup_phone').value.trim();
      const pin = root.querySelector('#setup_pin').value.trim();
      const key = root.querySelector('#setup_key').value.trim();
      const alertEl = root.querySelector('#setupAlert');
      if (key !== 'FUELDEV2024' && key !== 'fueldev2024' && key !== 'DEV1234') {
        alertEl.innerHTML = `<div class="alert alert--danger">Invalid Setup Key</div>`;
        return;
      }
      if (!name || !phone || !pin || pin.length!==4) {
        alertEl.innerHTML = `<div class="alert alert--danger">Fill valid details</div>`;
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

  // iOS Login - clean and simple
  root.innerHTML = `
    <div class="login-wrapper">
      <div class="login-brand">
        <div class="brand-mark">F</div>
        <div class="app-name">FuelOps</div>
        <div class="app-sub">Fuel Station Operations</div>
      </div>

      <div class="login-card">
        <h2 style="font-size:22px;font-weight:700;text-align:center;letter-spacing:-0.02em">Welcome Back</h2>
        <p style="text-align:center;color:var(--text-secondary);font-size:15px;margin:6px 0 24px">Phone + PIN • Invite only</p>

        <div id="loginAlert"></div>

        <div style="margin-top:4px">
          <label class="label">Phone Number</label>
          <input id="phoneInput" class="neu-input" type="tel" placeholder="+91  00000 00000" inputmode="tel" autocomplete="tel" />
        </div>

        <div style="margin-top:18px">
          <label class="label">PIN</label>
          <div class="kbd-pin" id="pinDots">
            <div class="dot" data-idx="0"></div>
            <div class="dot" data-idx="1"></div>
            <div class="dot" data-idx="2"></div>
            <div class="dot" data-idx="3"></div>
          </div>
          <input id="pinInput" type="hidden" />
        </div>

        <div class="numpad" id="numpad">
          ${[1,2,3,4,5,6,7,8,9].map(n=>`<button type="button" data-num="${n}">${n}</button>`).join('')}
          <button type="button" data-action="clear">⌫</button>
          <button type="button" data-num="0">0</button>
          <button type="button" data-action="submit">✓</button>
        </div>

        <button id="loginBtn" class="neu-btn neu-btn--primary neu-btn--block">Login</button>

        <p style="text-align:center;font-size:13px;color:var(--text-secondary);margin-top:16px">No account? Contact developer.</p>
      </div>
    </div>
  `;

  const phoneInput = root.querySelector('#phoneInput');
  const pinInput = root.querySelector('#pinInput');
  const pinDots = root.querySelectorAll('#pinDots .dot');
  const alertEl = root.querySelector('#loginAlert');
  const loginBtn = root.querySelector('#loginBtn');

  let pin = '';

  function renderPin() {
    pinDots.forEach((dot,i)=>{
      if (i < pin.length) dot.classList.add('filled');
      else dot.classList.remove('filled');
    });
    pinInput.value = pin;
  }

  function showAlert(msg, type='danger') {
    alertEl.innerHTML = `<div class="alert alert--${type}">${msg}</div>`;
  }

  root.querySelector('#numpad').addEventListener('click', (e)=>{
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.num !== undefined) {
      if (pin.length < 4) { pin += btn.dataset.num; renderPin(); if (pin.length===4) doLogin(); }
    } else if (btn.dataset.action === 'clear') {
      pin = pin.slice(0,-1); renderPin();
    } else if (btn.dataset.action === 'submit') {
      doLogin();
    }
  });

  const onKey = (e)=>{
    if (e.key >= '0' && e.key <= '9' && pin.length < 4) { pin += e.key; renderPin(); if (pin.length===4) doLogin(); }
    if (e.key === 'Backspace') { pin = pin.slice(0,-1); renderPin(); }
    if (e.key === 'Enter') doLogin();
  };
  document.addEventListener('keydown', onKey);

  async function doLogin() {
    const phone = phoneInput.value.trim();
    if (!phone) { showAlert('Enter phone number'); return; }
    if (pin.length !== 4) { showAlert('Enter 4-digit PIN'); return; }
    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';
    try {
      await loginWithPhonePin(phone, pin);
      document.removeEventListener('keydown', onKey);
      location.hash = '#/dashboard';
    } catch (err) {
      showAlert(err.message || 'Login failed', 'danger');
      pin = ''; renderPin();
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Login';
    }
  }

  loginBtn.addEventListener('click', doLogin);
  renderPin();
}
