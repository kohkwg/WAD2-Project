# Testing and local operation

3 November merge-resolution checkpoint: 82 focused Node tests passed across
`rsvp-overview`, `saved-events`, `organiser-events`, geographic helpers, Hangout
slots/basics/itinerary/on-the-day helpers and the recommendation pipeline/route/
quality files. A further seven incoming backend route checks passed with temporary
local ports:

```sh
node --test server/tests/hangoutsRoute.test.js server/tests/onemapRoute.test.js
```

The isolated saved-event/Official adapter fixtures now stub the incoming Hangout
namespace; Hangout operations have their own focused checks. The recommendation
pipeline test now checks the existing five-second clock-skew allowance at 5000ms
and rejection at 5001ms; production scoring/evidence code is unchanged.

Twelve selected browser cases passed from `immersive-discovery.spec.js`,
`my-rsvps.spec.js` and `organiser-events.spec.js`. The updated immersive cases
exercise the retained illustrated landing, committed street-map workspace, mobile
layout and incoming Official/Hangout picker. Existing selected cases cover saved
events, offer/cancellation flows, tab state and organiser approval/rejection/removal
appearing in participant My RSVPs after focus. Browser data are synthetic demo
fixtures and map tiles/search are stubbed; no hosted account or migration was used.
The isolated run used port 5187 and `/tmp/wad2-merge-browser-results`. All 77 Vue
sources/templates and the merged stylesheet compiled. No full suite/build ran.

## 3 November: Discover street map beside timeline

Run focused checks from the repository root:

```sh
node --test client/tests/discover-workspace.test.mjs client/tests/discovery-state.test.mjs client/tests/discover-browse.test.mjs
node --test server/tests/recommendation-quality.test.js server/tests/recommendations-route.test.js server/tests/recommendation-interactions.test.js
```

These passed 11 and 22 cases respectively. Compile `DiscoverView.vue`,
`DiscoveryEventRow.vue` and `DiscoveryStreetMap.vue` with `vue/compiler-sfc`.
The targeted `client/e2e/discovery-list-palette.spec.js` now expects the map
beside the timeline and explicit thumbnail selection, while title navigation
remains intact. That automated browser file was not run on this host.

Manual in-app browser verification used an owned demo Vite server on 5191
(`VITE_USE_MOCK=true VITE_FEATURE4_TEST_SEED=true`), without hosted writes.
Verified actual OneMap tile images, keyboard row selection and marker activation,
cluster selection, preview dismissal/focus return, light/dark layouts at
375/575/768/1280px, no horizontal overflow, one main, and no console errors.
Forced tile-failure/retry and authenticated live recommendation scoring remain
unverified. Anonymous demo recommendations are upcoming events, not fabricated
compatibility scores. No full suite or production build was run.

For the 3 November Discover workspace, use these focused checks:

```sh
node --test client/tests/discover-workspace.test.mjs client/tests/discovery-state.test.mjs client/tests/discover-browse.test.mjs client/src/utils/__tests__/discoveryMap.test.js
node --test server/tests/recommendation-quality.test.js server/tests/recommendations-route.test.js server/tests/recommendation-interactions.test.js
```

All 36 cases pass across targeted runs. The four new SSR rendering cases verify
backend order versus displayed compatibility, truthful general-discovery labels,
available save/dismiss actions, actual registration/waitlist handling and retained
retry/undo states. They use the existing Vue compiler and Node runner; no new
dependencies. Six changed Vue SFCs compile. The recommendation endpoint/composable
and filter/scoring helpers have no diff in this layout change.

In-app browser demo checks on isolated port 5189 cover light/dark at
375/575/768/1280px, one main/no overflow, linked row/marker selection, waitlist
preview links, desktop focus return, mobile row → Map handoff and close focus,
category filtering of both panels, empty search and clear recovery. Phones show
one collapsed pick, desktop three; See all is retained. Current map count is the
current page's located events, not every filtered page. Final screenshots and
layout measurements are in this Codex chat's outputs/work directories. Existing
browser suites tied to the superseded standalone list/map and carousel layout
were not run as a full suite. This is not live signed-in persistence/RLS or
production-build evidence; Node 24 was used, no dependency updates.

For the latest stable-boat refinement (3 November), the in-app browser sampled
four `[data-boat-anchor]` transforms twice: all were unchanged and had no hull
animation. Twenty-six sampled wake/ripple/current properties changed over time;
all 37 wake/current/glint/shore effects froze with identical transforms/stroke
offsets after pausing, and resumed normally. Fixed hulls are in the bitmap;
the SVG component draws only water effects. Vue SFC compilation passes for
the artwork, wakes, water and Discover view. Four-width overflow/anchor checks
passed (375/575/768/1280px), with no console warnings/errors. Recorded evidence
is `outputs/stable-boats-moving-water.gif` in the requesting chat. Earlier boat
route checks below refer to the superseded implementation. No full suite/build.

For the 3 November water-motion follow-up, compile `IslandArtwork.vue`,
`IslandBoats.vue`, `IslandWater.vue` and `DiscoverView.vue` using the installed
Vue SFC compiler. All four pass. The in-app browser compared computed transforms
and stroke offsets at two times: all four boat routes, ten water-current groups
and four wakes changed. All 33 animated descendants of the new boat/water layers
reported paused and retained identical transforms/stroke offsets after a pause.
Resume restarted them. Four-width checks (375/575/768/1280px) found all routes and
water patches present, no horizontal overflow and no warning/error console logs.
A 16-frame recording shows actual UI motion. This follow-up did not rerun the
previous projection tests because their code did not change; reduced-motion CSS
was compiled/preserved, not re-emulated. No full suite or production build.

For the expanded island (3 November), run the bounded projection/cluster check:

```sh
node --test client/src/utils/__tests__/discoveryMap.test.js
```

Four cases pass; `IslandArtwork.vue`, `SingaporeMap.vue`, `NeighbourhoodLabels.vue`
and `DiscoverView.vue` also compile with the installed Vue SFC compiler. The
in-app browser checked demo `/discover?view=map` at 375/575/768/1280px in both
themes, including no page/label overlap, one main, 10px label text and 44px label
targets. Interaction checks cover label keyboard zoom/focus, event keyboard
preview/focus restoration, pause/resume of every existing animated layer and
mobile zoom revealing attraction labels. Mobile caption placement was rechecked
after a preview-server restart because the host file watcher retained stale CSS.
No warning/error console entries were observed. This is bounded UI verification,
not an automated-suite pass or hosted integration evidence. Direct Playwright
launch failed at Chromium's macOS MachPort sandbox boundary, so in-app browser
inspection was used instead. Reduced-motion styles were preserved and compiled,
not re-emulated; Node 24 was available, Node 22 was not. Screenshots/measurements
are in the requesting Codex chat's `work/map-checks` and `outputs` directories.
No full suite or production build was run.

For shared typography, compare Discover, My RSVPs and My events at the same
browser zoom and viewport. At 100% zoom, page titles must match font family,
weight, size, line height and letter spacing. Ordinary event cards use 20px/650,
body uses DM Sans at 16px, buttons use 14px/600; featured titles use their own token.
Check both themes at 375/575/768/1280px, including card wrapping and page overflow.

On 2 November, one temporary Chromium comparison passed all 24 page/theme/width
combinations and saved computed values/screenshots under
`/tmp/wad2-typography-results`. Titles measured 32/35.5/39.36/48px at those widths.
Four existing targeted cases also passed:

```sh
pnpm --dir client exec playwright test e2e/recommendation-mvp.spec.js --grep 'filtered and map|recommendation MVP'
pnpm --dir client exec playwright test e2e/my-rsvps.spec.js --grep 'offers expire'
pnpm --dir client exec playwright test e2e/organiser-events.spec.js --grep 'empty states and mobile'
```

These use controlled demo/mocked data, not live accounts. The isolated runs used
port 5187 with temporary configs and results under `/tmp`; the comparison script
is not a new permanent regression suite. Vue source/template and stylesheet
compilation passed. No production build or full suite was run.

For organiser My events, run:

```sh
node --test client/tests/organiser-events.test.mjs
pnpm --dir client exec playwright test e2e/organiser-events.spec.js
pnpm --dir client exec playwright test e2e/feature4-public-weather.spec.js --grep 'public list cards and loading'
```

On 2 November, five Node cases and seven unique browser cases passed across
targeted runs. Tests cover time/status grouping, tabs/search/sort retention,
pending-request aggregation/filter/deep links, old-dated draft editing without
publication, draft exclusion from public demo lists, state-specific links,
empty states, deletion confirmation/focus and organiser approval/rejection/removal
appearing correctly in participant My RSVPs after focus refresh. The existing
loading/heading semantics regression was updated for cards under a section heading.
Four affected Vue files compiled without template errors. No full suite/build.

The organiser/participant journey uses two pages sharing a synthetic demo store,
not separate hosted identities. Draft-form navigation is exercised in the browser;
its persistence check calls the normal demo update adapter. Node's live-adapter
test substitutes its database client; it does not call Supabase. Light/dark and
375/575/768/1280px layouts pass; final screenshots are under
`/tmp/wad2-organiser-events-final-results`. An isolated server/config on 5187 was
used to avoid existing servers. Live RLS/persistence and attendee results remain
unverified. Existing draft rows are supported, but no new draft creation/publishing,
event duplication or event cancellation operation was introduced.

For the current My RSVPs redesign, run these focused checks from the root:

```sh
node --test client/tests/rsvp-overview.test.mjs client/tests/saved-events.test.mjs client/tests/rsvp-rules.test.mjs
pnpm --dir client exec playwright test e2e/my-rsvps.spec.js
pnpm --dir client exec playwright test e2e/legacy-review-fixes.spec.js --grep 'My RSVPs refreshes|closed RSVP tab'
```

On 2 November, ten Node cases and ten unique browser cases passed across targeted
runs. Checks cover time/status grouping, ongoing events, earliest confirmation,
saved read/unsave and pagination, failure/retry, verified attendance, tabs/keyboard,
calendar download, directions, ticket-route navigation, offer expiry/accept/decline,
cancellation/focus, empty states, periodic refresh and focus refresh. Light/dark
and 375/575/768/1280px layouts were checked. Six affected Vue components also
compiled without template errors; no production build or full suite was run.

The browser runs used demo localStorage and controlled page-adapter overrides,
including a ticket-enabled fixture that checks navigation without real ticket/QR
data. Supabase calls were blocked. Node adapter tests substitute Supabase and
Express, so these are not hosted persistence/RLS verification. The actual live
Saved tab requires the existing `user_event_preferences` schema and preference
endpoint; missing setup produces a retryable error without hiding registrations.
Demo saved rows use `eventPreferences` entries with `userId`, `eventId`,
`saveActive`, `savedAt`; unsave preserves the stored date and deactivates the row.
The isolated run used port 5187 and a temporary config under `/tmp`; final layout
screenshots are under `/tmp/wad2-my-rsvps-layout-results`.

For the current recommendation browser regression, run:

```sh
pnpm --dir client exec playwright test e2e/recommendation-mvp.spec.js
```

On 2 November, all three mocked Chromium cases pass. They cover save exclusion,
learning explanations for a different event, refresh of fixture state, dismiss/undo,
action retry, backend-error retry and empty states. Two themes and four widths are
checked. Supabase requests are blocked and recommendation responses are mocked;
these tests do not prove database persistence. Bookmark targets are now 44px.
This run used an isolated temporary config/server on port 5187; screenshots and
the explicitly mocked response are under `/tmp/wad2-recommendation-quality-results`.
The [journey log](testing/recommendation-journey.yaml) separates these passing cases
from pending live cases. [Twelve event drafts](testing/recommendation-events.json)
are fictional, scheduled 9–21 November, and require actual existing venue selection
and creation through the event form. None have been written to the hosted database.
Live browser access is unavailable; account resets and live tests remain pending.

For organiser/team learning exclusions and evidence-based explanations, run from
the repository root:

```sh
node --test server/tests/recommendation-quality.test.js server/tests/recommendations-route.test.js server/tests/recommendation-interactions.test.js
```

All 22 cases passed on 2 November 2026. They use the unchanged route fixture and
existing check helpers; no real Supabase calls or browser verification are included.
The interaction case now also verifies saved-event exclusion, learning across
events, dismissal/undo, and restored eligibility after unsaving.

For the landing-page split, run the focused browser files `landing-page.spec.js`,
`discover-browse.spec.js`, `recommendation-mvp.spec.js` and `navbar-account.spec.js`
through the existing client `test:e2e` script. Eleven journeys passed across focused
runs on the owned demo Vite server at 5187 with temporary config/output under `/tmp`;
the mobile menu cases were rerun after fixing initial-route focus timing. Tests
cover public `/`, absent hero on Discover, logo return paths, mobile menu closure,
search/category/date/availability handoff, Map/List switching and reload retention.
Supabase requests are blocked. Nine focused Node checks also pass using
`node --test client/tests/event-filters.test.mjs client/tests/discover-browse.test.mjs`.
The existing `design-polish.spec.js --grep 'search stays'` additionally passed
after changing its starting URL to `/` (12 distinct browser journeys in total).

For sidebar account placement, run `pnpm --dir client test:e2e e2e/navbar-account.spec.js`.
The 27 October run passed both focused Chromium journeys using a temporary config
and owned demo Vite server on 5187. The fixture replaces only navbar/router identity
and sign-out responses and blocks Supabase; it checks desktop/mobile positioning,
theme selection, profile routing, Escape focus and sign-out failure/retry/success.
This does not exercise a real signed-in Supabase session.

For the subsequent map/filtered-picks refinement, run
`node --test client/tests/picked-for-you.test.mjs client/tests/discover-browse.test.mjs client/tests/event-filters.test.mjs`
from the repository root. All 24 cases passed on Node 24.12.0. The same two focused
browser files below now contain six journeys, adding compact matching/other picks
and map marker preview links while preserving filters. All six passed with mock
responses and blocked Supabase requests; no real account or booking was exercised.
The existing `design-polish.spec.js --grep 'search stays'` also passed with its
updated map action label, using an owned demo server and temporary config on 5187.

For Discover search/card changes, run from the repository root:
`node --test client/tests/event-filters.test.mjs client/tests/event-card.test.mjs client/tests/picked-for-you.test.mjs client/tests/discover-browse.test.mjs`.
The 27 October run passed all 27 cases on Node 24.12.0. Focused browser fixtures
are `client/e2e/discover-browse.spec.js` and `client/e2e/recommendation-mvp.spec.js`;
five journeys passed using the existing Chromium runner with an owned demo Vite
server on 5187 and a temporary config/output under `/tmp`. Supabase requests are
blocked and event/recommendation responses are mocked. Search/category persistence,
clear/empty states, Island/Map/List, details/RSVP navigation and recommendation
actions are covered; this does not claim a successful live RSVP transaction.

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
recommendations, caller-JWT plan suggestions and signed image-upload routes, not
parallel Feature 4 CRUD.

| File | Names / purpose |
| --- | --- |
| `client/.env` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_R2_PUBLIC_URL`; optional `VITE_API_URL` (defaults to `http://127.0.0.1:3000`) and `VITE_USE_MOCK` |
| `server/.env` | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`; `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`; optional `PORT`; optional `ONEMAP_EMAIL`, `ONEMAP_PASSWORD` (hangout routes) |

Use the supplied `.env.example` templates and team-provided values. Both R2 public
URL names contain the same HTTPS bucket base, without trailing slash. They are
public locations, not credentials; upload credentials remain server-only.

Configured client Supabase selects live mode unless `VITE_USE_MOCK=true`.
Without keys, core event/RSVP/Feature 4 flows use isolated localStorage demo data.
Discover browses both modes; Profile editing, check-in and F6 require live mode.
Failed live writes never switch silently to demo. Reset demo data asks for
confirmation and reseeds relative event dates in that browser only.

## Check selection

For the standalone interest and tag-diversity checks, run `npm run check` from `server/`
(or run `node checks/interest.check.js` and `node checks/diversity.check.js`). These use `checks/helpers.js` to print
PASS/FAIL with a 0.01 tolerance and set a nonzero exit code on failure.

Use only the necessary targeted checks for the changed flow. Full suites and
production builds require explicit user instruction; do not repeat them after
each visual adjustment. Source-only SFC compilation is not a production build.
Documentation-only work needs path/anchor, whitespace and source-preservation
checks, not browser/application tests.

## Local regressions

For the MVP route/actions and frontend wiring, choose these targeted checks:

```sh
node --test server/tests/recommendations-route.test.js server/tests/recommendation-interactions.test.js
node --test client/tests/recommendation-profile.test.mjs client/tests/recommendation-actions.test.mjs client/tests/picked-for-you.test.mjs
```

They cover 9 backend and 18 frontend cases with mocked data and explicit condition
checks. The 26 evidence/persistence/pipeline cases were also run for this integration.
The existing Profile browser fixture now mocks `profile_interests` and the profile
RPC; `client/e2e/recommendation-mvp.spec.js` mocks recommendation reads/actions.
Neither contacts the shared database. Run the two affected browser cases with:

```sh
pnpm --dir client exec playwright test e2e/f1-profile-design.spec.js e2e/recommendation-mvp.spec.js --grep 'profile reflows|recommendation MVP'
```

On this host, the in-app Browser runtime reported no available browser. The existing
Playwright runner verified the two cases using an isolated temporary config on port
5187 and `/tmp/wad2-recommendation-mvp-results`; localhost startup required sandbox
escalation. Both themes/four widths, focus, labels, no overflow, one main and error/
retry were checked; captures were inspected. No full suite or build was run.

Before real integration, review/deploy the SQL draft including
`update_recommendation_profile`; missing V1 objects deliberately fail rather than
silently ignoring evidence. Browser mocks do not establish SQL permissions or real
attendance/registration integration.

For the standalone pipeline's 16 mock-data end-to-end cases, run:

```sh
node --test server/tests/recommendation-pipeline.test.js
```

These invoke all four real V1 functions with in-memory evidence, mappings,
candidate events and registrations, using one injected time. They do not execute
SQL, call Supabase, load `.env`, or test the live recommendation route. Checks use
explicit conditions and thrown errors; no assertion library is imported.

For all four local V1 core functions (no database), run:

```sh
node --test server/tests/event-evidence.test.js server/tests/user-preferences.test.js server/tests/event-compatibility.test.js server/tests/diverse-events.test.js
```

The 40 cases comprise 11 evidence, 7 preference, 11 compatibility and 11 diversity
checks, without Node assertion imports. They do not establish a complete pipeline
or hosted integration. For diversity alone, run `node --test server/tests/diverse-events.test.js`.

For compatibility and its preference-builder integration, run:

```sh
node --test server/tests/event-compatibility.test.js server/tests/user-preferences.test.js
```

The eleven compatibility checks and seven preference checks run without a database
or environment file, using explicit conditions rather than an assertion library.

For the local V1 preference builder, run:

```sh
node --test server/tests/user-preferences.test.js
```

These seven cases use explicit checks, canonical evidence and local interest slugs.
They do not test hosted persistence or integration with live ranking.

For the isolated recommendation V1 evidence function (no database or environment
file required), run from the repository root:

```sh
node --test server/tests/event-evidence.test.js
```

For the persistence adapter's simulated RPC contract (also no database), run:

```sh
node --test server/tests/event-evidence-store.test.js
```

The ten simulated persistence cases now model actual registration status names.
Only confirmed earns RSVP evidence; first confirmation/save dates survive
deactivation/reactivation. Cases include direct confirmation, transitions,
45/91-day reconfirmation, 91-day resave and flagged attendance. Together with
the evidence and pipeline regressions, the focused contract-alignment command is:

```sh
node --test server/tests/event-evidence-store.test.js server/tests/event-evidence.test.js server/tests/recommendation-pipeline.test.js
```

It covers 37 local cases, without an assertion library or database connection.
Draft SQL capture/backfill and database permissions/concurrency remain untested.

Recommendation tests use the explicit checks in `server/tests/checks.js`; failed
checks throw errors and make Node's runner fail. Persistence fixtures cover action
sequences and token forwarding, not actual Supabase security or concurrency.
The SQL in `docs/sql/recommendation-evidence-draft.sql` has not been executed.
Before promoting it to a migration, verify hosted history and test on PostgreSQL:

- Authenticate as two different users and as anonymous; verify read isolation and
  denied direct writes, forged timestamps/attendance and unauthenticated RPCs.
- Run concurrent duplicate saves and concurrent save/dismiss writes from separate
  database sessions; check one row, stable first dates and preservation of both flags.
- Execute real registration/check-in/cancellation RPCs, including repeat registration,
  expired offers and check-in removal, then compare reconstructed evidence.
- Run save → RSVP → attend → dismiss → undo and check original timestamps and
  5 → 10 → 15 → 0 → 15 points, plus cancellation fallback separately.

These checks cover calculation from canonical snapshots. They do not prove
database write deduplication, RLS or integration with the existing ranking route.

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
interactions, upload validation/permissions and the event planner.

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
| `uploads.spec.mjs` | Actual browser cover uploads and public reads; deletes its own R2 objects using server-only credentials on the Node test host. The finished-plan upload case was removed with that panel. |

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

## Event planner and floor-plan canvas checks

```sh
node --test server/tests/planSuggest.test.js server/tests/planSuggestions.test.js server/tests/planSeed.test.js
NODE_ENV=test node --test client/src/utils/__tests__/planSuggestModel.test.js client/src/utils/__tests__/floorPlanModel.test.js
pnpm --dir client test:e2e e2e/feature6.spec.js
```

`feature6.spec.js` replaces the floor-plan module with a browser-local fixture and covers
the Canva-style canvas (toolbar, in-place rename, selection bar, keyboard, locking,
placement, layout breakpoints). Playwright reuses a server already on 5173; if yours is in
live mode the pages redirect to sign-in. Run on another port with your own demo-mode
server (`VITE_USE_MOCK=true`) instead of stopping yours.

`pnpm --dir server seed:planner` adds sample past events for the planner and `--reset`
removes them; `--plain-titles` drops the `[TEST] ` prefix. It writes to the hosted project
with the server-only key, uses the two development accounts in `client/e2e-live/accounts.mjs`
unless `--own-email` / `--community-email` are given, and needs explicit approval. Do not
run it from automation.

## Database checks and acceptance limits

The final recommendation draft was executed in isolated in-memory PostgreSQL using
PGlite 0.5.12, with all eleven repository migrations and local Supabase auth/storage/cron
substitutes. To rerun using the temporary runtime already downloaded on this host:

```sh
node server/checks/recommendation-db.check.mjs /tmp/wad2-sql-verification/node_modules/@electric-sql/pglite/dist/index.js
```

The runtime path is an explicit argument; the harness never reads `.env`, accepts
database credentials or connects to a server. It adds no application dependency.
Only unsupported pg_cron extension loading is substituted in migration text;
repository migrations remain unmodified. Supabase-style roles/default grants,
`auth.uid()`, storage metadata and cron scheduling are local test scaffolding.

All 17 cases pass on Node 24.12.0. They execute real application SQL, role checks,
RLS, transaction rollback, confirmations, waitlist acceptance, event creation and
attendance. They do not establish hosted JWT/API integration, actual hosted grants
or concurrent sessions. The removal-order test rolls its DDL back; it is not a
live deployment rollback. Shared deployment and signed-in test writes require
separate explicit approval.

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

For the focused directory/chip refinement, run the affected cases:

```sh
pnpm --dir client exec playwright test e2e/discover-browse.spec.js --grep 'Discover orders sections|category directory and removable'
```

The refinement checks larger directory icons/cards, hidden directory view controls,
removable chips, search preservation, query clearing, keyboard focus recovery and
existing directory/back/reload/RSVP navigation in the two themes and four widths.
It uses mocked events. Source SFC compilation and the three urgency checks also
pass; full suites/builds were not run.

For Discover's category navigation and factual Closing soon helper:

```sh
node --test client/tests/discover-browse.test.mjs client/tests/picked-for-you.test.mjs client/tests/recommendation-actions.test.mjs
pnpm --dir client exec playwright test e2e/discover-browse.spec.js e2e/recommendation-mvp.spec.js
```

Nineteen Node cases and three mocked Chromium cases pass. The new browser fixture
injects existing event DTOs, blocks Supabase requests, and checks the five-section
order, six common/all ten catalog categories, keyboard navigation, category URL
reload/back and existing RSVP links. Closing soon requires deadline ≤48 hours or
known 1–5 places; missing urgency hides the section. Both themes/four widths were
checked; compact-card text width and no page overflow are covered. This host used
`/tmp/wad2-discover-browse.playwright.mjs`, port 5187 and captures under
`/tmp/wad2-discover-browse-results` to avoid existing servers. No hosted data was used.

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

For F1's profile layout, selection feedback and saving states, run
`pnpm --dir client test:e2e e2e/f1-profile-design.spec.js`. It substitutes only the
Profile data boundary with a synthetic fixture, exercises failure/retry and learned
weight retention without hosted writes, and checks both themes at the four target
widths. The existing `design-polish.spec.js --grep 'search stays'` covers discovery
search/view-switch regression. On 25 October, these ran against an owned demo Vite
server on 5183 using a temporary config overriding baseURL/output paths because
5173 was occupied; the repository's default config remains unchanged.

## OpenJio UI integration checks (3 November)

```sh
cd client && NODE_ENV=test node --test src/utils/__tests__/discoveryMap.test.js
pnpm --dir client exec playwright test e2e/immersive-discovery.spec.js e2e/redesign.spec.js e2e/landing-page.spec.js e2e/design-polish.spec.js
```

These cover the OneMap hero preview, Night tiles in dark theme, Search this area and
clear, the result rail, keyboard pins with focus return, 44px pin targets and reflow.
OneMap tiles need network access. If 5173 is already serving a non-mock app,
Playwright reuses it and map cases fail for lack of demo events. Run against an
owned mock server instead: a temporary config overriding `baseURL`, `webServer`
port/`reuseExistingServer: false` and output paths. See status for the pre-existing
failures in these files.

Hangout template rules and the Create event flow:

```sh
cd client && NODE_ENV=test node --test src/utils/__tests__/hangouts.test.js
pnpm --dir client exec playwright test e2e/legacy-review-fixes.spec.js e2e/motion-theme.spec.js
```

Create-event tests open `/organiser/events/new?template=official`; the bare path
now shows the template picker. The hangout flow (picker → wizard → invite slip →
`/j/:token` → hangout page) was checked with a scratch Playwright script, not a
committed spec.

Hangout Time tools:

```sh
cd client && NODE_ENV=test node --test src/utils/__tests__/hangoutSlots.test.js src/utils/__tests__/hangouts.test.js
```

These cover clipping and merging, no-reply and required gating, ranking order and
uniqueness, midnight splits, inward-rounded overlap counts, custom-slot blocking and
rescue choices. The browser flow was checked with a scratch script, not a committed spec.

Hangout plan rules:

```sh
cd client && NODE_ENV=test node --test src/utils/__tests__/itinerary.test.js
```

These cover estimated travel labels, must-fix and acceptable issues, meal windows,
generation from real events only, explicit relaxations, the 12 km widening and
full-event exclusion, and same-kind swaps.

On the day and routing:

```sh
cd client && NODE_ENV=test node --test src/utils/__tests__/onTheDay.test.js
cd server && node --test tests/onemapRoute.test.js
```

The server test uses a fake OneMap and an ephemeral local port. No real OneMap calls
or credentials are needed; live routes need `ONEMAP_EMAIL`/`ONEMAP_PASSWORD` in
`server/.env`.

Hangout SQL draft (isolated, no credentials or hosted access):

```sh
mkdir -p /tmp/wad2-pglite && cd /tmp/wad2-pglite && npm init -y && npm install --ignore-scripts @electric-sql/pglite@0.5.12
node server/checks/hangouts-db.check.mjs /tmp/wad2-pglite/node_modules/@electric-sql/pglite/dist/index.js
```

This loads every repository migration, including `20261103120000_hangouts.sql`, into an
in-memory database. It never reads `.env`, and PGlite is not added to any lockfile.

Live hangout server routes:

```sh
cd server && node --test tests/hangoutsRoute.test.js tests/onemapRoute.test.js
```

Applying the hangout migration (the user runs these and types any credentials):

```sh
npx supabase@2.122.0 login
npx supabase@2.122.0 migration list        # compare local and hosted history first
npx supabase@2.122.0 db push --dry-run     # shows every migration that would be applied
npx supabase@2.122.0 db push
```
Live hangout journey (after the migration is pushed; you sign in when the browser opens):

```sh
pnpm --dir client test:e2e:live --headed e2e-live/hangouts.spec.mjs
```
