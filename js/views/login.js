import { loginWithPhonePin } from '../auth.js';
import { getFirebaseStatus } from '../firebase.js';
import * as demo from '../services/demoStore.js';
import { registerUserInFirebase } from '../auth.js';

export async function loginView({ root }) {
  const { isDemo } = getFirebaseStatus();
  const hasUsers = isDemo ? demo.demoHasUsers() : true;

  // BOOTSTRAP: Super Admin setup - invite-only system
  if (isDemo && !hasUsers) {
    root.innerHTML = `
      <div class="login-wrapper">
        <div class="login-brand">
          <div class="brand-mark">F</div>
          <div style="font-weight:900;font-size:26px;letter-spacing:-0.04em">FuelOps</div>
          <div style="color:var(--text-muted);font-size:13px;margin-top:4px;font-weight:600">Developer Setup • Invite Only</div>
        </div>

        <div class="login-card">
          <h2>Super Admin Setup 🔧</h2>
          <p class="sub">First time only — you are the developer. Create Super Admin, then invite Owners.</p>
          <div id="setupAlert"></div>
          <div class="grid" style="gap:14px;margin-top:18px">
            <div><label class="label">Developer Name</label><input id="setup_name" class="neu-input" placeholder="Your full name"></div>
            <div><label class="label">Phone Number</label><input id="setup_phone" class="neu-input" type="tel" placeholder="+91  98765 43210"></div>
            <div><label class="label">4-digit PIN</label><input id="setup_pin" class="neu-input" type="tel" maxlength="4" placeholder="••••"></div>
            <div><label class="label">Setup Key</label><input id="setup_key" class="neu-input" type="password" placeholder="FUELDEV2024"></div>
            <button id="setupBtn" class="neu-btn neu-btn--primary neu-btn--block" style="margin-top:6px">Create Super Admin</button>
          </div>
          <div class="neu-card neu-card--inset" style="margin-top:18px;padding:14px;border-radius:14px">
            <p style="font-size:11px;color:var(--text-muted);line-height:1.5">Setup Key is <b>FUELDEV2024</b> by default. After Super Admin is created, no one can self-register. Only Super Admin can invite Owners with site name + phone + PIN.</p>
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
        alertEl.innerHTML = `<div class="alert alert--danger">⚠️ Invalid Setup Key</div>`;
        return;
      }
      if (!name || !phone || !pin || pin.length!==4 || !/^\d{4}$/.test(pin)) {
        alertEl.innerHTML = `<div class="alert alert--danger">Fill valid name, phone and 4-digit PIN</div>`;
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
        alertEl.innerHTML = `<div class="alert alert--danger">⚠️ ${e.message}</div>`;
        btn.disabled = false;
        btn.textContent = 'Create Super Admin';
      }
    });
    return;
  }

  // PROD LOGIN - Neumorphic Soft UI
  root.innerHTML = `
    <div class="login-wrapper">
      <div class="login-brand">
        <div class="brand-mark">F</div>
        <div style="font-weight:900;font-size:28px;letter-spacing:-0.04em">FuelOps</div>
        <div style="color:var(--text-muted);font-size:13px;margin-top:4px;font-weight:600">Fuel Station Operations</div>
      </div>

      <div class="login-card">
        <h2>Welcome Back 👋</h2>
        <p class="sub">Phone + 4-digit PIN • Invite only</p>

        <div id="loginAlert"></div>

        <div style="margin-top:8px">
          <label class="label">Phone Number</label>
          <div class="neu-card neu-card--inset" style="padding:4px;border-radius:16px">
            <input id="phoneInput" class="neu-input" type="tel" placeholder="+91  XXXXX XXXXX" inputmode="tel" autocomplete="tel" style="box-shadow:none;background:transparent;border:none" />
          </div>
        </div>

        <div style="margin-top:18px">
          <label class="label">4-digit PIN</label>
          <div class="kbd-pin" id="pinDots">
            <div class="dot" data-idx="0">•</div>
            <div class="dot" data-idx="1">•</div>
            <div class="dot" data-idx="2">•</div>
            <div class="dot" data-idx="3">•</div>
          </div>
          <input id="pinInput" type="hidden" />
        </div>

        <div class="numpad" id="numpad">
          ${[1,2,3,4,5,6,7,8,9].map(n=>`<button type="button" data-num="${n}">${n}</button>`).join('')}
          <button type="button" data-action="clear" style="font-size:18px">⌫</button>
          <button type="button" data-num="0">0</button>
          <button type="button" data-action="submit" style="color:var(--primary)">✓</button>
        </div>

        <button id="loginBtn" class="neu-btn neu-btn--primary neu-btn--block" style="margin-top:6px">Login</button>

        <div class="neu-card neu-card--inset" style="margin-top:18px;padding:12px;border-radius:14px;text-align:center">
          <p style="font-size:11px;color:var(--text-muted);font-weight:600">🔒 Invite only • No self-registration<br>Contact Developer to get access</p>
        </div>
      </div>

      <p style="font-size:10px;color:var(--text-muted);margin-top:18px;font-weight:600;letter-spacing:0.05em">NEUMORPHIC • SOFT UI • PWA • GITHUB PAGES</p>
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
      if (i < pin.length) { dot.textContent = '●'; dot.classList.add('filled'); }
      else { dot.textContent = '•'; dot.classList.remove('filled'); }
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
      showAlert('⚠️ ' + (err.message || 'Login failed'), 'danger');
      pin = ''; renderPin();
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Login';
    }
  }

  loginBtn.addEventListener('click', doLogin);
  renderPin();
}
