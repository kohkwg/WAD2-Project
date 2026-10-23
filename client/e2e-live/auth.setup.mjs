// One-time sign-in for the live suite. Nobody types passwords into scripts: this
// opens /login in a visible browser and waits for a person to sign in, then saves
// the session to e2e-live/.auth/<role>.json (git-ignored). Skipped when a saved
// session already exists. Run with --headed (see docs/testing.md#live-browser-tests).
import { test as setup, expect } from '@playwright/test'
import fs from 'node:fs'
import { ACCOUNTS, authFile } from './accounts.mjs'

for (const [role, email] of Object.entries(ACCOUNTS)) {
  setup(`sign in as ${role} (${email})`, async ({ page }) => {
    setup.skip(fs.existsSync(authFile(role)), `saved session found for ${role}`)
    setup.setTimeout(5 * 60_000)

    await page.goto('/login')
    await page.evaluate((who) => {
      document.title = `Sign in as ${who}`
    }, email)
    console.log(`\n>>> In the browser window, sign in as ${email} (${role}). Waiting up to 5 minutes…\n`)

    // Done once the app has navigated away from /login with a session
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 5 * 60_000 })
    await expect(page.getByText(email)).toBeVisible()

    fs.mkdirSync('e2e-live/.auth', { recursive: true })
    await page.context().storageState({ path: authFile(role) })
  })
}
