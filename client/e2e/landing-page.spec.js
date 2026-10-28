import { test, expect } from '@playwright/test'

test('landing is separate from Discover and Bookedz logos return home from other pages', async ({ page }, testInfo) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*.supabase.co/**', route => route.abort())
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('.discovery-hero')).toBeVisible()
  await expect(page.locator('.hero-illustration')).toHaveAttribute('data-loaded', 'true')
  await expect(page.getByRole('region', { name: 'Picked for you' })).toHaveCount(0)
  await expect(page.locator('main')).toHaveCount(1)
  for (const scheme of ['light', 'dark']) {
    await page.getByLabel('Color theme').selectOption(scheme)
    for (const width of [375, 575, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await expect(page.getByRole('button', { name: 'Explore events', exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      if (width === 375 || width === 1280) await page.screenshot({ path: testInfo.outputPath(`landing-${scheme}-${width}.png`) })
    }
  }
  await page.locator('.app-sidebar').getByRole('link', { name: 'Discover', exact: true }).click()
  await expect(page).toHaveURL(/\/discover$/)
  await expect(page.locator('.discovery-hero')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Picked for you' })).toBeVisible()
  for (const path of ['/discover?view=categories', '/discover?view=map', '/my-rsvps', '/profile']) {
    await page.goto(path)
    await page.locator('.sidebar-brand').click()
    await expect(page).toHaveURL(/:\d+\/$/)
    await expect(page.locator('.discovery-hero')).toBeVisible()
  }
  await page.setViewportSize({ width: 375, height: 900 })
  await page.goto('/discover')
  await page.locator('.topbar-brand').click()
  await expect(page).toHaveURL(/:\d+\/$/)
  await page.getByRole('button', { name: 'Toggle navigation' }).click()
  await page.locator('.app-sidebar').getByRole('link', { name: 'Discover', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Toggle navigation' })).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('.discovery-hero')).toHaveCount(0)
  await page.locator('.footer-home-link').click()
  await expect(page).toHaveURL(/:\d+\/$/)
  expect(errors).toEqual([])
})

test('landing search, categories and map hand off filters to Discover and survive reload', async ({ page }) => {
  await page.route('**/*.supabase.co/**', route => route.abort())
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const search = page.getByLabel('Search by title, description or venue')
  await search.fill('pottery')
  await search.press('Enter')
  await expect(page).toHaveURL(/\/discover\?view=list/)
  await expect(search).toHaveValue('pottery')
  await expect(page.locator('.discovery-hero')).toHaveCount(0)
  await page.reload()
  await expect(search).toHaveValue('pottery')
  await page.locator('.sidebar-brand').click()
  await page.locator('.filter-toggle').click()
  await page.getByRole('group', { name: 'Category', exact: true }).getByRole('button', { name: 'Arts', exact: true }).click()
  await page.locator('.show-events').click()
  await expect(page).toHaveURL(/\/discover\?view=list/)
  await expect(page.getByRole('button', { name: 'Remove Arts filter' })).toBeVisible()
  await expect(search).toHaveValue('')
  await page.locator('.sidebar-brand').click()
  await search.fill('music')
  await page.getByRole('button', { name: 'Filters', exact: false }).click()
  await page.getByRole('group', { name: 'Category', exact: true }).getByRole('button', { name: 'Music', exact: true }).click()
  await page.getByRole('button', { name: 'This week', exact: true }).click()
  await page.getByRole('button', { name: 'Spots left', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('group', { name: 'Discovery view', exact: true }).getByRole('button', { name: 'Map', exact: true }).click()
  await expect(page).toHaveURL(/\/discover\?view=map/)
  await expect(search).toHaveValue('music')
  await expect(page.getByRole('button', { name: 'Remove Music filter' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remove This week filter' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remove Spots left filter' })).toBeVisible()
  await page.reload()
  await expect(search).toHaveValue('music')
  await expect(page.getByRole('button', { name: 'Remove Music filter' })).toBeVisible()
  const views = page.getByRole('group', { name: 'Discovery view', exact: true })
  await views.getByRole('button', { name: 'List', exact: true }).click()
  await expect(page).toHaveURL(/view=list/)
  await expect(search).toHaveValue('music')
  await expect(page.getByRole('button', { name: 'Remove This week filter' })).toBeVisible()
})

test('landing remains public when live account lookup is unavailable', async ({ page }) => {
  await page.route('**/*.supabase.co/**', route => route.abort())
  await page.route('**/__home-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export const USING_SUPABASE = true;
    export const getCurrentUser = async () => { throw new Error('Account lookup unavailable'); };
    export const onAuthChange = () => () => {};
    export const signOut = async () => {};
    export const resetDemoData = () => {};
  ` }))
  await page.route(/\/src\/(?:components\/NavBar\.vue|router\/index\.js)(?:\?.*)?$/, async route => {
    const response = await route.fetch()
    await route.fulfill({ response, body: (await response.text()).replace(/from (["'])\/src\/utils\/api\.js\1/g, 'from "/__home-auth.js"') })
  })
  await page.goto('/')
  await expect(page.locator('.discovery-hero')).toBeVisible()
  await expect(page.locator('.app-topbar').getByRole('link', { name: 'Sign in', exact: true })).toBeVisible()
  await expect(page).toHaveURL(/:\d+\/$/)
})
