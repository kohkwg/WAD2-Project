# Bookedz — WAD2 project

Vue 3/Vite/Bootstrap frontend and optional Express health scaffold for SMU IS216.
Feature 4 provides organiser tasks, public announcements, SGD budgets and a
weather-assisted backup switch. Event/RSVP/auth use Supabase when the client
environment is configured. The live Feature 4 migrations and server-authorized
NEA switch function are deployed on the Bookerz development project. Signed-in
owner and other-user browser checks remain to be completed. Without client
credentials, the app uses demo data.

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
The server's `dev` and `start` scripts do not load `.env` or connect to cloud
services. The separate `test:crud` script loads `.env` for manual integration
checks. Imported `supabase/` configuration/migration is source, not deployment
proof.

## Verify and navigate

```sh
pnpm --dir client build
pnpm --dir client test:unit
pnpm --dir client exec playwright install chromium
pnpm --dir client test:e2e
```

Latest full merge checks, 22 October 2026: **seven Node test files, five NEA
rule cases, 51 Chromium tests and the production build passed**. Two development accounts signed in
through the merged app. A 22 October hosted data check found six published
events, three per test account; it was not a fresh frontend regression run.
Browser tests isolate localStorage and control weather/time. The waitlist Vitest
spec is unconfigured/excluded; neither package has a lint script. Anonymous hosted
reads and Edge Function JWT rejection were checked; signed-in Feature 4 workflows
and a successful rainy switch remain unverified.

- [`dev` merge and integration](docs/dev-merge.md): three-branch history, current
  flows, decisions, hosted-data checkpoint and remaining contracts.
- [Feature 4 guide](docs/feature4.md): detailed behaviour and API/backend mapping.
- [Verification](docs/testing.md): commands, recorded results and limits.

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

On 21 October 2026, Codex resolved the Gregory/`dev` merge conflicts under
Denzel’s direction. Codex authored the combined API boundary, offline Feature 4
retention, public/auth routing, effective-venue mapping, event-deletion cascade,
frontend reconciliation, test fixture and regression changes, and updated these
handoffs. Gregory’s event/RSVP adapter and Leaflet map remain Gregory’s original
contribution; Timothy’s SQL and server script remain Timothy’s contribution.
The live Feature 4 adapter and SQL migrations were subsequently deployed to the
development project. The venue switch uses a trusted NEA forecast verifier.
[Leaflet](https://github.com/Leaflet/Leaflet) (BSD-2-Clause) powers the map;
[Supabase JavaScript](https://github.com/supabase/supabase-js) (MIT) powers the
browser data adapter. Carry these attributions into presentation materials.

On 22 October 2026, Codex used the authorised server-only development key to
create and verify two test accounts, then backed up and replaced 36 duplicate
or obsolete hosted events with six distinct events split evenly between them.
The database changes were manual development-data maintenance, not an app feature
or migration. Codex also consolidated the merge, review and iteration handoffs
into the current guides under `docs/`. No passwords, privileged keys or private
event backup are included in this repository. The earlier guide versions remain
in Git history.

On 22 October 2026, Codex and GPT-6 Luna subagents prepared the live Feature 4
browser adapter, owner-scoped SQL contract, retry reconciliation and tests.
Codex later added a server-authorized NEA forecast check, one-way atomic venue
switch, atomic live event creation and RSVP retry handling with further Luna
subagents and independent review. Codex integrated and reviewed their work,
then added a privacy migration that hides organiser-only availability counts
from public callers. The five migrations and Edge Function were applied to the
hosted Bookerz development project. Local and database contract tests passed;
signed-in owner and other-user browser checks remain pending.

On 22 October 2026, Huxley used Claude Code (Opus, with Claude Haiku subagents for
per-file conflict resolution) to create `dev2` from `main`, merge `huxley`, `vivi`
and `aish` into it (PRs #3–#5), and merge `dev2` into `dev` (PR #6). Huxley confirmed
every routing and access decision. Claude Code ran builds, tests, Graphify reviews
and a signed-in browser test against the development project with two test
accounts (Huxley signed in; the agent never typed a password). Its throwaway
`[TEST]` events were deleted afterwards. It then fixed four integration bugs in
`de3978e`: the check-in dashboard count, the check-in Back links, the station's
check-in method, and the RSVP page's count refresh. It also wrote
`docs/dev2-merge-log.md` and `docs/merge-session-2026-10-22.md`. Teammates'
business logic was not rewritten; their open issues are listed in the session
record. [vue-konva](https://github.com/konvajs/vue-konva) (MIT),
[qrcode](https://github.com/soldair/node-qrcode) (MIT),
[html5-qrcode](https://github.com/mebjas/html5-qrcode) (Apache-2.0) and
[Papa Parse](https://github.com/mholt/PapaParse) (MIT) arrived with the merged
features. Carry these attributions into presentation materials.
