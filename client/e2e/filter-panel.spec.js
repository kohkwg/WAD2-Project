import { test, expect } from '@playwright/test'

async function fixture(page) {
  let fail = false
  const rows = [
    { id: 'tech', title: 'Tech session', tags: ['tech'], startTime: '2026-10-27T06:00:00Z', spotsLeft: 3 },
    { id: 'sports', title: 'Sports session', tags: ['sports'], startTime: '2026-10-28T06:00:00Z', spotsLeft: 0 },
    { id: 'music', title: 'Music session', tags: ['music'], startTime: '2026-10-31T06:00:00Z', spotsLeft: 5 },
    { id: 'arts', title: 'Arts session', tags: ['arts'], startTime: '2026-11-01T06:00:00Z', spotsLeft: 10 },
    { id: 'food', title: 'Food session', tags: ['food'], startTime: '2026-11-04T06:00:00Z', spotsLeft: 2 },
  ].map(row => ({ ...row, capacity: 20, status: 'published', description: 'Event fixture', confirmedCount: 2, venue: { name: 'Test Hall', lat: 1.3048, lng: 103.8318 } }))
  await page.route('**/*.supabase.co/**', route => route.abort())
  await page.route('**/__filter-events', route => route.fulfill({ status: fail ? 503 : 200, json: rows }))
  await page.route('**/__filter-fixture.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export const USING_SUPABASE = false;
    export const getEvents = async () => {
      const response = await fetch('/__filter-events');
      if (!response.ok) throw new Error('Event count unavailable');
      return response.json();
    };
  ` }))
  await page.route(/\/src\/composables\/useEvents\.js(?:\?.*)?$/, async route => {
    const response = await route.fetch()
    await route.fulfill({ response, body: (await response.text()).replace(/from (["'])\/src\/utils\/api\.js\1/g, 'from "/__filter-fixture.js"') })
  })
  await page.clock.setFixedTime(new Date('2026-10-27T04:00:00Z'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  return { failCount(value) { fail = value } }
}

test('filter popover shares bar edges, overlays the hero and stays single-column across themes and widths', async ({ page }, testInfo) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await fixture(page)
  await page.goto('/')
  await expect(page.locator('.hero-illustration')).toHaveAttribute('data-loaded', 'true')
  await expect(page.getByRole('group', { name: 'Interest suggestions' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Explore events on the map', exact: true })).toHaveCount(0)
  for (const scheme of ['light', 'dark']) {
    await page.getByLabel('Color theme').selectOption(scheme)
    for (const width of [375, 575, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await page.locator('.filter-toggle').scrollIntoViewIfNeeded()
      const island = await page.locator('.illustrated-island').boundingBox()
      await page.locator('.filter-toggle').click()
      const bar = await page.locator('.search-toolbar').boundingBox()
      const panel = await page.locator('.filter-panel').boundingBox()
      const after = await page.locator('.illustrated-island').boundingBox()
      expect(Math.abs(bar.x - panel.x)).toBeLessThan(1)
      expect(Math.abs(bar.width - panel.width)).toBeLessThan(1)
      expect(Math.abs(panel.y - bar.y - bar.height - 8)).toBeLessThan(1)
      expect(Math.abs(island.y - after.y)).toBeLessThan(1)
      expect(Math.abs(island.x - after.x)).toBeLessThan(1)
      const sections = await page.locator('.filter-section legend').allTextContents()
      expect(sections).toEqual(['When', 'Good to know', 'Category'])
      const sectionBoxes = await page.locator('.filter-section').evaluateAll(elements => elements.map(element => ({ x: element.offsetLeft, top: element.offsetTop, bottom: element.offsetTop + element.offsetHeight })))
      expect(sectionBoxes.every(box => box.x === sectionBoxes[0].x)).toBe(true)
      expect(sectionBoxes[1].top).toBeGreaterThan(sectionBoxes[0].bottom)
      expect(sectionBoxes[2].top).toBeGreaterThan(sectionBoxes[1].bottom)
      expect(await page.locator('.filter-panel').evaluate(element => getComputedStyle(element).borderRadius)).toBe('18px')
      expect(await page.locator('.filter-panel').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      await expect(page.getByRole('group', { name: 'Good to know' }).getByRole('button')).toHaveCount(1)
      await expect(page.getByRole('button', { name: 'Free', exact: true })).toHaveCount(0)
      await expect(page.locator('.filter-panel input[type="date"], .filter-panel input[type="checkbox"], .filter-panel select')).toHaveCount(0)
      await expect(page.getByRole('group', { name: 'Category' }).getByRole('button', { name: 'All', exact: true })).toHaveCount(0)
      if (width === 375 || width === 1280) await page.screenshot({ path: testInfo.outputPath(`filters-${scheme}-${width}.png`), fullPage: true })
      await page.keyboard.press('Escape')
      await expect(page.locator('.filter-toggle')).toBeFocused()
      await expect(page.locator('.filter-panel')).toHaveCount(0)
    }
  }
  expect(errors).toEqual([])
})

test('live count, canonical URL, dates, extras and sorting agree between Landing and Discover', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await fixture(page)
  await page.goto('/')
  await page.getByLabel('Search by title, description or venue').fill('session')
  await page.locator('.filter-toggle').click()
  await expect(page.getByRole('button', { name: 'Show 5 events', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Today', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Show 1 events', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Today', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Show 5 events', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'This weekend', exact: true }).click()
  await page.getByRole('button', { name: 'Spots left', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Show 2 events', exact: true })).toBeEnabled()
  await page.getByRole('group', { name: 'Category', exact: true }).getByRole('button', { name: 'Music', exact: true }).click()
  await expect(page.locator('.filter-count')).toHaveText('3')
  await expect(page.locator('.filter-toggle')).toHaveClass(/is-active/)
  await page.getByRole('button', { name: 'Show 1 events', exact: true }).click()
  await expect(page).toHaveURL(/\/discover\?.*when=weekend.*extras=spots_left.*categories=music/)
  await expect(page.locator('.filter-panel')).toHaveCount(0)
  await expect(page.locator('.event-timeline .event-card')).toHaveCount(1)
  await expect(page.locator('.event-timeline').getByRole('heading', { name: 'Music session' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remove This weekend filter' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remove Spots left filter' })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Search by title, description or venue')).toHaveValue('session')
  await expect(page.getByRole('button', { name: 'Remove Music filter' })).toBeVisible()
  await page.getByLabel('Sort by').selectOption('popular')
  await expect(page).toHaveURL(/sort=popular/)
  await expect(page.locator('.filter-count')).toHaveText('3')
  await page.locator('.filter-toggle').click()
  await page.getByRole('button', { name: 'Clear all', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Show 5 events', exact: true })).toBeEnabled()
  await expect(page.locator('.filter-count')).toHaveCount(0)
  await expect(page.getByLabel('Search by title, description or venue')).toHaveValue('session')
  await page.getByRole('button', { name: 'Pick dates', exact: true }).click()
  await expect(page.locator('[data-calendar-hook]')).toContainText('No date range is applied yet')
  await expect(page.getByRole('button', { name: 'Show 5 events', exact: true })).toBeEnabled()
  expect(errors).toEqual([])
})

test('outside click, Escape, keyboard selection and count retry preserve selected filters', async ({ page }) => {
  const state = await fixture(page)
  await page.goto('/')
  await page.locator('.filter-toggle').focus()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Today', exact: true }).focus()
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Today', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await expect(page.locator('.filter-toggle')).toBeFocused()
  await expect(page.locator('.filter-toggle')).toHaveAttribute('aria-expanded', 'false')
  await page.locator('.filter-toggle').click()
  await expect(page.getByRole('button', { name: 'Today', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('heading', { level: 1 }).click()
  await expect(page.locator('.filter-panel')).toHaveCount(0)
  await page.locator('.filter-toggle').click()
  state.failCount(true)
  await page.getByRole('group', { name: 'Category', exact: true }).getByRole('button', { name: 'Tech', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Couldn’t load the event count')
  await expect(page.locator('.show-events')).toBeDisabled()
  state.failCount(false)
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Show 1 events', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Tech', exact: true })).toHaveAttribute('aria-pressed', 'true')
})
