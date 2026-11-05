# Change history

What changed, who asked for it and who wrote it, newest first. "We" means the AI coding
assistant working at a team member's request; every entry names the person who requested or
approved the work (the earliest setup entries are Denzel's), and teammates keep the authorship of their own code. Library, font, data and
asset credits are collected in the [README](../README.md#credits-and-licences).

This is a history, not current status: see [status](status.md) for the latest verified
checkpoint and [decisions](decisions.md) for who decided what. Entries on the same day keep the
order they were recorded in; a few entries were recorded without a date and are filed under
the day their status entry gives.

## 5 November 2026

On 5 November 2026, at Denzel's request, we added search suggestions to Discover
(`lib/searchSuggestions.js`, with the list in Aishani's `EventFilters.vue` and its wiring in
`DiscoverView.vue`), and changed the live search so text containing a comma or bracket still matches.

On 5 November 2026, at Huxley's request, the food deals were removed from Go together: the
Python `pipeline/` (Telegram and deal sites, Gemini extraction), the server's deal code and
`/api/food/ingest/run`, the planner's Deals tab and the related env keys. The food service is now
`server/services/foodPlaces.js`. Also at Huxley's request: places closed at the meal time are
hidden and the rest are listed nearest first (`server/services/openingHours.js` reads
OpenStreetMap opening hours); "Suggest a spot" is one place box, a search field over one list of
nearby places and OneMap matches that saves the address and map pin; the group page gives Before
and after the wide column with a Before | After switch on narrow screens, folds the free-time grid
into one line and leads each slot with "The plan" and the ideas; the free-time grid no longer
leaves an outline on the group column; and sending a group chat message no longer shows a
"nextTick" error.

On 5 November 2026, at Gregory's request, we brought back the soft dark mode on every ticket page
(now including Vivienne's event page and dashboard and the Go together pages) and moved its four
tokens into `main.css`; made dark-mode outline buttons, dashboard rows and Community tiles easier
to see as clickable; put each dashboard card's buttons at its bottom; kept Go together's chips
their own height; gave Delete event a red hover; and let an open Discover card close on a second
click, a click outside or Escape. Later that evening we gave outline buttons on coloured headers a
card-coloured fill and ink edge, kept the dashboard's Next-up buttons at the bottom of each slide,
gave the plain group chips one soft warm colour and added space under the Go together title. We also fixed dark rules in five components that never applied,
because `:global(…)` dropped the rest of their selector. We changed `main.css`,
`design-baseline.css`, `AccountDashboard.vue`, `CommunityView.vue`, `GroupView.vue`,
`StartGroupDialog.vue`, `EventGroupsCard.vue`, `GroupCard.vue`, `OrganiserEventCard.vue`,
`DiscoverView.vue` and `DiscoveryEventRow.vue`; teammates keep authorship of their files.

At the user's request, we expanded the readability pass across 335 first-party code files:
329 formatted and six Python files already readable. Expanded JavaScript, Vue attributes
and CSS, added spacing and lowercased ordinary comment prose; tooling directives, attribution,
URLs and code references are preserved. Source/config/tests and the existing Edge Function
were included; assets, secrets, lockfiles, supplied resources and SQL migrations were excluded.
Pre-existing uncommitted work was snapshotted before formatting and retained. Each contributor
keeps authorship of their feature. A local grouped review index, originals and formatting-only
diffs are in `/tmp/wad2-readability-review/`; this is not a functional rewrite.

At the user's request, we formatted TaskBoard, WeatherTool and EventTeamPanel: expanded dense
JavaScript, long attributes and CSS, added spacing and simple lowercase comments. Task ordering,
weather eligibility, permissions, drafts, retries and styling are unchanged. Denzel and the
other original contributors retain authorship; README library credits are preserved.

At the user's request, we formatted ConfirmationDialog, AnnouncementFeed and AnnouncementManager:
expanded dense JavaScript, long template attributes and CSS, added spacing and lowercased
comments. Modal focus, live refresh, drafts, retries, actions and styling are unchanged;
Denzel retains authorship of the event-operation components.

At the user's request, we formatted `BumpValue.vue`, `BackLink.vue` and `SkeletonList.vue`:
expanded dense JavaScript, long attributes and loading-placeholder CSS, added spacing and
lowercased comments. Animation, navigation, loading states and styling are unchanged;
original contributors retain authorship.

At the user's request, we formatted a three-file organiser-controls batch:
`OrganiserEventCard.vue`, `EventToolNavigation.vue` and `ShowHideButton.vue`. Expanded
JavaScript, long attributes and CSS, added spacing and lowercase comments. Existing
feature owners retain authorship; links, confirmation, keyboard handling and styling
are unchanged.

At the user's request to review three files per batch, we formatted `AddressSearch.vue`,
`AnnounceChangesDialog.vue` and `CountUp.vue`: expanded JavaScript, long attributes and CSS,
added spacing and simple lowercase comments. Search, save/announce retries, animation,
labels and styling are unchanged; original feature owners retain authorship.

At the user's request, we formatted `StepIndicator.vue`: expanded long attributes and CSS,
added spacing and simplified comments into lowercase. Progress calculation, backwards step
navigation, labels and styling are unchanged; Gregory retains feature authorship.

At the user's request, we formatted `OnlineEventLink.vue`: expanded CSS and timer cleanup,
added spacing/braces and simplified comments into lowercase. Meeting-link access, reveal
timing, labels and styling are unchanged; feature owners retain authorship.

At the user's request, we resumed the structural review with `RsvpEmptyState.vue`:
expanded props, markup and CSS, added spacing and a simple lowercase comment.
Messages, links and styling are unchanged; Gregory retains feature authorship.

At the user's request, we removed the public RSVP page's sticky, internally scrolling right
column and moved its venue-map toggle into a separate card below the description/details,
before Go together. Map loading remains on demand and online/hidden venues stay excluded.

At the user's request, we swapped the event details card (description, venue and cover) with
the public announcements on the RSVP page. `EventSummary.vue` supports an optional details
target and after-header slot; `RsvpView.vue` places details under the RSVP card and announcements
under the banner. Create-event summaries keep their original placement.

At the user's request, we added account-wide update notifications and paused the structural
review. `App.vue` starts `useUserNotifications.js`; `userNotifications.js` compares account-scoped
snapshots. The existing `ToastHost.vue` now appears at the top right with the existing cheerful,
curious or sad dino artwork, a close button and optional View update link. `useToast.js` defaults
to ten seconds, cleans up timers and clears notices on account switches; explicit undo durations
are preserved. Added focused unit/browser tests. Existing feature authorship and dino artwork
credits remain with the team; no dependencies, migrations or hosted writes were added.

At the user's request, we formatted `SavedEventCard.vue`: expanded props, long attributes
and CSS, added spacing and simplified comments into lowercase. Saved-event labels, bookmark
actions, links and styling are unchanged; feature owners retain authorship.

At the user's request, we formatted `ParticipantRsvpRow.vue`: expanded props, template
attributes and CSS, added spacing and simple lowercase comments. Ticket/cancellation actions,
labels, date formatting and styling are unchanged; Gregory retains feature authorship.

At the user's request, we formatted `NextEventCard.vue`: expanded props, long attributes
and CSS, added spacing and a short lowercase comment. Content, ticket links, directions,
calendar actions and styling are unchanged; Gregory retains feature authorship.

At the user's request, we formatted `OfferBanner.vue`: expanded CSS, added spacing and
simplified comments into lowercase. Countdown and offer actions are unchanged; Gregory
retains feature authorship.

At the user's request, we formatted `RsvpStatusBadge.vue`: expanded icon attributes and CSS,
added spacing and simplified comments into lowercase, correcting the fallback explanation
to match the existing pending style. Labels, icons and colours are unchanged.

At the user's request, we formatted `GroupChip.vue`: expanded props, template attributes
and CSS, added spacing and simplified comments into lowercase. Labels and group visibility
behaviour are unchanged; Huxley retains authorship of the groups feature.

At the user's request, we spaced out `WaitlistTable.vue`: expanded CSS properties, separated
props from emitted events and simplified comments into lowercase. Scoring, ranking, actions
and appearance are unchanged; Gregory retains feature authorship.

At the user's request, we formatted `RsvpTable.vue`: expanded JavaScript, long attributes
and CSS, added spacing and simplified comments into lowercase. Props, emitted actions,
confirmation controls and styling are unchanged; Gregory retains feature authorship.

At the user's request, we formatted `ManageRsvpsView.vue` for page-by-page review:
expanded JavaScript, long template attributes and CSS, added spacing and replaced long
historical comments with simple lowercase explanations. Registration and waitlist logic,
child components and API contracts are unchanged. Gregory retains authorship of the feature.

At the user's request, we spaced out `ManageEventView.vue`: expanded JavaScript formatting,
added gaps between top-level declarations, split long tag attributes and expanded CSS declarations.

At the user's request, we began a structure-only pass informed by their OneDrive Vue
examples. In `ManageEventView.vue`, we expanded the workspace load/reset and unmount
code and simplified comments. No template or style declarations changed.

At the user's request, we cleaned up `ManageEventView.vue`: removed unused workspace quick-link
styles, consolidated Vue imports and lowercased comment prose. Denzel and the other feature
owners retain authorship of their workspace code.

At the user's request, we cleaned up `OrganiserEventsView.vue`: removed unused organiser-kicker,
view-memory and direct-header-button mobile styles, and lowercased comments. Feature owners
retain authorship of their organiser code.

On 5 November 2026, at Denzel's request, Discover's map stopped showing a pop-up card: choosing an
event highlights its pin (halo, other pins dimmed) and zooms to its area, and View event and RSVP
moved into the chosen event card, which also appears under the map on phones. We changed
`DiscoveryEventRow.vue`, `DiscoveryDayRow.vue`, `DiscoveryStreetMap.vue` and `DiscoverView.vue`, and
updated the map steps in four browser specs.

On 5 November 2026, at Gregory's request, we renamed "My RSVPs" to **Plans** and "My Events" to
**Organise** across the navigation, page titles, headings, back links and sentences (URLs
unchanged), gave Organise, Plans and Go together a slim header that holds each page's own
controls, and replaced the Discover bookmark's "Save event" tooltip with a "Save" / "Saved" pill
that slides out on hover or focus, which also re-centres the button. We changed
`design-baseline.css`, `NavBar.vue`, `router/index.js`, `EventBookmark.vue`,
`DiscoveryEventRow.vue`, `OrganiserEventsView.vue`, `MyRsvpsView.vue`, `CommunityView.vue`, the
pages that name or link to those pages (`CreateEventView`, `ManageEventView`, `ManageRsvpsView`,
`RsvpView`, `LandingView`, `DiscoverView`, `MyTicketView`, `SelfCheckInView`),
`DeleteAccount.vue`, `EventTeamPanel.vue`, `OfferBanner.vue` and ten e2e specs. Discover's cards
are Aishani's and Denzel's, and Denzel, Huxley, Aishani and Vivienne keep authorship of their
files.

On 5 November 2026, at Denzel's request, the sidebar starts as the 76px icon rail at every
laptop and desktop size (992px and up) and only expands when someone uses its toggle; an
expand or collapse is remembered per browser. Phones and tablets keep the drawer. The width
CSS uses for the rail is now the same 76px before and after the first toggle. We changed
`NavBar.vue` and `main.css`, rewrote `e2e/sidebar-collapse.spec.js`, and added a line to
thirteen other browser specs (and `navbar-account.spec.js`) that start from an expanded
sidebar because they use its theme drop-down. We also moved this change history out of the
README into this file, moved `decisions.md` and `status.md` into `docs/`, replaced
`design-branches.md` with `docs/contributing.md`, folded the pipeline's labelling notes
into `pipeline/README.md`, and rewrote the README for submission.

On 5 November 2026, at Denzel's request, the signed-out landing page gained motion: a
word-by-word headline with a drawn squiggle, an assembling hero scene with parallax and a
pointer-tilted card that shuffles through real upcoming events (pause/next controls), dinos
that hop when clicked, scroll reveals, feature-card hover, a section pill in the landing nav,
and a short celebration after signing in. We wrote `composables/useLandingMotion.js` and
`components/landing/LandingNextUp.vue`, and changed `LandingWelcome.vue` and `LandingView.vue`.
No new dependencies: this uses the installed GSAP (now also its bundled SplitText and DrawSVG
plugins, same GSAP Standard License), Motion for Vue and Lenis, all credited in the README.

On 5 November 2026, organisers got a "coming with a group" indicator on Manage RSVPs
(`components/rsvp/GroupChip.vue`, `getEventGroupMembers`), Friends became a full-height sidebar in
Community, and migration `20261105074842_event_group_members.sql` added the live lookup and merged the
two `create_group` definitions into one.

Also on 5 November 2026: only people going to an event can start a group for it, joining a group
RSVPs you to the event, Community has a "Your events" strip and group carousels, and event teams
moved out of Community. Changed `CommunityView.vue`, `EventGroupsCard.vue`, `StartGroupDialog.vue`,
`EventGroups.vue`, `GroupCard.vue`, `GroupView.vue`, `mockApi.js` and the unapplied migration
`20261105050527_go_together_friends_invites.sql`.

On 5 November 2026, Go together gained friends-only groups, friend invites, join messages, host
settings and deleting, and a new layout (groups under their event, a "Your groups" strip, a sticky
bar on the group page). We wrote migration `20261105050527_go_together_friends_invites.sql`,
`components/community/EventGroupsCard.vue`, and changed `StartGroupDialog.vue`, `GroupCard.vue`,
`CommunityView.vue`, `GroupView.vue`, `FriendsPanel.vue`, `profileFriends.js` (demo friends),
`groups.js`, `mockApi.js`, `mockData.js` (seed version 6), `supabaseGroupsApi.js` and `api.js`, with
tests in `groups.test.js`, `e2e/go-together.spec.js` and `server/checks/groups-db.check.mjs`.

On 5 November 2026, added more space between Discover's rows, toned down
dark mode on every ticket page (Discover included) after Vivienne's feedback that the colours felt heavy,
renamed "My events" to "My Events", and restyled the Sort by drop-downs. We changed `design-baseline.css`, `DiscoverView.vue`,
`NavBar.vue`, the router title, `OrganiserEventsView.vue`, the back links in `CreateEventView.vue`,
`ManageEventView.vue` and `ManageRsvpsView.vue`, and three e2e specs.

## 4 November 2026

On 4 November 2026, Friends moved from Profile into a side panel in Community, and the Profile
Groups tab was removed (its hosted tables were left alone). Go together, the group page and My RSVPs
were restyled with Vivienne's design baseline, and the broken Edit event links now open Manage
event's Edit tab. We changed `CommunityView.vue`, `GroupView.vue`, `MyRsvpsView.vue`,
`ProfileTabsView.vue`, `components/community/FriendsPanel.vue` (moved from `components/profile`),
`design-baseline.css`, the router and the two edit links, and replaced `e2e/profile-friends.spec.js`
with `e2e/community-friends.spec.js`.

On 4 November 2026, Go together got live mode. We wrote the migrations
`supabase/migrations/20261104142732_group_event_kind.sql` and
`20261104142907_go_together_groups.sql`, the live adapter `client/src/utils/supabaseGroupsApi.js`,
`livePlanView` in `utils/groups.js`, `getEventsByIds` in `supabaseApi.js`, and the isolated
database check `server/checks/groups-db.check.mjs`. Recommendations now skip groups. The migrations
were tested in local PGlite and then applied to the hosted Bookerz project.

On 4 November 2026, groups stopped being called hangouts in the code. A group is now stored as
`kind: 'group'` with a `group` field, and older demo data is upgraded automatically. We changed
`utils/groups.js`, `mockApi.js`, `mockData.js`, the event-list filters and the Community
components, and removed the unused `utils/calendar.js` and the retired wizard's styles. The live
hangout planner files keep their names until the group migration is agreed. No SQL or hosted
changes were made.

On 4 November 2026, Community became Go together. People start a **group** for an event,
public or private, each with an invite link, and every group has its own page. Members plan
food before and after the event there, choosing from nearby deals and places. We wrote
`utils/groups.js`, the group functions in `mockApi.js`, `GroupView.vue`,
`components/groups/*`, and the renamed Community components. Server side we wrote
`server/services/foodDeals.js` and `server/routes/food.js`, with tests. The pipeline in
`pipeline/` was copied from the OpenJio branch with small path and naming changes. The old
hangout planner UI was removed, but its live files and the migration were kept. No SQL or
hosted changes were made.

## 3 November 2026

On 3 November 2026, we made a step-by-step UX pass prompted by bug reports and
professor feedback; each change was previewed and approved before it was applied.
We authored the My events delete pop-up, ⋯ action menu, "Open hangout" button
and responsive grid (`OrganiserEventsView.vue`); a `pendingLabel` option and a centring
fix in Denzel's shared `ConfirmationDialog.vue`; hangout editing in `HangoutWizard.vue`
with `hangoutFormFromEvent` and `hangoutChanges` (`utils/hangouts.js`); the Hangout live
preview, full-width create layouts and the Review-step "Suggest programme & tasks" card
(`NewEventView.vue`, `CreateEventView.vue`); changes to Aishani's `EventFilters.vue`; the
phone tab bar, laptop rail, visible ☰ icon and shorter sidebar in `NavBar.vue` and
`main.css`; `utils/eventForm.js` (the Create Event checks, moved unchanged) with
`eventForm.test.js`, `hangoutForm.test.js` and the `expect.js` helper; and selector updates
in three existing browser tests. No backend, SQL, dependency, asset or hosted change was
made. Details: [status](status.md).

For Aishani's 3 November `origin/dev` merge conflict follow-up, we combined the
recommendation/saved-event and redesigned participant/organiser pages with the
incoming Hangout/template/routing functionality. We retained the committed
landing illustration and street-map workspace, shared Bricolage/DM Sans typography
and palette, added incoming compatibility tokens, and combined geographic helpers.
We updated isolated test fixtures for the new adapter import and aligned a stale
timestamp assertion with the already committed five-second clock-skew tolerance.
Eighty-nine focused Node cases and twelve selected browser cases pass; all 77 Vue
sources/templates compile. Hosted integration is not verified. Conflict resolution
does not itself commit, push, merge the PR, deploy or run the incoming SQL.

For Aishani's subsequent 3 November street-map request, we authored
`DiscoveryStreetMap.vue` and connected timeline thumbnail selection to it while
retaining title navigation and the existing palette. It uses the already installed
Leaflet library and [OneMap GreyLite tiles](https://www.onemap.gov.sg/docs/maps/)
with visible OneMap/SLA attribution. Coordinates come from existing event venues;
no geocoding token or new dependency is needed. We added selectable clusters,
map previews using existing RSVP actions, tile retry, and focused verification.
The recommendation backend and composable were not edited in this change.

For Aishani's 3 November map-removal/palette request, we detached the Discover
map, removed sidebar/landing map controls, removed map-only selection/fetching,
and changed timeline titles to event-detail links. We connected filled actions,
heading surfaces and steps to the supplied light/dark palette, preserving earlier
uncommitted artwork and application changes. Event-form Leaflet/OneMap remains.
Focused verification is recorded in testing/status; no hosted data, dependencies,
commit, push or deployment changes were made.

For Aishani's 3 November Discover reference-layout request, we added a compact
recommendation strip, category shortcuts, date-led compact event rows and a
simultaneous sticky map on desktop. The existing recommendation endpoint,
composable, scoring, eligibility/exclusions and server order are unchanged.
Scores/reasons appear only when supplied; anonymous upcoming picks retain their
source explanation. Save/dismiss/undo/retry and event status/RSVP/waitlist routes
are retained. Timeline and map share the current filtered 12-event page, with
linked selection and embedded-map framing; phones use List/Map tabs and one
initial pick. Existing island/water animation remains. We authored four
focused rendering tests; no new dependencies, backend, database or hosted writes.

For Aishani's subsequent stable-boat refinement on 3 November, we replaced
the translating SVG hulls with detailed boats painted into a new sibling
illustration, using an image generation tool. Boat positions now remain fixed; only
stern ripples, wake streams, open-water currents and shoreline glints animate.
The existing Flyer/plane/bird motion and common pause/reduced-motion handling
remain. This supersedes the sailing-route presentation described below.

For the 3 November water-motion follow-up, we replaced the painted sailing
cargo ship with an independently animated SVG vessel, added ferry/coastal/bay
boat routes, animated wakes, local water currents/glints and shoreline strokes.
The existing pause/offscreen/tab logic now shares an inherited play-state variable
with the new components; each respects reduced motion. Built-in image editing removed
only the sailing cargo ship from a sibling background plate; the moored port
ship remains static. Actual movement and pause freezing were checked in-browser;
no application dependencies or hosted data changed.

For Aishani's 3 November expanded-island request, we used an image generation tool to
expand the illustrated terrain with more neighbourhoods and attractions, then
cleaned printed labels, small boats and the Flyer wheel from the animation plate.
We integrated the optimised WebP, repositioned the existing independent wheel,
boats, plane and birds, recalibrated approximate regional event placement, and
added compact clickable neighbourhood/attraction labels with zoom-dependent
detail and collision suppression. Existing event coordinates, clustering,
previews, pause/visibility/reduced-motion logic and theme contracts are retained.
Asset prompts/provenance are in [the asset register](design/assets.md).
No new runtime libraries, hosted data, scoring or schema changes.

On 3 November 2026, at the request of a team member who asked not to be named
(team approval to restyle all pages is user-reported), we began integrating OpenJio's design handoff (UI only) and outing-planning
specification. We authored the Hawker Glow token values in `main.css`,
removed per-page button overrides, and wrote `EventMap.vue`, `MapPreview.vue`,
`lib/onemapTiles.js`, the rewritten `utils/discoveryMap.js` helpers and tests, the
neighbourhood-card change and the updated map/hero browser tests.
`SingaporeMap.vue` and `IslandArtwork.vue` were removed; the island art files are
retained but unused. Map data are real Bookedz venues only. No backend, SQL,
dependency or hosted change was made. [Nunito](https://github.com/googlefonts/nunito)
is self-hosted under the SIL Open Font License (`client/src/assets/fonts/Nunito-OFL.txt`).
Basemap tiles come from [OneMap](https://www.onemap.gov.sg/) © contributors |
Singapore Land Authority, attributed on every map. The existing Leaflet, Motion for
Vue and GSAP attributions below still apply. Teammates' business logic keeps its
authorship. Details: [status](status.md).

In the same session we authored the Create event template picker
(`NewEventView.vue`) and the demo-mode Hangout template: `utils/hangouts.js` and
tests, `components/hangout/*`, the `/j/:token` invite view, the RsvpView branch for
hangout events, demo join-mode and invite handling in `mockApi.js`, the live-mode
refusal in `supabaseApi.js`, and the `?template=official` test updates. Gregory's
Official wizard is unchanged. It then authored the group Time tools:
`utils/hangoutSlots.js` (an implementation of the OpenJio specification's slot
algorithm) with tests, `TimePanel.vue`, `AvailabilityGrid.vue` and the demo
availability/lock functions in `mockApi.js`. It then authored the plan tools:
`utils/itinerary.js` (the specification's beam-search itinerary adapted to
fixed-time Bookedz events, plus a "meet later" relaxation) with tests,
`PlanPanel.vue`, and the demo plan, vote and confirmation functions in `mockApi.js`.
For On the day it authored `GoPanel.vue`, `utils/lateJoin.js`, `utils/calendar.js`,
`lib/hangoutWeather.js` (NEA data.gov.sg forecasts), `lib/routing.js`, and the
Express OneMap routing proxy (`server/routes/route.js`,
`server/services/onemapRoute.js`) with tests. Route data © OneMap contributors |
Singapore Land Authority; forecasts from NEA via data.gov.sg. Finally it authored
the hangout migration `supabase/migrations/20261103120000_hangouts.sql` (promoted
from a review draft on the team member's approval) and its isolated PGlite check
`server/checks/hangouts-db.check.mjs`. It changes Gregory's `register_for_event` only
at the two marked points; Timothy should review it. For live mode it authored
`utils/supabaseHangoutsApi.js`, `utils/hangoutPlan.js`, the hangout wiring in
`supabaseApi.js`, and the Express `/api/hangouts` routes with tests.

## 2 November 2026

For Aishani's shared-typography request on 2 November, we added central size
tokens and page/section/card/metadata/caption/button roles, retaining Bricolage
Grotesque and DM Sans. We removed conflicting scoped desktop/mobile declarations
across Discover, My RSVPs, My events and their cards, and aligned Profile/Community
page titles. A temporary Chromium comparison verified actual computed type values
on the three primary pages at 100% zoom, four widths and both themes; four existing
focused layout/action checks also pass. No new dependencies, behaviour or hosted
changes. The comparison script and screenshot evidence remain under `/tmp`.

For Aishani's 2 November organiser My events request, we authored the mint
header, date-led cards, Upcoming/Drafts/Past/All tabs, search/sort retention,
pending-request summary and direct review actions. State-specific links reuse
existing edit, management and attendance/results routes. Existing draft events
can be rescheduled without publishing; no new draft-creation/publishing flow was
added. We preserved deletion confirmation/focus, added pending-status deep
links and prevented demo drafts appearing in public lists. Five Node and seven
unique focused demo browser cases pass across targeted runs, including organiser
approval/rejection/removal reflected in participant My RSVPs. No live database,
SQL, recommendation-scoring or dependency changes; hosted behaviour is unverified.

For Aishani's 2 November My RSVPs redesign, we authored the peach header,
summary counts, time-aware Upcoming/Saved/Past/Cancelled tabs, next confirmed
event, focused row/card/empty-state components, directions and calendar download.
We added caller-scoped saved-event reads and unsave through the existing
preference endpoint, with matching demo adapters. Existing cancellation, offer
actions, ticket routes and periodic/focus refresh are retained. Attendance labels
require an explicitly unflagged check-in. Ten focused Node and ten browser cases
pass across targeted runs; browser/API fixtures do not verify hosted persistence.
No SQL, recommendation scoring, dependencies or hosted data were changed.

For Aishani's 2 November recommendation journey request, we updated the mocked
Playwright scenarios for save exclusion, related-event explanations, refresh,
dismiss/undo, retry and empty states, and enlarged bookmark targets to 44px.
Three mocked browser tests pass. We prepared twelve fictional event drafts and
a separate mocked/live evidence log; browser permissions block form creation and
live verification. No hosted events, account resets or database writes occurred.

For Aishani's saved-event discovery follow-up on 2 November, we added active
save candidate exclusions and applied the supplied interaction regression test.
Saved events still teach preferences for other events; evidence calculation is
unchanged. All 22 focused mocked backend checks pass.

On 2 November 2026, we applied Aishani's supplied recommendation-quality ZIP,
preserving current scoring and distance changes. Organiser/team activity no longer
teaches preferences, including historical organiser events; explanations identify
supporting save/registration/attendance evidence. We adapted the supplied tests
to existing check helpers. All 22 focused mocked backend tests pass; hosted
integration was not verified and no database/deployment changes were made.

## 29 October 2026

On 29 October 2026, organisers gained the ability to edit a published event and announce the changes.

- New "Edit event" page (`/organiser/events/:id/edit`) reuses the Create Event steps,
  pre-filled with the event's details. Only the organiser can edit, and only before the
  event starts.
- Opened from a small Edit link beside the event name on My events (hidden once the
  event starts) and an "Edit event" button on Manage RSVPs.
- Before saving, a pop-up lists what changed (time, venue, capacity, RSVP questions, etc.)
  and offers to post it as an announcement on the event page (on by default, title and
  message can be edited).
- Safety rules: capacity can't go below people already confirmed/offered; once people have
  RSVP'd, questions can be reworded or added but not removed, venues are locked after the
  rain switch to the backup venue. Raising capacity offers the new places to the waitlist.
- New files: `utils/eventChanges.js` (builds the change list) and
  `components/rsvp/AnnounceChangesDialog.vue` (the pop-up). Changed: `CreateEventView`,
  `OrganiserEventsView`, `ManageRsvpsView`, `mockApi.js`, `supabaseApi.js`, `api.js` and one
  route in `router/index.js`.

All of it uses Denzel's existing announcement and confirmation dialog code unchanged. No new libraries
and no database migration. The live saving uses the existing tables and permissions.

## 28 October 2026

On 28 October 2026, every event card cover was given the same 16:9 shape: photos and the fallback artwork are
centre-cropped on screen on My events, Discover's event cards (Aishani's `EventCard`)
and the Create Event previews. Uploaded images are unchanged.

Details: [status](status.md#28-october--event-covers-cropped-to-169-gregory).

## 27 October 2026

In the same 27 October follow-up, we authored the caller-JWT event-evidence
persistence adapter, simulated RPC contract tests and a PostgreSQL review draft
outside the migrations directory. At Aishani's request, recommendation tests use
explicit checks and thrown errors instead of Node's assertion library. The SQL
has not been executed; database permissions/concurrency and live integration
remain unverified. Existing teammate application logic retains its authorship.

On 27 October 2026, at Aishani's request, we mapped the existing source schema
to the accepted recommendation V1 design and authored the isolated event-evidence
function and its targeted tests. This foundation is not connected to live ranking;
the remaining core algorithm stays a team implementation task. No hosted schema
or data changed. See [the design](recommendation-design.md).

For the subsequent preference-builder step, Aishani authorised completing the
agreed local scoring chunk. We authored `userPreferences.js` and seven focused
tests: explicit 10-point priors, unique-event/tag handling, equal evidence splitting,
accumulation and separate explicit/learned/combined outputs. No live integration.

For the compatibility step, Aishani accepted the per-tag `points / (points + 10)`
scale and authorised implementation. We authored the standalone compatibility
function and eleven focused checks. It remains separate from live ranking.

For the approved diversity step, we authored the standalone Jaccard helper,
greedy selector and eleven focused checks. All four V1 core functions now exist
locally; the live recommendation route still uses the existing ranking logic.

For the approved local pipeline step, we authored the pure recommendation
orchestrator and sixteen mock-data end-to-end tests. These connect the four V1
functions with eligibility, registration exclusions and labelled general discovery.
No existing core function, live route, SQL or frontend behaviour was changed.

For V1 contract alignment, Aishani chose confirmed-only RSVP evidence, preserved
first save/confirmation dates and explicit choices from `profile_interests`. We
aligned the review-only SQL draft, simulated status fixtures, focused tests and
documentation. Core calculations and the pipeline remain unchanged; the SQL has
not been executed and no hosted schema or application route was changed.

For Aishani's approved simplified MVP integration, we connected the existing
Express route to the V1 pipeline, added authenticated preference actions and verified
legacy interaction notifications, wired Profile to explicit interest links through
a draft transactional RPC, and added card scores/explanations/save/dismiss/undo.
We authored corresponding mocked route, component, composable, Profile and
browser tests and corrected scoped dark-theme contrast. No new libraries, core
algorithm changes, SQL execution or hosted mutation. The SQL draft remains a
deployment dependency: local application wiring is tested with mocks, not live
Supabase. Existing teammate RSVP/check-in logic and the legacy attendance trigger
retain their prior ownership. See [V1 wiring and deployment dependencies](recommendation-design.md).

For final isolated database verification, we authored a test-only PostgreSQL
harness that loads all eleven application migrations plus the recommendation draft
into temporary in-memory PGlite. Seventeen checks pass, including RLS/permissions,
profile transactions, confirmation/waitlist/attendance and rollback ordering.
Auth identity, storage and cron are local substitutes; hosted sign-in/API/grants
remain unverified. PGlite was downloaded only under `/tmp`; application packages
and lockfiles were unchanged. No shared Supabase access or deployment occurred.

For Aishani's Discover navigation request, we added a shared compact category
grid and directory/filter query views on the existing Discover route, plus a
Closing soon section using existing event cards and factual deadlines/places.
We authored focused helper/browser tests and scoped layout corrections. Existing
theme cards, recommendation algorithms, database/RLS, backend and RSVP logic were
unchanged; no new dependencies were added.

For Aishani's category UI refinement, we enlarged directory icons/cards, aligned
results search with the listing, hid directory-only event-view controls, and added
removable category chips with search preservation and keyboard focus recovery.
Only frontend presentation/query synchronisation and targeted tests/docs changed;
recommendation logic, existing routes, backend and database remain unchanged.

For Aishani's focused Discover search/card request, we refined the existing
hero search, interest shortcuts, removable filters and tab-scoped browsing-state
retention. Event and recommendation cards gained supplied descriptions and linked
titles; ordinary cards show full date/time and omit unknown attendance counts.
We authored targeted component/browser checks. No new dependencies or assets.

For Aishani's follow-up Discover request, we moved the map action directly
below search, reused display filters for compact recommendations, and retained
access to explicitly labelled other picks in filtered/List/Map views. Existing
scores and recommendation actions remain unchanged. We authored focused mock
tests; no backend, SQL, route or dependency changes were made.

For Aishani's sidebar account placement request, we moved the existing theme
selector below Settings and moved Profile/Sign out into the sidebar footer.
Existing authentication/theme handlers are reused. We authored two mocked
desktop/mobile navigation checks including sign-out failure/retry; no live account
or database changes were made.

At Aishani's request, we removed the sidebar promotional card and its Create
event button, together with their unused component styles.

For Aishani's landing-page request, we moved the existing illustrated hero into
`LandingView.vue` at `/`, linked all Bookedz brands home and retained event browsing
at `/discover`. Existing filters carry search/category/map actions into Discover.
We authored focused public-route, responsive and navigation checks; no new art,
dependencies, backend or database changes were introduced.

## 26 October 2026

On 26 October 2026, for Aishani's Step 2 request, we replaced category-based
diversity with maximum Jaccard tag overlap, using the supplied 0.3 tunable
heuristic. We added console-based similarity/ranking checks and updated the
existing diversity test fixture and expected order.

On 26 October 2026, Gregory committed a follow-up.

Summary - Grouped Feature 2 components into one folder and finished dark mode for
the F2 pages.

The seven components used only by Feature 2 pages moved into
`client/src/components/rsvp/`; `RsvpStatusBadge` stays shared and `VenueMap` stays
because Feature 6's floor-plan editor also uses it. My events (card footer, coral
buttons, labels, progress bars and status badges), the waitlist offer badge, Create
Event's disabled buttons and RSVP validation messages now follow the shared
light/dark theme, and one more stale browser test was updated. Gregory's logic and
other teammates' work keep their authorship. No libraries or backend changes were
added. Details: [status](status.md#25-october--gregorys-f2-design-branch-gregory).

On 26 October 2026, at Vivienne's request under the shared design-branch workflow,
we backed up and replaced only the `vivi` branch from Denzel's published design
baseline, then authored a scoped Feature 6 UI polish for the floor-plan editor,
programme flow and public finished-image panel. The pass changed presentation and
documentation only; live storage, organiser roles, programme validation, helper
placement semantics and public image rules retain their existing contracts.

On 26 October 2026, at Aishani's request, we implemented the supplied interest
formula blending preference share and match strength, exported its helper, added
the supplied console-based checks and command, and updated affected expected
scores in the existing ranking tests. Other ranking signals remain unchanged.

## 25 October 2026

On 25 October 2026, at Gregory's request, we
followed `design-branches.md` to back up and replace the `gregory` branch with the
published baseline, then authored Feature 2 presentation and accessibility
refinements:

Summary - Fixed dark-mode for certain pages, Added notes for RSVP.

Create Event question/venue/focus/dark-mode and phone-order changes,
public RSVP choice pills, shortcut and team state, My RSVPs and Manage RSVPs focus,
tab and offer-action fixes, multi-day `formatEventTime` output with a Node test,
updates to three stale browser-test selectors, and these notes. Gregory's RSVP,
waitlist and creation logic and other teammates' work keep their authorship.

No libraries or backend changes were added. Details: [status](status.md#25-october--gregorys-f2-design-branch-gregory).

On 25 October 2026, at Aishani's request, we refined F1 Profile's theme-aware
form, interest-selection feedback, saving states and Discover's responsive view
controls, semantic hosting colours and reduced-motion hover behaviour. We
also authored isolated browser regressions and updated the feature design/status
notes. Aishani's recommendation ranking and existing data contracts retain their
original authorship. No runtime library was added.

## 24 October 2026

On 24 October, Denzel authorised committing/pushing the accumulated project
progress to `origin/dev` and preparing a shared feature-design baseline. We
authored `design-branches.md`, audited publication ignore rules/assets, and
prepared backup-first, owner-scoped branch replacement instructions. This does
not reset teammates' branches or create/merge their PRs; those steps remain with
each owner and Denzel. Private source resources and local credentials/tools remain
excluded; deployable art/fonts/licences and design documentation are included.

During the later 24 October motion/workspace refinement, we implemented the
system-aware theme preference, collapsible categories, view transitions, additional
map layers, ticket-like CTAs and participant information hierarchy/status controls.
We refined Create Event, the RSVP presentation, organiser
operations and registration tables, and preserved
existing business contracts and ran only focused checks. Documentation was updated
to distinguish current behaviour from historical design/testing checkpoints.

For Denzel's subsequent 24 October navigation/search refinement, we installed
and applied UI/UX Pro Max, Hallmark and Vercel Web Interface Guidelines as local
design tools. We refined shared typography/colour tokens, frosted navigation,
session-dependent links, integrated discovery search and image-edge feathering.
A read-only review helped identify a pending-search issue;
we corrected it and added focused checks. No runtime library was added.
[Design verification and limits](design/DESIGN.md#10-verification-history-and-limits) document the
actual scope, Hallmark's remaining heuristics and unavailable browser renderer.

At Denzel's subsequent 24 October request, we adopted the replacement
**Singapore Island Illustrated Map.png** across discovery. An image generation tool
prepared its background for independent motion; we authored SVG Flyer,
boat and seabird layers, pause/visibility handling, playful marker feedback and
spring previews. Real event coordinates still drive approximate regional markers.
The source, edited WebP, final prompt and animation limits are documented in
[asset provenance](design/assets.md#replacement-island-and-independent-animation-layers-24-october).
No new library or teammate authorship changes are introduced.

Later on 24 October, at Denzel's correction, we replaced the interactive
map's old SVG terrain with the supplied cleaned illustration itself. It retained
live event markers/clusters and pan/zoom/previews, added documented approximate
regional registration, and preserved exact venue information in event details.
See [calibration and provenance](design/assets.md#interactive-illustration-registration-later-24-october-correction).
The former decorative-only split is superseded. Only targeted map checks ran.

On 24 October 2026, Denzel supplied a new immersive frontend brief. We refined the hero, event imagery/cards, hosting navigation and
organiser/create-event presentation while preserving existing business contracts.
We used an image editor to remove baked pins, labels and counts
from the supplied Singapore illustration, preserving the original. The optimised
clean artwork initially served a decorative hero beside the independent live
map. That intermediate arrangement is superseded by the shared illustrated map
and latest replacement plate described below. We authored new SVG category art/cloud/boat accents, scoped motion,
recommendation-failure presentation, focused tests and documentation. DM Sans is
self-hosted under the SIL Open Font License, included beside the font. See
[asset provenance](design/assets.md) for the exact edit prompt and paths.
This pass used targeted checks only; the production build/full suite await user
instruction. Existing library credits and teammate authorship above still apply.

## 23 October 2026

On 23 October 2026, at Denzel's request, we consolidated the project handoffs,
merge/fix reports, local historical plans and duplicated package setup notes into
the decision register, status timeline and testing guide. It preserved supplied
resources and the detailed authorship/library record, updated contributor links,
and did not change application behaviour or hosted services in this docs pass.

Later on 23 October, Denzel explicitly authorised the full frontend redesign based
on the supplied Bookedz ideation spec. We authored the new shared visual system, navigation/typography, participant and
organiser layouts, attendance/ticket/venue workspaces, map-first SVG discovery,
map data pagination/active-venue coordinates, marker clustering and previews,
motion integration, design artifacts and regressions. Existing ranking, RSVP,
waitlist, attendance, drawing and backend contributions retain their original
authorship. The redesign needs team review and ownership before submission.
[Natural Earth](https://www.naturalearthdata.com/) supplies the public-domain
generalised Singapore coastline; the map illustration and brand vectors were
made for the project. [Bricolage Grotesque](https://github.com/google/fonts/tree/main/ofl/bricolagegrotesque)
is self-hosted under the SIL Open Font License, included beside the font. The
previously installed Lenis, Motion for Vue and GSAP/ScrollTrigger are now used;
retain their licences/attributions above. Since 5 November the landing page also uses
GSAP's [SplitText](https://gsap.com/docs/v3/Plugins/SplitText/) and
[DrawSVG](https://gsap.com/docs/v3/Plugins/DrawSVGPlugin/) plugins, which ship in the
same `gsap` package under the same licence. See [design](design/DESIGN.md)
and [asset provenance](design/assets.md). No new runtime packages, backend
schema changes or hosted writes were added during the redesign.

On 23 October 2026, at Denzel's explicit request, we added
[Lenis](https://github.com/darkroomengineering/lenis) (MIT),
[Motion for Vue](https://motion.dev/docs/vue) (`motion-v`, MIT) and
[GSAP with ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/)
([GSAP Standard License](https://gsap.com/standard-license/)) as dependencies for
future frontend work. These libraries are installed but not activated: there are
no new UI animations or scrolling changes. We updated the pnpm lockfile and
tooling documentation. Carry these library attributions into presentation
materials when used. See [frontend motion tools](decisions.md#frontend-motion).

In the subsequent navigation follow-up on 23 October, we removed the obsolete
Events placeholder/tab at the user's request, consolidated browsing on Discover,
preserved legacy `/events` links through a redirect and public access, and updated
navigation regressions/documentation. The shared shell's structure/theme and
event-detail/RSVP routes were retained.

On 23 October 2026, at Denzel's request, we and parallel helpers diagnosed
and fixed the discovery Supabase/demo boundary and repeated auth refreshes, RSVP
action guards and demo rules, event cover upload/persistence, Express upload/port
handling, and Feature 6 programme, venue-map, actual team placement and public
finished-image flows. They added regressions, enabled the existing waitlist tests
using Node's runner, and reviewed the changes independently. The user manually
signed in for live tests. With explicit user
approval, we applied the cover/venue-cleanup migration to the development
project after PostgreSQL verification. The user configured R2 CORS. Verification
uses disposable test records/files and reports limits in
[`status.md#23-october--fixes-and-live-verification`](status.md#23-october--fixes-and-live-verification). Existing ranking, drawing and
waitlist-scoring algorithms retain their teammates' authorship. No new libraries
were added; retain the existing library attributions above.

Also on 23 October 2026, at Huxley's request and with Huxley's choices of scope, we
made Feature 6's floor plan save and display.
- It added migration `20261023051511_floor_plan_public_view`, applied through the
  Supabase MCP: participants can read the floor plan of events they can see.
- It added `client/src/utils/floorPlan.js` and the live test
  `client/e2e-live/floor-plan.spec.mjs`.
- It changed Vivienne's `client/src/editor.vue` to load and save per event, with real
  roles instead of demo buttons, a Save button and a read-only viewer.
- It added the route, the Manage event link and the viewer on the event page.

Vivienne's drawing code was kept; Vivienne should review these changes.

On 23 October 2026, at Huxley's request, we completed Feature 3's remaining
items:
- the ticket barcode, using [JsBarcode](https://github.com/lindell/JsBarcode) (MIT);
- the station's name/email search;
- the attendance → interest-weight trigger (migration
  `20261023044027_attendance_interest_signal`, applied through the Supabase MCP);
- the live Playwright suite in `client/e2e-live/`.

It also fixed a Realtime race on My Ticket, and nested `<main>` landmarks on eight pages.

The attendance trigger connects Feature 3 to Aishani's recommendation weights. Huxley
chose the design (a database trigger) and asked for it to be implemented, for Huxley
to review and own. The live test signed in with sessions Huxley created by signing in.

## 22 October 2026

Later on 22 October 2026, with Huxley's explicit approval of each plan, we
used the Supabase MCP to apply two migrations to the Bookerz development project:
`20261022100100_feature1_discovery_contract` (profile fields for Feature 1 and a
row-level-security-respecting `events_with_counts` view, replacing a hand-made
security-definer view) and `20261022100141_rsvp_rules` (organisers can't RSVP to
their own event, no cancelling after check-in, offers capped at the event start).
It also changed Feature 1's Profile save, Discover filters, event-card links and
`/api/recommendations` (now queried with the user's JWT instead of the
service-role key), and updated the affected tests. Aishani's ranking and Gregory's
waitlist-scoring algorithms were not rewritten. Aishani, Gregory and Timothy should
review these changes. Details: [integration timeline](status.md#22-october--all-six-features-integrated).

On 22 October 2026, Huxley created `dev2` from `main`, merged `huxley`, `vivi`
and `aish` into it (PRs #3–#5), and merged `dev2` into `dev` (PR #6). Huxley confirmed
every routing and access decision. We ran builds, tests, Graphify reviews
and a signed-in browser test against the development project with two test
accounts (Huxley signed in). Its throwaway
`[TEST]` events were deleted afterwards. It then fixed four integration bugs in
`de3978e`: the check-in dashboard count, the check-in Back links, the station's
check-in method, and the RSVP page's count refresh. It also wrote
`docs/dev2-merge-log.md` and `docs/merge-session-2026-10-22.md` (historical
logs since collated in [status](status.md)). Teammates'
business logic was not rewritten; their open issues are listed in the session
record. [vue-konva](https://github.com/konvajs/vue-konva) (MIT),
[qrcode](https://github.com/soldair/node-qrcode) (MIT),
[html5-qrcode](https://github.com/mebjas/html5-qrcode) (Apache-2.0) and
[Papa Parse](https://github.com/mholt/PapaParse) (MIT) arrived with the merged
features. Carry these attributions into presentation materials.

On 22 October 2026, we prepared the live Feature 4
browser adapter, owner-scoped SQL contract, retry reconciliation and tests.
We later added a server-authorized NEA forecast check, one-way atomic venue
switch, atomic live event creation and RSVP retry handling, with independent
review. We then added a privacy migration that hides organiser-only availability counts
from public callers. The five migrations and Edge Function were applied to the
hosted Bookerz development project. Local and database contract tests passed;
signed-in owner and other-user browser checks remain pending.

On 22 October 2026, we used the authorised server-only development key to
create and verify two test accounts, then backed up and replaced 36 duplicate
or obsolete hosted events with six distinct events split evenly between them.
The database changes were manual development-data maintenance, not an app feature
or migration. We also consolidated the merge, review and iteration handoffs
into the current guides under `docs/`. No passwords, privileged keys or private
event backup are included in this repository. The earlier guide versions remain
in Git history.

## 21 October 2026

On 21 October 2026, we resolved the Gregory/`dev` merge conflicts under
Denzel’s direction. We authored the combined API boundary, offline Feature 4
retention, public/auth routing, effective-venue mapping, event-deletion cascade,
frontend reconciliation, test fixture and regression changes, and updated these
handoffs. Gregory’s event/RSVP adapter and Leaflet map remain Gregory’s original
contribution; Timothy’s SQL and server script remain Timothy’s contribution.
The live Feature 4 adapter and SQL migrations were subsequently deployed to the
development project. The venue switch uses a trusted NEA forecast verifier.
[Leaflet](https://github.com/Leaflet/Leaflet) (BSD-2-Clause) powers the map;
[Supabase JavaScript](https://github.com/supabase/supabase-js) (MIT) powers the
browser data adapter. Carry these attributions into presentation materials.

## 17 October 2026

For the follow-up fix pass on 17 October 2026, Denzel explicitly authorised all
reviewed P2/P3 findings, including teammate-owned frontend defects. We
implemented cancellation/retry
and focus recovery, announcement placement and RSVP accessibility, consolidated
weather reads, offer refresh, stale-search protection, final publication
validation, route reuse and page semantics, with regression tests. We also
performed integration review and verification and prepared technical and merge
handoff documentation plus ignore rules. These changes require team review; ownership of the affected features
stays with their assigned teammates. Hosted integration remains deferred.

On 17 October 2026, we reviewed Feature 4 and shared frontend boundaries using
Graphify, source inspection and isolated browser checks, and consolidated the
current guide, verification, handoff and historical Markdown. We authored the
review findings, suggested fixes and documentation edits; this review did not
implement those application fixes or verify hosted integration.

## 16 October 2026

Added libraries: [SortableJS](https://github.com/SortableJS/Sortable) (MIT) for
task drag and drop; [Playwright](https://github.com/microsoft/playwright)
(Apache-2.0) for browser tests. Retain these attributions in presentation materials.

For the authorised second iteration on 16 October 2026, we authored the task
ordering correction, coordinated public event/announcement refresh and minimal
RSVP integration, exact money display/edit helpers, tool layout and editor-focus
changes, weather presentation, shared confirmation variant, Bootstrap theme CSS,
navigation/reset/skip/focus behaviour, route document titles, event-summary heading
and disclosure semantics, new regressions and test-harness corrections, review
and handoff documentation. Teammate
business logic for discovery, RSVP/offer management, event creation, attendance,
maps/floor plans and hosted backend integration was not rewritten. Existing
contributions retain their provenance. No new dependencies were added.

On 16 October 2026 Denzel authorised this first Feature 4 iteration. We authored the Feature 4 demo data/helper logic, seed extension,
organiser workspace and task/announcement/budget/weather components, public
announcement integration, venue display changes, routing integration, unit and
Playwright tests, dependency/test configuration, and accompanying documentation.
These parts require team review and ownership before submission. Existing application code and Timothy's imported SDK/schema
retain their prior provenance. This iteration does not implement hosted auth,
Supabase persistence, R2 access, or database migrations.

## 15–16 October 2026: orientation and setup

At Denzel's request, we selectively copied Timothy's Supabase initializer,
configuration, initial SQL migration, and env examples from commit
`575e20dcbcfefb2f9e4f43543d5213b04a09f0ab`, added the corresponding client SDK
dependency, and revised the integration plan. The copied code remains Timothy's
contribution; no branch merge or database migration was performed. The client SDK
is [Supabase JavaScript](https://github.com/supabase/supabase-js).

We also reviewed environment configuration without recording credential values,
indexed the team's live Project Info document, and drafted the Feature 4
implementation plan. This was documentation and planning assistance; it did not
implement Feature 4 or verify the hosted backend.

We set up the project-context documentation, configured Graphify, and indexed
the supplied resources. This does not change the authorship of pre-existing
application code.
