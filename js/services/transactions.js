import { listDocs, addDocTo, queryDocs, logAudit, whereStation } from './firestoreService.js';
import { getState } from '../state.js';

export async function addCredit({ stationId, shiftId, customer, amount, reference, note }) {
  const { user } = getState();
  const payload = {
    stationId,
    shiftId: shiftId || null,
    type: 'credit',
    customer,
    amount: Number(amount),
    reference: reference || '',
    description: note || '',
    createdBy: user?.uid,
    createdAt: new Date().toISOString(),
    status: 'outstanding',
  };
  const doc = await addDocTo('transactions', payload);
  await logAudit({ userId: user?.uid, stationId, action: 'CREDIT_ADDED', metadata: { customer, amount } });
  return doc;
}

export async function addExpense({ stationId, shiftId, category, amount, description, fuelType, liters, nozzleId }) {
  const { user } = getState();
  const payload = {
    stationId,
    shiftId: shiftId || null,
    type: 'expense',
    category,
    amount: Number(amount),
    description: description || category || '',
    createdBy: user?.uid,
    createdAt: new Date().toISOString(),
    // Optional testing-liters fields - additive, undefined for old expense entries
    ...(fuelType ? { fuelType } : {}),
    ...(liters !== undefined && liters !== null && liters !== '' ? { liters: Number(liters) } : {}),
    ...(nozzleId ? { nozzleId } : {}),
  };
  const doc = await addDocTo('transactions', payload);
  await logAudit({ userId: user?.uid, stationId, action: 'EXPENSE_ADDED', metadata: { category, amount } });
  return doc;
}

export async function getTransactions(stationId, opts={}) {
  const { user } = getState();
  const filters = whereStation(stationId);
  if (user?.role === 'attendant') {
    filters.push({ field: 'createdBy', op: '==', value: user.uid });
  }
  let all = await queryDocs('transactions', t => t.stationId === stationId, filters);
  if (opts.shiftId) all = all.filter(t => t.shiftId === opts.shiftId);
  if (opts.type) all = all.filter(t => t.type === opts.type);
  return all.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function getCreditsReport(stationId) {
  return getTransactions(stationId, { type: 'credit' });
}
