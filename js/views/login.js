import { loginWithPhonePin, normalizePhone } from '../auth.js';
import { getFirebaseStatus } from '../firebase.js';
import * as demo from '../services/demoStore.js';
import { registerUserInFirebase } from '../auth.js';

export async function loginView({ root }) {
  const { isDemo } = getFirebaseStatus();
  
  let hasSuperAdmin = false;
  let hasUsers = false;
  let firebaseError = null;
  
  if (isDemo) {
    hasUsers = demo.demoHasUsers();
    hasSuperAdmin = demo.demoHasSuperAdmin();
  } else {
    // User-directory reads require authentication. Never probe privileged
    // profiles from the public login screen or expose live bootstrap controls.
    hasUsers = true;
    hasSuperAdmin = true;
  }

  // BOOTSTRAP: Only show Super Admin setup if NO super admin exists AND in demo mode
  // For real Firebase, super admin should be created via Firebase Console or via hidden /dev-setup route
  // This prevents public from seeing Create Super Admin every time
  if (isDemo && !hasSuperAdmin) {
    root.innerHTML = `
      <div class="login-wrapper">
        <div class="login-brand">
          <div class="brand-mark" style="background:transparent;padding:0;width:72px;height:72px;border-radius:20px;overflow:hidden"><img src="./assets/icons/icon-192.png" alt="FuelOps" style="width:72px;height:72px;border-radius:20px;object-fit:cover"></div>
          <div class="app-name">FuelOps</div>
          <div class="app-sub">Developer Setup • One Time Only</div>
        </div>

        <div class="login-card">
          <h2 style="font-size:20px;font-weight:700;text-align:center">Create Super Admin</h2>
          <p style="text-align:center;color:var(--text-secondary);font-size:13px;margin:8px 0 20px">Only one super admin allowed in whole system. This screen will never show again after creation.</p>
          <div id="setupAlert"></div>
          <div class="grid" style="gap:16px">
            <div><label class="label">Name</label><input id="setup_name" class="neu-input" placeholder="Your name"></div>
            <div><label class="label">Phone (10 digits)</label><input id="setup_phone" class="neu-input" type="tel" inputmode="numeric" maxlength="10" placeholder="9948288169"></div>
            <div><label class="label">PIN (4 digits)</label><input id="setup_pin" class="neu-input" type="password" inputmode="numeric" maxlength="4" placeholder="••••"></div>
            <div><label class="label">Setup Key</label><input id="setup_key" class="neu-input" type="password" placeholder="FUELDEV2024"></div>
            <button id="setupBtn" class="neu-btn neu-btn--primary neu-btn--block">Create Super Admin</button>
          </div>
          <div style="margin-top:16px;padding:12px;background:var(--bg);border-radius:10px;border:0.5px solid var(--border)">
            <p style="font-size:11px;color:var(--text-tertiary);line-height:1.5">Key: <b>FUELDEV2024</b><br>After creation, this screen disappears forever.<br>Only Super Admin can invite Owners.</p>
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
      btn.textContent = 'Creating in Firebase...';
      try {
        const user = await registerUserInFirebase({ phone, pin, name, role: 'super_admin', stationIds: [] });
        const { setState } = await import('../state.js');
        setState({ user: { uid: user.uid||user.id, phone, name, role: 'super_admin', stationIds: [] }, currentStationId: null });
        alertEl.innerHTML = `<div class="alert alert--success">✅ Super Admin created! Redirecting...</div>`;
        setTimeout(()=> location.hash = '#/dashboard', 1000);
      } catch(e){
        console.error('Super Admin creation failed:', e);
        alertEl.innerHTML = `<div class="alert alert--danger">⚠️ ${e.message}<br><small>Check console. For Firebase: Ensure Auth Email/Password enabled and Firestore rules published.</small></div>`;
        btn.disabled = false;
        btn.textContent = 'Create Super Admin';
      }
    });
    return;
  }

  // For real Firebase with no super admin, show message to contact developer or go to hidden setup
  if (!isDemo && !hasSuperAdmin) {
    root.innerHTML = `
      <div class="login-wrapper">
        <div class="login-brand">
          <div class="brand-mark" style="background:transparent;padding:0;width:72px;height:72px;border-radius:20px;overflow:hidden"><img src="./assets/icons/icon-192.png" alt="FuelOps" style="width:72px;height:72px;border-radius:20px;object-fit:cover"></div>
          <div class="app-name">FuelOps</div>
          <div class="app-sub">System Setup Required</div>
        </div>
        <div class="login-card" style="text-align:center">
          <div style="font-size:40px">🔧</div>
          <h2 style="font-size:18px;font-weight:700;margin-top:12px">System Not Initialized</h2>
          <p style="font-size:13px;color:var(--text-secondary);margin-top:8px">No Super Admin found in Firebase.<br>Super Admin must be created first.</p>
          <div class="alert alert--info" style="margin-top:16px;text-align:left">
            <div>
              <b>For Developer:</b><br>
              1. Enable Auth → Email/Password in Firebase Console<br>
              2. Create Firestore DB → Apply rules from firestore.rules<br>
              3. Go to <a href="#/dev-setup" style="font-weight:700">Developer Setup</a> to create Super Admin<br>
              Or create manually in Firebase Console:<br>
              Auth → Add user: <code>9948288169@fuelops.app</code> / <code>FuelOps#1234#2024</code><br>
              Firestore → users → Add doc with ID=UID, role=super_admin
            </div>
          </div>
          <button class="neu-btn neu-btn--primary neu-btn--block" style="margin-top:16px" onclick="location.hash='#/dev-setup'">Go to Developer Setup</button>
          <button class="neu-btn neu-btn--block" style="margin-top:10px" onclick="location.hash='#/login'">Back to Login</button>
        </div>
      </div>
    `;
    return;
  }

  // Normal Login - iOS Simple - 10 digit only - Dev vs User toggle
  root.innerHTML = `
    <div class="login-wrapper">
      <div class="login-brand">
        <div class="brand-mark" style="background:transparent;padding:0;width:72px;height:72px;border-radius:20px;overflow:hidden;box-shadow:0 8px 20px rgba(0,0,0,0.15)"><img src="./assets/icons/icon-192.png" alt="FuelOps" style="width:72px;height:72px;border-radius:20px;object-fit:cover"></div>
        <div class="app-name">FuelOps</div>
        <div class="app-sub">Pumps + Human Kind • Fuel Station Operations</div>
      </div>

      <div class="login-card">
        <div style="display:flex;background:var(--bg);border-radius:10px;padding:4px;gap:4px;margin-bottom:20px">
          <button id="tabUser" class="neu-btn" style="flex:1;min-height:40px;border-radius:8px;background:var(--card);box-shadow:var(--shadow-sm);font-size:14px;font-weight:700">User Login</button>
          <button id="tabDev" class="neu-btn" style="flex:1;min-height:40px;border-radius:8px;background:transparent;box-shadow:none;border:none;font-size:14px;color:var(--text-secondary)">Dev Login</button>
        </div>

        <h2 id="loginTitle" style="font-size:20px;font-weight:700;text-align:center">User Login</h2>
        <p id="loginSub" style="text-align:center;color:var(--text-secondary);font-size:13px;margin:6px 0 20px">Owners, Managers, Attendants</p>

        <div id="loginAlert"></div>
        ${firebaseError ? `<div class="alert alert--warning" style="margin-bottom:12px">⚠️ Firebase: ${firebaseError}<br><small>Ensure Firestore enabled and rules published</small></div>` : ''}

        <div class="grid" style="gap:18px">
          <div>
            <label class="label">Phone Number</label>
            <input id="phoneInput" class="neu-input" type="tel" inputmode="numeric" maxlength="10" placeholder="9948288169" autocomplete="tel" autofocus />
            <p style="font-size:11px;color:var(--text-tertiary);margin-top:6px">10 digits, no +91, no spaces</p>
          </div>

          <div>
            <label class="label">PIN</label>
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
  const tabUser = root.querySelector('#tabUser');
  const tabDev = root.querySelector('#tabDev');
  const titleEl = root.querySelector('#loginTitle');
  const subEl = root.querySelector('#loginSub');

  let loginMode = 'user';

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
      console.error('Login failed:', err);
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
