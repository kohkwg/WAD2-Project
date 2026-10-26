import { test, expect } from '@playwright/test'

const eventPath = '/organiser/events/e-weather-demo/manage'
const seenKey = 'bookedz:organiser-tour:v1:demo:org1'
test.use({ storageState: { cookies: [], origins: [] } })

test.beforeEach(async ({ page }) => {
  await page.route('**/*.supabase.co/**', route => route.abort())
  await page.route('**/two-hr-forecast*', route => route.abort())
})

test('first owner entry offers the tour, Skip is remembered and replay restores the original view', async ({ page }) => {
  await page.goto(eventPath + '?tab=budget')
  const tour = page.getByRole('dialog', { name: 'Manage event tutorial' })
  await expect(tour).toBeVisible()
  await expect(tour.getByText('Step 1 of 8', { exact: true })).toBeVisible()
  await expect(tour.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled()
  await tour.getByRole('button', { name: 'Skip', exact: true }).click()
  await expect(tour).toHaveCount(0)
  await expect(page).toHaveURL(/tab=budget/)
  expect(await page.evaluate(key => localStorage.getItem(key), seenKey)).toBeTruthy()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Budget', exact: true })).toBeVisible()
  await expect(tour).toHaveCount(0)
  await page.getByRole('button', { name: 'Replay tutorial', exact: true }).click()
  await expect(tour).toBeVisible()
  await tour.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(tour.getByText('Step 2 of 8', { exact: true })).toBeVisible()
  await tour.getByRole('button', { name: 'Previous', exact: true }).click()
  await expect(tour.getByText('Step 1 of 8', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(tour).toHaveCount(0)
  await expect(page).toHaveURL(/tab=budget/)
  await expect(page.getByRole('button', { name: 'Replay tutorial', exact: true })).toBeFocused()
  const anotherEvent = await page.evaluate(() => JSON.parse(localStorage.getItem('bookedz-feature2-demo')).events.find(event => event.organiserId === 'org1' && event.id !== 'e-weather-demo').id)
  await page.goto(`/organiser/events/${anotherEvent}/manage?tab=tasks`)
  await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible()
  await expect(tour).toHaveCount(0)
})

test('owner can finish all steps without writes and retains task draft and query', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, 'completed'), seenKey)
  await page.goto(eventPath + '?tab=tasks&taskFilter=all&taskSearch=unchanged')
  await page.getByRole('button', { name: 'Add task', exact: true }).click()
  await page.getByLabel('Task title', { exact: true }).fill('[TEST] Draft before tutorial')
  const before = await page.evaluate(() => localStorage.getItem('bookedz-feature2-demo'))
  await page.getByRole('button', { name: 'Replay tutorial', exact: true }).click()
  const tour = page.getByRole('dialog', { name: 'Manage event tutorial' })
  for (let step = 1; step <= 8; step++) {
    await expect(tour.getByText(`Step ${step} of 8`, { exact: true })).toBeVisible()
    await expect(tour.locator('.tour-spotlight')).toBeVisible()
    await tour.getByRole('button', { name: step === 8 ? 'Finish' : 'Next', exact: true }).click()
  }
  await expect(tour).toHaveCount(0)
  await expect(page).toHaveURL(/tab=tasks&taskFilter=all&taskSearch=unchanged/)
  await expect(page.getByLabel('Task title', { exact: true })).toHaveValue('[TEST] Draft before tutorial')
  expect(await page.evaluate(() => localStorage.getItem('bookedz-feature2-demo'))).toBe(before)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible()
  await expect(tour).toHaveCount(0)
})

for (const width of [375, 575, 768, 1280]) {
  test(`tour stays within the viewport and exposes guest navigation at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 850 })
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(eventPath + '?tab=tasks')
    const tour = page.getByRole('dialog', { name: 'Manage event tutorial' })
    for (let step = 1; step <= 8; step++) {
      await expect(tour.getByText(`Step ${step} of 8`, { exact: true })).toBeVisible()
      await expect.poll(() => tour.locator('.tour-card').evaluate(element => {
        const r = element.getBoundingClientRect()
        return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1
      })).toBe(true)
      await expect.poll(() => tour.evaluate(dialog => {
        const card = dialog.querySelector('.tour-card').getBoundingClientRect()
        const spot = dialog.querySelector('.tour-spotlight').getBoundingClientRect()
        return Math.max(0, Math.min(card.right, spot.right) - Math.max(card.left, spot.left))
          * Math.max(0, Math.min(card.bottom, spot.bottom) - Math.max(card.top, spot.top)) < 1
      })).toBe(true)
      if (step === 7 && width < 992) await expect(page.locator('.workspace-mobile-sections')).toHaveAttribute('open', '')
      if (step === 2) await page.screenshot({ path: testInfo.outputPath(`tutorial-${width}.png`) })
      await tour.getByRole('button', { name: step === 8 ? 'Finish' : 'Next', exact: true }).click()
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
    await expect(page.getByRole('main')).toHaveCount(1)
  })
}

test('tutorial does not appear on non-owner event tools', async ({ page }) => {
  await page.goto('/organiser/events')
  const otherId = await page.evaluate(() => {
    const key = 'bookedz-feature2-demo';const db = JSON.parse(localStorage.getItem(key))
    const event = db.events.find(event => event.organiserId !== 'org1')
    return event?.id
  })
  expect(otherId).toBeTruthy()
  await page.goto(`/organiser/events/${otherId}/manage?tab=tasks`)
  await expect(page.getByRole('alert').filter({ hasText: /Only|organiser|own/ }).first()).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Manage event tutorial' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Replay tutorial', exact: true })).toHaveCount(0)
})

test('keyboard focus stays in the tour and a blocked preference write still allows dismissal', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('bookedz:organiser-tour:')) throw new DOMException('Preferences unavailable', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  })
  await page.goto(eventPath + '?tab=tasks')
  const tour = page.getByRole('dialog', { name: 'Manage event tutorial' })
  const skip = tour.getByRole('button', { name: 'Skip', exact: true })
  const next = tour.getByRole('button', { name: 'Next', exact: true })
  await skip.focus()
  await page.keyboard.press('Shift+Tab')
  await expect(next).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(tour).toHaveCount(0)
  await page.getByRole('navigation', { name: 'Event workspace navigation' }).getByRole('link', { name: 'Registrations', exact: true }).click()
  await page.getByRole('link', { name: /Back to Manage event/ }).click()
  await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible()
  await expect(tour).toHaveCount(0)
})

test('browser Back removes an open tutorial without redirecting away from My events', async ({ page }) => {
  await page.goto('/organiser/events')
  await page.locator(`a[href="${eventPath}?tab=tasks"]`).click()
  const tour = page.getByRole('dialog', { name: 'Manage event tutorial' })
  await expect(tour).toBeVisible()
  await tour.getByRole('button', { name: 'Next', exact: true }).click()
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'My events', exact: true })).toBeVisible()
  await expect(tour).toHaveCount(0)
})

test('light-theme motion works through all steps and adapts while resizing', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' })
  await page.goto(eventPath + '?tab=tasks')
  const tour = page.getByRole('dialog', { name: 'Manage event tutorial' })
  for (let step = 1; step <= 8; step++) {
    if (step === 3) await page.setViewportSize({ width: 375, height: 850 })
    if (step === 8) await page.setViewportSize({ width: 1280, height: 850 })
    await expect(tour.getByText(`Step ${step} of 8`, { exact: true })).toBeVisible()
    await expect.poll(() => tour.locator('.tour-card').evaluate(element => {
      const r = element.getBoundingClientRect()
      return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1
    })).toBe(true)
    await tour.getByRole('button', { name: step === 8 ? 'Finish' : 'Next', exact: true }).click()
  }
  await expect(tour).toHaveCount(0)
  await expect(page.locator('.tour-scroll-space')).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible()
  await expect(tour).toHaveCount(0)
})
