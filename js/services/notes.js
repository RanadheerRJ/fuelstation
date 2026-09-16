import { addDocTo, queryDocs, logAudit, whereStation } from './firestoreService.js';
import { getState } from '../state.js';

export async function addNote({ stationId, shiftId, text, pumpId, nozzleId }) {
  const { user } = getState();
  const payload = {
    stationId,
    shiftId: shiftId || null,
    userId: user?.uid,
    userName: user?.name || 'Unknown',
    text,
    pumpId: pumpId || null,
    nozzleId: nozzleId || null,
    createdAt: new Date().toISOString(),
  };
  const doc = await addDocTo('notes', payload);
  await logAudit({ userId: user?.uid, stationId, action: 'NOTE_ADDED', metadata: { shiftId, text: text.slice(0,50) } });
  return doc;
}

export async function getNotes(stationId, opts={}) {
  const { user } = getState();
  const filters = whereStation(stationId);
  if (user?.role === 'attendant') {
    filters.push({ field: 'userId', op: '==', value: user.uid });
  }
  let all = await queryDocs('notes', n => n.stationId === stationId, filters);
  if (opts.shiftId) all = all.filter(n => n.shiftId === opts.shiftId);
  return all.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
}
