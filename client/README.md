# Bookedz client

Vue 3, Vite, Bootstrap 5 and JavaScript. From this directory:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm dev
pnpm build
```

Open [My events](http://127.0.0.1:5173/organiser/events), then **Manage event** for
Feature 4. With `client/.env` configured, event creation, RSVPs, waitlists and auth use Supabase.
Without it, those flows use localStorage demo data. Feature 4 remains available
only in the demo until Timothy approves its live schema and rules. The public
event route stays open before login; database policy still limits anonymous
announcement reads. Express is optional. Reset demo data asks for
confirmation before discarding local changes and reseeding relative event dates.

```sh
pnpm test:unit
pnpm exec playwright install chromium
pnpm test:e2e
```

Install Chromium once. Browser tests force demo mode, add a weather event only
as a test fixture, and isolate storage. The ordinary demo uses Gregory’s seed list.
The separate waitlist Vitest spec is unconfigured and excluded; no lint script exists.

See the [current Feature 4 guide](../docs/feature4.md) for behaviour/API contracts,
[verification](../docs/testing.md) for results and limitations, and
[teammate handoffs](../docs/iteration2-teammate-handoff.md) for integration.
Live integration uses `.env.example` with team-supplied values; server secrets must
never use `VITE_` names. AI authorship and library attribution are in the
[root README](../README.md#ai-assistance-disclosure).
