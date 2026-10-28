# Project status and timeline

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

Consolidated 23 October; updated 24 October 2026. Dates use Singapore time; same-day entries are ordered
by milestone because exact times are not consistently recorded. This replaces
separate handoffs/merge/fix reports. [Decisions](decisions.md) records authority and
superseded choices; [testing](docs/testing.md) explains reproducible checks;
[README](README.md#ai-assistance-disclosure) retains detailed AI/library provenance.

## Current checkpoint

All six features are integrated on `dev`, including the accumulated fix work,
project-wide frontend redesign, themes, motion and organiser/participant refinements.
The latest 24 October refinements used focused checks only; older full-suite counts
predate them. Denzel has now authorised committing/publishing this working state
as the shared design baseline. Use the published `origin/dev` SHA and Denzel’s
kickoff message for exact baseline identity; this is not a production deployment. Teammates' branches and PRs
are not changed by the publication. See [branch workflow](design-branches.md) and
[design system](docs/design/design-system.md).

| Feature / owner | Working functionality | Remaining limits / acceptance |
| --- | --- | --- |
| F1 — Aishani | Public Discover in demo/live; tag/search/date filters; personalised reasons under user JWT; live profile load/save; R2 event covers. One browser client and refresh per identity. | Profile editing requires live mode. Legacy EventDetailsDialog is unmounted; RecommendationCard is used inside PickedForYou. Ranking remains Aishani's. |
| F2 — Gregory | Atomic four-step creation/OneMap; approval; RSVP, waitlist and offers; My RSVPs/tickets; UI+SQL own-team/check-in guards; matching demo offer deadlines. | Full production concurrency/response-loss coverage is not established. Waitlist scoring is Gregory's; its nine former Vitest cases now run under Node. |
| F3 — Huxley | QR/CODE128 tickets; staff camera/manual/name/email search; venue QR/self check-in; Realtime ticket/dashboard; CSV/fraud fields; attendance interest trigger. | Physical camera/geolocation testing remains. Automated check-in uses typed codes/search; it does not prove real-phone scanning. |
| F4 — Denzel | Owner tasks/keyboard order; public/manual announcements; exact-cent budget/90% warning; real NEA reads; server-verified one-way venue switching. | Latest live NEA check correctly refused dry weather. Successful rainy switching remains weather-dependent; no claim of exhaustive concurrency testing. Historical three browser failures did not reproduce in the final runs. |
| F5 — Timothy | Supabase/RLS; Express health/recommendations/upload presigning; five-minute waitlist cron; validated public R2 uploads; future-created venue cleanup. | Existing SECURITY DEFINER warnings need owner review; leaked-password protection is off. Storage cleanup queue has no deployed drain worker; old unmarked venue orphans are intentionally untouched. |
| F6 — Vivienne | Per-event saved responsive plan and read-only viewer; programme CRUD/zone links; active venue map; real team placements and keyboard coordinates; public finished images. Route/image/drag-bound guards. | Explicitly live-only; private object-image storage is not implemented against a public bucket. Multi-row helper saves can partially succeed and report retry; no transaction is promised. |

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
- Denzel reports updated AI permission and authorises Feature 4. Timothy's selected
  SDK/schema/config/env files are imported from `575e20d`; no merge/deployment implied.
- Deliver the async demo workspace, tasks, public announcements, SGD budget and
  weather/backup switch, then correct order, feed/venue refresh, money editing,
  shared Bootstrap presentation, navigation/focus and request handling.

### 17 October — review and authorised frontend corrections

- Review Feature 4/shared boundaries, then fix all authorised P2/P3 issues with
  scoped agents and independent integration review: destructive retry/cancel,
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
  replace the helper with the ordinary dev app afterward. No agent types passwords.
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
- Preserve supplied resources byte-for-byte and retain detailed public AI/library
  disclosure. A tiny `docs/README.md` keeps the resource index's existing link valid.
- Older tracked documents remain available in Git history. Pre-consolidation copies,
  including formerly untracked notes, are temporarily backed up outside the repo at
  `/tmp/bookedz-docs-before-consolidation-20261023`. No new archive folder is required
  to navigate the project. This pass changes documentation/reference comments only;
  other in-progress application work is retained.


### 23 October — map-first frontend redesign

- Denzel authorises replacing the existing UI/UX across the project using the
  supplied ideation spec, with GPT-6 Luna at medium effort where efficient. Root
  handles shared system/discovery; three agents handle participant/account,
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
- Preserve the supplied PNG. Built-in imagegen removes baked pins/counts/labels;
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
- GPT-6 Luna medium agents refine cards/details and hosting navigation/organiser
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
  built-in imagegen prepares a background without the baked Flyer wheel and one
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
  visual evidence; see `docs/design/design-review.md` for limitations.
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
  approval/offer/rank semantics. GPT-6 Luna medium agents assisted scoped screens;
  Codex integrated, reviewed and corrected shared behaviour/style issues.
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
  [F1 review](docs/design/design-review.md#f1-owner-refinement-25-october) for captures.
- No full suite/production build, hosted writes, deployments or PR creation/merge.
  Safari, physical devices and signed-in hosted profile writes remain unverified.
  Denzel owns subsequent PR review/integration into dev.

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
