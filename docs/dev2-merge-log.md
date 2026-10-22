# dev2 merge log: huxley + vivi + aish

Prepared 22 October 2026 by Huxley, working with Claude Code (AI-assisted, see [AI use](#ai-use)).

`dev2` brings Features 1, 3 and 6 together so they can be merged into `dev`
(Denzel + Gregory + Tim) in one step. This follows the proposal's merge plan: merge
denzel + gregory on `dev`, then merge huxley, aishani and vivienne.

**Status:** `dev2` was merged into `dev` on 22 October 2026, after Denzel finished
his merge at `5962570`. All six features are now on `dev`. See
[Merged into dev](#merged-into-dev-22-october-2026) for the decisions.

## What's on dev2

| PR | Source | What it adds | Conflicts |
|---|---|---|---|
| [#3](https://github.com/kohkwg/WAD2-Project/pull/3) | `huxley` | Feature 3 check-in basics: My Ticket, self check-in, staff station, venue QR, attendance dashboard, CSV import/export | none |
| [#4](https://github.com/kohkwg/WAD2-Project/pull/4) | `vivi` via `integrate/vivi-dev2` | Feature 6 floor plan editor skeleton (`client/src/editor.vue`, Vue-Konva) | 4 files |
| [#5](https://github.com/kohkwg/WAD2-Project/pull/5) | `aish` via `integrate/aish-dev2` | Feature 1 Discover, "For you" recommendations, profile, R2 upload route, unit tests | 5 files |

- `dev2` was branched from `main` (`f969d40`). All three source branches were exactly up to date with `main`.
- The vivi and aish conflicts were fixed on `integrate/*` branches cut from `dev2`, so
  **`vivi` and `aish` were never pushed to**. The `integrate/*` branches can be deleted.
- Merge order: huxley, then vivi, then aish. Each PR was a merge commit (not squash), so authorship is kept.

## Conflict resolutions

### vivi into dev2 (PR #4)
- **`client/package.json`**: kept both sides' dependencies: check-in (`html5-qrcode`, `papaparse`, `qrcode`) and `konva` / `vue-konva`.
- **`client/src/App.vue`**: kept `<RouterView />`. vivi's branch replaced the whole app
  with `<Editor />`, which would hide every routed page. The editor got its own route instead:
  **`/editor`** (no login for now).
- **`client/src/main.js`**: `createApp(App).use(router).use(VueKonva).mount('#app')`.
- **`client/pnpm-lock.yaml`**: regenerated with `pnpm install --lockfile-only`.

### aish into dev2 (PR #5)
- **`client/src/router/index.js`**: kept the shared router (login guard, page titles,
  F3 and F6 routes) and added `...feature1Routes`. **`/` is now the Discover page**
  (it used to redirect to `/login`), and unknown URLs now redirect to `/`.
  `feature1Routes.js` is unchanged.
- **`client/src/App.vue`**: kept aish's navbar (Home / Profile) above `<RouterView />`.
- **`client/src/main.js`**: kept router + VueKonva (aish's branch predates vue-konva).
- **`server/package.json`**: aish's `--env-file=.env` `start`/`dev` scripts plus the check-in `seed:checkin` / `test:checkin` scripts.
- **`client/pnpm-lock.yaml`**: regenerated.

### How conflicts were handled
Each conflicted file went to its own Claude Haiku subagent, running in parallel, with
a written resolution decided beforehand. Each subagent could edit only its one file and
could not run git. Every result was then checked by hand: no conflict markers left,
the JSON parses, and the result matches the brief. Lockfiles were always regenerated, never hand-merged.

## Verification on dev2
- `pnpm build` (client) passes after each merge.
- aish's unit tests: **31/31 client** (`node --test tests/*.test.mjs`), **14/14 server** (`node --test tests/*.test.js`).
- The final `dev2` tree is identical to the tree that was built and tested.
- Not verified: a browser run against a real Supabase project, and the check-in RPC
  script (`pnpm test:checkin`, needs `.env`).

## Code review of dev2 (graphify)
A knowledge graph of the `dev2` code (555 items, 887 links, built at `958c8c8`) found
no unresolved imports, orphan code or import cycles. Issues, checked against the source
and Timothy's "Project Info" schema review:

1. **High: Feature 1 doesn't match the schema** (Aishani / Timothy). The code uses
   `events_with_counts`, `rsvps`, `start_time`, `tags`, `image_url` and
   `profiles.interest_weights`. None of these exist in the migrations on `main` or `dev`.
   The schema has `events`, `registrations`, `starts_at`, `event_interests`,
   `profile_interests`, plus an unused `for_you_events()`. Discover, Profile and
   "For you" will fail against the real database. The unit tests pass only because they use mock data.
   Files: `client/src/composables/useEvents.js`, `server/routes/recommendations.js`,
   `client/src/views/ProfileView.vue`, `client/src/components/EventCard.vue`.
2. **High: Express reads data with the service-role key.** `server/routes/recommendations.js`
   queries through `server/lib/supabase.js` (`SUPABASE_SECRET_KEY`), which bypasses RLS.
   This breaks Project Info H2 (one Supabase client per request using the user's JWT).
3. **Medium: two browser Supabase clients.** `client/src/lib/supabase.js` (F1) and
   `client/src/utils/supabase.js` (F3, router) are identical. That causes a "Multiple
   GoTrueClient instances" console warning.
4. **Medium: `/events/:id` doesn't exist.** Discover and Picked-for-you link to it.
   `dev` only has `/events/:id/rsvp`. Once merged into `dev`, the simplest fix is to point
   those links at Gregory's **`/events/:id/rsvp`** instead of adding a new route
   (`client/src/views/DiscoverView.vue:16`, `client/src/components/PickedForYou.vue:27`).
5. **Low (Huxley):** after a check-in, F3 should call
   `POST /api/recommendations/interactions { eventId, type: "attend" }` (the proposal says
   attending raises interest weights). Waits on issue 1.
6. **Low (Huxley):** the proposal lists JsBarcode, but My Ticket shows only the QR code.
7. **Minor:** `coverStyle` / `isFull` / `dateLabel` are duplicated between `EventCard.vue`
   and `RecommendationCard.vue`. `/editor` has no login check. `client/package-lock.json`
   (npm) sits next to the pnpm lockfile. The editor logs Vue
   "Extraneous non-emits event listeners (dragend)" warnings.

## Merged into dev (22 October 2026)
Merged through the `integrate/dev2-into-dev` branch and a PR into `dev`. Decisions confirmed by Huxley:

| Question | Decision |
|---|---|
| Shared shell | `dev`'s `App.vue`, NavBar and `main.css`. `main.js` adds `app.use(VueKonva)`. Dependencies from both sides are combined; lockfile regenerated. |
| Discover placement | **`/discover`** (NavBar link "Discover"). `/events` stays Gregory's list, so demo mode and `dev`'s e2e tests keep working. `feature1Routes.js` path changed from `/` to `/discover`. |
| Discover event links | Point to Gregory's **`/events/:id/rsvp`** (`DiscoverView.vue`, `PickedForYou.vue`). aish's `picked-for-you` test updated to match. |
| Feature 1 backend | **Merged as-is and flagged.** The schema mismatch and the service-role reads in `/api/recommendations` stay for Aishani and Timothy (see Code review, issues 1 and 2). |
| Access | Check-in pages need login (`requiresAuth`, which `dev`'s guard now honours under `/events/*`). `dev`'s `LoginView` is the only sign-in page; `DevLoginView.vue` was removed. `/discover`, `/profile` and `/editor` follow `dev`'s rule: login required in live mode. |
| Ticket entry point | "My ticket" button on confirmed RSVPs in My RSVPs (live mode only). |
| Staff entry point | "Check-in: Station · Venue QR · Attendance" links on Manage event (live mode only). |

Results on the merged tree:

| Check | Result |
|---|---|
| `pnpm build` | passes |
| `pnpm test:unit` | 51/51 |
| aish's tests | 31/31 client, 14/14 server |
| venue-switch rules | 5/5 |
| Playwright e2e | 50/51 |

The one e2e failure (`feature4-interactions.spec.js:105`) also fails on plain `dev` at `5962570`.

Not verified here: signed-in browser flows against the hosted Supabase project.

The section below is the original pre-merge trial plan, kept for history.

## Merging dev2 into dev (trial plan, 21–22 October)
A trial merge of `dev2` into `dev`
(`4a82d01`) was done locally in a scratch copy and thrown away. Nothing was pushed.

**Conflicts (6 files, all in shared code):** `client/src/App.vue`, `client/src/main.js`,
`client/src/router/index.js`, `client/package.json`, `client/pnpm-lock.yaml`,
`client/package-lock.json`. `client/src/utils/supabase.js` merges cleanly to `dev`'s version.

**Resolution used in the trial:**
- `App.vue`, NavBar, `main.css`: **`dev`'s shell wins** (per the proposal: Denzel's branch is the base).
- `main.js`: `dev`'s version plus `import VueKonva from 'vue-konva'` and `app.use(VueKonva)`.
- `client/package.json`: `dev`'s file with both sides' dependencies (`leaflet`, `sortablejs` +
  `html5-qrcode`, `konva`, `vue-konva`, `papaparse`, `qrcode`). Lockfile regenerated.
- Router: `dev`'s router plus:
  - `...feature1Routes` in place of `{ path: '/', redirect: '/events' }`.
  - The five F3 routes, with `meta.requiresAuth: true`.
  - `/editor`.
  - `dev`'s guard changed so `/events/*` is public **only if `!to.meta.requiresAuth`**.
    Otherwise `/events/:eventId/ticket` and `/events/:eventId/check-in` become public.
  - Use `dev`'s `LoginView` and drop `DevLoginView`. `LoginView` already handles
    `?redirect=`, which the venue QR link needs to survive login.

**Trial results:**

| Check | Result |
|---|---|
| `pnpm build` | passes |
| `dev` unit tests (`pnpm test:unit`) | 28/28 |
| `dev` Playwright e2e | 50/51 |
| aish's tests | 31/31 client, 14/14 server |

**Problems that exist on `dev` already** (not caused by dev2):
- `e2e/feature4-interactions.spec.js:105` "task status keyboard move keeps focus through
  save and failed retry" fails every time on plain `dev` (3 out of 3 runs).
- `client/src/utils/__tests__/waitlistScore.spec.js` imports `vitest`, which isn't
  installed, and `test:unit` only runs `feature4*` tests, so the waitlist test never runs.

**Problems dev2 would bring into dev:**
- **`/` and `/profile` crash in `dev`'s mock mode** ("supabaseUrl is required"), because
  `lib/supabase.js` calls `createClient` even without keys. Fix: make `lib/supabase.js`
  re-export `dev`'s `utils/supabase.js` (this also fixes issue 3).
- Check-in pages only work with real Supabase keys (they use the RPCs). In mock mode,
  My Ticket renders nothing.
- No e2e test covers check-in, Discover or the editor yet.
- **Two RSVP flows (Aishani / Gregory: pick one).** aish's
  `client/src/components/EventDetailsDialog.vue` RSVPs directly with
  `supabase.rpc('register_for_event', …)` and its own question form. Gregory's
  `RsvpView` on `dev` does the same through `createRsvp()` in `utils/supabaseApi.js`.
  Both match the schema (`register_for_event(p_event_id, p_answers)` and the
  `event_questions` columns), so neither is broken. After the merge, though, users
  would see two different RSVP screens. Suggestion: RSVP belongs to Feature 2, so the
  dialog's RSVP button should send users to `/events/:id/rsvp` (which also fixes issue 4).

## AI use
- AI tool: Claude Code (Claude Opus as the main agent, Claude Haiku subagents for
  conflict resolution). This counts as merge/integration and config work under the
  course AI policy. No feature logic was written by AI in this merge.
- AI did: branch and PR setup, conflict resolution following written briefs,
  regenerating lockfiles, builds and test runs, the graphify review, and this log.
- Every resolution was checked by hand before committing. The `dev2` → `dev` decisions above
  need sign-off from Denzel before they're applied.
- To be added to the README's AI disclosure.
