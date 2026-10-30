import { test, expect } from '@playwright/test'

// Replace only Profile's data boundary; the shell and routing retain demo mode.
async function profileFixture(page) {
  await page.route('**/__profile-fixture.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: `
      export const USING_SUPABASE = true;
      export const geocodePostalCode = async () => ({ lat: 1.3, lng: 103.8 });
      let attempts = 0;
      export const supabase = {
        auth: { getUser: async () => ({ data: { user: { id: 'profile-fixture' } } }) },
        from: () => ({
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: {
            display_name: 'Test Explorer', postal_code: '', interest_weights: { music: 3 }
          } }) }) }),
          update: payload => ({ eq: () => ({ select: () => ({ single: async () => {
            window.profilePayload = payload;
            await new Promise(resolve => setTimeout(resolve, 250));
            return ++attempts === 1 ? { error: { message: 'Could not save. Try again.' } } : { data: { id: 'profile-fixture' } };
          } }) }) })
        })
      };
    `,
  }))
  await page.route(/\/src\/views\/ProfileView\.vue(?:\?.*)?$/, async route => {
    const response = await route.fetch()
    const body = (await response.text()).replace(
      /from (["'])\/src\/(?:lib\/(?:supabase|onemap)|utils\/api)\.js\1/g,
      'from "/__profile-fixture.js"',
    )
    await route.fulfill({ response, body })
  })
}

test('profile reflows in both themes and preserves interest drafts through save failure', async ({ page }, testInfo) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (['warning', 'error'].includes(message.type())) errors.push(message.text())
  })
  await profileFixture(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/profile')
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Test Explorer')
  const theme = page.getByLabel('Color theme')
  for (const scheme of ['light', 'dark']) {
    await theme.selectOption(scheme)
    await expect(page.locator('html')).toHaveAttribute('data-theme', scheme)
    for (const width of [375, 575, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await expect(page.locator('main')).toHaveCount(1)
      await expect(page.locator('.profile-form')).toHaveCSS('background-color', scheme === 'dark' ? 'rgb(30, 41, 50)' : 'rgb(255, 253, 250)')
      const contrast = await page.locator('label[for="int-music"]').evaluate(el => {
        const luminance = color => {
          const channels = color.match(/\d+/g).slice(0, 3).map(Number).map(v => {
            const c = v / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4
          })
          return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
        }
        const style = getComputedStyle(el)
        const a = luminance(style.color), b = luminance(style.backgroundColor)
        return (Math.max(a, b) + .05) / (Math.min(a, b) + .05)
      })
      expect(contrast).toBeGreaterThanOrEqual(4.5)
      const chip = await page.locator('label[for="int-music"]').boundingBox()
      expect(chip.height).toBeGreaterThanOrEqual(44)
      await page.screenshot({ path: testInfo.outputPath(`profile-${scheme}-${width}.png`), fullPage: true })
    }
  }
  const arts = page.getByRole('checkbox', { name: 'arts', exact: true })
  await arts.focus()
  await expect(arts).toBeFocused()
  await page.keyboard.press('Space')
  await expect(page.getByRole('status')).toHaveText('2 interests selected')
  await page.getByLabel('Name', { exact: true }).fill('Updated Explorer')
  await page.getByRole('button', { name: 'Save profile', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Saving profile…' })).toBeDisabled()
  await expect(page.getByLabel('Name', { exact: true })).toBeDisabled()
  await expect(page.getByRole('alert')).toHaveText('Could not save. Try again.')
  await expect(arts).toBeChecked()
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Updated Explorer')
  await page.getByRole('button', { name: 'Save profile', exact: true }).click()
  await expect(page.getByText('Profile saved.', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.profilePayload.interest_weights)).toEqual({ music: 3, arts: 1 })
  await page.getByRole('link', { name: 'Back to Discover', exact: true }).click()
  await expect(page).toHaveURL(/\/discover$/)
  expect(errors).toEqual([])
})

test('discovery view controls and hosting invitation reflow in both themes', async ({ page }, testInfo) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (['warning', 'error'].includes(message.type())) errors.push(message.text())
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/discover')
  await page.getByRole('button', { name: 'Map', exact: true }).click()
  for (const scheme of ['light', 'dark']) {
    await page.getByLabel('Color theme').selectOption(scheme)
    for (const width of [375, 575, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      for (const name of ['Island', 'Map', 'List']) {
        const rect = await page.getByRole('button', { name, exact: true }).boundingBox()
        expect(rect.height).toBeGreaterThanOrEqual(44)
      }
    }
  }
  await page.getByRole('button', { name: 'Island', exact: true }).click()
  await page.locator('.hosting-invitation').scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('discovery-hosting-dark.png') })
  await expect(page.getByRole('link', { name: 'Host an event' })).toBeVisible()
  expect(await page.locator('.hosting-invitation').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(32, 44, 53)')
  expect(errors).toEqual([])
})
