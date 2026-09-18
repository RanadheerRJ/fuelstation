# Resetting Station Data (Keep User Profiles)

Use this when you want a clean slate: **all station/operational data is deleted, user profiles are kept**.

This is a **development/maintenance operation** that must run with the Firebase Admin SDK from your
machine. It cannot be done from the app UI: the [Firestore Security Rules](../firestore.rules)
intentionally make `stations`, `prices`, `shifts`, `transactions`, `notes` and `settlements`
append-only / non-deletable for every client role — including super admin. The Admin SDK bypasses
the rules, so only the project owner (you) can run this.

## What gets deleted

| Collection                        | Action                          |
| --------------------------------- | ------------------------------- |
| `users`                           | ✅ **Kept** — profiles preserved, `stationIds` reset to `[]` |
| `stations`                        | 🗑️ Deleted                      |
| `pumps`, `nozzles`                | 🗑️ Deleted                      |
| `prices`, `tankStocks`            | 🗑️ Deleted                      |
| `shifts`, `transactions`, `notes` | 🗑️ Deleted                      |
| `assignments`, `settlements`      | 🗑️ Deleted                      |
| `auditLogs`                       | 🗑️ Deleted                      |
| *any other collection*            | 🗑️ Deleted (everything except `users` is swept) |

Notes:

- **Firebase Auth accounts are untouched.** All users can still log in with phone + PIN after the
  purge. If you also want Auth accounts gone, delete them in the Firebase console.
- User profile documents keep `name`, `phone`, `role`, `status`, etc. Only the `stationIds`
  reference array is reset, so no profile points at a deleted station. Use `--keep-station-ids`
  to skip even that.
- After purging, re-inviting owners/stations is done from the Super Admin panel (`#/super-admin`).

## 1. Get a service account key (one time)

1. Open [Firebase console](https://console.firebase.google.com) → project **fuelops-a93f6**
2. ⚙️ **Project settings → Service accounts**
3. **Generate new private key** → save as e.g. `~/fuelops-prod-key.json`
4. ⚠️ **Keep this file out of the repo** (the `.gitignore` blocks `*-firebase-adminsdk*.json` as a
   safety net). Store it outside the project folder.

## 2. Dry run first (default — deletes nothing)

```bash
npm run purge:station-data
```

With the key via environment variable:

```bash
GOOGLE_APPLICATION_CREDENTIALS=~/fuelops-prod-key.json npm run purge:station-data
```

or via flag:

```bash
npm run purge:station-data -- --key ~/fuelops-prod-key.json
```

Output shows exactly what **would** be deleted (`would delete 4 stations`, etc.).

## 3. Apply the purge

```bash
GOOGLE_APPLICATION_CREDENTIALS=~/fuelops-prod-key.json npm run purge:station-data -- --apply
```

- Interactive terminal: you must type `PURGE` to confirm.
- Scripts / non-interactive: add `--yes`.

The tool verifies afterwards that every non-`users` collection is empty and exits non-zero if
anything is left.

## Flags

| Flag                 | Meaning                                             |
| -------------------- | --------------------------------------------------- |
| *(none)* / `--dry-run` | Count only — no writes                            |
| `--apply`            | Actually delete                                    |
| `--yes`, `-y`        | Skip the confirmation prompt                        |
| `--keep-station-ids` | Don't reset `users.stationIds` to `[]`              |
| `--key <path>`       | Service account key JSON                            |
| `--project <id>`     | Project ID (default: parsed from `js/firebase-config.js`) |

## Testing

- Unit tests (no database needed): `npm run test:purge`
- Against the Firestore emulator (safe, local):

  ```bash
  firebase emulators:start --project demo-fuelops --only firestore
  FIRESTORE_EMULATOR_HOST=localhost:8080 npm run purge:station-data -- --apply --yes
  ```

## Safety properties

- **Dry run by default** — you must pass `--apply` to change anything.
- Explicit confirmation (`PURGE`) in interactive mode; `--yes` required when non-interactive.
- Only top-level collections other than `users` are touched; `users` documents are never deleted.
- Deletes run in ≤ 500-op write batches; a post-purge verification re-counts everything.
