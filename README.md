# Bookedz — WAD2 project

Vue 3/Vite/Bootstrap frontend and optional Express health scaffold for SMU IS216.
Feature 4 provides organiser tasks, public announcements, SGD budgets and a
weather-assisted backup switch. Event/RSVP and organiser persistence currently
use browser localStorage with demo identities; hosted auth/data are deferred.

## Run locally

Use Node 22 and pnpm from the repository root; there is no root package runner.
The pnpm lockfile is authoritative; retain existing npm lockfiles.

```sh
pnpm --dir client install --frozen-lockfile --ignore-scripts
pnpm --dir client dev
```

Open [My events](http://127.0.0.1:5173/organiser/events), then **Manage event**.
No env credentials are needed for the demo. Optional server, in another terminal:

```sh
pnpm --dir server install
pnpm --dir server dev
```

The server exposes [health](http://127.0.0.1:3000/health) only. Live integration
uses team-supplied `.env.example` settings; keep server keys out of `VITE_` values.
Current server scripts do not load `.env` or connect to cloud services. Imported
`supabase/` configuration/migration is source, not deployment proof.

## Verify and navigate

```sh
pnpm --dir client build
pnpm --dir client test:unit
pnpm --dir client exec playwright install chromium
pnpm --dir client test:e2e
```

Latest checks, 17 October 2026: **27 Node tests, 50 Chromium tests and build passed**.
Browser tests isolate localStorage and control weather/time. The waitlist Vitest
spec is unconfigured/excluded; neither package has a lint script. Hosted behaviour
and live external-service availability remain unverified.

- [Feature 4 guide](docs/feature4.md): behaviour, architecture and API/backend contracts.
- [Verification](docs/testing.md): coverage, results and host-specific pnpm workaround.
- [Branch handoff](docs/handoff.md): progress, merge coordination and remaining integration.
- [Review fixes](docs/review-fixes.md): implemented behaviour and integration notes.
- [Final review](docs/reviews/2026-10-17-final-review.md): independent assessment and limits.
- [Teammate handoff](docs/iteration2-teammate-handoff.md): ownership and integration decisions.
- [Iteration 1](docs/feature4-iteration1.md) / [iteration 2](docs/iteration2-implementation.md): concise history.

Portable agent/technical handoffs are included in `AGENTS.md` and `docs/`.
Original course resources, private planning/host notes, generated graphs and
installed agent tooling remain local and ignored by Git.

## AI assistance disclosure

Codex generated the agent setup and project-context documentation, configured
Graphify, and indexed the supplied resources. This disclosure covers repository
setup assistance; it does not establish the authorship of pre-existing application
code. Keep this section current and carry it into the final submission README
required by the project briefing (p. 12, FAQ 20).

Codex also reviewed environment configuration without recording credential values,
indexed the team's live Project Info document, and drafted the Feature 4
implementation plan. This was documentation and planning assistance; it did not
implement Feature 4 or verify the hosted backend.

At Denzel's request, Codex selectively copied Timothy's Supabase initializer,
configuration, initial SQL migration, and env examples from commit
`575e20dcbcfefb2f9e4f43543d5213b04a09f0ab`, added the corresponding client SDK
dependency, and revised the integration plan. The copied code remains Timothy's
contribution; no branch merge or database migration was performed. The client SDK
is [Supabase JavaScript](https://github.com/supabase/supabase-js).

On 16 October 2026 Denzel reported updated course guidance permitting full
agentic coding and explicitly authorised this first Feature 4 iteration. This
records the user's permission; it is not independent written faculty
verification. Codex authored the Feature 4 demo data/helper logic, seed extension,
organiser workspace and task/announcement/budget/weather components, public
announcement integration, venue display changes, routing integration, unit and
Playwright tests, dependency/test configuration, and accompanying documentation.
These parts relied on AI implementation and require team review and ownership
before submission. Existing application code and Timothy's imported SDK/schema
retain their prior provenance. This iteration does not implement hosted auth,
Supabase persistence, R2 access, or database migrations.

For the authorised second iteration on 16 October 2026, Codex authored the task
ordering correction, coordinated public event/announcement refresh and minimal
RSVP integration, exact money display/edit helpers, tool layout and editor-focus
changes, weather presentation, shared confirmation variant, Bootstrap theme CSS,
navigation/reset/skip/focus behaviour, route document titles, event-summary heading
and disclosure semantics, new regressions and test-harness corrections, review
and handoff documentation. These additions relied on AI implementation. Teammate
business logic for discovery, RSVP/offer management, event creation, attendance,
maps/floor plans and hosted backend integration was not rewritten. Existing
contributions retain their provenance. No new dependencies were added.

Added libraries: [SortableJS](https://github.com/SortableJS/Sortable) (MIT) for
task drag and drop; [Playwright](https://github.com/microsoft/playwright)
(Apache-2.0) for browser tests. Retain these attributions in presentation materials.

On 17 October 2026, Codex reviewed Feature 4 and shared frontend boundaries using
Graphify, source inspection and isolated browser checks, and consolidated the
current guide, verification, handoff and historical Markdown. Codex authored the
review findings, suggested fixes and documentation edits; this review did not
implement those application fixes or verify hosted integration.

For the follow-up fix pass on 17 October 2026, Denzel explicitly authorised all
reviewed P2/P3 findings, including teammate-owned frontend defects. Codex
orchestrated GPT-6 Luna subagents at Medium effort to implement cancellation/retry
and focus recovery, announcement placement and RSVP accessibility, consolidated
weather reads, offer refresh, stale-search protection, final publication
validation, route reuse and page semantics, with regression tests. Codex also
performed integration review and verification and prepared portable agent,
technical and merge handoff documentation plus ignore rules. These changes relied
on AI implementation and require team review; ownership of the affected features
stays with their assigned teammates. Hosted integration remains deferred.
