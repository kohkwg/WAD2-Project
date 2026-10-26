# Testing and local operation

[README](../README.md) is the setup entry point; [status](../status.md) records dated
results and limits; [decisions](../decisions.md) records permissions/contracts.
There is no root runner or lint script. Use Node 22 and pnpm; preserve npm lockfiles.

## Setup and data modes

```sh
pnpm --dir client install --frozen-lockfile --ignore-scripts
pnpm --dir server install --frozen-lockfile --ignore-scripts
pnpm --dir client dev
# In another terminal, when recommendations/uploads are needed:
pnpm --dir server dev
```

Vite defaults to `http://127.0.0.1:5173`; Express health is
`http://127.0.0.1:3000/health`. Server `dev`/`start` load `server/.env` via
`--env-file`; `PORT` defaults to 3000. Express serves health, caller-JWT
recommendations and signed image-upload routes, not parallel Feature 4 CRUD.

| File | Names / purpose |
| --- | --- |
| `client/.env` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_R2_PUBLIC_URL`; optional `VITE_API_URL` (defaults to `http://127.0.0.1:3000`) and `VITE_USE_MOCK` |
| `server/.env` | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`; `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`; optional `PORT` |

Use the supplied `.env.example` templates and team-provided values. Both R2 public
URL names contain the same HTTPS bucket base, without trailing slash. They are
public locations, not credentials; upload credentials remain server-only.

Configured client Supabase selects live mode unless `VITE_USE_MOCK=true`.
Without keys, core event/RSVP/Feature 4 flows use isolated localStorage demo data.
Discover browses both modes; Profile editing, check-in and F6 require live mode.
Failed live writes never switch silently to demo. Reset demo data asks for
confirmation and reseeds relative event dates in that browser only.

## Check selection

Use only the necessary targeted checks for the changed flow. Full suites and
production builds require explicit user instruction; do not repeat them after
each visual adjustment. Source-only SFC compilation is not a production build.
Documentation-only work needs path/anchor, whitespace and source-preservation
checks, not browser/application tests.

## Local regressions

The broader commands below are available **when explicitly requested**. Run from
the repository root:

```sh
pnpm --dir client build
pnpm --dir client test:unit
(cd client && node --test tests/*.test.mjs)
(cd server && node --test tests/*.test.js)
pnpm --dir client exec playwright install chromium
pnpm --dir client test:e2e
```

`test:unit` uses Node's runner, including the existing waitlist scoring cases and
F6 model tests. No Vitest runner is required. F1/client tests also use Node, with
Vue component/composable harnesses. The server suite exercises ranking,
interactions and upload validation/permissions.

Chromium installation is normally one-time. Demo Playwright starts/reuses Vite on
5173, forces mock mode and a test-only weather seed, isolates storage, controls
external responses/time and uses Singapore time. The F6 fixture cases replace
live boundaries with controlled responses; they do not establish hosted RLS.
Use the actual running server's mode, not merely a successful port connection.

## Live browser tests

Run only with authorisation for temporary hosted writes. Start Express first and
use the approved development project from `client/.env`. Test accounts are
configured in `client/e2e-live/accounts.mjs`; passwords are not stored or typed by
agents. First run requires a human to sign in to organiser and participant in a
visible browser:

```sh
pnpm --dir client test:e2e:live --headed
```

Sessions are saved to ignored `client/e2e-live/.auth/`. Later runs:

```sh
pnpm --dir client test:e2e:live
pnpm --dir client test:e2e:live e2e-live/floor-plan.spec.mjs
# If the default 5174 is occupied, use an unused port:
PLAYWRIGHT_LIVE_PORT=5176 pnpm --dir client test:e2e:live
```

Sign in at the selected port so saved storage origins match. Live Playwright
starts a live-mode Vite instance and refuses to reuse an arbitrary server.
Run suites serially: refresh tokens are single-use, and each suite saves refreshed
sessions. Do not globally sign out a session that tests still need. Refresh-invalid
sessions require another manual sign-in; don't repeatedly run headless login waits.

| Live spec | Coverage |
| --- | --- |
| `browse.spec.mjs` | Anonymous Discover/legacy redirect/details; private Profile guard; read-only |
| `checkin-journey.spec.mjs` | Creation, RSVP, QR/barcode, staff search/manual check-in, Realtime, CSV permission, interest bump and SQL/UI refusal rules |
| `floor-plan.spec.mjs` | Saved plan/programme/real placements, reload, participant visibility and write denial, viewport/console checks |
| `integration.spec.mjs` | Recommendations per identity, profile save/restore, approval, owner tasks/feed/exact budget, real NEA outcome and responsive pages |
| `uploads.spec.mjs` | Actual browser cover/finished-plan uploads and public reads; deletes its own R2 objects using server-only credentials on the Node test host |

Live specs create `[TEST]` events, delete them afterward and restore modified test
profile weights/values. Never change existing published events. Check cleanup,
not just assertions. Upload cleanup needs installed server dependencies and its
local environment; privileged credentials never enter browser code.

## R2, remote access and host troubleshooting

- R2 CORS must allow the exact browser origin, `PUT` and the `Content-Type` header;
  public image reads may also use `GET`/`HEAD`. A changing forwarded port is a new
  origin. A signed URL can work in Node while browser preflight is denied.
- With Windows → SSH → Ubuntu, forward Express as well as Vite when the browser
  uses its default API URL: `ssh -N -L 3000:127.0.0.1:3000 denz-server` (use the
  configured SSH destination). A temporary human-login capture helper is not a
  shipped application component and should be removed after setup.
- Concurrent Playwright processes need separate ports and `--output` paths;
  otherwise they can delete each other's traces or stop a reused Vite process.
- This host's Corepack launcher has failed with
  `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`. Invoke the installed pnpm `pnpm.mjs`
  directly if needed; do not upgrade dependencies to work around the launcher.
- If Node subprocess isolation is blocked, use
  `NODE_ENV=test node --experimental-test-isolation=none --test client/src/utils/__tests__/*.test.js client/src/utils/__tests__/waitlistScore.spec.js`.
  Report this fallback and individual counts rather than file-level summaries.

## Database checks and acceptance limits

[`supabase/tests/live_waitlist.sql`](../supabase/tests/live_waitlist.sql) is a
development-only, rollback-only lifecycle/deadline/grant check. It creates a
third disposable auth user inside its transaction and rolls all fixtures back.
The manual `server` `test:crud`, `seed:checkin` and `test:checkin` scripts are separate
live operations, not the ordinary unit suite; inspect and authorise them explicitly.

Check hosted migration history before SQL changes. Migrations/RLS/Edge Function
source is not fresh deployment evidence. The previous cover/venue migration's
15-case local PostgreSQL harness used real application schema/RPCs but platform
auth/storage/cron stubs, so hosted browser results are separate evidence.

For frontend changes check keyboard/focus, errors/retry, route reuse, one `main`,
console and reflow at 375/575/768/1280px. Motion additionally needs reduced-motion
changes, native touch/map/editor/dialog behaviour, route/history scroll and no
hidden content on keyboard focus. Inspect the current motion work's actual results
in the timeline before calling older suite counts current.

A passing suite does not prove every browser/device, complete accessibility,
production concurrency or response-loss behaviour. Real-phone camera/geolocation,
Safari/iOS motion feel, a successful rainy NEA switch, private object-image storage,
automatic storage cleanup and owner review of hosting/security settings remain
explicit limits in [status](../status.md#current-checkpoint).


## Frontend redesign checks

`client/e2e/redesign.spec.js` verifies map/list filters, keyboard event previews,
cluster detail focus, map results beyond the first directory page, missing venue
locations, event-page scroll reset/history restoration, reduced motion and 44px
marker hit areas at 375/575/768/1280px.
`discoveryMap.test.js` covers projection guards and nonduplicating marker clusters;
client discovery tests cover full map pagination and active venue coordinates.

```sh
pnpm --dir client test:e2e e2e/redesign.spec.js
```

Use one owned dev server and keep app source frozen during final browser tests.
Vite hot reload can version the installed router module while a test imports its
bare URL, creating a second router instance. Restart the owned server before a
clean rerun; do not stop another user's existing process. If the live port is
occupied, set `PLAYWRIGHT_LIVE_PORT` to an unused port. The anonymous browse spec
can run with `--project=live --no-deps` without requesting a manual login or writes.
When invoking utility cases directly, retain `NODE_ENV=test` so the weather test
fixture is present. The normal pnpm `test:unit` script already sets it.

Design assets and captured demo screens live in `docs/design/`. They are review
artifacts; seeded example events are not claims about current public events.


For the 24 October immersive refinement, the user requests bare-minimum targeted
checks and production builds/full suites only when explicitly instructed. The earlier two
immersive browser checks are in `client/e2e/immersive-discovery.spec.js`; image/card
rendering is covered by `client/tests/event-card.test.mjs` and
`client/tests/picked-for-you.test.mjs`. Use these for the affected flow rather than
repeating the whole suite. Source-only Vue compilation is not a production build.


## Current targeted frontend checks

Choose the affected spec or `--grep` case rather than running all of these for
every edit. Existing tests exercise API behaviour; visual specs use isolated demo
contexts and do not create hosted events.

| Spec | Purpose |
| --- | --- |
| `e2e/motion-theme.spec.js` | System theme/default/persistence, filter disclosure and view changes, wizard draft preview/back navigation |
| `e2e/workspace-design.spec.js` | Public detail/action priority, My RSVPs, all four event tools, actual capacity totals; desktop/mobile and dark mode |
| `e2e/immersive-discovery.spec.js` | Hero asset loading, map preview/pause/focus, reduced motion and directory filtering |
| `e2e/design-polish.spec.js` | 375/575/768/1280px layout, pending search and Navbar-only auth-session fixture |
| `e2e/feature4.spec.js` | Select exact-budget, weather-failure or RSVP-submission case when that UI changes |
| `e2e/feature4-interactions.spec.js` | Select task focus/keyboard or destructive-confirmation case when affected |
| `e2e/legacy-review-fixes.spec.js` | Select My RSVPs refresh/cadence or route-reuse case when affected |

Examples from the repository root:

```sh
pnpm --dir client test:e2e e2e/motion-theme.spec.js
pnpm --dir client test:e2e e2e/workspace-design.spec.js
pnpm --dir client test:e2e e2e/feature4.spec.js --grep 'existing RSVP submission'
NODE_ENV=test node --test client/src/utils/__tests__/discoveryMap.test.js
```

Hallmark's source audit is a local skill tool, not a project lint command. Its
Puppeteer renderer is unavailable on this host; use the existing Playwright stack
for browser evidence and state the audit limitation. The Vue compiler is exposed
through `vue/compiler-sfc`; `@vue/compiler-sfc` is not a direct package here. Do not
add dependencies just to repeat source checks.

## Syncthing and stale frontend diagnosis

A missing component/asset on Windows is a file-transfer issue before it is a
browser-cache issue. Check both project copies for
`client/src/components/discovery/IslandArtwork.vue` and
`client/src/assets/illustrations/singapore-animated-plate.webp`. Confirm that Vite
runs from the intended `client` folder; forwarded Linux and local Windows ports
serve different working copies.

The 24 October diagnosis found both files visible inside the server's Syncthing
container but absent from its index, despite an Up to Date display. The listed
ignore patterns and permissions were not the cause. A project-scoped server
rescan indexed both files successfully. Use the server GUI's Rescan when this
recurs, then check transfer/receipt on Windows before restarting Vite and refreshing.
Do not delete caches, overwrite files or reset data as a first response.


## Feature 4 task-list checks

The Manage Event task UI uses completion checkboxes, explicit progress actions,
search/status filters and expandable row actions. Existing task browser checks
use these controls instead of Kanban columns, drag handles and status selects.
The focused task-list spec covers filtered saves without losing hidden task IDs,
drafts and responsive/theme states. Choose the affected cases; these commands do
not authorise a full suite or live writes:

```sh
pnpm --dir client test:e2e e2e/feature4-task-list.spec.js
pnpm --dir client test:e2e e2e/feature4.spec.js --grep 'task CRUD|failed storage save|reused workspace route'
pnpm --dir client test:e2e e2e/feature4-interactions.spec.js --grep 'task|dialog cancel'
```


## Unified event-workspace checks

`e2e/workspace-design.spec.js` covers the persistent workspace shell, existing
tool routes, operation Back targets, remembered query state and cross-route draft
preservation. Live-only route smoke checks use local API/check-in fixtures; they
do not verify hosted auth, RLS, camera hardware or venue-code rotation.
`e2e/feature4-task-list.spec.js` covers Open/Completed/All, URL-backed search,
intent-opened composition, cached confirmation cleanup and responsive task lists.
Use the affected cases, not a full suite:

```sh
pnpm --dir client test:e2e e2e/workspace-design.spec.js --grep 'organiser event|live-only|task search|Budget Back'
pnpm --dir client test:e2e e2e/feature4-task-list.spec.js
```

When capturing child tools, wait for their loaded heading/content (for example
Manage RSVPs or the QR canvas), not merely the shared event header. The shell
loads public event context separately from the child tool's authorised data.
