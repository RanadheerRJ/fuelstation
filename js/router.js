// Hash-based router for GitHub Pages friendliness
import { getState } from './state.js';

const routes = {};

export function registerRoute(path, handler) {
  routes[path] = handler;
}

function parseHash() {
  const hash = location.hash || '#/login';
  const [pathPart, queryString] = hash.slice(1).split('?');
  const path = pathPart || '/login';
  const params = new URLSearchParams(queryString || '');
  const query = {};
  for (const [k,v] of params.entries()) query[k]=v;
  return { path, query, hash };
}

function matchRoute(path) {
  // exact match first
  if (routes[path]) return { handler: routes[path], params: {} };
  // param matching like /shifts/:id
  for (const pattern in routes) {
    if (!pattern.includes(':')) continue;
    const pParts = pattern.split('/');
    const pathParts = path.split('/');
    if (pParts.length !== pathParts.length) continue;
    let match = true;
    const params = {};
    for (let i=0;i<pParts.length;i++) {
      if (pParts[i].startsWith(':')) params[pParts[i].slice(1)] = pathParts[i];
      else if (pParts[i] !== pathParts[i]) { match = false; break; }
    }
    if (match) return { handler: routes[pattern], params };
  }
  return null;
}

export async function navigate(path) {
  if (!path.startsWith('#')) {
    location.hash = '#' + path;
  } else {
    location.hash = path;
  }
}

export function initRouter(rootEl) {
  async function handle() {
    const { path, query } = parseHash();
    const state = getState();
    const isLogin = path === '/login';
    const hasUser = !!state.user;

    // Auth guard
    if (!hasUser && !isLogin) {
      location.hash = '#/login';
      return;
    }
    if (hasUser && isLogin) {
      location.hash = '#/dashboard';
      return;
    }

    const matched = matchRoute(path);
    if (!matched) {
      rootEl.innerHTML = `<div class="container"><div class="neu-card"><h3>404</h3><p>Page not found: ${path}</p><button class="neu-btn neu-btn--primary" onclick="location.hash='#/dashboard'">Go Home</button></div></div>`;
      return;
    }
    try {
      rootEl.innerHTML = `<div class="container"><div class="empty"><div class="emoji">⛽</div><p>Loading...</p></div></div>`;
      await matched.handler({ root: rootEl, params: matched.params, query, path });
      window.scrollTo(0,0);
    } catch (e) {
      console.error(e);
      rootEl.innerHTML = `<div class="container"><div class="alert alert--danger">⚠️ ${e.message}</div><br><button class="neu-btn" onclick="history.back()">Go Back</button></div>`;
    }
  }

  window.addEventListener('hashchange', handle);
  handle();
}
