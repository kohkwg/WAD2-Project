import { test, expect } from '@playwright/test'

const eventPath = '/organiser/events/e-weather-demo/manage'

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-16T04:00:00Z'))
  await page.setViewportSize({ width: 375, height: 750 })
  await page.route('**/*.supabase.co/**', route => route.abort())
})

for (const tool of [
  { tab: 'tasks', field: 'Task title', value: 'Check stage lighting', save: 'Add task', edit: 'Edit task: Check stage lighting' },
  { tab: 'announcements', field: 'Announcement text', value: 'Please bring your student card', save: 'Publish announcement', edit: 'Edit announcement: Please bring your student card' },
  { tab: 'budget', field: 'Item name', value: 'Stage lighting', save: 'Save item', edit: 'Edit expense: Stage lighting' },
]) {
  test(`${tool.tab} edit brings the existing draft into keyboard focus and view`, async ({ page }) => {
    await page.goto(`${eventPath}?tab=${tool.tab}`)
    const input = page.getByLabel(tool.field, { exact: true })
    await input.fill(tool.value)
    if (tool.tab === 'budget') await page.getByLabel('Planned cost (SGD)', { exact: true }).fill('125.00')
    await page.getByRole('button', { name: tool.save, exact: true }).click()
    await page.getByRole('button', { name: tool.edit, exact: true }).click()
    await expect(input).toBeFocused()
    await expect(input).toHaveValue(tool.value)
    await expect(input).toBeInViewport()
    await input.press('End')
    await input.press('!')
    await expect(input).toHaveValue(`${tool.value}!`)
  })
}

test('budget edit keeps the exact saved cents at the supported boundary', async ({ page }) => {
  await page.goto(`${eventPath}?tab=budget`)
  await page.getByLabel('Item name', { exact: true }).fill('Exact boundary expense')
  await page.getByLabel('Planned cost (SGD)', { exact: true }).fill('90071992547409.90')
  await page.getByRole('button', { name: 'Save item', exact: true }).click()
  await page.getByRole('button', { name: 'Edit expense: Exact boundary expense', exact: true }).click()
  await expect(page.getByLabel('Planned cost (SGD)', { exact: true })).toHaveValue('90071992547409.90')
  await page.getByRole('button', { name: 'Save item', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Edit expense: Exact boundary expense', exact: true })).toBeVisible()
  const cents = await page.evaluate(() => JSON.parse(localStorage.getItem('bookedz-feature2-demo')).feature4.budgets['e-weather-demo'].items[0].plannedCents)
  expect(cents).toBe(9007199254740990)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
