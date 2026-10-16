# Denzel branch handoff

Prepared 17 October 2026. This working tree contains two Feature 4 iterations and
the authorised review-fix pass. The branch is `denzel`; no commit, push or merge
is performed by preparing this handoff. The [verification record](testing.md) and [independent final review](reviews/2026-10-17-final-review.md)
describe the combined fix pass and its limits.

## Delivered scope

- Event-specific organiser tasks, announcements, SGD budgets and real two-hour
  weather reads with confirmed one-way backup switching and an automatic post.
- Public announcements and active venue presentation before RSVP; coordinated
  manual refresh preserves RSVP drafts and surfaces errors.
- Shared Bootstrap typography/contrast/navigation, tool layouts, keyboard access,
  confirmation, editor focus and exact-cent money display/editing.
- Review fixes cover cancellation/retry, focus lifecycle, public update placement,
  weather request duplication and the explicitly authorised creation/RSVP/search/
  route/accessibility defects. See the review's disposition for actual verification.

The [Feature 4 guide](feature4.md) describes component responsibilities, async APIs,
data shapes, money/weather rules and live mappings. [Assumptions](iteration2-teammate-handoff.md)
separate observed demo behaviour from contracts requiring teammate confirmation.
The [AI disclosure](../README.md#ai-assistance-disclosure) records generated work;
pre-existing contributions and imported backend source retain their provenance.

## Review before integrating

| Area | Review / owner coordination |
| --- | --- |
| `client/src/utils/api.js`, helpers and mock data | Shared async boundary remains demo-only. Preserve all existing RSVP exports and Feature 4 mappings; reconcile with Timothy's adapter work. |
| Event operations and `ManageEventView.vue` | Denzel's core workspace, tool state, retry/focus and forecast contracts. |
| Public RSVP and event summaries | Gregory/Aishani: feed placement, draft preservation, public details and current venue. |
| Creation, address search and RSVP management | Gregory: this pass fixes reviewed defects; it does not change ownership or scoring/cutoff policy. |
| Shared shell/components/theme/router | Huxley and page owners: retain Bootstrap conventions and consistent keyboard/responsive behaviour. |
| Package/test configuration | pnpm is authoritative. SortableJS/Playwright were added in iteration 1; preserve npm lockfiles and avoid incidental upgrades. |
| Imported Supabase source | Timothy's client/config/initial migration were selectively copied earlier; source presence is not hosted acceptance. |

Resolve merge conflicts by preserving both teammates' current contracts and the
tested behaviour described here. Run [verification](testing.md) on the combined
branch after conflict resolution; local demo tests do not establish cloud correctness.

## Remaining integration work

Hosted auth/persistence is the remaining P1 final-delivery dependency. Agree the
development project, deployed migration, real sessions and approved test records
with Timothy. Reconcile public reads, private ownership, budget limit/range,
automatic-post history, board atomicity, area settings and switch eligibility.
Reuse the existing switch transaction; handle uncertain/committed outcomes without
duplicate posts. Detailed contracts are in the current guide.

Discovery, attendance/tickets and maps/floor plans remain with their owners. Future
maps/plans must match the effective venue. Registration/offer cutoffs and
late-cancellation policy remain team decisions; frontend refresh fixes do not
approve new business rules.

## Files intended for a later commit

Share the root `AGENTS.md`, root/package READMEs, current guides, verification,
review history and this handoff. `.gitignore` permits these portable Markdown
files while retaining exclusions for `.env`, Restricted course PDFs, supplied
private orientation, local planning/host notes, generated graphs, installed agent
skills, dependencies, build output and browser reports.

No staging is part of this pass. Before a later commit/push, review `git status`,
the complete source/dependency diff and documentation, then coordinate integration
with the team. Add the eventual deployment URL/test access separately when real
hosting is ready; do not present the local demo as deployed production.
