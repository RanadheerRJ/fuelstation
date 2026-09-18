// Unit tests for the station-data purge tool core.
// Runs with plain `node --test` — no Firestore emulator required.
// See scripts/lib/purge-core.mjs for the db interface these fakes implement.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseArgs,
  executePurge,
  verifyPurge,
  chunk,
  MAX_BATCH_OPS,
  USERS_COLLECTION,
} from '../scripts/lib/purge-core.mjs';

/**
 * In-memory fake of the firebase-admin Firestore surface used by the purge.
 * seed: { collectionName: [{ id, data: {...} }, ...] }
 */
function createFakeDb(seed) {
  const store = new Map(
    Object.entries(seed).map(([name, docs]) => [
      name,
      new Map(docs.map(d => [d.id, structuredClone(d.data)])),
    ]),
  );
  const state = { batchOpCounts: [], committedBatches: 0 };

  const refFor = (name, id) => ({ id, path: `${name}/${id}` });

  return {
    state,
    store,
    db: {
      listCollections: async () => [...store.keys()].map(id => ({ id })),
      collection(name) {
        return {
          listDocuments: async () =>
            [...(store.get(name)?.keys() ?? [])].map(id => refFor(name, id)),
          get: async () => ({
            docs: [...(store.get(name)?.entries() ?? [])].map(([id, data]) => ({
              id,
              data: () => data,
              ref: refFor(name, id),
            })),
          }),
        };
      },
      batch() {
        const ops = [];
        return {
          delete: ref => ops.push({ op: 'delete', ref }),
          update: (ref, patch) => ops.push({ op: 'update', ref, patch }),
          commit: async () => {
            state.batchOpCounts.push(ops.length);
            state.committedBatches += 1;
            for (const { op, ref, patch } of ops) {
              const [coll, id] = ref.path.split('/');
              const collMap = store.get(coll);
              if (!collMap) continue;
              if (op === 'delete') collMap.delete(id);
              else if (op === 'update') {
                const doc = collMap.get(id);
                if (doc) Object.assign(doc, patch);
              }
            }
          },
        };
      },
    },
  };
}

function sampleSeed() {
  return {
    users: [
      { id: 'u_super', data: { name: 'Dev', phone: '9948288169', role: 'super_admin', stationIds: [], status: 'active' } },
      { id: 'u_owner', data: { name: 'Owner', phone: '9876500001', role: 'owner', stationIds: ['s1', 's2'], status: 'active' } },
      { id: 'u_manager', data: { name: 'Manager', phone: '9876500002', role: 'manager', stationIds: ['s1'], status: 'active' } },
      { id: 'u_attendant', data: { name: 'Attendant', phone: '9876500003', role: 'attendant', status: 'active' } }, // no stationIds field
    ],
    stations: [
      { id: 's1', data: { name: 'MG Road', address: 'MG Road', ownerId: 'u_owner', status: 'active' } },
      { id: 's2', data: { name: 'Outskirts', address: 'Ring Road', ownerId: 'u_owner', status: 'active' } },
    ],
    pumps: [
      { id: 'p1', data: { stationId: 's1', name: 'Pump 1', number: 1, status: 'active' } },
      { id: 'p2', data: { stationId: 's1', name: 'Pump 2', number: 2, status: 'active' } },
    ],
    prices: [
      { id: 'pr1', data: { stationId: 's1', fuelType: 'petrol', price: 104.5, effectiveFrom: '2026-01-01', effectiveTo: null } },
    ],
    shifts: [
      { id: 'sh1', data: { stationId: 's1', userId: 'u_manager', status: 'APPROVED' } },
      { id: 'sh2', data: { stationId: 's2', userId: 'u_owner', status: 'ACTIVE' } },
    ],
    auditLogs: [
      { id: 'a1', data: { action: 'STATION_CREATED', stationId: 's1' } },
    ],
  };
}

test('chunk splits arrays correctly and enforces valid size', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 500), []);
  assert.throws(() => chunk([1], 0), /positive integer/);
  assert.equal(MAX_BATCH_OPS, 500);
});

test('parseArgs defaults to dry-run and parses all flags', () => {
  assert.deepEqual(parseArgs([]), {
    apply: false, yes: false, keepStationIds: false,
    key: null, project: null, help: false, errors: [],
  });
  assert.equal(parseArgs(['--apply']).apply, true);
  assert.equal(parseArgs(['--apply', '--dry-run']).apply, false);
  assert.equal(parseArgs(['-y']).yes, true);
  assert.equal(parseArgs(['--keep-station-ids']).keepStationIds, true);
  assert.equal(parseArgs(['--key', '/tmp/k.json']).key, '/tmp/k.json');
  assert.equal(parseArgs(['--key']).errors.length, 1);
  assert.equal(parseArgs(['--project', 'x']).project, 'x');
  assert.equal(parseArgs(['--wat']).errors[0], 'unknown argument: --wat');
  assert.equal(parseArgs(['--help']).help, true);
});

test('dry run reports counts without touching any data', async () => {
  const { db, store } = createFakeDb(sampleSeed());
  const before = JSON.stringify([...store.entries()]);

  const results = await executePurge(db, { apply: false });

  assert.equal(results.dryRun, true);
  assert.deepEqual(results.deleted, {
    auditLogs: 1, prices: 1, pumps: 2, shifts: 2, stations: 2,
  });
  assert.equal(results.usersKept, 4);
  // owner + manager have non-empty stationIds
  assert.equal(results.usersStationIdsReset, 2);
  assert.equal(JSON.stringify([...store.entries()]), before, 'dry run must not mutate data');
});

test('apply deletes every non-users collection and keeps user profiles', async () => {
  const { db, store } = createFakeDb(sampleSeed());

  const results = await executePurge(db, { apply: true });

  assert.equal(results.dryRun, false);
  assert.deepEqual(results.deleted, {
    auditLogs: 1, prices: 1, pumps: 2, shifts: 2, stations: 2,
  });
  assert.equal(results.usersKept, 4);

  // All data collections gone
  for (const name of ['stations', 'pumps', 'prices', 'shifts', 'auditLogs']) {
    assert.equal(store.get(name).size, 0, `${name} should be empty`);
  }

  // Users preserved with profiles intact
  const users = store.get('users');
  assert.equal(users.size, 4);
  const owner = users.get('u_owner');
  assert.equal(owner.name, 'Owner');
  assert.equal(owner.phone, '9876500001');
  assert.equal(owner.role, 'owner');
  assert.deepEqual(owner.stationIds, [], 'stationIds should be reset to []');

  // Only profiles WITH non-empty stationIds are touched
  assert.deepEqual(users.get('u_super').stationIds, []);
  assert.equal(users.get('u_attendant').stationIds, undefined,
    'profile without stationIds must not gain the field');
  assert.equal(results.usersStationIdsReset, 2);
});

test('apply with keepStationIds leaves users.stationIds untouched', async () => {
  const { db, store } = createFakeDb(sampleSeed());
  const results = await executePurge(db, { apply: true, keepStationIds: true });
  assert.equal(results.usersStationIdsReset, 0);
  assert.deepEqual(store.get('users').get('u_owner').stationIds, ['s1', 's2']);
});

test('purge works when the users collection does not exist', async () => {
  const { db, store } = createFakeDb({
    stations: [{ id: 's1', data: { name: 'Solo' } }],
  });
  const results = await executePurge(db, { apply: true });
  assert.equal(results.usersKept, 0);
  assert.equal(results.usersStationIdsReset, 0);
  assert.deepEqual(results.deleted, { stations: 1 });
  assert.equal(store.get('stations').size, 0);
});

test('purge works when the database is completely empty', async () => {
  const { db } = createFakeDb({});
  const results = await executePurge(db, { apply: true });
  assert.deepEqual(results.deleted, {});
  assert.equal(results.usersKept, 0);
});

test('batch deletes respect the 500-op WriteBatch limit', async () => {
  const bigSeed = {
    users: [{ id: 'u1', data: { name: 'U', stationIds: ['s1'] } }],
    transactions: Array.from({ length: 1203 }, (_, i) => ({
      id: `t${i}`,
      data: { stationId: 's1', amount: i },
    })),
  };
  const { db, state } = createFakeDb(bigSeed);

  const results = await executePurge(db, { apply: true });

  assert.equal(results.deleted.transactions, 1203);
  assert.deepEqual(state.batchOpCounts, [500, 500, 203, 1]); // 3 delete batches + 1 users update
  for (const count of state.batchOpCounts) {
    assert.ok(count <= MAX_BATCH_OPS, `batch of ${count} exceeds Firestore limit`);
  }
});

test('verifyPurge reports zeros after a full purge and flags leftovers before it', async () => {
  const { db } = createFakeDb(sampleSeed());

  const before = await verifyPurge(db);
  assert.deepEqual(before, {
    auditLogs: 1, prices: 1, pumps: 2, shifts: 2, stations: 2,
    __usersStationRefs: 2,
  });

  await executePurge(db, { apply: true });

  const after = await verifyPurge(db);
  assert.equal(after.__usersStationRefs, 0);
  for (const [name, count] of Object.entries(after)) {
    if (name === USERS_COLLECTION) continue;
    assert.equal(count, 0, `${name} should verify clean`);
  }
});
