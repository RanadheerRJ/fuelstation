# FuelOps — Production Hardening Report

Baseline: `origin/main` @ `cb019cf`
Branch: `arena/01a09e34-fuelstation` (10 commits)
Date: 14 Sep 2026

No framework migration, no UI redesign, no Phase 2 features. Still a static
vanilla-JS PWA with no build step, deployable to GitHub Pages. No existing
Firestore document was migrated or deleted.

---

## 1. Files changed and why

**28 files, +2136 / −265.**

### New

| File | Why |
|---|---|
| `js/services/datetime.js` | Asia/Kolkata business-date helpers. Replaces `toISOString().slice(0,10)`, which reported the *previous* day between 00:00 and 05:30 IST. |
| `js/services/money.js` | Single rounding choke point + strict input parsers. Replaces `Number(v) \|\| 0`, which turned typos into silent zeros. |
| `firestore.indexes.json` | Composite indexes for the queries that replaced full-collection scans. |
| `tests/firestore-rules.test.mjs` | 60+ rules assertions (see §8 — **not yet executed**). |
| `tests/README.md` | How to run the rules suite and deploy rules/indexes. |

### Rewritten

| File | Why |
|---|---|
| `firestore.rules` | Had zero station isolation and a `\|\| true`. Full rewrite — §7. |
| `js/services/shifts.js` | No role checks on approve/reject; TOCTOU on nozzle assignment; unvalidated financials. |
| `js/services/transactions.js` | Credits had no repayment path; amounts unvalidated. |

### Modified

`js/firebase.js` (no silent demo fallback) · `js/app.js` (blocking error screen)
· `js/auth.js` (disabled-account check) · `js/services/firestoreService.js`
(real audit log, query pushdown, transactions, nozzle locks) ·
`js/services/users.js` (escalation guards, station-scoped reads) ·
`js/services/prices.js`, `pumps.js`, `stations.js` (role checks + validation) ·
`js/services/calc.js` (routed through money.js, IST formatters) ·
`js/services/reports.js`, `collections.js`, `notes.js` (IST dates, indexed
queries) · `js/services/demoStore.js` (`demoSet` for fixed-ID docs) ·
`js/views/{shifts,prices,pumps,reports,dashboard}.js` (pass raw input to
validators, IST dates) · `service-worker.js` (cache v43) · `README.md` (§9).

---

## 2. Security vulnerabilities found and fixed

Ordered by severity.

### P0 — Any authenticated user could read every station's data
`allow read: if isSignedIn()` on every collection. Any attendant could read all
stations, all users, all shifts, all transactions and all prices for every
station in the system.
**Fixed:** access derives from `users/{uid}.stationIds` (plus
`stations/{id}.ownerId` for owners). A client cannot widen access by sending a
different `stationId`, and documents cannot be moved between stations.

### P0 — Any authenticated user could create a station
`allow create: if isSignedIn() && (isSuperAdmin() || isOwner() || true)`. The
`|| true` made the whole condition unconditionally true.
**Fixed:** owner+ only, and `ownerId` must equal the caller's own uid.

### P0 — An attendant could approve their own shift
`approveShift()` had **no role check at all** — it wrote `status: 'APPROVED'`
and `approvedBy` from client state, and the rules allowed any signed-in user to
update any shift. An attendant could approve their own cash reconciliation,
attribute the approval to a manager, or rewrite a colleague's financials.
**Fixed:** reviewer-only, station-scoped, cannot approve own shift, only from
`PENDING_REVIEW`. Rules independently block attendants from touching
`status`/`approvedBy`/`approvedAt`/`rejectedBy`/`rejectedAt`.

### P0 — Role escalation via self-update
`users` allowed `create` by any signed-in user and `update` by any manager+,
with nothing pinning `role` or `stationIds`. A user could grant themselves
`owner`, or add other stations to their own profile.
**Fixed:** nobody may change their own `role`/`stationIds`/`status`; nobody may
mint a `super_admin`; only owner+ may grant `owner`; admins may only assign
staff to stations they themselves belong to.

### P1 — Firebase failure silently downgraded users to localStorage
`initFirebase()` caught any error and set `isDemo = true`. A user with a flaky
network got a working-looking app, entered a full day of shift data, and none
of it reached the server — while also bypassing every security rule.
**Fixed:** demo mode is entered **only** from explicit config. An init failure
throws and `app.js` renders a blocking error. Added `assertBackendReady()`.

### P1 — Any authenticated user could change fuel prices
`setPrice` had no role check. An attendant could lower the price, sell at the
real rate and pocket the difference.
**Fixed:** manager+ and station-scoped. Rules make price history append-only —
only `effectiveTo` may be stamped, and prices cannot be deleted.

### P1 — No audit trail
`logAudit()` was an explicit no-op stub. Nothing recorded who approved a shift,
changed a price or deleted a pump.
**Fixed:** real append-only `auditLogs` — §6/§7.

### P1 — Deactivated employees could still sign in
Nothing checked `status`; a disabled user retains valid Firebase Auth
credentials.
**Fixed:** checked at login on both paths, and `isActive()` gates every rule.

### P2 — Nozzle/pump tampering
`nozzles` allowed `update: if isSignedIn()`. An attendant could change a
nozzle's `fuelType` (re-pricing historical sales) or move it to another station.
**Fixed:** manager+ for everything except `lastReading`, the one field
`closeShift` legitimately needs.

---

## 3. Data-model changes

**No migration was run. No existing document was modified or deleted.** All
changes are additive; legacy documents are read correctly and upgrade in place
on next write (verified — §8).

| Collection | Added | Notes |
|---|---|---|
| `shifts` | `declared{payments, closingReadings, declaredBy, declaredAt}` | Raw attendant input, kept separate from derived totals (§4). |
| `shifts` | `submittedBy`, `submittedAt`, `approvedByName`, `rejectedByName` | Accountability. |
| `shifts.totals` | `computedAt`, `computedFrom` | Marks totals as client-computed, for a future server recompute. |
| `shifts.nozzles[]` | `priceEffectiveAt` | Joins `price`/`priceId` already present. |
| `transactions` (credits) | `payments[]`, `paidAmount`, `businessDate`, `createdByName` | Append-only repayment ledger. |
| `auditLogs` | *(now actually written)* | `actorUserId`, `actorName`, `actorRole`, `stationId`, `action`, `entityType`, `entityId`, `metadata`, `clientTime`, `createdAt`. |
| `nozzleLocks` | **new collection**, id = `nozzleId` | Mutual exclusion for shift assignment. |

### Shift status — deliberately NOT renamed

The brief suggested `ACTIVE → SUBMITTED → APPROVED` with
`CORRECTION_REQUIRED → RESUBMITTED`. The live data uses
**`ACTIVE → PENDING_REVIEW → APPROVED / REJECTED`** with a `correctionRequests[]`
array and `resubmittedAt`.

I kept the existing names. Renaming would require rewriting every existing
shift document, and the current states already express the required lifecycle:
`REJECTED` + `correctionRequests[]` **is** the correction-required path, and
re-closing a `REJECTED` shift **is** resubmission (it stamps `resubmittedAt`).
The security properties you asked for are enforced on the existing names.

### Proposed, not done: integer paise

Money is a JS float rounded to 2 dp at one choke point (`roundMoney`). Integer
paise would eliminate float drift entirely, but it is a migration touching every
shift and transaction. `roundMoney` is the single function a future migration
would swap out. **Proposing rather than applying, per the brief.**

---

## 4. Calculation changes

### Formula
Unchanged in intent, now explicit and centrally rounded:
```
litersSold    = closing - opening          (closing >= opening enforced)
grossRevenue  = Σ(litersSold × price)
netRevenue    = grossRevenue - totalExpenses
variance      = totalPayments - netRevenue  (BALANCED within ±0.50)
```

### Raw vs derived (Step 5)
Raw attendant input now persists under `shift.declared`; derived values live in
`shift.totals` and are recomputed from raw inputs plus **server-held price
history** rather than trusted from the client payload. Rules stop attendants
editing totals after approval.

**Not fully closed:** totals are still computed *by* the client. See §10.

### Validation (Step 6)
`Number(v) || 0` is gone from all financial paths. `closing="abc"` now raises
*"Closing reading for nozzle n1 must be a number (got "abc")"* and **nothing is
written** — previously it became `0`, producing negative litres and a fake
variance. Also rejected: blank required fields, negatives, over-precision,
`0x10`, `1e5`, `Infinity`. Closing < opening is rejected (meters only count up).
Merely *suspicious* values (>20,000 L/shift, price >₹500) produce a **warning,
not a block**, as specified.

### Rounding (Step 7)
All ad-hoc `Math.round(x*100)/100` replaced by `roundMoney` (2 dp) /
`roundLiters` (3 dp). Verified: `0.1+0.2 → 0.3`, `1.005 → 1.01`.

### Price snapshot (Step 9)
Previously every nozzle was priced at `shift.startTime`, so a nozzle added
mid-shift after a price change was billed at the stale price. Now each nozzle
is priced from its own `addedAt` (falling back to shift start), and stores
`price`, `priceId`, `priceEffectiveAt`. A **missing price is now a hard error**
instead of silently pricing fuel at ₹0.

---

## 5. Timezone handling

All day bucketing goes through `js/services/datetime.js` with
`BUSINESS_TIMEZONE = 'Asia/Kolkata'`: `getBusinessDate`, `getBusinessDayStart`,
`getBusinessDayEnd`, `formatBusinessDate`, plus `addBusinessDays`,
`isSameBusinessDate`, `formatBusinessTime/DateTime`.

**The bug:** `toISOString()` is UTC. IST is UTC+5:30, so a shift at 02:00 IST on
15 Sep was bucketed as **14 Sep**. Every daily report, dashboard "today" tile and
range filter was wrong for the first 5.5 hours of every business day. A second
bug mixed UTC (`toISOString`) with device-local (`getDate()`) arithmetic in the
reports filter, so results differed by device.

**Zero occurrences of `toISOString().slice(0,10)` remain** outside the
documentation comment in `datetime.js`. Display formatters also pin
`timeZone: 'Asia/Kolkata'`, so a phone set to the wrong timezone no longer
relabels shifts.

Verified at boundaries: `18:29:59.999Z → 14 Sep`, `18:30:00Z → 15 Sep`, plus
month/year/leap-year rollovers.

---

## 6. Firebase and demo-mode behaviour

- **Demo mode is explicit only** — entered solely when `isDemoConfig()` says so.
- **A Firebase failure is fatal and visible.** `initFirebase()` throws; `app.js`
  renders a blocking screen stating data will not be saved, with a Retry button.
  It does not fall through to a login screen backed by localStorage.
- `loadAuthModule`/`loadFirestoreModule` call `assertBackendReady()`, so a
  late-failing connection surfaces as an error instead of a silent no-op write.
- `getFirebaseStatus()` now reports `{isDemo, configured, initialized, error}`.
- **Audit logging is real.** Appends actor/role/station/action/entity/metadata/
  timestamp. Rules make `auditLogs` append-only — `update` and `delete` are
  `if false` for *everyone*, entries cannot be attributed to another user, and
  only manager+ can read them. Failures are logged to console and never roll
  back the user's action.
- **`js/firebase-config.js` is byte-identical to `main`.** Auth credential
  derivation (`@fuelops.app`, `FuelOps#<pin>#2024`) and all five
  `fuelops_*` localStorage keys are unchanged — altering any of them would lock
  out every existing user.

---

## 7. Firestore rules summary

Default-deny with an explicit catch-all. Helpers: `isActive()` (requires an
existing profile with `status == 'active'`), `canAccessStation()`,
`readInMyStation()`, `writeInMyStation()`, `stationUnchanged()`, `keeps()`,
`onlyTouches()`.

| Collection | Read | Create | Update | Delete |
|---|---|---|---|---|
| `users` | self or manager+ | self-bootstrap, else admin+ (never super_admin) | self (not role/stations/status), else admin+ | owner+ |
| `stations` | station members | owner+, `ownerId == self` | admin+, `ownerId` frozen | super_admin, or owning owner |
| `pumps` | station | manager+ | manager+ | owner+ |
| `nozzles` | station | manager+ | manager+, **or `lastReading` only** | owner+ |
| `prices` | station | manager+ | manager+, **`effectiveTo` only** | **never** |
| `shifts` | station | self, `ACTIVE` only | manager+, or own `ACTIVE`/`REJECTED` shift with approval fields frozen | owner+ |
| `transactions` | station | station, `amount >= 0`, `createdBy == self` | manager+, or settlement fields only | owner+ |
| `nozzleLocks` | station | station member | holder or manager+ | holder or manager+ |
| `auditLogs` | manager+ | self-attributed only | **never** | **never** |
| `notes`, `settlements`, `assignments` | station | per role | per role | owner+ |
| everything else | **denied** | **denied** | **denied** | **denied** |

Full permission matrix is in the README.

---

## 8. Tests performed

**168 assertions, all passing**, via Node harnesses against the real service
modules with an in-memory Firestore substitute.

| Suite | ✓ | Covers |
|---|---:|---|
| Dates & money | 44 | IST boundaries, rollovers, rounding, strict parsing, closing≥opening |
| Shift lifecycle | 37 | Ownership, station isolation, approval authz, **concurrent nozzle race**, price snapshots |
| Credit ledger | 34 | Append-only payments, status transitions, overpayment, write-off authz |
| Legacy data | 8 | Pre-existing documents read + upgrade in place |
| Privilege escalation | 19 | Self-escalation, super_admin protection, cross-station assignment |
| Prices/equipment/stations | 26 | Role checks, append-only price history, attendant field restrictions |

Highlights against the requested matrix:

- **`closing="abc"` → validation error, not 0.** Confirmed the shift document is
  left untouched.
- **Midnight IST:** `2026-09-14T19:00:00Z` → business date `2026-09-15`
  (old code: `2026-09-14`).
- **Concurrent nozzle assignment:** two `startShift` calls racing for the same
  nozzle → exactly 1 fulfilled, 1 rejected, nozzle in exactly 1 ACTIVE shift,
  loser's shift rolled back. This test **caught a real bug**: my first demo-mode
  transaction helper yielded on `await` and let both callers win; fixed with a
  promise-chain mutex.
- **Price history:** old row retained and closed with `effectiveTo`; historical
  lookup returns the old price, current returns the new; a mid-shift nozzle is
  billed at ₹110 while the original is billed at ₹100 in the same shift.
- **Firebase failure:** `initFirebase()` throws rather than returning demo.

Also verified: every JS file parses; every relative import resolves; all assets
return HTTP 200; `firestore.indexes.json` is valid JSON; `firebase-config.js` is
byte-identical to `main`; auth credential derivation and all localStorage keys
unchanged.

### Not verified locally — Firestore rules

**`tests/firestore-rules.test.mjs` has NOT been executed.** The emulator
downloads its JAR from `storage.googleapis.com`, which is blocked in this
environment (npm, PyPI and GitHub are reachable; Google Storage, gstatic,
jsdelivr, unpkg and dl.google.com are not). I installed `firebase-tools` and a
JDK 25 runtime and started the emulator — it failed at the JAR download.

The rules are therefore **reviewed and unit-tested in intent, but not
machine-verified.** Run before deploying:

```bash
npm install --no-save @firebase/rules-unit-testing firebase-tools firebase
npx firebase emulators:exec --only firestore --project fuelops-test \
  "node tests/firestore-rules.test.mjs"
```

No browser automation was available either (Playwright cannot install), so UI
flows were verified by reading the call sites and exercising the underlying
services directly, not by clicking through the app.

---

## 9. Documentation updated

The README previously claimed the rules already enforced station isolation,
attendant-only-own-shifts, approved-shift locking, append-only price history and
no role escalation. **None of that was true** — documenting it as done actively
hid the risk.

- Replaced with the real five-role permission matrix and station-isolation model.
- Added a **Known Gaps** section: client-computed totals, float rupees.
- Corrected the PWA section — **there is no offline data sync**; the shell is
  cached but work entered offline is not queued and will not be saved.
  ("Advanced offline sync" moved to the not-built list as "Offline data sync".)
- Documented real formulas (including expenses), per-nozzle price snapshots, the
  Asia/Kolkata rule, and rules/index deploy order.
- Marked the audit trail as implemented.

---

## 10. Remaining risks

1. **Rules are not machine-verified.** Highest residual risk — §8. Run the suite
   before deploying.
2. **Financial totals are still client-computed.** Rules prevent editing them
   after approval and raw inputs are preserved, but a crafted request could
   submit inconsistent totals for review. Fully closing this needs a Cloud
   Function recomputing totals from `declared` + server price history on
   submission. The brief asked me not to add Cloud Functions without justifying
   it in advance — **this is that justification, not a completed change.**
   `totals.computedFrom: 'client'` marks every affected document.
3. **Money is float rupees.** Mitigated by one rounding choke point; integer
   paise proposed in §3.
4. **Indexes must be deployed before the rules.** The app now issues composite
   queries that fail without `firestore.indexes.json`. Deploy indexes first.
5. **Client-side role checks are UX, not security.** Deliberate: the service
   layer gives friendly messages, the rules are the boundary. Both were changed
   together — I did not fix any backend authorization problem by hiding a button.
6. **Existing data predates the new fields.** Legacy credits lack `payments[]`
   and legacy shifts lack `declared`. Reads handle this (tested); the fields
   appear on next write. No backfill was run.
7. **Demo mode has no server enforcement** — it is a localStorage sandbox and
   always was. Now at least it can only be entered deliberately.
8. **The `users` bootstrap rule** lets an unclaimed uid create its own profile,
   needed for first-run super-admin setup. It cannot self-assign `super_admin`
   via the admin path, but the bootstrap path is a deliberate trade-off — after
   initial setup, consider tightening it to `if false`.
9. **Shift states were not renamed** — §3. A deliberate compatibility choice.
10. **This branch has unrelated Git history with `main`.** These commits sit on
    top of `main`'s code but the branches share no ancestor, so a plain merge
    will not work. Cherry-pick the 10 commits onto `main`, or reset `main` to
    this tree.
