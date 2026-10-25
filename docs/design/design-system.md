# Bookedz visual system

Current working-tree direction, 24 October 2026. Denzel authorised the redesign
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

Manage Event leads with event/time/active venue, then Manage RSVPs/public-event
links and grouped live check-in/QR/attendance/floor-plan links. Descriptive Tasks,
Announcements, Budget and Weather navigation shares a coherent panel hierarchy.
Tasks retain keyboard/drag controls; announcement cards remain public updates;
budget figures remain exact SGD cents; weather retains trusted, one-way switching.

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

## F1 profile and discovery refinement, 25 October

Profile uses the shared surface, action-foreground, border and focus tokens in
both themes. Details and interests are labelled fieldsets; selected interests
have a checkmark and an announced count. Saving disables editable fieldsets and
shows an explicit saving label; errors retain the draft for retry. The existing
profile persistence, postal geocoding and learned interest weights are unchanged.
Actions stack at mobile widths, with a return to Discover and an explicit demo
browsing link when profile editing is unavailable.

Discover's Island/Map/List controls have 44px minimum height and occupy a separate
row below the title at 575px and below. Hosting surfaces/borders/stamp use shared
tokens. Category lift and neighbourhood image zoom stop under reduced motion.
See [review evidence](design-review.md#f1-owner-refinement-25-october).
