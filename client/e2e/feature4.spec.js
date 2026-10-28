import { test, expect } from '@playwright/test'

const NOW = '2026-10-16T04:00:00.000Z'
const STORE = 'bookedz-feature2-demo'
const ENDPOINT = '**/v2/real-time/api/two-hr-forecast*'

// Controlled data.gov.sg v2 responses; never represent these as live observations.
function forecast(description = 'Thundery Showers', { stale = false } = {}) {
  return {
    code: 0,
    data: {
      area_metadata: [
        { name: 'City', label_location: { latitude: 1.2966, longitude: 103.8502 } },
        { name: 'Tampines', label_location: { latitude: 1.3533, longitude: 103.9404 } },
      ],
      items: [{
        update_timestamp: stale ? '2026-10-16T08:00:00+08:00' : '2026-10-16T11:55:00+08:00',
        timestamp: stale ? '2026-10-16T08:00:00+08:00' : '2026-10-16T11:55:00+08:00',
        valid_period: stale
          ? { start: '2026-10-16T08:00:00+08:00', end: '2026-10-16T10:00:00+08:00' }
          : { start: '2026-10-16T12:00:00+08:00', end: '2026-10-16T14:00:00+08:00' },
        forecasts: [{ area: 'City', forecast: description }, { area: 'Tampines', forecast: description }],
      }],
    },
  }
}

async function mockWeather(page, description, options) {
  await page.route(ENDPOINT, (route) => route.fulfill({ json: forecast(description, options) }))
}

async function openTool(page, tab = 'tasks', event = 'e-weather-demo') {
  await page.goto(`/organiser/events/${event}/manage?tab=${tab}`)
  await expect(page.getByRole('link', { name: tab[0].toUpperCase() + tab.slice(1), exact: true })).toBeVisible()
}

async function db(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORE)
}

async function addTask(page, title) {
  await page.getByLabel('Task title', { exact: true }).fill(title)
  await page.getByRole('button', { name: 'Add task', exact: true }).click()
  await expect(page.getByRole('button', { name: `Edit task: ${title}`, exact: true })).toBeVisible()
}

function task(page, title) {
  return page.locator('article.task-card').filter({ has: page.getByRole('button', { name: `Edit task: ${title}`, exact: true }) })
}

async function dragTask(page, source, target, targetPosition) {
  await source.scrollIntoViewIfNeeded()
  await target.scrollIntoViewIfNeeded()
  const from = await source.boundingBox()
  const to = await target.boundingBox()
  const taskId = await source.evaluate(el => el.closest('article').dataset.taskId)
  const column = await target.evaluate(el => el.closest('.task-list').getAttribute('aria-label'))
  const x = to.x + (targetPosition?.x ?? to.width / 2)
  const y = to.y + (targetPosition?.y ?? to.height / 2)
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 8, from.y + from.height / 2 + 8, { steps: 3 })
  await page.mouse.move(x, y, { steps: 15 })
  // Sortable briefly suppresses hit-testing after a swap. Keep the real pointer
  // moving until the destination accepts the card, then release it.
  await expect.poll(async () => {
    await page.mouse.move(x + 1, y)
    await page.mouse.move(x, y)
    return page.locator(`[aria-label="${column}"] [data-task-id="${taskId}"]`).count()
  }).toBe(1)
  await page.mouse.up()
}

async function confirmDelete(page) {
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(dialog).not.toBeVisible()
}

test.beforeEach(async ({ page }, testInfo) => {
  testInfo.feature4Diagnostics = { pageErrors: [], consoleErrors: [], failedRequests: [] }
  page.on('pageerror', error => testInfo.feature4Diagnostics.pageErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') testInfo.feature4Diagnostics.consoleErrors.push(message.text()) })
  page.on('requestfailed', request => testInfo.feature4Diagnostics.failedRequests.push({ url: request.url(), failure: request.failure()?.errorText }))
  await page.clock.setFixedTime(new Date(NOW))
  // No Supabase/R2 integration is permitted in local demo browser tests.
  await page.route('**/*.supabase.co/**', (route) => route.abort())
  await mockWeather(page)
})

test.afterEach(async ({}, testInfo) => {
  const diagnostics = testInfo.feature4Diagnostics
  await testInfo.attach('browser-diagnostics', { body: JSON.stringify(diagnostics, null, 2), contentType: 'application/json' })
  expect(diagnostics.pageErrors).toEqual([])
  const expectedOutage = testInfo.title.includes('weather outage')
  expect(diagnostics.consoleErrors.filter(message => !(expectedOutage && message.includes('503')))).toEqual([])
  expect(diagnostics.failedRequests.filter(request => !request.url.includes('/two-hr-forecast'))).toEqual([])
})

test('organiser event deletion cascades across RSVPs and Feature 4 records', async ({ page }) => {
  await page.goto('/organiser/events/e1/manage?tab=tasks')
  await addTask(page, 'Remove with event')
  await page.goto('/organiser/events')
  const eventCard = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Acoustic Night @ Campus Green' }) })
  await eventCard.getByRole('button', { name: 'Delete event' }).click()
  await eventCard.getByRole('button', { name: 'Yes, delete event' }).click()
  await expect(page.getByRole('status')).toContainText('Event deleted')
  const saved = await db(page)
  expect(saved.events.some(event => event.id === 'e1')).toBe(false)
  expect(saved.rsvps.some(rsvp => rsvp.eventId === 'e1')).toBe(false)
  expect(saved.feature4.tasks.some(task => task.eventId === 'e1')).toBe(false)
  expect(saved.events.some(event => event.id === 'e2')).toBe(true)
})

test('task CRUD, keyboard column moves/order, reload and event isolation', async ({ page }) => {
  await openTool(page)
  await addTask(page, 'Book microphones')
  await addTask(page, 'Confirm volunteers')
  await page.getByRole('button', { name: 'Move Confirm volunteers up', exact: true }).click()
  await expect(page.locator('[aria-label="To do tasks"] article.task-card').first()).toContainText('Confirm volunteers')
  await page.getByLabel('Status for Book microphones', { exact: true }).selectOption('in_progress')
  await expect(page.locator('[aria-label="In progress tasks"]')).toContainText('Book microphones')
  await page.getByRole('button', { name: 'Edit task: Book microphones', exact: true }).click()
  await page.getByLabel('Task title', { exact: true }).fill('Book two microphones')
  await page.getByLabel('Task notes (optional)', { exact: true }).fill('Collect at noon')
  await page.getByRole('button', { name: 'Save task', exact: true }).click()
  await expect(task(page, 'Book two microphones')).toContainText('Collect at noon')
  await page.reload()
  await expect(page.locator('[aria-label="In progress tasks"]')).toContainText('Book two microphones')
  await openTool(page, 'tasks', 'e2')
  await expect(page.getByRole('button', { name: 'Edit task: Book two microphones', exact: true })).toHaveCount(0)
  await openTool(page)
  await page.getByRole('button', { name: 'Delete task: Book two microphones', exact: true }).click()
  await confirmDelete(page)
  await expect(page.getByRole('button', { name: 'Edit task: Book two microphones', exact: true })).toHaveCount(0)
})

test('failed storage save keeps the draft and supports retry', async ({ page }) => {
  await openTool(page)
  await page.getByLabel('Task title', { exact: true }).fill('Recover my draft')
  await page.evaluate(() => {
    window.__originalSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'bookedz-feature2-demo') throw new DOMException('Storage full', 'QuotaExceededError')
      return window.__originalSetItem.call(this, key, value)
    }
  })
  await page.getByRole('button', { name: 'Add task', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(/storage|save|persist/i)
  await expect(page.getByLabel('Task title', { exact: true })).toHaveValue('Recover my draft')
  await expect(page.getByRole('button', { name: 'Edit task: Recover my draft', exact: true })).toHaveCount(0)
  await page.evaluate(() => { Storage.prototype.setItem = window.__originalSetItem })
  await page.getByRole('button', { name: 'Add task', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Edit task: Recover my draft', exact: true })).toBeVisible()
})

test('real Sortable dragging moves into an empty column, orders and restores on failure', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 })
  await openTool(page)
  await addTask(page, 'Drag alpha')
  await addTask(page, 'Drag beta')
  const progress = page.locator('[aria-label="In progress tasks"]')
  await dragTask(page, task(page, 'Drag alpha').locator('.task-handle'), progress)
  await expect(progress).toContainText('Drag alpha')
  await dragTask(page, task(page, 'Drag beta').locator('.task-handle'), task(page, 'Drag alpha'), { x: 50, y: 10 })
  await expect(progress.locator('article').first()).toContainText('Drag beta')
  await page.reload()
  await expect(progress.locator('article').first()).toContainText('Drag beta')
  const saved = await db(page)
  await page.evaluate(() => {
    window.__originalSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'bookedz-feature2-demo') throw new DOMException('Storage full', 'QuotaExceededError')
      return window.__originalSetItem.call(this, key, value)
    }
  })
  await dragTask(page, task(page, 'Drag alpha').locator('.task-handle'), page.locator('[aria-label="Done tasks"]'))
  await expect(page.getByRole('alert')).toContainText(/storage|save|persist/i)
  await expect(progress).toContainText('Drag alpha')
  await expect(page.locator('[aria-label="Done tasks"] article')).toHaveCount(0)
  expect((await db(page)).feature4.tasks).toEqual(saved.feature4.tasks)
  await page.evaluate(() => { Storage.prototype.setItem = window.__originalSetItem })
  await page.getByRole('button', { name: 'Retry save', exact: true }).click()
  await expect(page.locator('[aria-label="Done tasks"]')).toContainText('Drag alpha')
})

test('reused workspace route clears drafts and ignores old weather responses', async ({ page }) => {
  await openTool(page)
  await page.getByLabel('Task title', { exact: true }).fill('Unsaved event-one draft')
  await page.evaluate(async () => {
    const router = document.querySelector('#app').__vue_app__.config.globalProperties.$router
    await router.push('/organiser/events/e2/manage?tab=tasks')
  })
  await expect(page.getByRole('heading', { name: 'Intro to Vue Workshop', exact: true })).toBeVisible()
  await expect(page.getByLabel('Task title', { exact: true })).toHaveValue('')
  let release
  let requested
  const requestSeen = new Promise(resolve => { requested = resolve })
  const gate = new Promise(resolve => { release = resolve })
  await page.unroute(ENDPOINT)
  await page.route(ENDPOINT, async route => {
    requested()
    await gate
    await route.fulfill({ json: forecast('Showers') })
  })
  await page.evaluate(async () => {
    const router = document.querySelector('#app').__vue_app__.config.globalProperties.$router
    await router.push('/organiser/events/e-weather-demo/manage?tab=weather')
  })
  await requestSeen
  await page.evaluate(async () => {
    const router = document.querySelector('#app').__vue_app__.config.globalProperties.$router
    await router.push('/organiser/events/e2/manage?tab=tasks')
  })
  release()
  await expect(page.getByRole('heading', { name: 'Intro to Vue Workshop', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Tasks', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: 'Showers', exact: true })).toHaveCount(0)
})

test('manual posts are escaped, editable and public before RSVP', async ({ page }) => {
  const body = '<img src=x onerror=alert(1)> Bring a bottle'
  await openTool(page, 'announcements')
  await page.getByLabel('Announcement text', { exact: true }).fill(body)
  await page.getByRole('button', { name: 'Publish announcement', exact: true }).click()
  await expect(page.getByRole('button', { name: `Edit announcement: ${body}`, exact: true })).toBeVisible()
  await page.getByRole('button', { name: `Edit announcement: ${body}`, exact: true }).click()
  await page.getByLabel('Announcement text', { exact: true }).fill(`${body} please`)
  await page.getByRole('button', { name: 'Save announcement', exact: true }).click()
  await page.goto('/events/e-weather-demo/rsvp')
  await expect(page.getByRole('heading', { name: 'Event announcements', exact: true })).toBeVisible()
  await expect(page.getByText(`${body} please`, { exact: true })).toBeVisible()
  await expect(page.locator('img[src="x"]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /edit announcement/i })).toHaveCount(0)
  await openTool(page, 'announcements')
  await page.getByRole('button', { name: `Delete announcement: ${body} please`, exact: true }).click()
  await confirmDelete(page)
  await page.goto('/events/e-weather-demo/rsvp')
  await expect(page.getByText(`${body} please`, { exact: true })).toHaveCount(0)
})

test('budget exact cents, separate limit and 90/100/over thresholds persist', async ({ page }) => {
  await openTool(page, 'budget')
  await page.getByLabel('Budget limit (SGD)', { exact: true }).fill('100.00')
  await page.getByRole('button', { name: 'Save limit', exact: true }).click()
  await page.getByLabel('Item name', { exact: true }).fill('Snacks')
  await page.getByLabel('Category', { exact: true }).selectOption({ label: 'Food & drink' })
  await page.getByLabel('Planned cost (SGD)', { exact: true }).fill('99.99')
  await page.getByLabel('Actual cost (SGD)', { exact: true }).fill('90.00')
  await page.getByRole('button', { name: 'Save item', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: /Budget warning/ })).toContainText(/90%/i)
  for (const [amount, message] of [['100.00', /reached|100%/i], ['100.01', /over budget/i]]) {
    await page.getByRole('button', { name: 'Edit expense: Snacks', exact: true }).click()
    await page.getByLabel('Actual cost (SGD)', { exact: true }).fill(amount)
    await page.getByRole('button', { name: 'Save item', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: /budget/i })).toContainText(message)
  }
  await page.reload()
  await expect(page.getByRole('status').filter({ hasText: /budget/i })).toContainText(/over budget/i)
  await expect(page.getByText(/100\.01/).first()).toBeVisible()
  await page.getByRole('button', { name: 'Edit expense: Snacks', exact: true }).click()
  await page.getByLabel('Planned cost (SGD)', { exact: true }).fill('1.001')
  await page.getByRole('button', { name: 'Save item', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(/decimal|two|2|valid/i)
  await expect(page.getByLabel('Planned cost (SGD)', { exact: true })).toHaveValue('1.001')
})

test('rain switch cancellation, commit, one immutable public post and reload', async ({ page }) => {
  await openTool(page, 'weather')
  await expect(page.getByText('Thundery Showers', { exact: true })).toBeVisible()
  const before = await db(page)
  await page.getByRole('button', { name: 'Switch to backup venue', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  expect((await db(page)).events.find((e) => e.id === 'e-weather-demo').usingBackup).toBeFalsy()
  await page.getByRole('button', { name: 'Switch to backup venue', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm switch', exact: true }).click()
  await expect(page.getByText(/already.*backup|using.*backup|backup venue.*active/i).first()).toBeVisible()
  await page.reload()
  const after = await db(page)
  const event = after.events.find((e) => e.id === 'e-weather-demo')
  expect(event.usingBackup).toBe(true)
  expect(event.venue.name).toBe(event.backupVenue.name)
  expect(event.originalVenue.name).toBe(before.events.find((e) => e.id === event.id).venue.name)
  const posts = after.feature4.announcements.filter((post) => post.eventId === event.id && post.kind === 'venue-switch')
  expect(posts).toHaveLength(1)
  await openTool(page, 'announcements')
  await expect(page.getByRole('button', { name: /Edit announcement:/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Delete announcement:/ })).toHaveCount(0)
  await page.goto('/events/e-weather-demo/rsvp')
  await expect(page.getByText(event.venue.name, { exact: false }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Event announcements', exact: true })).toBeVisible()
})

for (const [name, description, options] of [
  ['dry', 'Fair', {}], ['unknown', 'Unrecognised weather', {}], ['stale', 'Showers', { stale: true }],
]) {
  test(`${name} weather cannot switch the venue`, async ({ page }) => {
    await page.unroute(ENDPOINT)
    await mockWeather(page, description, options)
    await openTool(page, 'weather')
    await expect(page.getByRole('button', { name: 'Switch to backup venue', exact: true })).toHaveCount(0)
    expect((await db(page)).events.find((e) => e.id === 'e-weather-demo').usingBackup).toBeFalsy()
  })
}

test('weather outage shows retry and never enables a switch', async ({ page }) => {
  await page.unroute(ENDPOINT)
  await page.route(ENDPOINT, (route) => route.fulfill({ status: 503, json: { code: 503 } }))
  await openTool(page, 'weather')
  await expect(page.getByRole('alert')).toContainText(/weather|forecast/i)
  await expect(page.getByRole('button', { name: 'Switch to backup venue', exact: true })).toHaveCount(0)
  await page.unroute(ENDPOINT)
  await mockWeather(page)
  await page.getByRole('button', { name: 'Refresh weather', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Switch to backup venue', exact: true })).toBeEnabled()
})

test('hanging confirmation forecast times out and releases the dialog without a partial switch', async ({ page }) => {
  await openTool(page, 'weather')
  await expect(page.getByRole('button', { name: 'Switch to backup venue', exact: true })).toBeEnabled()
  await page.clock.install({ time: new Date(NOW) })
  await page.getByRole('button', { name: 'Switch to backup venue', exact: true }).click()
  await page.unroute(ENDPOINT)
  let requested
  const requestSeen = new Promise(resolve => { requested = resolve })
  await page.route(ENDPOINT, () => { requested() }) // Intentionally stalled in this isolated context.
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Confirm switch', exact: true }).click()
  await requestSeen
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
  await page.clock.runFor(15_001)
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled()
  await expect(dialog.getByRole('alert')).toContainText(/timed out|timeout|retry/i)
  const saved = await db(page)
  expect(saved.events.find(event => event.id === 'e-weather-demo').usingBackup).toBeFalsy()
  expect(saved.feature4.announcements.filter(post => post.kind === 'venue-switch')).toHaveLength(0)
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await page.unroute(ENDPOINT)
  await mockWeather(page)
  await page.getByRole('button', { name: 'Refresh weather', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Switch to backup venue', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Switch to backup venue', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm switch', exact: true }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  expect((await db(page)).events.find(event => event.id === 'e-weather-demo').usingBackup).toBe(true)
})

test('missing coordinates requires a remembered manual forecast area', async ({ page }) => {
  await openTool(page)
  await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key))
    const event = state.events.find((e) => e.id === 'e-weather-demo')
    delete event.venue.lat; delete event.venue.lng
    if (event.originalVenue) { delete event.originalVenue.lat; delete event.originalVenue.lng }
    localStorage.setItem(key, JSON.stringify(state))
  }, STORE)
  await openTool(page, 'weather')
  await expect(page.getByRole('button', { name: 'Switch to backup venue', exact: true })).toHaveCount(0)
  await page.getByLabel('Forecast area', { exact: true }).selectOption({ label: 'City' })
  await page.getByRole('button', { name: 'Save forecast area', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Switch to backup venue', exact: true })).toBeEnabled()
  await page.reload()
  await expect(page.getByLabel('Forecast area', { exact: true })).toHaveValue('City')
})

for (const [name, lat, lng] of [['out-of-range numeric', 1000, 103.85], ['string', '1.2966', '103.8502']]) {
  test(`${name} coordinates expose remembered manual forecast area selection`, async ({ page }) => {
    await openTool(page)
    await page.evaluate(({ key, lat, lng }) => {
      const state = JSON.parse(localStorage.getItem(key))
      const event = state.events.find(item => item.id === 'e-weather-demo')
      event.venue.lat = lat; event.venue.lng = lng
      if (event.originalVenue) { event.originalVenue.lat = lat; event.originalVenue.lng = lng }
      localStorage.setItem(key, JSON.stringify(state))
    }, { key: STORE, lat, lng })
    await openTool(page, 'weather')
    await expect(page.getByLabel('Forecast area', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Switch to backup venue', exact: true })).toHaveCount(0)
    await page.getByLabel('Forecast area', { exact: true }).selectOption({ label: 'City' })
    await page.getByRole('button', { name: 'Save forecast area', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Switch to backup venue', exact: true })).toBeEnabled()
    await page.reload()
    await expect(page.getByLabel('Forecast area', { exact: true })).toHaveValue('City')
    await expect(page.getByRole('button', { name: 'Switch to backup venue', exact: true })).toBeEnabled()
  })
}

test('existing RSVP submission still works with the public feed mounted', async ({ page }) => {
  await page.goto('/events/e2/rsvp')
  await page.getByLabel(/Which year are you in/).fill('Year 2')
  await page.getByRole('button', { name: 'RSVP', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'RSVP sent', exact: true })).toBeVisible()
  await expect(page.getByText('The organiser will review your RSVP soon.', { exact: true })).toBeVisible()
  expect((await db(page)).rsvps.find(rsvp => rsvp.eventId === 'e2' && rsvp.userId === 'u1').status).toBe('pending')
})

for (const width of [375, 575, 768, 1280]) {
  test(`workspace reflows without horizontal page overflow at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    for (const tab of ['tasks', 'budget', 'weather']) {
      await openTool(page, tab)
      await expect(page.getByRole('heading').first()).toBeVisible()
      if (tab === 'tasks') {
        await addTask(page, 'Check microphones and confirm the longer sound-check schedule with volunteers')
      } else if (tab === 'budget') {
        await page.getByLabel('Item name', { exact: true }).fill('Sound equipment and volunteer refreshments')
        await page.getByLabel('Planned cost (SGD)', { exact: true }).fill('100.00')
        await page.getByLabel('Actual cost (SGD)', { exact: true }).fill('89.99')
        await page.getByRole('button', { name: 'Save item', exact: true }).click()
        await expect(page.getByRole('button', { name: 'Edit expense: Sound equipment and volunteer refreshments', exact: true })).toBeVisible()
      } else {
        await expect(page.getByRole('heading', { name: 'Thundery Showers', exact: true })).toBeVisible()
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`${tab}-${width}.png`), fullPage: true })
    }
    expect(errors).toEqual([])
  })
}
