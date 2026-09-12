# FuelOps - Fuel Station Daily Operations PWA

A beautiful, lightweight, mobile-first Progressive Web App for managing daily fuel-station operations. Built with vanilla HTML/CSS/JS, Firebase, and designed for GitHub Pages.

> **Goal:** Digital replacement for paper notebook + Excel for shift operations.

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

## 🚀 Quick Start (Demo Mode)

No Firebase needed to try UI:

1. Clone repo
2. Open `index.html` via local server (or GitHub Pages)
3. Login with demo creds:
   - Owner: `+919999999999` / `1111`
   - Manager: `+919999999998` / `2222`
   - Attendant: `+919999999997` / `3333`

Demo data stored in localStorage.

## 🔧 Firebase Setup (Production)

1. Create project at https://console.firebase.google.com
2. Enable **Authentication** → Sign-in method → **Email/Password** (we use email derived from phone: `+91...@fuelops.app`, password = `FuelOps#PIN#2024`)
   - Optionally enable Phone Auth for OTP verification on first setup
3. Create **Firestore Database**
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
6. Apply Firestore rules from `firestore.rules` in Firebase Console → Firestore → Rules
7. Create first owner user:
   - Either via app's Employees → Add (will create Firebase Auth user)
   - Or manually in Firebase Auth + add doc in `users` collection:
```json
{
  "phone": "+919999999999",
  "name": "Owner",
  "role": "owner",
  "stationIds": [],
  "status": "active"
}
```
UID must match Auth UID.

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

## 🔐 Security Notes

- PIN is **never stored plain** in Firestore in production. Firebase Auth holds password hash.
  - Demo mode stores obfuscated PIN locally only for convenience, clearly separated.
- Firestore rules enforce:
  - Users only access their stations
  - Attendants only own shifts
  - Approved shifts locked
  - Price history append-only
  - No role escalation
- Phone → Email mapping: `+919999999999` → `+919999999999@fuelops.app`
- Password derivation: `FuelOps#<PIN>#2024` (6+ chars required by Firebase)

For higher security, you can later switch to:
- Firebase Phone OTP for login + custom claims for role
- Cloud Functions to hash PIN server-side

## 📱 PWA

- `manifest.json` with relative scope
- `service-worker.js` caches app shell, skips Firebase requests
- Offline banner shows when offline
- Installable on mobile via "Add to Home Screen"

## 🧮 Calculations (centralized in `services/calc.js`)

```
litersSold = closingReading - openingReading
fuelRevenue = litersSold × applicablePrice (price active at shift start)
totalExpected = sum(all fuel revenue)
totalPayments = cash + card + upi + credit + other
variance = totalPayments - totalExpected
```

## ✅ Definition of Done Checklist

- [x] Login with Phone+PIN
- [x] Create/manage station
- [x] Create employees
- [x] Configure pumps/nozzles
- [x] Set fuel prices (history)
- [x] Assign nozzles (via shift start selection)
- [x] Start shift with multiple nozzles
- [x] Enter opening readings
- [x] Add credits/expenses/notes during active shift
- [x] Enter closing readings with auto calc
- [x] Payment breakdown & variance
- [x] Submit shift → pending review
- [x] Manager approve/reject
- [x] Reports (daily, shift, credit, audit)
- [x] PWA installable
- [x] GitHub Pages deployable
- [x] Firebase storage + security rules

## 🚧 What NOT built (Phase 2)

- Inventory/tank monitoring
- Fuel delivery
- Accounting/payroll
- Notifications/SMS
- Advanced offline sync
- Payment gateway

## 📄 License

MIT - Feel free to adapt branding.

---

Built with ❤️ as lightweight replacement for paper notebook + Excel.
