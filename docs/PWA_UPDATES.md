# Why users were stuck on old versions (and how it's fixed)

You reported: "I push changes to `main`, but the live GitHub Pages site / installed
PWA on user phones keeps showing the old page, sometimes stuck on cache."

There were actually **two separate bugs** causing this — both are now fixed.

## Bug 1 (the big one): GitHub Pages wasn't deploying from `main`

Your repo's Pages settings were pointed at `arena/01a09335-fuelstation`, a leftover
branch from a previous Arena AI session — **not** `main`. So pushes to `main` were
never reaching the live site at all, regardless of any caching behavior.

### Fix
Added `.github/workflows/deploy.yml` — a GitHub Actions workflow that automatically
builds and deploys the site to GitHub Pages **on every push to `main`**. This is the
modern, recommended way to run GitHub Pages and does not depend on which branch is
picked in the old "Deploy from a branch" dropdown.

**One manual step required (5 minutes, one time only):**
1. Go to your repo on GitHub → **Settings → Pages**.
2. Under "Build and deployment" → **Source**, change it from
   "Deploy from a branch" to **"GitHub Actions"**.
3. Merge/push this branch to `main`. The `Deploy to GitHub Pages` workflow will run
   automatically (check the **Actions** tab) and publish the site.

After that, every future `git push` to `main` auto-deploys within ~1 minute — no
more guessing which branch is live.

## Bug 2: The service worker was cache-first and never told users to refresh

The PWA service worker (`service-worker.js`) cached the entire app shell
(HTML/JS/CSS) and served it **cache-first** — meaning once a phone had it cached,
it kept using the old code forever, even after a new version was deployed, unless
the user fully closed and reopened the app multiple times.

### Fix (3 parts, all already applied)

1. **Network-first for app code.** `service-worker.js` now fetches HTML/JS/CSS from
   the network first, and only falls back to the cached copy if the device is
   offline. Static, rarely-changing assets (icons) remain cache-first for speed.

2. **Automatic cache-busting version.** `scripts/bump-sw-version.js` computes a
   hash of every JS/CSS/HTML file and stamps it into `service-worker.js` as
   `CACHE_NAME`. This runs automatically as part of the GitHub Actions deploy
   (see workflow above), so **every commit that changes app code produces a
   different `service-worker.js` file** — which is what makes browsers notice
   there's an update at all. You never need to hand-edit a version string again.

3. **"Update available" banner.** `index.html` now watches for a new service
   worker being installed in the background and shows a banner:
   *"✨ A new version is available. [Refresh Now]"*. Tapping the button activates
   the new version and reloads immediately. The app also proactively checks for
   updates every hour and whenever the tab/app regains focus, so long-lived
   sessions (a phone left open all day) still get notified promptly.

## What this means going forward

- Push to `main` → GitHub Actions deploys automatically → your service worker file
  changes (new hash) → users' browsers detect the update in the background → they
  see a "Refresh Now" banner → one tap and they're on the latest version.
- If you ever need to force a refresh manually before this is merged, in your
  browser DevTools go to **Application → Service Workers → Unregister**, then
  hard-reload — but with this fix, that shouldn't be necessary anymore.
