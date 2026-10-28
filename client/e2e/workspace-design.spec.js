import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
  await page.route('**/*.supabase.co/**', route => route.abort())
  await page.route('**/two-hr-forecast*', route => route.abort())
})

test('public layout prioritises event facts and My RSVPs stays responsive', async ({ page }, testInfo) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/events/e2/rsvp')
    await expect(page.getByRole('heading', { name: 'Intro to Vue Workshop', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'RSVP', exact: true })).toBeVisible()
    const details = page.locator('.event-public-details')
    const actions = page.locator('.rsvp-action-panel')
    if (width === 1280) {
      const left = await details.boundingBox(), right = await actions.boundingBox()
      expect(left.x).toBeLessThan(right.x)
      expect(left.width).toBeGreaterThan(right.width)
    }
    const title = await details.getByRole('heading', { level: 1 }).boundingBox()
    const picture = await details.locator('.event-cover').boundingBox()
    expect(title.y).toBeLessThan(picture.y)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`public-event-${width}.png`) })
    await page.goto('/my-rsvps')
    await expect(page.locator('.plans-summary')).toBeVisible()
    await expect(page.locator('.rsvp-card').first()).toBeVisible()
    expect(await page.locator('.rsvp-status svg').count()).toBeGreaterThan(0)
    const offer = page.getByRole('button', { name: 'Confirm my spot', exact: true })
    await expect(offer).toBeVisible()
    const contrast = await offer.evaluate(el => {
      const css = getComputedStyle(el)
      const luminance = color => {
        const [r, g, b] = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { const c = v / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4 })
        return .2126 * r + .7152 * g + .0722 * b
      }
      const a = luminance(css.color), b = luminance(css.backgroundColor)
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05)
    })
    expect(contrast).toBeGreaterThanOrEqual(4.5)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`my-rsvps-${width}.png`) })
  }
  expect(errors).toEqual([])
})

test('organiser layouts expose tools and capacity from actual RSVP data', async ({ page }, testInfo) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/organiser/events/e-weather-demo/manage')
    await expect(page.getByRole('link', { name: 'Manage RSVPs', exact: true })).toBeVisible()
    const nav = page.getByRole('navigation', { name: 'Event tools' })
    for (const tab of ['Tasks', 'Announcements', 'Budget', 'Weather']) {
      await nav.getByRole('link', { name: tab, exact: true }).click()
      await expect(page.getByRole('heading', { name: tab, exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    await nav.getByRole('link', { name: 'Tasks', exact: true }).click()
    await page.screenshot({ path: testInfo.outputPath(`event-tools-${width}.png`) })
    await page.goto('/organiser/events/e2/rsvps')
    const capacity = page.getByRole('img', { name: /^Capacity:/ })
    await expect(capacity).toBeVisible()
    const expectedCapacity = await page.evaluate(() => JSON.parse(localStorage.getItem('bookedz-feature2-demo')).events.find(e => e.id === 'e2').capacity)
    const counts = await page.locator('.capacity-legend strong').allTextContents()
    expect(counts.map(Number).reduce((a, b) => a + b, 0)).toBe(expectedCapacity)
    await page.getByRole('button', { name: /^Waitlist & offers/ }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`manage-rsvps-${width}.png`) })
  }
  expect(errors).toEqual([])
})
