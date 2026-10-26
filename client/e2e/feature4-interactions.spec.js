import { test, expect } from '@playwright/test'

const STORE = 'bookedz-feature2-demo'
const ENDPOINT = '**/v2/real-time/api/two-hr-forecast*'

function forecast() {
  return { code: 0, data: { area_metadata: [{ name: 'City', label_location: { latitude: 1.2966, longitude: 103.8502 } }], items: [{ update_timestamp: '2026-10-16T11:55:00+08:00', timestamp: '2026-10-16T11:55:00+08:00', valid_period: { start: '2026-10-16T12:00:00+08:00', end: '2026-10-16T14:00:00+08:00' }, forecasts: [{ area: 'City', forecast: 'Thundery Showers' }] }] } }
}

async function openTool(page, tab = 'tasks') {
  await page.goto(`/organiser/events/e-weather-demo/manage?tab=${tab}`)
  const heading = { tasks: 'Tasks', announcements: 'Announcements', budget: 'Budget', weather: 'Weather' }[tab]
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
}

async function failStorage(page) {
  await page.evaluate(() => {
    window.__originalSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'bookedz-feature2-demo') throw new DOMException('Storage full', 'QuotaExceededError')
      return window.__originalSetItem.call(this, key, value)
    }
  })
}

async function restoreStorage(page) {
  await page.evaluate(() => { Storage.prototype.setItem = window.__originalSetItem })
}

async function failDelete(page, target, cancelWith = 'Cancel') {
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await dialog.getByRole('button', { name: cancelWith, exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await restoreStorage(page)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(target).toBeVisible()
  await expect(target).toBeFocused()
}

async function openTaskActions(page, title) {
  const trigger = page.getByRole('button', { name: `More actions for: ${title}`, exact: true })
  await trigger.click()
  return trigger
}

async function requestTaskDelete(page, title) {
  const row = page.locator('.task-row').filter({ has: page.locator('.task-title').filter({ hasText: title }) })
  await openTaskActions(page, title)
  const action = row.locator('.action-disclosure').getByRole('button', { name: 'Delete', exact: true })
  await action.click()
  return action
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-16T04:00:00.000Z'))
  await page.route('**/*.supabase.co/**', route => route.abort())
  await page.route(ENDPOINT, route => route.fulfill({ json: forecast() }))
})

test('cancelled task, announcement and expense deletes invalidate their failed retries', async ({ page }) => {
  await openTool(page)
  await page.getByRole('button', { name: 'Add task', exact: true }).click()
  await page.getByLabel('Task title', { exact: true }).fill('Retry target task')
  await page.getByRole('button', { name: 'Save task', exact: true }).click()
  const taskDelete = await requestTaskDelete(page, 'Retry target task')
  await failStorage(page)
  await failDelete(page, taskDelete)
  await expect(page.getByRole('button', { name: 'Retry save', exact: true })).toHaveCount(0)
  await expect(taskDelete).toBeVisible()

  await page.getByRole('button', { name: 'Add task', exact: true }).click()
  await page.getByLabel('Task title', { exact: true }).fill('Changed retry target')
  await page.getByRole('button', { name: 'Save task', exact: true }).click()
  const changedTaskDelete = await requestTaskDelete(page, 'Changed retry target')
  await expect(page.getByRole('button', { name: 'Retry save', exact: true })).toHaveCount(0)
  await failStorage(page)
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  await restoreStorage(page)
  await changedTaskDelete.click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.task-row').filter({ has: page.locator('.task-title').filter({ hasText: 'Retry target task' }) })).toBeVisible()
  await expect(page.locator('.task-row').filter({ has: page.locator('.task-title').filter({ hasText: 'Changed retry target' }) })).toHaveCount(0)

  await openTool(page, 'announcements')
  await page.getByLabel('Announcement text', { exact: true }).fill('Retry target post')
  await page.getByRole('button', { name: 'Publish announcement', exact: true }).click()
  const postDelete = page.getByRole('button', { name: 'Delete announcement: Retry target post', exact: true })
  await postDelete.click()
  await failStorage(page)
  await failDelete(page, postDelete)
  await expect(postDelete).toBeFocused()
  await expect(page.getByRole('button', { name: 'Retry save', exact: true })).toHaveCount(0)
  await postDelete.click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Write announcement', exact: true })).toBeFocused()

  await openTool(page, 'budget')
  await page.getByLabel('Item name', { exact: true }).fill('Retry target expense')
  await page.getByLabel('Planned cost (SGD)', { exact: true }).fill('12.00')
  await page.getByRole('button', { name: 'Save item', exact: true }).click()
  const expenseDelete = page.getByRole('button', { name: 'Delete expense: Retry target expense', exact: true })
  await expenseDelete.click()
  await failStorage(page)
  await failDelete(page, expenseDelete)
  await expect(expenseDelete).toBeFocused()
  await expect(page.getByRole('button', { name: 'Retry save', exact: true })).toHaveCount(0)
  await expenseDelete.click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'New expense', exact: true })).toBeFocused()
})

test('task completion keeps status on failed save and retry', async ({ page }) => {
  await openTool(page)
  await page.getByRole('button', { name: 'Add task', exact: true }).click()
  await page.getByLabel('Task title', { exact: true }).fill('Keyboard focus task')
  await page.getByRole('button', { name: 'Save task', exact: true }).click()
  await page.locator('.task-title').filter({ hasText: 'Keyboard focus task' }).focus()
  await page.locator('.task-title').filter({ hasText: 'Keyboard focus task' }).click()
  await page.getByRole('button', { name: 'Start task', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Back to to do', exact: true })).toBeVisible()
  const checkbox = page.getByLabel('Complete task: Keyboard focus task', { exact: true })
  await checkbox.focus()
  await failStorage(page)
  await checkbox.click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(checkbox).toBeFocused()
  await expect(checkbox).not.toBeChecked()
  await restoreStorage(page)
  await page.getByRole('button', { name: 'Retry save', exact: true }).click()
  await page.getByRole('group', { name: 'Filter tasks by status' }).getByRole('button', { name: /^Completed\b/ }).click()
  await expect(page.getByLabel('Reopen task: Keyboard focus task', { exact: true })).toBeChecked()
})

test('completing from All sends focus to a visible task when Completed is collapsed', async ({ page }) => {
  await openTool(page)
  for (const title of ['Focus first task', 'Focus next task']) {
    await page.getByRole('button', { name: 'Add task', exact: true }).click()
    await page.locator('#task-title').fill(title)
    await page.getByRole('button', { name: 'Save task', exact: true }).click()
  }
  await page.getByRole('group', { name: 'Filter tasks by status' }).getByRole('button', { name: /^All\b/ }).click()
  await page.getByLabel('Complete task: Focus first task', { exact: true }).click()
  await expect(page.getByLabel('Complete task: Focus next task', { exact: true })).toBeFocused()
  await expect(page.getByLabel('Reopen task: Focus first task', { exact: true })).toHaveCount(0)
})

test('dialog cancel and Escape restore the opener; successful delete focuses a nearby task action', async ({ page }) => {
  await openTool(page)
  await page.getByRole('button', { name: 'Add task', exact: true }).click()
  await page.getByLabel('Task title', { exact: true }).fill('Dialog focus task')
  await page.getByRole('button', { name: 'Save task', exact: true }).click()
  const menuOpener = page.getByRole('button', { name: 'More actions for: Dialog focus task', exact: true })
  await menuOpener.focus()
  await menuOpener.click()
  await page.keyboard.press('Escape')
  await expect(menuOpener).toHaveAttribute('aria-expanded', 'false')
  await expect(menuOpener).toBeFocused()
  await menuOpener.click()
  const opener = page.getByRole('button', { name: 'Delete', exact: true })
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()

  await opener.click()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()

  await opener.click()
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add task', exact: true })).toBeFocused()
})

test('weather confirmation returns focus on cancellation and success', async ({ page }) => {
  await openTool(page, 'weather')
  const opener = page.getByRole('button', { name: 'Switch to backup venue', exact: true })
  await expect(opener).toBeEnabled()
  await opener.focus()
  await opener.click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(opener).toBeFocused()

  await opener.click()
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm switch', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Weather', exact: true })).toBeFocused()
})

test('missing forecast areas expose Retry areas and recover from a valid snapshot', async ({ page }) => {
  await openTool(page)
  await page.evaluate(key => {
    const db = JSON.parse(localStorage.getItem(key))
    const event = db.events.find(item => item.id === 'e-weather-demo')
    delete event.venue.lat
    delete event.venue.lng
    if (event.originalVenue) { delete event.originalVenue.lat; delete event.originalVenue.lng }
    localStorage.setItem(key, JSON.stringify(db))
  }, STORE)
  await page.unroute(ENDPOINT)
  let validAreas = false
  await page.route(ENDPOINT, route => route.fulfill({ json: validAreas ? forecast() : {
    code: 0,
    data: { area_metadata: [{ name: 'Broken', label_location: { latitude: 1000, longitude: 103.85 } }], items: forecast().data.items },
  } }))

  await openTool(page, 'weather')
  await expect(page.getByRole('alert')).toContainText(/forecast areas are unavailable/i)
  await expect(page.getByRole('button', { name: 'Retry areas', exact: true })).toBeEnabled()
  await expect(page.getByRole('heading', { name: 'Forecast unavailable', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Switch to backup venue', exact: true })).toHaveCount(0)

  validAreas = true
  await page.getByRole('button', { name: 'Retry areas', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByLabel('Forecast area', { exact: true }).locator('option', { hasText: 'City' })).toHaveCount(1)
  await page.getByLabel('Forecast area', { exact: true }).selectOption('City')
  await page.getByRole('button', { name: 'Save forecast area', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Switch to backup venue', exact: true })).toBeEnabled()
})
