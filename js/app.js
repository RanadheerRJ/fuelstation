// PumpPulse Main App
import { initFirebase, getIsDemo, getFirebaseStatus } from './firebase.js';
import { getState, subscribe } from './state.js';
import { initRouter, registerRoute, navigate } from './router.js';
import { loginView } from './views/login.js';
import { dashboardView } from './views/dashboard.js';
import { stationsView } from './views/stations.js';
import { teamDirectoryView } from './views/teamDirectory.js';
import { pumpsView } from './views/pumps.js';
import { employeesView } from './views/employees.js';
import { pricesView } from './views/prices.js';
import { shiftsListView, startShiftView, shiftDetailView, closeShiftView } from './views/shifts.js';
import { reportsView } from './views/reports.js';
import { collectionsView } from './views/collections.js';
import { settingsView } from './views/settings.js';
import { superAdminView } from './views/superAdmin.js';
import { devSetupView } from './views/devSetup.js';
import { logout } from './auth.js';

const appRoot = document.getElementById('appRoot');
const bottomNav = document.getElementById('bottomNav');
const topbar = document.getElementById('topbar');
const offlineBanner = document.getElementById('offlineBanner');
const stationBadge = document.getElementById('stationBadge');
const logoutTop = document.getElementById('logoutTop');
const refreshTop = document.getElementById('refreshTop');

async function bootstrap() {
  await initFirebase();
  console.log('[PumpPulse] Firebase status', getFirebaseStatus());

  // Register routes (hash based)
  registerRoute('/login', loginView);
  registerRoute('/dev-setup', devSetupView);
  registerRoute('/setup', devSetupView);
  registerRoute('/dashboard', dashboardView);
  registerRoute('/stations', stationsView);
  registerRoute('/stations/:id/team', teamDirectoryView);
  registerRoute('/team', teamDirectoryView);
  registerRoute('/pumps', pumpsView);
  registerRoute('/employees', employeesView);
  registerRoute('/prices', pricesView);
  registerRoute('/shifts', shiftsListView);
  registerRoute('/shifts/start', startShiftView);
  registerRoute('/shifts/:id', shiftDetailView);
  registerRoute('/shifts/:id/close', closeShiftView);
  registerRoute('/reports', reportsView);
  registerRoute('/collections', collectionsView);
  registerRoute('/settlements', collectionsView);
  registerRoute('/settings', settingsView);
  registerRoute('/super-admin', superAdminView);
  registerRoute('/invite', superAdminView);
  // Default
  registerRoute('/', dashboardView);

  // State subscriptions for UI chrome
  subscribe((state)=>{
    updateChrome(state);
  });

  initRouter(appRoot);
  updateChrome(getState());

  // Offline banner
  function updateOffline() {
    if (!navigator.onLine) offlineBanner.classList.add('show');
    else offlineBanner.classList.remove('show');
  }
  window.addEventListener('online', updateOffline);
  window.addEventListener('offline', updateOffline);
  updateOffline();
}

function updateChrome(state) {
  const hasUser = !!state.user;
  if (hasUser) {
    topbar.style.display = 'flex';
    bottomNav.style.display = 'flex';
    logoutTop.style.display = 'inline-flex';
    refreshTop.style.display = 'inline-flex';
    stationBadge.style.display = 'inline-flex';
    // station badge - show name not ID
    const { currentStationId } = state;
    if (currentStationId) {
      // Try to get station name from cache or show short
      const stations = JSON.parse(localStorage.getItem('fuelops_stations_cache') || '[]');
      const st = stations.find(s=>s.id===currentStationId);
      if (st) stationBadge.textContent = `📍 ${st.name.slice(0,12)}`;
      else stationBadge.textContent = `📍 Station`;
    } else {
      stationBadge.textContent = 'No station';
    }
    renderBottomNav(state.user.role);
    ensureFloatingRefresh();
  } else {
    topbar.style.display = 'none';
    bottomNav.style.display = 'none';
    logoutTop.style.display = 'none';
    refreshTop.style.display = 'none';
    stationBadge.style.display = 'none';
    removeFloatingRefresh();
  }
}

function ensureFloatingRefresh() {
  if (document.getElementById('floatingRefresh')) return;
  const btn = document.createElement('button');
  btn.id = 'floatingRefresh';
  btn.innerHTML = '↻';
  btn.title = 'Refresh - Drag to move';
  btn.style.cssText = `
    position:fixed;
    width:44px;height:44px;
    border-radius:50%;
    background:var(--card);
    border:0.5px solid var(--border);
    box-shadow:var(--shadow-md);
    display:grid;place-items:center;
    font-size:18px;
    cursor:grab;
    z-index:50;
    user-select:none;
    touch-action:none;
    transition:box-shadow .15s ease, transform .1s ease;
  `;
  // Load saved position
  const savedPos = JSON.parse(localStorage.getItem('fuelops_refresh_pos') || 'null');
  if (savedPos) {
    btn.style.left = savedPos.x + 'px';
    btn.style.top = savedPos.y + 'px';
    btn.style.right = 'auto';
    btn.style.bottom = 'auto';
  } else {
    btn.style.right = '16px';
    btn.style.bottom = '100px';
  }
  
  let isDragging = false;
  let startX, startY, initialLeft, initialTop;
  
  btn.addEventListener('pointerdown', (e)=>{
    isDragging = false;
    startX = e.clientX;
    startY = e.clientY;
    const rect = btn.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;
    btn.setPointerCapture(e.pointerId);
    btn.style.cursor = 'grabbing';
  });
  
  btn.addEventListener('pointermove', (e)=>{
    if (startX === undefined) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) isDragging = true;
    if (isDragging) {
      btn.style.left = (initialLeft + dx) + 'px';
      btn.style.top = (initialTop + dy) + 'px';
      btn.style.right = 'auto';
      btn.style.bottom = 'auto';
    }
  });
  
  btn.addEventListener('pointerup', (e)=>{
    btn.style.cursor = 'grab';
    if (isDragging) {
      localStorage.setItem('fuelops_refresh_pos', JSON.stringify({
        x: parseInt(btn.style.left),
        y: parseInt(btn.style.top)
      }));
      e.preventDefault();
      setTimeout(()=>{ isDragging = false; startX = undefined; }, 100);
      return;
    }
    // Click - refresh
    startX = undefined;
    doRefresh();
  });
  
  // Prevent click after drag
  btn.addEventListener('click', (e)=>{
    if (isDragging) {
      e.preventDefault();
      e.stopPropagation();
    }
  });
  
  document.body.appendChild(btn);
}

function removeFloatingRefresh() {
  document.getElementById('floatingRefresh')?.remove();
}

function doRefresh() {
  const btn = document.getElementById('floatingRefresh');
  if (btn) {
    btn.style.transform = 'rotate(360deg)';
    setTimeout(()=> btn.style.transform = '', 500);
  }
  // Trigger hashchange to reload current view
  const currentHash = location.hash;
  // Force reload of current view
  if (window.dispatchEvent) {
    // Simple page reload of data
    location.reload();
  }
}

function renderBottomNav(role) {
  let items = [];
  if (role === 'super_admin') {
    items = [
      { path: '#/dashboard', icon: '🏠', label: 'Home' },
      { path: '#/super-admin', icon: '👑', label: 'Invite' },
      { path: '#/stations', icon: '⛽', label: 'Stations' },
      { path: '#/reports', icon: '📊', label: 'Reports' },
      { path: '#/settings', icon: '⚙️', label: 'More' },
    ];
  } else if (['owner','admin','manager'].includes(role)) {
    items = [
      { path: '#/dashboard', icon: '🏠', label: 'Home' },
      { path: '#/pumps', icon: '⛽', label: 'Pumps' },
      { path: '#/shifts', icon: '🧾', label: 'Shifts' },
      { path: '#/reports', icon: '📊', label: 'Reports' },
      { path: '#/settings', icon: '⚙️', label: 'More' },
    ];
  } else {
    // attendant simplified
    items = [
      { path: '#/dashboard', icon: '🏠', label: 'Home' },
      { path: '#/pumps', icon: '⛽', label: 'My Pumps' },
      { path: '#/shifts', icon: '🧾', label: 'My Shift' },
      { path: '#/reports', icon: '📝', label: 'Notes' },
      { path: '#/settings', icon: '⚙️', label: 'More' },
    ];
  }
  const currentHash = location.hash || '#/dashboard';
  bottomNav.innerHTML = items.map(it=>{
    const active = currentHash.startsWith(it.path) ? 'active' : '';
    return `<a href="${it.path}" class="nav-item ${active}"><span class="ico">${it.icon}</span><span>${it.label}</span></a>`;
  }).join('');
}

document.getElementById('logoutTop')?.addEventListener('click', async ()=>{
  await logout();
  location.hash = '#/login';
});

document.getElementById('refreshTop')?.addEventListener('click', ()=>{
  const btn = document.getElementById('refreshTop');
  if (btn) {
    btn.textContent = '⟳';
    setTimeout(()=> btn.textContent = '↻', 800);
  }
  location.reload();
});

bootstrap();

// Handle GitHub Pages 404 fallback: if we land on /fuelstation/ without hash, go to dashboard or login
if (!location.hash) {
  const state = getState();
  if (state.user) location.hash = '#/dashboard';
  else location.hash = '#/login';
}
