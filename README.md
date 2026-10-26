# Bookedz — IS216 WAD2

Vue 3 / JavaScript / Bootstrap frontend, Supabase data/auth/Realtime and an Express
recommendations/image-upload API. Discover is the public browsing entry point;
organisers manage events, attendance and operations through the same shell.

## Start here

- [Decisions](decisions.md): Denzel's recorded approvals, team decisions and contracts.
- [Status](status.md): project timeline, current feature ownership, verification and open limits.
- [Testing and local operation](docs/testing.md): all commands, environments, live login and remote access.
- [Design branch workflow](design-branches.md): baseline backups, branch replacement, feature work and PRs into dev.
- [AGENTS.md](AGENTS.md): contributor rules; supplied materials stay local in `docs/resources/`.

## Current frontend

Discovery uses the latest illustrated Singapore island with real event markers,
sparse independent motion and collapsible filters. The floating navbar, ticket-like
event actions and participant/organiser screens share System/Light/Dark themes.
Public event facts lead; RSVP actions sit beside them. Creation has a live preview;
organiser tools and RSVP capacity/status visuals use actual event data.

- [Design system](docs/design/design-system.md) and [review](docs/design/design-review.md)
- [Implementation record](docs/design/implementation-plan.md) and [asset provenance](docs/design/assets.md)

Latest refinements used targeted checks only. Full suites/production builds run
only when explicitly requested; dated older counts are not fresh verification.

## Run locally

Use Node 22 and pnpm from the repository root; there is no root runner.

```sh
pnpm --dir client install --frozen-lockfile --ignore-scripts
pnpm --dir server install --frozen-lockfile --ignore-scripts
pnpm --dir client dev
# In another terminal for recommendations and image uploads:
pnpm --dir server dev
```

Open [Discover](http://127.0.0.1:5173/discover). Use team-provided `.env.example`
settings for live Supabase/R2. Without client keys, core demo flows use localStorage;
`VITE_USE_MOCK=true` forces demo. No privileged key belongs in a browser variable.
Server scripts load `server/.env`; Express health defaults to port 3000.

The detailed disclosure below is dated authorship history, not the current test or
deployment status. Use the timeline for the latest verified checkpoint and remaining
limits. Keep the disclosure and library credits in submission/presentation materials.

## AI assistance disclosure

Codex generated the agent setup and project-context documentation, configured
Graphify, and indexed the supplied resources. This disclosure covers repository
setup assistance; it does not establish the authorship of pre-existing application
code. Keep this section current and carry it into the final submission README
required by the project briefing (p. 12, FAQ 20).

Codex also reviewed environment configuration without recording credential values,
indexed the team's live Project Info document, and drafted the Feature 4
implementation plan. This was documentation and planning assistance; it did not
implement Feature 4 or verify the hosted backend.

At Denzel's request, Codex selectively copied Timothy's Supabase initializer,
configuration, initial SQL migration, and env examples from commit
`575e20dcbcfefb2f9e4f43543d5213b04a09f0ab`, added the corresponding client SDK
dependency, and revised the integration plan. The copied code remains Timothy's
contribution; no branch merge or database migration was performed. The client SDK
is [Supabase JavaScript](https://github.com/supabase/supabase-js).

On 16 October 2026 Denzel reported updated course guidance permitting full
agentic coding and explicitly authorised this first Feature 4 iteration. This
records the user's permission; it is not independent written faculty
verification. Codex authored the Feature 4 demo data/helper logic, seed extension,
organiser workspace and task/announcement/budget/weather components, public
announcement integration, venue display changes, routing integration, unit and
Playwright tests, dependency/test configuration, and accompanying documentation.
These parts relied on AI implementation and require team review and ownership
before submission. Existing application code and Timothy's imported SDK/schema
retain their prior provenance. This iteration does not implement hosted auth,
Supabase persistence, R2 access, or database migrations.

For the authorised second iteration on 16 October 2026, Codex authored the task
ordering correction, coordinated public event/announcement refresh and minimal
RSVP integration, exact money display/edit helpers, tool layout and editor-focus
changes, weather presentation, shared confirmation variant, Bootstrap theme CSS,
navigation/reset/skip/focus behaviour, route document titles, event-summary heading
and disclosure semantics, new regressions and test-harness corrections, review
and handoff documentation. These additions relied on AI implementation. Teammate
business logic for discovery, RSVP/offer management, event creation, attendance,
maps/floor plans and hosted backend integration was not rewritten. Existing
contributions retain their provenance. No new dependencies were added.

Added libraries: [SortableJS](https://github.com/SortableJS/Sortable) (MIT) for
task drag and drop; [Playwright](https://github.com/microsoft/playwright)
(Apache-2.0) for browser tests. Retain these attributions in presentation materials.

On 17 October 2026, Codex reviewed Feature 4 and shared frontend boundaries using
Graphify, source inspection and isolated browser checks, and consolidated the
current guide, verification, handoff and historical Markdown. Codex authored the
review findings, suggested fixes and documentation edits; this review did not
implement those application fixes or verify hosted integration.

For the follow-up fix pass on 17 October 2026, Denzel explicitly authorised all
reviewed P2/P3 findings, including teammate-owned frontend defects. Codex
orchestrated GPT-6 Luna subagents at Medium effort to implement cancellation/retry
and focus recovery, announcement placement and RSVP accessibility, consolidated
weather reads, offer refresh, stale-search protection, final publication
validation, route reuse and page semantics, with regression tests. Codex also
performed integration review and verification and prepared portable agent,
technical and merge handoff documentation plus ignore rules. These changes relied
on AI implementation and require team review; ownership of the affected features
stays with their assigned teammates. Hosted integration remains deferred.

On 21 October 2026, Codex resolved the Gregory/`dev` merge conflicts under
Denzel’s direction. Codex authored the combined API boundary, offline Feature 4
retention, public/auth routing, effective-venue mapping, event-deletion cascade,
frontend reconciliation, test fixture and regression changes, and updated these
handoffs. Gregory’s event/RSVP adapter and Leaflet map remain Gregory’s original
contribution; Timothy’s SQL and server script remain Timothy’s contribution.
The live Feature 4 adapter and SQL migrations were subsequently deployed to the
development project. The venue switch uses a trusted NEA forecast verifier.
[Leaflet](https://github.com/Leaflet/Leaflet) (BSD-2-Clause) powers the map;
[Supabase JavaScript](https://github.com/supabase/supabase-js) (MIT) powers the
browser data adapter. Carry these attributions into presentation materials.

On 22 October 2026, Codex used the authorised server-only development key to
create and verify two test accounts, then backed up and replaced 36 duplicate
or obsolete hosted events with six distinct events split evenly between them.
The database changes were manual development-data maintenance, not an app feature
or migration. Codex also consolidated the merge, review and iteration handoffs
into the current guides under `docs/`. No passwords, privileged keys or private
event backup are included in this repository. The earlier guide versions remain
in Git history.

On 22 October 2026, Codex and GPT-6 Luna subagents prepared the live Feature 4
browser adapter, owner-scoped SQL contract, retry reconciliation and tests.
Codex later added a server-authorized NEA forecast check, one-way atomic venue
switch, atomic live event creation and RSVP retry handling with further Luna
subagents and independent review. Codex integrated and reviewed their work,
then added a privacy migration that hides organiser-only availability counts
from public callers. The five migrations and Edge Function were applied to the
hosted Bookerz development project. Local and database contract tests passed;
signed-in owner and other-user browser checks remain pending.

On 22 October 2026, Huxley used Claude Code (Opus, with Claude Haiku subagents for
per-file conflict resolution) to create `dev2` from `main`, merge `huxley`, `vivi`
and `aish` into it (PRs #3–#5), and merge `dev2` into `dev` (PR #6). Huxley confirmed
every routing and access decision. Claude Code ran builds, tests, Graphify reviews
and a signed-in browser test against the development project with two test
accounts (Huxley signed in; the agent never typed a password). Its throwaway
`[TEST]` events were deleted afterwards. It then fixed four integration bugs in
`de3978e`: the check-in dashboard count, the check-in Back links, the station's
check-in method, and the RSVP page's count refresh. It also wrote
`docs/dev2-merge-log.md` and `docs/merge-session-2026-10-22.md` (historical
logs now collated in [status](status.md)). Teammates'
business logic was not rewritten; their open issues are listed in the session
record. [vue-konva](https://github.com/konvajs/vue-konva) (MIT),
[qrcode](https://github.com/soldair/node-qrcode) (MIT),
[html5-qrcode](https://github.com/mebjas/html5-qrcode) (Apache-2.0) and
[Papa Parse](https://github.com/mholt/PapaParse) (MIT) arrived with the merged
features. Carry these attributions into presentation materials.

Later on 22 October 2026, with Huxley's explicit approval of each plan, Claude Code
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

On 23 October 2026, at Huxley's request, Claude Code completed Feature 3's remaining
items:
- the ticket barcode, using [JsBarcode](https://github.com/lindell/JsBarcode) (MIT);
- the station's name/email search;
- the attendance → interest-weight trigger (migration
  `20261023044027_attendance_interest_signal`, applied through the Supabase MCP);
- the live Playwright suite in `client/e2e-live/`.

It also fixed a Realtime race on My Ticket, and nested `<main>` landmarks on eight pages.

The attendance trigger connects Feature 3 to Aishani's recommendation weights. Huxley
chose the design (a database trigger) and asked for it to be implemented. It is
disclosed here as AI-written integration logic for Huxley to review and own. The live
test signed in with sessions Huxley created by signing in; no password was typed by the
agent.

Also on 23 October 2026, at Huxley's request and with Huxley's choices of scope, Claude
Code made Feature 6's floor plan save and display.
- It added migration `20261023051511_floor_plan_public_view`, applied through the
  Supabase MCP: participants can read the floor plan of events they can see.
- It added `client/src/utils/floorPlan.js` and the live test
  `client/e2e-live/floor-plan.spec.mjs`.
- It changed Vivienne's `client/src/editor.vue` to load and save per event, with real
  roles instead of demo buttons, a Save button and a read-only viewer.
- It added the route, the Manage event link and the viewer on the event page.

Vivienne's drawing code was kept; Vivienne should review these changes.


On 23 October 2026, at Denzel's request, Codex and parallel Codex agents diagnosed
and fixed the discovery Supabase/demo boundary and repeated auth refreshes, RSVP
action guards and demo rules, event cover upload/persistence, Express upload/port
handling, and Feature 6 programme, venue-map, actual team placement and public
finished-image flows. They added regressions, enabled the existing waitlist tests
using Node's runner, and reviewed the changes independently. The user manually
signed in for live tests; no passwords were typed by agents. With explicit user
approval, Codex applied the cover/venue-cleanup migration to the development
project after PostgreSQL verification. The user configured R2 CORS. Verification
uses disposable test records/files and reports limits in
[`status.md#23-october--fixes-and-live-verification`](status.md#23-october--fixes-and-live-verification). Existing ranking, drawing and
waitlist-scoring algorithms retain their teammates' authorship. No new libraries
were added; retain the existing library attributions above.

In the subsequent navigation follow-up on 23 October, Codex removed the obsolete
Events placeholder/tab at the user's request, consolidated browsing on Discover,
preserved legacy `/events` links through a redirect and public access, and updated
navigation regressions/documentation. The shared shell's structure/theme and
event-detail/RSVP routes were retained.

On 23 October 2026, at Denzel's explicit request, Codex added
[Lenis](https://github.com/darkroomengineering/lenis) (MIT),
[Motion for Vue](https://motion.dev/docs/vue) (`motion-v`, MIT) and
[GSAP with ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/)
([GSAP Standard License](https://gsap.com/standard-license/)) as dependencies for
future frontend work. These libraries are installed but not activated: there are
no new UI animations or scrolling changes. Codex updated the pnpm lockfile and
tooling documentation. Carry these library attributions into presentation
materials when used. See [frontend motion tools](decisions.md#frontend-motion).

Later on 23 October, Denzel explicitly authorised the full frontend redesign based
on the supplied Bookedz ideation spec. Codex and GPT-6 Luna agents at medium effort
authored the new shared visual system, navigation/typography, participant and
organiser layouts, attendance/ticket/venue workspaces, map-first SVG discovery,
map data pagination/active-venue coordinates, marker clustering and previews,
motion integration, design artifacts and regressions. Existing ranking, RSVP,
waitlist, attendance, drawing and backend contributions retain their original
authorship. The redesign needs team review and ownership before submission.
[Natural Earth](https://www.naturalearthdata.com/) supplies the public-domain
generalised Singapore coastline; the map illustration and brand vectors are
AI-authored. [Bricolage Grotesque](https://github.com/google/fonts/tree/main/ofl/bricolagegrotesque)
is self-hosted under the SIL Open Font License, included beside the font. The
previously installed Lenis, Motion for Vue and GSAP/ScrollTrigger are now used;
retain their licences/attributions above. See [design artifacts](docs/design/design-system.md)
and [asset provenance](docs/design/assets.md). No new runtime packages, backend
schema changes or hosted writes were added during the redesign.


On 23 October 2026, at Denzel's request, Codex consolidated the project handoffs,
merge/fix reports, local historical plans and duplicated package setup notes into
the decision register, status timeline and testing guide. It preserved supplied
resources and the detailed authorship/library record, updated contributor links,
and did not change application behaviour or hosted services in this docs pass.


On 24 October 2026, Denzel supplied a new immersive frontend brief. Codex and GPT-6
Luna medium agents refined the hero, event imagery/cards, hosting navigation and
organiser/create-event presentation while preserving existing business contracts.
Codex used the built-in imagegen editor to remove baked pins, labels and counts
from the supplied Singapore illustration, preserving the original. The optimised
clean artwork initially served a decorative hero beside the independent live
map. That intermediate arrangement is superseded by the shared illustrated map
and latest replacement plate described below. Codex authored new SVG category art/cloud/boat accents, scoped motion,
recommendation-failure presentation, focused tests and documentation. DM Sans is
self-hosted under the SIL Open Font License, included beside the font. See
[asset provenance](docs/design/assets.md) for the exact edit prompt and paths.
This pass used targeted checks only; the production build/full suite await user
instruction. Existing library credits and teammate authorship above still apply.


Later on 24 October, at Denzel's correction, Codex replaced the interactive
map's old SVG terrain with the supplied cleaned illustration itself. It retained
live event markers/clusters and pan/zoom/previews, added documented approximate
regional registration, and preserved exact venue information in event details.
See [calibration and provenance](docs/design/assets.md#interactive-illustration-registration-later-24-october-correction).
The former decorative-only split is superseded. Only targeted map checks ran.


At Denzel's subsequent 24 October request, Codex adopted the replacement
**Singapore Island Illustrated Map.png** across discovery. The built-in imagegen
editor prepared its background for independent motion; Codex authored SVG Flyer,
boat and seabird layers, pause/visibility handling, playful marker feedback and
spring previews. Real event coordinates still drive approximate regional markers.
The source, edited WebP, final prompt and animation limits are documented in
[asset provenance](docs/design/assets.md#replacement-island-and-independent-animation-layers-24-october).
No new library or teammate authorship changes are introduced.

For Denzel's subsequent 24 October navigation/search refinement, Codex installed
and applied UI/UX Pro Max, Hallmark and Vercel Web Interface Guidelines as local
agent tools. Codex refined shared typography/colour tokens, frosted navigation,
session-dependent links, integrated discovery search and image-edge feathering.
A GPT-6 Luna medium read-only review helped identify a pending-search issue;
Codex corrected it and added focused checks. No runtime library was added.
[Design review and validation limits](docs/design/design-review.md) document the
actual scope, Hallmark's remaining heuristics and unavailable browser renderer.


During the later 24 October motion/workspace refinement, Codex implemented the
system-aware theme preference, collapsible categories, view transitions, additional
map layers, ticket-like CTAs and participant information hierarchy/status controls.
GPT-6 Luna medium agents refined Create Event, the RSVP presentation, organiser
operations and registration tables; Codex integrated and reviewed them, preserved
existing business contracts and ran only focused checks. Documentation was updated
to distinguish current behaviour from historical design/testing checkpoints.


On 24 October, Denzel authorised committing/pushing the accumulated project
progress to `origin/dev` and preparing a shared feature-design baseline. Codex
authored `design-branches.md`, audited publication ignore rules/assets, and
prepared backup-first, owner-scoped branch replacement instructions. This does
not reset teammates' branches or create/merge their PRs; those steps remain with
each owner and Denzel. Private source resources and local credentials/tools remain
excluded; deployable art/fonts/licences and design documentation are included.

On 25 October 2026, at Gregory's request worked with Claude Code (Anthropic Claude Opus 5.5)
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


On 26 October 2026, Gregory committed follow up with edited by claude.

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
