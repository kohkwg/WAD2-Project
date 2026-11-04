# Bookedz design

The single source of truth for how Bookedz looks, reads and behaves. If the app and
this document disagree, one of them is wrong: fix the app or update this document in
the same change. Backend, registration, weather and privacy rules live in
[decisions](../../decisions.md); image and font licences live in [assets](assets.md).

This document replaces the former `design-system.md`, `design-review.md` and
`implementation-plan.md` (4 November 2026). Their dated evidence is summarised in
[section 10](#10-verification-history-and-limits).

Contents: [1 Principles](#1-principles) · [2 Visual language](#2-visual-language) ·
[3 Words](#3-words) · [4 Components](#4-components-and-patterns) ·
[5 Shell and layout](#5-shell-and-layout) · [6 Pages](#6-pages) ·
[7 Motion](#7-motion) · [8 Accessibility](#8-accessibility) ·
[9 Review checklist](#9-review-checklist) · [10 Verification](#10-verification-history-and-limits) ·
[11 Change log](#11-change-log)

## 1. Principles

These come from the team's UI/UX guide (IS211 IDP weeks 4 to 6) and apply to every screen.

1. **Start from the user's task.** Know the main goal on a screen before changing it.
   Every important choice should help someone understand, find, finish, recover or feel
   confident. Fix task blockers and harmful errors before cosmetic polish.
2. **Make the next action visible and the result obvious.** Show the current state, what
   an action will do, and whether it worked. Distinguish "working on it" from "done" and
   "failed".
3. **Recognition over recall.** Keep the information needed for a decision where the
   decision happens. Show options and current selections instead of making people remember.
4. **One word per idea.** The same thing has the same name everywhere (see [section 3](#3-words)).
5. **Design for the real device.** Most visitors are students on phones. Keep main actions
   within reach, targets at least 44px, and never rely on hover or precise taps.
6. **Hierarchy through relationships.** Group related things by proximity and shared
   regions; use the lightest grouping that works. One clear primary action per area.
7. **Colour carries meaning, never alone.** Every colour has a role; pair it with text or an
   icon for anything important.
8. **Prevent errors, then make them recoverable.** Sensible defaults, early checks, undo
   for destructive actions, and messages that say what to do next.
9. **Honest about evidence.** Inspection and automated checks show that something works.
   Only real users can show that it is understood. Say which one you have.

## 2. Visual language

**Direction:** an illustrated Singapore field guide with the Hawker Glow palette: warm
cream and charcoal surfaces, OpenJio orange for actions, quiet controls, more structured
organiser tools.

### Typography

Bricolage Grotesque for headings and the wordmark; DM Sans for body, navigation and forms.
Both are self-hosted with their OFL licences. Roles live in `client/src/assets/main.css`;
use the shared classes and don't override them in components.

| Role | Size (16px root) | Weight |
| --- | --- | --- |
| `.page-title` | 32 to 48px responsive | 700 |
| `.section-title` | 22 to 28px responsive | 650 |
| `.event-title` | 20px (featured 22 to 28px) | 650 |
| Body | 16px, line height 1.6 | 400 |
| `.text-meta` | 14px, line height 1.5 | 400 |
| `.text-caption` | 12px, line height 1.5 | 400 to 700 |
| `.btn`, `.event-cta` | 14px | 600 |

Use tabular numbers for times, counts and prices. Let titles and user content wrap.

### Colour roles

| Role | Light | Dark |
| --- | --- | --- |
| Page background | #fff8f1 | #1c1917 |
| Cards and surfaces | #ffffff | #292524 |
| Text and outlines | #1f2937 | #fafaf9 |
| Muted text | #636975 | #a8a29e |
| Orange actions | #ff6b35 | #ff8a5b |
| Orange text and links | #9a3412 | #ffb79a |
| Soft peach | #ffe4d6 | #4a2b1f |
| Soft mango | #fde7b0 | #5b4210 |
| Teal | #14b8a6 | #2dd4bf |
| Pink | #ec4899 | #f472b6 |
| Borders | #e9ded3 | #57534e |

Filled buttons use dark `--bookedz-on-fill` text (5.2:1 light, 7.5:1 dark). Small white
text never sits on orange, teal or mango.

### Category colours

One hue per category, used for the Discover chips, Create event tags, event tags and
map pins (`.cat-<name>` with `.cat-tint` in `main.css`). Tints are 20% of the hue on the
surface in light mode and 30% in dark mode, with normal text colour.

| Category | Hue | Category | Hue |
| --- | --- | --- | --- |
| Tech | #3b82f6 | Volunteering | #22c55e |
| Music | #ec4899 | Career | #8b5cf6 |
| Sports | #14b8a6 | Outdoors | #65a30d |
| Arts | #f59e0b | Gaming | #6366f1 |
| Food | #ff6b35 | Wellness | #06b6d4 |

### Shape, depth and spacing

Controls 14px radius, cards 20px, pills fully rounded. Buttons rest on a soft shadow
(orange glow for primary) that deepens with a 1px lift on hover and settles on press.
Interactive cards lift 2px on hover (`.lift-on-hover`). Spacing follows Bootstrap's scale.

## 3. Words

| Concept | Use | Don't use |
| --- | --- | --- |
| Registering for an event | **RSVP**; **Join waitlist** when full; **Request a spot** when the organiser approves each RSVP | Count me in, Register, Join, Request to join |
| Capacity | **spots**: "19 spots left", "20 spots in total", "Full" | places, seats, taken |
| Organiser's list | **Guest list** / **RSVPs** | Attendees list, registrations (in UI text) |
| Waitlist offer | "A spot opened up", "Confirm my spot" | Claim, accept offer |
| Going to an event with others | **Go together** (the feature), **group**; **Start a group**, **Join group**, **Ask to join** (host approves), **Leave group**; **Public** / **Private**; **Invite link** | Jio, meetup, squad, hangout |
| A group's plan around the event | **before and after plan**; **when you're free** | hangout, itinerary |

- **Sentence case** for headings, labels, buttons and tags. No all-caps eyebrows or
  labels.
- **Dates and times** use the Singapore style everywhere: "Sat, 7 Nov, 10:00 am – 12:00 pm"
  (`formatEventTime`), "7 Nov" for timeline dates, "1 Nov, 1:39 pm" for timestamps.
  Day before month, 12-hour times with lower-case am/pm.
- **Buttons name the result:** "Approve selected (3)", "Join waitlist", "Save changes".
  Toasts echo the action: "Saved", "Posted", "Spot confirmed".
- **Errors say what happened and what to do:** "The event has to end after it starts."
- **Sample data stays out of real labels.** No "demo" or "test" in event titles shown to users.

## 4. Components and patterns

- **Event actions** use a ticket-inspired shape with a perforated divider. Labels follow
  [section 3](#3-words). Status indicators are labelled, non-interactive badges with icons.
- **Chips** are pills, 44px tall, tinted by category; the selected chip turns ink-filled.
  A scrolling chip row fades at whichever edge has more to show.
- **Discover rows** are compact and equal height: thumbnail ("Show on map"), title,
  "time · spots · venue" on one line (cut off with "…", full text on hover and when
  selected). Clicking a row selects it; the RSVP button and extra details appear only on
  the selected row.
- **Decorative icons** (stars, ticket marks) have no border, fill or button shape, so they
  never look pressable, and are hidden from screen readers.
- **Toasts** confirm results at the bottom of the screen (above the phone tab bar) and are
  announced politely. A toast may carry one action, used for **Undo**.
- **Loading** shows skeleton shapes the size of the real content (`SkeletonList`), not a
  spinner. When filters change, keep the old results visible and dimmed until new ones arrive.
- **Empty states** explain why it's empty and offer a next step (on Discover: other
  categories to try, plus "Clear search and filters").
- **Destructive actions** either confirm with the safe choice focused first (remove a guest,
  delete an event) or give a short undo window (reject an RSVP: 5 seconds, saved when the
  window ends or the page closes). Keep them well apart from the routine action.
- **Forms** start with sensible defaults, check fields as you go, keep entered values after
  errors, and disable repeat submission while saving. Required questions say "(required)".
- **Dialogs** use Bootstrap/native behaviour: Escape closes, focus returns to the opener.

## 5. Shell and layout

- **Navigation:** sidebar on desktop, a floating frosted top bar where needed, a bottom tab
  bar on phones for signed-in and demo users. Personal links follow the session; Discover
  is public. The menu closes on route change or Escape. From 992px a **Collapse sidebar**
  button at the bottom of the sidebar turns it into a 76px icon rail (Discover, Community, My
  RSVPs, My events, Settings, Theme, account); each icon's name shows as a tooltip on hover or
  keyboard focus, and the page widens with it. The choice is saved as `bookedz-sidebar`; until
  someone chooses, it starts collapsed below 1200px and expanded above.
- **Theme:** System / Light / Dark, defaulting to the OS and saved as `bookedz-color-theme`.
  Bootstrap's `data-bs-theme`, native controls, map tiles and the browser colour follow it.
- **Breakpoints:** phones below 768px (Bootstrap md), tablets 768 to 991px, desktop 992px
  and up. Check 375, 575, 768 and 1280px with no sideways scrolling.
- **Sticky actions on phones:** fixed bars sit above the bottom tab bar
  (`--bottom-nav-h`), and pages add bottom padding so nothing hides behind them.

## 6. Pages

### Landing (`/`)
The front door, with no island map. **Signed-out visitors** see the sign-in / create account
form (with a "Browse events without signing in" link to Discover); `/login` links open this
page and keep `?redirect=` so sign-in returns to where they were going. **Signed-in people**
see an account summary: greeting and name, email, counts (going, all upcoming RSVPs, saved),
a waitlist offer if one is open, their next confirmed plan, their interests, and links to
Discover, My RSVPs and Community (plus Sign out in the live app). The demo account always
sees the summary, with a note that it is a sample account stored in this browser.

### Discover (`/discover`)
Order: search → category chips (with result count and sort) → timeline beside a OneMap
street map. **No "Picked for you" strip** (team decision, 4 November). From 768px the list
and map sit side by side with the map pinned; below 768px a **List | Map** toggle shows one
at a time, remembers the choice for the session, and returns to the same scroll position.
"Show on map" on a phone opens the map with that event selected. Old `?view=map` links
open the map on phones and keep their filters.

**Map:** OneMap Default tiles in light mode and Night tiles in dark mode, with OneMap/SLA
attribution. The map is framed like a card with its own + / − buttons. Single pins use
their category colour; "Picked for you" events are orange stars; nearby events merge into a
dark count bubble (with a small star if it contains a pick). Cluster labels name their
events for screen readers and open a list. The "background couldn't load" warning only
appears when no tiles loaded (OneMap has no tiles over the sea and Johor).

### Event page (`/events/:id/rsvp`)
Facts first (title, time, venue, spots), then the cover, description, map and
announcements; the RSVP panel sits in a right column on desktop and after the details on
phones. On phones a bar pinned above the tab bar keeps the main action ("RSVP",
"Join waitlist", "Request a spot", "See your RSVP") in reach until the RSVP panel is on
screen. The panel explains what will happen before you press (confirmed now, waitlist
with a 24-hour offer, or organiser approval). Addresses from OneMap are shown in normal case.

### My RSVPs
Waitlist offers come first, with a live countdown that shows seconds in the last hour.
Then the totals, then tabs (Upcoming, Saved, Past, Cancelled). Updates every 30 seconds
and on focus; the Refresh button stays as a fallback.

### Community: Go together (`/community`)
Community is where people find others to go to events with. **Official events live in
Discover; groups live in Community**, and neither appears in the other's lists (Discover
and My events exclude groups).

- **A group** is tied to one official event: the host's note, the event card (title, time,
  venue, category tint), who is going (avatars), spots left (2 to 8 including the host) and
  whether anyone can join or the host approves each person.
- **Public or private.** Public groups are listed in Community and on the event page. Private
  groups only open with their invite link (and stay visible to their members). Both have an
  invite link (`/g/<token>`), shown only to members, with Copy link and the phone share sheet.
- **Feed:** soonest first, with filter chips (All groups, This week, I'm going, Hosting) and a
  search over events, hosts and notes. It refreshes every 30 seconds and on focus. Cards show
  Join group and Open group; everything else is on the group page.
- **Start a group:** a dialog to pick an upcoming event, add a note, choose spots, who can join
  and Public or Private. Event pages link to it with the event already chosen
  (`/community?start=<id>`). Starting a group opens its page.
- **Group page** (`/groups/<id>`, also where invite links land): the event, who's going, Join or
  Leave (with a confirm step), the host's join requests (Accept / Decline), the invite link, the
  before and after plan and the chat. Invite visitors see "You're invited".
- **Joining** takes a spot in the group, then offers a one-tap step to RSVP to the event itself
  ("RSVP", "Join waitlist" or "Request a spot"), because the event's own capacity and approval
  rules still decide that.
- **Before and after:** a slot each side of the event, named by time of day (Lunch, Dinner…).
  Availability is when2meet style: each side is a column of 15-minute cells covering three
  hours (leaving 15 minutes to walk over). Members press and drag down "You" to paint the times
  they're free (touch works too; Space toggles one cell; All, Clear and "I can't make it" are
  shortcuts). "Group" shades each cell by how many are free; pointing at one names them. The
  slot is the longest stretch (45 minutes or more) with the most people free for all of it,
  outlined on the Group column, nearest the event on a tie. The card lists who's free then, who
  isn't and who hasn't marked anything. Until then it uses a default hour. Members suggest a spot from nearby food deals (from the Telegram and deal-site pipeline) or
  nearby places (Geoapify / OpenStreetMap), or type one; everyone marks the ideas they're
  **Keen** on; the host **Picks** one per slot. A OneMap map shows the venue (★), ideas
  (numbered) and picks (orange ✓). Deals show distance, a walk estimate and a link to the post.
  When the server isn't running, the planner says so and still takes typed places.
- **Event pages** show "Go together": the event's public groups (and private ones you're in)
  and Start a group.
- **Live mode:** groups are demo-only for now; the live app shows a "Coming soon" note until a
  Supabase migration for group comments and plans is agreed with Timothy. Food suggestions
  come from the Express server in both modes.

### Create event (organiser)
Official events only (going with others happens in Community; old `?template=hangout` links go
to `/community`). A four-step studio
(Basics, Venue, RSVP questions, Review) with a live preview. New events default to the next
whole hour for two hours; moving the start keeps the length, and an end before the start is
flagged beside the field. Back is hidden on the first step. Tags match the Discover chips.

### My events and Manage RSVPs (organiser)
My events: date-led cards, search, tabs and sort, skeleton loading, animated grid.
Manage RSVPs: the spots bar (confirmed, offers out, available) with "N left"; tabs carry
the other counts (no duplicate tiles). With more than one pending RSVP, checkboxes and
**Approve selected** handle them in bulk. Reject sits apart from Approve and has a
5-second undo.

### Manage event, check-in, floor plans, profile
Manage event leads with event, time and active venue, then RSVP and check-in links and the
Tasks / Announcements / Budget / Weather panels. Budget figures stay exact SGD cents.
Floor plans and programmes use the shared fonts and theme panels. Profile uses labelled
fieldsets, checkmarked interests and explicit saving and error states.

## 7. Motion

Tokens: 100ms feedback, 160ms quick, 240ms standard, 250ms slip, 420ms reveal; a soft
ease-out for most movement and a stamp ease only for one-off feedback.

- **Page change:** a short fade (opacity only, so sticky and fixed elements keep working).
- **Lists:** new items rise in, removed items fade, others slide into place.
- **First load and tab switches:** cards and rows rise in one after another
  (`.stagger-in`, 40ms apart, first eight only), so a page assembles rather than pops.
- **Numbers:** totals count up when they first appear (`CountUp`, My RSVPs totals and
  Manage RSVPs "N left"); values that change later give a small bump (`BumpValue`).
- **Toggles and tabs:** the List | Map pill slides between options; the My RSVPs tab
  underline grows under the chosen tab; Manage RSVPs tab panels ease in when switched.
- **Selection:** the chosen category chip pops once; the selected map pin bounces once and
  stays enlarged; pins grow slightly on hover; the selected Discover row's details and RSVP
  button ease down into place (`.reveal-down`).
- **Saving:** the bookmark icon pops when an event is saved; likes pop for the post you
  just liked.
- **Attention:** a new waitlist offer glows once (`.attention-once`), then settles.
- **Bars from the edge:** the phone RSVP bar slides up (`.slide-up-in`); the bulk approve
  bar eases in.
- **Press feedback:** buttons and chips settle slightly when pressed.
- **GSAP** handles scoped entrances and section reveals; **Lenis** smooth scrolling only for
  desktop wheel input outside forms, maps, editors and dialogs; **Motion for Vue** springs
  map previews.
- Motion answers the user or shows what changed. It never blocks an action or hides data,
  and everything turns off with `prefers-reduced-motion`.

## 8. Accessibility

- One `main` landmark (owned by the shell), a skip link, logical headings.
- Every control has a visible label or accessible name; icon-only buttons have names;
  row actions include the person's or event's name.
- Visible focus (3px orange-dark outline), logical focus order, Escape closes overlays and
  returns focus to the opener; after a row disappears, focus moves to the outcome message.
- Contrast at least 4.5:1 for text and 3:1 for control edges, in both themes.
- Targets at least 44px. Every drag or map action has a keyboard or list alternative.
- Status changes (saved, rejected, approved, offers) are announced.
- Colour is never the only signal (pins and chips have names; statuses have text).

## 9. Review checklist

Before merging UI work, check the relevant items and say what was actually verified.

**Ten heuristics:** visibility of status · match with the real world · user control and
freedom · consistency · error prevention · recognition over recall · flexibility and
efficiency · minimalist design · error recovery · help near the point of need.

**Walkthrough** each changed task, step by step: would the user want this action, can they
see it, would they recognise it, and would they understand the result?

**Completion check:**
- The task has a discoverable next action and clear feedback.
- Words, grouping, type and colour follow this document.
- Works at 375, 575, 768 and 1280px, light and dark, keyboard only, reduced motion.
- Empty, loading, error and success states are usable.
- The handoff states what changed, what was verified (and how), and what needs real users.

Run only the targeted checks for what changed (team testing preference); full suites and
production builds need an explicit request. See [testing](../testing.md) for commands. Run
browser tests against a demo server you own (the team uses port 5187 with a temporary
config), never against someone's live dev server.

## 10. Verification history and limits

| Date | Checkpoint | Evidence |
| --- | --- | --- |
| 23 Oct | Project-wide redesign (Denzel's ideation spec) | Build; 69 demo browser, 68 utility, 38 component cases and one read-only live case |
| 24 Oct | Glass navigation, search, theme, motion, creation studio, organiser and participant refinements | Focused Chromium checks at 375/575/768/1280px; contrast fixes for badges and offer actions |
| 24 Oct | Design skill reviews (UI/UX Pro Max, Hallmark, Vercel Web Interface Guidelines) | Hallmark source audit 0 FAIL on the first five files; later 4 FAIL are Vue transition-class false positives |
| 25 Oct | Profile and Discover owner refinement (Aishani) | `f1-profile-design.spec.js` in both themes at four widths |
| 3 Nov | Map beside timeline, Hawker Glow tokens, OneMap street map | Discover workspace, state and browse unit tests; manual check at four widths |
| 4 Nov | Site polish, responsive UI, Gregory's Discover cleanup, design consistency pass | Targeted unit tests and Discover/RSVP/organiser browser specs; remaining failures pre-date these changes |

**Known limits:** Safari and real iOS devices, physical camera and GPS, native view
transitions in unsupported browsers, and signed-in hosted write flows are verified
separately or not at all. About 18 browser and 4 unit tests failed on `dev` before the
4 November work and still need fixing. No real-user testing has been done yet.

## 11. Change log

- **4 Nov 2026:** Collapsible sidebar (icon rail with tooltips, remembered). Go together
  pages got more motion and live updates: painted cells pop, the group heatmap and best
  outline ease, slot times and picks fade in, Keen counts and filter counts bump, members
  and chat messages slide in, map pins drop in, and the group page refreshes every 20 seconds
  (chat every 15) and on focus. All of it is off with reduced motion.
- **4 Nov 2026:** Stopped calling groups "hangouts" in code: a group is stored as `kind: 'group'`
  with a `group` field (visibility, invite link, event). Retired planner styles were removed.
- **4 Nov 2026:** Members paint when they're free before and after the event on a
  when2meet-style grid; each slot is the best shared stretch. Map pins keep fixed colours so they show in the dark theme.
- **4 Nov 2026:** Community became **Go together**: groups (no longer "jios") with public or
  private visibility and invite links, a page per group, and a before and after food planner
  with nearby deals and places. The old hangout planner (find a time, itinerary, On the day)
  was removed from the app; `/community/plan` and `/j/<token>` redirect.
- **4 Nov 2026:** The landing page replaced its animated island map with sign-in for visitors
  and an account summary for signed-in people; `/login` now redirects to it.
- **4 Nov 2026:** Community became the open jio hub: jios tied to one event, Start a jio,
  join then RSVP prompt, jio chat, filters and search. The hangout planner moved from Create
  event to Community (`/community/plan`). Discover and My events list official events only.
  Event pages show "Go with others". Text posts were removed.
- **4 Nov 2026:** Combined all design documents into this file. Decisions: no "Picked for
  you" strip on Discover; category-coloured pins with orange stars for picks; "RSVP" and
  "spots" as standard words; sentence case; one date style. Added bulk approve and reject
  undo, Create event default times and end-time check, phone sticky RSVP bar, Discover empty
  state suggestions, matching Create event tags.
- **4 Nov 2026:** Phone List | Map toggle, Night tiles, compact Discover rows (Gregory),
  toasts, skeletons, page fades, live offer countdown, Community event tags.
- **3 Nov 2026:** Map beside timeline (Aishani), Hawker Glow tokens, typography roles.
- **24 Oct 2026:** Immersive island landing, glass navigation, creation studio, design skill
  reviews.
- **23 Oct 2026:** Project-wide redesign authorised by Denzel.
