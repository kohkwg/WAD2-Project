# Bookedz Client

Vue 3, Vite, Bootstrap, and JavaScript. Run from this directory:

```sh
pnpm install
pnpm dev
```

The dev server uses `http://127.0.0.1:5173`. Use `pnpm build` for a production
build. Existing event/RSVP views use localStorage demo data. The supplied Supabase
initializer is available for later integration; it is not used by those views.

For live integration, copy `.env.example` to `.env` and obtain the URL/publishable
key from the team. Never put server secrets in `VITE_` variables. Automated tests
and lint scripts are not configured yet.
