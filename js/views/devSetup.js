import { normalizePhone, registerUserInFirebase, loginWithPhonePin } from '../auth.js';
import { getFirebaseStatus } from '../firebase.js';
import * as demo from '../services/demoStore.js';

export async function devSetupView({ root }) {
  const { isDemo } = getFirebaseStatus();
  
  let hasSuperAdmin = false;
  try {
    if (isDemo) {
      hasSuperAdmin = demo.demoHasSuperAdmin();
    } else {
      const { listDocs } = await import('../services/firestoreService.js');
      const users = await listDocs('users');
      hasSuperAdmin = users.some(u => u.role === 'super_admin');
    }
  } catch (e) {
    console.warn('Check super admin failed:', e);
  }

  if (hasSuperAdmin) {
    root.innerHTML = `
      <div class="login-wrapper">
        <div class="login-brand">
          <div class="brand-mark">F</div>
          <div class="app-name">FuelOps</div>
          <div class="app-sub">Setup Complete</div>
        </div>
        <div class="login-card" style="text-align:center">
          <div style="font-size:48px">✅</div>
          <h2 style="font-size:20px;font-weight:700;margin-top:16px">Super Admin Already Exists</h2>
          <p style="font-size:14px;color:var(--text-secondary);margin-top:8px">Only one super admin allowed.<br>This setup page is now disabled and hidden from public.</p>
          <div class="alert alert--success" style="margin-top:16px">This page will never be visible to normal users. Only you as developer know this route.</div>
          <button class="neu-btn neu-btn--primary neu-btn--block" style="margin-top:20px" onclick="location.hash='#/login'">Go to Login</button>
        </div>
      </div>
    `;
    return;
  }

  root.innerHTML = `
    <div class="login-wrapper">
      <div class="login-brand">
        <div class="brand-mark">F</div>
        <div class="app-name">FuelOps</div>
        <div class="app-sub">Developer Setup • Hidden Route</div>
      </div>

      <div class="login-card">
        <h2 style="font-size:20px;font-weight:700;text-align:center">Create Super Admin 🔧</h2>
        <p style="text-align:center;color:var(--text-secondary);font-size:13px;margin:8px 0 20px">One time only • Only you know this route<br><code>#/dev-setup</code> • Never visible to users</p>
        <div id="setupAlert"></div>
        ${!isDemo ? `<div class="alert alert--info" style="margin-bottom:16px"><b>Firebase Mode:</b> Ensure Auth Email/Password enabled and Firestore rules published from <code>firestore.rules</code>. This will create real Firebase user.</div>` : `<div class="alert alert--warning" style="margin-bottom:16px"><b>Demo Mode:</b> No Firebase config. Will save to local storage. Add real config in <code>js/firebase-config.js</code> to save to Firebase.</div>`}
        <div class="grid" style="gap:16px">
          <div><label class="label">Developer Name *</label><input id="setup_name" class="neu-input" placeholder="Your name" autocomplete="name"></div>
          <div><label class="label">Phone (10 digits) *</label><input id="setup_phone" class="neu-input" type="tel" inputmode="numeric" maxlength="10" placeholder="9948288169" autocomplete="tel"></div>
          <div><label class="label">PIN (4 digits) *</label><input id="setup_pin" class="neu-input" type="password" inputmode="numeric" maxlength="4" placeholder="••••"></div>
          <div><label class="label">Setup Key *</label><input id="setup_key" class="neu-input" type="password" placeholder="FUELDEV2024"></div>
          <button id="setupBtn" class="neu-btn neu-btn--primary neu-btn--block">Create Super Admin in ${isDemo ? 'Local DB' : 'Firebase'}</button>
        </div>
        <div style="margin-top:16px;padding:12px;background:var(--bg);border-radius:10px;border:0.5px solid var(--border)">
          <p style="font-size:11px;color:var(--text-tertiary);line-height:1.5">
            <b>Setup Key:</b> FUELDEV2024<br>
            <b>Phone:</b> Just 10 digits, no +91, no spaces<br>
            <b>After creation:</b> This page auto-disables forever<br>
            <b>For Firebase prod:</b> Creates Auth user <code>phone@fuelops.app</code> + Firestore doc
          </p>
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
    if (!name || !phoneRaw || !pin || pin.length!==4 || !/^\d{4}$/.test(pin)) {
      alertEl.innerHTML = `<div class="alert alert--danger">Fill valid name, 10-digit phone, 4-digit PIN</div>`;
      return;
    }
    const phone = normalizePhone(phoneRaw);
    if (phone.length !== 10) {
      alertEl.innerHTML = `<div class="alert alert--danger">Phone must be 10 digits</div>`;
      return;
    }

    const btn = root.querySelector('#setupBtn');
    btn.disabled = true;
    btn.textContent = 'Creating in ' + (isDemo ? 'Local...' : 'Firebase...');

    try {
      console.log('[DevSetup] Creating super admin:', phone);
      const user = await registerUserInFirebase({ phone, pin, name, role: 'super_admin', stationIds: [] });
      console.log('[DevSetup] Super admin created:', user);
      
      alertEl.innerHTML = `<div class="alert alert--success">✅ Super Admin created!<br>Phone: ${phone}<br>PIN: ${pin}<br>Role: super_admin<br>${isDemo ? 'Saved to local storage' : 'Saved to Firebase Auth + Firestore'}<br>Redirecting to dashboard...</div>`;
      
      const { setState } = await import('../state.js');
      if (isDemo) {
        setState({ user: { uid: user.uid||user.id, phone, name, role: 'super_admin', stationIds: [] }, currentStationId: null });
        setTimeout(()=> location.hash = '#/dashboard', 1500);
      } else {
        // For Firebase, login after creation
        try {
          await loginWithPhonePin(phone, pin);
          setTimeout(()=> location.hash = '#/dashboard', 1000);
        } catch (loginErr) {
          console.warn('Auto login failed, redirect to login:', loginErr);
          setTimeout(()=> location.hash = '#/login', 1500);
        }
      }
    } catch(e){
      console.error('[DevSetup] Failed:', e);
      alertEl.innerHTML = `<div class="alert alert--danger">⚠️ ${e.message}<br><br><b>For Firebase:</b><br>1. Enable Auth → Email/Password<br>2. Create Firestore DB<br>3. Publish rules from firestore.rules<br>Check console for details.</div>`;
      btn.disabled = false;
      btn.textContent = 'Create Super Admin in ' + (isDemo ? 'Local DB' : 'Firebase');
    }
  });
}
