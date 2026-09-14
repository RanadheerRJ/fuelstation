// ============================================================================
// Firestore security rules test suite
//
// STATUS: written but NOT executed in the build sandbox — the Firestore
// emulator JAR is downloaded from storage.googleapis.com, which is blocked
// there. Run this locally or in CI before deploying the rules.
//
//   npm install --no-save @firebase/rules-unit-testing firebase-tools
//   npx firebase emulators:exec --only firestore \
//       --project fuelops-test "node tests/firestore-rules.test.mjs"
//
// Requires Java 11+ on PATH (the emulator is a JVM process).
// ============================================================================

import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs,
} from 'firebase/firestore';

const PROJECT_ID = 'fuelops-test';

let passed = 0, failed = 0;
async function it(name, fn) {
  try { await fn(); passed++; console.log('  PASS', name); }
  catch (e) { failed++; console.log('  FAIL', name, '\n        ', e.message); }
}

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8085 },
});

// ---------------------------------------------------------------- fixtures

const USERS = {
  superAdmin: { uid: 'sa',   role: 'super_admin', stationIds: [],     status: 'active', name: 'SA' },
  ownerA:     { uid: 'ownA', role: 'owner',       stationIds: ['A'],  status: 'active', name: 'Owner A' },
  adminA:     { uid: 'admA', role: 'admin',       stationIds: ['A'],  status: 'active', name: 'Admin A' },
  managerA:   { uid: 'mgrA', role: 'manager',     stationIds: ['A'],  status: 'active', name: 'Mgr A' },
  attA:       { uid: 'attA', role: 'attendant',   stationIds: ['A'],  status: 'active', name: 'Att A' },
  attA2:      { uid: 'attA2',role: 'attendant',   stationIds: ['A'],  status: 'active', name: 'Att A2' },
  attB:       { uid: 'attB', role: 'attendant',   stationIds: ['B'],  status: 'active', name: 'Att B' },
  disabled:   { uid: 'dis',  role: 'attendant',   stationIds: ['A'],  status: 'disabled', name: 'Gone' },
};

async function seed() {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const u of Object.values(USERS)) await setDoc(doc(db, 'users', u.uid), u);
    await setDoc(doc(db, 'stations', 'A'), { name: 'Station A', ownerId: 'ownA', status: 'active' });
    await setDoc(doc(db, 'stations', 'B'), { name: 'Station B', ownerId: 'ownB', status: 'active' });
    await setDoc(doc(db, 'prices', 'prA'), { stationId: 'A', fuelType: 'petrol', price: 100, effectiveFrom: '2020-01-01T00:00:00Z', effectiveTo: null });
    await setDoc(doc(db, 'nozzles', 'nA1'), { stationId: 'A', pumpId: 'pA1', fuelType: 'petrol', lastReading: 1000 });
    await setDoc(doc(db, 'pumps', 'pA1'), { stationId: 'A', name: 'P1', number: 1 });
    // Active shift owned by attA
    await setDoc(doc(db, 'shifts', 'shA'), {
      stationId: 'A', userId: 'attA', employeeName: 'Att A', status: 'ACTIVE',
      startTime: '2026-01-01T00:00:00Z', nozzles: [], totals: {},
    });
    // Approved shift owned by attA
    await setDoc(doc(db, 'shifts', 'shApproved'), {
      stationId: 'A', userId: 'attA', status: 'APPROVED', approvedBy: 'mgrA',
      startTime: '2026-01-01T00:00:00Z', nozzles: [], totals: { netRevenue: 1000 },
    });
    // Shift in station B
    await setDoc(doc(db, 'shifts', 'shB'), {
      stationId: 'B', userId: 'attB', status: 'ACTIVE', startTime: '2026-01-01T00:00:00Z', nozzles: [], totals: {},
    });
    await setDoc(doc(db, 'transactions', 'txA'), { stationId: 'A', shiftId: 'shA', type: 'expense', amount: 250, createdBy: 'attA' });
    await setDoc(doc(db, 'auditLogs', 'lg1'), { stationId: 'A', actorUserId: 'mgrA', action: 'SHIFT_APPROVED' });
  });
}

const as = (u) => testEnv.authenticatedContext(u.uid).firestore();
const anon = () => testEnv.unauthenticatedContext().firestore();

// ------------------------------------------------------------------- tests

console.log('\n=== Unauthenticated access ===');
await seed();
await it('anonymous cannot read stations', async () => {
  await assertFails(getDoc(doc(anon(), 'stations', 'A')));
});
await it('anonymous cannot read shifts', async () => {
  await assertFails(getDoc(doc(anon(), 'shifts', 'shA')));
});
await it('anonymous cannot write a shift', async () => {
  await assertFails(setDoc(doc(anon(), 'shifts', 'evil'), { stationId: 'A', status: 'ACTIVE' }));
});

console.log('\n=== Station isolation (Step 2) ===');
await it('station B attendant cannot read station A shift', async () => {
  await assertFails(getDoc(doc(as(USERS.attB), 'shifts', 'shA')));
});
await it('station B attendant cannot read station A station doc', async () => {
  await assertFails(getDoc(doc(as(USERS.attB), 'stations', 'A')));
});
await it('station B attendant cannot read station A transactions', async () => {
  await assertFails(getDoc(doc(as(USERS.attB), 'transactions', 'txA')));
});
await it('station A attendant CAN read their own station shift', async () => {
  await assertSucceeds(getDoc(doc(as(USERS.attA), 'shifts', 'shA')));
});
await it('attendant cannot create a shift in another station', async () => {
  await assertFails(setDoc(doc(as(USERS.attB), 'shifts', 'x1'),
    { stationId: 'A', userId: 'attB', status: 'ACTIVE' }));
});
await it('attendant cannot move their shift to another station', async () => {
  await assertFails(updateDoc(doc(as(USERS.attA), 'shifts', 'shA'), { stationId: 'B' }));
});
await it('super admin can read across stations', async () => {
  await assertSucceeds(getDoc(doc(as(USERS.superAdmin), 'shifts', 'shB')));
});

console.log('\n=== Disabled accounts ===');
await it('disabled user cannot read', async () => {
  await assertFails(getDoc(doc(as(USERS.disabled), 'shifts', 'shA')));
});
await it('disabled user cannot write', async () => {
  await assertFails(setDoc(doc(as(USERS.disabled), 'shifts', 'x2'),
    { stationId: 'A', userId: 'dis', status: 'ACTIVE' }));
});

console.log('\n=== Shift ownership and lifecycle (Step 4) ===');
await it('attendant cannot approve their own shift', async () => {
  await assertFails(updateDoc(doc(as(USERS.attA), 'shifts', 'shA'),
    { status: 'APPROVED', approvedBy: 'attA' }));
});
await it('attendant cannot set approvedBy', async () => {
  await assertFails(updateDoc(doc(as(USERS.attA), 'shifts', 'shA'), { approvedBy: 'mgrA' }));
});
await it('attendant cannot edit another attendant shift', async () => {
  await assertFails(updateDoc(doc(as(USERS.attA2), 'shifts', 'shA'), { totals: { netRevenue: 1 } }));
});
await it('attendant cannot edit an APPROVED shift', async () => {
  await assertFails(updateDoc(doc(as(USERS.attA), 'shifts', 'shApproved'), { totals: { netRevenue: 0 } }));
});
await it('attendant CAN submit their own ACTIVE shift', async () => {
  await assertSucceeds(updateDoc(doc(as(USERS.attA), 'shifts', 'shA'),
    { status: 'PENDING_REVIEW', totals: { netRevenue: 500 } }));
});
await it('manager CAN approve a shift', async () => {
  await assertSucceeds(updateDoc(doc(as(USERS.managerA), 'shifts', 'shA'),
    { status: 'APPROVED', approvedBy: 'mgrA' }));
});
await it('attendant cannot delete a shift', async () => {
  await assertFails(deleteDoc(doc(as(USERS.attA), 'shifts', 'shApproved')));
});
await it('owner CAN delete a shift', async () => {
  await assertSucceeds(deleteDoc(doc(as(USERS.ownerA), 'shifts', 'shApproved')));
});

console.log('\n=== Role escalation (Step 3) ===');
await seed();
await it('attendant cannot grant themselves the owner role', async () => {
  await assertFails(updateDoc(doc(as(USERS.attA), 'users', 'attA'), { role: 'owner' }));
});
await it('attendant cannot add stations to their own profile', async () => {
  await assertFails(updateDoc(doc(as(USERS.attA), 'users', 'attA'), { stationIds: ['A', 'B'] }));
});
await it('attendant cannot reactivate a disabled colleague', async () => {
  await assertFails(updateDoc(doc(as(USERS.attA), 'users', 'dis'), { status: 'active' }));
});
await it('attendant CAN edit their own name', async () => {
  await assertSucceeds(updateDoc(doc(as(USERS.attA), 'users', 'attA'), { name: 'New Name' }));
});
await it('admin cannot create a super_admin', async () => {
  await assertFails(setDoc(doc(as(USERS.adminA), 'users', 'newSA'),
    { role: 'super_admin', stationIds: ['A'], status: 'active' }));
});
await it('admin CAN create an attendant', async () => {
  await assertSucceeds(setDoc(doc(as(USERS.adminA), 'users', 'newAtt'),
    { role: 'attendant', stationIds: ['A'], status: 'active', name: 'N' }));
});
await it('admin cannot modify a super_admin', async () => {
  await assertFails(updateDoc(doc(as(USERS.adminA), 'users', 'sa'), { role: 'attendant' }));
});

console.log('\n=== Stations (the old "|| true" hole) ===');
await it('attendant cannot create a station', async () => {
  await assertFails(setDoc(doc(as(USERS.attA), 'stations', 'evil'),
    { name: 'Evil', ownerId: 'attA' }));
});
await it('manager cannot create a station', async () => {
  await assertFails(setDoc(doc(as(USERS.managerA), 'stations', 'evil2'),
    { name: 'Evil', ownerId: 'mgrA' }));
});
await it('owner CAN create a station they own', async () => {
  await assertSucceeds(setDoc(doc(as(USERS.ownerA), 'stations', 'newSt'),
    { name: 'New', ownerId: 'ownA', status: 'active' }));
});
await it('owner cannot create a station owned by someone else', async () => {
  await assertFails(setDoc(doc(as(USERS.ownerA), 'stations', 'newSt2'),
    { name: 'New', ownerId: 'someoneElse' }));
});
await it('admin cannot reassign station ownership', async () => {
  await assertFails(updateDoc(doc(as(USERS.adminA), 'stations', 'A'), { ownerId: 'admA' }));
});
await it('attendant cannot delete a station', async () => {
  await assertFails(deleteDoc(doc(as(USERS.attA), 'stations', 'A')));
});

console.log('\n=== Prices (Step 9: history must stay explainable) ===');
await it('attendant cannot change a price', async () => {
  await assertFails(setDoc(doc(as(USERS.attA), 'prices', 'evilPrice'),
    { stationId: 'A', fuelType: 'petrol', price: 1, effectiveFrom: '2026-01-01T00:00:00Z' }));
});
await it('manager CAN add a price', async () => {
  await assertSucceeds(setDoc(doc(as(USERS.managerA), 'prices', 'prA2'),
    { stationId: 'A', fuelType: 'petrol', price: 110, effectiveFrom: '2026-02-01T00:00:00Z', effectiveTo: null }));
});
await it('nobody can rewrite a historical price amount', async () => {
  await assertFails(updateDoc(doc(as(USERS.managerA), 'prices', 'prA'), { price: 5 }));
});
await it('manager CAN close a price with effectiveTo', async () => {
  await assertSucceeds(updateDoc(doc(as(USERS.managerA), 'prices', 'prA'),
    { effectiveTo: '2026-02-01T00:00:00Z' }));
});
await it('price documents cannot be deleted', async () => {
  await assertFails(deleteDoc(doc(as(USERS.ownerA), 'prices', 'prA')));
});

console.log('\n=== Nozzles ===');
await it('attendant CAN bump lastReading', async () => {
  await assertSucceeds(updateDoc(doc(as(USERS.attA), 'nozzles', 'nA1'), { lastReading: 1200 }));
});
await it('attendant cannot change fuelType', async () => {
  await assertFails(updateDoc(doc(as(USERS.attA), 'nozzles', 'nA1'), { fuelType: 'diesel' }));
});
await it('attendant cannot move a nozzle to another station', async () => {
  await assertFails(updateDoc(doc(as(USERS.attA), 'nozzles', 'nA1'), { stationId: 'B' }));
});
await it('attendant cannot create a nozzle', async () => {
  await assertFails(setDoc(doc(as(USERS.attA), 'nozzles', 'nEvil'),
    { stationId: 'A', pumpId: 'pA1', fuelType: 'petrol' }));
});

console.log('\n=== Nozzle locks (Step 10) ===');
await it('attendant CAN claim a lock in their station', async () => {
  await assertSucceeds(setDoc(doc(as(USERS.attA), 'nozzleLocks', 'nA1'),
    { nozzleId: 'nA1', shiftId: 'shA', stationId: 'A', userId: 'attA' }));
});
await it('attendant from another station cannot claim it', async () => {
  await assertFails(setDoc(doc(as(USERS.attB), 'nozzleLocks', 'nA1'),
    { nozzleId: 'nA1', shiftId: 'shB', stationId: 'A', userId: 'attB' }));
});
await it('a different attendant cannot steal the lock', async () => {
  await assertFails(deleteDoc(doc(as(USERS.attA2), 'nozzleLocks', 'nA1')));
});
await it('the holder CAN release their own lock', async () => {
  await assertSucceeds(deleteDoc(doc(as(USERS.attA), 'nozzleLocks', 'nA1')));
});

console.log('\n=== Audit logs (Step 12) ===');
await seed();
await it('attendant cannot read audit logs', async () => {
  await assertFails(getDoc(doc(as(USERS.attA), 'auditLogs', 'lg1')));
});
await it('manager CAN read audit logs for their station', async () => {
  await assertSucceeds(getDoc(doc(as(USERS.managerA), 'auditLogs', 'lg1')));
});
await it('audit entries cannot be modified', async () => {
  await assertFails(updateDoc(doc(as(USERS.ownerA), 'auditLogs', 'lg1'), { action: 'NOTHING' }));
});
await it('audit entries cannot be deleted, even by the owner', async () => {
  await assertFails(deleteDoc(doc(as(USERS.ownerA), 'auditLogs', 'lg1')));
});
await it('a user cannot forge an entry attributed to someone else', async () => {
  await assertFails(setDoc(doc(as(USERS.attA), 'auditLogs', 'forged'),
    { stationId: 'A', actorUserId: 'mgrA', action: 'SHIFT_APPROVED' }));
});
await it('a user CAN append an entry for themselves', async () => {
  await assertSucceeds(setDoc(doc(as(USERS.attA), 'auditLogs', 'mine'),
    { stationId: 'A', actorUserId: 'attA', action: 'EXPENSE_ADDED' }));
});

console.log('\n=== Transactions ===');
await it('attendant cannot record a negative amount', async () => {
  await assertFails(setDoc(doc(as(USERS.attA), 'transactions', 'neg'),
    { stationId: 'A', type: 'expense', amount: -100, createdBy: 'attA' }));
});
await it('attendant cannot attribute a transaction to someone else', async () => {
  await assertFails(setDoc(doc(as(USERS.attA), 'transactions', 'spoof'),
    { stationId: 'A', type: 'expense', amount: 10, createdBy: 'mgrA' }));
});
await it('attendant CAN record their own expense', async () => {
  await assertSucceeds(setDoc(doc(as(USERS.attA), 'transactions', 'mineTx'),
    { stationId: 'A', shiftId: 'shA', type: 'expense', amount: 250, createdBy: 'attA' }));
});
await it('attendant cannot delete a transaction', async () => {
  await assertFails(deleteDoc(doc(as(USERS.attA), 'transactions', 'txA')));
});

console.log('\n=== Unmodelled collections are denied ===');
await it('writing to an unknown collection fails', async () => {
  await assertFails(setDoc(doc(as(USERS.ownerA), 'somethingElse', 'x'), { a: 1 }));
});

await testEnv.cleanup();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
