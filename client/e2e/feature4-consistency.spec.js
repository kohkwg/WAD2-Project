import { test, expect } from '@playwright/test'

const NOW = '2026-10-16T04:00:00.000Z'
const STORE = 'bookedz-feature2-demo'
const EVENT_ID = 'e-weather-demo'

test.beforeEach(async ({ page, context }) => {
  await page.clock.setFixedTime(new Date(NOW))
  await context.route('**/*.supabase.co/**', route => route.abort())
  await context.route('**/v2/real-time/api/two-hr-forecast*', route => route.fulfill({ json: {
    code: 0,
    data: {
      area_metadata: [{ name: 'City', label_location: { latitude: 1.2966, longitude: 103.8502 } }],
      items: [{
        timestamp: '2026-10-16T11:55:00+08:00', update_timestamp: '2026-10-16T11:55:00+08:00',
        valid_period: { start: '2026-10-16T12:00:00+08:00', end: '2026-10-16T14:00:00+08:00' },
        forecasts: [{ area: 'City', forecast: 'Thundery Showers' }],
      }],
    },
  } }))
})

async function addTask(page, title) {
  await page.getByLabel('Task title', { exact: true }).fill(title)
  await page.getByRole('button', { name: 'Add task', exact: true }).click()
  await expect(page.locator('.task-title').filter({ hasText: title })).toBeVisible()
}

async function preparePublicPage(page) {
  await page.goto(`/organiser/events/${EVENT_ID}/manage?tab=tasks`)
  await expect(page.getByLabel('Task title', { exact: true })).toBeVisible()
  await page.evaluate(({ key, id }) => {
    const state = JSON.parse(localStorage.getItem(key))
    state.events.find(event => event.id === id).questions = [
      { id: 'arrival', text: 'When will you arrive?', type: 'text', required: true },
    ]
    localStorage.setItem(key, JSON.stringify(state))
  }, { key: STORE, id: EVENT_ID })
  await page.goto(`/events/${EVENT_ID}/rsvp`)
  await expect(page.getByLabel('Name', { exact: true })).toBeVisible()
  await page.getByLabel('Name', { exact: true }).fill('Draft participant')
  await page.getByLabel('Email', { exact: true }).fill('draft@demo.smu.edu.sg')
  await page.getByLabel(/When will you arrive/).fill('12:15')
  await expect(page.getByText(/^Venue:/).locator('..')).toContainText('SMU Campus Green')
}

async function switchVenue(page) {
  await page.evaluate(async id => {
    const api = await import('/src/utils/api.js')
    await api.confirmBackupVenueSwitch(id)
  }, EVENT_ID)
}

async function expectDraft(page) {
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Draft participant')
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('draft@demo.smu.edu.sg')
  await expect(page.getByLabel(/When will you arrive/)).toHaveValue('12:15')
}

test('task order stays canonical after multiple deletions and a new task', async ({ page }) => {
  await page.goto(`/organiser/events/${EVENT_ID}/manage?tab=tasks`)
  for (const title of ['A', 'B', 'C', 'D']) await addTask(page, title)
  for (const title of ['A', 'B']) {
    await page.getByRole('button', { name: `More actions for: ${title}`, exact: true }).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
  }
  await addTask(page, 'E')
  const todo = page.getByRole('list', { name: 'To do tasks' }).locator('.task-title')
  await expect(todo).toHaveText(['C', 'D', 'E'])
  await page.locator('.task-title').filter({ hasText: 'E' }).click()
  await page.getByRole('button', { name: 'Start task', exact: true }).click()
  await expect(page.getByRole('list', { name: 'In progress tasks' })).toContainText('E')
  await page.reload()
  await expect(page.getByRole('list', { name: 'To do tasks' })).toContainText('C')
  await expect(page.getByRole('list', { name: 'In progress tasks' })).toContainText('E')
})

test('public announcement refresh updates the venue while preserving RSVP drafts', async ({ page }) => {
  await preparePublicPage(page)
  await switchVenue(page)
  await page.getByRole('button', { name: 'Refresh announcements', exact: true }).click()
  await expect(page.getByText(/^Venue:/).locator('..')).toContainText('SMU Administration Building')
  await expect(page.getByText('Backup venue is active.', { exact: true })).toBeVisible()
  await expect(page.locator('[aria-labelledby="public-announcements-heading"] article')).toHaveCount(1)
  await expectDraft(page)
})

test('failed event refresh keeps the old venue and feed together until retry succeeds', async ({ page }) => {
  await preparePublicPage(page)
  await switchVenue(page)
  await page.evaluate(() => {
    window.__consistencySetItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'bookedz-feature2-demo') throw new DOMException('Storage full', 'QuotaExceededError')
      return window.__consistencySetItem.call(this, key, value)
    }
  })
  await page.getByRole('button', { name: 'Refresh announcements', exact: true }).click()
  await expect(page.locator('[aria-labelledby="public-announcements-heading"]').getByRole('alert')).toContainText(/storage|refresh|load/i)
  await expect(page.getByText(/^Venue:/).locator('..')).toContainText('SMU Campus Green')
  await expect(page.locator('[aria-labelledby="public-announcements-heading"] article')).toHaveCount(0)
  await expectDraft(page)
  await page.evaluate(() => { Storage.prototype.setItem = window.__consistencySetItem })
  await page.getByRole('button', { name: 'Retry announcements', exact: true }).click()
  await expect(page.getByText(/^Venue:/).locator('..')).toContainText('SMU Administration Building')
  await expect(page.locator('[aria-labelledby="public-announcements-heading"] article')).toHaveCount(1)
  await expectDraft(page)
})

test('a public refresh cannot overwrite another event after a route change', async ({ page }) => {
  await preparePublicPage(page)
  await switchVenue(page)
  await page.getByRole('button', { name: 'Refresh announcements', exact: true }).click()
  await page.evaluate(async () => {
    // Use the mounted app's router, including when Vite has an HMR timestamp.
    await document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/events/e2/rsvp')
  })
  await expect(page.getByRole('heading', { name: 'Intro to Vue Workshop', exact: true })).toBeVisible()
  await expect(page.getByText(/^Venue:/).locator('..')).toContainText('SMU School of Computing and Information Systems 1')
  await expect(page.locator('[aria-labelledby="public-announcements-heading"] article')).toHaveCount(0)
  await expect(page.getByLabel(/Which year are you in/)).toHaveValue('')
})

test('a standalone public feed still refreshes without a parent event loader', async ({ page }) => {
  await page.goto('/events')
  await page.evaluate(async id => {
    const { createApp } = await import('/node_modules/.vite/deps/vue.js')
    const { default: AnnouncementFeed } = await import('/src/components/event-operations/AnnouncementFeed.vue')
    const api = await import('/src/utils/api.js')
    const host = document.createElement('div')
    document.body.append(host)
    createApp(AnnouncementFeed, { eventId: id }).mount(host)
    await api.createAnnouncement(id, 'Standalone update')
  }, EVENT_ID)
  await page.getByRole('button', { name: 'Refresh announcements', exact: true }).click()
  await expect(page.getByText('Standalone update', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Refresh announcements', exact: true })).toBeEnabled()
})
