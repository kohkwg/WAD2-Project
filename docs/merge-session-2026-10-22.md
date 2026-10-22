# Merge session, 22 October 2026: all six features on `dev`

Record of Huxley's integration session with Claude Code (AI-assisted, see
[AI use](#ai-use)). It covers building `dev2`, merging it into `dev`, the
evaluation and live test of the combined app, and the fixes that followed.
[dev2 merge log](dev2-merge-log.md) has the conflict-by-conflict detail.
[`dev` merge guide](dev-merge.md) covers Denzel's earlier denzel + gregory + tim merge.

## Timeline

| Step | Result |
|---|---|
| 1. Build `dev2` from `main` | `huxley` (PR [#3](https://github.com/kohkwg/WAD2-Project/pull/3)), `vivi` (PR [#4](https://github.com/kohkwg/WAD2-Project/pull/4)) and `aish` (PR [#5](https://github.com/kohkwg/WAD2-Project/pull/5)) merged through `integrate/*` branches, so teammates' branches were never pushed to |
| 2. Wait for Denzel | He finished `dev` at `5962570`: live Feature 4, atomic event creation, NEA switch, private availability |
| 3. Merge `dev2` into `dev` | PR [#6](https://github.com/kohkwg/WAD2-Project/pull/6), merge commit `afadf0e`. **All six features are on `dev`.** |
| 4. Evaluate | Graphify review, every test suite, read-only live checks against the hosted project |
| 5. Signed-in live test | Two test accounts in the built-in browser. Huxley signed in; the agent never typed a password |
| 6. Fix and re-verify | Commit `de3978e`: check-in dashboard count, Back links, manual method, RSVP count refresh |
| 7. Full graphify analysis | Code + docs graph, 1,289 nodes, 2,366 edges, 73 communities, no import cycles |

## Decisions confirmed by Huxley

| Topic | Decision |
|---|---|
| Shared shell | Denzel's `App.vue`, NavBar and `main.css`. `main.js` also registers VueKonva |
| Discover | Lives at **`/discover`** (NavBar link). `/events` stays Gregory's list so demo mode and e2e keep working |
| Discover links | Open Gregory's **`/events/:id/rsvp`** |
| Feature 1 backend | Merged as-is and flagged to Aishani/Timothy (see open issues) |
| Access | Check-in pages require login even under `/events/*`. `LoginView` is the only sign-in page. `/discover`, `/profile` and `/editor` follow `dev`'s rule: login required in live mode |
| Entry points (live mode only) | "My ticket" on confirmed RSVPs. "Check-in: Station · Venue QR · Attendance" on Manage event |

## Evaluation (graph + database contract)

- **Features 2 and 4** are tightly coupled through `utils/api.js` (demo vs live adapters).
- **Features 1, 3 and 6** connect to the rest only through the router. They integrate through the database, so their handoffs were traced in the migrations:
  - **RSVP → ticket:** every registration gets `qr_token` / `ticket_code` by default.
  - **Event creation → check-in:** `events_after_insert` creates the event's check-in secret, including for `create_event_with_details`.
  - **Venue switch → fraud check:** `check_ins_flag_fraud` measures distance to the *active* venue. Each event stores its own venue rows with the exact pin.
  - **Check-in → waitlist:** check-ins feed the show-up rate in waitlist scoring.
- **Database calls:** every RPC and table used by Features 2–4 exists in the migrations.
- **Feature 1 schema:** it reads `events_with_counts`, which exists **only on the hosted project** (no migration). `rsvps`, `events.tags`, `events.image_url`, `profiles.interest_weights`, `postal_code`, `lat` and `lng` do not exist.

## Signed-in live test (hosted Supabase)

test1 = organiser, test2 = participant. Each run used a throwaway `[TEST] Huxley …` event, deleted afterwards. Event, registrations and check-ins were confirmed gone (0 rows each).

| Flow | Result |
|---|---|
| Create event (4 steps, OneMap venue, capacity 1–2) | Works |
| RSVP (auto-confirm) → My RSVPs → My ticket (QR) | Works |
| Station: QR token and lowercase barcode code; repeat scan | Works; repeat scan keeps the first time (30 s clock slack, by design) |
| Attendance dashboard (Realtime) | Works after the fix below |
| `export_attendance` | Organiser gets 9 columns; participant gets 0 rows |
| Venue QR screen | QR with a 2-minute rotation countdown |
| Full event → waitlist → cancel → 24 h offer → accept | Works |
| Discover + "For you" (`/api/recommendations` 200), no duplicate-client warning | Works |
| Camera scanning | Not tested (blocked in the browser pane; skipped at Huxley's request) |

## Fixes made (`de3978e`)

| Issue found in the live test | Fix |
|---|---|
| Dashboard showed **1/1 = 100%** after the checked-in person cancelled and someone else took the seat | Loads all registrations for names, counts only check-ins whose registration is still confirmed, marks others "(no longer confirmed)" |
| "← Back" on 5 check-in pages went to `/login` | Participant pages → My RSVPs; staff pages → Manage event |
| Typed codes at the station recorded as `personal_qr` | Recorded as `manual`, so the CSV shows typed vs scanned |
| RSVP page kept showing the old "spots left" after an RSVP | `RsvpView` reloads the event after a successful RSVP (Gregory's file; UI refresh only) |

Re-verified live: the dashboard shows 0/0 after a cancellation, typed check-ins export as `manual`, the Back links are correct, and the RSVP count updates to "1 of 2".

## Test results on `dev` after the fixes

| Check | Result |
|---|---|
| `pnpm build` | passes |
| `pnpm test:unit` | 51/51 |
| Feature 1 client / server tests | 31/31, 14/14 |
| venue-switch rules | 5/5 |
| Playwright (demo mode) | 49/51 |

The two Playwright failures (`feature4-interactions.spec.js:105` keyboard task move and `feature4.spec.js:269` rain switch) also fail on Denzel's pre-merge commit `5962570`. `feature4.spec.js:158` (Sortable drag) is flaky on both.

`playwright.config.js` forces `VITE_USE_MOCK=true`, so the e2e suite never exercises live mode.

## Follow-up: Feature 1 and RSVP rules fixed live (same evening)

Huxley connected the Supabase MCP to the Bookerz project. That allowed reading the live schema and advisors, applying migrations and checking rows directly. Huxley approved the full Feature 1 plan, the database interest list and all three RSVP rules.

**Why Profile save failed** (two separate causes):
1. It wrote `postal_code`, `lat`, `lng` and `interest_weights`, none of which existed on `profiles`.
2. It used `upsert`, and `profiles` has no INSERT policy (rows come from the sign-up trigger; users may only UPDATE their own row).

*Correction:* the earlier "blank name" finding was wrong. The name loads; the page-text reader used in the test does not show input values.

**Other things found in the live schema:**
- `events_with_counts` existed only on the hosted project, as a SECURITY DEFINER view. The Supabase security advisor flagged it as an **ERROR**: it ignored RLS, so anyone could read draft events and counts.
- Every event's `category` is NULL. Gregory's creation stores tags in `event_interests`. So the category filter never matched, and "For you" never scored interests or distance (the view had no tags or coordinates).
- Five of the 14 Profile interests (`networking`, `academic`, `social`, `hackathon`, `outdoor`) can never match an event tag. Tags use the 10 slugs in `public.interests`.

| Migration (applied to Bookerz and in the repo) | Change |
|---|---|
| `20261022100100_feature1_discovery_contract` | `profiles` gains `postal_code`, `lat`, `lng`, `interest_weights` (jsonb), with checks and column grants. `events_with_counts` is rebuilt as a **security_invoker** view: published events only, counts from `event_availability()`, plus `tags` and the active venue's `lat`/`lng`. The advisor ERROR is gone |
| `20261022100141_rsvp_rules` (Gregory's functions, live bodies with marked changes) | `register_for_event`: organisers and helpers can't RSVP to their own event. `cancel_registration`: no cancelling after check-in. `_promote_waitlist`: offers expire at `least(now() + 24h, starts_at)`, and no offers once the event has started |

**Code changes:**
- **Profile:** `update` instead of `upsert`; interest options are the 10 database slugs.
- **Discover:** filters on `tags` (`overlaps` / `contains`) instead of `category`; `EventCard` shows the first tag; event links open `/events/:id/rsvp`.
- **`/api/recommendations`:** queries as the signed-in user (`server/lib/userSupabase.js`, the user's JWT + publishable key), so RLS applies (Project Info H2). It reads `registrations` instead of `rsvps`. The interaction endpoint bumps the event's `tags` and uses `update`.
- **Tests:** Aishani's tests are updated to the new contract.

**Verified live** (test1 organiser, test2 participant; a `[TEST]` event deleted afterwards):

| Check | Result |
|---|---|
| Profile | Name loads; save stores postal code 178902 → (1.2974, 103.8496) and `{"tech":1,"music":1}`; reload shows them |
| "For you" | 200 under the user's JWT. Reasons are now "Matches your interests: tech / music" and "Near you (0.2 km away)" |
| Tag filter | "Gaming" shows only Board Games Meetup |
| Signed-out view | 7 published events with counts, tags and coordinates |
| Rule 1 | test1 RSVPing to own event → "Organisers and helpers can't RSVP to their own event"; no row created |
| Rule 2 | Checked-in test2 cancelling → "You have already checked in, so this RSVP can't be cancelled"; still confirmed |
| Rule 3 | Rolled-back transaction with a temporary third user: the promoted offer expired exactly at the event start, not 24 h later. Nothing left behind |

**Tests:**

| Check | Result |
|---|---|
| Build | passes |
| `test:unit` | 51/51 |
| Feature 1 client / server | 31/31, 14/14 |
| Playwright | 49/51 (same two pre-existing failures) |

**Environment note:** VS Code's Live Preview was listening on `127.0.0.1:3000` and `:3001`, so `server.js` (hard-coded to 3000) could not start. The live check ran Express on 3999 through a local wrapper with `VITE_API_URL=http://127.0.0.1:3999`. A `PORT` env variable in `server.js` would avoid this (Timothy).

## Open issues, by owner

| Owner | Issue |
|---|---|
| Timothy | Review migrations `20261022100100` and `20261022100141`. Remaining advisor WARNs: SECURITY DEFINER RPCs executable by `anon` (most check `auth.uid()` inside, but revoke where sign-in is required); leaked-password protection is off. `server.js` port is hard-coded |
| Aishani | `lib/supabase.js` duplicates `utils/supabase.js` and crashes `/discover` and `/profile` in demo mode. `EventDetailsDialog` and `RecommendationCard` are not mounted. Discover sends ~8 `/api/recommendations` requests per page load. `image_url` cover images are not wired to R2 |
| Gregory | Review the three rules in `20261022100141_rsvp_rules.sql`. UI follow-ups: hide "Cancel RSVP" once checked in (the confirm prompt stays open after the refusal), and hide the RSVP form for the event's own team. Demo (mock) mode does not enforce the new rules. `waitlistScore.spec.js` needs Vitest (never runs) |
| Denzel | `feature4-interactions.spec.js:105` fails; two Feature 4 e2e cases are flaky |
| Huxley | JsBarcode on the ticket; manual name/email search at the station; "attend" interaction to recommendations after check-in (now unblocked: `POST /api/recommendations/interactions { eventId, type: "attend" }`); check-in E2E test; `AttendanceDashboardView` cohesion is low in the graph (0.14 earlier) |
| Timothy | Event creation leaves venue rows behind after event deletion. `R2_PUBLIC_URL` / `VITE_R2_PUBLIC_URL` are missing from `.env.example` |
| Vivienne | `/editor` saves nothing to `floor_plans` yet. Vue "extraneous dragend listener" console warnings |

## Environment notes

- **`server/.env`** needs `R2_PUBLIC_URL`. **`client/.env`** needs `VITE_R2_PUBLIC_URL` (public URL only). Never put secret keys in `VITE_` variables.
- **Optional client variables:** `VITE_API_URL` (defaults to `http://127.0.0.1:3000`) and `VITE_USE_MOCK=true`.
- **Express:** `pnpm start` / `pnpm dev` now use `node --env-file=.env` and fail if the file is missing.

## AI use

Claude Code (Opus) did the following under Huxley's direction:
- created the branches and PRs;
- resolved conflicts (per-file Claude Haiku subagents for `dev2`; decisions confirmed by Huxley for `dev`);
- regenerated lockfiles;
- ran builds, tests, the graphify reviews and the live browser test;
- wrote the four fixes above;
- in the follow-up, applied the two migrations through the Supabase MCP and made the Feature 1 / RSVP code changes. Huxley explicitly approved each plan;
- wrote this documentation.

The dashboard fix changed a block marked as Huxley's core logic. It is a minimal bug fix explained in the code comment, and Huxley owns it. The follow-up changed Aishani's and Gregory's code and SQL at Huxley's request. Their ranking and waitlist-scoring algorithms were not rewritten, only the schema contract, data access and three agreed rules. They should review these changes. Summarised in the [README disclosure](../README.md#ai-assistance-disclosure).
