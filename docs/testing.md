# Verification

Use Node 22 and pnpm from the repository root:

```sh
pnpm --dir client install --frozen-lockfile --ignore-scripts
pnpm --dir client build
pnpm --dir client test:unit
pnpm --dir client exec playwright install chromium
pnpm --dir client test:e2e
```

Chromium installation is a one-time setup. Playwright starts/reuses Vite on
`127.0.0.1:5173`, isolates browser storage and Singapore time, controls external
responses and blocks Supabase requests. Tests force demo mode and add the
near-start weather event only as a fixture. A user's saved browser data is not
reset by tests. Build and browser outputs are local and ignored.

## Recorded results

| Checkpoint | Actual result and scope |
| --- | --- |
| 22 October, hosted deployment | Five migrations after `init` and the `venue-switch` Edge Function are deployed to Bookerz. Hosted grants/policies were inspected read-only. Anonymous REST reads of a published event, announcement feed and availability returned 200; venue switching without a user JWT returned 401. A live mobile Chromium page check loaded public events, RSVP details and announcements without alerts or uncaught errors. A disposable PostgreSQL 17 harness exercised migration order, atomic creation retries and rollback, switch idempotency and denial, and event-delete cascade. Signed-in owner/other-user browser flows still need checking. |
| 22 October, full merged regression | Seven Node test files, five NEA rule cases, production build and all 51 isolated Chromium cases passed. |
| 22 October, NEA and live creation preparation | Expanded seven-file Node unit suite, five isolated NEA rule cases and production build passed. |
| 22 October, local live Feature 4 preparation | Production build passed; 43 Feature 4 Node cases passed with the no-isolation fallback; 51 isolated Chromium demo cases passed. The new live adapter cases use a controlled Supabase client, not hosted database writes. |
| 21 October, merged `dev` | Production build passed; 28 Feature 4 Node cases and 51 isolated Chromium cases passed. Includes event deletion cascade and combined Gregory/Feature 4 flows. |
| 21 October, live public read | Configured browser publishable key loaded public events and an event page with its effective-venue map before login. This did not test live writes. |
| Later test-account check | Two confirmed development accounts signed in through the merged app and could read their profiles/protected My RSVPs page. No test event/RSVP was created through the browser in that check. |
| 22 October, hosted data cleanup | Read-only final check found exactly six published events visible with the publishable key, three owned by each test account; no old registrations remained. This was a data check, not a frontend regression run. |
| 17 October, pre-merge fix pass | 27 Node and 50 Chromium cases plus production build passed; 40 responsive captures had no page overflow or uncaught page errors in the checked states. |

The 22 October browser run is the latest **full** merged-suite result. The
test-account and event counts describe that development
project at the time checked and may change as teammates work.

## What the suites exercise

Node cases cover additive demo migration and ownership, task order/isolation,
exact-cent budget boundaries, weather parsing/eligibility/deadlines, single-read
forecast snapshots and atomic demo switching. Chromium cases cover public event
and RSVP flows, organiser tools, deletion cascade, keyboard/focus and retry,
responsive behaviour, public feed placement, offer refresh, stale OneMap responses,
publication-time validation and route reuse. They do not establish hosted RLS,
production concurrency, external-service uptime or complete accessibility.

The separate `client/src/utils/__tests__/waitlistScore.spec.js` imports
unconfigured Vitest and is **outside** `test:unit`; do not report it as passing.
Neither package has a lint script. The optional server's `test:crud` loads its
local `.env` for a manual integration check and requires approved development
records. Its `dev` and `start` scripts do not load `.env` automatically; the
running Express app exposes only `/health`.

The public-announcement policy, Feature 4 operations, trusted NEA switch,
atomic event creation and private availability migrations are deployed to the
Bookerz development project. The `venue-switch` Edge Function is active with
JWT verification. Hosted grant/policy inspection confirms that the switch RPC
is service-role only and the create RPC is authenticated only. Signed-in owner,
other-user, concurrent and response-loss browser flows still need checking with
development records. A real rainy NEA forecast is
needed to observe a successful hosted switch; local controlled tests cover
the switch decision and failure cases without waiting for rain.
See [Feature 4](feature4.md#live-integration-handoff) and the
[`dev` merge guide](dev-merge.md#live-feature-4-verification).

If a sandbox blocks Node subprocess isolation, the equivalent local fallback is
`node --experimental-test-isolation=none --test client/src/utils/__tests__/feature4*.test.js`.
To include the new live-adapter cases, add
`client/src/utils/__tests__/supabaseFeature4*.test.js` to that command. In this
environment the pnpm CommonJS launcher raised `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`;
invoking the cached pnpm `pnpm.mjs` directly worked. The first browser run had
two task-creation failures caused by new live retry IDs being generated in demo
mode, plus a OneMap timeout. After restricting those IDs to live mode, the two
affected cases and OneMap case passed individually, then all 51 browser cases
passed together. SQL could not be executed locally because Supabase CLI and
`psql` were absent and Docker access was initially denied. A later disposable
PostgreSQL 17 harness succeeded; it used a minimal initial-schema stub, so it
does not replace hosted end-to-end testing. The five later migrations and Edge
Function were subsequently deployed to the hosted development project.
