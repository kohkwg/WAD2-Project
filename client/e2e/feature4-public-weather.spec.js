import { test, expect } from '@playwright/test'
import { createSeedData } from '../src/utils/mockData.js'

const ENDPOINT = '**/v2/real-time/api/two-hr-forecast*'
const STORE = 'bookedz-feature2-demo'

function forecast() {
  return { code: 0, data: {
    area_metadata: [{ name: 'City', label_location: { latitude: 1.2966, longitude: 103.8502 } }],
    items: [{ timestamp: '2026-10-16T11:55:00+08:00', update_timestamp: '2026-10-16T11:55:00+08:00',
      valid_period: { start: '2026-10-16T12:00:00+08:00', end: '2026-10-16T14:00:00+08:00' },
      forecasts: [{ area: 'City', forecast: 'Thundery Showers' }] }],
  } }
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-16T04:00:00Z'))
  await page.route('**/*.supabase.co/**', route => route.abort())
  await page.route(ENDPOINT, route => route.fulfill({ json: forecast() }))
})

test('weather entry and refresh each use one response snapshot', async ({ page }) => {
  let requests = 0
  await page.unroute(ENDPOINT)
  await page.route(ENDPOINT, route => { requests++; return route.fulfill({ json: forecast() }) })
  await page.goto('/organiser/events/e-weather-demo/manage?tab=weather')
  await expect(page.getByRole('heading', { name: 'Thundery Showers', exact: true })).toBeVisible()
  expect(requests).toBe(1)

  await page.getByRole('button', { name: 'Refresh weather', exact: true }).click()
  await expect.poll(() => requests).toBe(2)
  await expect(page.getByRole('heading', { name: 'Thundery Showers', exact: true })).toBeVisible()
})

test('public announcement feed precedes RSVP actions on mobile and survives submit', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  const seededData = createSeedData()
  await page.addInitScript(({ key, data }) => {
    const event = data.events.find(item => item.id === 'e2')
    event.questions = [{ id: 'accessibility-q', type: 'yesno', required: true,
      text: 'This is a deliberately long participant question about accessibility arrangements and any relevant event requirements.' }]
    data.feature4 = data.feature4 || { version: 1, tasks: [], announcements: [], budgets: {}, forecastAreas: {} }
    data.feature4.announcements.push({ id: 'mobile-post', eventId: 'e2', kind: 'manual',
      createdAt: '2026-10-16T04:00:00.000Z', updatedAt: null,
      body: 'A long public update with access information, timing details, and a reminder to contact the organiser if arrangements need to change.' })
    localStorage.setItem(key, JSON.stringify(data))
  }, { key: STORE, data: seededData })
  await page.goto('/events/e2/rsvp')

  const feed = page.getByRole('region', { name: 'Event announcements' })
  const form = page.getByRole('heading', { name: 'RSVP', exact: true })
  await expect(feed).toContainText(/long public update/)
  await expect(form).toBeVisible()
  const feedBox = await feed.boundingBox()
  const formBox = await form.boundingBox()
  expect(feedBox.y).toBeLessThan(formBox.y)
  expect(await page.evaluate(() => {
    const feedNode = document.querySelector('#public-announcements-heading')
    const formNode = [...document.querySelectorAll('h2')].find(node => node.textContent.trim() === 'RSVP')
    return Boolean(feedNode.compareDocumentPosition(formNode) & Node.DOCUMENT_POSITION_FOLLOWING)
  })).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  const group = page.getByRole('group', { name: /deliberately long participant question/i })
  await expect(group).toContainText('(required)')
  const requiredRadio = group.getByRole('radio', { name: 'Yes' })
  await expect(requiredRadio).toHaveAttribute('required', '')
  await expect(requiredRadio).toBeVisible()
  await expect(group.getByRole('radio', { name: 'No' })).toBeVisible()
  await page.getByRole('button', { name: 'RSVP', exact: true }).click()
  const alert = page.getByRole('alert').filter({ hasText: /please answer/i })
  await expect(alert).toBeVisible()
  await expect(requiredRadio).toHaveAttribute('aria-invalid', 'true')
  await expect(requiredRadio).toHaveAttribute('aria-describedby', /accessibility-q-error/)
  await expect(alert).toBeFocused()

  await requiredRadio.check()
  await page.getByRole('button', { name: 'RSVP', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'RSVP sent', exact: true })).toBeVisible()
  await expect(feed).toContainText(/long public update/)
})

test('public list cards and loading/errors use clear status semantics', async ({ page }) => {
  await page.addInitScript(() => {
    const originalTimeout = window.setTimeout.bind(window)
    window.setTimeout = (callback, delay, ...args) => originalTimeout(callback, delay === 250 ? 800 : delay, ...args)
  })
  await page.goto('/organiser/events')
  await expect(page.getByRole('status')).toContainText(/loading your events/i)
  await expect(page.getByRole('heading', { name: 'My events', exact: true })).toBeVisible()
  const cardHeading = page.getByRole('heading', { name: 'Intro to Vue Workshop', exact: true })
  await expect(cardHeading).toBeVisible()
  expect(await cardHeading.evaluate(node => node.tagName)).toBe('H2')
  await expect(page.locator('.progress[aria-hidden="true"]')).toHaveCount(3)
  await expect(page.getByText(/confirmed \+ .*offers out of .*seats/).first()).toBeVisible()

  await page.goto('/events')
  await expect(page.getByRole('status')).toContainText(/loading events/i)
  const eventCardHeading = page.getByRole('heading', { name: 'Intro to Vue Workshop', exact: true })
  await expect(eventCardHeading).toBeVisible()
  expect(await eventCardHeading.evaluate(node => node.tagName)).toBe('H2')
})

test('public announcements load when the private RSVP profile read fails', async ({ page }) => {
  const seededData = createSeedData()
  seededData.users = seededData.users.filter(user => user.id !== 'u1')
  seededData.feature4 = { version: 1, tasks: [], announcements: [{ id: 'public-only', eventId: 'e2', kind: 'manual',
    createdAt: '2026-10-16T04:00:00.000Z', updatedAt: null, body: 'Public update stays available.' }], budgets: {}, forecastAreas: {} }
  await page.addInitScript(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key: STORE, data: seededData })
  await page.goto('/events/e2/rsvp')

  await expect(page.getByRole('alert')).toContainText(/could not load this event.*user not found/i)
  const feed = page.getByRole('region', { name: 'Event announcements' })
  await expect(feed).toContainText('Public update stays available.')
  await expect(feed).toHaveCount(1)
})
