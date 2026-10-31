# Frontend redesign implementation record

Current working-tree delivery, 24 October 2026. Preserve Vue 3 Composition API,
JavaScript, Router, Bootstrap 5, existing API/demo/live contracts and teammate
ownership. No release, Git or cloud operation is implied by these changes.

## Delivered

- [x] Read supplied ideation/resources and preserve originals.
- [x] Apply shared typography, semantic colour tokens, responsive shell and focus.
- [x] Refresh participant, organiser, attendance and venue presentation.
- [x] Replace both discovery illustrations with the latest supplied island plate.
- [x] Keep real-coordinate map markers/clusters, approximate registration and List fallback.
- [x] Add independently animated wheel/cabins, one-way boats, birds and sparse plane.
- [x] Integrate search with hero copy; disclose categories and other filters on demand.
- [x] Preserve pending search during interruptible Island/Map/List transitions.
- [x] Add System/Light/Dark preference with persistence and system-change handling.
- [x] Refine event CTAs, public event information hierarchy and My RSVPs/status controls.
- [x] Make creation a progressive studio with live draft preview and step motion.
- [x] Reorganise Manage Event and all four operational panels.
- [x] Add an actual-data capacity/status visual and responsive Manage RSVP tables.
- [x] Apply requested design skills and preserve audit limitations.
- [x] Record focused verification and refresh representative captures.
- [x] Refine Vivienne's floor-plan/programme/image presentation on the `vivi`
      branch without changing live storage or organiser-role contracts.

## Verification checkpoints

| Checkpoint | Evidence | Scope |
| --- | --- | --- |
| Initial 23 October redesign | Build; 69 demo browser, 68 utility, 38 client component/data and one read-only live case passed | Historical; predates later refinements |
| Glass/search refinement | Five focused browser checks passed; two affected checks rerun after tablet adjustment | 375/575/768/1280px plus existing 1440px flow |
| Theme/motion/creation refinement | Six affected flows pass after correcting two test selectors | System preference, filters, view changes, wizard drafts, map access, RSVP submission |
| Organiser/participant follow-up | Seven scoped browser checks passed | Desktop/mobile layout, real capacity counts, task focus, exact budgets, weather failure, RSVP submission, offer refresh |
| Final capture/contrast correction | Only two affected views rerun; 2/2 passed | Loaded public form, dark badge contrast, creation preview |
| Offer-action contrast correction | Only affected participant flow rerun; 1/1 passed | Desktop/mobile contrast assertion and refreshed captures |
| Vivienne branch F6 polish | Floor-plan model tests, edited SFC compilation and whitespace checks passed | UI-only floor-plan/programme/image presentation; no live writes or browser rerun |

Changed Vue components/styles compile; whitespace checks pass. No production
build/full suite was run for the 24 October refinements. No fresh live writes,
physical camera/GPS or Safari/iOS claim is made. Screenshot events are demo fixtures.

See [design system](design-system.md), [review](design-review.md),
[assets](assets.md), [testing](../testing.md) and [timeline](../../status.md).
