# Bookedz design review

Reviews from 24–26 October 2026. The initial scope covers the shared theme, navbar,
discovery hero/search, event filters and illustrated map. Later sections cover
Feature 4 workspace navigation, tasks, motion, the owner tutorial and outstanding
UI/UX findings. These are bounded presentation reviews, not a claim of exhaustive
business-logic, hosted access-control or device verification.

## Tools applied

- [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill): installed
  locally in Codex; ran glass navigation, typography and community-colour searches.
  Glassmorphism guidance matched navigation, with contrast/focus conditions. The
  playful font results were too child-oriented and the purple community palette
  did not fit the supplied island/established brand. A narrower query supported
  DM Sans as a balanced body face. Keep local Bricolage Grotesque for display and
  DM Sans for controls/body; correct hierarchy, scale and contrast instead of
  adding fonts or adopting unrelated search results.
- [Hallmark](https://github.com/nutlope/hallmark): installed locally; audit the
  existing playful app, without dealing a new theme. Source sweep over five files
  initially reported 110 FAIL, 49 REFLEX and 10 WARN findings. After consolidation:
  **0 FAIL, 49 REFLEX, 4 WARN**. This is a source-only result, not a full Hallmark
  browser/finish certification. `--render --url` was attempted; its renderer needs
  `puppeteer-core`, which is absent. Existing Playwright supplied visual evidence;
  no second browser dependency was added to the project.
- [Vercel Web Interface Guidelines](https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines):
  installed locally and fetched the current
  [rules](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md).
  Reviewed the same scope for labels, semantic controls, focus, auth state,
  reduced motion, long content, image sizing and responsive layouts.

Skills are local agent tools; they are not runtime dependencies or build
requirements. The installed tools are now available in the local skill catalog. Their
instructions were read and applied directly during this implementation.

## Findings and corrections

| Location | Finding | Result |
| --- | --- | --- |
| `client/src/components/NavBar.vue:51` | Flat full-width chrome and nested hosting strip compete with the illustration | Floating frosted surface, reflection border, limited shadow and blur; opaque fallback and reduced-transparency override |
| `client/src/components/NavBar.vue:60` | Personal/hosting links visible to anonymous live visitors | Session-gated RSVPs, events, creation and profile; Discover/Sign in remain public. Demo uses its existing built-in user |
| `client/src/components/NavBar.vue:19` | Session lookup can race an auth event or outlive the component | Subscribe before lookup, revision guard and unsubscribe on unmount |
| `client/src/components/NavBar.vue:31` | Mobile menu needs explicit dismissal/focus return | Escape closes the menu and focuses its toggle; route changes close it |
| `client/src/components/discovery/DiscoveryHero.vue:24` | Wide detached search panel overlaps the scene's visual hierarchy | Search belongs to the copy column, before the map action; inline category rail, stacked mobile/tablet layout |
| `client/src/components/EventFilters.vue:22` | Immediate view switch can discard pending search text | Explicitly flush the debounce before leaving the hero; form submit also flushes |
| `client/src/components/EventFilters.vue:57` | Search/date/sort controls lack form metadata | Named controls, explicit autocomplete behavior and existing accessible labels |
| `client/src/assets/main.css` | Repeated raw colours and shadows drift across components | Shared semantic tokens for surfaces, forest, coral, muted text, borders, shadows and control states |
| `client/src/assets/main.css:118` | Raster sea ends in a conspicuous rectangle | Two intersecting edge masks feather only the image; corner mist integrates the hero into the canvas |
| `client/src/components/discovery/SingaporeMap.vue` | Tiny location disclaimer and opacity-only disabled controls | More readable disclaimer; disabled fill, ink and cursor states |

The artwork, SVG wheel/boat animation, coordinate registration, marker hit areas,
RSVP paths and backend adapters are preserved. Masks apply to the raster alone;
event markers stay fully visible and clickable. No invented events or statistics.

## Remaining review notes

Hallmark's 49 REFLEX findings concern its strict 4px spacing scale, including
existing Bootstrap fractions and map-control positioning. They remain reported
heuristics; this pass does not claim a clean full Hallmark certification. The four
WARNs concern pause-button wrapping, variable-length cluster labels and a false
numeric-status classification. Pause text fits the checked widths; event titles
must be allowed to wrap; registration statuses are text. A blanket nowrap rule
would damage long-title reflow.

The liquid-glass treatment is CSS frosted glass with a solid fallback; no
shader/refraction dependency is introduced. Safari, actual touch hardware and
live authentication service traffic were not retested. Auth visibility was
checked with a Navbar-only auth fixture, including session arrival/removal; all
page data remained on the demo adapter.

## Evidence

- Five focused Chromium checks passed: existing hero/map flow, reduced-motion
  mobile map/focus, mobile navigation, responsive search/draft preservation and
  anonymous/session navigation.
- Captures and overflow checks at 375, 575, 768 and 1280px. The main hero action
  fits the 1280×800 viewport. After adjusting tablet stacking, only the two
  affected layout/navigation checks were rerun: 2/2 passed.
- Vue templates/styles and shared CSS compile; whitespace check passes.
- A GPT-6 Luna medium read-only review identified the pending-search issue above;
  it was corrected and covered by the targeted browser check.
- No full suite, production build, new runtime package or deployment.

Current captures: [desktop](previews/immersive-desktop.png),
[mobile](previews/immersive-mobile.png),
[interactive map](previews/interactive-illustration-desktop.png).


## Later motion, theme and workflow review

The user accepted the direction and requested further exploration plus a clearer
information hierarchy. The current design system supersedes intermediate search
rails and the earlier right-hand public details card. Changes include:

- System-default colour scheme with persisted override and cross-tab/system updates.
- Collapsed filter categories, draft-safe view transitions, restrained one-way map
  transport and sparse birds/plane under the existing pause controls.
- Ticket-inspired event CTAs, progressive creation/live preview and consistent
  status icons, with actual-data totals and mobile card/table reflow.
- Event facts before decorative imagery, a wider public detail column and compact
  action panel; clear organiser tools and registration management links.

The subsequent Hallmark source review covered Create Event, RSVP, EventSummary and
EventFilters: **4 FAIL, 12 REFLEX, 9 WARN** after correcting real token/glyph issues.
The four remaining FAILs are gate 62 treating Vue's temporary `*-enter-from` and
`*-leave-to` classes as static hidden content. Those classes only exist during
Vue transitions; base content is visible and reduced motion removes transitions.
This framework-specific false positive is documented, not represented as a clean
automated certification. The previous zero-FAIL result belongs to its earlier
five-file audit, not the expanded application.

Six theme/motion flows passed after two test selectors were corrected to target
the native select and Bootstrap checkbox label. Seven workspace/participant checks
passed, including task focus/retry, exact budget cents, weather failure, RSVP
submission, offer refresh and actual capacity totals. A final two-view rerun passed
after fixing dark badge contrast and waiting for the public form before capture.
No full suite, production build, live write or extra browser stack was run.

Known limits remain Safari/native view-transition differences, real device feel,
physical camera/GPS and signed-in hosted write flows. Unsupported view-transition
browsers use normal rendering/entrances. Motion remains enhancement, never a
condition for data correctness or completing an action.

A final one-case public/My RSVPs check also passed after making offer actions
theme-aware; it verifies normal-text contrast of at least 4.5:1 on Confirm my spot
at desktop and mobile sizes. The latest participant captures include that fix.


## Feature 4 workspace and task list — 26 October 2026

Denzel requested fewer competing header actions, discoverable organiser tools and
a conventional to-do list. The implementation replaces Quick links with grouped
local navigation, and replaces the three-column board/status selects with a
searchable list, checkbox completion, named progress actions, inline editing and
secondary action disclosures. Existing fonts, theme tokens and API contracts stay.

The final frozen-source run passes 16 focused Chromium cases. Coverage includes
full-board saves with hidden tasks, failure/retry, ordering/reload/event isolation,
create/edit drafts, delete cancellation and keyboard focus, local section
navigation and 100 tasks at 375/575/768/1280px in light/dark with reduced motion.
The live-link visibility test uses mocked APIs; no signed-in hosted flow is claimed.
The changed SFCs compile and whitespace checks pass. No full suite/build ran.

Review fixes include keeping a checkbox at its saved state on failure, skipping
hidden Completed controls during focus restoration, preserving a visible editor
outside filters and dismissing row actions without losing confirmation focus.
A read-only GPT-6 Luna Medium review found no remaining actionable issue in these
changes. Actual touch hardware, Safari and hosted writes remain unverified.

Captures: [desktop dark](previews/f4-task-list-desktop-dark.png) and
[mobile light](previews/f4-task-list-mobile-light.png). These show demo fixtures.
The approved temporary plan is discarded; adopted behavior is recorded here and
in the design system rather than keeping a second implementation report.


## Unified event workspace — subsequent 26 October refinement

The follow-up resolves the mismatch between tab-like operations and tool links
that previously replaced the workspace. A shared route layout now retains a
compact event header and local navigation for all existing management routes.
Child pages keep their business logic/guards but avoid duplicate event headers
and return links. Mobile Sections closes after selection, with focus recovery.

Tasks now prioritise existing open work with a flat list, three filters and a
composer opened on intent. Query-backed search/filter state and cached F4 drafts
survive normal workspace navigation. Completed stays available separately;
success feedback is announced without a permanent visual band.

Review identified native confirmations remaining stale when F4 deactivated under
KeepAlive; deactivation now closes/clears them. Targeted browser checks also
identified the last-task deletion focus fallback targeting the collapsed composer;
it now targets the visible Add task trigger.

Twenty-two selected Chromium cases pass after targeted reruns; the final
mobile-menu check passes at all four course widths. Coverage includes search
typing/query restoration, cross-route drafts, task save/retry/order/isolation,
Back links, loaded RSVP content and locally mocked live-only route/QR content.
The 100-task layout case covers both themes/reduced motion at all four widths.
No full suite/build or hosted write was run. Real camera, QR rotation, hosted
authorisation and Safari remain outside this verification.

Evidence: [desktop](previews/f4-unified-desktop.png),
[mobile](previews/f4-unified-mobile.png). The earlier task-list plan remains
discarded; this section supersedes its navigation/presentation direction.


## Navigation hierarchy and wording — subsequent 26 October refinement

The Web Interface Guidelines pass responds to ambiguous group headers and the
registration/attendance distinction. Event planning and Guests & venue now have
16px ink headings, concise purpose text and visible separators. Navigation labels
are 15px with stronger active-state contrast and a wider content gutter. Event
metadata is more readable and wraps without page overflow. Registrations explains
sign-ups, approvals and waitlist; Attendance report explains actual check-ins.

Two affected navigation/visibility cases pass. Isolated demo measurements pass
all four course widths in both themes/reduced motion: group-heading contrast
11.57:1–15.01:1, 44px minimum link targets, 41px group separation, one main and no
page errors/overflow. This is targeted evidence, not full guidelines certification
or hosted backend verification. Base font families/palette and routing remain.

[Desktop](previews/f4-navigation-light.png) and
[mobile group hierarchy](previews/f4-navigation-mobile.png) show demo data.


## First-owner tutorial and outstanding audit items — 26 October 2026

The My events card now has one **Manage event** action. Registrations remains
available from the shared event workspace. The first-owner eight-step tutorial
is remembered per owner and data mode, has a Replay control, and does not write
event data. It restores the original query/hash, scroll and disclosure state.
The spotlight now stays covered while it prepares or scrolls, then reveals the
settled target; its scrolling clearance includes the sticky navbar. Same-event
workspace section navigation preserves scroll position.

The first tour positioning pass had 17 focused cases at an earlier checkpoint.
After the spotlight alignment correction, the latest source checkpoint is **12
focused tutorial Chromium cases**, including frame-by-frame regressions for
step 6 after delayed forecast insertion and step 8 beneath the navbar. Those two
new regressions failed before the correction. The latest run also covers four
widths, reduced motion, replay, owner gating, keyboard/storage fallback, browser
Back and draft/query preservation. The 17-case count is historical and is not a
fresh rerun of all 17 against the corrected source. Demo captures
[desktop](previews/f4-tutorial-desktop.png) and
[mobile](previews/f4-tutorial-mobile.png) show step 2 before the latest spotlight
fix; the target itself is unchanged, so the images document composition rather
than prove the corrected positioning.

The broader local demo audit covered 40 screen combinations at 375, 575, 768 and
1280px in light and dark themes, with no page overflow or browser page errors.
Isolated failure flows were reproduced. The following findings remain unresolved
in the current review record:

- Retry save can publish the earlier announcement snapshot while revised text
  remains in the editor.
- Selecting Edit can overwrite an unsaved announcement or expense draft.
- A failed event deletion hides all event cards and shows duplicate errors.
- In dark mode, My events has fixed white foregrounds with measured contrast of
  1.8:1, and its kicker measures 1.33:1.
- Its fixed white card-footer background also breaks dark-theme consistency.

These are known audit findings, not claims that the 40-combination layout audit
covered failure-state correctness. The isolated reproductions establish the
reported failures; this documentation update does not claim they were fixed.
