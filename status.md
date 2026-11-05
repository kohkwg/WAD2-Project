# Project status and timeline

5 November, authentication-page navigation — hide the redundant top-right Sign in
link on `/`, which already contains the sign-in/create-account form. Anonymous
visitors can still use the navigation link from other pages. NavBar script and
template compilation passed; browser verification and full build/suite not run.

5 November, saved events made findable — Save/Saved wording, a "View saved" toast action,
`/my-rsvps?tab=saved`, a Saved chip on Discover (list, map and count via `savedOnly`) and saved cards
with a badge, one main action and ended saves last (decisions.md, 5 November). Five new unit tests,
the four `saved-events.spec.js` cases and all eight `my-rsvps.spec.js` cases pass on a demo-mode
server; screenshots checked in both themes at 375 and 1280px. The live Saved chip query was exercised
only through a mocked Supabase client, not against Bookerz. No commit, push or hosted changes.

4 November, local stash conflict repair — combined the background page selectors
and retained the added local styles in `design-baseline.css`; Community keeps dev's
Groups/Friends imports rather than imports for removed Jio components. Both files
are free of conflict markers. Community's script, template, scoped styles and local
import paths, plus the shared baseline CSS, pass focused compilation checks.
No browser journey, full build/suite, commit, push or hosted changes in this repair.

3 November, local merge resolution — resolved the overlapping `aish-algorithm`
and `origin/dev` files. Retained Aishani's recommendation, saved-event, My RSVPs,
My events, palette, typography, illustrated landing and committed street-map
workspace; retained incoming Hangout/template, route helpers, backend and migration
source. The unused old SingaporeMap component follows dev's deletion; IslandArtwork
is retained for the landing. Geographic exports and Supabase adapter imports are
combined. All 77 Vue sources/templates and the shared stylesheet compile; 82
focused calculation/adapter/recommendation tests, seven local backend route tests
and twelve selected demo/mocked browser cases pass. Browser checks include
organiser-to-participant state updates and both creation template choices.
No live database writes, migration execution, full build/suite, commit, push or PR
merge performed. This checkpoint supersedes conflicting design descriptions in
the incoming history below; historical authorship entries are preserved.

3 November, Discover street-map follow-up — replaced the illustrated Discover map with a new Leaflet/OneMap GreyLite panel beside the existing timeline. Current-page filters feed both views; thumbnails select real venue coordinates, while titles still open event details. Map previews reuse existing RSVP/waitlist actions and supplied recommendation metadata. Co-located events remain selectable groups, with fit-all/zoom controls, tile retry and a missing-coordinate count. Existing palette and recommendation backend/composable preserved. No new dependencies, schema changes, commits or hosted writes. Verification: 11 focused discovery Node tests and 22 recommendation Node tests passed; three changed Vue SFCs compile. Manual in-app browser checks covered real tile loading, keyboard row/pin selection, cluster choice, preview dismiss/focus, light/dark reflow at 375/575/768/1280px with no horizontal overflow, and no console errors. Automated browser suite, forced tile-failure and live authenticated scoring were not run.

3 November, Discover workspace — integrated Aishani's reference with search,
compact Picked for you strip, pastel category shortcuts, dated event rows and a
sticky desktop map. Timeline and map share the current filtered/paginated event
array and selection; selected off-centre events pan into the embedded map frame.
Phones use List/Map tabs, a single initial pick and retained See all. Existing
recommendation backend/composable/filter helpers are unchanged; supplied scores,
reasons, source labels, save/dismiss/undo/retry and canonical event actions remain.
New rows show only real status/availability; full events link to the waitlist.
The existing selected island and water/Flyer/plane/bird motion are retained.
Six changed SFCs compile. Focused checks: 22 backend recommendation, 10 existing
discovery/projection and four new strip/row rendering cases pass. In-app demo
browser checks cover both themes at 375/575/768/1280px without overflow, desktop
and mobile selection/focus return, category/list/map consistency and empty search.
No full suite/build, live signed-in recommendation persistence, Safari/device,
dependency, database, commit, push or deployment verification in this pass.

3 November, stable-boat refinement — replaced translating/bobbing SVG hulls with
detailed fixed boats in `singapore-anchored-boats-plate.webp`, matching Aishani's
reference. `IslandBoats.vue` now animates only four wake streams and twelve stern
ripples; open-water currents/glints remain. The port/cargo/ferry/launch hulls are
painted and never change position. Moved the desktop pause control to the top
right so it does not cover the northwest ferry. Four component compilations pass;
in-app temporal checks confirm fixed anchors, changing water/wakes and all 37
water/wake effects freezing when paused. No console warnings/errors and no page
overflow at 375/575/768/1280px. A revised recording is in this chat's outputs.
The earlier sailing-route notes below are historical. No full build/suite,
hosted writes, dependencies, commit or push; reduced-motion CSS retained/compiled.

3 November, motion follow-up — added `IslandBoats.vue` with four visible sailing
routes (cargo, ferry, coastal speedboat and bay speedboat), bobbing vessels and
flowing wakes. Added `IslandWater.vue` with ten open-water ripple/glint patches
and shoreline flow. Negative route delays show boats immediately; Flyer rotation
is now 48 seconds. New sibling `singapore-living-water-plate.webp` removes the
painted sailing cargo ship while retaining the moored harbour vessel. It is shared
by map, landing artwork and neighbourhood thumbnails. An inherited play-state
connects new motion to existing pause/offscreen/tab handling; reduced-motion CSS
is retained in every component. Four SFCs compile; in-app measurements confirm
all four routes, ten currents and four wakes change over time, and all 33 new
animated elements actually freeze while paused. Responsive checks at
375/575/768/1280px show no page overflow or console warnings/errors. A short GIF
of the actual running map is in the requesting chat's outputs. No full suite,
build, hosted writes, dependencies, commit or push; reduced motion was compiled
but not re-emulated on this host.

3 November — expanded illustrated Singapore island integrated locally. The shared
1448×1086 WebP adds terrain, neighbourhoods and attractions; printed labels and
the static Flyer wheel were cleaned for independent overlays. Wheel, boats, plane
and birds retain the existing pause/visibility/reduced-motion implementation at
new positions. Event projection anchors and list neighbourhood thumbnails match
the new composition. A separate label component provides 10px labels, 44px native
button targets, keyboard/click zoom, closer-view attractions and viewport/collision
suppression. Mobile caption sits above the artwork to avoid covering Woodlands.
Four focused projection/clustering tests and four edited SFC compilations pass.
In-app browser checks passed light/dark at 375/575/768/1280px (no horizontal or
label overlap, one main), label zoom/focus, keyboard event preview/focus return,
pause/resume and mobile detail zoom. No console warnings/errors observed. The
standalone Playwright launch was blocked by the host sandbox; in-app browser
checks supplied the UI evidence. Reduced-motion CSS is preserved/compiled but
was not re-emulated in this browser. Checks used Node 24 and isolated demo server
5189; Node 22, full suites/build, Safari/device and live accounts were not tested.
No dependencies, database, hosted writes, commit, push or deployment changes.

2 November — shared typography tokens/classes now align Discover, My RSVPs and
My events, including their recommendation, ordinary, saved, next-event and
organiser cards. Profile and Community page titles also adopt the shared role.
Conflicting scoped font declarations and mobile overrides removed; original fonts
retained. At 100% zoom, a temporary Chromium probe measured matching page titles
at 375/575/768/1280px in both themes (32/35.5/39.36/48px, weight 700), 20px/650
ordinary card titles, 16px DM Sans body and 14px/600 buttons. No page overflow or
runtime errors. Four existing focused layout/action checks also pass; affected
Vue templates and styles compile. No full suite/build or behaviour/hosted changes.

2 November — organiser My events now has Upcoming/Drafts/Past/All tabs, search,
date sorting and session-retained view state. Mint header, date-led cards,
pending-request summary/filter and direct pending-approval links use existing
counts and routes. Past results link to attendance; existing drafts remain hidden
and can be rescheduled even when their old planned date elapsed. No new draft
creation/publishing workflow. Deletion confirmation and keyboard focus retained;
event counts refresh every 30 seconds and on focus. Five focused Node and seven
unique browser cases pass across targeted runs, including approval/rejection/
removal propagating to the participant My RSVPs on focus. Mobile/light/dark layout
checked at 375/575/768/1280px. All browser data is synthetic demo state; hosted
identity/RLS/persistence remains unverified. No SQL or scoring changes.

2 November — My RSVPs redesigned with a peach header, counts, accessible tabs,
next confirmed event, compact registration rows and independent saved-event cards.
Four focused components keep data/actions in the page. Existing offer accept/
decline, expiry, cancellation confirmation/focus and 30-second/focus refresh remain.
Directions use actual venue data; calendar downloads actual event times; live
ticket links retain `/events/:id/ticket`. Saved-event reads are caller-scoped,
paginated and use existing event mapping; unsave uses the preference endpoint.
Read failures remain separate from registration failures. Past attendance labels
require an explicitly unflagged check-in. Ten focused Node and ten unique mocked/
demo browser cases pass across targeted runs. Light/dark layouts checked at
375/575/768/1280px. No hosted persistence, SQL, scoring or dependency changes.

2 November — recommendation browser evidence: three updated mocked Chromium
journeys pass, including saved-event exclusion, different related-event reasons,
refresh, dismissal/undo, failure/retry and empty states. Light/dark and
375/575/768/1280px checks pass; bookmark target increased to 44px. Twelve synthetic
event drafts are prepared, not created. Local Express health responds successfully.
Live verification remains pending: Computer Use permissions are not granted and
there are no saved test sessions. No hosted mutations or participant resets.
See [separate mocked/live log](docs/testing/recommendation-journey.yaml).

2 November — active saves are excluded from both personalised and discovery
picks, while their evidence still supports other events. Applied the supplied
interaction test unchanged; all 22 focused interaction/quality/route tests pass.
Evidence snapshots and route fixture are unchanged. Hosted behaviour is unverified.

2 November — applied the supplied recommendation-quality update locally.
Historical/current organiser and team activity no longer supplies learned taste;
reasons identify supporting saves, registrations or attendance. Temporary event
debug logging was removed. Existing scoring changes and route fixture are retained.
All 22 focused quality/route/interaction tests pass with mocked data. No hosted
verification, database change, commit or deployment was performed.

27 October — separate public landing page: the illustrated hero is now at `/`,
and sidebar/mobile/footer Bookedz links return there. Discover retains its search,
recommendations, categories, Closing soon, timeline and Map/List browsing without
the hero. Landing search, explicit interest shortcuts and Map/List actions hand
filters into Discover; existing tab state retains them through reloads. Root is
public even when account lookup fails, while existing protected routes retain
their guards. Nine focused Node checks pass. Eleven browser journeys passed across
focused runs, with affected mobile cases rerun after an initial-load menu/focus fix.
The existing hero/search regression also passes at its new landing-page location.
No backend, SQL, dependencies, hosted changes or new artwork.

27 October — removed the sidebar promotional card and its Create event button at
Aishani's request. Other navigation/account controls remain. NavBar Vue compilation
and whitespace checks passed; no new browser run for this presentation-only removal.

27 October — sidebar account placement: signed-in live accounts now have Profile
and Sign out in the sidebar footer. The existing System/Light/Dark control is below
Settings and remains available to visitors. Two focused mocked browser journeys
passed at 1280px and 375/575/768px, covering ordering, theme changes, profile routing,
Escape/focus restoration and sign-out failure/retry/success. NavBar Vue compilation
and whitespace checks passed. This verifies mocked authentication only; no real
sign-out or shared Supabase operation was performed. Other concurrent layout work
was preserved.

27 October — map access and persistent recommendation visibility: the hero map
action now appears immediately below search with geographic browsing copy. The
existing map retains filters and event previews. Picked for you was previously
hidden by the Island/no-filters condition; it now has a compact variant for
filtered/List/Map views. Display filters preserve server scores/order; an explicit
View all picks control reveals other picks without clearing the user's filters
or describing unrelated events as matching them. Default homepage layout remains.
All 24 targeted Node checks and six mocked Chromium journeys passed, including
both themes/four widths, markers/previews and compact save/dismiss/undo. Shared
Supabase, SQL, backend routes and scoring were not changed or verified live.
The existing hero/search regression also passed; the compact journey was rerun
after final card sizing and screenshot-loading adjustments.

27 October — focused Discover search/card refinement: clearer hero search and
existing-category suggestions, clear search/removable filters, and tab-scoped
control-state retention when switching views or returning from details. Existing
cards now link titles and show real descriptions; ordinary cards show complete
date/time and omit unknown attendance counts. All 27 targeted component/helper
checks and five mocked Chromium journeys pass on Node 24.12.0, covering both
themes at 375/575/768/1280px, search/category/view preservation, details/RSVP route
navigation, empty feedback and recommendation save/dismiss/undo/retry. These check
navigation and mocked actions, not a real booking or hosted database integration.
No backend, SQL, route definitions, algorithms, dependencies or section order changed.

Category UI refinement is complete: larger directory cards/icons, hidden directory
view toggle and removable chips that preserve search and return focus to its input.
Focused category navigation/removal checks cover responsive light/dark layouts;
recommendations, backend and database remain unchanged.

Latest Discover frontend change: category grid/directory navigation and factual
Closing soon are implemented. Nineteen focused Node cases and three mocked browser
checks pass; the affected navigation case was rerun after accessibility/layout fixes.
No recommendation algorithm, backend, database or RSVP logic changed.

Final isolated SQL verification: all 17 PostgreSQL checks pass against the complete
local migration chain plus recommendation draft. No application/SQL fixes were
required. Shared Supabase remains untouched; deployment and hosted sign-in testing
still require approval. Details and platform-substitute limits are in testing.md.

Latest recommendation checkpoint: V1 is wired locally through Profile, Express and
For You. All 53 targeted Node cases and two mocked Chromium journeys pass. SQL is
still review-only; no shared database writes or deployment occurred. See
[deployment dependencies](docs/recommendation-design.md).

Consolidated 23 October; updated 31 October 2026. Dates use Singapore time; same-day entries are ordered
by milestone because exact times are not consistently recorded. This replaces
separate handoffs/merge/fix reports. [Decisions](decisions.md) records authority and
superseded choices; [testing](docs/testing.md) explains reproducible checks;
[README](README.md#change-history) retains detailed change history and library credits.

## Current checkpoint

All six features are integrated on `dev`, including the accumulated fix work,
project-wide frontend redesign, themes, motion and organiser/participant refinements.
The latest 24 October refinements used focused checks only; older full-suite counts
predate them. Denzel has now authorised committing/publishing this working state
as the shared design baseline. Use the published `origin/dev` SHA and Denzel’s
kickoff message for exact baseline identity; this is not a production deployment. Teammates' branches and PRs
are not changed by the publication. See [branch workflow](design-branches.md) and
[design](docs/design/DESIGN.md).

| Feature / owner | Working functionality | Remaining limits / acceptance |
| --- | --- | --- |
| F1 — Aishani | Public Discover in demo/live; tag/search/date filters; personalised reasons under user JWT; live profile load/save; R2 event covers. One browser client and refresh per identity. | Profile editing requires live mode. Legacy EventDetailsDialog is unmounted; RecommendationCard is used inside PickedForYou. Ranking remains Aishani's. |
| F2 — Gregory | Atomic four-step creation/OneMap; approval; RSVP, waitlist and offers; My RSVPs/tickets; UI+SQL own-team/check-in guards; matching demo offer deadlines. Create-event wizard also has a title name-suggestion dropdown and a **Generate plan** button (programme + tasks from past events, live mode only; added from the `vivi` branch, Gregory to review). | Full production concurrency/response-loss coverage is not established. Waitlist scoring is Gregory's; its nine former Vitest cases now run under Node. |
| F3 — Huxley | QR/CODE128 tickets; staff camera/manual/name/email search; venue QR/self check-in; Realtime ticket/dashboard; CSV/fraud fields; attendance interest trigger. | Physical camera/geolocation testing remains. Automated check-in uses typed codes/search; it does not prove real-phone scanning. |
| F4 — Denzel | Owner tasks/keyboard order; public/manual announcements; exact-cent budget/90% warning; real NEA reads; server-verified one-way venue switching. | Latest live NEA check correctly refused dry weather. Successful rainy switching remains weather-dependent; no claim of exhaustive concurrency testing. Historical three browser failures did not reproduce in the final runs. |
| F5 — Timothy | Supabase/RLS; Express health/recommendations/upload presigning; five-minute waitlist cron; validated public R2 uploads; future-created venue cleanup. | Existing SECURITY DEFINER warnings need owner review; leaked-password protection is off. Storage cleanup queue has no deployed drain worker; old unmarked venue orphans are intentionally untouched. |
| F6 — Vivienne | Per-event saved responsive plan and read-only viewer; programme CRUD/zone links; active venue map; real team placements and keyboard coordinates. Full-width Canva-style canvas (toolbar, in-place rename, resize handles, selection bar, keyboard); plan background (upload, opacity/rotate/size) that participants also see; route/drag-bound guards. | Explicitly live-only. The public finished-image panel was removed on 29 October; its stored files and rows are untouched but no longer shown. The background is a public R2 object (public bucket), not private storage. Multi-row helper saves can partially succeed and report retry; no transaction is promised. |

Bookerz development history contains the initial migration plus ten later versions
(**11 total**), through `20261023062011_event_cover_and_venue_cleanup`, and the
`venue-switch` Edge Function. The application schema and permissions were checked;
repository SQL alone is not proof of a future deployment.

Latest cleanup readback retained **seven published non-test events**, with zero
test events, zero temporary profile-name changes and zero newly marked unreferenced
venues. Test R2 objects were deleted; the rollback-only third test auth user did
not persist. These are dated observations, not permanent database invariants.

## Timeline

### 27 October — category UI cohesion refinement

- Added a roomier two-column directory variant using existing pastel artwork,
  reduced directory spacing and aligned results search/listing widths. Common
  category cards retain their compact layout; no unsupported event counts added.
- EventFilters shows removable category chips without opening Filters. Removal
  reuses category toggling, preserves search, clears a stale category query through
  replace navigation and returns keyboard focus to search. Browser Back and existing
  category URLs/RSVP links remain covered by the navigation regression.
- Three urgency Node checks and SFC compilation pass. Two focused mocked browser
  cases pass for existing navigation and the new directory/chip flow, covering
  light/dark and 375/575/768/1280px. The chip flow was rerun after narrowing an
  ambiguous test selector and adding focus recovery. Captures inspected under
  `/tmp/wad2-discover-browse-results`.
- No schema/SQL, backend, recommendation-section/scoring, existing route-definition
  or event-card changes; no new dependencies, full suite or production build.

### 27 October — Discover categories and Closing soon

- Kept mood cards, personalised actions and existing event timeline; added compact
  category links and an all-category directory on `/discover?view=categories`.
  `/discover?category=music` reuses the existing tag-filtered list, supports reload,
  browser Back and a directory return link. No additional event database or routes.
- Closing soon reuses EventCard and current filtered map data. It selects at most
  three upcoming events with a known deadline within 48 hours or 1–5 known places
  remaining. It excludes full/closed/unpublished/actively registered events and
  hides without qualifying data. Deadline labels include SGT; no fill predictions.
- Nineteen targeted Node checks pass (3 urgency, 12 recommendation cards, 4 actions).
  Two new mocked browser cases cover ordering, categories, filtering/reload/back,
  truthful urgency/hide behaviour; the existing recommendation-action journey also
  passes. Light/dark and 375/575/768/1280px covered; captures inspected. Corrected
  decorative-arrow accessible names and compact-card layout, rerunning the affected
  navigation case successfully after each correction.
- No shared database/network writes, schema/backend/scoring changes, dependencies,
  full suite or production build. Browser checks used the existing Playwright
  runner with an isolated temporary config on port 5187 and mocked event data.

### 27 October — isolated recommendation database verification

- With Aishani's approval to verify in isolation, downloaded a temporary PGlite
  runtime outside the project and added a test-only SQL harness. All eleven existing
  migrations plus the recommendation draft load in fresh in-memory PostgreSQL.
- Seventeen checks pass: permissions/RLS, profile save/rollback, save and confirmation
  timestamps, approval/cancellation/reconfirmation, waitlist offer acceptance, event
  creation, existing waitlist scoring, attendance/fraud/undo and rollback removal order.
- No product or SQL-draft correction was needed. Test scaffolding was corrected
  to invoke volatile composite-returning RPCs once and use the public organiser
  registration RPC rather than its intentionally private scoring helper.
- Auth identity, storage and cron are local substitutes. Hosted JWT, PostgREST,
  actual hosted grants and multi-connection concurrency remain unverified. No
  project dependency/lockfile, migration, shared Supabase or deployment was changed.

### 27 October — simplified recommendation MVP wiring

- Profile reads explicit profile_interests and uses a draft transactional profile
  RPC; legacy behavioural weights are neither inferred nor overwritten.
- Existing Express route loads user-scoped, paginated V1 inputs and batched history,
  excludes team/rejected events and returns the unchanged flat events envelope.
  Save/dismiss/undo uses the evidence store. Legacy interaction notifications verify
  actual records without permanent boosts; existing attendance trigger is untouched.
- Cards show topic match scores, supported reasons and general-discovery labels,
  preserve pipeline order, and support save/dismiss/undo with refresh and failure
  recovery. Signed-in read failures show retry, not unfiltered replacement picks.
- 53 targeted Node checks pass (9 routes/actions, 26 evidence/persistence/pipeline,
  18 Profile/card/composable). Two mocked Chromium journeys pass in both themes
  and at 375/575/768/1280px; keyboard, focus, retry and reflow covered. Inspected
  captures led to scoped dark-theme label/reason contrast corrections.
- Local tests use Node 24.12.0 and browser fixtures. The in-app browser was
  unavailable; the existing Playwright runner used an isolated localhost server
  with sandbox escalation. No SQL execution, Supabase connection, migration,
  deployment, dependency change, full suite or production build.
- Before live use, review/apply preference storage, first-confirmation capture/
  backfill, evidence RPCs and the profile RPC. Existing users may need to reselect
  explicit interests. Hosted permissions/concurrency and real journeys are pending.


### 27 October — V1 confirmation and first-timestamp contract alignment

- Added review-only `first_confirmed_at`, trusted confirmation capture for direct
  inserts/transitions and a best-known-date backfill for currently confirmed rows.
  Save updates preserve the first date through unsave/resave. SQL remains outside
  deployed migrations and has not been executed.
- Simulated persistence now models actual registration statuses and confirmed-only
  RSVP evidence. Five added cases cover confirmation/transitions, cancellation,
  ageing/reactivation and flagged attendance. Explicit choices are documented as
  `profile_interests`, never accumulated `interest_weights`.
- Ten persistence, eleven evidence and sixteen pipeline cases pass (37 total) on
  Node 24.12.0 without assertion imports. Core calculations/pipeline are unchanged;
  only evidence comments were clarified. No hosted access, frontend/route edits,
  full suite/build, dependency changes or SQL execution.
- Existing overwritten confirmation history cannot be recovered. SQL execution,
  RLS/concurrency and real data-loading adapter integration remain pending.

### 27 October — standalone recommendation pipeline

- Added `buildRecommendationPipeline()` with canonical historical evidence,
  event-interest mapping, eligibility, current-registration exclusions and labelled
  general discovery. Core functions and existing live code are unchanged.
- Inspected actual registration schema/RPC logic: `offer_expires_at <= now` is
  expired. Malformed offer expiry excludes the candidate with a diagnostic.
- Sixteen focused mock-data end-to-end tests pass, covering drift, deduplication,
  dismissal/undo, exact boundaries, fallback, diversity and deterministic behaviour.
  Conflicting duplicate evidence/candidates/registrations throw rather than guess.
- No assertion imports, dependencies, Supabase calls, SQL/migration changes,
  route/frontend edits, full suite/build or hosted deployment. These tests do not
  establish hosted security or real adapter consistency.

### 27 October — standalone diversity selection

- Implemented the approved Jaccard helper and greedy selector in `diverseEvents.js`.
  Penalty 0.3, stable input-order ties, unique positive-score events and separate
  ranking scores preserve explainable compatibility. No random selection.
- All 29 targeted diversity/preference/compatibility cases pass on Node 24.12.0
  without Node assertion imports. Eleven new cases include partial overlap,
  noncompounding penalties, ties, limits, zero matches and unchanged inputs.
- Existing `rankEvents.js`, Supabase, SQL, routes and frontend are unchanged. No
  full suite/build, hosted operation or deployment; full pipeline remains pending.

### 27 October — standalone compatibility scoring

- Implemented agreed per-tag rational fit, averaged over unique tags including
  unmatched tags. Returns an unrounded 0–100 topic-fit score and zero for missing
  tags or empty preferences, assuming valid nonnegative finite points.
- All 18 targeted compatibility/preference checks pass without Node assertion
  imports. Tests include the five hand-calculated examples and baseline-to-learned
  preference integration. No full suite/build or database operation.
- Existing ranking, routes, SQL, frontend and RSVP logic are unchanged. Diversity
  selection and integration remain pending.

### 27 October — local preference-builder completion

- At Aishani's direction, completed the remaining preference-scoring chunk: equal
  splitting across unique interest tags, accumulation across distinct events and
  separate explicit/learned/combined score objects. Explicit priors stay at 10.
- Seven targeted checks pass on Node 24.12.0 without Node assertion calls. No
  additional ageing, caps, hierarchy or conflict resolution were introduced.
- Duplicate evidence must be canonical and identical. No database, SQL, migration,
  route or live ranking changes; compatibility and further integration remain pending.

### 15–16 October — orientation and first Feature 4 delivery

- Read supplied assessment/proposal resources, record team ownership and distinguish
  official requirements from plans. The old assistant orientation is not current
  implementation or independent faculty approval.
- Denzel authorises Feature 4. Timothy's selected
  SDK/schema/config/env files are imported from `575e20d`; no merge/deployment implied.
- Deliver the async demo workspace, tasks, public announcements, SGD budget and
  weather/backup switch, then correct order, feed/venue refresh, money editing,
  shared Bootstrap presentation, navigation/focus and request handling.

### 17 October — review and authorised frontend corrections

- Review Feature 4/shared boundaries, then fix all authorised P2/P3 issues with
  independent integration review: destructive retry/cancel,
  focus, public feed/RSVP semantics, stale OneMap/search results, offer refresh,
  publication validation, route reuse and consolidated weather reads.
- Final checkpoint: **27 Node / 50 demo Chromium**, production build and 40 responsive
  captures passed. This was demo evidence; hosted integration was still deferred.

### 21–22 October — Denzel, Gregory and Timothy integration

- Combine the async demo/live API and retain Feature 4, public RSVP routes,
  effective venue/map and event deletion/removal behaviour. PR #2 brings these
  contributions into `dev` (`4a82d01`); earlier direct PR #1 is superseded.
- Deploy public announcements, owner Feature 4 operations, trusted NEA switching,
  atomic idempotent creation and private availability. `dev` reaches `5962570`.
- Two development accounts are verified. An authorised backup/cleanup replaces
  36 duplicate/obsolete events with six distinct events; this is data maintenance,
  not proof of app flows. Later checkpoints find seven published events.
- A merged checkpoint passes **51 demo browser cases**. Public reads and local
  PostgreSQL contracts are checked; signed-in acceptance was not yet complete.

### 22 October — all six features integrated

- Huxley integrates `huxley`, `vivi`, `aish` through PRs #3–#5 into `dev2`, then PR #6
  merges it into `dev` (`afadf0e`). Temporary integration branches do not imply pushes
  to teammates' feature branches. Historical conflict details remain in Git history.
- Keep the routed shell; add F3 routes/entry points, Vue-Konva and F1. Fix ticket/
  station Back links, typed check-in method, dashboard counts and RSVP count refresh
  (`de3978e`). Sign-in is done by a human; temporary live records are deleted.
- The integrated checkpoint passes build, **51 utility / 31 F1 client / 14 server**;
  demo browser is **49/51**. Keyboard task move and rain switching also fail on the
  pre-merge commit; Sortable is flaky. These results are historical, not current failures.
- Deploy discovery contract `20261022100100` and RSVP rules `20261022100141`:
  profile fields/update policy, published security-invoker view, tag/coordinate
  contract, caller-JWT recommendations and agreed team/check-in/offer rules.
  Signed-in profile/recommendation/filter and rule checks pass.

### 23 October — check-in and original floor-plan follow-ups

- Huxley's follow-up adds JsBarcode, staff name/email search, attendance weight
  trigger `20261023044027`, live e2e, and fixes Realtime subscription order plus
  nested `main` landmarks. Check-in journey: **9/9**, three consecutive runs.
- Original F6 save/read-only viewer and public visibility migration `20261023051511`
  pass **6/6 live**. The later helpers refactor initially leaves check-in needing
  a rerun; that rerun is completed in the next checkpoint.
- Whole-app checks establish F1, F2 approval, F4 tasks/feed/budget/weather denial,
  Express recommendations/presigning and cron. Missing R2 public URLs and several
  UI/demo/unused-code gaps are recorded for the later fix pass.

### 23 October — fixes and live verification

- Read handoff/disclosure first; install client/server locked dependencies and run
  requested baseline tests. Work around this host's Corepack launcher without
  upgrading dependencies. Environment inspection prints names, not values.
- Fix duplicate Supabase client, demo Discover crash, repeated recommendations,
  profile errors/retry, effective backup-venue display/search, RSVP action guards
  and demo rules. Enable waitlist tests with the existing Node runner.
- Add cover UI/persistence and validated Express uploads/PORT. With explicit user
  approval, apply `20261023062011_event_cover_and_venue_cleanup` after **15/15**
  local PostgreSQL assertions. New provenance permits safe future venue cleanup;
  old catalogue/orphan rows are preserved. No broad grant revocation is made.
- Complete programme/map/team placement/public finished-image F6 flows. Fix Konva
  warnings, responsive scaling, lifecycle/image load-upload races, boundary-node
  clamping and helper save-completion signalling. Independent review closes the
  three additional F6 findings.
- The human signs into both test accounts remotely. Correct the temporary session
  helper's forwarding-origin and sign-out issues, verify both refresh tokens, and
  replace the helper with the ordinary dev app afterward. Humans type all passwords.
- The user configures both R2 public URL variables and CORS. Real presign/PUT/public
  GET return 200 with matching bytes; browser preflight returns 204 and test objects
  are deleted. The Cloudflare connection itself is personal-account scoped.
- Final fix-pass verification: **build passed; 65 utility, 37 client, 21 server,
  61 demo Chromium and 30 live feature cases passed**. Two manual-login setup cases
  are skipped because sessions exist. Test profiles are restored. Hosted rollback-only
  waitlist lifecycle/deadline/grant assertions pass; cron is active every five minutes.
  NEA refuses a dry-area switch with no venue/post changes. A large-bundle warning remains.

### 23 October — one browsing destination

- At Denzel's request, remove Events tab/placeholder. Home/brand use public Discover;
  legacy `/events` redirects preserve query/hash and event-detail paths remain.
- Build and **62/62 demo Chromium** pass. A read-only anonymous live browse/details/
  private-Profile guard case passes; two saved-login setup steps are skipped.
  Update the skip-link test to account for existing main focus after lazy navigation.
  No hosted writes or backend behaviour changes in this follow-up.

### 23 October — frontend motion work in the shared working tree

- A separate task records Denzel's Lenis/Motion for Vue/GSAP request. Dependencies,
  `ScrollExperience.vue`, `scrollReveal.js`, Discover integration and motion browser
  tests are present. Its design/constraints are collated in [decisions](decisions.md#frontend-motion).
- **Verification pending in this consolidated checkpoint:** the 62 demo / 30 live
  results above predate the motion edits and must not be represented as fresh tests
  of those edits. Update this entry when the motion work supplies its actual results.
  Safari/iOS and physical touch remain outside automated Chromium evidence.

### 23 October — documentation consolidation

- Replace repeated handoffs, merge/fix reports, per-package READMEs and historical
  local plans with this timeline, the decision register and one test guide.
- Preserve supplied resources byte-for-byte and retain the change history and library
  credits. A tiny `docs/README.md` keeps the resource index's existing link valid.
- Older tracked documents remain available in Git history. Pre-consolidation copies,
  including formerly untracked notes, are temporarily backed up outside the repo at
  `/tmp/bookedz-docs-before-consolidation-20261023`. No new archive folder is required
  to navigate the project. This pass changes documentation/reference comments only;
  other in-progress application work is retained.


### 23 October — map-first frontend redesign

- Denzel authorises replacing the existing UI/UX across the project using the
  supplied ideation spec. Work split into shared system/discovery, participant/account,
  organiser/operations and attendance/venue screens. Backend contracts remain.
- Deliver self-hosted Bricolage Grotesque typography, cream/coral/mint tokens,
  brand vector/favicon, shared navigation/footer, responsive layouts across all
  six features, and design-system/gallery/asset-register artifacts. Supplied
  resources and existing dirty work are preserved.
- Add illustrated 2.5D Singapore discovery with Natural Earth coastline, real
  active-venue coordinates, all filtered map pages, disjoint prominent markers
  and clusters, same-location selection, keyboard controls/preview/focus,
  missing-location counts and a list alternative. Marker hit areas stay at least
  44 CSS pixels at all four checked widths. No dummy venue addresses are displayed.
- Use Lenis outside interactive regions, Motion for Vue previews and a GSAP
  ScrollTrigger scene entrance. Respect reduced motion and native touch. Fix the
  initial lazy-route mobile-menu race and preserve Konva's explicit stage sizing.
- Unit checks: **68/68 utility cases**, **38/38 client component/data cases**.
  Production build passes with the existing large-chunk warning. The final complete
  demo browser suite passed **69/69**, including seven new discovery/map/responsive/
  history cases. Navigation waits for asynchronous content before restoring saved
  positions; Lenis refreshes its dimensions before Router saves the leaving page.
- Read-only anonymous live browse/detail/private-Profile guard: **1/1**, on port
  5197 because another process owned 5174. No hosted data was changed. The earlier
  signed-in live write suite was not repeated for this visual pass.
- Seven preview images (six screen captures plus a desktop overview) are in
  `docs/design/previews/`; captures reported no uncaught
  page errors. Earlier verification failures exposed four presentation selectors,
  a Konva height override, dev HMR/test router duplication and stale Lenis page
  limits during history navigation. Those were corrected or rerun against a fresh
  server. Keep sources frozen during route-module tests. The final 69-case run
  and read-only live check were repeated after the last navigation correction.
- Limits: physical camera/GPS, Safari/iOS and device performance remain unverified.
  The SVG map is an authored generalised illustration, not a route-finding map;
  decorative geography and small-island detail are approximate. No new tracking,
  payments, host verification policy, SQL, deployment or cloud mutations.


### 24 October — immersive landing and experiential cards

- Implement the supplied new frontend brief with a large expressive headline,
  DM Sans body typography, integrated search/category controls, refined pastel
  tokens and a dominant illustrated Singapore scene.
- Preserve the supplied PNG. Built-in image editing removes baked pins/counts/labels;
  the clean plate is encoded to a 398 KiB WebP. Island view is decorative; live
  Map view retains geographic coordinates and real clusters. No arbitrary event
  placement on the PNG, fake counts or new event data.
- Add scoped GSAP headline/control/card/section reveals, desktop parallax,
  mode transitions and independently animated SVG cloud/boat accents. Reduced
  motion, offscreen/tab pause, focus completion and lifecycle cleanup are retained.
- Add category exploration, live-map neighbourhood camera links, a hosting
  invitation and fallback to actual upcoming events when personalisation fails.
  Cards use uploaded images first and category-specific SVG art when unavailable.
  Concise venue display retains the complete accessible label.
- Refine cards/details and hosting navigation/organiser
  cards/create-step/cover presentation. Existing backend and registration rules
  remain. Source compiles for all 12 changed Vue components.
- Targeted verification only: **2/2 focused Chromium journeys passed** (desktop
  hero/Map/List/filtering and mobile reduced-motion/keyboard/44px targets), plus
  **2/2 targeted card test files**. Desktop/mobile captures were visually inspected.
  The first browser check found an SVG label intercepting another marker; labels
  are now hover/focus-only and never intercept pointers.
- No full suite or production build run, per user instruction. No live writes,
  deployment, commit, dependency upgrade or server/schema rewrite. Current art
  provenance and screenshots are recorded in `docs/design/assets.md`.
- Limits: the illustration is not a geographic basemap; baked MRT/trees remain
  static. Actual touch-device feel, Safari and signed-in live write flows were not
  rechecked during this targeted pass.


### 24 October — supplied artwork becomes the interactive map

- Replace discovery's old SVG terrain with the same cleaned illustration used by
  the hero. Dynamic markers/clusters, selection previews and the artwork now pan
  and zoom together in one SVG coordinate system.
- Add regional calibration derived from real event coordinates. Positions are
  labelled approximate; unknown/out-of-frame venues stay in the list and event
  details retain the precise venue information. No random/per-event slots.
- Move mobile controls below the image to avoid obscuring pins. Preserve keyboard
  operation, reduced motion, focus restoration and 44px marker targets.
- Only targeted checks: projection/cluster test file passed, changed map template
  compiled, and **2/2 affected desktop/mobile Chromium checks passed**. New map
  screenshots are saved in `docs/design/previews/interactive-illustration-*.png`.
  No full suite, production build, dependency change or hosted write.


### 24 October — replacement illustrated island with moving details

- Adopt the user's newer **Singapore Island Illustrated Map.png** in the hero,
  interactive map and neighbourhood thumbnails. Preserve the supplied original;
  an image generation tool prepares a background without the baked Flyer wheel and one
  speedboat. The app uses a 298KB WebP with no new dependencies.
- Share separately animated SVG wheel/counterrotating cabins, sailing boat/wake
  and seabirds. Fixed support stays still. Pause controls, offscreen/tab visibility
  and reduced motion govern movement. Port ships, trees, MRT and plane stay baked.
- Recalibrate broad regional markers, preserve real venue data, keyboard focus,
  44px targets and map pan/zoom. Markers lift on interaction and previews spring in.
- Targeted checks: projection/cluster test file passed; three changed component
  templates/styles compile; desktop 1440px and mobile 375px browser journeys both
  passed. After tidying mobile pause placement, only the affected mobile journey
  was rerun (1/1 passed). Captures visually inspected; whitespace check passed.
  Local code graph refreshed (SQL extractor unavailable; prose not refreshed).
- No full suite or production build, per user instruction. No hosted writes,
  dependency changes, commit or deployment. Safari and actual touch-device feel
  remain outside this bounded verification.

### 24 October — design-skill review and navbar/search refinement

- Install the three requested skills locally; run UI/UX Pro Max searches,
  Hallmark source audit and Vercel guideline review. Preserve existing local font
  families and consolidate semantic colours/control states/shadows globally.
- Replace hosting-strip navigation with floating frosted chrome, opaque fallback,
  session-dependent personal links and an Escape-accessible mobile menu. Guard
  async session initialization and preserve demo identity/auth adapter contracts.
- Integrate search below hero copy, flush pending search on view changes, improve
  control metadata, stack tablet layouts and feather raster edges in both views.
- Five focused browser checks passed, then only the two affected checks were
  rerun after tablet adjustment (2/2 passed). Captures/overflow checks cover
  375/575/768/1280px; existing checks also cover 1440px. Compile/whitespace checks
  pass. Hallmark scoped source audit: 0 FAIL, 49 spacing REFLEX, 4 WARN; its browser
  tier could not run because Puppeteer is absent. Playwright captures supplied
  visual evidence; see `docs/design/DESIGN.md` for limitations.
- Resolved the preceding sync diagnosis: the container saw the new map files but
  Syncthing's index did not. A project-scoped rescan returned HTTP 200; both the
  animated plate and IslandArtwork component now appear in the server index.
  Windows receipt is not independently verified.
- No full suite, production build, runtime dependency, commit or deployment.


### 24 October — motion, themes and workflow hierarchy

- Add System/Light/Dark preference, system/cross-tab updates, persistent manual
  choice and pre-paint theme initialization. Keep artwork colours independent of
  UI theme. Add meaningful ticket-like event actions and consistent status SVGs.
- Move categories inside Filters; preserve active counts and pending search. Use
  interruptible view transitions with a reduced-motion/fallback path. Add one-way
  boat/ferry motion, sparse birds/plane and the existing paused Flyer loop.
- Refine Create Event into a draft-preview studio with step motion/focus. Give
  public event facts the wider desktop column, with a compact RSVP side panel;
  use date-led My RSVPs cards and actual status totals. Preserve ticket live mode.
- Reorganise Manage Event header, Manage RSVP/public-event links and live tools;
  standardise Tasks/Announcements/Budget/Weather panels. Manage RSVP capacity
  graphics use real counts, with responsive labelled table rows and retained
  approval/offer/rank semantics. We integrated, reviewed and corrected shared behaviour/style issues.
- Theme/motion flows passed after correcting two selectors; seven additional
  focused checks passed for task keyboard focus, exact budget cents, weather
  failure, RSVP submission/refresh and desktop/mobile layouts/capacity counts.
  After a dark badge correction, only two affected views reran (2/2 passed).
  Changed components/styles compile; captures were inspected and whitespace checked.
- Documentation now records current behaviour, historical evidence and source
  provenance. Full suites/builds, live writes and Safari/device checks were not
  run. No runtime dependency, Git operation, deployment or schema change.

- Final participant capture review found an inherited dark offer-button contrast
  issue. OfferBanner now shares theme-aware actions/surfaces; the single affected
  public/My RSVPs check passed with a 4.5:1 contrast assertion. No wider rerun.

- Documentation checks resolved 61 local links/anchors and gallery asset paths;
  supplied source resources were left unchanged. Syncthing's project index was
  rescanned successfully and includes the new theme module. Windows receipt is
  still outside this server-side verification.


### 24 October — shared design baseline publication preparation

- Denzel authorises committing/pushing the current dev progress and sharing a
  fixed baseline with all six owners. `design-branches.md` documents exact remote
  names, PowerShell/Bash guards, preservation of dirty work, separate durable local/
  remote-tip backups, explicit leases and later feature pushes/PR integration.
- Verify dev matches origin/dev before publication; no remote integration was
  needed at preparation time. Keep `.env`, auth sessions, raw supplied resources,
  restricted documents, local skills/graphs and audit caches out of Git. Include
  app source, deployable artwork/fonts/licences, tests and shareable design docs.
- Only publication/document/resource checks apply to this pass. No full suite or
  production build is requested. Feature-branch resets, PRs, merges, deployment
  and hosted data writes are not part of this publication.


### 25 October — Gregory's F2 design branch (`gregory`)

- Gregory confirmed ownership and the one-time replacement. Both tips (`798c8e1`,
  identical locally and remotely) were pushed as
  `backup/design-baseline/gregory/20261025-174739-local` and `-remote`; `gregory`
  was then reset to baseline `86c026516690cc6f5e0f7c5bdbdde2093273fc02` with an
  explicit-SHA lease. No open PR used the branch (PR #1 merged on 21 October).
  Only the last commit (an older light/dark toggle) was absent from dev; the
  baseline's System/Light/Dark theme supersedes it, and it remains in the backups.
- Create Event: on Next, a typed but unadded RSVP question is added and noted on
  Review (it was previously dropped silently). Chosen-venue/question boxes use
  theme tokens instead of `bg-light` (unreadable in dark mode). Picking or
  changing a venue and removing a question keep keyboard focus; step headings are
  `h3`. On phones the form precedes the live preview.
- Public RSVP: phone-only state-aware "Go to RSVP" shortcut; 44px Yes/No choice
  pills around native radios; consistent "(required)"; spots left shown once;
  team members see a status card with Manage RSVPs for the organiser.
- My RSVPs and Manage RSVPs: confirm steps focus Keep first, return focus when
  kept, and focus the outcome message after a card/row disappears. Offer actions
  stack on phones. Manage RSVPs status-tab styles now apply (a scoped `:deep()`
  selector never matched), with 44px tabs; row actions name the attendee for
  assistive technology. Multi-day events show their end date (`formatEventTime`,
  also used by Manage Event).
- Targeted checks only: new `eventTime.test.js` 3/3; six changed SFCs compile;
  `git diff --check` clean. Demo Chromium: `workspace-design` 2/2,
  `legacy-review-fixes` 7/7 and four selected RSVP/team/wizard/radio cases 4/4.
  Before editing, the same 13 cases ran 10/13: three stale redesign selectors
  (step text, former Occupancy progressbar, former "RSVP" form heading); those
  assertions were updated to current markup. A scratch behaviour script passed
  44/44 (focus, contrast, pills, shortcut, tabs, reflow and one `main` at
  375/575/768/1280px; light/dark; reduced motion). Port 5173 was occupied by
  another process, so Playwright ran against an owned demo server on 5181.
- Host used Node 24.12 rather than Node 22. No full suite, production build, live
  or hosted check, Safari/real-device check, dependency change or Hallmark audit.
- Follow-up the same day: the seven components used only by F2 pages moved to
  `client/src/components/rsvp/`. `RsvpStatusBadge` stays in place as a shared
  status component, and `VenueMap` stays because F6's editor also imports it.
  My events now follows the theme: its footer was `bg-white`, coral buttons forced
  white text (1.8:1 in dark) and its label, progress track and status badges used
  fixed colours. The waitlist offer badge, Create Event's disabled outline buttons,
  the My events subtitle (3.9:1 in light) and RSVP validation text (4.46:1) also
  use theme tokens. The stale "public list cards" assertions now match the
  redesigned My events markup.
- Follow-up checks: 15 targeted demo Chromium cases passed (the 13 above plus My
  events deletion and public list cards). A scratch contrast audit of 18 F2 page
  states found no issues in dark mode; in light mode only the two disabled outline
  buttons (3.6:1, the shared disabled colours; WCAG exempts disabled controls).
  Shared `main.css` still leaves `.btn-primary` text white in dark mode and
  outline-button disabled colours unset; noted for Huxley.


### 25 October — Aishani F1 design branch

- Verified clean `aish` ownership, repository URL, single worktree and no open aish
  PRs. Published and verified both backups before the one-time replacement:
  `backup/design-baseline/aish/20261025-220000-local` and
  `backup/design-baseline/aish/20261025-220000-remote`, both preserving
  `c5b7a7a586ad06859ca8cde66ec68f39cb985062`.
- Verified Denzel's dev tip and replaced only aish with
  `86c026516690cc6f5e0f7c5bdbdde2093273fc02` using the explicit original-tip lease;
  fetched and confirmed local/remote baseline equality before edits. Backups remain.
- Refined only F1 Profile and Discover presentation: themed form/selection/focus,
  semantic fieldsets, saving state and draft-safe retry, mobile actions, 44px view
  controls, mobile toolbar, semantic hosting colours and reduced-motion hover.
  No shared shell/theme/router/package, ranking, API or schema edits.
- Locked client dependencies installed under Node 22/pnpm 10; lockfiles unchanged.
  Targeted Chromium checks pass: two F1 profile/discovery cases plus the existing
  pending-search/view-switch case. Both themes and 375/575/768/1280px covered;
  profile keyboard selection/failure/retry, learned weights, no overflow, one main,
  selected-chip contrast and console assertions pass. See the
  [design verification](docs/design/DESIGN.md#10-verification-history-and-limits) for captures.
- No full suite/production build, hosted writes, deployments or PR creation/merge.
  Safari, physical devices and signed-in hosted profile writes remain unverified.
  Denzel owns subsequent PR review/integration into dev.

### 26 October — Vivienne branch F6 floor-plan polish

- Vivienne's `vivi` branch was backed up and replaced once from Denzel's published
  design baseline `86c026516690cc6f5e0f7c5bdbdde2093273fc02`, following
  `design-branches.md`. Durable backups were pushed for the previous local and
  remote tips:
  `backup/design-baseline/vivi/20261026-170045-local` and
  `backup/design-baseline/vivi/20261026-170045-remote`.
- Refine only Feature 6 presentation: the floor-plan editor/viewer, programme flow
  and public finished-image panel now use shared Bookedz typography/tokens, clearer
  active-venue and helper-placement hierarchy, actual zone/marker/placement counts,
  responsive helper rows and theme-aware surfaces/actions. Live Supabase/R2 calls,
  organiser-role checks, programme validation, helper placement semantics and public
  image rules were not changed.
- Targeted checks: `git diff --check` passed; `NODE_ENV=test node --test
  client/src/utils/__tests__/floorPlanModel.test.js` passed **4/4**; edited SFCs
  (`editor.vue`, `ProgrammeFlow.vue`, `FloorPlanImages.vue`) compiled with
  `vue/compiler-sfc`. No production build, full suite, live write, browser capture,
  Safari/iOS or physical-device check was run for this branch polish.


### 26 October — F1 interest formula, Step 1

- Implemented Aishani's supplied 50/50 share and strength formula and exported
  `interestScore`; other signals and diversity behaviour remain unchanged.
- Added the supplied console-based helper and five cases under `server/checks`,
  plus `npm run check` and usage documentation. Existing test files remain; only
  affected numeric expectations in the ranking test were updated.
- All five console cases and 16 targeted ranking/route/interaction tests pass on
  installed Node 24.12.0; Node 22 was not verified in this pass. No full suite,
  build, hosted writes or deployment. Steps 2–6 remain pending.


### 26 October — F1 tag diversity, Step 2

- Exported `tagSimilarity` and replaced cumulative category penalties with
  maximum Jaccard tag overlap against selected events, without compounding
  the original score. Missing/empty tags receive no penalty.
- All 14 interest/diversity console checks pass, including tag-only ranking,
  duplicate tags and missing tags. All 16 targeted ranking/route/interaction
  tests pass on Node 24.12.0; the existing diversity fixture now uses tags.
- No full suite, production build, hosted write or deployment. Steps 3–6 remain
  pending. The requested commit includes the previously uncommitted Step 1 work.


### 27 October — recommendation V1 evidence foundation

- Reviewed local migrations against the four-function design. Existing profiles,
  interests, event tags, registrations and check-ins are reusable; save/dismissal,
  taxonomy hierarchy and topic relevance weights are absent from the source schema.
- Added a pure `calculateEventEvidence()` over canonical event snapshots, with
  strongest-stage precedence, dismissal override, original timestamps and elapsed
  UTC 30/90-day ageing. It is not wired into existing routes or UI.
- Added 11 targeted tests covering no history, repeat calculation, distinct events,
  cancellation, dismiss/undo, exact age boundaries, offsets and invalid timestamps.
  All 11 pass on Node 24.12.0; Node 22 is not verified in this pass.
- Documented the registration timestamp reset and permanent attendance/interaction
  boosts that must be reconciled before integration. No hosted inspection, new SQL,
  data writes, full suite, production build, dependency change or Git publication.
  Preference reconstruction, compatibility and frontend integration remain pending.


### 27 October — persistence adapter and explicit test checks

- Added caller-JWT evidence-store RPC adapter, restricting preference actions to
  save/unsave/dismiss/undo. Existing registration and check-in flows are unchanged.
- Prepared SQL outside migrations for own-user preference storage, narrow RPC
  writes and first-RSVP capture. No connected Supabase inspection tool or local
  PostgreSQL CLI was available; SQL execution/security/concurrency remain unverified.
- Added five simulated RPC contract cases, including the complete action sequence,
  cancellation fallback, first-date preservation, token forwarding and error paths.
- Replaced Node assertion calls in all five recommendation test files with explicit
  condition checks that throw on failure. Other features' tests are unchanged.
- All 33 targeted recommendation checks pass on Node 24.12.0 (including the legacy
  script reported as one file-level check). No full suite/build, hosted mutation,
  new route, live ranking switch, dependency change or deployment.


### 27–31 October — Community tab, floor-plan canvas and event planner (`vivi` branch)

- **Community tab** (`/community`, public): an X-style feed with search above the posts,
  a composer, likes, replies, photo/video attachments and three sample posts. Posts live
  in the viewing browser only (localStorage, with IndexedDB for media); there is no shared
  table, so nothing is visible to other people yet.
- **F6 plan background:** organisers upload a JPEG/PNG/WebP (10 MiB) through Express
  (`POST /api/uploads/floor-plan` with `kind: 'background'`, allowed before publication);
  the file is an editor-image asset in R2 and its key, opacity, rotation and size are saved
  in the plan layout, so participants see the same background. No migration. Replaced or
  removed backgrounds are deleted on Save; the cleanup worker limitation still applies.
  `VITE_R2_PUBLIC_URL` is required in `client/.env` for the image to display.
- **F6 canvas redesign (31 October):** the canvas fills the page width; the Plan zones panel
  is gone. A toolbar holds Add box, Add person and Lock; double-click renames in place; a
  selection bar sets name, colour, size and role; an Elements row, Delete/Escape/arrow keys
  cover keyboard use; boxes resize by their handles. New items go to the first free spot.
  Participants see the same canvas read-only, with plan tabs when an event has several plans.
  Programme items without a plan now show on every plan.
- **Event planner:** `POST /api/plan-suggestions` (caller JWT, RLS) suggests programme items
  and tasks. Sources are other organisers' published/completed past events (programme only)
  and the caller's own past events (programme and tasks); drafts, cancelled events, budgets
  and other people's tasks are never read. An identical title copies the best past event;
  otherwise weighted similarity with support thresholds (community patterns need at least
  three events). `seed:planner` writes sample past events to the hosted project; it was
  written but **not run**.
- **Verification (targeted only):** server suite **51/51** (includes 4 planner files);
  client utility tests for the floor-plan model and planner helpers **18/18**;
  `e2e/feature6.spec.js` **10/10** and the create-wizard preview case **1/1** on a throwaway
  demo-mode Vite server (the running dev server on 5173 is live mode, so Playwright must not
  reuse it). Edited SFCs compile. Screenshots at 375 and 1280px were inspected.
- **Not run:** the full suites, a production build, the live specs (they need a human
  sign-in), signed-in use of the planner, the hosted seed, Safari/iOS and touch-device
  checks. The live specs `floor-plan.spec.mjs` and `uploads.spec.mjs` were edited for the new
  controls and only syntax-checked.
- **Limits:** planner data is thin (about seven published events before seeding); the
  planner and Generate plan are live-only; a lost reply while adding a plan's programme can
  duplicate one item (tasks are retry-safe); the Community feed is single-browser.


### 28 October — event covers cropped to 16:9 (`gregory`)

- After reporting unequal My events cards: a card without a photo showed its fallback artwork at 3:2 (548×365) while photo cards were cropped to 16:7
  (548×240). 
  
- Discover's `EventCard` let a portrait photo stretch its card (356×712).
- Every event card cover is now one 16:9 box with the photo or artwork absolutely
  positioned and centre-cropped (`object-fit: cover`): My events, Discover list
  cards (Aishani's `EventCard`; To review) and Create Event's cover preview
  and live preview. Uploaded originals are unchanged; the event-page banner keeps
  its fixed-height crop. My events also falls back to the artwork if a photo fails.

- Checks: the three changed SFCs compile; `tests/event-card.test.mjs` 5/5. A scratch
  script seeded portrait, landscape and missing covers and measured every cover box
  at 375/575/768/1280px in light and dark: all 16:9 (1.77–1.79 after rounding) and
  equal per row, versus 24 failing checks before the change. Targeted demo Chromium:
  `workspace-design`, `immersive-discovery`, creation preview, My events deletion and
  public list cards passed; `design-polish` failed its navbar Escape-focus case once
  (untouched code), then passed 2/2 when rerun. No full suite or production build.

### 3 November — Hawker Glow tokens and OneMap discovery (OpenJio UI, steps 1–2)

- Step 1: Hawker Glow token values in `main.css` (existing variable names), the
  self-hosted Nunito font, fill/on-fill button tokens with resting and hover
  shadows, and a teal focus ring. Removed 13 per-page terracotta `.btn-primary`
  overrides across 11 files; updated the browser `theme-color`.
- Step 2: `EventMap.vue` (Leaflet + OneMap Default/Night tiles) replaced
  `SingaporeMap.vue`. `MapPreview.vue` replaced the hero island. Neighbourhood cards
  now show real 3 km counts. Removed `IslandArtwork.vue` and the illustrated
  projection helpers; the art files are unused but retained.
- Evidence, 3 November: `node --test src/utils/__tests__/discoveryMap.test.js` 7/7
  pass. In mocked Chromium on an isolated port (5193; 5173 was occupied), the
  affected specs (`immersive-discovery`, `redesign`, `landing-page`,
  `design-polish`, `filter-panel`, `motion-theme`, `f1-profile-design`) give
  16 passes and 7 failures. That figure combines the last full run of the seven files
  (15/8) with a rerun of `immersive-discovery` and `redesign` after one test-only
  fix (9/1); no application code changed between them. All 7 also fail on untouched HEAD `196aae2` (checked in
  a temporary detached worktree): `design-polish` live navigation, the three
  `filter-panel` cases, `landing-page` filter hand-off, `motion-theme` category
  disclosure and `redesign` Back scroll restore. Island-specific assertions were
  rewritten for OneMap. A screenshot pass at 375/1280px in both themes showed one
  `main`, no horizontal overflow and no console errors. No full suite or
  production build was run.
- Limits: OneMap tiles are fetched from onemap.gov.sg at runtime, so offline runs
  show pins without tiles. Remaining steps (Hangout template onward) are not started.

### 3 November — Create event template choice and Hangout template (step 3, demo mode)

- `/organiser/events/new` now opens `NewEventView.vue`, which offers two template
  cards. **Official** shows the existing Create Event wizard unchanged; **Hangout**
  shows `components/hangout/HangoutWizard.vue` (who and what, when, where via
  OneMap, then review and join mode). `?template=` keeps the choice in the URL, and
  both drafts are kept (KeepAlive) when switching templates.
- Hangouts are events with `kind: 'hangout'` and a `hangout` object (mode,
  visibility, stage, date range or locked slot, invite token). Rules live in
  `utils/hangouts.js` with Node tests. The join modes are Open (instant, refused when
  full), RSVP auto-confirm and RSVP with approval. Creation ends on an invite slip
  with copy/share. `/j/:token` previews a private invite without joining.
  `/events/:id/rsvp` renders `HangoutPage.vue` for hangouts, so Official events
  are untouched. Private and solo hangouts are excluded from Discover.
- Live mode refuses hangout creation and invites with a clear message, because the
  migration draft isn't written or applied yet; nothing is silently published as
  Official. The Official wizard's own Open join-mode option is not yet added.
- Not built yet: Time (availability/slot ranking), Plan and voting, On the day,
  and the migration draft.

### 3 November — Hangout Time: availability and slot ranking (step 4, demo mode)

- Group hangouts now show **Find a time** (`components/hangout/TimePanel.vue`,
  `AvailabilityGrid.vue`) to the host and confirmed members. Members paint free
  30-minute cells in an explicit Paint, Erase or Scroll mode, or use the keyboard
  (arrows, Space). They can apply presets, undo and type a range, then save
  explicitly; leaving with unsaved marks asks first. "Remove my reply" returns them
  to *no reply*.
- The group overlap view shows aggregate counts only, with partly free cells rounded
  inward. Raw free times are returned only to their owner.
- Ranking is `utils/hangoutSlots.js`, following the specification's §4: a
  sweep-line over responders' merged free time, all required people included, day
  splits, a 2-hour minimum and a 5-hour target inside 11:00–22:00, and the
  0.60/0.20/0.15/0.05 score. It returns the top five, each listing who can make it,
  who can't and who hasn't replied. The host marks people required or optional,
  checks a custom time (blocked unless every required person who replied is free for
  all of it), and locks or unlocks a time. Locking is revalidated in the backend and
  sets the event's start and end. When nothing qualifies, explicit rescue choices
  appear (wait, make someone optional, shorter times, add days); none is applied
  automatically.
- Evidence: 24/24 Node checks (`hangouts`, `hangoutSlots`, `discoveryMap`,
  `discovery-state`). A scratch Playwright run at 1280px light and 375px dark
  covered create → preset → keyboard toggle → drag (1280 only) → undo → save →
  ranked times → show on grid → lock → unlock, with one `main`, no overflow and no
  console errors. Touch-drag painting on a real phone is not verified.
- Limits: demo mode has one browser identity, so a demo hangout has only its host
  unless someone joins in live mode later. Multi-person ranking is covered by the
  Node tests. Editing a hangout's dates isn't built, and the "add days" choice
  is advice only. Live mode refuses these calls until the migration draft exists.

### 3 November — Hangout plan, Keep/Swap votes and confirmation (step 5, demo mode)

- **Shape the plan** (`components/hangout/PlanPanel.vue`) opens once a hangout has
  a locked time. Stops are real Official Bookedz events or host-entered OneMap places
  that stay private to the plan. Sample/OpenJio listings are not used.
- `utils/itinerary.js` adapts the specification's §5. Candidates are mapped
  Official events that fit inside the slot (6 km, widening to 12 km; full events
  and hangouts excluded). Ranking uses 0.7 × interest + 0.3 × proximity, then a
  beam search (width 12, 2–4 stops, 40-minute wait cap, lunch/dinner windows,
  no consecutive meals) with the spec's score weights (deal weight is zero: Bookedz
  has no deals). Member interests come from profiles, falling back to the hangout's
  interests. When no plan qualifies, the host gets a reason plus explicit choices.
  These are meet later, just before the first event (a Bookedz-specific addition,
  because Official events have fixed times), one stop, skip the meal, or add places
  by hand. A chosen relaxation is saved with the plan.
- `retime` reports missed events, long waits, overruns, closed places and
  consecutive meals as must-fix. Unknown opening hours, a missing meal and full
  events are concerns the host can accept. Travel is a distance estimate (walk or
  public transport) and is labelled "estimated travel"; OneMap routing is step 6.
- Hosts generate or regenerate, add events or places (up to 6 stops), move stops
  earlier or later or to a position, remove them, and view up to three same-kind
  swap alternatives. Every edit is previewed with new timings and saved only by
  "Save order". Moving or adding a stop bumps its version, so earlier votes on it go
  stale, and editing a confirmed plan reopens voting.
- Members (and the host) vote Keep or Swap per stop while voting is open, and can
  clear a vote. Votes never change the plan by themselves. Confirmation lists
  must-fix problems and acceptable concerns separately and stores the final timings.
  It always states that nothing is booked and that people RSVP to each event.
  "Reopen voting" is available afterwards.
- Not done: pointer drag reordering (buttons and a position select cover the same
  moves by keyboard and touch), the greedy comparison baseline, spend estimates
  (Bookedz events have no prices) and a live backend.

### 3 November — Hangout On the day, OneMap routing proxy (step 6)

- **On the day** (`components/hangout/GoPanel.vue`) appears once a time is locked.
  Before confirmation it is a clearly labelled preview. After confirmation it shows
  the host-set meeting point (120 characters at most), each stop with Google Maps
  directions and its Bookedz event link, Copy plan, an `.ics` calendar file
  (`utils/calendar.js`), and a copyable hangout link. All of it says nothing is
  booked.
- Late join (`utils/lateJoin.js`) takes an origin, either a OneMap address or a
  one-time browser location that is never stored or shared, plus a departure time.
  It routes to every stop and suggests the earliest stop reached at least 20 minutes
  before the group leaves, with a backup, the time together, directions and
  "Copy my ETA". Infeasible cases explain why.
- `GET /api/route` (`server/routes/route.js`, `server/services/onemapRoute.js`)
  proxies OneMap public-transport and walking routes. `ONEMAP_EMAIL` and
  `ONEMAP_PASSWORD` are server-only placeholders in `.env.example`. Tokens refresh
  before expiry, requests time out after 15 seconds, and results are cached in
  memory (5,000 entries, 30 days, 15-minute departure buckets). It is limited to
  120 requests per minute per IP, accepts Singapore coordinates only, and returns
  generic 400/429/503 errors with no secrets. Unconfigured or failing OneMap returns
  503, and the client then uses its distance estimate, labelled "estimated travel".
  The route is public, because demo visitors have no Supabase session; it is rate
  limited and coordinate-only. The persistent file cache from the spec isn't built.
- The forecast (`lib/hangoutWeather.js`) calls NEA's data.gov.sg v2 endpoints
  directly. It uses the two-hour area forecast within 2 hours, the 24-hour regional
  forecast within a day, and the four-day outlook within 4 days. It is labelled
  "NEA via data.gov.sg" with the update time, and is otherwise "unavailable" with a
  retry.
- Evidence: `server` `node --test tests/onemapRoute.test.js` 4/4 (fake OneMap:
  token reuse, Singapore date and time, caching, failures, validation, 503 mapping,
  rate limit). Client `onTheDay.test.js` 3/3 (late-join feasibility, ICS escaping,
  folding and UTC, plan text, forecast horizons and picks). The running dev API on
  3000 picked up the route and returned 503 "configuration" without credentials, so
  the browser run used the labelled estimate. Live OneMap routing with real
  credentials is not verified.

### 3 November — Hangout database migration draft (step 7, not applied)

- (Superseded below: the draft is now `supabase/migrations/20261103120000_hangouts.sql`.) The SQL was a **review
  draft**, deliberately outside `supabase/migrations`. It has not been applied to
  Bookerz or any hosted project; Timothy must review it and hosted history must be
  checked first.
- It adds `events.kind` (official/hangout, immutable after creation) and
  `events.join_mode` (open/auto/approval; null keeps today's
  `requires_approval` behaviour). It also adds the hangout tables (hangouts,
  member settings, replies, free blocks, places, stops, votes), all read-only through
  RLS, with every change going through `SECURITY DEFINER` RPCs that check
  `auth.uid()`. Covered: create, invite preview and join, save or clear
  availability, aggregate heatmap, required flags, lock or unlock, places, stops with
  optimistic revisions and stop versions, votes and vote counts, confirm or reopen,
  and the meeting point.
- It replaces the events SELECT policy and `can_view_event`, so private and solo
  hangouts are hidden from public reads, including the security-invoker
  `events_with_counts`, which now also exposes `kind` and `join_mode`.
  `register_for_event` is the 22 October definition with two marked changes: a
  shared admission rule (Open refuses when full; a hangout's capacity includes its
  host) and private hangouts joined only by invite token. Invite tokens are
  column-hidden from everyone but the host.
- Evidence: `server/checks/hangouts-db.check.mjs` loads all 13 repository
  migrations plus the draft into in-memory PGlite 0.5.12 (installed in a temporary
  folder, not a project dependency): 7/7 pass. Official auto, waitlist and Open
  behaviour, kind immutability, hidden private hangouts for anon and non-members,
  token-only join, owner-only raw free times with aggregate counts, required-member
  lock rules, revision conflicts, stale votes after reordering, confirmation and
  reopen-on-edit, and Open Jio listing with solo privacy are all covered. The check
  found that capacity didn't count the host; that is fixed in both the draft and the
  demo backend.
- Not done: a live adapter in `supabaseApi.js` (live mode still refuses hangouts),
  hosted signed-in testing, and database-side retiming (travel, waits and meal
  windows stay in the application; the database rechecks authority, stage, bounds,
  references, the 6-stop cap and revisions).

### 3 November — live hangouts built (migration not yet applied)

- `supabase/migrations/20261103120000_hangouts.sql` replaces the review draft. It adds
  `hangout_members` (people list without free times), a richer invite preview
  (`isHost`, own status, mode, tags) and an `event_availability` that counts the host
  and hides private hangouts' counts. `server/checks/hangouts-db.check.mjs` (all 14
  migrations, in-memory PGlite) passes 7/7, including the new member list and counts.
- `client/src/utils/supabaseHangoutsApi.js` implements every hangout function against
  RLS reads and the RPCs, plus `joinHangout` (invite token for private hangouts).
  `supabaseApi.js` now maps `kind`/`joinMode`, loads hangout details in `getEvent`,
  and sends hangout creation to `create_hangout`. The plan view is shared with the
  demo through `utils/hangoutPlan.js`.
- Express `/api/hangouts/:id/time` and `/preview-slot` (`server/routes/hangouts.js`,
  `server/services/hangoutTime.js`) verify the token, check `is_hangout_member` as
  the caller, then read with the server key and return only aggregate counts, ranked
  options and names. They reuse `client/src/utils/hangoutSlots.js`.
  `server/tests/hangoutsRoute.test.js` 3/3 and `onemapRoute.test.js` 4/4 pass.
- Demo regression: the full plan → confirm → On the day flow (1280px light) passes
  after the refactor. The only console message is the expected 503 from unconfigured
  routing.
- Pending: the user runs the CLI migration push (dry run first; note that
  `20261027120000` may also be pending on the hosted database), adds the OneMap
  credentials, then a signed-in `[TEST]` live run with cleanup.

- OneMap routing verified live on 3 November with the user-added `ONEMAP_EMAIL`/`ONEMAP_PASSWORD`
  (values never read): a separate API instance on port 3005 returned `live: true` for
  transit and walking. A repeat request came from the cache, and Raffles Place → Tampines
  at 18:00 the next day was 44 min transit with 1 transfer (the labelled estimate said ~39).
  The already-running API on 3000 needs a restart to pick up the new `.env` values.
### 3 November — My RSVPs card action sizing

- At the team member's request, the RSVP card now puts its status badges on their own row (8px gaps)
  and both actions in one column: "My ticket" (the ticket CTA, compacted to 44px) above "Cancel
  RSVP" (full 44px instead of `btn-sm`), each 168px wide on desktop. Below 768px they become two
  equal halves (151px at 375px). The "Cancel this RSVP?" step keeps its buttons on one line.
  Labels, ids, the checked-in rule and the two-step cancel are unchanged (`MyRsvpsView.vue` only).
- Checked at 1280px light and dark and 375px light, with the live-only ticket link inserted for
  preview. Specs touching My RSVPs: 19 passed, 4 failed. `landing-page:45` also fails on the
  untouched baseline. The other three fail identically on untouched HEAD `196aae2` (checked in a temporary
  detached worktree, since removed): they expect the logo to open `/discover` and links named
  "RSVP for …"; neither is touched by this change.
- Live test attempt, 3 November: a probe from the live-mode app found the hangout migration
  is **not yet on Bookerz** (`preview_hangout_invite` missing, no `events_with_counts.kind`),
  so no live hangout test ran and nothing was written. `client/e2e-live/hangouts.spec.mjs` is
  ready. It skips itself until the migration exists, then runs the full journey with both
  development accounts and deletes its [TEST] hangout. The migration now also registers the
  start-area venue in `event_created_venues`, so deleting a hangout removes it; the PGlite
  check covers this (7/7).

### 3 November — step-by-step UX pass 

- RBased on request where steps were instucted in prompt, previewed overlooked and accepted each step before it was applied. Builds on `c34dcf9`; 

- **Delete pop-up:** My events asks in a centred pop-up (event name, confirmed count, "can't
  be undone"; a failure stays in it for retry). The shared `ConfirmationDialog` gained
  `pendingLabel` and `position: fixed`: Bootstrap's `.card` had made it `relative`, so it
  opened at the top of a scrolled page. Feature 4's pop-ups get the same fix.
- **Hangout editing:** `/organiser/events/:id/edit` hands hangouts to `HangoutWizard`
  (`hangoutFormFromEvent`/`hangoutChanges`). Title, description, 1–5 interests, group size and
  start area are editable; type, time and join mode are read-only, because only the shared
  event columns can be updated. No rain backup venue or RSVP questions appear.
- **Discover filters** (Aishani's `EventFilters`): no second "Filters" title, an active count
  on the button, "Show N events" in the primary fill (it was white on light orange, 1.7:1 in
  dark), 44px targets, When options wrapping 3 + 2 on phones, and a 36rem drop-down with three
  category columns from 768px.
- **My events:** Manage event (Open hangout for hangouts) · RSVPs · ⋯ (Edit details, View
  public page or Event tools, Delete event), in 1, 2 (≥576px) or 3 (≥1200px) columns.
- **Create pages:** full width at ≥1200px, a shorter Official heading, a Hangout live preview,
  and plan suggestions moved from the sticky footer to a Review-step card ("Suggest programme
  & tasks"; demo mode shows a visible note instead of a disabled button).
- **Navigation:** the ☰ had no icon in light mode (Bootstrap's toggler image needs `.navbar`).
  Categories and Map left the sidebar (Discover links to both). Phones below 768px get a tab
  bar for signed-in and demo users, laptops at 992–1199px an 84px labelled rail with pages
  filling the freed width, and non-Discover pages are capped at 1440px instead of 1220px.
  Settings stays (Aishani's 27 October layout); Create event stays on My events.
- **Form checks:** `utils/eventForm.js` holds the Create Event checks (moved unchanged).
  `eventForm.test.js` 14/14 and `hangoutForm.test.js` 6/6 use `expect.js` over `node:assert`;
  `hangouts.test.js` 7/7.
- Chromium on an owned demo server (5187; 5173 was in use): deletion and Feature 4 pop-up
  cases 8/8; `legacy-review-fixes` 7/7 after updating three selectors to the renamed "Search
  for the venue" label; the create-wizard, `navbar-account` and three `shared-ui` cases pass
  (one `shared-ui` link lookup is now scoped to Main navigation). Scratch checks covered
  375–1920px in both themes: focus return, Escape, failure/retry, 44px targets, contrast, one
  `main`, no overflow and no console errors.
- Already failing, and identical on an untouched `c34dcf9` worktree (since removed):
  `discover-browse` 3, `filter-panel` 3, `recommendation-mvp` 2, the `landing-page` filter
  hand-off, `motion-theme` category disclosure, `design-polish` live navigation,
  `discovery-rsvp-regressions` legacy links, `shared-ui` demo reset and public summary, and
  4 of 7 `event-filters.test.mjs` cases.
- Not done: full suites, a production build, live or real-device checks, and committed specs
  for the new menu and navigation (scratch scripts only).
