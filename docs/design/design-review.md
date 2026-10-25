# Bookedz design review — 24 October 2026

Scope: shared theme, navbar, discovery hero/search, event filters and illustrated
map. This is a targeted review of existing Vue screens, not a review of every
feature's business logic or a new visual identity.

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

## F1 owner refinement, 25 October

Aishani's branch refines only Profile and Discover, with scoped CSS and existing
fonts/tokens. Profile's fixed light surface and white selected-chip text were
replaced with semantic tokens. Fieldset hierarchy, selection checks/count,
saving feedback, retry draft retention and mobile actions improve the form.
Discover receives 44px view buttons, mobile toolbar wrapping, semantic hosting
colours and reduced-motion hover handling. Shared shell/theme files are unchanged.

Targeted Chromium evidence (Node 22, isolated demo server on 5183):

- `f1-profile-design.spec.js`: two cases covering both themes at
  375/575/768/1280px, profile save failure/retry, keyboard selection, retained learned
  weights, one main, touch-target height, no overflow and no console warnings/errors.
  Selected-interest text contrast is asserted at 4.5:1 or higher.
- Existing `design-polish.spec.js --grep 'search stays'`: pending search survives
  the view change; existing responsive hero/map assertions pass.
- Profile captures: [mobile light](previews/profile-f1-mobile-light.png) and
  [desktop dark](previews/profile-f1-desktop-dark.png). These use a synthetic
  profile fixture; no hosted account was read or written.

The initial Profile colour assertion ran before theme application; explicitly
waiting for the theme attribute/CSS resolved the test timing issue. The browser
plugin had no connected browser; the existing project Playwright stack supplied
captures. macOS sandbox process/network restrictions required an approved local
server/browser run. No full suite/build, Safari/device test or live write ran.
