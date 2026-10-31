import { test, expect } from '@playwright/test'

test('landing search, interest shortcuts and card navigation retain browsing state', async ({ page }, testInfo) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await mockEvents(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const search = page.getByLabel('Search by title, description or venue')
  const timeline = page.locator('.event-timeline')
  const view = () => page.getByRole('group', { name: 'Discovery view', exact: true })
  for (const scheme of ['light', 'dark']) {
    await page.getByLabel('Color theme').selectOption(scheme)
    for (const width of [375, 575, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await expect(search).toBeVisible()
      await expect(page.locator('.filter-toggle')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      if (width === 375) await page.screenshot({ path: testInfo.outputPath(`search-mobile-${scheme}.png`) })
    }
  }
  await page.screenshot({ path: testInfo.outputPath('search-hero.png'), fullPage: true })
  await page.locator('.filter-toggle').click()
  await page.getByRole('group', { name: 'Category', exact: true }).getByRole('button', { name: 'Music', exact: true }).click()
  await page.getByRole('button', { name: 'Show 1 events', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Remove Music filter' })).toBeVisible()
  await expect(timeline.locator('.event-card')).toHaveCount(1)
  // Switch immediately, before the typing debounce expires.
  await search.fill('Test Hall')
  await view().getByRole('button', { name: 'List', exact: true }).click()
  await expect(search).toHaveValue('Test Hall')
  await expect(timeline.locator('.event-card')).toHaveCount(1)
  await view().getByRole('button', { name: 'Map', exact: true }).click()
  await expect(search).toHaveValue('Test Hall')
  const marker = page.getByRole('button', { name: 'Preview Music with a few places', exact: true })
  await expect(marker).toHaveCount(1)
  await marker.focus(); await page.keyboard.press('Enter')
  const preview = page.getByRole('region', { name: 'Selected map events' })
  await expect(preview.getByRole('heading', { name: 'Music with a few places' })).toBeVisible()
  await expect(preview.getByRole('link', { name: 'View event', exact: true })).toHaveAttribute('href', '/events/music/rsvp')
  await expect(preview.getByRole('link', { name: 'RSVP', exact: true })).toHaveAttribute('href', '/events/music/rsvp#rsvp')
  await view().getByRole('button', { name: 'List', exact: true }).click()
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    const card = timeline.locator('.event-card')
    await expect(card.locator('.event-description')).toHaveText('Mock event')
    await expect(card.locator('time')).toContainText(/\d/)
    if (width === 375) await page.screenshot({ path: testInfo.outputPath('card-mobile.png'), fullPage: true })
    await expect(card.getByRole('link', { name: 'RSVP for Music with a few places' })).toHaveAttribute('href', '/events/music/rsvp#rsvp')
    await card.getByRole('link', { name: 'Music with a few places', exact: true }).click()
    await expect(page).toHaveURL(/\/events\/music\/rsvp$/)
    await page.goBack()
    await expect(search).toHaveValue('Test Hall')
    await expect(timeline.locator('.event-card')).toHaveCount(1)
    await timeline.getByRole('link', { name: 'RSVP for Music with a few places' }).click()
    await expect(page).toHaveURL(/\/events\/music\/rsvp#rsvp$/)
    await page.goBack()
    await expect(search).toHaveValue('Test Hall')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await search.fill('No matching activity')
  await expect(page.getByRole('heading', { name: 'No events found' })).toBeVisible()
  await page.getByRole('button', { name: 'Clear search', exact: true }).click()
  await expect(search).toBeFocused()
  await expect(timeline.locator('.event-card')).toHaveCount(1)
  await page.getByRole('button', { name: 'Remove Music filter' }).click()
  await expect(timeline.locator('.event-card')).toHaveCount(5)
  await page.screenshot({ path: testInfo.outputPath('event-cards.png'), fullPage: true })
  expect(errors).toEqual([])
})

async function mockEvents(page, urgent = true) {
  const now = Date.now()
  const rows = [
    { id: 'deadline', title: 'Tech deadline workshop', tags: ['tech'], capacity: 30, spotsLeft: 20,
      ...(urgent ? { registration_closes_at: new Date(now + 3600000).toISOString() } : {}) },
    { id: 'music', title: 'Music with a few places', tags: ['music'], capacity: 30, spotsLeft: urgent ? 3 : 20 },
    { id: 'arts', title: 'Arts afternoon', tags: ['arts'], capacity: 30, spotsLeft: 20 },
    { id: 'full', title: 'Full sports event', tags: ['sports'], capacity: 30, spotsLeft: 0 },
    { id: 'closed', title: 'Closed food event', tags: ['food'], capacity: 30, spotsLeft: 1,
      registration_closes_at: new Date(now - 1000).toISOString() },
  ].map(event => ({ ...event, status: 'published', description: 'Mock event', confirmedCount: 2,
    startTime: new Date(now + 72 * 3600000).toISOString(), endTime: new Date(now + 74 * 3600000).toISOString(),
    venue: { name: 'Test Hall', address: 'Campus', lat: 1.3048, lng: 103.8318 } }))
  await page.route('**/*.supabase.co/**', route => route.abort())
  await page.route('**/__browse-fixture.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export const USING_SUPABASE = false;
    export const getEvents = async () => ${JSON.stringify(rows)};
  ` }))
  await page.route(/\/src\/composables\/useEvents\.js(?:\?.*)?$/, async route => {
    const response = await route.fetch()
    const body = (await response.text()).replace(/from (["'])\/src\/utils\/api\.js\1/g, 'from "/__browse-fixture.js"')
    await route.fulfill({ response, body })
  })
}

test('Discover orders sections, shows truthful urgency and reuses filtered events through the category directory', async ({ page }, testInfo) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await mockEvents(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/discover')
  const closing = page.getByRole('region', { name: 'Closing soon', exact: true })
  await expect(closing.locator('.event-card')).toHaveCount(2)
  await expect(closing.getByText(/Registration closes/)).toBeVisible()
  await expect(closing.getByText('Only 3 places left', { exact: true })).toBeVisible()
  await expect(closing.getByRole('heading', { name: 'Full sports event' })).toHaveCount(0)
  await expect(closing.getByRole('heading', { name: 'Closed food event' })).toHaveCount(0)
  const headings = await page.locator('#event-directory h2').allTextContents()
  expect(headings.slice(0,5)).toEqual(['Picked for you', 'What are you in the mood for?', 'Closing soon', 'Explore categories', 'What’s coming up'])
  const common = page.getByRole('navigation', { name: 'Common event categories' })
  await expect(common.getByRole('link')).toHaveCount(6)
  for (const scheme of ['light', 'dark']) {
    await page.getByLabel('Color theme').selectOption(scheme)
    for (const width of [375,575,768,1280]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await expect(page.locator('main')).toHaveCount(1)
      await expect(common.getByRole('link', { name: 'Tech', exact: true })).toBeVisible()
      const text = await closing.locator('.event-details').first().boundingBox()
      expect(text.width).toBeGreaterThan(180)
    }
  }
  await page.getByRole('link', { name: 'See all categories' }).click()
  await expect(page).toHaveURL(/view=categories/)
  await expect(page.getByRole('heading', { name: 'All categories', exact: true })).toBeVisible()
  const directory = page.getByRole('navigation', { name: 'All event categories' })
  await expect(directory.getByRole('link')).toHaveCount(10)
  for (const width of [375,575,768,1280]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  const music = directory.getByRole('link', { name: 'Music', exact: true })
  await music.focus(); await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/categories=music/)
  await expect(page.getByRole('heading', { name: 'Music events', exact: true })).toBeVisible()
  await expect(page.locator('.event-timeline .event-card')).toHaveCount(1)
  await expect(page.locator('.event-timeline').getByRole('heading', { name: 'Music with a few places' })).toBeVisible()
  await expect(page.locator('.event-timeline').getByRole('link', { name: 'RSVP for Music with a few places' })).toHaveAttribute('href', /\/events\/music\/rsvp#rsvp/)
  await page.reload()
  await expect(page.locator('.event-timeline .event-card')).toHaveCount(1)
  await page.getByRole('link', { name: 'All categories', exact: true }).click()
  await expect(directory).toBeVisible()
  await directory.getByRole('link', { name: 'Tech', exact: true }).click()
  await expect(page.locator('.event-timeline').getByRole('heading', { name: 'Tech deadline workshop' })).toBeVisible()
  await page.goBack()
  await expect(directory).toBeVisible()
  await page.getByRole('link', { name: 'Back to Discover', exact: true }).click()
  await expect(common).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('discover-browse.png'), fullPage: true })
  expect(errors).toEqual([])
})

test('Closing soon hides when neither deadlines nor limited places support it', async ({ page }) => {
  await mockEvents(page, false)
  await page.goto('/discover')
  await expect(page.getByRole('navigation', { name: 'Common event categories' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Closing soon', exact: true })).toHaveCount(0)
  await page.getByRole('navigation', { name: 'Common event categories' }).getByRole('link', { name: 'Arts', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Arts events', exact: true })).toBeVisible()
  await expect(page.locator('.event-timeline .event-card')).toHaveCount(1)
})

test('category directory and removable filters stay cohesive without resetting search', async ({ page }, testInfo) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await mockEvents(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/discover?view=categories')
  const directory = page.getByRole('navigation', { name: 'All event categories' })
  await expect(directory.getByRole('link')).toHaveCount(10)
  await expect(page.getByRole('group', { name: 'Discovery view' })).toHaveCount(0)
  for (const scheme of ['light','dark']) {
    await page.getByLabel('Color theme').selectOption(scheme)
    for (const width of [375,575,768,1280]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      const icon = await directory.locator('.category-directory-icon').first().boundingBox()
      expect(icon.width).toBeGreaterThanOrEqual(56)
      const card = await directory.getByRole('link', { name: 'Tech', exact: true }).boundingBox()
      expect(card.height).toBeGreaterThanOrEqual(112)
    }
  }
  await page.screenshot({ path: testInfo.outputPath('category-directory-refined.png'), fullPage: true })
  await directory.getByRole('link', { name: 'Music', exact: true }).click()
  const search = page.getByLabel('Search by title, description or venue')
  const chip = page.getByRole('button', { name: 'Remove Music filter', exact: true })
  await expect(chip).toBeVisible()
  await expect(page.getByRole('group', { name: 'Discovery view' })).toHaveCount(1)
  await search.fill('Music'); await search.press('Enter')
  await expect(page.locator('.event-timeline .event-card')).toHaveCount(1)
  for (const width of [375,575,768,1280]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(chip).toBeVisible()
  }
  await page.screenshot({ path: testInfo.outputPath('category-results-refined.png'), fullPage: true })
  await chip.focus(); await page.keyboard.press('Enter')
  await expect(chip).toHaveCount(0)
  await expect(page).not.toHaveURL(/categories=music/)
  await expect(search).toHaveValue('Music')
  await expect(search).toBeFocused()
  await expect(page.getByRole('heading', { name: 'Discover events', exact: true })).toBeVisible()
  await expect(page.locator('.event-timeline .event-card')).toHaveCount(1)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Remove Music filter', exact: true })).toHaveCount(0)
  await expect(search).toHaveValue('Music')
  await expect(page.locator('.event-timeline .event-card')).toHaveCount(1)
  await page.getByRole('button', { name: 'Clear search', exact: true }).click()
  await page.getByRole('button', { name: 'Filters', exact: false }).click()
  await page.getByRole('group', { name: 'Category', exact: true }).getByRole('button', { name: 'Tech', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Remove Tech filter', exact: true })).toBeVisible()
  await expect(page.locator('.event-timeline .event-card')).toHaveCount(1)
  await page.getByRole('button', { name: 'Remove Tech filter', exact: true }).click()
  await expect(page.locator('.event-timeline .event-card')).toHaveCount(5)
  expect(errors).toEqual([])
})
