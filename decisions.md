# Decisions

Aishani requests the illustrated Singapore hero as a separate landing page rather
than part of Discover. Bookedz logos must return to it from any page. Use `/` for
the public landing page and retain `/discover` for recommendations/event browsing;
reuse the existing hero, filters, artwork and map with working search handoff.

Aishani requests removing the sidebar promotional card, including its Create event
button. Keep the other navigation and account controls.

Aishani requests Profile at the bottom of the left navigation, the existing
dark/light control below Settings, and Sign out beneath Profile. Reuse the current
sidebar, routes, theme selection and sign-out behavior; preserve unrelated edits.

Aishani requests a clearer map action directly beneath Discover search, activating
the existing Map view with filters retained. Keep full homepage picks, compact
matching picks in filtered results/Map/List and explicit access to other picks
when filters do not match. Preserve scores, explanations and preference/RSVP
actions; no new map implementation, routes, backend, SQL or algorithms. She also
requests a detailed inventory distinguishing completed features from live limits.

Aishani requests Discover search and card refinements only: more visible hero
search with existing-category shortcuts, removable filters/clear search, browsing
state retained across views and return visits, and readable cards using supplied
descriptions, dates, venues and availability. Preserve section order, recommendation
scores/explanations/actions, existing routes, RSVP/authentication and data contracts.
No new pages, backend services, database changes or dependencies.

Aishani requests a focused category UI refinement: larger pastel directory cards,
clear removable category chips near search, cohesive results layout and no event-view
toggle on the category directory. Preserve existing filtering/navigation/cards/RSVP;
no backend, database, scoring, route definitions or recommendation-section changes.

Aishani authorises the Discover frontend layout in this order: Picked for you,
existing mood cards, factual Closing soon (maximum three), compact Explore
categories, then the existing timeline. Reuse the current category catalog, cards
and tag filters, with one reusable category directory/result view. No scoring,
database/RLS/migration, backend architecture or dependency changes.

Aishani approves implementing the simplified recommendation MVP locally: explicit
interest persistence in Profile, V1 pipeline reads in the existing Express route,
and For You scores/reasons/save/dismiss actions. Reuse existing utilities; no new
data-loader service. Keep `{ events: [...] }`, authentication, eligibility and
errors. Prepare SQL/application code and test against mocks, but do not execute
SQL, apply migrations or modify shared Supabase without further approval.

Aishani finalises V1 persistence locally: only confirmed registrations earn the
10-point RSVP stage. Pending, waitlisted and active offered states block duplicate
recommendations without earning RSVP points. Preserve the first confirmation
through cancellation/reconfirmation and the first save through unsave/resave;
reactivation does not refresh ageing. Add `first_confirmed_at` and trusted capture
to the review-only SQL draft, including direct confirmed inserts. Explicit choices
come from `profile_interests`, never legacy `interest_weights`. Authorises local
fixtures/tests/docs alignment only; no SQL execution, hosted access, deployed
migration, route, frontend or core algorithm/pipeline changes.

Aishani approves the pure local recommendation pipeline with conservative
eligibility and labelled general-discovery fallback (actual compatibility,
null ranking). Reuse evidence dismissal/ageing, reject conflicting duplicate
snapshots, use the actual registration `offer_expires_at`, and validate one
shared supplied time. Authorises implementation and mock-data end-to-end tests;
no Supabase, SQL, migration, route, frontend or live ranking changes.

Aishani approves standalone V1 greedy diversity using maximum Jaccard similarity,
penalty 0.3, input-order ties, duplicate-ID suppression and exclusion of zero-match
events. Keep compatibility unchanged and return a separate ranking score. General
discovery fallback and eligibility filtering remain separate. Authorises the local
implementation and focused tests; preserve `rankEvents.js` and live behaviour.

Aishani's subsequent 27 October compatibility decision: accept the mean of
`points / (points + 10)` across unique event tags, multiplied by 100, with unmatched
tags included. Explicit 10-point interests start at 50/100. Authorise the isolated
implementation and local checks; no SQL, routes, frontend or live ranking changes.

Denzel's recorded instructions and approvals, consolidated on 23 October and
updated through 24 October 2026.
Dates identify the decision, not a blanket approval for later work. Team decisions
and implementation contracts are attributed separately. The [status timeline](status.md)
records delivery and evidence; [README](README.md#ai-assistance-disclosure) retains
full authorship and library attribution. Original supplied material remains in
`docs/resources/` (local-only, excluded from normal clones).

## Denzel's decisions and approvals

On 23 October, Denzel subsequently authorised a full project-wide frontend redesign
based on `docs/resources/Bookedz_Design_Ideation_Spec.md`, explicitly superseding
the existing visual UI/UX and permitting GPT-6 Luna at medium effort for efficient
delegation. This supersedes earlier theme/shell preservation and tools-only scope
for this redesign. Existing backend contracts, business rules, routes, data and
teammate authorship remain. The implementation's visual choices and assets are
documented in [the design system](docs/design/design-system.md). This does not
authorise a commit, push, deployment, SQL change or hosted data mutation.

| Date | Decision / approval | Status and limits |
| --- | --- | --- |
| 15–16 Oct | Use the supplied course resources and team proposal to orient Bookedz work; respect each teammate's feature ownership. | Official requirements, proposed scope, observed implementation and suggestions must remain distinct. |
| 16 Oct | Reported updated course permission allowing full agentic coding; authorised the first Feature 4 implementation and its follow-up iteration. | User-reported permission, not independent faculty verification. Detailed public AI disclosure remains required. Supersedes the older assistant handoff's coding restriction for authorised work. |
| 16 Oct | Selectively import Timothy's Supabase initializer, initial migration/config and environment examples from `575e20d`, and add the client SDK. | A source import, not a branch merge or proof of hosted deployment. Timothy retains authorship. |
| 16 Oct | Deliver Feature 4 in demo mode first, then refine task order, public updates/venue refresh, exact money, weather presentation and shared accessibility. | Historical staging choice. Live Feature 4 was subsequently implemented and deployed; demo remains supported. |
| 17 Oct | Fix all reviewed P2/P3 frontend findings, including teammate-owned findings; use GPT-6 Luna subagents at Medium effort for that pass. | Included cancellation/retry/focus, public RSVP/feed accessibility, stale OneMap responses, offer refresh, publication validation and route reuse. Does not authorise future Git/cloud actions. |
| 21 Oct | Integrate Gregory's event/RSVP work with Denzel's shared shell and Feature 4. | Preserve both async adapters, public event details, effective venue, removal/deletion behaviour and teammates' authorship. |
| 22 Oct | Authorise creating/verifying two development accounts and replacing 36 duplicate/obsolete hosted events with six distinct events after backup. | One completed development-data maintenance action. Later inventory is seven published events; no standing permission to reset data. |
| 22 Oct | Prepare and verify live Feature 4, trusted NEA switching, atomic creation/retry and private availability. | Deployment checkpoint is recorded in the timeline. Administrative keys stay server-only; signed-in and failure/concurrency coverage must be stated precisely. |
| 23 Oct | Read the latest handoff/evidence/disclosure before editing; install dependencies, inspect environment variable names without values, and run the requested build/Node tests first. | Initial orientation was read-only. Live browser testing was deferred until separately authorised below. |
| 23 Oct | Retain the shared App/NavBar/theme/router shell; favour Bootstrap and existing components; one shell-owned `main` per page; keep backend/data changes separate from restyling. | Navigation changes below are an explicit later exception to retaining the two old browsing links, not permission to replace the shell. Show intended files/plan before edits. |
| 23 Oct | Prioritise the demo at 575px with DevTools/console open; verify 375/575/768/1280px, console warnings, consistent controls/loading/alerts, labels and focus. | Continuing frontend acceptance criteria; tests are evidence for checked states, not complete accessibility certification. |
| 23 Oct | Fix existing issues first, finish the missing F6 flows, then test all features against the live backend. | Priority: F1 demo boundary/request duplication → F2 RSVP actions → F6 warnings → F4 regressions; include backend/image integration. Preserve ranking/waitlist/drawing ownership. |
| 23 Oct | Authorise live tests with disposable `[TEST]` records and cleanup. | Human signs in; agents do not type passwords. Saved sessions stay ignored. Do not alter the seven existing published events. |
| 23 Oct | Supply the existing R2 bucket's public URL and add it under both server/client variable names; configure the bucket CORS rule. | One public base URL, no trailing slash; `R2_PUBLIC_URL` for Express and `VITE_R2_PUBLIC_URL` for Vue. Exact development/forwarded origins must be allowed. Secrets never use `VITE_`. |
| 23 Oct | Explicitly approve the tested cover/venue-cleanup SQL for hosted Bookerz. | Applied as `20261023062011_event_cover_and_venue_cleanup`. Only newly marked RPC-created unreferenced venues are eligible; old unmarked catalogue/orphan rows are untouched. Not permission for unrelated migrations. |
| 23 Oct | Remove the duplicate Events tab/placeholder; use Discover as the browsing destination. | Current: `/` and brand → `/discover`; `/events` redirects preserving query/hash; `/events/:id/rsvp` stays unchanged. Public browsing is retained; Profile stays private in live mode. Supersedes the earlier separate-list decision. |
| 23 Oct | Request Lenis, Motion for Vue and GSAP ScrollTrigger. | Recorded in the separate motion work's plan/disclosure; see [frontend motion](#frontend-motion). This is an explicit dependency request, not permission for incidental libraries. |
| 23 Oct | Consolidate documentation into `decisions.md`, timeline-based `status.md`, supplied resources and essential operating docs. | Current structure: README, these two files, AGENTS, testing, and a tiny docs index preserving the resource index's existing link. Old handoffs are summarised, not another archive to navigate. |

## Continuing working agreements

- Use Vue 3 Composition API, JavaScript ES modules/templates, Vue Router,
  Bootstrap 5, Axios, Vite and pnpm; Node 22 for the documented commands.
  Preserve npm lockfiles. Do not incidentally introduce TypeScript, Tailwind,
  Pinia, JSX, SSR, infrastructure, dependency upgrades or extra libraries.
- Inspect `git status --short` first and preserve existing/untracked work.
  No commits, pushes, branches, merges, deployments or hosted mutations without
  explicit authorisation. A reviewable working tree is not a commit.
- Keep secrets and personal data out of source/docs/logs. Environment examples
  contain placeholders. Preserve imported initial SQL and coordinate later
  contracts with Timothy; check hosted history before applying changes.
- Keep library attributions in code and presentation materials and the detailed
  AI disclosure in README. Restricted resources, generated graphs, installed
  skills and private host notes remain local/ignored; normal clones do not need them.

## Adopted technical contracts

These consolidate the accepted integration behaviour; they are not newly invented
product decisions or claims that Denzel personally specified every implementation detail.

### Application and RSVP

- `client/src/utils/api.js` is the async event/RSVP/auth/Feature 4 boundary;
  demo uses localStorage, live uses the user's browser Supabase session/RLS.
  F1 discovery and F6 also have their focused data modules. Share one browser
  Supabase client. Failed live writes never silently fall back to demo.
- Express handles recommendations and signed image uploads in addition to health.
  Recommendations retain the caller JWT; no parallel Feature 4 Express CRUD.
- Organisers/helpers cannot RSVP to their own event; checked-in attendees cannot
  cancel. Offers reserve capacity and expire at the earlier of 24 hours or event
  start; no promotions after start. SQL is authoritative; UI/demo mirror the rules.
- Organiser removal is `rejected`, displayed as Declined by organiser, not an
  attendee late cancellation. Event deletion cascades event-linked data.
- Preserve Gregory's waitlist and Aishani's ranking algorithms. Schema access,
  error handling and agreed policy integration do not transfer their ownership.

### Feature 4 contract

- Owner-only private workspace: tasks, manual announcements, budget and forecast
  settings; helpers/co-organisers do not automatically gain Feature 4 editing.
- Tasks use stable IDs and To do/In progress/Done, with drag and equivalent
  keyboard status/order controls. Whole-board order saves atomically.
- Public `everyone` announcements on published events are readable before RSVP
  or login. Manual posts retain edit history; automatic venue-switch posts are
  immutable. Explicit refresh updates venue/feed together while preserving drafts.
- Store/edit/display money as exact integer SGD cents. Separate optional positive
  limit; nonnegative planned/actual expenses; blank actual means zero; warn at 90%,
  reached at 100%, over above 100%. No wider accounting/assignment scope implied.
- Weather uses original venue coordinates and fresh NEA two-hour data. Manual
  area is display-only for live authorisation. Missing/unknown/stale/failed data
  never authorises a switch. Upcoming/ongoing outdoor event and valid backup required.
- Venue switching is confirmed, one-way, and saves the effective venue plus one
  automatic public announcement atomically. The Edge Function independently
  checks NEA; its commit RPC is service-role-only. Original venue identity remains.
  No background auto-switches, reversals or email/push delivery were added.
- Preserve drafts and focus through failures/retry/cancel. Ignore obsolete async
  route/lifecycle results; don't retry an action the user has cancelled.

### F6 and storage

- Floor plans/programme are per-event; organiser writes use actual roles/RLS.
  Participants get a read-only plan/programme for events they can see.
- Free labelled markers are separate from actual team-member placements.
  Account-linked placements remain team-only and support saved keyboard coordinates.
- The current R2 bucket is public. Implemented image UI deliberately offers public
  finished plans for published events, not misleading private object uploads.
  Private object-image storage and automated cleanup remain explicit limits.

## Decisions recorded for other teammates

Huxley's confirmed 22–23 October integration decisions are retained for provenance,
but are not attributed to Denzel:

- Keep Denzel's routed shell and register Vue-Konva; integrate F1/F3/F6 through the
  shared router/database. Use Gregory's `/events/:id/rsvp` rather than a second
  RSVP dialog or new sign-in screen.
- Initially keep `/events` separate from `/discover` for demo compatibility;
  this has been superseded by Denzel's navigation decision above.
- Require sign-in on protected check-in routes even beneath `/events/*`.
- Approve the discovery schema/user-JWT fixes and the three SQL RSVP rules.
- Use a database attendance trigger to increase tag weights once per check-in
  (+1, capped at 5), plus barcode and name/email staff search.
- Scope the original F6 follow-up to saving/public viewing, actual organiser roles,
  and free labels. Denzel later authorised the remaining F6 implementation.

## Frontend motion

Denzel initially requested the three libraries, then clarified that only tool
installation was wanted. That first pass retained the dependencies without active
UI animation. The later project-wide redesign explicitly authorises using them.

Current implementation: one app-owned Lenis instance for fine-pointer desktop wheel
smoothing, native touch, dynamic reduced-motion preferences, map/canvas/input/nested
scroll exclusions, modal pause and lifecycle cleanup. GSAP ScrollTrigger provides
a restrained map-scene entrance. Motion for Vue animates contextual map previews.
Operational forms, alerts, QR/barcodes and task boards remain immediately usable.
There are no pinned scroll scenes. Later user-requested map loops have explicit
pause/visibility/reduced-motion controls; this supersedes the earlier no-loop choice.

See [the design system](docs/design/design-system.md) and actual evidence in
[status](status.md). Automated Chromium does not establish Safari/iOS feel or
physical camera/GPS behaviour. Map venues use real coordinates within a Singapore
area envelope; the generalised illustration is not navigation or boundary validation.


## 24 October immersive frontend refinement

Denzel supplies the new frontend implementation brief and authorises implementing
it directly. This refines the previous small SVG hero into an expressive, immersive
illustration-led landing page. The original provided PNG is preserved; the edited
plate has no baked event UI. The supplied brief explicitly allows decorative art
alongside an independent functional map when geographic alignment is unverified;
real venues therefore remain on the existing coordinate-based live Map view.

The user's testing preference is targeted bare-minimum checks after modifications;
full suites and production builds wait for explicit instruction. Existing older
build/test counts are historical evidence, not fresh verification of this pass.
No backend business rules, hosted services, migrations, releases or Git actions
are authorised by this visual brief.


### Interactive artwork correction, 24 October

Denzel explicitly asks to replace the old map with the supplied cleaned Singapore
illustration. This supersedes the earlier decorative-only image plus old SVG map
split. The implementation uses that image as the interactive background, preserving
live data and controls with an approximate, documented regional calibration. No
individual event coordinates, registration rules or backend records are changed.


### Replacement island and playful movement, 24 October

Denzel supplied **Singapore Island Illustrated Map.png**, explicitly replacing
the earlier artwork and requesting moving small components (ships/Flyer) and fun
popup interactions. Keep its geographic labels, use one shared animated artwork
layer in both views, and recalibrate coordinate-derived regional positions. The
original attachment remains unchanged; the animation background removes the
baked wheel and one speedboat to allow independent moving layers. Preserve
reduced motion, keyboard/focus behavior and the user's targeted-only checks.

### Design skills and focused UI corrections, 24 October

Denzel explicitly requested installation/application of UI/UX Pro Max, Hallmark
and Vercel Web Interface Guidelines, a major navbar overhaul exploring liquid
glass, session-dependent nav links, improved search placement and concealment of
the illustrated map's rectangular blue edges. Preserve the existing Vue/Bootstrap
stack and the targeted-only testing instruction. The implementation and review
findings are recorded in `docs/design/design-review.md`; no hosted release or Git
mutation is authorised by this request.


### Motion, themes and information hierarchy, 24 October

Denzel accepted the current visual direction and requested documentation updates,
then authorised further refinements: natural small map movement, hidden-by-default
filter choices, smoother view changes, a system-default theme toggle, distinctive
event actions, interactive creation and a more engaging RSVP page. Subsequent
steering prioritised public event facts over RSVP status, responsive My RSVPs,
a major organiser-workspace refresh and RSVP-status visuals. Use actual event
data for those visuals; no random or invented registrations are implied.

These requests preserve backend/registration/weather/ownership contracts. The
existing targeted-only testing preference continues; no release or live write
authority is added. Current presentation is documented in the design system.


### Publish dev and distribute feature-design baseline, 24 October

Denzel authorised publishing the accumulated current project to `origin/dev`,
updating ignore rules so normal clones receive required assets/docs without private
resources, and writing exact instructions for the six owners to replace their
own branches from one fixed dev commit. Preserve both local/remote tips first;
use explicit force-with-lease only on the owner's feature branch. Subsequent work
uses normal feature pushes; Denzel will create/review/merge PRs into dev later.
This authority does not reset teammates' branches now, force-push dev/main, deploy,
or mutate hosted application data. See `design-branches.md`.
## 26 October 2026 — F1 interest formula

Aishani requests Step 1 first: blend matched preference share and saturating
match strength equally, expose `interestScore`, and add console-based numeric
checks. Preserve the existing test files, updating affected expected scores only.
The later steps were initially pending; Step 2 is authorised below.

## 26 October 2026 — F1 tag diversity

Aishani requests maximum Jaccard tag similarity against already selected events,
with adjusted score = original score × (1 − 0.3 × maximum similarity). The 0.3
is a tunable heuristic; empty tags imply zero similarity. Category penalties
are replaced. Add console checks and commit with the supplied message.

## 27 October 2026 — recommendation V1 evidence foundation

Aishani accepts the simplified evidence → preferences → compatibility → diversity
plan, keeps Supabase, and requests proceeding after reviewing the existing schema.
One event contributes at most 15 positive points, with stage precedence and UTC
30/90-day ageing. Dismissal suppresses that event's positive evidence and its
recommendation eligibility without cancelling registration or deleting history;
undo restores the original positive stage date. No category-level negative
learning in V1. Preserve the earlier mentoring constraint against generating the
whole core engine. Begin with source-schema mapping and isolated evidence tests;
coordinate later schema integration with Timothy. See
[recommendation design](docs/recommendation-design.md).

Aishani then authorises continuing the persistence adapter without connecting it
to live ranking, reusing authoritative registration/check-in records. She requests
no `assert` usage: recommendation tests now use explicit checks and thrown errors.
Prepare SQL for review without applying it; hosted schema/history and PostgreSQL
permission/concurrency checks remain necessary before migration or integration.
