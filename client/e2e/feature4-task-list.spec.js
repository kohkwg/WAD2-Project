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

test('search, status filters and completion save the full board with hidden tasks intact', async ({ page }) => {
  await seedTasks(page)
  const before = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).feature4.tasks.map(task => task.id), STORE)
  const filters = page.getByRole('group', { name: 'Filter tasks by status' })

  await expect(filters.getByRole('button', { name: /^All\b/ })).toContainText('100')
  await expect(filters.getByRole('button', { name: /^To do\b/ })).toContainText('34')
  await expect(filters.getByRole('button', { name: /^In progress\b/ })).toContainText('33')
  await expect(filters.getByRole('button', { name: /^Completed\b/ })).toContainText('33')
  await filters.getByRole('button', { name: /^In progress\b/ }).click()
  await expect(page.getByRole('heading', { name: /^In progress\b/ })).toBeVisible()
  await expect(page.locator('.task-title').filter({ hasText: 'Scale task 001' })).toBeVisible()
  await expect(page.locator('.task-title').filter({ hasText: 'Scale task 000' })).toHaveCount(0)
  await filters.getByRole('button', { name: /^All\b/ }).click()

  await page.getByLabel('Search tasks', { exact: true }).fill('match this note')
  await expect(page.locator('.task-title').filter({ hasText: 'Long title for viewport reflow' })).toBeVisible()
  await expect(page.getByText(/matching task/i)).toBeVisible()
  await page.getByLabel(`Complete task: ${LONG_TITLE}`, { exact: true }).click()
  await expect(page.getByLabel(`Reopen task: ${LONG_TITLE}`, { exact: true })).toBeChecked()

  const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).feature4.tasks, STORE)
  expect(after).toHaveLength(100)
  expect(after.map(task => task.id).sort()).toEqual([...before].sort())
  expect(after.find(task => task.id === 'scale-task-0').status).toBe('done')
  expect(after.filter(task => task.id !== 'scale-task-0').every(task => task.status === ['todo', 'in_progress', 'done'][Number(task.id.split('-').at(-1)) % 3])).toBe(true)
})

test('search distinguishes no results and draft survives filters and local section changes', async ({ page }) => {
  await openTasks(page)
  await page.locator('#task-title').fill('Existing task')
  await page.getByRole('button', { name: 'Add task', exact: true }).click()
  await page.getByLabel('Task title', { exact: true }).fill('Unsaved scoped task')
  await page.getByLabel('Search tasks', { exact: true }).fill('nothing matches this')
  await expect(page.getByText('No matching tasks.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Clear search', exact: true }).click()
  await page.getByRole('group', { name: 'Filter tasks by status' }).getByRole('button', { name: /^Completed\b/ }).click()
  await page.getByRole('link', { name: /^Announcements\b/ }).click()
  await expect(page.getByRole('heading', { name: 'Announcements', exact: true })).toBeVisible()
  await page.getByRole('link', { name: /^Tasks\b/ }).click()
  await expect(page.getByLabel('Task title', { exact: true })).toHaveValue('Unsaved scoped task')
})

test('composer draft survives row editing and dirty edits cannot be replaced', async ({ page }) => {
  await openTasks(page)
  for (const title of ['Existing task one', 'Existing task two']) {
    await page.locator('#task-title').fill(title)
    await page.getByRole('button', { name: 'Add task', exact: true }).click()
    await expect(page.locator('.task-title').filter({ hasText: title })).toBeVisible()
  }

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
  const demoTools = page.getByRole('navigation', { name: 'Event tools' })
  await expect(demoTools.getByRole('link', { name: /^Manage RSVPs\b/ })).toBeVisible()
  for (const name of ['Check-in station', 'Venue QR', 'Attendance', 'Floor plan']) {
    await expect(demoTools.getByRole('link', { name: new RegExp(`^${name}\\b`) })).toHaveCount(0)
  }

  await page.route(/\/src\/utils\/api(?:\.js)?(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: liveVisibilityApi }))
  await page.reload()
  const liveFixtureTools = page.getByRole('navigation', { name: 'Event tools' })
  for (const name of ['Check-in station', 'Venue QR', 'Attendance', 'Floor plan']) {
    await expect(liveFixtureTools.getByRole('link', { name: new RegExp(`^${name}\\b`) })).toBeVisible()
  }
})
