import { loginWithPhonePin } from '../auth.js';
import { getFirebaseStatus } from '../firebase.js';
import { getState } from '../state.js';
import * as demo from '../services/demoStore.js';
import { registerUserInFirebase } from '../auth.js';

export async function loginView({ root }) {
  const { isDemo, configured } = getFirebaseStatus();
  const hasUsers = isDemo ? demo.demoHasUsers() : true; // in prod, we assume users exist via Firebase

  // If demo and no users, show first-owner setup
  if (isDemo && !hasUsers) {
    root.innerHTML = `
      <div class="container" style="max-width:420px;padding-top:28px">
        <div style="text-align:center;margin-bottom:22px">
          <div class="brand" style="justify-content:center;font-size:28px"><div class="brand-mark">F</div> FuelOps</div>
          <p class="page-sub" style="margin-top:8px">Production Ready • Clean Install</p>
          <div class="badge badge--warning" style="margin-top:10px">No users found • Create Owner</div>
        </div>

        <div class="neu-card">
          <h2 style="font-size:20px;font-weight:800;text-align:center">Create First Owner 👑</h2>
          <p style="text-align:center;color:var(--text-muted);font-size:12px;margin:6px 0 18px">This will be the super admin. No dummy data.</p>
          <div id="setupAlert"></div>
          <div class="grid" style="gap:12px">
            <div><label class="label">Owner Name</label><input id="setup_name" class="neu-input" placeholder="Your Name"></div>
            <div><label class="label">Phone Number</label><input id="setup_phone" class="neu-input" type="tel" placeholder="+91 99999 99999"></div>
            <div><label class="label">4-digit PIN</label><input id="setup_pin" class="neu-input" type="tel" maxlength="4" placeholder="1234"></div>
            <button id="setupBtn" class="neu-btn neu-btn--primary neu-btn--block">Create Owner & Login</button>
          </div>
          <div class="alert alert--info" style="margin-top:14px">In production with Firebase, create owner via Firebase Console first, or use this same flow after configuring Firebase. PIN is never stored plain in Firestore - Firebase Auth holds the hash.</div>
        </div>

        <div class="neu-card neu-card--sm" style="margin-top:16px">
          <h4 style="font-weight:800;font-size:12px">Firebase Setup Checklist</h4>
          <ol style="font-size:11px;color:var(--text-muted);margin-top:8px;padding-left:16px;display:flex;flex-direction:column;gap:4px">
            <li>Create Firebase project</li>
            <li>Enable Auth → Email/Password</li>
            <li>Create Firestore DB</li>
            <li>Paste config into <code>js/firebase-config.js</code></li>
            <li>Apply rules from <code>firestore.rules</code></li>
            <li>Deploy to GitHub Pages</li>
          </ol>
        </div>
      </div>
    `;

    root.querySelector('#setupBtn').addEventListener('click', async ()=>{
      const name = root.querySelector('#setup_name').value.trim();
      const phone = root.querySelector('#setup_phone').value.trim();
      const pin = root.querySelector('#setup_pin').value.trim();
      const alertEl = root.querySelector('#setupAlert');
      if (!name || !phone || !pin || pin.length!==4) {
        alertEl.innerHTML = `<div class="alert alert--danger">Fill all fields, PIN 4 digits</div>`;
        return;
      }
      try {
        const user = await registerUserInFirebase({ phone, pin, name, role: 'owner', stationIds: [] });
        // Also login directly in demo
        if (isDemo) {
          const { setState } = await import('../state.js');
          setState({ user: { uid: user.uid||user.id, phone, name, role: 'owner', stationIds: [] }, currentStationId: null });
          location.hash = '#/dashboard';
        } else {
          // For Firebase, we created auth user, now login
          const { loginWithPhonePin } = await import('../auth.js');
          await loginWithPhonePin(phone, pin);
          location.hash = '#/dashboard';
        }
      } catch(e){
        alertEl.innerHTML = `<div class="alert alert--danger">⚠️ ${e.message}</div>`;
      }
    });
    return;
  }

  root.innerHTML = `
    <div class="container" style="max-width:420px;padding-top:28px">
      <div style="text-align:center;margin-bottom:22px">
        <div class="brand" style="justify-content:center;font-size:28px"><div class="brand-mark">F</div> FuelOps</div>
        <p class="page-sub" style="margin-top:8px">Fuel Station Daily Operations</p>
        ${isDemo ? `<div class="badge badge--warning" style="margin-top:10px">Demo Mode • Empty DB • Prod Ready</div>` : `<div class="badge badge--success" style="margin-top:10px">Live • Firebase Connected</div>`}
      </div>

      <div class="neu-card">
        <h2 style="font-size:20px;font-weight:800;text-align:center">Welcome Back 👋</h2>
        <p style="text-align:center;color:var(--text-muted);font-size:13px;margin:6px 0 18px">Login with Phone + 4-digit PIN</p>

        <div id="loginAlert"></div>

        <label class="label">Phone Number</label>
        <input id="phoneInput" class="neu-input" type="tel" placeholder="+91 99999 99999" value="" inputmode="tel" autocomplete="tel" />

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

        <div style="text-align:center;margin-top:12px;display:flex;justify-content:center;gap:12px">
          <button id="forgotBtn" style="background:none;border:none;color:var(--text-muted);font-size:12px;font-weight:600;cursor:pointer">Forgot PIN?</button>
          ${isDemo ? `<button id="resetDemoBtn" style="background:none;border:none;color:var(--danger);font-size:12px;font-weight:600;cursor:pointer">Reset DB</button>` : ''}
        </div>

        ${isDemo ? `
          <div class="divider"></div>
          <p style="font-size:11px;color:var(--text-muted);text-align:center">Prod ready: No dummy data. Configure Firebase in <code>js/firebase-config.js</code> to go live. See README.</p>
        ` : ''}
      </div>

      <div class="neu-card neu-card--sm" style="margin-top:16px;text-align:center">
        <p style="font-size:11px;color:var(--text-muted)">PWA • GitHub Pages subpath safe • Hash routing • Relative assets</p>
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
    showAlert('Contact Owner/Manager to reset PIN. In Firebase, reset via Firebase Console → Auth, or recreate user.', 'info');
  });
  root.querySelector('#resetDemoBtn')?.addEventListener('click', ()=>{
    if (confirm('Clear all local demo data?')) {
      demo.demoReset();
      location.reload();
    }
  });

  renderPin();
}
