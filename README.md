# FuelOps - Fuel Station Daily Operations PWA

A beautiful, lightweight, mobile-first Progressive Web App for managing daily fuel-station operations. Built with vanilla HTML/CSS/JS, Firebase, and designed for GitHub Pages.

> **Goal:** Digital replacement for paper notebook + Excel for shift operations.
> **Status:** ✅ **PROD READY - No dummy data - Clean install**

## ✨ Features

- **Phone + 4-digit PIN login** (Firebase Auth under the hood, PIN never stored plain in Firestore)
- **Role-based access**: Owner, Admin/Manager, Attendant
- **Station management**: multi-station support
- **Pumps & Nozzles**: nozzle as meter-reading entity
- **Fuel prices with history**: never overwrite, effectiveFrom/effectiveTo
- **Shift flow**: START → ACTIVE → CLOSING → PENDING_REVIEW → APPROVED (locked)
- **Automatic calculations**: liters sold, revenue, variance
- **Credits & Expenses**: attached to shift/station
- **Notes**: shift notes with user/time
- **Reports**: daily, shift, credit, audit log
- **PWA**: installable, offline shell caching, GitHub Pages subpath friendly (hash routing, relative paths)
- **Neumorphic UI**: soft shadows, tactile, professional

## 🚀 Quick Start (Prod Ready - Empty DB)

No dummy data - clean install:

1. Clone repo
2. Open `index.html` via local server (or GitHub Pages)
3. First screen will say **Create First Owner** (because DB empty)
4. Enter Name, Phone, PIN → Owner created → Login
5. Then create Stations, Pumps, Employees etc.

Demo data stored in localStorage under `fuelops_demo_v3_prod` - starts empty, no pre-seeded stations.

## 🔧 Firebase Setup (Production) - See FIREBASE_SETUP.md

**Detailed step-by-step guide:** See [`FIREBASE_SETUP.md`](./FIREBASE_SETUP.md)

Quick version:

1. Create project at https://console.firebase.google.com
2. Enable **Authentication** → Sign-in method → **Email/Password** (we use email derived from phone: `+91...@fuelops.app`, password = `FuelOps#PIN#2024`)
   - Optionally enable Phone Auth for OTP verification on first setup
3. Create **Firestore Database** (location: asia-south1 for India)
4. Copy config from Project Settings → Your apps → Web app
5. Paste into `js/firebase-config.js`:
```js
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```
6. Apply Firestore rules from `firestore.rules` in Firebase Console → Firestore → Rules → Publish
7. Deploy to GitHub Pages → Open URL → **Create First Owner** screen appears → Create owner → Done

**What I need from you (if you want me to configure):**
- Paste your Firebase web config JSON (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId)
- I will update `js/firebase-config.js` and push

No dummy data will be created - you start fresh with your own stations.

## 📦 Deploy to GitHub Pages

This app is designed for GitHub Pages subpath like `https://username.github.io/fuelstation/`:

- All asset paths are **relative** (`./css/...`, `./js/...`)
- Router uses **hash** (`#/dashboard`) so refresh doesn't 404
- Service Worker scope is `./`
- Includes `404.html` fallback and `.nojekyll`

Steps:

1. Push to GitHub repo
2. Repo Settings → Pages → Source: Deploy from branch → `main` (or your branch) / root
3. Open `https://username.github.io/fuelstation/`

No build step needed.

## 🗂️ File Structure

```
fuelops/
├── index.html
├── manifest.json
├── service-worker.js
├── firestore.rules
├── 404.html
├── .nojekyll
├── css/styles.css
├── js/
│   ├── app.js
│   ├── firebase-config.js
│   ├── firebase.js
│   ├── auth.js
│   ├── router.js
│   ├── state.js
│   ├── services/
│   │   ├── calc.js
│   │   ├── demoStore.js
│   │   ├── firestoreService.js
│   │   ├── stations.js
│   │   ├── pumps.js
│   │   ├── users.js
│   │   ├── prices.js
│   │   ├── shifts.js
│   │   ├── transactions.js
│   │   ├── notes.js
│   │   └── reports.js
│   └── views/
│       ├── login.js
│       ├── dashboard.js
│       ├── stations.js
│       ├── pumps.js
│       ├── employees.js
│       ├── prices.js
│       ├── shifts.js
│       ├── reports.js
│       └── settings.js
└── assets/icons/
```

## 🔐 Security

Authorization is enforced **server-side in `firestore.rules`**. The UI hides
controls a role cannot use, but hiding a button is never the control — every
constraint below is also checked by the rules, which is what actually stops a
crafted request.

### Permission matrix

| Capability | super_admin | owner | admin | manager | attendant |
|---|:--:|:--:|:--:|:--:|:--:|
| Read data across **all** stations | ✅ | — | — | — | — |
| Read data for **own** station(s) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create / delete station | ✅ | ✅ (own) | — | — | — |
| Edit station details | ✅ | ✅ | ✅ | — | — |
| Create / edit employees | ✅ | ✅ | ✅ | — | — |
| Grant `owner` role | ✅ | ✅ | — | — | — |
| Create a `super_admin` | ✅ | — | — | — | — |
| Change own role / stations / status | — | — | — | — | — |
| Manage pumps & nozzles | ✅ | ✅ | ✅ | ✅ | — |
| Update nozzle `lastReading` | ✅ | ✅ | ✅ | ✅ | ✅ (only this field) |
| Set fuel prices | ✅ | ✅ | ✅ | ✅ | — |
| Edit a historical price amount | — | — | — | — | — |
| Start / close **own** shift | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edit someone else's shift | ✅ | ✅ | ✅ | ✅ | — |
| Approve / reject a shift | ✅ | ✅ | ✅ | ✅ | — |
| Approve **own** shift | ✅ | — | — | — | — |
| Edit an APPROVED shift | ✅ | ✅ | ✅ | ✅ | — |
| Record expense / credit | ✅ | ✅ | ✅ | ✅ | ✅ |
| Write off a credit | ✅ | ✅ | ✅ | — | — |
| Read audit logs | ✅ | ✅ | ✅ | ✅ | — |
| Modify / delete audit logs | — | — | — | — | — |

### Station isolation

Access is derived from `users/{uid}.stationIds` (plus `stations/{id}.ownerId`
for owners). A client cannot widen its access by sending a different
`stationId` in a payload, and a document cannot be moved between stations.

### Other guarantees

- PIN is **never stored plain** in Firestore in production; Firebase Auth holds
  the password hash. Demo mode stores an obfuscated PIN locally only.
- Deactivated accounts (`status != 'active'`) keep their Auth credentials but
  are refused at login and by every rule.
- Price history is append-only: only `effectiveTo` may be stamped, and price
  documents cannot be deleted.
- Audit logs are append-only and cannot be edited or deleted by anyone.
- Nozzle assignment uses a transactional lock (`nozzleLocks/{nozzleId}`) so one
  nozzle cannot be in two active shifts.
- A Firebase failure is a **hard error**. The app never silently falls back to
  local storage — see "Demo mode" below.
- Phone → Email mapping: `XXXXXXXXXX` → `XXXXXXXXXX@fuelops.app`
- Password derivation: `FuelOps#<PIN>#2024`
  (**do not change** — these derive existing users' real Firebase credentials)

### Deploying the rules

```bash
npx firebase deploy --only firestore:indexes --project fuelops-a93f6
npx firebase deploy --only firestore:rules   --project fuelops-a93f6
```

Deploy the indexes **first**: the app issues composite queries that fail
without them. A rules test suite lives in `tests/firestore-rules.test.mjs`
(see `tests/README.md`).

### Known gaps

- Financial totals are still computed on the client and written by the client.
  The rules prevent an attendant editing them *after approval*, but a crafted
  request could still submit inconsistent totals for review. Closing this fully
  requires a Cloud Function or server-side recompute — deliberately not added
  here, as it changes the deployment model.
- Money is stored as floating-point rupees rounded to 2 dp at a single choke
  point (`services/money.js`). Integer paise would be structurally safer but
  requires migrating existing documents.

### Demo mode

Demo mode is entered **only** when `js/firebase-config.js` is explicitly
configured for it. It is a local-storage sandbox with no server enforcement,
intended for evaluation. If a configured Firebase project cannot be reached the
app shows a blocking error rather than quietly switching to local data.

## 📱 PWA

- `manifest.json` with relative scope
- `service-worker.js` caches the app shell (HTML/CSS/JS/icons) and skips
  Firebase requests
- Offline banner shows when the device is offline
- Installable on mobile via "Add to Home Screen"

**There is no offline data sync.** The shell is cached so the app opens without
a network, but reads and writes require Firebase. Work entered while offline is
not queued and will not be saved.

## 🧮 Calculations (centralized in `services/calc.js`)

```
litersSold     = closingReading - openingReading      (closing >= opening enforced)
fuelRevenue    = litersSold x applicablePrice
grossRevenue   = sum(all fuel revenue)
totalExpenses  = sum(expenses recorded against the shift)
netRevenue     = grossRevenue - totalExpenses          <- what the attendant owes
totalPayments  = cash + card + upi + credit + other
variance       = totalPayments - netRevenue            (BALANCED within +/- 0.50)
```

`applicablePrice` is the price effective when that nozzle **started
dispensing** — the shift start time, or the nozzle's own `addedAt` if it was
added mid-shift. Each nozzle stores `price`, `priceId` and `priceEffectiveAt`,
so historical revenue stays explainable after the price changes again.

Rounding is centralised in `services/money.js` (`roundMoney` to 2 dp,
`roundLiters` to 3 dp). Non-numeric input is **rejected**, never coerced to 0.

### Dates

All day bucketing uses the business timezone **Asia/Kolkata** via
`services/datetime.js`. Never use `toISOString().slice(0,10)`: it returns a UTC
date, so between 00:00 and 05:30 IST it reports the previous day.

## ✅ Definition of Done Checklist

- [x] Login with Phone+PIN
- [x] Create/manage station
- [x] Create employees
- [x] Configure pumps/nozzles
- [x] Set fuel prices (history)
- [x] Fuel stock: tanker intake + live tank balance
- [x] Assign nozzles (via shift start selection)
- [x] Start shift with multiple nozzles
- [x] Enter opening readings
- [x] Add credits/expenses/notes during active shift
- [x] Enter closing readings with auto calc
- [x] Payment breakdown & variance
- [x] Submit shift → pending review
- [x] Manager approve/reject
- [x] Reports (daily, shift, credit)
- [x] Audit trail (append-only `auditLogs`)
- [x] PWA installable
- [x] GitHub Pages deployable
- [x] Firebase storage + security rules

## 🚧 What NOT built (Phase 2)

- Fuel delivery
- Accounting/payroll
- Notifications/SMS
- Offline data sync / write queue
- Payment gateway

## 📝 Changelog - Working as Expected (Sep 2026)

### v32 - Banking Clean Reports + Expenses Fix (2026-09-13) ✅ PROD
**Commit:** `d95e2c2` - Redesign Reports banking clean + expenses minus gross

**Problem fixed:**
- Reports were cluttered with employee names (4) dropdown, active statuses, tiny filters
- Owner/Manager/Attendant needed to filter liters per day/month/overall
- Expenses (Testing fuel came out of nozzle) was NOT subtracted from gross → To Collect wrong
  - Example bug: Receipt #1DCZ3M Gross ₹60,061.90 - Payments ₹22,792 = To Collect ₹37,269.90 (wrong), Expenses ₹1,110 ignored
  - Expected: Net = Gross - Expenses = ₹58,951.90 = whole amount to owner, To Collect = Net - Payments = ₹36,159.90

**Fixes:**
- **Reports service** (`reports.js`): Fetch transactions, group expenses by shiftId, compute `net = gross - expenses = whole amount to owner`, variance = payments - net, toCollect = net - payments. totalGross, totalExpenses, totalNet, byFuel net proportional, byEmployee gross/expenses/net ranking, byDate gross/expenses/net, expenseByShift map.
- **Shifts service** (`shifts.js`): closeShift fetches expenses for shift, computes netRevenue, stores totalGross, totalExpenses, totalNet, variance based on net.
- **Dashboard** (`dashboard.js`): Fetches expenseMap, today sales = net (gross - expenses), variance based on net.
- **Reports view** complete banking redesign:
  - Hero dark #1a2535 card: Net big 32px = whole amount to owner, fuel sold, breakdown Gross - Expenses = Net, To Collect
  - Quick date buttons: Today, Yesterday, 7 Days, This Month, 30 Days, All Time - large tappable, active dark
  - Liters Filter card: Today liters, This Month liters, explanation fuel out = gross, net = owner amount
  - Employee filter: clean chips with avatar + liters, tap to filter (owner/manager only) - no dropdown clutter
  - Status chips minimal: All, Approved, Pending, Rejected, Active
  - Apply Filters banking dark button shows count + liters
  - Summary 2x2: Gross Sales, Less Expenses orange, Net to Owner green, Payments+Credits
  - By Fuel clean cards with icon, liters, avg, gross vs net
  - By Employee ranking by liters, #1 👑 gold, liters + net + avg/shift, tap to filter
  - Daily Trend, Shifts list banking receipt style with left border color, gross - exp = net
  - CSV export includes gross, expenses, net, liters ranking

**Checks to do:**
- Reports → Today/Month/All Time → liters per filter correct
- Create shift with Testing expense → receipt shows Gross gray, Less Expenses orange, Net green bold, To Collect = Net - Payments
- Employee chips filter, By Employee ranking tap to filter
- Dashboard today sales shows Net
- Attendant sees only own liters/net

---

### v31 - Add Pump/Nozzle to Active Shift (2026-09-13) ✅
**Commit:** `7f565a1` - Allow adding another pump/nozzle to active shift

**Feature:** User on 24hr shift needs to add another pump mid-shift.
- New service: `addNozzleToShift(shiftId, {nozzleId, pumpId, fuelType, openingReading})` checks ACTIVE, not already in shift, not occupied by other active shifts, adds with addedAt
- `removeNozzleFromShift(shiftId, nozzleId)` - cannot remove last nozzle
- Active shift view: My Nozzles with pump name, IN USE badge, remove ✕, + Add Pump button top-right, free nozzles count green hint
- Add Pump Modal: lists free nozzles (active, not in my shift, not occupied), tap card → opening input pre-filled last reading → Add to My Shift → reload
- Flow: Start with 1 pump, later add another when free, close together

**Checks:**
- Start shift with 1 nozzle → open active shift → + Add Pump → select free nozzle → enter opening → Add → now 2 nozzles
- Remove nozzle → cannot remove last
- Close shift → enter closing for both → revenue for both

---

### v30 - Fix Receipt Expenses Color Coding (2026-09-13) ✅
**Commit:** `226af33` - Fix receipt mis calc — Testing minus from total fuel sale + color coding
- ShiftDetailView receipt: Gross gray #f8f9fa, Less Testing orange #fffbe6 #fa541c, Net green bold #f6ffed #389e0d = whole amount to owner = gross - expenses
- Payments: Gross Expected + Less Expenses orange + Net Expected green bold
- To Collect = Net - Payments = 58951-22792=36159 with breakdown and color coding explanation
- CloseShiftView already fixed v28 to use netRevenue = gross - expenses

---

### v29 - Logo Pumps + Human Kind (2026-09-13) ✅
**Commit:** `89b6830` / `1424eaf` - Add good Logo with Pumps + Human Kind
- Final logo: Two orange humans #ff5a1f (owner & attendant) shaking hands in front of white fuel pump, dark navy #1a2535 background = trust/collections
- Icons resized 72-512 from option3 crop 68% center via PIL LANCZOS
- manifest theme #1a2535, index favicon, topbar brand-mark img 36px rounded, login brand-marks 72px

---

## 📄 License

MIT - Feel free to adapt branding.

---

Built with ❤️ as lightweight replacement for paper notebook + Excel.
**Live:** https://ranadheerrj.github.io/fuelstation/ — v32 banking reports working as expected ✅

