# Iteration 1 checkpoint

Completed 16 October 2026. This is historical; use the [current Feature 4 guide](feature4.md)
for setup, behaviour, API contracts and backend integration.

Delivered the event-specific organiser workspace, task CRUD/dragging/keyboard
alternatives, manual and public announcements, exact-cent budget tracking,
real weather reads and a confirmed one-way backup switch with an automatic post.
The implementation uses the asynchronous localStorage demo boundary; hosted auth,
Supabase persistence and R2 integration were deferred.

Added SortableJS 1.15.7 and Playwright 1.64.1. Existing dependency versions and npm
lockfiles were preserved. Timeout and invalid-coordinate fixes followed review.

| Check at this checkpoint | Result |
| --- | --- |
| Feature 4 Node tests | 21 passed |
| Chromium tests | 20 passed; 22.6 seconds |
| Production build | Passed; 115 modules |
| Responsive coverage | Tasks/budget/weather at 375, 575, 768 and 1280px |

These are original checkpoint counts, not the latest suite. [Iteration 2](iteration2-implementation.md)
subsequently fixed ordering/public refresh and refined shared presentation.
[Verification](testing.md) records the latest run and limitations.

Codex authored this iteration under Denzel's reported updated course permission;
see the detailed [AI disclosure](../README.md#ai-assistance-disclosure).
No hosted writes, migrations, env changes, branches, commits or pushes formed
part of this implementation. Local evidence was under `/tmp/bookedz-iteration1/`.
