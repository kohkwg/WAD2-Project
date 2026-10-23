// Development test accounts on the hosted project (see docs/dev-merge.md).
// Passwords are never stored here; sessions come from auth.setup.mjs.
export const ACCOUNTS = {
  organiser: 'test1@example.com',
  participant: 'test2@example.com',
}

export const authFile = (role) => `e2e-live/.auth/${role}.json`
