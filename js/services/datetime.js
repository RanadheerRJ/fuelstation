// ============================================================================
// Business date/time helpers — Asia/Kolkata
//
// Why this file exists:
//   `new Date().toISOString().slice(0,10)` returns a UTC date. IST is UTC+5:30,
//   so between 00:00 and 05:30 IST that expression reports YESTERDAY. Every
//   daily report, shift bucket and "today" filter was therefore wrong for the
//   first 5.5 hours of every business day.
//
// All day-bucketing in the app must go through these helpers.
// ============================================================================

export const BUSINESS_TIMEZONE = 'Asia/Kolkata';

// IST is a fixed offset (UTC+05:30) with no daylight saving, so a fixed shift
// is exact. We still use Intl for formatting so displayed text stays correct
// if the constant is ever changed.
const IST_OFFSET_MINUTES = 5 * 60 + 30;
const MS_PER_MINUTE = 60 * 1000;

function toDate(value) {
  if (value instanceof Date) return value;
  if (value === null || value === undefined || value === '') return new Date();
  // Firestore Timestamp
  if (typeof value === 'object' && typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'object' && typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  const d = new Date(value);
  return isNaN(d.getTime()) ? new Date(NaN) : d;
}

/**
 * The business date (YYYY-MM-DD) that an instant falls on, in Asia/Kolkata.
 * Replaces every `new Date(x).toISOString().slice(0,10)` in the codebase.
 */
export function getBusinessDate(value = new Date()) {
  const d = toDate(value);
  if (isNaN(d.getTime())) return null;
  const shifted = new Date(d.getTime() + IST_OFFSET_MINUTES * MS_PER_MINUTE);
  // Read the shifted instant in UTC — its UTC calendar date is the IST date.
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * The instant at which a business date begins (00:00:00.000 IST), as a Date.
 */
export function getBusinessDayStart(dateStr) {
  const key = typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    ? dateStr
    : getBusinessDate(dateStr);
  if (!key) return new Date(NaN);
  const [y, m, d] = key.split('-').map(Number);
  // Midnight IST == 18:30 UTC on the previous day.
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - IST_OFFSET_MINUTES * MS_PER_MINUTE);
}

/**
 * The last representable instant of a business date (23:59:59.999 IST).
 */
export function getBusinessDayEnd(dateStr) {
  const start = getBusinessDayStart(dateStr);
  if (isNaN(start.getTime())) return new Date(NaN);
  return new Date(start.getTime() + 24 * 60 * MS_PER_MINUTE - 1);
}

/** Is this instant inside the given business date? */
export function isSameBusinessDate(value, dateStr) {
  return getBusinessDate(value) === dateStr;
}

/** Business date N days before/after the given one. */
export function addBusinessDays(dateStr, delta) {
  const start = getBusinessDayStart(dateStr);
  return getBusinessDate(new Date(start.getTime() + delta * 24 * 60 * MS_PER_MINUTE));
}

/** Today's business date. */
export function today() {
  return getBusinessDate(new Date());
}

/** Human-readable date in IST, e.g. "14 Sep 2026". */
export function formatBusinessDate(value, opts = {}) {
  const d = toDate(value);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: BUSINESS_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...opts,
  }).format(d);
}

/** Human-readable time in IST, e.g. "09:45 PM". */
export function formatBusinessTime(value) {
  const d = toDate(value);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: BUSINESS_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

/** Human-readable date+time in IST. */
export function formatBusinessDateTime(value) {
  const d = toDate(value);
  if (isNaN(d.getTime())) return '—';
  return `${formatBusinessDate(d)}, ${formatBusinessTime(d)}`;
}

/**
 * Short "how long ago" label, e.g. "just now", "12 min ago", "3 hr ago",
 * "yesterday", "5 days ago". Used to show how fresh a price is.
 * Future timestamps read as "just now" rather than a negative age.
 */
export function formatRelativeTime(value) {
  const d = toDate(value);
  if (isNaN(d.getTime())) return '—';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo ago`;
  return `${Math.floor(months / 12)} yr ago`;
}
