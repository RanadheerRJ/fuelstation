#!/usr/bin/env node
// FuelOps — Purge all station data from Firestore, keeping user profiles.
//
// Deletes EVERY document in every top-level collection except `users`
// (stations, pumps, nozzles, prices, tankStocks, shifts, transactions,
// notes, assignments, settlements, auditLogs, and anything else it finds).
// User profile documents are kept; their `stationIds` array is reset to []
// so no profile references a deleted station.
//
// This tool talks to Firestore through the Admin SDK, which bypasses the
// Security Rules — by design, the rules make financial/history collections
// append-only for every client role, so a reset can only be done by the
// project owner from a trusted environment.
//
// Usage:
//   node scripts/purge-station-data.mjs                 # dry run (default)
//   node scripts/purge-station-data.mjs --apply         # interactive confirm
//   node scripts/purge-station-data.mjs --apply --yes   # no prompt (non-TTY)
//
// Credentials (pick one):
//   --key /path/to/service-account.json
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
//   (logged-in gcloud ADC also works)
//
// Project ID resolution: --project flag > FIRESTORE_PROJECT_ID / GCLOUD_PROJECT
// env > projectId parsed from js/firebase-config.js.
//
// Firestore emulator: set FIRESTORE_EMULATOR_HOST (no credentials needed).
//
// Safety: ALWAYS dry-run first. Deletion is irreversible. See
// docs/DATA_RESET.md for the full walkthrough.

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import readline from 'node:readline/promises';

import { parseArgs, executePurge, verifyPurge } from './lib/purge-core.mjs';

const HELP = `FuelOps station-data purge — keeps user profiles, deletes everything else

Usage:
  npm run purge:station-data                     dry run (default, deletes nothing)
  npm run purge:station-data -- --apply          purge after interactive confirm
  npm run purge:station-data -- --apply --yes    purge without prompt (non-interactive)

Options:
  --dry-run             count only, delete nothing (default)
  --apply               actually delete the data
  --yes, -y             skip the interactive confirmation prompt
  --keep-station-ids    do NOT reset users.stationIds to [] (dangling refs stay)
  --key <path>          Firebase service account key JSON
  --project <id>        Firestore project ID (default: from js/firebase-config.js)
  -h, --help            show this help

Credentials: --key, GOOGLE_APPLICATION_CREDENTIALS, or gcloud ADC.
Emulator:    set FIRESTORE_EMULATOR_HOST (e.g. localhost:8080).`;

function readProjectIdFromAppConfig() {
  try {
    const src = readFileSync(new URL('../js/firebase-config.js', import.meta.url), 'utf8');
    const match = src.match(/projectId:\s*["']([^"']+)["']/);
    if (match) return match[1];
  } catch {
    /* fall through to caller's error handling */
  }
  return null;
}

function adcFileExists() {
  return existsSync(join(homedir(), '.config', 'gcloud', 'application_default_credentials.json'));
}

async function confirmDestructive(projectId) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      `\n⚠️  This will PERMANENTLY DELETE all station data in project "${projectId}".\n` +
      `    User profiles are kept (stationIds reset to []).\n` +
      `    Type PURGE to continue (anything else aborts): `,
    );
    return answer.trim() === 'PURGE';
  } finally {
    rl.close();
  }
}

function printSummary(results) {
  const deletedEntries = Object.entries(results.deleted);
  if (!deletedEntries.length) {
    console.log('  (no data collections found — nothing to delete)');
  }
  for (const [name, count] of deletedEntries) {
    console.log(`  ${results.dryRun ? 'would delete' : 'deleted   '} ${String(count).padStart(6)}  ${name}`);
  }
  console.log(`  kept         ${String(results.usersKept).padStart(6)}  users (profiles preserved)`);
  console.log(`  ${results.dryRun ? 'would reset' : 'reset      '} ${String(results.usersStationIdsReset).padStart(6)}  users.stationIds -> []`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    console.log(HELP);
    return 0;
  }
  if (opts.errors.length) {
    console.error(`Error:\n  ${opts.errors.join('\n  ')}\n\n${HELP}`);
    return 1;
  }

  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  const projectId =
    opts.project ||
    process.env.FIRESTORE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    readProjectIdFromAppConfig();

  if (!projectId) {
    console.error(
      'Error: could not determine the Firestore project ID.\n' +
      'Pass --project <id> or set FIRESTORE_PROJECT_ID.',
    );
    return 1;
  }

  // ---- Initialize Admin SDK -------------------------------------------------
  // Note: in firebase-admin v12, `cert` / `applicationDefault` are direct
  // exports of 'firebase-admin/app' (not nested under a `credential` object).
  const { initializeApp, cert, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');

  let app;
  let credSource;
  if (emulatorHost) {
    app = initializeApp({ projectId });
    credSource = `emulator (${emulatorHost})`;
  } else if (opts.key) {
    if (!existsSync(opts.key)) {
      console.error(`Error: --key file not found: ${opts.key}`);
      return 1;
    }
    let keyJson;
    try {
      keyJson = JSON.parse(readFileSync(opts.key, 'utf8'));
    } catch (e) {
      console.error(`Error: could not parse --key JSON: ${e.message}`);
      return 1;
    }
    if (keyJson.type !== 'service_account') {
      console.error(
        `Error: ${opts.key} does not look like a Firebase service account key\n` +
        '(expected "type": "service_account"). See docs/DATA_RESET.md.',
      );
      return 1;
    }
    app = initializeApp({
      projectId: keyJson.project_id || projectId,
      credential: cert(keyJson),
    });
    credSource = `service account key (${opts.key})`;
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS || adcFileExists()) {
    app = initializeApp({ projectId, credential: applicationDefault() });
    credSource = 'application default credentials';
  } else {
    console.error(
      'Error: no Firebase credentials found.\n\n' +
      'How to fix (one of):\n' +
      '  1. --key /path/to/service-account.json\n' +
      '  2. export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json\n' +
      '  3. gcloud auth application-default login\n\n' +
      'Generate a service account key:\n' +
      '  Firebase console → Project settings → Service accounts →\n' +
      '  Generate new private key. KEEP THE KEY FILE OUT OF THIS REPO.\n' +
      'Full walkthrough: docs/DATA_RESET.md',
    );
    return 1;
  }

  console.log('FuelOps station-data purge');
  console.log(`  project    : ${projectId}`);
  console.log(`  credentials: ${credSource}`);
  console.log(`  mode       : ${opts.apply ? 'APPLY (destructive)' : 'DRY RUN (no writes)'}`);
  console.log('');

  // ---- Guard rails ----------------------------------------------------------
  if (opts.apply && !opts.yes) {
    if (!process.stdin.isTTY) {
      console.error('Error: --apply in a non-interactive session requires --yes.');
      return 1;
    }
    const ok = await confirmDestructive(projectId);
    if (!ok) {
      console.log('Aborted — nothing was deleted.');
      return 0;
    }
  }

  // ---- Run ------------------------------------------------------------------
  const db = getFirestore(app);

  const results = await executePurge(db, {
    apply: opts.apply,
    keepStationIds: opts.keepStationIds,
  });

  printSummary(results);

  if (results.dryRun) {
    console.log('\nDry run complete — nothing was deleted.');
    console.log('To perform the purge: npm run purge:station-data -- --apply');
    return 0;
  }

  // ---- Verify ---------------------------------------------------------------
  const remaining = await verifyPurge(db, { keepStationIds: opts.keepStationIds });
  const leftovers = Object.entries(remaining).filter(([, count]) => count > 0);
  if (leftovers.length) {
    console.error('\n⚠️  Verification found leftovers:');
    for (const [name, count] of leftovers) {
      console.error(`  ${name}: ${count} document(s) still present`);
    }
    console.error('Re-run the purge to retry.');
    return 1;
  }

  console.log('\n✅ Purge verified — all station data removed, user profiles kept.');
  console.log('   (Firebase Auth accounts are untouched; only Firestore documents were changed.)');
  return 0;
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().then(
    code => process.exit(code),
    err => {
      console.error('\nPurge failed:', err?.message || err);
      process.exit(1);
    },
  );
}
