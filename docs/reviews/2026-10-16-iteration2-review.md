# Iteration 2 review checkpoint

Reviewed 16 October 2026 before the second implementation. This is historical;
use the [17 October review](2026-10-17-feature4-review.md) for current severity and
[the iteration 2 checkpoint](../iteration2-implementation.md) for delivered fixes.

## Findings and disposition

| ID / original priority | Reproduction / impact | Status after iteration 2 |
| --- | --- | --- |
| F1 / P2 — Denzel | Create A–D, delete A/B, add E: UI orders C/E/D; reload gives C/D/E. Workspace retained stale positions | Fixed: reindex visible positions after deletion; current suite covers it. |
| F2 / P2 — Denzel/Gregory | Public Refresh announcements shows a backup-switch post beside the old active venue | Fixed: coordinated event/feed reads preserve RSVP drafts; failure retains old pair. |
| F3 / P2 — Gregory | Open My RSVPs does not discover an externally promoted offer; clock alone changes | Open at iteration 2; addressed in the later [fix pass](../review-fixes.md). |
| F4 / P2 — Gregory | Older OneMap request overwrites a newer query or repopulates a cleared search | Open at iteration 2; addressed in the later [fix pass](../review-fixes.md). |
| F5 / P2 — Gregory | Event start passes while progressing through wizard; Publish bypasses date revalidation | Open at iteration 2; addressed in the later [fix pass](../review-fixes.md). |
| F6 / P2 — Huxley/Timothy | Exposed Check Server raises an uncaught error when optional Express is absent | Fixed: diagnostic removed from product pages. |
| P3 — Denzel | Extreme accepted money value gains one cent when reopened through float formatting | Fixed: exact integer/BigInt display/edit. |
| P3 — Gregory | Reused Manage RSVPs route retains initial event ID | Open at iteration 2; route reuse addressed in the later fix pass. |

The earlier cancellation/retry question is now reproduced as R1 in the current
review. Historical findings here must not be read as newly open iteration 2 defects.

## Frontend review outcome

Measured secondary text on the original canvas at 4.342:1; task Edit left its
editor above the viewport; mobile menu stayed open; Weather navigation clipped;
headings/titles/disclosure state were inconsistent; forms preceded operational
state. Iteration 2 addressed the shared/Feature 4 items and achieved approximately
5.45:1 secondary canvas contrast. Page-specific radio groups, validation, loading,
filter semantics and wizard focus remain owner handoffs.

The chosen refinement used Bootstrap typography/variables and Tabler layout
inspiration within Vue/JavaScript. Denzel chose to continue without Superdesign
login; no remote design or upload was created. No full-template/library replacement
was proposed as an implementation requirement.

## Original evidence

The build passed with 115 modules; 21 Node and 20 Chromium tests passed (21.9s).
Forty pre-fix captures covered 375/575/768/1280px, with no seeded page overflow.
Rendered Chromium reproduced task ordering, venue/feed disagreement, missed offers,
editing focus and diagnostic failure. Isolated SFC-script execution with real Vue
reactivity and controlled lifecycle/Axios/storage supplemented the browser evidence.
Fixtures do not establish live OneMap/weather uptime or hosted behaviour.

Original evidence was under `/tmp/bookedz-iteration2/` and
`/tmp/bookedz-iteration2-{feature4,journeys,ui}.md`; temporary files may disappear.
Three independent reviewers contributed; the orchestrator verified findings.
No application code changed in that review. [Current verification](../testing.md)
records fresh results; [teammate handoffs](../iteration2-teammate-handoff.md) retain
open acceptance criteria. No hosted writes, Git integration or env changes occurred.
