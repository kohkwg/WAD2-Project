# Bookedz client

Vue 3, Vite, Bootstrap 5 and JavaScript. From this directory:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm dev
pnpm build
```

Open [My events](http://127.0.0.1:5173/organiser/events), then **Manage event** for
Feature 4. With `client/.env` configured, event creation, RSVPs, waitlists and auth use Supabase.
Without it, those flows use localStorage demo data. Live Feature 4 adapters,
SQL migrations and an NEA-checking Edge Function are deployed to the Bookerz
development project. Signed-in browser verification is still in progress.
The public event route stays open before login; the database policy
limits anonymous announcement reads. Express is optional. Reset demo data asks for
confirmation before discarding local changes and reseeding relative event dates.

```sh
pnpm test:unit
pnpm exec playwright install chromium
pnpm test:e2e
```

Install Chromium once. Browser tests force demo mode, add a weather event only
as a test fixture, and isolate storage. The ordinary demo uses Gregory’s seed list.
The separate waitlist Vitest spec is unconfigured and excluded; no lint script exists.

See the [`dev` merge guide](../docs/dev-merge.md) for branch integration and
remaining teammate contracts, the [Feature 4 guide](../docs/feature4.md) for
behaviour/API details, and [verification](../docs/testing.md) for results and
limitations.
Live integration uses `.env.example` with team-supplied values; server secrets must
never use `VITE_` names. AI authorship and library attribution are in the
[root README](../README.md#ai-assistance-disclosure).
