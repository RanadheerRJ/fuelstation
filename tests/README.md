# Tests

## Firestore security rules — `firestore-rules.test.mjs`

Exercises `firestore.rules` against the Firestore emulator: station isolation,
role escalation, shift ownership and lifecycle, price history immutability,
nozzle locks, append-only audit logs.

### Easiest: let GitHub run it

The suite runs automatically in GitHub Actions on any push that touches
`firestore.rules`, `firestore.indexes.json` or `tests/`. Open the **Actions**
tab → **Firestore Rules** to see the result. Nothing to install.

### Running it locally

```bash
npm install
npm run test:rules
```

Requires Java 11+ on PATH (the emulator is a JVM process) and outbound access
to `storage.googleapis.com`, from which the emulator JAR is downloaded.

The suite runs against a throwaway project id (`fuelops-test`) in an in-memory
emulator. It never touches the real `fuelops-a93f6` data.

**This suite has not yet been executed successfully.** The environment the
hardening work was done in blocks `storage.googleapis.com`, so the emulator
could not download its JAR. The configuration was verified as far as that
download. Let the GitHub Actions run confirm it.

## Deploying the rules

### From GitHub (recommended)

Actions tab → **Firestore Rules** → **Run workflow** → type `deploy` in the
input box. It re-runs the tests first and refuses to deploy if they fail.

Requires a `FIREBASE_TOKEN` repository secret (Settings → Secrets and
variables → Actions). Generate one with `npx firebase login:ci`.

### From your machine

```bash
npm install
npx firebase login
npm run deploy:indexes   # must go first
npm run deploy:rules
```

**Deploy the indexes before the rules.** The app issues composite queries that
fail until the indexes in `firestore.indexes.json` exist.
