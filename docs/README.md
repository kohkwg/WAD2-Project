# Bookedz documentation

Start with the current guides; iteration records describe earlier checkpoints.

| Document | Purpose |
| --- | --- |
| [Project README](../README.md) | Setup, status and detailed AI authorship disclosure |
| [Branch handoff](handoff.md) | Merge preparation, changed areas, ownership and remaining work |
| [AI tools and agent merge guide](ai-merge-guide.md) | Historical setup and merge-readiness checklist; current guides take precedence |
| [Feature 4](feature4.md) | Behaviour, component/data flow, async API and backend mapping |
| [Teammate assumptions](iteration2-teammate-handoff.md) | Current boundaries and integration acceptance |
| [Verification](testing.md) | Repeatable commands, coverage and latest results |
| [Fix-pass notes](review-fixes.md) | Changes addressing the reviewed P2/P3 findings |
| [Final review](reviews/2026-10-17-final-review.md) | Independent review and remaining limitations |
| [Original review](reviews/2026-10-17-feature4-review.md) | Severity, reproductions and later disposition |
| [Iteration 1](feature4-iteration1.md) / [iteration 2](iteration2-implementation.md) | Historical delivery checkpoints |
| [Earlier review](reviews/2026-10-16-iteration2-review.md) | Pre-fix findings and subsequent disposition |
| [Agent guide](../AGENTS.md) | Portable repository working agreements |

Feature 4 remains browser-local; event/RSVP/auth use Supabase when the browser
key is configured, otherwise the demo backend. Real
weather HTTP reads are implemented; hosted auth/database integration remains
pending. Imported Supabase source is not deployment evidence. The handoff tracks
remaining acceptance without claiming unfinished teammate features are complete.

Denzel owns organiser operations/weather; Gregory owns creation/RSVP/waitlist;
Aishani discovery/profile; Huxley attendance/shared UI; Timothy backend/auth/data;
Vivienne venues/plans/programme. The user authorised this pass to fix reviewed
frontend defects across those boundaries; ongoing feature ownership stays intact.

The official course requirements call for a responsive dynamic application,
backend data store, meaningful asynchronous public API use and core end-to-end
tests. The submitted proposal supplies team intentions. Originals and private
reference notes stay local, so these guides must remain usable without them.
Follow current faculty/team instructions for assessment, schedules and submission.
User-reported updated AI permission and precise authorship are recorded in the
public README; this documentation does not independently verify faculty guidance.
