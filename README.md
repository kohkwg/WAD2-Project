# Bookedz - WAD2 Project

Vue 3/Vite frontend and Express scaffold for the SMU IS216 group project.

## Local development

Use pnpm from each package; there is no root package runner. Keep existing npm
lockfiles intact; pnpm is authoritative for dependency changes.

Frontend, from the repository root:

```sh
pnpm --dir client install
pnpm --dir client dev
```

Open [the frontend](http://127.0.0.1:5173). The optional health-only server runs in
a separate terminal:

```sh
pnpm --dir server install
pnpm --dir server dev
```

Its [health endpoint](http://127.0.0.1:3000/health) supports the frontend's Check
Server button. Existing event/RSVP demo pages use localStorage and demo identities.
They do not yet use Supabase authentication or persistence. Feature 4 workflows
are planned and have not been implemented.

## Environment and database source

Copy each package's `.env.example` to `.env` and obtain its values from the team
when working on live integrations. Env files are ignored by Git. Keep server
secret keys and R2 credentials out of the client. Vite loads `client/.env`; the
current server scripts do not load `server/.env` or connect to cloud services.

The `supabase/` directory contains Timothy's database configuration and initial
migration. It is source for integration work, not proof that it has been applied.
Do not apply it to a shared database without coordinating with the backend owner.
The supplied connection settings use hosted services; a local Supabase/Docker
stack is optional.

## Verification

```sh
pnpm --dir client build
```

Neither package currently defines a test or lint script. The existing waitlist
spec imports Vitest, but Vitest is not configured as a dependency; it is not a
runnable test suite yet. The frontend production build passed on Node v22.22.1
using pnpm v11.17.0. No live database or storage checks have been run here.

Original course resources, local planning notes, generated graphs, and agent
tooling stay local and are excluded from Git.

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
