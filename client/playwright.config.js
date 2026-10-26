import { defineConfig, devices } from '@playwright/test'

// Playwright: https://playwright.dev/ (Apache-2.0). Local demo contexts only.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 2,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    // Existing journeys exercise returning owners. Tutorial cases opt into a
    // fresh browser state explicitly to verify automatic first-entry onboarding.
    storageState: {
      cookies: [],
      origins: [{ origin: 'http://127.0.0.1:5173', localStorage: [
        { name: 'bookedz:organiser-tour:v1:demo:org1', value: 'completed' },
        { name: 'bookedz:organiser-tour:v1:live:org1', value: 'completed' },
      ] }],
    },
    timezoneId: 'Asia/Singapore',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --strictPort',
    env: { VITE_USE_MOCK: 'true', VITE_FEATURE4_TEST_SEED: 'true' },
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
})
