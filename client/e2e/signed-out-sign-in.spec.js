import { test, expect } from '@playwright/test'

// Live-mode sign-in behaviour with a mocked account: no network, no real credentials.
async function guestFixture(page) {
  await page.route('**/*.supabase.co/**', route => route.abort())
  await page.route('**/__guest-api.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: `
      export * from '/src/utils/api.js';
      export const USING_SUPABASE = true;
      export const getCurrentUser = async () => sessionStorage.getItem('guest-login') ? { id: 'test-user', email: 'test@example.invalid' } : null;
      export const onAuthChange = () => () => {};
      export const signIn = async () => { sessionStorage.setItem('guest-login', '1') };
    `,
  }))
  await page.route(/\/src\/(?:router\/index\.js|components\/NavBar\.vue|views\/(?:DiscoverView|RsvpView|LandingView|LoginView)\.vue)/, async route => {
    const response = await route.fetch()
    const body = (await response.text()).replace(/from (["'])\/src\/utils\/api(?:\.js)?\1/g, 'from "/__guest-api.js"')
    await route.fulfill({ response, body })
  })
}

async function signInWithMock(page) {
  await page.getByLabel('Email', { exact: true }).fill('test@example.invalid')
  await page.getByLabel('Password', { exact: true }).fill('ExamplePassword123!')
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click()
}

test('Sign in to RSVP opens the sign-in section, then returns to the event', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await guestFixture(page)
  await page.goto('/events/e1/rsvp')
  await page.getByRole('link', { name: 'Sign in to RSVP', exact: true }).click()

  await expect(page).toHaveURL(/\/\?redirect=.*e1.*#join-dino$/)
  await expect(page.getByLabel('Email', { exact: true })).toBeFocused()
  await expect(page.locator('#join-dino')).toBeInViewport()
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0)

  await signInWithMock(page)
  await expect(page).toHaveURL(/\/events\/e1\/rsvp/)
  expect(errors).toEqual([])
})

test('from 992px signed-out visitors get Sign in in the sidebar, with no top bar', async ({ page }) => {
  await guestFixture(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/discover?view=list')
  await expect(page.locator('.app-topbar')).toBeHidden()
  const signIn = page.locator('#mainNav').getByRole('link', { name: 'Sign in', exact: true })
  await expect(signIn).toBeVisible()
  await signIn.click()

  await expect(page).toHaveURL(/\/\?redirect=.*discover.*#join-dino$/)
  await expect(page.getByLabel('Email', { exact: true })).toBeFocused()
  await signInWithMock(page)
  await expect(page).toHaveURL(/\/discover\?view=list/)
})

test('below 992px Sign in stays in the top bar beside the menu', async ({ page }) => {
  await guestFixture(page)
  for (const width of [375, 768]) {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/discover')
    const topbar = page.locator('.app-topbar')
    await expect(topbar.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible()
    await expect(topbar.getByRole('button', { name: 'Toggle navigation' })).toBeVisible()
    await topbar.getByRole('button', { name: 'Toggle navigation' }).click()
    await expect(page.locator('#mainNav .sidebar-sign-in')).toBeHidden()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})
