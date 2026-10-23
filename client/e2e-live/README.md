# Live e2e suite

Two specs run against the **real** Supabase project in `client/.env`. The demo-mode
suite in `e2e/` can't cover them, because these features exist only in the database:

| Spec | Covers |
|---|---|
| `checkin-journey.spec.mjs` | Feature 3: event → RSVP → ticket (QR + barcode) → staff check-in → live ticket and dashboard → export, interest bump and RSVP rules |
| `floor-plan.spec.mjs` | Feature 6: organiser saves a floor plan, it persists, participants see it read-only and can't write it |

Each run creates throwaway `[TEST] e2e …` events and deletes them afterwards. The
shared steps are in `helpers.mjs`.

## First run: sign in once

Sessions for the two development accounts (`accounts.mjs`) are saved to
`e2e-live/.auth/`, which is git-ignored. Nothing in this suite stores or types
passwords. Run headed so you can sign in yourself:

```sh
pnpm test:e2e:live --headed
```

A browser opens at `/login` twice: first for the organiser, then for the
participant. Sign in each time; the run continues automatically.

## Later runs

```sh
pnpm test:e2e:live
```

Run one feature only:

```sh
pnpm test:e2e:live e2e-live/floor-plan.spec.mjs
```

The saved sessions are reused and refreshed after each run. If a session has
expired, delete `e2e-live/.auth/<role>.json` and run headed again.

## Notes

- `playwright.live.config.mjs` starts Vite on port 5174 with `VITE_USE_MOCK=false`.
- The journey doesn't call Express (`/api/...`), so the server port doesn't matter.
- Camera scanning is not covered (headless browsers have no camera). Staff check-in
  uses the name/email search and the typed ticket code instead.
