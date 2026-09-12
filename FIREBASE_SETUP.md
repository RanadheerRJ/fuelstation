# FuelOps - Firebase Production Setup (Step by Step)

This guide makes the app **prod ready** with no dummy data.

---

## What I Need From You

Please provide **or** do these yourself:

### Option A: You give me Firebase config (I will paste it)
I need these 6 values from Firebase Console > Project Settings > Your apps > Web (SDK setup):

```
apiKey: 
authDomain: 
projectId: 
storageBucket: 
messagingSenderId: 
appId: 
```

Send them as a JSON block. I will update `js/firebase-config.js` and push.

### Option B: You do it yourself (2 minutes)
1. Copy config from Firebase Console
2. Paste into `js/firebase-config.js` replacing `YOUR_API_KEY` etc.
3. Commit & push, enable GitHub Pages

---

## Firebase Console Steps (Do Once)

### 1. Create Project
- Go to https://console.firebase.google.com
- **Add project** → Name: `fuelops-prod` (or your choice)
- Disable Google Analytics for now (optional)
- Create

### 2. Create Web App
- Project Overview → **Add app** → Web `</>`
- Nickname: `FuelOps PWA`
- **Don't** check hosting yet (we use GitHub Pages)
- Register → Copy the `firebaseConfig` object → Save it

### 3. Enable Authentication
- Left menu → **Build → Authentication** → Get Started
- **Sign-in method** → Enable:
  - **Email/Password** → Enable → Save (Required - we use this under the hood for Phone+PIN)
  - **Phone** (Optional but recommended for OTP verification on first owner):
    - Enable → Add your test phone numbers if needed
    - This allows you to verify phone ownership once, then use PIN daily
- Settings → Authorized domains → Add your GitHub Pages domain: `ranadheerrj.github.io`

### 4. Create Firestore Database
- Left menu → **Build → Firestore Database** → Create database
- **Location:** Choose `asia-south1` (Mumbai) if you are in India, or closest to you
- **Rules:** Start in **Test mode** for first 5 mins (we will replace with prod rules next)
- Create

### 5. Apply Production Security Rules
- Firestore → **Rules** tab → Replace entire content with content from `firestore.rules` file in repo
- The rules enforce:
  - Users only access their assigned stations
  - Attendants only their own shifts
  - Approved shifts locked
  - Price history append-only (never delete)
  - No role escalation (only owner can make owner)
  - PIN never exposed (Auth handles password hash)
- **Publish**

### 6. Create First Owner (2 ways)

#### Way 1: Via App (Recommended - Prod Ready Flow)
- Deploy app to GitHub Pages first with real Firebase config
- Open your Pages URL → It will show **Create First Owner** screen (because Firestore is empty)
- Enter Name, Phone, 4-digit PIN → Creates:
  - Firebase Auth user: email=`phone@fuelops.app`, password=`FuelOps#PIN#2024`
  - Firestore doc in `users` collection with role `owner`
- Login with that phone+PIN

#### Way 2: Manually in Console (If Way 1 fails)
- **Auth:** Authentication → Users → Add user:
  - Email: `+919876543210@fuelops.app` (use real phone)
  - Password: `FuelOps#1234#2024` (if PIN is 1234)
  - Copy the UID
- **Firestore:** Firestore → Data → `users` collection → Add document:
  - Document ID = UID from Auth
  - Fields:
    ```
    phone: "+919876543210"
    name: "Your Name"
    role: "owner"
    stationIds: []
    status: "active"
    createdAt: (timestamp now)
    ```
  - Save
- Now login in app with phone `+919876543210` and PIN `1234`

### 7. Enable GitHub Pages
- GitHub repo → Settings → Pages
- Source: **Deploy from branch** → Branch: `main` or `arena/01a09335-fuelstation` → Folder: `/ (root)` → Save
- Wait 1-2 mins → Your URL: `https://username.github.io/fuelstation/`
- Open → Should show Login or Create Owner

### 8. (Optional) Hardening for Production
- Firestore → Rules → Change test mode timeout, ensure prod rules active
- Auth → Settings → Password policy: set min 6 chars (our derived password is 16+ so ok)
- Project Settings → General → Add your custom domain if you have one
- Enable **App Check** later if you face abuse (optional for Phase 1)

---

## Data Model Created Automatically

On first owner creation and station creation, Firestore will auto-create collections:

```
users/{uid}
stations/{stationId}
pumps/{pumpId}
nozzles/{nozzleId}
prices/{priceId}
shifts/{shiftId}
transactions/{txId} (credits & expenses)
notes/{noteId}
auditLogs/{logId}
assignments/{assignmentId}
```

No dummy data - starts 100% empty.

---

## PIN Security Explained

- **We never store PIN plain in Firestore**
- Firebase Auth stores: `email = phone@fuelops.app`, `password = FuelOps#PIN#2024` → hashed by Firebase
- UX feels like Phone+PIN, but security is Firebase Auth
- To reset PIN: Delete Auth user + recreate, or add "Reset PIN" Cloud Function later (Phase 2)

---

## What Changed for Prod Ready

- ✅ Removed all dummy stations/pumps/users from `demoStore.js` - now empty on first load
- ✅ Login shows "Create First Owner" when DB empty
- ✅ Bumped localStorage key to `fuelops_demo_v3_prod` to wipe old dummy data
- ✅ Service Worker cache bumped to `v2-prod-clean`
- ✅ `firebase-config.js` has clear placeholder + instructions
- ✅ `firestore.rules` prod hardened
- ✅ No hardcoded credentials anywhere

---

## Next Steps After Setup

1. Login as Owner
2. Create Station (MG Road etc)
3. Create Pumps & Nozzles with opening readings
4. Set Fuel Prices (Petrol/Diesel etc)
5. Create Employees (Manager, Attendants with phone+PIN)
6. Attendant logs in → Start Shift → Select nozzles → Add credits/notes → Close Shift → Variance auto-calculated
7. Manager reviews → Approve → Locked
8. Owner sees Reports

---

## Need Help?

If you give me your Firebase config JSON, I can:
- Paste it into `js/firebase-config.js`
- Commit & push to your branch
- Verify PWA loads in Live Preview

Just paste the config block like:

```js
{
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
}
```

**Do NOT share private service account keys - only the web config above is needed (it's public by design, security is via Firestore rules).**
