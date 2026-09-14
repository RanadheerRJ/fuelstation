// ============================================================================
// Money + numeric input validation
//
// Why this file exists:
//   The codebase used `Number(value) || 0` on financial inputs. That converts
//   "abc", "", null, undefined and NaN into a SILENT ZERO. A typo in a closing
//   meter reading therefore became a valid reading of 0, producing negative
//   litres, bogus revenue and a fake cash variance, with no error shown.
//
//   Rounding was also ad-hoc `Math.round(x*100)/100` sprinkled at call sites,
//   so the same amount could round differently in different code paths.
//
// Policy:
//   - Money is stored as rupees in a JS number, rounded to 2 dp at every
//     boundary via `roundMoney`. See NOTE-ON-PAISE below.
//   - Meter readings keep 3 dp (litres are dispensed to millilitre precision).
//   - Validation returns a structured result; callers must surface `.error`
//     rather than silently substituting 0.
//
// NOTE-ON-PAISE (deliberately NOT done in this change):
//   The structurally correct fix is to store money as integer paise, which
//   removes float drift entirely. That is a DATA MIGRATION touching every
//   existing shift/transaction document, so per the brief it is proposed
//   rather than applied. `roundMoney` is the single choke point that a future
//   migration would swap out.
// ============================================================================

/** Round a rupee amount to 2 decimal places, half-away-from-zero. */
export function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  // Scale via EPSILON nudge to avoid 1.005 -> 1.00 float artefacts.
  const sign = n < 0 ? -1 : 1;
  return sign * Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100;
}

/** Round a litre quantity to 3 decimal places. */
export function roundLiters(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const sign = n < 0 ? -1 : 1;
  return sign * Math.round((Math.abs(n) + Number.EPSILON) * 1000) / 1000;
}

/** Sum a list of money values through the single rounding choke point. */
export function sumMoney(values) {
  let total = 0;
  for (const v of values || []) {
    const n = Number(v);
    if (Number.isFinite(n)) total += n;
  }
  return roundMoney(total);
}

// ---------------------------------------------------------------- validation

/**
 * Parse a user-supplied number strictly.
 *
 * Returns { ok, value, error, warning }.
 * Unlike `Number(v) || 0` this NEVER invents a zero: bad input yields ok:false.
 *
 * @param {*} raw            the raw input (usually a string from an <input>)
 * @param {object} opts
 *   label      {string}  field name used in the error message
 *   min        {number}  inclusive lower bound (default 0 — money is not negative)
 *   max        {number}  inclusive upper bound
 *   decimals   {number}  max decimal places allowed (default 2)
 *   required   {boolean} if false, blank input is allowed and yields value null
 *   warnAbove  {number}  value is accepted but flagged as suspicious
 */
export function parseNumericInput(raw, opts = {}) {
  const {
    label = 'Value',
    min = 0,
    max = Number.MAX_SAFE_INTEGER,
    decimals = 2,
    required = true,
    warnAbove = null,
  } = opts;

  const isBlank = raw === null || raw === undefined || String(raw).trim() === '';
  if (isBlank) {
    if (required) return { ok: false, value: null, error: `${label} is required.` };
    return { ok: true, value: null, error: null, warning: null };
  }

  const text = String(raw).trim().replace(/,/g, '');

  // Reject anything that is not a plain decimal number. `Number()` happily
  // accepts "0x10", "1e5", " " and Infinity; a meter reading is none of those.
  if (!/^-?\d*\.?\d+$/.test(text)) {
    return { ok: false, value: null, error: `${label} must be a number (got "${String(raw).trim()}").` };
  }

  const n = Number(text);
  if (!Number.isFinite(n)) {
    return { ok: false, value: null, error: `${label} must be a finite number.` };
  }
  if (n < min) {
    return { ok: false, value: null, error: `${label} cannot be less than ${min}.` };
  }
  if (n > max) {
    return { ok: false, value: null, error: `${label} cannot be greater than ${max}.` };
  }

  const dp = (text.split('.')[1] || '').length;
  if (dp > decimals) {
    return { ok: false, value: null, error: `${label} allows at most ${decimals} decimal place(s).` };
  }

  let warning = null;
  if (warnAbove !== null && n > warnAbove) {
    warning = `${label} of ${n} is unusually high — please double-check.`;
  }

  return { ok: true, value: n, error: null, warning };
}

/** Money field: 2 dp, non-negative. */
export function parseMoneyInput(raw, opts = {}) {
  const res = parseNumericInput(raw, { decimals: 2, min: 0, ...opts });
  if (res.ok && res.value !== null) res.value = roundMoney(res.value);
  return res;
}

/** Meter reading: 3 dp, non-negative. */
export function parseReadingInput(raw, opts = {}) {
  const res = parseNumericInput(raw, { decimals: 3, min: 0, ...opts });
  if (res.ok && res.value !== null) res.value = roundLiters(res.value);
  return res;
}

/**
 * Validate a closing meter reading against its opening reading.
 * A mechanical meter only counts up, so closing < opening is an error, not a
 * negative sale.
 */
export function validateClosingReading(rawClosing, openingValue, opts = {}) {
  const { label = 'Closing reading', warnLiters = 20000 } = opts;
  const res = parseReadingInput(rawClosing, { label });
  if (!res.ok) return res;

  const opening = Number(openingValue);
  if (!Number.isFinite(opening)) {
    return { ok: false, value: null, error: `Opening reading for this nozzle is invalid — cannot validate closing.` };
  }
  if (res.value < opening) {
    return {
      ok: false,
      value: null,
      error: `${label} (${res.value}) cannot be less than the opening reading (${opening}). Meters only count up.`,
    };
  }

  const liters = roundLiters(res.value - opening);
  let warning = res.warning || null;
  if (liters > warnLiters) {
    warning = `This nozzle shows ${liters} L dispensed in one shift — please confirm the reading.`;
  }
  return { ok: true, value: res.value, liters, error: null, warning };
}
