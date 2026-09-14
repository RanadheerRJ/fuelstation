import { listDocs, addDocTo, updateDocById, getDocById, queryDocs, logAudit } from './firestoreService.js';
import { getState } from '../state.js';
import { roundMoney, sumMoney, parseMoneyInput } from './money.js';
import { getBusinessDate } from './datetime.js';

// ============================================================================
// Credit ledger (Step 13)
//
// Previously a credit was written once with status:'outstanding' and there was
// no repayment path at all — the only way to mark one paid would have been to
// overwrite the record, destroying the history of what was owed and when.
//
// Structure now:
//   - `amount` is the ORIGINAL debt and is never modified.
//   - `payments[]` is append-only; each entry records who took the money, when,
//     how much and by what method.
//   - `paidAmount` / `status` are derived from payments[] and recomputed on
//     every append, so they can never drift from the underlying entries.
//   - Status is an explicit enum, not free text.
// ============================================================================

export const CREDIT_STATUS = {
  OUTSTANDING: 'OUTSTANDING',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  WRITTEN_OFF: 'WRITTEN_OFF',
};

/** Derive status from the original amount and the payments recorded so far. */
export function deriveCreditStatus(amount, paidAmount) {
  const owed = roundMoney(amount);
  const paid = roundMoney(paidAmount);
  if (paid <= 0) return CREDIT_STATUS.OUTSTANDING;
  // Tolerate a paisa of float noise when deciding "fully paid".
  if (paid + 0.005 >= owed) return CREDIT_STATUS.PAID;
  return CREDIT_STATUS.PARTIALLY_PAID;
}

/** Amount still owed on a credit document. */
export function creditBalance(credit) {
  if (!credit) return 0;
  if (credit.status === CREDIT_STATUS.WRITTEN_OFF) return 0;
  const paid = sumMoney((credit.payments || []).map(p => p.amount));
  return roundMoney(Number(credit.amount || 0) - paid);
}

export async function addCredit({ stationId, shiftId, customer, amount, reference, note }) {
  const { user } = getState();
  if (!user?.uid) throw new Error('You are not signed in.');

  const name = String(customer || '').trim();
  if (!name) throw new Error('Customer name is required for a credit.');

  const amt = parseMoneyInput(amount, { label: 'Credit amount' });
  if (!amt.ok) throw new Error(amt.error);
  if (amt.value <= 0) throw new Error('Credit amount must be greater than zero.');

  const payload = {
    stationId,
    shiftId: shiftId || null,
    type: 'credit',
    customer: name,
    // The original debt. Never mutated.
    amount: amt.value,
    reference: reference || '',
    description: note || '',
    // Append-only repayment history.
    payments: [],
    paidAmount: 0,
    status: CREDIT_STATUS.OUTSTANDING,
    businessDate: getBusinessDate(new Date()),
    createdBy: user.uid,
    createdByName: user.name || null,
    createdAt: new Date().toISOString(),
  };
  const doc = await addDocTo('transactions', payload);
  await logAudit({
    stationId, action: 'CREDIT_ADDED', entityType: 'transaction', entityId: doc.id,
    metadata: { customer: name, amount: amt.value },
  });
  return { ...doc, warning: amt.warning || null };
}

/**
 * Record a repayment against a credit.
 *
 * Appends to payments[] and recomputes the derived fields. The original
 * `amount` and every prior payment entry are left untouched, so the ledger can
 * always be reconstructed and audited.
 */
export async function recordCreditPayment(creditId, { amount, method = 'cash', note = '' }) {
  const { user } = getState();
  if (!user?.uid) throw new Error('You are not signed in.');

  const credit = await getDocById('transactions', creditId);
  if (!credit) throw new Error('Credit not found');
  if (credit.type !== 'credit') throw new Error('That record is not a credit.');
  if (credit.status === CREDIT_STATUS.PAID) throw new Error('This credit is already fully paid.');
  if (credit.status === CREDIT_STATUS.WRITTEN_OFF) throw new Error('This credit has been written off.');

  const pay = parseMoneyInput(amount, { label: 'Payment amount' });
  if (!pay.ok) throw new Error(pay.error);
  if (pay.value <= 0) throw new Error('Payment amount must be greater than zero.');

  const outstanding = creditBalance(credit);
  if (pay.value > outstanding + 0.005) {
    throw new Error(`Payment of ₹${pay.value} is more than the ₹${outstanding} still owed on this credit.`);
  }

  const entry = {
    id: 'pay_' + Math.random().toString(36).slice(2, 10),
    amount: pay.value,
    method,
    note: note || '',
    receivedBy: user.uid,
    receivedByName: user.name || null,
    receivedAt: new Date().toISOString(),
    businessDate: getBusinessDate(new Date()),
  };

  const payments = [...(credit.payments || []), entry]; // append only
  const paidAmount = sumMoney(payments.map(p => p.amount));
  const status = deriveCreditStatus(credit.amount, paidAmount);

  await updateDocById('transactions', creditId, { payments, paidAmount, status });

  await logAudit({
    stationId: credit.stationId, action: 'CREDIT_PAYMENT_RECORDED',
    entityType: 'transaction', entityId: creditId,
    metadata: { amount: pay.value, method, paidAmount, status, customer: credit.customer },
  });

  return { ...credit, payments, paidAmount, status };
}

/** Write off an unrecoverable credit. Owner/admin only; history is preserved. */
export async function writeOffCredit(creditId, reason) {
  const { user } = getState();
  if (!user?.uid) throw new Error('You are not signed in.');
  if (!['super_admin', 'owner', 'admin'].includes(user.role)) {
    throw new Error('Only an owner or admin can write off a credit.');
  }
  const text = String(reason || '').trim();
  if (!text) throw new Error('A reason is required to write off a credit.');

  const credit = await getDocById('transactions', creditId);
  if (!credit) throw new Error('Credit not found');

  await updateDocById('transactions', creditId, {
    status: CREDIT_STATUS.WRITTEN_OFF,
    writtenOffBy: user.uid,
    writtenOffAt: new Date().toISOString(),
    writeOffReason: text,
  });
  await logAudit({
    stationId: credit.stationId, action: 'CREDIT_WRITTEN_OFF',
    entityType: 'transaction', entityId: creditId,
    metadata: { reason: text, balance: creditBalance(credit) },
  });
  return true;
}

export async function addExpense({ stationId, shiftId, category, amount, description }) {
  const { user } = getState();
  if (!user?.uid) throw new Error('You are not signed in.');

  const amt = parseMoneyInput(amount, { label: 'Expense amount' });
  if (!amt.ok) throw new Error(amt.error);
  if (amt.value <= 0) throw new Error('Expense amount must be greater than zero.');

  const payload = {
    stationId,
    shiftId: shiftId || null,
    type: 'expense',
    category,
    amount: amt.value,
    // Kept defaulting to '' — Firestore rejects undefined.
    description: description || category || '',
    businessDate: getBusinessDate(new Date()),
    createdBy: user.uid,
    createdByName: user.name || null,
    createdAt: new Date().toISOString(),
  };
  const doc = await addDocTo('transactions', payload);
  await logAudit({
    stationId, action: 'EXPENSE_ADDED', entityType: 'transaction', entityId: doc.id,
    metadata: { category, amount: amt.value, shiftId: shiftId || null },
  });
  return { ...doc, warning: amt.warning || null };
}

export async function getTransactions(stationId, opts={}) {
  const filters = [{ field: 'stationId', op: '==', value: stationId }];
  if (opts.shiftId) filters.push({ field: 'shiftId', op: '==', value: opts.shiftId });
  if (opts.type) filters.push({ field: 'type', op: '==', value: opts.type });
  const all = await queryDocs('transactions', null, filters);
  return all.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function getCreditsReport(stationId) {
  const credits = await queryDocs('transactions', null, [
    { field: 'stationId', op: '==', value: stationId },
    { field: 'type', op: '==', value: 'credit' },
  ]);
  // Attach the live balance so callers never have to recompute it inconsistently.
  return credits.map(c => ({ ...c, balance: creditBalance(c) }));
}

/** Total still owed to the station across all customers. */
export async function getOutstandingCreditTotal(stationId) {
  const credits = await getCreditsReport(stationId);
  return sumMoney(credits.map(c => c.balance));
}
