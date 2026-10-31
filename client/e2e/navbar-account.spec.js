import { test, expect } from '@playwright/test'

async function mockNavigation(page) {
  let fail = false
  await page.route('**/*.supabase.co/**', route => route.abort())
  await page.route('**/__nav-signout', route => route.fulfill({ status: fail ? 503 : 200, json: {} }))
  await page.route('**/__sidebar-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export const USING_SUPABASE = true;
    let user = { id: 'fixture-member', email: 'member@example.invalid' };
    export const getCurrentUser = async () => user;
    export const onAuthChange = callback => {
      const listener = event => { user = event.detail; callback(user); };
      window.addEventListener('fixture-sidebar-auth', listener);
      return () => window.removeEventListener('fixture-sidebar-auth', listener);
    };
    export const signOut = async () => {
      const response = await fetch('/__nav-signout', { method: 'POST' });
      if (!response.ok) throw new Error('Sign out failed');
      window.dispatchEvent(new CustomEvent('fixture-sidebar-auth', { detail: null }));
    };
    export const resetDemoData = () => {};
  ` }))
  // The navbar and route guard must observe the same mocked signed-in identity.
  await page.route(/\/src\/(?:components\/NavBar\.vue|router\/index\.js)(?:\?.*)?$/, async route => {
    const response = await route.fetch()
    const body = (await response.text()).replace(/from (["'])\/src\/utils\/api\.js\1/g, 'from "/__sidebar-auth.js"')
    await route.fulfill({ response, body })
  })
  return { failSignOut(value) { fail = value } }
}

test('sidebar keeps theme below Settings and profile/sign-out at the bottom with failure recovery', async ({ page }, testInfo) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const state = await mockNavigation(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/discover')
  const sidebar = page.locator('.app-sidebar')
  const settings = sidebar.getByRole('link', { name: 'Settings', exact: true })
  const profile = sidebar.getByRole('link', { name: 'Your profile', exact: true })
  const signOut = sidebar.getByRole('button', { name: 'Sign out', exact: true })
  const theme = sidebar.getByLabel('Color theme')
  await expect(profile).toBeVisible()
  await expect(profile).toHaveAttribute('href', '/profile')
  const settingsBox = await settings.boundingBox()
  const profileBox = await profile.boundingBox()
  expect((await theme.boundingBox()).y).toBeGreaterThanOrEqual(settingsBox.y + settingsBox.height)
  expect((await signOut.boundingBox()).y).toBeGreaterThanOrEqual(profileBox.y + profileBox.height)
  expect(profileBox.y).toBeGreaterThan(700)
  expect(await sidebar.evaluate(element => element.lastElementChild.classList.contains('sidebar-account'))).toBe(true)
  await expect(page.locator('.app-topbar .nav-profile')).toHaveCount(0)
  for (const value of ['dark', 'light', 'system']) {
    await theme.selectOption(value)
    await expect(theme).toHaveValue(value)
    if (value !== 'system') await expect(page.locator('html')).toHaveAttribute('data-theme', value)
  }
  await page.screenshot({ path: testInfo.outputPath('sidebar-account-desktop.png') })
  state.failSignOut(true)
  await signOut.click()
  await expect(sidebar.getByRole('alert')).toHaveText('Sign out failed. Please try again.')
  await expect(signOut).toBeEnabled()
  await expect(profile).toBeVisible()
  state.failSignOut(false)
  await signOut.click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible()
  await expect(profile).toHaveCount(0)
  await expect(signOut).toHaveCount(0)
  await expect(settings).toHaveCount(0)
  await expect(theme).toBeVisible()
  expect(errors).toEqual([])
})

test('mobile sidebar retains profile, theme and sign-out with keyboard dismissal and profile navigation', async ({ page }, testInfo) => {
  await mockNavigation(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 375, height: 900 })
  await page.goto('/discover')
  await expect(page.getByRole('heading', { name: 'Discover events', exact: true })).toBeVisible()
  const toggle = page.getByRole('button', { name: 'Toggle navigation' })
  const sidebar = page.locator('.app-sidebar')
  for (const width of [375, 575, 768]) {
    await page.setViewportSize({ width, height: 900 })
    await toggle.click()
    await expect(sidebar.getByRole('link', { name: 'Your profile' })).toBeVisible()
    await expect(sidebar.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible()
    await sidebar.getByLabel('Color theme').selectOption('dark')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await sidebar.getByLabel('Color theme').focus()
    await page.keyboard.press('Escape')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(toggle).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 375, height: 900 })
  await toggle.click()
  await expect(sidebar.getByRole('link', { name: 'Your profile' })).toBeInViewport()
  await page.screenshot({ path: testInfo.outputPath('sidebar-account-mobile.png') })
  await sidebar.getByRole('link', { name: 'Your profile' }).click()
  await expect(page).toHaveURL(/\/profile$/)
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
})
