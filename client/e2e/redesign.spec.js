import { test, expect } from '@playwright/test'
import { createSeedData } from '../src/utils/mockData.js'

test.beforeEach(async ({ page }) => {
  await page.route('**/*.supabase.co/**', route => route.abort())
})

test('map opens events by keyboard and list view retains the same discovery filters', async ({ page }) => {
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('/discover')
  await page.getByRole('button', { name: 'Map', exact: true }).click()
  const map = page.getByRole('region', { name: 'Explore events on the Singapore map' })
  await expect(map).toBeVisible()
  const marker = map.locator('[data-marker]').first()
  await expect(marker).toBeVisible()
  await marker.focus()
  await page.keyboard.press('Enter')
  await expect(map.locator('.map-preview')).toBeVisible()
  await page.getByRole('button', { name: 'Close event preview' }).click()
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await page.getByRole('button', { name: 'Return to island view' }).click()
  await expect(page.getByRole('button', { name: 'Zoom out', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'List', exact: true }).click()
  await expect(map).toHaveCount(0)
  await page.getByLabel('Search by title, description or venue').fill('no-such-event-XYZ')
  await expect(page.getByRole('heading', { name: 'No events found' })).toBeVisible()
  await page.getByRole('button', { name: 'Map', exact: true }).click()
  await expect(page.locator('.map-bottomline')).toContainText('0 events on the map')
  await page.getByRole('button', { name: 'Clear search and filters' }).click()
  await expect(page.locator('[data-marker]').first()).toBeVisible()
  expect(errors).toEqual([])
})

test('the map includes results beyond the first directory page and exposes missing locations', async ({ page }) => {
  const db = createSeedData()
  const base = db.events[0]
  db.events = Array.from({ length: 15 }, (_, i) => ({ ...base, id: `map-${i}`, title: `Map event ${i}`, venue: i === 14 ? { name: 'Location pending', address: '' } : base.venue }))
  await page.addInitScript(data => localStorage.setItem('bookedz-feature2-demo', JSON.stringify(data)), db)
  await page.goto('/discover')
  await page.getByRole('button', { name: 'Map', exact: true }).click()
  await expect(page.locator('.map-bottomline')).toContainText('14 events on the map')
  await expect(page.locator('.map-bottomline')).toContainText('1 more in the list')
  await expect(page.locator('.event-timeline .event-card')).toHaveCount(12)
  const cluster = page.locator('[data-marker]').filter({ hasText: '11' })
  await expect(cluster).toBeVisible()
  await cluster.focus()
  await cluster.press('Enter')
  await page.locator('.cluster-events button').first().click()
  await expect(page.locator('.map-preview h2')).toBeFocused()
})

test('opening an event resets the page and browser Back restores discovery scroll', async ({ page }) => {
  await page.goto('/discover')
  await page.getByRole('button', { name: 'Map', exact: true }).click()
  const action = page.locator('.event-timeline').getByRole('link', { name: /^View / }).last()
  await action.scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(100)
  await action.click()
  await expect(page.locator('main h1')).toBeVisible()
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Discover events' })).toBeVisible()
  await page.locator('.event-timeline .event-card').first().waitFor()
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100)
})

for (const width of [375, 575, 768, 1280]) {
  test(`redesign reflows and remains readable with reduced motion at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/discover')
  await page.getByRole('button', { name: 'Map', exact: true }).click()
    await expect(page.locator('[data-marker]').first()).toBeVisible()
    await expect(page.locator('html')).not.toHaveClass(/lenis/)
    await expect(page.locator('.map-surface')).toHaveCSS('opacity', '1')
    for (const marker of await page.locator('[data-marker]').all()) {
      const bounds = await marker.boundingBox()
      expect(bounds.width).toBeGreaterThanOrEqual(44)
      expect(bounds.height).toBeGreaterThanOrEqual(44)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`discovery-${width}.png`), fullPage: true })
    await page.goto('/organiser/events/e-weather-demo/manage?tab=tasks')
    await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`organiser-${width}.png`), fullPage: true })
  })
}
