import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/*.supabase.co/**', route => route.abort())
  await page.route('**/v2/real-time/api/two-hr-forecast*', route => route.abort())
})

async function trackMotion(page) {
  await page.evaluate(() => {
    window.organiserAnimations = []
    const seen = new WeakSet()
    function sample() {
      for (const animation of document.getAnimations()) {
        const target = animation.effect?.target
        if (!target?.closest('.organiser-motion') || seen.has(animation)) continue
        seen.add(animation)
        window.organiserAnimations.push({ duration: animation.effect.getTiming().duration, scene: target.matches('[data-organiser-scene], .organiser-motion'), frames: animation.effect.getKeyframes() })
      }
      window.organiserMotionFrame = requestAnimationFrame(sample)
    }
    sample()
  })
}

test('workspace motion accompanies navigation without replacing task drafts or replaying on typing', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/organiser/events/e-weather-demo/manage?tab=tasks')
  await page.getByRole('button', { name: 'Add task', exact: true }).click()
  await page.getByLabel('Task title', { exact: true }).fill('[TEST] Motion draft')
  await trackMotion(page)
  const nav = page.getByRole('navigation', { name: 'Event workspace navigation' })
  await nav.getByRole('link', { name: 'Budget', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Budget', exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.organiserAnimations.length)).toBeGreaterThan(0)
  const animations = await page.evaluate(() => window.organiserAnimations)
  expect(animations.some(animation => animation.duration >= 180 && animation.duration <= 280)).toBe(true)
  await nav.getByRole('link', { name: 'Registrations', exact: true }).click()
  await page.getByRole('link', { name: /Back to Manage event/ }).click()
  await nav.getByRole('link', { name: 'Tasks', exact: true }).click()
  await expect(page.getByLabel('Task title', { exact: true })).toHaveValue('[TEST] Motion draft')
  // Finish current motion before checking that typing doesn't restart the scene.
  await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))))
  const before = await page.evaluate(() => window.organiserAnimations.filter(animation => animation.scene).length)
  await page.getByLabel('Search tasks', { exact: true }).fill('no matching task')
  await expect(page.getByText('0 matching tasks', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.organiserAnimations.filter(animation => animation.scene).length)).toBe(before)
  expect(errors).toEqual([])
})

test('My events and creation share the motion without losing creation fields', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/organiser/events')
  await expect(page.getByRole('heading', { name: 'My events', exact: true })).toBeVisible()
  await expect(page.locator('.organiser-event-card').first()).toBeVisible()
  await trackMotion(page)
  // Re-enter the list through client navigation to observe its full entrance.
  await page.getByRole('main').getByRole('link', { name: 'Create event', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Create an event', exact: true })).toBeVisible()
  await page.getByLabel('Event title', { exact: true }).fill('[TEST] Animated creation draft')
  await expect(page.locator('.preview-copy h2')).toHaveText('[TEST] Animated creation draft')
  await expect.poll(() => page.evaluate(() => window.organiserAnimations.length)).toBeGreaterThan(0)
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'My events', exact: true }).click()
  await expect(page.locator('.organiser-event-card').first()).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.getAnimations().some(animation => animation.effect?.target?.matches('[data-organiser-enter]')))).toBe(true)
})

for (const reducedMotion of ['reduce', 'no-preference']) {
test(`${reducedMotion} motion keeps organiser tools responsive in both themes`, async ({ page }, testInfo) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion })
  for (const width of [375, 575, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    for (const colorScheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme })
      await page.goto('/organiser/events/e-weather-demo/manage?tab=tasks')
      await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible()
      await trackMotion(page)
      const mobile = width < 992
      if (mobile) await page.locator('.workspace-mobile-sections > summary').click()
      const nav = page.getByRole('navigation', { name: mobile ? 'Event workspace sections' : 'Event workspace navigation' })
      await nav.getByRole('link', { name: 'Announcements', exact: true }).click()
      await expect(page.getByLabel('Announcement text')).toBeVisible()
      await page.getByLabel('Announcement text').fill('[TEST] Unpublished motion draft')
      if (reducedMotion === 'reduce') expect(await page.evaluate(() => window.organiserAnimations.filter(animation => animation.duration > 1).length)).toBe(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await expect(page.getByRole('main')).toHaveCount(1)
      if (reducedMotion === 'no-preference' && ((width === 1280 && colorScheme === 'dark') || (width === 375 && colorScheme === 'light'))) {
        await page.screenshot({ path: testInfo.outputPath(`organiser-${width}-${colorScheme}.png`), animations: 'disabled' })
      }
      await page.evaluate(() => cancelAnimationFrame(window.organiserMotionFrame))
    }
  }
  expect(errors).toEqual([])
})
}
