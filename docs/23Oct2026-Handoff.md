# Handoff, 23 October 2026: `dev` has all six features, live

Written by Huxley's agent (Claude Code) for teammates' agents. It summarises the
22–23 October integration session. Read it before changing `dev`. Details and
evidence are in [`merge-session-2026-10-22.md`](merge-session-2026-10-22.md); the conflict
log is in [`dev2-merge-log.md`](dev2-merge-log.md). Denzel's earlier merge is in
[`dev-merge.md`](dev-merge.md).

## TL;DR

- **Branch:** `dev` (code as of `f16abb3`) holds all six features (F1–F6) and runs against the hosted Supabase project **Bookerz** (`ehseusjdqaxugipbpqrz`). Work from `dev` on your own branch and merge back with a PR.
- **Database:** 10 migrations in `supabase/migrations/`, all applied to Bookerz. The repo and the hosted database match.
- **Live suite:** `cd client && pnpm test:e2e:live` → check-in journey 9/9, floor plan 6/6.
- **Demo suite:** `pnpm test:e2e` → 49/51. Two Feature 4 cases also fail on Denzel's pre-merge commit `5962570`.
- **Changes in your feature:** several teammates' features were changed at Huxley's request. **If one is yours, review it** (see "Changes in your feature").

## Rules that apply to every agent here

1. **Course AI policy.** AI is fine for boilerplate, debugging, mock data, tests and UI. Core business logic and algorithms belong to their owner. Anything AI-written goes in the README's "AI assistance disclosure" (keep it current).
2. **Never type passwords.** Test accounts `test1@example.com` (organiser) and `test2@example.com` (participant) exist on Bookerz, and a human signs in. The live e2e reuses saved sessions in `client/e2e-live/.auth/` (git-ignored).
3. **Test data:** prefix it `[TEST]` and delete it afterwards. Bookerz has **7 published events** that must stay untouched.
4. **Secrets:** server secrets live only in `server/.env`; never in `VITE_` variables, docs or commits.
5. **Business and backend decisions:** ask the owner or a human, never assume. Don't commit or push without the human's OK.
6. **Graphify:** the graph is local and ignored (`graphify-out/`). Run `graphify update .` before reviews; never commit the graph.

## What `dev` contains

| Feature | Owner | State on `dev` |
|---|---|---|
| F1 Discover, "For you", Profile | Aishani | Live and working. `/discover` (NavBar), `/profile`. Recommendations come from Express `/api/recommendations` (user JWT) and are personalised by interests and postal-code distance |
| F2 Events, RSVP, waitlist | Gregory | Live: create (4 steps, OneMap), approval flow, waitlist, 24 h offers, My RSVPs. Three new rules (below) |
| F3 Check-in + UI consistency | Huxley | Live and complete: ticket QR + barcode, station (camera QR/barcode, name/email search, typed code), venue QR, self check-in, live dashboard, CSV, fraud flags |
| F4 Organiser workspace | Denzel | Live: tasks, announcements (public feed), budget (exact cents, 90 % warning), NEA weather, server-verified venue switch |
| F5 Backend | Timothy | Supabase schema + RLS; Express `/health`, `/api/recommendations`, `/api/uploads/cover` (R2 presign); `expire-waitlist-offers` cron every 5 min |
| F6 Floor plan | Vivienne | Live: per-event editor at `/organiser/events/:eventId/floor-plan` (organisers edit), read-only on the public event page. Programme flow / venue map / helper placement / images not built |

**Routes:**
- Public: `/events`, `/events/:id/rsvp`.
- Login required in live mode: everything else.
- Check-in pages: `/events/:eventId/ticket`, `/events/:eventId/check-in`, `/organiser/events/:eventId/{check-in,venue-qr,attendance}`.

**Entry points** (live mode only):
- "My ticket" on confirmed RSVPs.
- "Check-in" and "Floor plan" links on Manage event.

## Migrations added in this session (all applied to Bookerz)

| Version | What it does |
|---|---|
| `20261022100100_feature1_discovery_contract` | `profiles` gains `postal_code`, `lat`, `lng`, `interest_weights`. `events_with_counts` rebuilt as a **security_invoker** view: published only, counts from `event_availability()`, `tags`, venue `lat`/`lng`. Replaced a hand-made SECURITY DEFINER view (advisor ERROR) |
| `20261022100141_rsvp_rules` | Organisers/helpers can't RSVP to their own event; no cancelling after check-in; offers expire at `least(now()+24h, starts_at)`, and none are made once the event starts |
| `20261023044027_attendance_interest_signal` | Trigger on `check_ins` insert: the attendee's `interest_weights` for the event's tags +1.0 (cap 5), mirroring `bumpInterestWeights()` |
| `20261023051511_floor_plan_public_view` | Anyone who can see an event can read its `floor_plans` row; editing stays organiser-only |

## Changes in your feature (please review)

- **Aishani (F1):**
  - Profile saves with `update` (no INSERT policy on `profiles`) and uses the 10 slugs in `public.interests`.
  - Discover filters on `tags` (event `category` is always NULL; creation stores tags).
  - `EventCard` and Picked-for-you link to `/events/:id/rsvp`.
  - `/api/recommendations` uses `server/lib/userSupabase.js` (user JWT, not the service role) and reads `registrations` instead of `rsvps`.
  - Tests are updated to match.
- **Gregory (F2):**
  - The three rules in `20261022100141_rsvp_rules.sql`.
  - `RsvpView` refreshes spot counts after an RSVP and shows the floor plan viewer.
  - `MyRsvpsView` shows "My ticket" on confirmed RSVPs.
- **Vivienne (F6):** `editor.vue` loads and saves per event, with real roles instead of the demo permission buttons, Save/Remove, and a read-only viewer. The drawing code is unchanged.
- **Denzel (F4):** `ManageEventView` has extra link rows (Check-in, Floor plan); the shell's router guard honours `requiresAuth` under `/events/*`.
- **Timothy (F5):** please review all four migrations.

## How to run

```sh
cd client && pnpm install && pnpm dev            # live mode if client/.env has Supabase URL + key
cd server && pnpm install && pnpm dev            # Express on 127.0.0.1:3000 (needs server/.env)
cd client && pnpm test:unit                       # 51 Node tests
cd client && node --test tests/*.test.mjs         # 31 Feature 1 client tests
cd server && node --test tests/*.test.js          # 14 Feature 1 server tests
cd client && pnpm test:e2e                        # demo-mode Playwright (VITE_USE_MOCK forced)
cd client && pnpm test:e2e:live                   # live Playwright; first time: --headed and sign in
cd client && pnpm test:e2e:live e2e-live/floor-plan.spec.mjs   # one feature
```

## Gotchas that cost time

- **Demo vs live:**
  - `playwright.config.js` forces demo mode, so the demo suite never tests Supabase.
  - Check-in, Discover, Profile and the floor plan only work live.
- **Port 3000:** on Huxley's Mac, VS Code Live Preview holds 127.0.0.1:3000/3001, and `server.js` hard-codes 3000. Run Express elsewhere and set `VITE_API_URL`. Adding a `PORT` env variable to `server.js` would fix this.
- **Realtime cold start:** Supabase Realtime can be cold-starting. Subscribe before loading and wait for `SUBSCRIBED` (see `AttendanceDashboardView`, `MyTicketView`).
- **Hidden Bootstrap inputs:** `.btn-check` checkboxes are visually hidden; in tests, click the `label[for=…]`.
- **Supabase sessions:** refresh tokens are single-use, so the live suite saves refreshed sessions after each run.
- **Page structure:** pages must not add their own `<main>`; the shell provides one.

## Open issues, by owner

| Owner | Issue |
|---|---|
| Huxley | Re-run the check-in live spec (refactored onto `e2e-live/helpers.mjs`, not re-run); test camera scanning on a real phone; add `R2_PUBLIC_URL` (server) and `VITE_R2_PUBLIC_URL` (client) to the `.env` files (cover image URLs contain `undefined` without them) |
| Aishani | `lib/supabase.js` duplicates `utils/supabase.js` and crashes `/discover` and `/profile` in demo mode; ~8 recommendation requests per page load; unmounted `EventDetailsDialog` / `RecommendationCard`; `image_url` not wired to R2 |
| Gregory | Hide "Cancel RSVP" once checked in and the RSVP form for the event's own team; demo mode doesn't enforce the new rules; `waitlistScore.spec.js` needs Vitest |
| Vivienne | Programme flow (`programme_items`), venue map, helper placement (`helper_placements`), floor-plan images (`floor_plan_assets`); vue-konva `dragend` warnings in dev mode |
| Denzel | `feature4-interactions.spec.js:105` fails; `feature4.spec.js:158/269` are flaky (pre-existing) |
| Timothy | Review the migrations; advisor WARNs (anon-executable SECURITY DEFINER RPCs, leaked-password protection off); venue rows remain after event delete; add the R2 public URL variables to `.env.example`; `PORT` for `server.js` |

Leftover remote branches, safe to delete: `integrate/vivi-dev2`, `integrate/aish-dev2`, `integrate/dev2-into-dev`.
