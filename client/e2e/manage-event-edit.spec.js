import { test, expect } from '@playwright/test'

test('event editing lives in Manage event and preserves drafts across tools', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-16T04:00:00Z'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/*.supabase.co/**', route => route.abort())
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/organiser/events/e-weather-demo/manage?tab=edit')
  await expect(page).toHaveURL(/manage\?tab=edit/)
  const nav = page.getByRole('navigation', { name: 'Event tools' })
  const title = page.getByLabel('Event title', { exact: true })
  await expect(title).toBeVisible()
  await title.fill('[TEST] Updated event')
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme })
    for (const width of [375, 575, 768, 1280]) {
      await page.setViewportSize({ width, height: 1000 })
      await expect(page.locator('main')).toHaveCount(1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
  }
  await nav.getByRole('button', { name: /^Planning/ }).click()
  await nav.getByRole('link', { name: 'Tasks', exact: true }).click()
  await nav.getByRole('button', { name: /^General/ }).click()
  await nav.getByRole('link', { name: 'Edit event', exact: true }).click()
  await expect(title).toHaveValue('[TEST] Updated event')
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('switch').uncheck()
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByText('Event updated.', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('[TEST] Updated event')
  await expect(page).toHaveURL(/manage\?tab=edit/)
  await page.reload()
  await expect(title).toHaveValue('[TEST] Updated event')
  expect(errors).toEqual([])
})
