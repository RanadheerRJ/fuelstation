# Tests

## Firestore security rules — `firestore-rules.test.mjs`

Exercises `firestore.rules` against the Firestore emulator: station isolation,
role escalation, shift ownership and lifecycle, price history immutability,
nozzle locks, append-only audit logs.

```bash
npm install --no-save @firebase/rules-unit-testing firebase-tools firebase
npx firebase emulators:exec --only firestore --project fuelops-test \
  "node tests/firestore-rules.test.mjs"
```

Requires Java 11+ on PATH (the emulator is a JVM process) and outbound access
to `storage.googleapis.com`, from which the emulator JAR is downloaded.

**This suite has not been executed yet** — the environment the hardening work
was done in blocks `storage.googleapis.com`, so the emulator could not start.
Run it before deploying the rules.

## Deploying the rules

```bash
npx firebase deploy --only firestore:rules,firestore:indexes --project fuelops-a93f6
```

Deploy the indexes in `firestore.indexes.json` **before or with** the rules:
the app now issues composite queries that will fail without them.
