import { test, expect } from '@playwright/test'

const STORE = 'bookedz-feature2-demo'

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-16T04:00:00Z'))
  await page.route('**/*.supabase.co/**', route => route.abort())
})

test('mobile navigation closes and focuses the destination main content', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/events')
  const toggle = page.getByRole('button', { name: 'Toggle navigation' })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await page.getByRole('link', { name: 'My RSVPs', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'My RSVPs', exact: true })).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('main')).toBeFocused()
  await expect(page).toHaveTitle('My RSVPs · Bookedz')
})

test('shared shell exposes skip navigation and keeps development diagnostics out of product actions', async ({ page }) => {
  const pageErrors = []
  const healthRequests = []
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('request', request => { if (request.url().includes('/health')) healthRequests.push(request.url()) })
  await page.goto('/events')
  await expect(page.getByRole('button', { name: 'Check Server', exact: true })).toHaveCount(0)
  await expect(page.getByText('Ready to build', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Discover events' })).toBeVisible()
  // Navigation intentionally focuses main. The brand is the first navbar stop;
  // Shift+Tab must reach the preceding skip link in the actual keyboard order.
  await page.getByRole('link', { name: 'Bookedz', exact: true }).focus()
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()
  expect(pageErrors).toEqual([])
  expect(healthRequests).toEqual([])
})

test('shared secondary event metadata has normal-text contrast', async ({ page }) => {
  await page.goto('/my-rsvps')
  const colors = await page.locator('main .card p.text-secondary').first().evaluate(el => ({
    text: getComputedStyle(el).color,
    background: getComputedStyle(document.body).backgroundColor,
  }))
  function luminance(css) {
    const rgb = css.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
      const channel = value / 255
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    })
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
  }
  const values = [luminance(colors.text), luminance(colors.background)].sort((a, b) => a - b)
  expect((values[1] + 0.05) / (values[0] + 0.05)).toBeGreaterThanOrEqual(4.5)
})

test('demo reset requires confirmation and cancellation keeps saved work', async ({ page }) => {
  await page.goto('/events')
  await expect(page.getByRole('link', { name: /^RSVP for / }).first()).toBeVisible()
  await page.evaluate(key => {
    const db = JSON.parse(localStorage.getItem(key))
    db.reviewMarker = 'keep saved work'
    localStorage.setItem(key, JSON.stringify(db))
  }, STORE)
  page.once('dialog', dialog => dialog.dismiss())
  await page.getByRole('button', { name: 'Reset demo data', exact: true }).click()
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).reviewMarker, STORE)).toBe('keep saved work')
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Reset demo data', exact: true }).click()
  await expect(page.getByRole('link', { name: /^RSVP for / }).first()).toBeVisible()
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key))?.reviewMarker ?? null, STORE)).toBeNull()
})

test('shared public summary has a page heading and announces description disclosure state', async ({ page }) => {
  await page.goto('/events')
  await expect(page.getByRole('link', { name: /^RSVP for / }).first()).toBeVisible()
  await page.evaluate(key => {
    const db = JSON.parse(localStorage.getItem(key))
    db.events.find(event => event.id === 'e-weather-demo').description = 'A detailed public event description. '.repeat(12)
    localStorage.setItem(key, JSON.stringify(db))
  }, STORE)
  await page.goto('/events/e-weather-demo/rsvp')
  await expect(page.getByRole('heading', { level: 1, name: 'Campus Green Social · Weather demo' })).toBeVisible()
  const disclosure = page.getByRole('button', { name: 'Show more', exact: true })
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
  const controlledId = await disclosure.getAttribute('aria-controls')
  expect(controlledId).toBeTruthy()
  await disclosure.click()
  await expect(page.getByRole('button', { name: 'Show less', exact: true })).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator(`[id="${controlledId}"]`)).toContainText('A detailed public event description. '.repeat(12).trim())
})
