# Decisions

5 November 2026 — Huxley, Go together with friends: every group has two settings shown as badges,
**who can see it** (Public, or Friends only: the host's friends see it in Community, anyone else
needs the invite link) and **who can join** (Anyone can join, or Host approves). People asking to
join can add a message of up to 200 characters, which the host sees with Approve / Decline. When
starting a group the host can tick friends to invite; invites show at the top of Community, and
accepting counts as the host's approval (it still needs a free spot). The host can change both
settings, the spots (not below the people already in) and the note, or delete the group; everyone
who was in it, asking or invited gets a "group deleted" notice in Community. Community now shows one
card per event with its groups inside, a "Your groups" strip, and avatar stacks and countdowns; the
group page has a sticky action bar. Friends work in demo mode with sample friends. Live mode needs
migration `20261105120000_go_together_friends_invites.sql` (tables `group_invites`,
`group_join_notes`, `group_notices`; `are_friends()`; updated `_group_can_view`, `_group_summary`,
`group_view`, `create_group`, `join_group`), checked in PGlite and not yet applied to the hosted
project. It creates `profile_friendships` only if it is missing.

5 November 2026 — saved events are one journey, adopted after reviewing rendered previews. The
words are **Save** / **Saved** everywhere: the bookmark reads "Save {event}" / "Remove {event} from
saved" with the tooltips "Save event" / "Remove from saved". Saving on Discover shows "Saved to your
list" with a **View saved** button that opens `/my-rsvps?tab=saved`; My RSVPs now opens the tab named
in `?tab=` and keeps the URL in step (Upcoming drops it). Signed-in visitors with at least one
upcoming save get a **Saved** chip, with a count, leading Discover's category row. It is a peer of
All and the category groups (picking one clears the others), stays visible while selected so it can
be turned off, is kept in the URL as `saved=true`, and filters the list, map and count through the
events query (`savedOnly`: the caller's own `user_event_preferences` ids under RLS). Signed-out
visitors never see it. Saved cards lead to an RSVP: one badge (your own RSVP first, then Full or
5 or fewer spots, then timing in Singapore days), one main action matching `EventCardActions`
(RSVP, Join waitlist, Review offer, View your RSVP, or View event once ended or cancelled), and the
filled bookmark removes the save. Upcoming saves come first; ended and cancelled ones are greyed and
listed last. Discover is Aishani's (F1) and My RSVPs sits with Gregory's RSVP work (F2), so both
should look this over.

4 November 2026 — Huxley, Community gets Friends; Profile loses its tabs: at the team's request
Vivienne's Profile **Groups** (friend circles) are removed from the app, because Go together groups
already use the word and two kinds of group were confusing. Her **Friends** stay and move to a small
side panel in Community (beside the groups from 1200px, below them on smaller screens), so Profile
is just Edit profile; `/profile?tab=friends` goes to `/community#friends`. Only the client code went:
the hosted `profile_groups` tables and functions, `docs/sql/profile-groups-draft.sql` and its check
are left until the team decides whether to drop them. Go together, the group page and My RSVPs now
use her "festival ticket" look (header card with a star, outlined cards with hard shadows, pill tabs
and buttons), added as page-scoped sections in `design-baseline.css`. The removed
`/organiser/events/:id/edit` page redirects to Manage event's Edit tab, and the My events and Manage
RSVPs buttons link there directly.

4 November 2026 — Huxley, Go together in live mode: two new migrations,
`20261104142732_group_event_kind.sql` (adds the `group` event kind on its own, because a new enum
value can only be used after it commits) and `20261104142907_go_together_groups.sql`. A group is an
event row with kind `group`, so joining, spots (the host holds one), approvals and leaving reuse
registrations and `_admission_status`; `groups` links it to its official event with visibility and
the invite token. Chat, before/after ideas, votes and availability cells have their own tables with
RLS on and no grants: the browser uses only SECURITY DEFINER functions (`group_list`, `group_view`,
`create_group`, `join_group`, chat, plan and availability functions) that check membership. Private
groups are seen or joined only by their people or with the invite token. The migration redefines
`event_publicly_listed`, `can_view_event`, `_admission_status`, `event_availability`,
`register_for_event` (one marked change) and the events read policy to cover groups. Deleting an
official event deletes its groups. Signed-out visitors see no groups, because member names are only
for signed-in people. Recommendations skip hangouts and groups. Checked in local PGlite with
`server/checks/groups-db.check.mjs`, then applied to the hosted Bookerz project on the same day at
Huxley's request, before Timothy's review (he should still look it over). The connector recorded
them as versions 20261104142732 and 20261104142907, so the files carry those names. Before applying,
the hosted definitions of the five redefined functions were checked to match the hangouts migration;
afterwards a smoke test ran as real users inside a rolled-back transaction (nothing was kept).

4 November 2026 — Huxley, groups are no longer called hangouts in code: a Go together group is
stored as `kind: 'group'` with a `group` field (`visibility`, `inviteToken`, `eventId`) instead of
`kind: 'hangout'` with a `hangout` field, and the planner-only fields (`mode`, `stage`,
`dateRange`, `lockedSlot`) are dropped. Demo data saved in a browser is upgraded on load (group
seed version 5). Event lists use one rule, `isOfficialEvent`, which also keeps older live hangout
rows out. The live hangout planner (`supabaseHangoutsApi.js`, `/api/hangouts`, the `hangouts`
table) keeps its name until the group migration is agreed with Timothy. The unused
`utils/calendar.js` and the wizard's styles in `design-baseline.css` were removed.

4 November 2026 — Huxley, collapsible sidebar: from 992px the sidebar can collapse to an icon
rail with tooltips, remembered per browser (`bookedz-sidebar`). The old 992–1199px rail with
small labels is replaced by this; it still starts collapsed there. Go together pages refresh on
their own (group page every 20 seconds, chat every 15, and on focus) and gained small
animations, all disabled with reduced motion.

4 November 2026 — Huxley, Go together availability is when2meet style: in a group's before and
after plan, each side of the event is a three-hour column of 15-minute cells that members paint
when they're free (an earlier version offered fixed "from"/"until" choices; it was replaced). The
slot is the longest stretch of at least 45 minutes with the most members free for all of it,
nearest the event on a tie. Demo mode only, like the rest of groups.

4 November 2026 — Huxley, Community becomes Go together: the focus is finding people to go to an
event with. Posts are called **groups** (not jios) and are public (listed in Community and on the
event page) or private (only reachable by invite link); both have an invite link for members.
Each group has its own page (`/groups/<id>`; invite links `/g/<token>`) with the event, members,
Join then RSVP prompt, chat and a **before and after** plan: members suggest food spots or deals
for an hour before or after the event, mark ideas they're keen on and the host picks. The
hangout planner (availability grid, itinerary, On the day) is removed from the client; its live
files (`supabaseHangoutsApi.js`, `hangoutPlan.js`, `itinerary.js`), the migration and the Express
`/api/hangouts` routes stay so nothing hosted changes. OpenJio's Python deals pipeline is copied
into `pipeline/` and served by a new Express route, `/api/food` (deal drafts located with OneMap
search, nearby places from Geoapify with a cache and daily cap, optional scheduled runs). Groups
are demo-only until a migration for group comments and plans is agreed with Timothy. No SQL or
hosted changes.

4 November 2026 — Huxley, landing page becomes the sign-in page: the animated island map is
removed from `/`. Signed-out visitors sign in or create an account there; signed-in people and
the demo account see an account summary. `/login` redirects to `/` with its `?redirect=`. The
island art components stay in the repo, unused. No backend changes.

4 November 2026 — Huxley, Community becomes open jios: Community is strictly for jios
(people asking others to go to one specific official event together) and the hangout planner,
which moves out of Create event to `/community/plan`. Official events stay in Discover and My
events; hangouts no longer appear there. Joining a jio takes a spot and then prompts an RSVP to
the event (the event's own rules apply). The old Community text posts are removed. Built in demo
mode first; the live app shows "Coming soon" until a jio comments migration is agreed with
Timothy. No SQL or hosted changes.

4 November 2026 — Huxley, design consistency pass: one design document,
[DESIGN.md](docs/design/DESIGN.md), replaces the design system, design review and
implementation record. Discover does **not** show the "Picked for you" strip (this
supersedes the 3 November instruction to retain it). Map pins use category colours, with
orange stars for picks and neutral count clusters. Standard words are "RSVP" (or "Join
waitlist" / "Request a spot") and "spots". Labels use sentence case except hangout stamps.
No backend, database or scoring changes.

3 November 2026 — merge-resolution implementation: preserve Aishani's committed
recommendation and redesigned pages while integrating dev's Hangout functionality.
Retain current shared palette/typography and add missing compatibility tokens.
Keep the illustrated landing and current street-map workspace; retain IslandArtwork
because it is imported, and accept dev's deletion of the unused SingaporeMap.
Combine both Supabase adapter imports and both sets of geographic helpers. Leave
the merge commit and push for Aishani; do not apply incoming SQL to hosted services.

3 November 2026, subsequent street-map correction — Aishani rejects the illustrated Discover map and explicitly chooses **Map beside timeline**. This supersedes the list-only/map-removal layout decision below: retain the current palette, recommendation strip and event-title navigation, and add a real OneMap street map beside the timeline (stacked on narrow screens). Keep the existing recommendation algorithm. No separate Map navigation entry is needed.

3 November 2026 — Aishani requests removal of the Discover Map feature and the
supplied exact light/dark colour roles. Remove the sidebar entry, discovery map
panel/switch/selection and landing map entry points. Legacy map URLs open List
without losing search/filters. Retain the decorative landing artwork and normal
event-form venue selection maps. Preserve existing uncommitted artwork/code;
unreferenced map components are not deleted in this pass. Palette values are
documented in the design system; filled orange actions and orange text/links use
separate tokens.

3 November 2026, Discover workspace — Aishani requests the supplied search →
compact Picked for you → category chips → timeline beside map layout, explicitly
retaining and using the current recommendation algorithm. Reuse existing
recommendation reads/actions and event registration routes. Desktop shows both
panels; phones use tabs. Map and timeline show the same filtered current page;
this supersedes the previous all-results map layer for the Discover workspace.
Keep the selected illustrated island and fixed-boat water animations. No request
to commit, push, deploy, change scoring or write hosted event data.

3 November 2026, stable-boat refinement — Aishani requests detailed boats that
match the supplied illustration and remain fixed in place, with moving water
and wakes creating the sailing impression. This supersedes translating/bobbing
SVG boat routes; retain the expanded island, labels and other animations.

3 November 2026, follow-up — Aishani requests visible boat travel and a moving
water effect, explaining that the sparse plane/transport accents were insufficient.
Add continuous local ripples, wakes and several sailing vessels while retaining
the selected artwork, small labels and shared motion controls. Buildings remain
fixed; the docked cargo ship stays moored.

3 November 2026 — Aishani selects the expanded illustrated Singapore island:
larger terrain, more buildings and attractions, the existing cheerful palette,
smaller labels and all existing decorative animations. She requests integration
into the local Bookedz repository. Preserve event discovery and real venue data;
the illustration remains approximate. This request authorises local source/asset
edits, not a commit, push or deployment.

2 November 2026 — Aishani requests central typography roles in `main.css`, keeping
Bricolage Grotesque for headings and DM Sans for body/buttons. Page titles use
32–48px/700; section headings 22–28px/650; ordinary card titles 20px/650; body 16px;
metadata/buttons 14px; captions 12px. Featured event titles may use a distinct
larger shared role. Remove conflicting scoped rules, including breakpoint rules,
instead of adding `!important`; compare pages at equal zoom and mobile widths.

2 November 2026 — Aishani prioritises organiser My events tabs/search, pending
counts with direct Review requests, state-specific Edit draft/Manage event/View
results, empty states/mobile layout and organiser-to-participant consistency.
Use existing management, edit and attendance routes. Drafts lists persisted draft
events; do not imply a new save-as-draft or publish-draft workflow. Preserve real
status/availability counts and deletion confirmation; no invented attendance,
duplication or cancellation controls from the reference image.

2 November 2026 — Aishani requests the My RSVPs redesign with separate
Upcoming/Saved/Past/Cancelled tabs, earliest upcoming confirmed plan, independent
saved-event retrieval and component extraction. Keep offers above the tabs,
existing cancellation/offer refresh and actual ticket navigation. Directions and
calendar actions must work; no decorative QR, invented waitlist position or photo
sharing. Closed registrations retain their specific status labels; verified
attendance requires a check-in without a fraud flag. Recommendation scoring is
outside this change.

2 November 2026 — Aishani requests twelve fictional [TEST] events created through
the live event form and a two-participant recommendation journey, with a separate
organiser. The user authorises resets of the two dedicated test participants.
Keep mocked UI evidence separate from browser/Express/Supabase evidence; event
draft preparation is not event creation or live verification.

2 November 2026 — Aishani requests excluding active saves from recommendation
candidates while preserving their learning evidence. Unsave restores candidate
eligibility subject to existing filters; evidence snapshots remain unchanged.

2 November 2026 — apply Aishani's supplied recommendation-quality update:
exclude organiser/team behavioural evidence while retaining explicit interests and
bookmark storage; explain recommendations using supporting actions. Preserve the
existing route fixture and current topic, distance and diversity scoring.

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
updated through 31 October 2026.
Dates identify the decision, not a blanket approval for later work. Team decisions
and implementation contracts are attributed separately. The [status timeline](status.md)
records delivery and evidence; [README](README.md#change-history) retains
full authorship and library attribution. Original supplied material remains in
`docs/resources/` (local-only, excluded from normal clones).

## Denzel's decisions and approvals

On 23 October, Denzel subsequently authorised a full project-wide frontend redesign
based on `docs/resources/Bookedz_Design_Ideation_Spec.md`, explicitly superseding
the existing visual UI/UX. This supersedes earlier theme/shell preservation and tools-only scope
for this redesign. Existing backend contracts, business rules, routes, data and
teammate authorship remain. The implementation's visual choices and assets are
documented in [the design document](docs/design/DESIGN.md). This does not
authorise a commit, push, deployment, SQL change or hosted data mutation.

| Date | Decision / approval | Status and limits |
| --- | --- | --- |
| 15–16 Oct | Use the supplied course resources and team proposal to orient Bookedz work; respect each teammate's feature ownership. | Official requirements, proposed scope, observed implementation and suggestions must remain distinct. |
| 16 Oct | Authorised the first Feature 4 implementation and its follow-up iteration. | |
| 16 Oct | Selectively import Timothy's Supabase initializer, initial migration/config and environment examples from `575e20d`, and add the client SDK. | A source import, not a branch merge or proof of hosted deployment. Timothy retains authorship. |
| 16 Oct | Deliver Feature 4 in demo mode first, then refine task order, public updates/venue refresh, exact money, weather presentation and shared accessibility. | Historical staging choice. Live Feature 4 was subsequently implemented and deployed; demo remains supported. |
| 17 Oct | Fix all reviewed P2/P3 frontend findings, including teammate-owned findings | Included cancellation/retry/focus, public RSVP/feed accessibility, stale OneMap responses, offer refresh, publication validation and route reuse. Does not authorise future Git/cloud actions. |
| 21 Oct | Integrate Gregory's event/RSVP work with Denzel's shared shell and Feature 4. | Preserve both async adapters, public event details, effective venue, removal/deletion behaviour and teammates' authorship. |
| 22 Oct | Authorise creating/verifying two development accounts and replacing 36 duplicate/obsolete hosted events with six distinct events after backup. | One completed development-data maintenance action. Later inventory is seven published events; no standing permission to reset data. |
| 22 Oct | Prepare and verify live Feature 4, trusted NEA switching, atomic creation/retry and private availability. | Deployment checkpoint is recorded in the timeline. Administrative keys stay server-only; signed-in and failure/concurrency coverage must be stated precisely. |
| 23 Oct | Read the latest handoff/evidence/disclosure before editing; install dependencies, inspect environment variable names without values, and run the requested build/Node tests first. | Initial orientation was read-only. Live browser testing was deferred until separately authorised below. |
| 23 Oct | Retain the shared App/NavBar/theme/router shell; favour Bootstrap and existing components; one shell-owned `main` per page; keep backend/data changes separate from restyling. | Navigation changes below are an explicit later exception to retaining the two old browsing links, not permission to replace the shell. Show intended files/plan before edits. |
| 23 Oct | Prioritise the demo at 575px with DevTools/console open; verify 375/575/768/1280px, console warnings, consistent controls/loading/alerts, labels and focus. | Continuing frontend acceptance criteria; tests are evidence for checked states, not complete accessibility certification. |
| 23 Oct | Fix existing issues first, finish the missing F6 flows, then test all features against the live backend. | Priority: F1 demo boundary/request duplication → F2 RSVP actions → F6 warnings → F4 regressions; include backend/image integration. Preserve ranking/waitlist/drawing ownership. |
| 23 Oct | Authorise live tests with disposable `[TEST]` records and cleanup. | Humans sign in and type passwords. Saved sessions stay ignored. Do not alter the seven existing published events. |
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
- Keep library attributions in code and presentation materials and the change
  history in README. Restricted resources, generated graphs, installed
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

See [the design document](docs/design/DESIGN.md) and actual evidence in
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
findings are recorded in `docs/design/DESIGN.md` (section 10); no hosted release or Git
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

## 3 November 2026 — OpenJio UI and outing-planning integration

Requested in conversation by a team member, who asked not to be named. They report
team approval to restyle every teammate's pages. This is user-reported, not
independent verification, and it is not permission for commits, pushes or hosted
mutations. Supplied sources: the OpenJio `design-handoff.md` (UI only) and
`feature-specification.md`.

- **Visual system:** replace Bookedz tokens globally with OpenJio's Hawker Glow
  (light/dark palette, Nunito headings, 14/20px radii, motion timings). Keep the
  Bookedz name, logo and page layouts. Buttons keep a resting shadow that deepens on
  hover; the colourway and smooth animation are explicitly liked.
- **Map:** use OneMap instead of the illustrated island everywhere: landing hero
  (a live OneMap preview of real upcoming events), Discover's Map view and the
  neighbourhood cards. The Discover map includes category pins with clusters,
  "Search this area", "Near me" (location never stored or sent) and a result rail
  with a preview.
- **No OpenJio placeholder data:** listings, itinerary candidates and pins come from
  real Bookedz events (plus organiser-entered OneMap places later), never sample
  OpenJio listings.
- **Planned, not yet implemented:** event creation will offer an *Official* (Bookedz)
  or *Hangout* (OpenJio) template. A Hangout is an event type on the existing events
  table, with private invite link, public Open Jio and solo modes. It will have group
  availability and slot ranking (no reply counts as unknown), an itinerary built from
  real Official events and OneMap places, versioned Keep/Swap votes with explicit
  host confirmation, and On the day late-join. The backend will be demo mode plus a
  live adapter and an unapplied SQL migration draft, pending Timothy's review.
  Late-join routing will use an Express OneMap proxy when server credentials exist,
  otherwise a visibly labelled estimate.
- Order: tokens → OneMap → Hangout template/data → Time → Plan + voting → On the day
  → migration draft, checking in after each step.
- **Step 3 choices:** Hangouts keep the `/events/:id/rsvp` URL, which renders the
  hangout workspace for hangout-type events; private invites preview at `/j/:token`.
  Create event opens with two template cards (Official / Hangout) before the wizard.
  Organisers of either template choose one of three join modes: Open (instant
  join, no questions or waitlist, closes when full), RSVP auto-confirm with waitlist,
  or RSVP with approval. Hangouts default to Open and Official events to
  auto-confirm. Open needs a `join_mode` column and an RSVP function change, which
  go only in the unapplied migration draft for Timothy to review.
- **Routing endpoint:** `/api/route` is public (demo visitors have no session),
  limited to Singapore coordinates and 120 requests a minute per IP. Credentials stay
  server-side. Revisit requiring sign-in once live hangouts exist.
- **Hangout capacity** includes the host (the wizard says "including you").

## 3 November 2026 — live hangouts approved

The requesting team member (unnamed, as before) explicitly approved building live
mode: hangout data held in the hosted database with the updated rules, and live
OneMap routing.

- The draft is promoted to `supabase/migrations/20261103120000_hangouts.sql`. They
  will apply it themselves with the Supabase CLI (`npx supabase@2.122.0`, run and
  logged in by them), after checking `migration list` and
  a dry run. Timothy should still review it. This approval covers this migration only.
- They will add `ONEMAP_EMAIL`/`ONEMAP_PASSWORD` to `server/.env` themselves.
- After the migration is applied, a signed-in live test is approved: `[TEST]`-prefixed
  hangouts on the Bookerz development project, created with their session and deleted
  afterwards, leaving existing events untouched.
- Live group-time ranking runs on Express (`/api/hangouts/:id/time`): the caller's
  membership is checked as the caller first, then the server key reads the private free
  times. Live plan scoring weighs the hangout's chosen interests, because members'
  own interests are private.

## 3 November 2026 — step-by-step UX pass (`gregory`)

- **Deleting an event** asks in a pop-up. The position fix in Denzel's shared
  `ConfirmationDialog` applies to every feature that uses it.
- **Hangouts are edited in the Hangout wizard**, not the Official one. Type, time and join
  mode stay read-only until there is a way to save them.
- **My events cards** show three controls (Manage event or Open hangout · RSVPs · ⋯); Edit
  details, View public page / Event tools and Delete move into ⋯.
- **Plan suggestions** are offered on the Review step ("Suggest programme & tasks") instead
  of in the footer of every step.
- **Navigation:** Categories and Map leave the sidebar (Discover links to both); phones get
  a bottom tab bar and laptops (992–1199px) a slim icon rail; pages may be 1440px wide.
  Settings stays, per Aishani's 27 October layout, and Create event stays on My events
  rather than in the navigation.
- **Discover filters** (Aishani's `EventFilters`): no duplicate title, an active count, a
  readable button, 44px targets and a compact drop-down on wide screens.
- **Unit tests** use Node's runner with a small `expect` helper; no Vitest dependency.

