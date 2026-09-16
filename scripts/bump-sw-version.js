#!/usr/bin/env node
// Stamps service-worker.js with a fresh cache-busting version on every build/deploy.
//
// Why this exists:
//   The PWA service worker caches the app shell (HTML/JS/CSS). Browsers only
//   fetch a NEW service-worker.js if its bytes differ from what they already
//   have cached. If CACHE_NAME never changes, old clients keep the old code
//   forever. This script computes a hash of all app-shell source files and
//   writes it into service-worker.js as CACHE_NAME, so every commit that
//   touches app code automatically produces a different service-worker.js
//   file, guaranteeing the browser notices and fetches it.
//
// Usage: node scripts/bump-sw-version.js
// Run automatically by .github/workflows/deploy.yml before each Pages deploy.
// Also safe to run locally before testing - re-run whenever you change files.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SW_PATH = path.join(ROOT, 'service-worker.js');

// Recursively collect files that make up the app shell (mirrors APP_SHELL list intent,
// but we just hash everything under js/, css/, plus index.html + manifest.json so any
// content change anywhere bumps the version - simplest and safest).
function collectFiles(dir, exts, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, exts, out);
    } else if (exts.some(e => entry.name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

function computeBuildVersion() {
  const files = [
    path.join(ROOT, 'index.html'),
    path.join(ROOT, 'manifest.json'),
    ...collectFiles(path.join(ROOT, 'js'), ['.js']),
    ...collectFiles(path.join(ROOT, 'css'), ['.css']),
  ].sort();

  const hash = crypto.createHash('sha256');
  for (const f of files) {
    hash.update(f);
    hash.update(fs.readFileSync(f));
  }
  // Short hash + date prefix - human readable in devtools, still unique per content change
  const short = hash.digest('hex').slice(0, 10);
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${date}-${short}`;
}

function main() {
  const version = computeBuildVersion();
  let sw = fs.readFileSync(SW_PATH, 'utf8');

  if (!sw.includes('__BUILD_VERSION__') && !/const CACHE_NAME = 'fuelops-/.test(sw)) {
    console.error('[bump-sw-version] Could not find CACHE_NAME placeholder in service-worker.js');
    process.exit(1);
  }

  const updated = sw
    // First run after a fresh checkout: placeholder present
    .replace('__BUILD_VERSION__', version)
    // Subsequent local runs: replace whatever version is already stamped
    .replace(/const CACHE_NAME = 'fuelops-[^']*';/, `const CACHE_NAME = 'fuelops-${version}';`);

  fs.writeFileSync(SW_PATH, updated);
  console.log(`[bump-sw-version] service-worker.js CACHE_NAME -> fuelops-${version}`);
}

main();
