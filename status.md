# Project status and timeline

Consolidated 23 October; updated 26 October 2026. Dates use Singapore time; same-day entries are ordered
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


### 26 October — Feature 4 workspace and task-list refinement

- Denzel approves the compact Manage Event navigation and conventional task-list
  plan. Codex and GPT-6 Luna Medium subagents implement the grouped local rail /
  mobile Event tools disclosure, checkbox completion/reopening, named progress
  actions, title/notes search, status filters, inline editing and secondary row
  actions. Existing task IDs/status/order API contracts and ownership remain.
- Review and browser failures identify a native checkbox showing an unsaved
  completion and focus attempting to enter collapsed Completed content. Correct
  both; add outside-pointer/Escape dismissal for row actions while preserving
  confirmation focus and cancellation/retry invalidation.
- Final frozen-source Chromium run: **16 targeted cases pass** in 35.1 seconds.
  Covers CRUD/order/reload/event isolation, hidden-task preservation in full-board
  saves, failed save/retry, create/edit drafts, delete cancellation/focus, route
  reuse and organiser navigation. The 100-task layout case checks 375/575/768/1280px
  in light/dark with reduced motion, page errors, one main and overflow. A mocked
  live-visibility fixture checks tool links; this is not hosted auth/RLS evidence.
- Three changed Vue SFCs compile (scripts/templates/styles); whitespace check
  passes. Graphify AST update completes locally; prose is not semantically
  reindexed. The host's documented direct pnpm launcher workaround is required.
- No full suite, production build, new dependency or hosted write. Existing local
  task-board SQL/docs work remains preserved and excluded from UI publication.
  The temporary implementation-plan Markdown is removed as requested.
- Demo evidence: [desktop dark](docs/design/previews/f4-task-list-desktop-dark.png),
  [mobile light](docs/design/previews/f4-task-list-mobile-light.png). Fixtures are
  example data, not current event metrics.


### 26 October — unified event workspace and lighter task view

- Implement Denzel's approved follow-up: persistent event context/navigation around
  existing operations, RSVP, check-in, venue QR, attendance and floor-plan routes.
  Tool content opens in the same workspace; Back returns to the same event and
  remembered management query. Non-default F4 sections return to Tasks. Mobile
  Sections navigation closes after selection and retains a usable focus target.
- Keep Tasks as the default; show a flat Open list, Open/Completed/All filters,
  URL-backed search and an intent-opened composer. Remove duplicate navigation,
  repeated event headings, empty status groups and persistent visual save banners.
  Base fonts, semantic colours/themes, task states and full-board saves remain.
- Cache only F4 within the current workspace to preserve drafts. Guard cached
  watchers from private reads/query changes on other tools. Close transient
  confirmation dialogs on deactivation and invalidate failed retries. Correct
  last-task deletion focus to the visible Add task trigger.
- **22 selected Chromium cases pass after necessary targeted reruns**: shared
  routes/Back targets, actual RSVP content, mocked QR content, query/typing and
  drafts across routes, task CRUD/order/reload/isolation, failure/retry/focus,
  confirmation deactivation and the weather switch. The final mobile-menu case
  passes separately at 375/575/768/1280px. The 100-task case covers those widths
  in light/dark with reduced motion, console errors, one main and overflow.
- Ten changed Vue SFC scripts/templates/styles compile; router/test syntax and
  whitespace checks pass. Graphify AST update remains local. No full suite,
  production build, new package or hosted write. Live-only tools use local API
  fixtures; actual hosted auth/RLS, camera and QR rotation are not reverified.
- Existing SQL/docs work remains local and excluded from UI publication.
  [Desktop RSVP workspace](docs/design/previews/f4-unified-desktop.png) and
  [mobile workspace](docs/design/previews/f4-unified-mobile.png) show demo data.


### 26 October — organiser navigation hierarchy and terminology

- At Denzel's request, distinguish registration management (sign-ups, approvals
  and waitlist) from actual checked-in attendance. Label the destinations
  Registrations and Attendance report, with a concise explanation on each page.
- Rename Operations/Event tools to Event planning/Guests & venue. Use semantic
  h2 group labels at 16px, stronger ink contrast, purpose text, separators and
  41px measured inter-group spacing. Increase navigation text to 15px, strengthen
  the selected state, separate the rail from content and improve event metadata
  readability/wrapping. Use Bootstrap's 992px desktop threshold.
- Two affected Chromium route/visibility cases pass. An isolated demo browser
  check passes 375/575/768/1280px in both themes with reduced motion: group-header
  contrast is at least 11.57:1, link targets are at least 44px, one main remains,
  and no page errors/overflow occur. Three SFCs compile; whitespace checks pass.
- No full suite/build, dependency, business-logic or hosted change. Existing local
  SQL/docs work is preserved. Demo captures: [desktop](docs/design/previews/f4-navigation-light.png),
  [mobile groups](docs/design/previews/f4-navigation-mobile.png).


### 26 October — subtle organiser motion

- Apply the approved short fades/small slides to My events, Create event and the
  event workspace content, including asynchronously loaded guest/venue tools.
  Add bounded visible-card/row entrances, native disclosure opening feedback and
  Vue list movement for tasks, announcements and expenses. Keep the shared rail
  and header steady while tools change; typing does not replay the page entrance.
- Motion cancels for focused content, hidden tabs, reduced-motion changes and
  unmount. Rendering and navigation remain immediate; cached task drafts, stable
  IDs, saves and owner/role guards retain their existing contracts. No new package.
- **17 distinct targeted Chromium cases pass**, after correcting the new test
  assertions for an empty task fixture and ordinary input-focus transitions.
  Covers navigation/live-tool fixtures, creation preview, draft preservation,
  failure/retry/dialog focus, full-board ordering, 100-task layouts and normal/
  reduced motion at 375/575/768/1280px in light/dark. No page errors or overflow
  in the motion layout checks; one shell main remains. Seven SFCs compile,
  JavaScript syntax/whitespace checks pass; Graphify AST refreshed locally.
- GPT-6 Luna Medium independent review finds no actionable issue. Screenshots
  inspected in ignored Playwright results. No full suite/build, hosted write or
  auth/RLS verification; physical camera/GPS, Safari and touch devices remain
  outside this check. Existing SQL/docs work remains uncommitted and excluded.


### 26 October — retain scroll between organiser tools

- Reproduce the Guests & venue scroll jump: the router reset every changed path
  to the page top, including tools inside the persistent event workspace. Skip
  that reset only when both routes share the workspace and event ID; saved
  browser-history positions and explicit anchors still take precedence. Ordinary
  page changes and switching to a different event retain their prior behaviour.
- Six targeted Chromium cases pass: every Guests & venue tool and return to Tasks
  at 375/575/768/1280px, plus existing live-tool fixture and cached-draft journeys.
  Desktop retains its scroll offset; mobile has no forced top reset while its
  Sections disclosure closes (natural height clamping can still occur). Leaving
  the workspace resets normally. The desktop regression failed before the fix.
- Router/test syntax and whitespace checks pass; Graphify AST refreshed locally.
  Mocked live-tool visibility is not hosted auth/RLS evidence. No full suite,
  build, dependency or hosted change; unrelated SQL/docs remain excluded.


### 26 October — one organiser entry from event cards

- Remove the My events card’s Manage RSVPs shortcut at Denzel’s request. Manage
  event opens the workspace, where Registrations retains sign-up/waitlist access.
- Two focused Chromium card/workspace journeys pass; whitespace checks pass and
  Graphify AST is refreshed. No full suite/build or hosted change.


### 26 October — first-owner Manage Event tutorial

- Deliver Denzel’s approved eight-step tour: event context, Add task, task
  controls, announcements, budget, weather, guest/venue tools and public preview.
  Use a native modal, spotlight and compact callout with Previous/Next/Skip,
  Finish, step count and an owner-only Replay tutorial control in the header.
- Start after successful owner/context loading. Remember Skip/completion per
  owner and data mode in the current browser, with an in-memory fallback when
  preferences cannot be saved. No event data is created or changed by the tour.
- Open the relevant section and mobile navigation as needed. Retain cached
  drafts and restore the original query/hash, scroll and disclosure state; close
  safely on route departure. Respect reduced motion and keyboard focus trapping.
  Temporary mobile scroll space keeps bottom-of-page targets above the callout.
- **17 targeted Chromium cases pass**: ten tutorial cases plus seven affected
  workspace/motion/navigation/draft/scroll regressions. Positioning checks cover
  375/575/768/1280px with dark/reduced motion; a light/normal-motion journey also
  covers live resizing. Checks caught and corrected mobile callout overlap on
  short pages and after async weather feedback. Escape, browser Back, blocked
  preferences, cross-event suppression, non-owner denial and no-write behaviour
  are covered. Eight SFCs compile; syntax/whitespace checks pass; AST refreshed.
- GPT-6 Luna Medium assists the popup and independently reviews the integration;
  a motion-preference listener quirk is corrected. No full suite/build, dependency
  or hosted change. Fixtures do not establish hosted auth/RLS or device/Safari
  correctness. Existing SQL/docs work remains preserved and excluded.
- Inspected demo previews: [desktop](docs/design/previews/f4-tutorial-desktop.png)
  and [mobile](docs/design/previews/f4-tutorial-mobile.png).


### 26 October — tutorial spotlight alignment correction

- Reproduce step 6 sweeping across the forecast while the active venue moves
  after async forecast insertion, and step 8 exposing navbar content when the
  public-event link scrolls behind the sticky header.
- Close the spotlight aperture while preparing or scrolling, then fade it open
  at the actual target after geometry settles. Observe external content changes
  as well as resize/scroll, and reserve sticky-navbar clearance when scrolling.
  Keep Skip available and enable step navigation when the target is ready.
- **12 focused tutorial Chromium cases pass**, including two new frame-by-frame
  regressions at 375/1280px with normal motion and delayed successful weather.
  Both new regressions failed before the fix. Existing four-width positioning,
  reduced motion, replay, owner gating, keyboard/storage fallback, browser Back
  and draft/query preservation checks pass. The changed SFC compiles; syntax/
  whitespace checks pass and Graphify AST is refreshed. Independent GPT-6 Luna
  Medium review reports no actionable issue. No full suite/build or hosted write.
  Existing SQL/docs work remains untouched and excluded from this publication.
