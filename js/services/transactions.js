import { listDocs, addDocTo, queryDocs, logAudit } from './firestoreService.js';
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

export async function addExpense({ stationId, shiftId, category, amount, description }) {
  const { user } = getState();
  const payload = {
    stationId,
    shiftId: shiftId || null,
    type: 'expense',
    category,
    amount: Number(amount),
    description: description || '',
    createdBy: user?.uid,
    createdAt: new Date().toISOString(),
  };
  const doc = await addDocTo('transactions', payload);
  await logAudit({ userId: user?.uid, stationId, action: 'EXPENSE_ADDED', metadata: { category, amount } });
  return doc;
}

export async function getTransactions(stationId, opts={}) {
  let all = await queryDocs('transactions', t => t.stationId === stationId);
  if (opts.shiftId) all = all.filter(t => t.shiftId === opts.shiftId);
  if (opts.type) all = all.filter(t => t.type === opts.type);
  return all.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function getCreditsReport(stationId) {
  const credits = await queryDocs('transactions', t => t.stationId === stationId && t.type === 'credit');
  return credits;
}
