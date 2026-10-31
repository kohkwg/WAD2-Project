# Decisions

Denzel's recorded instructions and approvals, consolidated on 23 October and
updated through 31 October 2026.
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
- Budget owners can add/delete their own per-event categories in demo and live
  (27 October). Built-ins stay; deleting a custom category moves its expenses to
  `Other` atomically. Expenses have a quantity; planned/actual are stored as line
  totals (unit cost × quantity). Live needs migration `20261027120000`, not yet
  deployed; coordinate with Timothy before applying it to Bookerz.
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
- The current R2 bucket is public. The plan background is a public R2 object; do not
  represent it as private storage. Private object-image storage and automated cleanup
  remain explicit limits. The earlier public finished-image panel was removed on 29 October
  (see the `vivi` decisions below); the background replaces it.

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

## Decisions recorded for the `vivi` branch (Feature 6 owner), 27–31 October

Given by the branch owner in conversation; not Denzel's decisions and not faculty approval.

- **Plan background:** store it as an R2 editor image and keep its key in the plan layout so
  participants can see it; no migration. Participants see the same canvas read-only. This
  makes the background effectively public, which differs from the database's "editor images
  are never public" intent, and is documented rather than hidden.
- **Remove the public finished-image panel**, and replace the Plan zones side panel with a
  full-width Canva-style canvas (toolbar, double-click rename, selection bar).
- **Event planner, first slice = programme + tasks.** Allowed sources are events published by
  other organisers and the organiser's own past events only. An identical title copies the
  best past event's programme and, for the organiser's own events, its tasks; other
  organisers' tasks are private and never used. Otherwise community patterns need at least
  three events. The button sits left of Next in the create-event wizard, is disabled without
  a title, and the title field suggests existing event names as you type.
- **Sample data:** write an opt-in seed script (default accounts come from
  `client/e2e-live/accounts.mjs`); running it needs separate approval because it writes to the
  hosted project.
- **Community tab:** a public feed that stores posts in the browser until a shared table is
  approved (it would need a migration coordinated with Timothy).


### Gregory's F2 design branch, 25 October

Gregory confirmed ownership of `gregory`, approved its one-time backup-first
replacement with baseline `86c0265`, and requested Feature 2 UI/UX improvements
following the shared design guidance, targeted checks, documentation updates and
a normal push to `gregory`. PR creation and merging stay with Denzel. This does not
authorise changes to dev/main, other owners' branches, shared shell/theme files,
dependencies, schema or hosted data. Results are recorded in
[status](status.md#25-october--gregorys-f2-design-branch-gregory).

### Event cover cropping, 27 October

We chose one on-screen 16:9 crop for every event card cover (My events, the
Create Event previews and Discover's `EventCard`), keeping uploaded originals rather
than cropping files on upload. `EventCard` is Aishani's Feature 1 component, so she
should review that change. Details:
[status](status.md#28-october--event-covers-cropped-to-169-gregory).
