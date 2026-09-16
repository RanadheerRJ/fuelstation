import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  setLogLevel,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-fuelops';
const STATION_A = 'station-a';
const STATION_B = 'station-b';

const IDS = {
  superAdmin: 'super-admin',
  ownerA: 'owner-a',
  ownerB: 'owner-b',
  managerA: 'manager-a',
  managerB: 'manager-b',
  adminA: 'admin-a',
  attendantA: 'attendant-a',
  attendantA2: 'attendant-a2',
  attendantB: 'attendant-b',
  inactiveA: 'inactive-a',
};

let testEnv;

// Expected permission-denied assertions are intentionally numerous. Keep the
// test output focused on unexpected failures instead of SDK transport logs.
setLogLevel('silent');

function profile(name, phone, role, stationIds, status = 'active') {
  return { name, phone, role, stationIds, status, createdBy: IDS.superAdmin, createdAt: '2026-09-16T00:00:00.000Z' };
}

function station(name, ownerId, createdBy = ownerId) {
  return {
    name,
    address: `${name} address`,
    phone: '9999999999',
    status: 'active',
    ownerId,
    managerId: null,
    createdBy,
    createdAt: '2026-09-16T00:00:00.000Z',
  };
}

function zeroTotals() {
  return {
    totalLiters: 0,
    totalRevenue: 0,
    payments: { cash: 0, card: 0, upi: 0, credit: 0, other: 0 },
    totalPayments: 0,
    variance: 0,
    varianceStatus: 'BALANCED',
  };
}

function shift(stationId, userId, employeeName, status = 'ACTIVE') {
  return {
    stationId,
    userId,
    employeeName,
    startTime: '2026-09-16T01:00:00.000Z',
    status,
    nozzles: [{
      nozzleId: stationId === STATION_A ? 'nozzle-a' : 'nozzle-b',
      pumpId: stationId === STATION_A ? 'pump-a' : 'pump-b',
      fuelType: 'Petrol',
      openingReading: 100,
      closingReading: status === 'ACTIVE' ? null : 110,
      litersSold: status === 'ACTIVE' ? 0 : 10,
      price: status === 'ACTIVE' ? 0 : 100,
      revenue: status === 'ACTIVE' ? 0 : 1000,
    }],
    totals: status === 'ACTIVE' ? zeroTotals() : {
      ...zeroTotals(),
      totalLiters: 10,
      totalRevenue: 1000,
      totalPayments: 1000,
      payments: { cash: 1000, card: 0, upi: 0, credit: 0, other: 0 },
    },
    correctionRequests: [],
    ...(status === 'ACTIVE' ? {} : { endTime: '2026-09-16T02:00:00.000Z' }),
  };
}

function pump(stationId, createdBy) {
  return {
    stationId,
    name: stationId === STATION_A ? 'Pump A' : 'Pump B',
    number: 1,
    status: 'active',
    createdBy,
    createdAt: '2026-09-16T00:00:00.000Z',
  };
}

function nozzle(stationId, pumpId, createdBy) {
  return {
    stationId,
    pumpId,
    number: 1,
    fuelType: 'Petrol',
    status: 'active',
    lastReading: 100,
    createdBy,
    createdAt: '2026-09-16T00:00:00.000Z',
  };
}

function price(stationId, createdBy, effectiveTo = null) {
  return {
    stationId,
    fuelType: 'Petrol',
    price: 100,
    effectiveFrom: '2026-09-16T00:00:00.000Z',
    effectiveTo,
    createdBy,
    createdAt: '2026-09-16T00:00:00.000Z',
  };
}

function dbFor(uid) {
  return testEnv.authenticatedContext(uid).firestore();
}

function anonymousDb() {
  return testEnv.unauthenticatedContext().firestore();
}

async function seedDatabase() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const batch = writeBatch(db);
    const put = (path, value) => batch.set(doc(db, path), value);

    put(`users/${IDS.superAdmin}`, profile('Super Admin', '9000000000', 'super_admin', []));
    put(`users/${IDS.ownerA}`, profile('Owner A', '9000000001', 'owner', [STATION_A]));
    put(`users/${IDS.ownerB}`, profile('Owner B', '9000000002', 'owner', [STATION_B]));
    put(`users/${IDS.managerA}`, profile('Manager A', '9000000003', 'manager', [STATION_A]));
    put(`users/${IDS.managerB}`, profile('Manager B', '9000000004', 'manager', [STATION_B]));
    put(`users/${IDS.adminA}`, profile('Admin A', '9000000005', 'admin', [STATION_A]));
    put(`users/${IDS.attendantA}`, profile('Attendant A', '9000000006', 'attendant', [STATION_A]));
    put(`users/${IDS.attendantA2}`, profile('Attendant A2', '9000000007', 'attendant', [STATION_A]));
    put(`users/${IDS.attendantB}`, profile('Attendant B', '9000000008', 'attendant', [STATION_B]));
    put(`users/${IDS.inactiveA}`, profile('Inactive A', '9000000009', 'manager', [STATION_A], 'inactive'));

    put(`stations/${STATION_A}`, station('Station A', IDS.ownerA));
    put(`stations/${STATION_B}`, station('Station B', IDS.ownerB));

    put('pumps/pump-a', pump(STATION_A, IDS.ownerA));
    put('pumps/pump-b', pump(STATION_B, IDS.ownerB));
    put('nozzles/nozzle-a', nozzle(STATION_A, 'pump-a', IDS.ownerA));
    put('nozzles/nozzle-b', nozzle(STATION_B, 'pump-b', IDS.ownerB));
    put('prices/price-a-active', price(STATION_A, IDS.ownerA));
    put('prices/price-a-closed', price(STATION_A, IDS.ownerA, '2026-09-16T00:30:00.000Z'));
    put('prices/price-b-active', price(STATION_B, IDS.ownerB));

    put('tankStocks/tank-a', {
      stationId: STATION_A,
      fuelType: 'Petrol',
      baselineLiters: 5000,
      baselineTime: '2026-09-16T00:00:00.000Z',
      capacityLiters: 10000,
      updatedBy: IDS.ownerA,
    });
    put('tankStocks/tank-b', {
      stationId: STATION_B,
      fuelType: 'Petrol',
      baselineLiters: 5000,
      baselineTime: '2026-09-16T00:00:00.000Z',
      capacityLiters: 10000,
      updatedBy: IDS.ownerB,
    });

    put('shifts/active-a', shift(STATION_A, IDS.attendantA, 'Attendant A', 'ACTIVE'));
    put('shifts/active-a2', shift(STATION_A, IDS.attendantA2, 'Attendant A2', 'ACTIVE'));
    put('shifts/pending-a', shift(STATION_A, IDS.attendantA, 'Attendant A', 'PENDING_REVIEW'));
    put('shifts/rejected-a', shift(STATION_A, IDS.attendantA, 'Attendant A', 'REJECTED'));
    put('shifts/approved-a', shift(STATION_A, IDS.attendantA, 'Attendant A', 'APPROVED'));
    put('shifts/manager-pending-a', shift(STATION_A, IDS.managerA, 'Manager A', 'PENDING_REVIEW'));
    put('shifts/active-b', shift(STATION_B, IDS.attendantB, 'Attendant B', 'ACTIVE'));

    put('transactions/expense-a', {
      stationId: STATION_A,
      shiftId: 'active-a',
      type: 'expense',
      category: 'Testing',
      amount: 10,
      description: 'Test',
      createdBy: IDS.attendantA,
      createdAt: '2026-09-16T01:30:00.000Z',
    });
    put('transactions/expense-a2', {
      stationId: STATION_A,
      shiftId: 'active-a2',
      type: 'expense',
      category: 'Testing',
      amount: 10,
      description: 'Test',
      createdBy: IDS.attendantA2,
      createdAt: '2026-09-16T01:30:00.000Z',
    });
    put('transactions/expense-b', {
      stationId: STATION_B,
      shiftId: 'active-b',
      type: 'expense',
      category: 'Testing',
      amount: 10,
      description: 'Test',
      createdBy: IDS.attendantB,
      createdAt: '2026-09-16T01:30:00.000Z',
    });

    put('notes/note-a', {
      stationId: STATION_A,
      shiftId: 'active-a',
      userId: IDS.attendantA,
      userName: 'Attendant A',
      text: 'Own note',
      pumpId: null,
      nozzleId: null,
      createdAt: '2026-09-16T01:30:00.000Z',
    });
    put('notes/note-a2', {
      stationId: STATION_A,
      shiftId: 'active-a2',
      userId: IDS.attendantA2,
      userName: 'Attendant A2',
      text: 'Other note',
      pumpId: null,
      nozzleId: null,
      createdAt: '2026-09-16T01:30:00.000Z',
    });

    put('settlements/settlement-a', {
      stationId: STATION_A,
      staffUserId: IDS.attendantA,
      staffName: 'Attendant A',
      shiftId: 'approved-a',
      shiftIds: ['approved-a'],
      amount: 100,
      type: 'collect',
      method: 'cash',
      notes: '',
      createdBy: IDS.managerA,
      createdByName: 'Manager A',
      createdAt: '2026-09-16T03:00:00.000Z',
      status: 'completed',
    });
    put('settlements/settlement-a2', {
      stationId: STATION_A,
      staffUserId: IDS.attendantA2,
      amount: 100,
      type: 'collect',
      createdBy: IDS.managerA,
    });

    put('auditLogs/audit-a', {
      actorId: IDS.managerA,
      actorRole: 'manager',
      stationId: STATION_A,
      action: 'SHIFT_APPROVED',
      entityType: 'shift',
      entityId: 'approved-a',
      timestamp: '2026-09-16T03:00:00.000Z',
      before: {},
      after: {},
      metadata: {},
    });
    put('auditLogs/audit-b', {
      actorId: IDS.managerB,
      actorRole: 'manager',
      stationId: STATION_B,
      action: 'SHIFT_APPROVED',
      entityType: 'shift',
      entityId: 'active-b',
      timestamp: '2026-09-16T03:00:00.000Z',
      before: {},
      after: {},
      metadata: {},
    });

    put('assignments/assignment-a', { stationId: STATION_A, userId: IDS.attendantA, nozzleId: 'nozzle-a' });
    put('privateData/secret', { stationId: STATION_A, value: 'denied by default' });

    await batch.commit();
  });
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seedDatabase();
});

after(async () => {
  await testEnv.cleanup();
});

describe('authentication and station isolation', () => {
  test('denies unauthenticated and inactive users', async () => {
    await assertFails(getDoc(doc(anonymousDb(), 'stations', STATION_A)));
    await assertFails(getDoc(doc(dbFor(IDS.inactiveA), 'stations', STATION_A)));
  });

  test('allows only assigned station documents', async () => {
    await assertSucceeds(getDoc(doc(dbFor(IDS.ownerA), 'stations', STATION_A)));
    await assertFails(getDoc(doc(dbFor(IDS.ownerA), 'stations', STATION_B)));
    await assertSucceeds(getDoc(doc(dbFor(IDS.attendantA), 'stations', STATION_A)));
    await assertFails(getDoc(doc(dbFor(IDS.attendantA), 'stations', STATION_B)));
    await assertSucceeds(getDoc(doc(dbFor(IDS.superAdmin), 'stations', STATION_B)));
  });

  test('requires station-scoped queries for operational collections', async () => {
    const scoped = query(collection(dbFor(IDS.managerA), 'pumps'), where('stationId', '==', STATION_A));
    await assertSucceeds(getDocs(scoped));
    await assertFails(getDocs(collection(dbFor(IDS.managerA), 'pumps')));
  });

  test('only owner or super admin creates stations and owner cannot assign another owner', async () => {
    const ownerStation = station('New A', IDS.ownerA);
    await assertSucceeds(setDoc(doc(dbFor(IDS.ownerA), 'stations', 'new-a'), ownerStation));
    await assertFails(setDoc(doc(dbFor(IDS.managerA), 'stations', 'manager-station'), station('No', IDS.managerA)));
    await assertFails(setDoc(doc(dbFor(IDS.attendantA), 'stations', 'attendant-station'), station('No', IDS.attendantA)));
    await assertSucceeds(setDoc(doc(dbFor(IDS.superAdmin), 'stations', 'platform-station'), station('Platform', IDS.ownerB, IDS.superAdmin)));
  });

  test('prevents owner reassignment except by super admin', async () => {
    await assertFails(updateDoc(doc(dbFor(IDS.ownerA), 'stations', STATION_A), { ownerId: IDS.ownerB }));
    await assertSucceeds(updateDoc(doc(dbFor(IDS.superAdmin), 'stations', STATION_A), { ownerId: IDS.ownerB }));
  });

  test('prevents client station deletion', async () => {
    await assertFails(deleteDoc(doc(dbFor(IDS.ownerA), 'stations', STATION_A)));
    await assertFails(deleteDoc(doc(dbFor(IDS.superAdmin), 'stations', STATION_A)));
  });
});

describe('user profile security and role escalation', () => {
  test('attendant reads only their own profile', async () => {
    await assertSucceeds(getDoc(doc(dbFor(IDS.attendantA), 'users', IDS.attendantA)));
    await assertFails(getDoc(doc(dbFor(IDS.attendantA), 'users', IDS.attendantA2)));
    await assertFails(getDocs(collection(dbFor(IDS.attendantA), 'users')));
  });

  test('station managers can query only their station directory', async () => {
    const stationUsers = query(
      collection(dbFor(IDS.managerA), 'users'),
      where('stationIds', 'array-contains', STATION_A),
    );
    await assertSucceeds(getDocs(stationUsers));
    await assertFails(getDoc(doc(dbFor(IDS.managerA), 'users', IDS.attendantB)));
  });

  test('owner creates staff only within owned stations', async () => {
    await assertSucceeds(setDoc(doc(dbFor(IDS.ownerA), 'users', 'new-attendant'), {
      name: 'New Attendant',
      phone: '9111111111',
      role: 'attendant',
      stationIds: [STATION_A],
      status: 'active',
      createdBy: IDS.ownerA,
    }));
    await assertFails(setDoc(doc(dbFor(IDS.ownerA), 'users', 'new-owner'), {
      name: 'New Owner',
      phone: '9222222222',
      role: 'owner',
      stationIds: [STATION_A],
      status: 'active',
      createdBy: IDS.ownerA,
    }));
    await assertFails(setDoc(doc(dbFor(IDS.ownerA), 'users', 'foreign-attendant'), {
      name: 'Foreign',
      phone: '9333333333',
      role: 'attendant',
      stationIds: [STATION_B],
      status: 'active',
      createdBy: IDS.ownerA,
    }));
  });

  test('manager and admin may create attendants but not privileged roles', async () => {
    await assertSucceeds(setDoc(doc(dbFor(IDS.managerA), 'users', 'manager-created-attendant'), {
      name: 'Managed Attendant',
      phone: '9444444444',
      role: 'attendant',
      stationIds: [STATION_A],
      status: 'active',
      createdBy: IDS.managerA,
    }));
    await assertSucceeds(setDoc(doc(dbFor(IDS.adminA), 'users', 'admin-created-attendant'), {
      name: 'Admin Attendant',
      phone: '9555555555',
      role: 'attendant',
      stationIds: [STATION_A],
      status: 'active',
      createdBy: IDS.adminA,
    }));
    await assertFails(setDoc(doc(dbFor(IDS.managerA), 'users', 'manager-created-manager'), {
      name: 'Escalated',
      phone: '9666666666',
      role: 'manager',
      stationIds: [STATION_A],
      status: 'active',
      createdBy: IDS.managerA,
    }));
  });

  test('blocks attendant and manager self-escalation', async () => {
    await assertFails(updateDoc(doc(dbFor(IDS.attendantA), 'users', IDS.attendantA), { role: 'owner' }));
    await assertFails(updateDoc(doc(dbFor(IDS.managerA), 'users', IDS.managerA), { role: 'owner' }));
    await assertFails(updateDoc(doc(dbFor(IDS.managerA), 'users', IDS.managerA), { stationIds: [STATION_A, STATION_B] }));
  });

  test('blocks managers and owners from granting owner or super-admin', async () => {
    await assertFails(updateDoc(doc(dbFor(IDS.managerA), 'users', IDS.attendantA), { role: 'owner' }));
    await assertFails(updateDoc(doc(dbFor(IDS.ownerA), 'users', IDS.attendantA), { role: 'owner' }));
    await assertFails(updateDoc(doc(dbFor(IDS.ownerA), 'users', IDS.attendantA), { role: 'super_admin' }));
  });

  test('permits bounded staff management and super-admin role management', async () => {
    await assertSucceeds(updateDoc(doc(dbFor(IDS.ownerA), 'users', IDS.attendantA), { role: 'manager' }));
    await assertSucceeds(updateDoc(doc(dbFor(IDS.managerA), 'users', IDS.attendantA), { status: 'inactive' }));
    await assertSucceeds(updateDoc(doc(dbFor(IDS.superAdmin), 'users', IDS.attendantA), { role: 'owner' }));
  });

  test('rejects profile fields that could carry frontend credentials', async () => {
    await assertFails(updateDoc(doc(dbFor(IDS.ownerA), 'users', IDS.attendantA), { pinHash: 'MTIzNA==' }));
  });

  test('never allows client profile deletion', async () => {
    await assertFails(deleteDoc(doc(dbFor(IDS.ownerA), 'users', IDS.attendantA)));
    await assertFails(deleteDoc(doc(dbFor(IDS.superAdmin), 'users', IDS.attendantA)));
  });
});

describe('station resources', () => {
  test('isolates pumps, nozzles, prices, tank stock, and assignments by station', async () => {
    for (const [name, idA, idB] of [
      ['pumps', 'pump-a', 'pump-b'],
      ['nozzles', 'nozzle-a', 'nozzle-b'],
      ['prices', 'price-a-active', 'price-b-active'],
      ['tankStocks', 'tank-a', 'tank-b'],
    ]) {
      await assertSucceeds(getDoc(doc(dbFor(IDS.managerA), name, idA)));
      await assertFails(getDoc(doc(dbFor(IDS.managerA), name, idB)));
    }
    await assertSucceeds(getDoc(doc(dbFor(IDS.attendantA), 'assignments', 'assignment-a')));
  });

  test('manager can create pump/nozzle only in assigned station with a matching pump', async () => {
    await assertSucceeds(setDoc(doc(dbFor(IDS.managerA), 'pumps', 'pump-a-new'), pump(STATION_A, IDS.managerA)));
    await assertFails(setDoc(doc(dbFor(IDS.managerA), 'pumps', 'pump-b-new'), pump(STATION_B, IDS.managerA)));
    await assertSucceeds(setDoc(doc(dbFor(IDS.managerA), 'nozzles', 'nozzle-a-new'), nozzle(STATION_A, 'pump-a', IDS.managerA)));
    await assertFails(setDoc(doc(dbFor(IDS.managerA), 'nozzles', 'cross-pump'), nozzle(STATION_A, 'pump-b', IDS.managerA)));
  });

  test('attendant cannot administer pumps, nozzles, prices, or stock', async () => {
    await assertFails(setDoc(doc(dbFor(IDS.attendantA), 'pumps', 'attendant-pump'), pump(STATION_A, IDS.attendantA)));
    await assertFails(updateDoc(doc(dbFor(IDS.attendantA), 'nozzles', 'nozzle-a'), { lastReading: 200 }));
    await assertFails(setDoc(doc(dbFor(IDS.attendantA), 'prices', 'attendant-price'), price(STATION_A, IDS.attendantA)));
    await assertFails(setDoc(doc(dbFor(IDS.attendantA), 'tankStocks', 'attendant-tank'), {
      stationId: STATION_A,
      fuelType: 'Petrol',
      baselineLiters: 100,
      baselineTime: '2026-09-16T00:00:00.000Z',
      updatedBy: IDS.attendantA,
    }));
  });

  test('prevents moving resources between stations', async () => {
    await assertFails(updateDoc(doc(dbFor(IDS.ownerA), 'pumps', 'pump-a'), { stationId: STATION_B }));
    await assertFails(updateDoc(doc(dbFor(IDS.ownerA), 'nozzles', 'nozzle-a'), { stationId: STATION_B, pumpId: 'pump-b' }));
    await assertFails(updateDoc(doc(dbFor(IDS.ownerA), 'tankStocks', 'tank-a'), { stationId: STATION_B }));
  });

  test('price history only permits closing an active price once', async () => {
    await assertSucceeds(updateDoc(doc(dbFor(IDS.managerA), 'prices', 'price-a-active'), {
      effectiveTo: '2026-09-16T04:00:00.000Z',
    }));
    await assertFails(updateDoc(doc(dbFor(IDS.managerA), 'prices', 'price-a-closed'), {
      effectiveTo: '2026-09-16T05:00:00.000Z',
    }));
    await assertFails(updateDoc(doc(dbFor(IDS.managerA), 'prices', 'price-a-active'), { price: 1 }));
    await assertFails(deleteDoc(doc(dbFor(IDS.superAdmin), 'prices', 'price-a-closed')));
  });

  test('management may set valid prices and stock in assigned stations', async () => {
    await assertSucceeds(setDoc(doc(dbFor(IDS.managerA), 'prices', 'new-price'), price(STATION_A, IDS.managerA)));
    await assertSucceeds(setDoc(doc(dbFor(IDS.adminA), 'tankStocks', 'new-tank'), {
      stationId: STATION_A,
      fuelType: 'Diesel',
      baselineLiters: 1000,
      baselineTime: '2026-09-16T00:00:00.000Z',
      capacityLiters: 2000,
      updatedBy: IDS.adminA,
    }));
    await assertFails(setDoc(doc(dbFor(IDS.managerA), 'prices', 'negative-price'), {
      ...price(STATION_A, IDS.managerA),
      price: -1,
    }));
  });

  test('only station owner or super-admin can delete equipment', async () => {
    await assertFails(deleteDoc(doc(dbFor(IDS.managerA), 'pumps', 'pump-a')));
    await assertSucceeds(deleteDoc(doc(dbFor(IDS.ownerA), 'pumps', 'pump-a')));
    await assertSucceeds(deleteDoc(doc(dbFor(IDS.superAdmin), 'nozzles', 'nozzle-b')));
  });
});

describe('shift state machine and approved immutability', () => {
  function newActiveShift(userId = IDS.attendantA, stationId = STATION_A, name = 'Attendant A') {
    return shift(stationId, userId, name, 'ACTIVE');
  }

  test('attendant creates only their own active shift at an assigned station', async () => {
    await assertSucceeds(setDoc(doc(dbFor(IDS.attendantA), 'shifts', 'new-own-shift'), newActiveShift()));
    await assertFails(setDoc(doc(dbFor(IDS.attendantA), 'shifts', 'forged-user-shift'), newActiveShift(IDS.attendantA2, STATION_A, 'Attendant A2')));
    await assertFails(setDoc(doc(dbFor(IDS.attendantA), 'shifts', 'foreign-shift'), newActiveShift(IDS.attendantA, STATION_B, 'Attendant A')));
    await assertFails(setDoc(doc(dbFor(IDS.attendantA), 'shifts', 'preapproved-shift'), shift(STATION_A, IDS.attendantA, 'Attendant A', 'APPROVED')));
  });

  test('attendant reads own shifts but not another employee shifts', async () => {
    await assertSucceeds(getDoc(doc(dbFor(IDS.attendantA), 'shifts', 'active-a')));
    await assertFails(getDoc(doc(dbFor(IDS.attendantA), 'shifts', 'active-a2')));
    await assertFails(getDoc(doc(dbFor(IDS.attendantA), 'shifts', 'active-b')));
    await assertSucceeds(getDoc(doc(dbFor(IDS.managerA), 'shifts', 'active-a2')));
    await assertFails(getDoc(doc(dbFor(IDS.managerA), 'shifts', 'active-b')));
  });

  test('attendant shift queries must include own user id', async () => {
    const own = query(
      collection(dbFor(IDS.attendantA), 'shifts'),
      where('stationId', '==', STATION_A),
      where('userId', '==', IDS.attendantA),
    );
    await assertSucceeds(getDocs(own));
    const stationWide = query(collection(dbFor(IDS.attendantA), 'shifts'), where('stationId', '==', STATION_A));
    await assertFails(getDocs(stationWide));
  });

  test('owner of active shift can change nozzle assignment and submit for review', async () => {
    await assertSucceeds(updateDoc(doc(dbFor(IDS.attendantA), 'shifts', 'active-a'), {
      nozzles: [{
        nozzleId: 'nozzle-a', pumpId: 'pump-a', fuelType: 'Petrol',
        openingReading: 100, closingReading: null, litersSold: 0, price: 0, revenue: 0,
      }, {
        nozzleId: 'nozzle-a-extra', pumpId: 'pump-a', fuelType: 'Diesel',
        openingReading: 200, closingReading: null, litersSold: 0, price: 0, revenue: 0,
      }],
    }));
    await assertSucceeds(updateDoc(doc(dbFor(IDS.attendantA), 'shifts', 'active-a'), {
      nozzles: [{
        nozzleId: 'nozzle-a', pumpId: 'pump-a', fuelType: 'Petrol',
        openingReading: 100, closingReading: 110, litersSold: 10, price: 100, revenue: 1000,
      }],
      totals: { ...zeroTotals(), totalLiters: 10, totalRevenue: 1000, totalPayments: 1000 },
      endTime: '2026-09-16T02:00:00.000Z',
      status: 'PENDING_REVIEW',
      correctionRequests: [],
      resubmittedAt: null,
    }));
  });

  test('attendant cannot modify another shift or approve any shift', async () => {
    await assertFails(updateDoc(doc(dbFor(IDS.attendantA), 'shifts', 'active-a2'), { nozzles: [] }));
    await assertFails(updateDoc(doc(dbFor(IDS.attendantA), 'shifts', 'pending-a'), {
      status: 'APPROVED',
      approvedBy: IDS.attendantA,
      approvedAt: '2026-09-16T03:00:00.000Z',
    }));
  });

  test('reviewer approves another employee pending shift', async () => {
    await assertSucceeds(updateDoc(doc(dbFor(IDS.managerA), 'shifts', 'pending-a'), {
      status: 'APPROVED',
      approvedBy: IDS.managerA,
      approvedAt: '2026-09-16T03:00:00.000Z',
    }));
  });

  test('reviewer rejects another employee pending shift', async () => {
    await assertSucceeds(updateDoc(doc(dbFor(IDS.ownerA), 'shifts', 'pending-a'), {
      status: 'REJECTED',
      rejectedBy: IDS.ownerA,
      rejectedAt: '2026-09-16T03:00:00.000Z',
      rejectionReason: 'Reading mismatch',
    }));
  });

  test('reviewer cannot approve their own shift or arbitrarily edit active totals', async () => {
    await assertFails(updateDoc(doc(dbFor(IDS.managerA), 'shifts', 'manager-pending-a'), {
      status: 'APPROVED',
      approvedBy: IDS.managerA,
      approvedAt: '2026-09-16T03:00:00.000Z',
    }));
    await assertFails(updateDoc(doc(dbFor(IDS.managerA), 'shifts', 'active-a'), {
      totals: { ...zeroTotals(), totalRevenue: 999999 },
    }));
  });

  test('rejected shift can be corrected and resubmitted by its owner', async () => {
    await assertSucceeds(updateDoc(doc(dbFor(IDS.attendantA), 'shifts', 'rejected-a'), {
      totals: { ...zeroTotals(), totalLiters: 12, totalRevenue: 1200, totalPayments: 1200 },
      status: 'PENDING_REVIEW',
      correctionRequests: [],
      resubmittedAt: '2026-09-16T04:00:00.000Z',
    }));
  });

  test('approved records are immutable and all shift deletes fail', async () => {
    for (const uid of [IDS.ownerA, IDS.managerA, IDS.adminA, IDS.attendantA, IDS.superAdmin]) {
      await assertFails(updateDoc(doc(dbFor(uid), 'shifts', 'approved-a'), {
        totals: { ...zeroTotals(), totalRevenue: 1 },
      }));
    }
    await assertFails(deleteDoc(doc(dbFor(IDS.ownerA), 'shifts', 'approved-a')));
    await assertFails(deleteDoc(doc(dbFor(IDS.superAdmin), 'shifts', 'approved-a')));
  });
});

describe('transactions, notes, settlements, and audit logs', () => {
  test('attendant adds positive entries only to their own editable shift', async () => {
    const ownExpense = {
      stationId: STATION_A,
      shiftId: 'active-a',
      type: 'expense',
      category: 'Testing',
      amount: 25,
      description: 'Calibration test',
      createdBy: IDS.attendantA,
    };
    await assertSucceeds(setDoc(doc(dbFor(IDS.attendantA), 'transactions', 'new-own-expense'), ownExpense));
    await assertFails(setDoc(doc(dbFor(IDS.attendantA), 'transactions', 'other-expense'), {
      ...ownExpense,
      shiftId: 'active-a2',
    }));
    await assertFails(setDoc(doc(dbFor(IDS.attendantA), 'transactions', 'negative-expense'), {
      ...ownExpense,
      amount: -1,
    }));
  });

  test('station reviewer may create a valid station transaction', async () => {
    await assertSucceeds(setDoc(doc(dbFor(IDS.managerA), 'transactions', 'manager-expense'), {
      stationId: STATION_A,
      shiftId: null,
      type: 'expense',
      category: 'Maintenance',
      amount: 50,
      description: 'Repair',
      createdBy: IDS.managerA,
    }));
    await assertFails(setDoc(doc(dbFor(IDS.managerA), 'transactions', 'foreign-manager-expense'), {
      stationId: STATION_B,
      shiftId: null,
      type: 'expense',
      category: 'Maintenance',
      amount: 50,
      description: 'Repair',
      createdBy: IDS.managerA,
    }));
  });

  test('attendant reads own-shift entries but not another shift entries', async () => {
    await assertSucceeds(getDoc(doc(dbFor(IDS.attendantA), 'transactions', 'expense-a')));
    await assertFails(getDoc(doc(dbFor(IDS.attendantA), 'transactions', 'expense-a2')));
    await assertSucceeds(getDoc(doc(dbFor(IDS.managerA), 'transactions', 'expense-a2')));
    await assertFails(getDoc(doc(dbFor(IDS.managerA), 'transactions', 'expense-b')));
  });

  test('transaction history is append-only for every client role', async () => {
    await assertFails(updateDoc(doc(dbFor(IDS.ownerA), 'transactions', 'expense-a'), { amount: 1 }));
    await assertFails(deleteDoc(doc(dbFor(IDS.ownerA), 'transactions', 'expense-a')));
    await assertFails(deleteDoc(doc(dbFor(IDS.superAdmin), 'transactions', 'expense-a')));
  });

  test('attendant creates and reads notes only for their own editable shift', async () => {
    await assertSucceeds(setDoc(doc(dbFor(IDS.attendantA), 'notes', 'new-note-a'), {
      stationId: STATION_A,
      shiftId: 'active-a',
      userId: IDS.attendantA,
      userName: 'Attendant A',
      text: 'Meter checked',
      pumpId: null,
      nozzleId: null,
    }));
    await assertFails(setDoc(doc(dbFor(IDS.attendantA), 'notes', 'forged-note'), {
      stationId: STATION_A,
      shiftId: 'active-a2',
      userId: IDS.attendantA,
      userName: 'Attendant A',
      text: 'Forged',
      pumpId: null,
      nozzleId: null,
    }));
    await assertSucceeds(getDoc(doc(dbFor(IDS.attendantA), 'notes', 'note-a')));
    await assertFails(getDoc(doc(dbFor(IDS.attendantA), 'notes', 'note-a2')));
  });

  test('only station reviewers create settlements and ledger entries stay append-only', async () => {
    const settlement = {
      stationId: STATION_A,
      staffUserId: IDS.attendantA,
      staffName: 'Attendant A',
      shiftId: 'approved-a',
      shiftIds: ['approved-a'],
      amount: 50,
      type: 'collect',
      method: 'cash',
      notes: '',
      createdBy: IDS.managerA,
      createdByName: 'Manager A',
      status: 'completed',
    };
    await assertSucceeds(setDoc(doc(dbFor(IDS.managerA), 'settlements', 'new-settlement'), settlement));
    await assertFails(setDoc(doc(dbFor(IDS.attendantA), 'settlements', 'attendant-settlement'), {
      ...settlement,
      createdBy: IDS.attendantA,
    }));
    await assertFails(updateDoc(doc(dbFor(IDS.ownerA), 'settlements', 'settlement-a'), { amount: 1 }));
    await assertFails(deleteDoc(doc(dbFor(IDS.superAdmin), 'settlements', 'settlement-a')));
  });

  test('attendant reads only their settlement records', async () => {
    await assertSucceeds(getDoc(doc(dbFor(IDS.attendantA), 'settlements', 'settlement-a')));
    await assertFails(getDoc(doc(dbFor(IDS.attendantA), 'settlements', 'settlement-a2')));
  });

  test('audit logs are station-isolated, backend-only, and immutable', async () => {
    await assertSucceeds(getDoc(doc(dbFor(IDS.managerA), 'auditLogs', 'audit-a')));
    await assertFails(getDoc(doc(dbFor(IDS.managerA), 'auditLogs', 'audit-b')));
    await assertSucceeds(getDoc(doc(dbFor(IDS.superAdmin), 'auditLogs', 'audit-b')));
    await assertFails(setDoc(doc(dbFor(IDS.superAdmin), 'auditLogs', 'forged-audit'), {
      stationId: STATION_A,
      actorId: IDS.superAdmin,
      action: 'FORGED',
    }));
    await assertFails(updateDoc(doc(dbFor(IDS.superAdmin), 'auditLogs', 'audit-a'), { action: 'CHANGED' }));
    await assertFails(deleteDoc(doc(dbFor(IDS.superAdmin), 'auditLogs', 'audit-a')));
  });

  test('reserved and unknown collections are denied by default', async () => {
    await assertFails(getDoc(doc(dbFor(IDS.superAdmin), 'privateData', 'secret')));
    await assertFails(setDoc(doc(dbFor(IDS.superAdmin), 'nozzleAssignments', 'x'), { stationId: STATION_A }));
    await assertFails(setDoc(doc(dbFor(IDS.superAdmin), 'stockMovements', 'x'), { stationId: STATION_A }));
  });
});
