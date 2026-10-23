import { defineConfig, devices } from '@playwright/test'

// Live end-to-end suite: runs against the real Supabase project in client/.env
// (unlike playwright.config.js, which forces demo mode). Writes throwaway [TEST]
// data and deletes it afterwards. See e2e-live/README.md for how to run it.
export default defineConfig({
  testDir: './e2e-live',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5174',
    timezoneId: 'Asia/Singapore',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // One-time manual sign-in; skipped while saved sessions exist
    { name: 'login', testMatch: /auth\.setup\.mjs/, use: { ...devices['Desktop Chrome'] } },
    { name: 'live', testMatch: /\.spec\.mjs/, dependencies: ['login'], use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174 --strictPort',
    env: { VITE_USE_MOCK: 'false' },
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: true,
  },
})
