# Agent guide

## Start and scope

Read [docs/README.md](docs/README.md), the
[`dev` merge guide](docs/dev-merge.md), [Feature 4](docs/feature4.md) and
[verification](docs/testing.md) before editing. They describe the merged branch,
observed demo behaviour, assumptions and integration gaps. The original assessment PDFs and
local reference notes are not distributed with application code.

This is Bookedz, the SMU IS216 Web Application Development 2 group project.
Denzel owns Feature 4: organiser tasks, announcements, budgets and weather backup
venue switching. Respect teammates' areas: Aishani (discovery/profile), Gregory
(event creation/RSVP/waitlist), Huxley (attendance/shared UI), Timothy (backend/auth/
database/infrastructure), Vivienne (venues/floor plans/programme).

Denzel reported updated course permission for full agentic coding on 16 October
2026, then authorised fixes to all reviewed P2/P3 frontend findings on 17 October.
This is user-reported guidance, not independent faculty verification. Keep the
public README's detailed AI authorship disclosure and library attribution current.

## Repository and contracts

- `client/`: Vue 3 Composition API, JavaScript ES modules, Vue Router, Bootstrap 5,
  Axios and Vite. Keep templates and the established CSS/theme.
- `client/src/utils/api.js`: asynchronous boundary selecting localStorage demo or
  browser Supabase for event/RSVP/auth and Feature 4 calls. Preserve callers'
  observable success/error behaviour in both adapters.
- `client/src/components/event-operations/`: focused task/post/budget/weather tools.
- `client/e2e/`: isolated Playwright tests. `client/src/utils/__tests__/feature4*.test.js`
  are Node built-in tests. The separate waitlist Vitest spec is unconfigured.
- `server/`: Express 5/CommonJS, health-only; `test:crud` is a separate manual
  check. `supabase/` contains the imported initial SQL and five later migrations
  deployed to the Bookerz development project on 22 October 2026, plus the
  deployed `venue-switch` Edge Function. Verify hosted history before later SQL edits.

Keep demo and live claims explicit. Feature 4 uses user-scoped browser Supabase
SDK/RPC through the async interface; its one-way venue switch uses a server-side
NEA check and a service-role-only transaction. Do not add parallel Express CRUD,
administrative keys in the browser or silent demo fallbacks. Signed-in owner and
other-user hosted write flows remain to be verified before release.

## Working agreements

- Run `git status --short` before edits; preserve existing/untracked work. Do not
  reset, clean or overwrite other contributions.
- Do not commit, push, create branches, merge, deploy or mutate hosted services
  unless the user explicitly asks. A handoff-ready working tree is not a commit.
- Use pnpm; preserve npm lockfiles. Do not upgrade dependencies or add libraries,
  infrastructure, TypeScript, Tailwind, Pinia, JSX or SSR incidentally.
- Keep secrets/personal data out of code, docs and logs. Only placeholders belong
  in `.env.example`; privileged keys must never use browser `VITE_` names.
- Preserve the imported initial SQL. Coordinate later migrations with its owner.
- Use props down/events up, stable IDs, computed display state and guarded async
  lifecycle/route changes. Maintain keyboard access, focus and responsive reflow.
- Update technical docs, assumptions, verification and disclosure when behaviour
  changes. Attribute public libraries in code and presentation materials.

## Commands

Use Node 22 and run from the repository root:

```sh
pnpm --dir client install --frozen-lockfile --ignore-scripts
pnpm --dir client dev
pnpm --dir client build
pnpm --dir client test:unit
pnpm --dir client exec playwright install chromium
pnpm --dir client test:e2e
```

Vite runs at `http://127.0.0.1:5173`; Playwright starts/reuses it and isolates storage.
The optional server uses `pnpm --dir server install` then `pnpm --dir server dev`;
check `http://127.0.0.1:3000/health`. Its scripts do not load `.env` automatically.
There is no root runner or lint script. The server's `test:crud` command is a
manual integration check requiring configured development services. See
[verification](docs/testing.md) for limits; never claim the legacy Vitest spec passes.

For frontend changes, run relevant regressions and the production build; exercise
changed UI, keyboard, failure/retry and mobile flows. For docs, check paths,
anchors and whitespace. Report actual outcomes and unavailable checks.

## Optional local tools

When a local `graphify-out/graph.json` and Graphify CLI exist, query the graph before
source searching, verify facts in the located source, and run `graphify update .`
after code changes. AST updates do not semantically refresh changed prose. Keep
Restricted PDFs, generated graphs and installed agent skills local/ignored.
Do not require those private files or tools for a normal clone to build or test.
