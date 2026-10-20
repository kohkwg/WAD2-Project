# Bookedz Server Scaffold

Express health-only server. Run from this directory:

```sh
pnpm install
pnpm dev
```

`GET http://127.0.0.1:3000/health` returns server status. No application API,
Supabase connection, or R2 integration is implemented in this entrypoint yet.

The supplied `.env.example` documents future integration settings. Copy it to
`.env` and obtain values from the team when needed. The current `dev` and `start`
scripts do not load that file. On Node v22.22.1 an env-aware invocation is:

```sh
node --env-file=.env server.js
```

Loading variables does not add missing service integrations. The optional
`pnpm test:crud` script loads `.env` and checks database operations against
configured services; it requires approved test credentials and records. No lint
script is configured.
