import { test, expect } from '@playwright/test'

test('search stays with its hero and preserves pending text when views change', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('.hero-illustration')).toHaveAttribute('data-loaded', 'true')
  for (const width of [375, 575, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 })
    await expect(page.locator('.hero-copy [role="search"]')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.locator('main')).toHaveCount(1)
    if (width === 1280) {
      const action = await page.getByRole('button', { name: 'Explore events', exact: true }).boundingBox()
      expect(action.y + action.height).toBeLessThanOrEqual(800)
    }
    await page.screenshot({ path: testInfo.outputPath(`discovery-${width}.png`) })
  }
  // Freeze the debounce timer so switching views exercises the pending draft.
  await page.clock.install()
  await page.getByLabel('Search by title, description or venue').fill('no-such-event-XYZ')
  await page.getByRole('button', { name: 'Map', exact: true }).click()
  await page.clock.runFor(400)
  await expect(page.getByLabel('Search by title, description or venue')).toHaveValue('no-such-event-XYZ')
  await expect(page.getByRole('heading', { name: 'No events found' })).toBeVisible()
  const artwork = page.locator('image[data-map-artwork]')
  await expect(artwork).toBeVisible()
  expect(await artwork.evaluate(el => getComputedStyle(el).maskImage)).not.toBe('none')
})

test('live navigation hides personal links until a session arrives', async ({ page }) => {
  // Substitute only NavBar's auth dependency; page data keeps the demo adapter.
  await page.route('**/__nav-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export const USING_SUPABASE = true;
    export const getCurrentUser = async () => null;
    export const onAuthChange = callback => {
      const listener = event => callback(event.detail);
      window.addEventListener('test-auth-change', listener);
      return () => window.removeEventListener('test-auth-change', listener);
    };
    export const signOut = async () => {};
    export const resetDemoData = () => {};
  ` }))
  await page.route(/\/src\/components\/NavBar\.vue(?:\?.*)?$/, async route => {
    const response = await route.fetch()
    const source = (await response.text()).replace(/from (["'])\/src\/utils\/api\.js\1/, 'from "/__nav-auth.js"')
    await route.fulfill({ response, body: source })
  })
  await page.goto('/discover')
  const nav = page.getByRole('navigation', { name: 'Main navigation' })
  await expect(nav.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible()
  for (const name of ['My RSVPs', 'My events', 'Create event', 'Your profile']) {
    await expect(nav.getByRole('link', { name, exact: true })).toHaveCount(0)
  }
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('test-auth-change', { detail: { id: 'test-user', email: 'test@example.invalid' } })))
  await expect(nav.getByRole('link', { name: 'My RSVPs', exact: true })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Create event', exact: true })).toBeVisible()
  await page.setViewportSize({ width: 375, height: 800 })
  const toggle = nav.getByRole('button', { name: 'Toggle navigation' })
  await toggle.click()
  await nav.getByRole('link', { name: 'My RSVPs', exact: true }).focus()
  await page.keyboard.press('Escape')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(toggle).toBeFocused()
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('test-auth-change', { detail: null })))
  await toggle.click()
  await expect(nav.getByRole('link', { name: 'My events', exact: true })).toHaveCount(0)
})
