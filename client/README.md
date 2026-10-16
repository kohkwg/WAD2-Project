# Bookedz client

Vue 3, Vite, Bootstrap 5 and JavaScript. From this directory:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm dev
pnpm build
```

Open [My events](http://127.0.0.1:5173/organiser/events), then **Manage event** for
Feature 4. The demo uses localStorage and fixed identities; Supabase auth/cloud
persistence are deferred. Express is optional. Reset demo data asks for
confirmation before discarding local changes and reseeding relative event dates.

```sh
pnpm test:unit
pnpm exec playwright install chromium
pnpm test:e2e
```

Install Chromium once. Browser tests start/reuse Vite and isolate demo data.
The separate waitlist Vitest spec is unconfigured and excluded; no lint script exists.

See the [current Feature 4 guide](../docs/feature4.md) for behaviour/API contracts,
[verification](../docs/testing.md) for results and limitations, and
[teammate handoffs](../docs/iteration2-teammate-handoff.md) for integration.
Live integration uses `.env.example` with team-supplied values; server secrets must
never use `VITE_` names. AI authorship and library attribution are in the
[root README](../README.md#ai-assistance-disclosure).
