import { loginWithPhonePin } from '../auth.js';
import { getFirebaseStatus } from '../firebase.js';
import { getDemoData } from '../state.js';

export async function loginView({ root }) {
  const { isDemo, configured } = getFirebaseStatus();
  const demoCreds = [
    { label: 'Owner', phone: '+919999999999', pin: '1111' },
    { label: 'Manager', phone: '+919999999998', pin: '2222' },
    { label: 'Attendant', phone: '+919999999997', pin: '3333' },
  ];

  root.innerHTML = `
    <div class="container" style="max-width:420px;padding-top:28px">
      <div style="text-align:center;margin-bottom:22px">
        <div class="brand" style="justify-content:center;font-size:28px"><div class="brand-mark">F</div> FuelOps</div>
        <p class="page-sub" style="margin-top:8px">Fuel Station Daily Operations</p>
        ${isDemo ? `<div class="badge badge--info" style="margin-top:10px">Demo Mode • No Firebase config needed</div>` : `<div class="badge badge--success" style="margin-top:10px">Live • Firebase Connected</div>`}
      </div>

      <div class="neu-card">
        <h2 style="font-size:20px;font-weight:800;text-align:center">Welcome Back 👋</h2>
        <p style="text-align:center;color:var(--text-muted);font-size:13px;margin:6px 0 18px">Login with Phone + 4-digit PIN</p>

        <div id="loginAlert"></div>

        <label class="label">Phone Number</label>
        <input id="phoneInput" class="neu-input" type="tel" placeholder="+91 99999 99999" value="+919999999999" inputmode="tel" autocomplete="tel" />

        <div style="margin-top:16px">
          <label class="label">PIN (4 digits)</label>
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

        <button id="loginBtn" class="neu-btn neu-btn--primary neu-btn--block" style="margin-top:8px">Login</button>

        <div style="text-align:center;margin-top:12px">
          <button id="forgotBtn" style="background:none;border:none;color:var(--text-muted);font-size:13px;font-weight:600;cursor:pointer">Forgot PIN?</button>
        </div>

        ${isDemo ? `
          <div class="divider"></div>
          <p class="label">Quick Demo Logins</p>
          <div class="grid" style="gap:8px">
            ${demoCreds.map(c=>`<button class="neu-btn neu-btn--small demo-login" data-phone="${c.phone}" data-pin="${c.pin}">${c.label} • ${c.pin}</button>`).join('')}
          </div>
          <p style="font-size:11px;color:var(--text-muted);margin-top:10px">Demo data is stored locally. No real Firebase needed. Configure Firebase in <code>js/firebase-config.js</code> for production.</p>
        ` : ''}
      </div>

      <div class="neu-card neu-card--sm" style="margin-top:16px;text-align:center">
        <p style="font-size:12px;color:var(--text-muted)">PWA • Installable • Works on GitHub Pages subpath</p>
        <p style="font-size:11px;color:var(--text-muted);margin-top:4px">Try offline banner: toggle network in devtools</p>
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

  // Keyboard support
  document.addEventListener('keydown', onKey);
  function onKey(e){
    if (e.key >= '0' && e.key <= '9' && pin.length < 4) { pin += e.key; renderPin(); if (pin.length===4) doLogin(); }
    if (e.key === 'Backspace') { pin = pin.slice(0,-1); renderPin(); }
    if (e.key === 'Enter') doLogin();
  }

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
    showAlert('Contact your Owner/Manager to reset PIN. In demo, use PINs shown above.', 'info');
  });

  root.querySelectorAll('.demo-login').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      phoneInput.value = btn.dataset.phone;
      pin = btn.dataset.pin;
      renderPin();
      doLogin();
    });
  });

  renderPin();
}
