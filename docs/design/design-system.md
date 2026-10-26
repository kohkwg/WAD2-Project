# Bookedz visual system

Current direction through 26 October 2026, following the 24 October baseline.
Denzel authorised the redesign
and subsequent motion/layout refinements. This document describes presentation;
backend, registration, weather and privacy contracts remain in [decisions](../../decisions.md).

## Visual direction and tokens

An illustrated Singapore field guide, with quiet controls and more structured
organiser tools. Bricolage Grotesque supplies headings/wordmark; DM Sans supplies
body text, navigation and forms. Both are self-hosted with adjacent OFL licences.
Page headings use responsive scales; the discovery display headline is larger.
Shared colour, control, shadow and motion tokens live in `client/src/assets/main.css`.

| Role | Light | Dark |
| --- | --- | --- |
| Canvas | #fff8ec | #141b22 |
| Surface | #fffdfa | #1e2932 |
| Ink | #34334a | #f3eee4 |
| Supporting text | #63665e | #b7c2c5 |
| Action/accent | #aa3e2c | #ffad97 |
| Border | #e5ded2 | #3b4a54 |

Action foregrounds use `--bookedz-on-action`, rather than assuming white works in
both themes. Cards and controls have distinct radii; interactive targets are at
least 44px. Visible focus, text status labels, balanced headings and wrapping user
content take precedence over decoration. Exact cents, attendance figures and
waitlist rankings retain their existing meaning.

## Theme and shell

The navbar is a floating frosted surface with a reflection edge, limited shadow
and opaque fallback. The System/Light/Dark select defaults to the user's OS and
persists a manual choice under `bookedz-color-theme`. System changes and cross-tab
preference changes are observed. Storage failure keeps theme selection usable.
A small pre-paint script limits a light flash. Bootstrap's `data-bs-theme`, native
controls and browser theme colour follow the resolved scheme.

Discover is public. Personal RSVPs, organiser events, creation and profile links
follow the current session. Demo retains its existing built-in fixture identity;
it is not an anonymous live session. Mobile navigation closes on route changes
or Escape, returning focus to the toggle on Escape. The shell owns the only main.

## Discovery and island

Island view leads with headline, description and search in one copy column.
Category/date/availability/sort choices appear inside the Filters disclosure;
active choices are reflected in its count. Pending typed text is flushed before
switching views. Below 992px, copy/search and artwork stack.

Both hero and interactive map use `singapore-animated-plate.webp` through
`IslandArtwork.vue`; neighbourhood thumbnails share that plate. The older
`singapore-clean.webp` and Natural Earth terrain are historical references, not
the current discovery map. The replacement retains its actual place labels.

The image and live event markers share a 1200×900 coordinate system. A documented
regional warp derives positions from real venue coordinates; displayed locations
are approximate. Collision connectors retain anchors. Unknown/out-of-canvas
locations remain in List; exact venue details remain on the event page. Raster
edge masks and corner mist blend the sea into either theme without masking event
markers or shrinking their targets. Mobile map controls sit below the artwork.

Map motion is deliberately sparse: a rotating Flyer with upright cabins, one-way
speedboat travel and wake, a small ferry, two birds and an occasional plain plane.
Ships fade at route endpoints instead of reversing direction. Harbour ships,
background plane, buildings, trees and MRT remain baked into the plate. Ambient
layers pause offscreen, in hidden tabs, by the visible pause control and under
reduced motion. These are illustrations, not live transport data.

Island/Map/List changes use interruptible native view transitions when supported,
with ordinary Vue rendering and a short entrance fallback. Reduced motion uses
immediate updates. Focus/scroll targets remain intentional; no blank out-in
interlude or pinned scrolling is required.

## Participant pages and actions

Event actions use a ticket-inspired shape with a perforated divider and a small
CSS arrow. Hover/focus/pressed/disabled states remain clear; motion answers user
input and respects reduced motion. Routes and action names remain unchanged.
Status indicators are labelled, noninteractive badges with consistent SVG icons.

Public event details occupy the wider left column on desktop, with title, time,
venue and capacity before the decorative cover. RSVP forms/status occupy a compact
right column; mobile keeps details before actions. Announcements and exact venue
information remain public. Description disclosure preserves long text access.
My RSVPs uses actual status totals, date-led cards, consistent status badges and
live-only ticket links. Offer deadlines, confirmation/cancellation and refresh
cadence remain intact. List transitions reflect actual data changes.

## Creation and organiser operations

Create Event is a four-step studio: progress indication, direction-aware step
changes, focus restoration, live draft preview and responsive layout. The progress
fill uses transforms. Existing validation, cover upload, retry/publication guards,
venue search and RSVP-question authoring are preserved. A preview is not a saved
or published event.

Manage Event is the default Tasks entry inside a shared event workspace. Its
compact header retains the event title/time/active venue with secondary details
in a disclosure. A persistent desktop rail opens all operations and existing
RSVP/check-in/QR/attendance/floor-plan routes in the content area. Mobile uses a
labelled Sections disclosure with wrapping links. Navigation groups are Event
planning (prepare/update the event) and Guests & venue (manage guests and the
venue). Group headings use 16px high-contrast ink text, purpose descriptions and
clear separators; 15px navigation labels keep at least 44px hit areas. The rail
uses a wider gutter, and the desktop layout begins at Bootstrap’s 992px threshold.
Registrations manages sign-ups/approvals/waitlist; Attendance report shows actual
check-ins, with explanatory copy on both pages. Tool routes have an explicit
Back to Manage event link that restores the prior task query/tab; other F4
sections return to Tasks. Only Tasks links back to My events. Existing live-only
visibility and destination authentication/role checks remain.

My events event cards expose one management entry, **Manage event**; Registrations
inside the workspace remains the route to RSVP and waitlist operations. A
first-owner tutorial introduces the workspace in eight steps, from event context
and tasks through announcements, budget, weather, guest/venue tools and public
preview. It runs once per owner and data mode in that browser, can be replayed
from the workspace header, and changes no event data. Skip and Finish remember
dismissal/completion; blocked browser storage falls back to the loaded app session.
The tour restores the starting query, hash, scroll position and disclosure state
when it closes. Spotlight placement waits for target geometry to settle, keeps a
curtain over the target while scrolling, and accounts for the sticky navbar so
the highlighted control remains visible beneath it.

Workspace navigation preserves scroll when switching tools for the same event;
leaving the workspace resets normally. On mobile, closing the Sections disclosure
can still shorten the page and naturally clamp its scroll position.

Tasks default to one flat Open list, with In progress shown on individual rows.
Open/Completed/All filters and title/notes search use URL query state. Add task
opens a compact composer on intent; collapsed composers and cached F4 views keep
drafts across workspace navigation. Completed is collapsed under All except
when search reveals matches. Empty status groups, repeated instructions and
permanent success banners are removed. Native completion, explicit progress
actions, inline edits and secondary row actions retain the three stored states.
Full-board saves still include every hidden task. Cached confirmations close and
invalidate failed retries on leaving F4; pending server operations still finish
under the existing guarded mutation contract.

Manage RSVPs shows actual confirmed/offered/available capacity and separate
pending/waitlist/closed totals. The segmented bar animates transforms when data
changes. It never generates people or simulated statuses. RSVP and waitlist tables
reflow to labelled mobile rows while preserving headers, actions and ranking.

## Motion, coverage and evidence

Lenis is limited to fine-pointer desktop wheel input outside forms, maps, editors
and dialogs. GSAP provides scoped entrances, restrained discovery parallax and
progressive section reveals; focused content completes its reveal immediately.
Motion for Vue springs map previews. CSS handles state/step/list feedback. Effects
clean up on unmount and respect reduced motion; map loops additionally have pause
and visibility controls. No custom animation engine or runtime package was added.

The design language also covers profiles/auth, organiser lists, attendance,
tickets, venue QR, floor plans and programmes. This is not a claim that every route
was retested after each refinement. Use [the review](design-review.md),
[testing guide](../testing.md) and [status](../../status.md) for dated evidence.
Only targeted checks run by default; full suites and production builds await
explicit user instruction. Physical camera/GPS, Safari/iOS and live write flows
remain separately verified concerns.
