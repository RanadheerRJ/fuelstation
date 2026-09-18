// Testable core for the station-data purge tool.
//
// The purge must run through the Firebase Admin SDK (it bypasses Firestore
// Security Rules, which intentionally make stations/prices/shifts/transactions
// append-only for every client role). This module keeps all decision logic
// dependency-free so it can be unit tested without a database: the `db`
// argument mirrors the small firebase-admin surface the CLI passes in:
//
//   db.listCollections()                     -> [{ id }, ...]
//   db.collection(id).listDocuments()         -> [DocumentReference, ...]
//   db.collection(id).get()                   -> { docs: [{ id, data(), ref }] }
//   db.batch()                                -> { delete(ref), update(ref, patch), commit() }

export const USERS_COLLECTION = 'users';
export const MAX_BATCH_OPS = 500; // Firestore WriteBatch hard limit

export function chunk(items, size) {
  if (!Number.isInteger(size) || size < 1) {
    throw new Error('chunk size must be a positive integer');
  }
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Parse CLI arguments.
 * Returns { apply, yes, keepStationIds, key, project, help, errors: string[] }
 */
export function parseArgs(argv) {
  const opts = {
    apply: false,
    yes: false,
    keepStationIds: false,
    key: null,
    project: null,
    help: false,
    errors: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') {
      opts.apply = true;
    } else if (arg === '--dry-run') {
      opts.apply = false;
    } else if (arg === '--yes' || arg === '-y') {
      opts.yes = true;
    } else if (arg === '--keep-station-ids') {
      opts.keepStationIds = true;
    } else if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg === '--key' || arg === '--project') {
      const value = argv[++i];
      if (!value) {
        opts.errors.push(`${arg} requires a value`);
      } else if (arg === '--key') {
        opts.key = value;
      } else {
        opts.project = value;
      }
    } else {
      opts.errors.push(`unknown argument: ${arg}`);
    }
  }
  return opts;
}

async function listCollectionNames(db) {
  const collections = await db.listCollections();
  return collections.map(c => c.id).sort();
}

function userProfilesNeedingStationReset(userDocs) {
  // Only touch profiles that actually reference stations. A profile without a
  // stationIds field (or with an empty one) is left byte-for-byte untouched.
  return userDocs.filter(doc => {
    const data = doc.data();
    return Array.isArray(data.stationIds) && data.stationIds.length > 0;
  });
}

/**
 * Execute the purge against a firebase-admin-compatible `db`.
 *
 * - Deletes EVERY document in every top-level collection except `users`.
 * - Keeps all `users` profile documents, but resets `stationIds` to [] so
 *   profiles carry no dangling station references (unless keepStationIds).
 * - With apply=false this is a dry run: nothing is written, only counted.
 *
 * Returns { dryRun, deleted: { [collection]: count }, usersKept,
 *           usersStationIdsReset, batches }
 */
export async function executePurge(db, { apply = false, keepStationIds = false } = {}) {
  const names = await listCollectionNames(db);
  const dataCollections = names.filter(name => name !== USERS_COLLECTION);
  const hasUsers = names.includes(USERS_COLLECTION);

  const userDocs = hasUsers ? (await db.collection(USERS_COLLECTION).get()).docs : [];

  const results = {
    dryRun: !apply,
    deleted: {},
    usersKept: userDocs.length,
    usersStationIdsReset: 0,
    batches: 0,
  };

  if (!apply) {
    for (const name of dataCollections) {
      const refs = await db.collection(name).listDocuments();
      results.deleted[name] = refs.length;
    }
    results.usersStationIdsReset = keepStationIds
      ? 0
      : userProfilesNeedingStationReset(userDocs).length;
    return results;
  }

  for (const name of dataCollections) {
    const refs = await db.collection(name).listDocuments();
    let deleted = 0;
    for (const part of chunk(refs, MAX_BATCH_OPS)) {
      const batch = db.batch();
      part.forEach(ref => batch.delete(ref));
      await batch.commit();
      results.batches += 1;
      deleted += part.length;
    }
    results.deleted[name] = deleted;
  }

  if (!keepStationIds) {
    const toReset = userProfilesNeedingStationReset(userDocs);
    for (const part of chunk(toReset, MAX_BATCH_OPS)) {
      const batch = db.batch();
      part.forEach(doc => batch.update(doc.ref, { stationIds: [] }));
      await batch.commit();
      results.batches += 1;
      results.usersStationIdsReset += part.length;
    }
  }

  return results;
}

/**
 * Post-purge verification. Returns { [collection]: remainingDocCount } for
 * every non-users collection plus a `__usersStationRefs` count of user
 * profiles still referencing station IDs.
 */
export async function verifyPurge(db, { keepStationIds = false } = {}) {
  const names = await listCollectionNames(db);
  const remaining = {};
  let danglingUserStationRefs = 0;

  for (const name of names) {
    if (name === USERS_COLLECTION) {
      if (!keepStationIds) {
        const userDocs = (await db.collection(USERS_COLLECTION).get()).docs;
        danglingUserStationRefs = userProfilesNeedingStationReset(userDocs).length;
      }
      continue;
    }
    const refs = await db.collection(name).listDocuments();
    remaining[name] = refs.length;
  }
  remaining.__usersStationRefs = danglingUserStationRefs;
  return remaining;
}
