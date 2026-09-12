// FuelOps Main App
import { initFirebase, getIsDemo, getFirebaseStatus } from './firebase.js';
import { getState, subscribe } from './state.js';
import { initRouter, registerRoute, navigate } from './router.js';
import { loginView } from './views/login.js';
import { dashboardView } from './views/dashboard.js';
import { stationsView } from './views/stations.js';
import { pumpsView } from './views/pumps.js';
import { employeesView } from './views/employees.js';
import { pricesView } from './views/prices.js';
import { shiftsListView, startShiftView, shiftDetailView, closeShiftView } from './views/shifts.js';
import { reportsView, auditView } from './views/reports.js';
import { settingsView } from './views/settings.js';
import { logout } from './auth.js';

const appRoot = document.getElementById('appRoot');
const bottomNav = document.getElementById('bottomNav');
const topbar = document.getElementById('topbar');
const offlineBanner = document.getElementById('offlineBanner');
const stationBadge = document.getElementById('stationBadge');
const logoutTop = document.getElementById('logoutTop');

async function bootstrap() {
  await initFirebase();
  console.log('[FuelOps] Firebase status', getFirebaseStatus());

  // Register routes (hash based)
  registerRoute('/login', loginView);
  registerRoute('/dashboard', dashboardView);
  registerRoute('/stations', stationsView);
  registerRoute('/pumps', pumpsView);
  registerRoute('/employees', employeesView);
  registerRoute('/prices', pricesView);
  registerRoute('/shifts', shiftsListView);
  registerRoute('/shifts/start', startShiftView);
  registerRoute('/shifts/:id', shiftDetailView);
  registerRoute('/shifts/:id/close', closeShiftView);
  registerRoute('/reports', reportsView);
  registerRoute('/reports/audit', auditView);
  registerRoute('/settings', settingsView);
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
    stationBadge.style.display = 'inline-flex';
    // station badge
    const { currentStationId } = state;
    if (currentStationId) {
      stationBadge.textContent = `📍 ${currentStationId.slice(0,6)}`;
    } else {
      stationBadge.textContent = 'No station';
    }
    renderBottomNav(state.user.role);
  } else {
    topbar.style.display = 'none';
    bottomNav.style.display = 'none';
    logoutTop.style.display = 'none';
    stationBadge.style.display = 'none';
  }
}

function renderBottomNav(role) {
  let items = [];
  if (['owner','admin','manager'].includes(role)) {
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

bootstrap();

// Handle GitHub Pages 404 fallback: if we land on /fuelstation/ without hash, go to dashboard or login
if (!location.hash) {
  const state = getState();
  if (state.user) location.hash = '#/dashboard';
  else location.hash = '#/login';
}
