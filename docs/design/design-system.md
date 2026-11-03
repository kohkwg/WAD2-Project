# Bookedz visual system

Current working-tree direction, 24 October 2026, with the Hawker Glow tokens and
OneMap discovery adopted on 3 November 2026. Denzel authorised the original redesign
and subsequent motion/layout refinements. This document describes presentation;
backend, registration, weather and privacy contracts remain in [decisions](../../decisions.md).

## Visual direction and tokens

An illustrated Singapore field guide, with quiet controls and more structured
organiser tools. Bricolage Grotesque supplies headings/wordmark; DM Sans supplies
body text, navigation and forms. Both are self-hosted with adjacent OFL licences.
Page headings share one responsive scale; the landing display headline remains
a separate promotional role.
Shared colour, control, shadow and motion tokens live in `client/src/assets/main.css`.

Typography roles (2 November update) also live in that stylesheet. Use the shared
classes and remove conflicting scoped font declarations, including mobile rules;
keep component spacing and layout local. Do not use `!important` to force the scale.

| Role/class | Size at 16px root | Weight |
| --- | --- | --- |
| `.page-title` | 32–48px responsive | 700 |
| `.section-title` | 22–28px responsive | 650 |
| `.event-title` | 20px | 650 |
| `.event-title.event-title--featured` | 22–28px responsive | 650 |
| Body | 16px, line height 1.6 | Inherited body weight |
| `.text-meta` | 14px, line height 1.5 | Inherited |
| `.text-caption` | 12px, line height 1.5 | Inherited |
| `.btn` / `.event-cta` | 14px | 600 |

Discover, My RSVPs and My events share page/section/card roles, including their
child cards and recommendation containers. Profile and Community also use the
shared page-title class. Decorative date/count numerals retain their own roles.

| Role | Light | Dark |
| --- | --- | --- |
| Page background | #fff8f1 | #1c1917 |
| Cards and surfaces | #ffffff | #292524 |
| Text and outlines | #1f2937 | #fafaf9 |
| Muted text | #636975 | #a8a29e |
| Orange actions/steps/stars | #ff6b35 | #ff8a5b |
| Orange text and links | #9a3412 | #ffb79a |
| Soft peach | #ffe4d6 | #4a2b1f |
| Soft mango | #fde7b0 | #5b4210 |
| Teal | #14b8a6 | #2dd4bf |
| Pink | #ec4899 | #f472b6 |
| Borders | #e9ded3 | #57534e |

Primary buttons and ticket CTAs use the bright fill with dark `--bookedz-on-fill`
text (5.2:1 light, 7.5:1 dark); small white text never sits on orange, teal or
mango. Every button rests on a soft shadow (orange glow for primary, neutral for
others) that deepens with a 1px lift on hover and settles on press; reduced motion
drops the lift. Controls use 14px radii and cards 20px. Motion tokens: 100ms
feedback, 160ms quick, 240ms standard, 250ms slip, 420ms reveal, soft ease-out and
a stamp ease reserved for one-off feedback. Pages no longer override
`.btn-primary` locally. Visible focus, text status labels, balanced headings and
wrapping user content take precedence over decoration. Exact cents, attendance
figures and waitlist rankings retain their existing meaning.

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

## Discovery and OneMap

3 November update: Discover is now list-only. Map navigation, its interactive
panel, selection controls and map-specific background fetching are removed.
Timeline titles navigate directly to event details. Old `view=map` URLs are
normalised to List while preserving filters. The decorative landing illustration
and normal Leaflet/OneMap venue selection are retained. The illustrated-map
implementation notes below describe the earlier design and retained source assets.

Island view leads with headline, description and search in one copy column.
Category/date/availability/sort choices appear inside the Filters disclosure;
active choices are reflected in its count. Pending typed text is flushed before
switching views. Below 992px, copy/search and artwork stack.

Discover’s Map view (`EventMap.vue`) is Leaflet with OneMap tiles: Default in light
theme, Night in dark, switched live through `lib/onemapTiles.js`. OneMap/SLA
attribution is always shown. Pins use each venue’s real coordinates; events without
valid Singapore coordinates remain in the list and are counted. Pins pair a category
colour with a letter, “Picked for you” pins are orange stars, and nearby or
overlapping pins merge into a count bubble (starred when it contains a pick), so no
44px hit area covers another. Clusters zoom apart; co-located events open a list.

“Near me” asks for the browser location once, recentres, and never stores or sends
it. After any visitor pan or zoom, “Search this area” narrows the result rail to the
visible bounds until cleared. The rail (beside the map on desktop, below it on
mobile) and the selected-event preview open the same event; Escape and Close return
focus to the pin. Wheel zoom only engages after the visitor clicks or focuses the
map. Neighbourhood cards are tinted pin tiles with factual counts of upcoming events
within 3 km. The island art files remain in `client/src/assets/illustrations/` but are
unused; see [asset provenance](assets.md) for their history.

Map/List changes keep interruptible native view transitions when supported, and
immediate updates under reduced motion.

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

Below 992px, a state-aware "Go to RSVP" shortcut beside the back link scrolls to
and focuses the RSVP panel without reordering the details. Yes/No answers are
native radios inside 44px choice pills, and required questions read "(required)".
Places and spots left appear once, in the event facts; the waitlist size is added
only when full. Team members see a status card; the organiser also gets Manage
RSVPs. Confirm steps focus the safe choice first, return focus when kept and move
focus to the outcome message when a card or row disappears. Offer actions stack
on phones. Multi-day events show their end date.

Event card covers on Discover, My events and the Create Event previews share one
16:9 box: uploaded photos and the fallback artwork are centre-cropped on screen to
fill it, so every card's picture is the same size. Uploaded originals are unchanged.
The event-page banner keeps its own fixed-height crop.

## Creation and organiser operations

Create Event is a four-step studio: progress indication, direction-aware step
changes, focus restoration, live draft preview and responsive layout. The progress
fill uses transforms. Existing validation, cover upload, retry/publication guards,
venue search and RSVP-question authoring are preserved. A preview is not a saved
or published event. On phones the form precedes the preview so the current step's
fields come first. Choosing a venue focuses the chosen-venue card and Change
returns to the search; venue/question boxes use theme tokens in both themes.
A typed but unadded question is added on Next, and Review says so.

Manage Event leads with event/time/active venue, then Manage RSVPs/public-event
links and grouped live check-in/QR/attendance/floor-plan links. Descriptive Tasks,
Announcements, Budget and Weather navigation shares a coherent panel hierarchy.
Tasks retain keyboard/drag controls; announcement cards remain public updates;
budget figures remain exact SGD cents; weather retains trusted, one-way switching.

Manage RSVPs shows actual confirmed/offered/available capacity and separate
pending/waitlist/closed totals. The segmented bar animates transforms when data
changes. It never generates people or simulated statuses. RSVP and waitlist tables
reflow to labelled mobile rows while preserving headers, actions and ranking.
Status tabs are muted when inactive and coral when active, with 44px targets; row
actions include the attendee's name for assistive technology.

## Motion, coverage and evidence

Lenis is limited to fine-pointer desktop wheel input outside forms, maps, editors
and dialogs. GSAP provides scoped entrances, restrained discovery parallax and
progressive section reveals; focused content completes its reveal immediately.
Motion for Vue springs map previews. CSS handles state/step/list feedback. Effects
clean up on unmount and respect reduced motion; map loops additionally have pause
and visibility controls. No custom animation engine or runtime package was added.

The design language also covers profiles/auth, organiser lists, attendance,
tickets, venue QR, floor plans and programmes. The floor-plan workspace now uses
shared heading/body fonts, theme-aware panels, actual zone/marker/placement counts,
clearer active-venue and helper-placement hierarchy, a date-led programme list and
a token-aligned public image panel. This is not a claim that every route was
retested after each refinement. Use [the review](design-review.md),
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
