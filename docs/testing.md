# Verification

Use Node 22 and pnpm from the repository root:

```sh
pnpm --dir client install --frozen-lockfile --ignore-scripts
pnpm --dir client build
pnpm --dir client test:unit
pnpm --dir client exec playwright install chromium
pnpm --dir client test:e2e
```

Install Chromium once. Playwright starts/reuses Vite on `127.0.0.1:5173`, uses
isolated localStorage and Singapore time, controls external responses and blocks
Supabase requests. It does not reset a user's browser data. Browser reports and
build output are generated locally and ignored.

## Final run: 17 October 2026

| Check | Result |
| --- | --- |
| Complete Feature 4 Node suite | 27 passed, 0 failed/skipped |
| Normal isolated and no-isolation Node runners | Both passed all 27 tests |
| Complete Chromium suite after final correction | 50 passed, 0 failed; 47.2 seconds |
| Production build after final correction | Passed; Vite 8.3.4, 115 modules |
| Additional responsive audit | 40 route/tool captures at 375, 575, 768 and 1280px; no page overflow |
| Additional browser diagnostics | Zero uncaught page errors in the capture audit |
| Independent source review | No remaining Critical, Important or Minor findings in the reviewed scope |
| Handoff checks | Public links/anchors/whitespace and inclusion/exclusion rules checked; dependency/schema/original preservation hashes matched |

The capture audit covered Events, My RSVPs, My events, Create event Basics,
Manage RSVPs, public RSVP and all four Feature 4 tools. Representative mobile and
desktop captures were visually inspected. Long public content and keyboard/error
flows are additionally covered by the browser suite. These checks do not establish
every wizard/content/zoom/assistive-technology combination or complete accessibility.

## Regression coverage

Node tests cover additive migration/ownership, task order/isolation, budget/money
boundaries, weather parsing/eligibility/deadlines, atomic demo switching and the
single-response weather snapshot with pre-/post-request ownership guards.

Chromium retains the original 34 cases and adds 16 cases across:

- `feature4-interactions.spec.js`: cancelled and changed-target deletes, dialog
  Cancel/Escape/success focus, keyboard task save/failure/retry, venue confirmation
  focus and invalid-area recovery.
- `feature4-public-weather.spec.js`: one request per weather refresh, mobile/DOM
  update placement, required question/error semantics, public feed availability
  when private reads fail and list loading/heading/occupancy semantics.
- `legacy-review-fixes.spec.js`: offer refresh, reversed address responses,
  Escape/late response, publication-time validation, missing-date focus, route
  reuse/filter/progress and closed-RSVP disclosure.

Selected new tests failed against the pre-fix source snapshot for the expected
cancellation, task/dialog focus and duplicate-weather-read causes. Author checks
also demonstrated offer/search, area recovery and later focused corrections.
The full run exposed a new test-hook collision; scoping/restoring the fixture
resolved it in both Node modes before the final passing runs. Initial sandbox
browser startup failures were resolved through approved local execution. No new
runtime dependency or test framework was needed.

## Limits and checkpoints

The separate `waitlistScore.spec.js` imports unconfigured Vitest and is outside
`test:unit`. Neither package has a lint script; the server's `test:crud` script
requires configured development services and approved test records.
Live weather/OneMap uptime, deployment, hosted auth/RLS, database transactions and
production concurrency remain unverified. See [final review](reviews/2026-10-17-final-review.md)
and [the branch handoff](handoff.md) before integration.

| Historical checkpoint | Node / Chromium |
| --- | --- |
| Iteration 1 | 21 / 20 passed |
| Iteration 2 | 23 / 34 passed |
| Final review-fix pass | 27 / 50 passed |

If a sandbox blocks Node subprocess isolation, the equivalent local fallback is
`node --experimental-test-isolation=none --test client/src/utils/__tests__/feature4*.test.js`.
Machine-specific launcher/browser-cache notes stay local; normal clones use the
portable commands above.
