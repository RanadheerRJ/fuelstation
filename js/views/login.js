import { loginWithPhonePin } from '../auth.js';
import { getFirebaseStatus } from '../firebase.js';
import * as demo from '../services/demoStore.js';
import { registerUserInFirebase } from '../auth.js';

export async function loginView({ root }) {
  const { isDemo } = getFirebaseStatus();
  const hasUsers = isDemo ? demo.demoHasUsers() : true;

  // Clean install - no users yet -> show Create First Owner (works for both demo empty and Firebase empty)
  if (isDemo && !hasUsers) {
    root.innerHTML = `
      <div class="container" style="max-width:420px;padding-top:32px">
        <div style="text-align:center;margin-bottom:24px">
          <div class="brand" style="justify-content:center;font-size:30px"><div class="brand-mark">F</div> FuelOps</div>
          <p class="page-sub" style="margin-top:8px">Fuel Station Operations</p>
        </div>

        <div class="neu-card">
          <h2 style="font-size:20px;font-weight:800;text-align:center">Create Owner Account 👑</h2>
          <p style="text-align:center;color:var(--text-muted);font-size:12px;margin:6px 0 18px">First time setup — this will be the super admin</p>
          <div id="setupAlert"></div>
          <div class="grid" style="gap:12px">
            <div><label class="label">Owner Name</label><input id="setup_name" class="neu-input" placeholder="Your Name"></div>
            <div><label class="label">Phone Number</label><input id="setup_phone" class="neu-input" type="tel" placeholder="+91 99999 99999"></div>
            <div><label class="label">4-digit PIN</label><input id="setup_pin" class="neu-input" type="tel" maxlength="4" placeholder="••••"></div>
            <button id="setupBtn" class="neu-btn neu-btn--primary neu-btn--block">Create & Login</button>
          </div>
        </div>
      </div>
    `;

    root.querySelector('#setupBtn').addEventListener('click', async ()=>{
      const name = root.querySelector('#setup_name').value.trim();
      const phone = root.querySelector('#setup_phone').value.trim();
      const pin = root.querySelector('#setup_pin').value.trim();
      const alertEl = root.querySelector('#setupAlert');
      if (!name || !phone || !pin || pin.length!==4 || !/^\d{4}$/.test(pin)) {
        alertEl.innerHTML = `<div class="alert alert--danger">Enter valid name, phone and 4-digit PIN</div>`;
        return;
      }
      const btn = root.querySelector('#setupBtn');
      btn.disabled = true;
      btn.textContent = 'Creating...';
      try {
        const user = await registerUserInFirebase({ phone, pin, name, role: 'owner', stationIds: [] });
        if (isDemo) {
          const { setState } = await import('../state.js');
          setState({ user: { uid: user.uid||user.id, phone, name, role: 'owner', stationIds: [] }, currentStationId: null });
          location.hash = '#/dashboard';
        } else {
          await loginWithPhonePin(phone, pin);
          location.hash = '#/dashboard';
        }
      } catch(e){
        alertEl.innerHTML = `<div class="alert alert--danger">⚠️ ${e.message}</div>`;
        btn.disabled = false;
        btn.textContent = 'Create & Login';
      }
    });
    return;
  }

  // PROD LOGIN - clean, no demo banners, no dummy credentials
  root.innerHTML = `
    <div class="container" style="max-width:400px;padding-top:32px">
      <div style="text-align:center;margin-bottom:28px">
        <div class="brand" style="justify-content:center;font-size:30px"><div class="brand-mark">F</div> FuelOps</div>
        <p class="page-sub" style="margin-top:8px">Fuel Station Daily Operations</p>
      </div>

      <div class="neu-card">
        <h2 style="font-size:22px;font-weight:800;text-align:center">Welcome Back 👋</h2>
        <p style="text-align:center;color:var(--text-muted);font-size:13px;margin:8px 0 20px">Login with Phone + 4-digit PIN</p>

        <div id="loginAlert"></div>

        <label class="label">Phone Number</label>
        <input id="phoneInput" class="neu-input" type="tel" placeholder="+91  XXXXX XXXXX" inputmode="tel" autocomplete="tel" />

        <div style="margin-top:18px">
          <label class="label">PIN</label>
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
          <button type="button" data-action="clear">⌫</button>
          <button type="button" data-num="0">0</button>
          <button type="button" data-action="submit">✓</button>
        </div>

        <button id="loginBtn" class="neu-btn neu-btn--primary neu-btn--block" style="margin-top:10px">Login</button>

        <div style="text-align:center;margin-top:14px">
          <button id="forgotBtn" style="background:none;border:none;color:var(--text-muted);font-size:13px;font-weight:600;cursor:pointer">Forgot PIN? Contact Owner</button>
        </div>
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
  root.querySelector('#forgotBtn').addEventListener('click', ()=>{
    showAlert('Contact your Owner or Manager to reset PIN.', 'info');
  });

  renderPin();
}
