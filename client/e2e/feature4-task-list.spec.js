import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

const STORE = 'bookedz-feature2-demo'
const EVENT_ID = 'e-weather-demo'
const LONG_TITLE = 'Long title for viewport reflow and keyboard scanning '.repeat(3)
const liveVisibilityApi = readFileSync(new URL('../src/utils/api.js', import.meta.url), 'utf8')
  .replace(/export const USING_SUPABASE = .*/, 'export const USING_SUPABASE = true')
  .replace(/const backend = .*/, 'const backend = mockApi')
  .replace(/const operationsBackend = .*/, 'const operationsBackend = mockApi')
  .replace(/const weatherBackend = .*/, 'const weatherBackend = mockApi')

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-16T04:00:00.000Z'))
  await page.route('**/*.supabase.co/**', route => route.abort())
  await page.route('**/v2/real-time/api/two-hr-forecast*', route => route.abort())
})

async function openTasks(page) {
  await page.goto(`/organiser/events/${EVENT_ID}/manage?tab=tasks`)
  await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible()
}

async function seedTasks(page, count = 100) {
  await openTasks(page)
  await page.evaluate(({ key, eventId, count, longTitle }) => {
    const db = JSON.parse(localStorage.getItem(key))
    db.feature4.tasks = Array.from({ length: count }, (_, index) => ({
      id: `scale-task-${index}`,
      eventId,
      title: index === 0 ? longTitle : `Scale task ${String(index).padStart(3, '0')}`,
      notes: index === 0 ? 'Searchable note: MATCH THIS NOTE' : `Notes for task ${index}`,
      status: ['todo', 'in_progress', 'done'][index % 3],
      position: Math.floor(index / 3),
    }))
    localStorage.setItem(key, JSON.stringify(db))
  }, { key: STORE, eventId: EVENT_ID, count, longTitle: LONG_TITLE })
  await page.reload()
  await expect(page.locator('.task-title').filter({ hasText: 'Long title for viewport reflow' })).toBeVisible()
}

test('open, completed and all filters save the full board with hidden tasks intact', async ({ page }) => {
  await seedTasks(page)
  const before = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).feature4.tasks.map(task => task.id), STORE)
  const filters = page.getByRole('group', { name: 'Filter tasks by status' })

  await expect(filters.getByRole('button', { name: /^Open\b/ })).toContainText('67')
  await expect(filters.getByRole('button', { name: /^Completed\b/ })).toContainText('33')
  await expect(filters.getByRole('button', { name: /^All\b/ })).toContainText('100')
  await expect(filters.getByRole('button', { name: /^Open\b/ })).toHaveAttribute('aria-pressed', 'true')
  await filters.getByRole('button', { name: /^All\b/ }).click()
  await expect(page.locator('.task-title').filter({ hasText: 'Scale task 001' })).toBeVisible()
  await filters.getByRole('button', { name: /^Completed\b/ }).click()
  await expect(page.locator('.task-title').filter({ hasText: 'Scale task 002' })).toBeVisible()
  await filters.getByRole('button', { name: /^Open\b/ }).click()
  await expect(page.locator('.task-title').filter({ hasText: 'Scale task 002' })).toHaveCount(0)

  await page.getByLabel('Search tasks', { exact: true }).fill('match this note')
  await expect(page.locator('.task-title').filter({ hasText: 'Long title for viewport reflow' })).toBeVisible()
  await expect(page.getByText(/matching task/i)).toBeVisible()
  await page.getByLabel(`Complete task: ${LONG_TITLE}`, { exact: true }).click()
  await filters.getByRole('button', { name: /^Completed\b/ }).click()
  await expect(page.getByLabel(`Reopen task: ${LONG_TITLE}`, { exact: true })).toBeChecked()

  const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).feature4.tasks, STORE)
  expect(after).toHaveLength(100)
  expect(after.map(task => task.id).sort()).toEqual([...before].sort())
  expect(after.find(task => task.id === 'scale-task-0').status).toBe('done')
  expect(after.filter(task => task.id !== 'scale-task-0').every(task => task.status === ['todo', 'in_progress', 'done'][Number(task.id.split('-').at(-1)) % 3])).toBe(true)
})

test('deep links restore task filter and search; composer draft survives local section changes', async ({ page }) => {
  await seedTasks(page)
  await expect(page.getByRole('button', { name: /^Open\b/ })).toHaveAttribute('aria-pressed', 'true')
  await page.getByLabel('Search tasks', { exact: true }).fill('nothing matches this')
  await expect(page.getByText('No matching tasks.', { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/taskSearch=nothing\+matches\+this/)
  const search = page.getByLabel('Search tasks', { exact: true })
  await search.fill('')
  await search.pressSequentially('Scale task 002', { delay: 0 })
  await expect(search).toHaveValue('Scale task 002')
  await expect(page).toHaveURL(/taskSearch=Scale\+task\+002/)
  await page.getByRole('group', { name: 'Filter tasks by status' }).getByRole('button', { name: /^Completed\b/ }).click()
  await expect(page).toHaveURL(/taskFilter=completed.*taskSearch=Scale\+task\+002|taskSearch=Scale\+task\+002.*taskFilter=completed/)
  await page.reload()
  await expect(page.getByLabel('Search tasks', { exact: true })).toHaveValue('Scale task 002')
  await expect(page.getByRole('group', { name: 'Filter tasks by status' }).getByRole('button', { name: /^Completed\b/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.task-title').filter({ hasText: 'Scale task 002' })).toBeVisible()
  await page.getByLabel('Search tasks', { exact: true }).fill('')
  await page.getByRole('button', { name: 'Add task', exact: true }).click()
  await expect(page.getByRole('form', { name: 'Add task' })).toBeVisible()
  await page.getByLabel('Task title', { exact: true }).fill('Unsaved scoped task')
  await page.getByRole('link', { name: /^Announcements\b/ }).click()
  await expect(page.getByRole('heading', { name: 'Announcements', exact: true })).toBeVisible()
  await page.getByRole('link', { name: /^Tasks\b/ }).click()
  await expect(page.getByLabel('Task title', { exact: true })).toHaveValue('Unsaved scoped task')
  await expect(page.getByRole('button', { name: /^Completed\b/ })).toHaveAttribute('aria-pressed', 'true')
})

test('composer draft survives row editing and dirty edits cannot be replaced', async ({ page }) => {
  await openTasks(page)
  for (const title of ['Existing task one', 'Existing task two']) {
    await page.getByRole('button', { name: 'Add task', exact: true }).click()
    await page.locator('#task-title').fill(title)
    await page.getByRole('button', { name: 'Save task', exact: true }).click()
    await expect(page.locator('.task-title').filter({ hasText: title })).toBeVisible()
  }

  await page.getByRole('button', { name: 'Add task', exact: true }).click()
  await page.locator('#task-title').fill('New task draft')
  await page.getByRole('button', { name: 'More actions for: Existing task one', exact: true }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const firstTitleInput = page.locator('input[id^="task-title-edit-"]').first()
  await firstTitleInput.fill('Edited existing task one')

  await page.getByRole('button', { name: 'More actions for: Existing task two', exact: true }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(firstTitleInput).toHaveValue('Edited existing task one')
  await expect(page.locator('input[id^="task-title-edit-"]')).toHaveCount(1)
  await page.getByRole('button', { name: 'Cancel edit', exact: true }).click()
  await expect(page.locator('#task-title')).toHaveValue('New task draft')
  await expect(page.locator('.task-title').filter({ hasText: 'Existing task two' })).toBeVisible()
})

test('leaving Manage event closes a task delete dialog and it can reopen on return', async ({ page }) => {
  await openTasks(page)
  await page.getByRole('button', { name: 'Add task', exact: true }).click()
  await page.getByLabel('Task title', { exact: true }).fill('Dialog route task')
  await page.getByRole('button', { name: 'Save task', exact: true }).click()
  await page.getByRole('button', { name: 'More actions for: Dialog route task', exact: true }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.evaluate(() => {
    window.__originalSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'bookedz-feature2-demo') throw new DOMException('Storage full', 'QuotaExceededError')
      return window.__originalSetItem.call(this, key, value)
    }
  })
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible()

  await page.evaluate(async () => {
    const router = document.querySelector('#app').__vue_app__.config.globalProperties.$router
    await router.push('/organiser/events/e-weather-demo/rsvps')
  })
  await expect(page).toHaveURL(/\/organiser\/events\/e-weather-demo\/rsvps/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.evaluate(() => { Storage.prototype.setItem = window.__originalSetItem })
  await page.getByRole('link', { name: /Back to Manage event/ }).click()
  await expect(page).toHaveURL(/\/organiser\/events\/e-weather-demo\/manage\?tab=tasks/)
  await expect(page.getByRole('button', { name: 'Retry save', exact: true })).toHaveCount(0)
  const menu = page.getByRole('button', { name: 'More actions for: Dialog route task', exact: true })
  await menu.click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.task-title').filter({ hasText: 'Dialog route task' })).toHaveCount(0)
})

test('100 tasks reflow at course widths with light, dark and reduced motion settings', async ({ page }, testInfo) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' })
  await seedTasks(page)
  for (const width of [375, 575, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: scheme })
      await expect(page.getByLabel('Search tasks', { exact: true })).toBeVisible()
      await expect(page.locator('.task-title').filter({ hasText: 'Long title for viewport reflow' })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      expect(await page.locator('main').count()).toBe(1)
      expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
      if ((scheme === 'light' && width === 375) || (scheme === 'dark' && width === 1280)) {
        await page.screenshot({ path: testInfo.outputPath(`tasks-${scheme}-${width}.png`) })
      }
    }
  }
  await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'light' })
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(false)
  expect(errors).toEqual([])
})

test('live-only event tools stay hidden in demo and appear in a live-visibility fixture', async ({ page }) => {
  await openTasks(page)
  const demoNavigation = page.getByRole('navigation', { name: 'Event workspace navigation' })
  await expect(demoNavigation.getByRole('link', { name: 'Registrations', exact: true })).toBeVisible()
  await expect(demoNavigation.getByRole('link', { name: 'Check-in', exact: true })).toHaveCount(0)

  await page.route(/\/src\/utils\/api(?:\.js)?(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: liveVisibilityApi }))
  await page.reload()
  const liveFixtureNavigation = page.getByRole('navigation', { name: 'Event workspace navigation' })
  for (const name of ['Check-in station', 'Venue QR', 'Attendance report', 'Floor plan']) {
    await expect(liveFixtureNavigation.getByRole('link', { name, exact: true })).toBeVisible()
  }
})
