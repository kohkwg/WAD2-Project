# Vue Template Client

```sh
pnpm install
pnpm dev
```

## Mock data or Supabase?

All data calls go through `src/utils/api.js`, which picks a backend:

| `client/.env`                 | Backend                      | Login                        |
| ----------------------------- | ---------------------------- | ---------------------------- |
| missing / keys blank          | `utils/mockApi.js` (browser) | none, you are always "Alex"  |
| Supabase URL + key filled in  | `utils/supabaseApi.js`       | `/login` (email + password)  |

To use Supabase, copy `.env.example` to `.env` and fill in the values from
Supabase Dashboard → Project Settings → API (the **publishable** key, never the secret key).
The database must already have `supabase/migrations/..._init.sql` applied. Restart `pnpm dev`
after changing `.env`.

Both backends have the same functions and return the same shapes, so pages don't change.
If you add a function, add it to **both** files and to `api.js`.
