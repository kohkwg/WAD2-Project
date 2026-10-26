import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

const liveVisibilityApi = readFileSync(new URL('../src/utils/api.js', import.meta.url), 'utf8')
  .replace(/export const USING_SUPABASE = .*/, 'export const USING_SUPABASE = true')
  .replace(/const backend = .*/, 'const backend = mockApi')
  .replace(/const operationsBackend = .*/, 'const operationsBackend = mockApi')
  .replace(/const weatherBackend = .*/, 'const weatherBackend = mockApi')
  .replace(/export const getCurrentUser = .*/, "export const getCurrentUser = () => Promise.resolve({ id: 'u1', email: 'organiser@example.invalid' })")

const liveCheckinFixture = `
export const getEvent = async id => ({ id, title: 'Campus Green Social · Weather demo', starts_at: '2026-10-26T10:00:00.000Z', ends_at: '2026-10-26T12:00:00.000Z' })
export const staffCheckIn = async () => ({ user_id: 'u1', checked_in_at: new Date().toISOString() })
export const wasAlreadyCheckedIn = () => false
export const formatTime = iso => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
export const listAttendees = async () => []
export const selfCheckIn = async () => ({})
export const getCheckinSecret = async () => ({ checkin_secret: 'local-e2e-secret', rotated_at: new Date().toISOString() })
export const rotateCheckinSecret = async () => 'local-e2e-secret'
export const exportAttendance = async () => []
export const importAttendance = async () => ({ matched: 0, unmatched: 0 })
export const venueCheckInUrl = (id, secret) => '/events/' + id + '/check-in?s=' + secret
export const getDeviceId = () => 'local-e2e-device'
export const getLocation = async () => null
`

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
  await page.route('**/*.supabase.co/**', route => route.abort())
  await page.route('**/two-hr-forecast*', route => route.abort())
})

test('public layout prioritises event facts and My RSVPs stays responsive', async ({ page }, testInfo) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/events/e2/rsvp')
    await expect(page.getByRole('heading', { name: 'Intro to Vue Workshop', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'RSVP', exact: true })).toBeVisible()
    const details = page.locator('.event-public-details')
    const actions = page.locator('.rsvp-action-panel')
    if (width === 1280) {
      const left = await details.boundingBox(), right = await actions.boundingBox()
      expect(left.x).toBeLessThan(right.x)
      expect(left.width).toBeGreaterThan(right.width)
    }
    const title = await details.getByRole('heading', { level: 1 }).boundingBox()
    const picture = await details.locator('.event-cover').boundingBox()
    expect(title.y).toBeLessThan(picture.y)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`public-event-${width}.png`) })
    await page.goto('/my-rsvps')
    await expect(page.locator('.plans-summary')).toBeVisible()
    await expect(page.locator('.rsvp-card').first()).toBeVisible()
    expect(await page.locator('.rsvp-status svg').count()).toBeGreaterThan(0)
    const offer = page.getByRole('button', { name: 'Confirm my spot', exact: true })
    await expect(offer).toBeVisible()
    const contrast = await offer.evaluate(el => {
      const css = getComputedStyle(el)
      const luminance = color => {
        const [r, g, b] = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { const c = v / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4 })
        return .2126 * r + .7152 * g + .0722 * b
      }
      const a = luminance(css.color), b = luminance(css.backgroundColor)
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05)
    })
    expect(contrast).toBeGreaterThanOrEqual(4.5)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`my-rsvps-${width}.png`) })
  }
  expect(errors).toEqual([])
})

test('organiser event routes share workspace navigation and return to Manage event', async ({ page }, testInfo) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  for (const width of [1280, 768, 575, 375]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/organiser/events/e-weather-demo/manage?tab=tasks')
    const workspace = page.getByRole('region', { name: 'Event workspace' })
    const mobileSections = page.locator('details.workspace-mobile-sections')
    let navigation
    if (width < 992) {
      await expect(mobileSections).toBeVisible()
      await mobileSections.locator('summary').click()
      navigation = mobileSections.getByRole('navigation', { name: 'Event workspace sections' })
    } else {
      navigation = page.getByRole('navigation', { name: 'Event workspace navigation' })
    }
    await expect(workspace.locator('.workspace-header h1')).toContainText('Campus Green Social')
    await expect(navigation.getByRole('link', { name: 'Tasks', exact: true })).toBeVisible()
    if (width >= 992) await expect(navigation.getByRole('link', { name: 'Tasks', exact: true })).toHaveCount(1)
    await expect(navigation.getByRole('link', { name: 'Registrations', exact: true })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Event operations' })).toHaveCount(0)
    await expect(navigation.getByRole('link', { name: 'Check-in station', exact: true })).toHaveCount(0)
    for (const tab of ['Tasks', 'Announcements', 'Budget', 'Weather']) {
      if (width < 992 && !await mobileSections.evaluate(el => el.open)) await mobileSections.locator('summary').click()
      await navigation.getByRole('link', { name: tab, exact: true }).click()
      await expect(page.getByRole('heading', { name: tab, exact: true })).toBeVisible()
      if (tab === 'Tasks') {
        await expect(workspace.getByRole('link', { name: /My events/ })).toBeVisible()
      } else {
        await expect(workspace.getByRole('link', { name: /Back to Manage event/ })).toHaveAttribute('href', '/organiser/events/e-weather-demo/manage?tab=tasks')
      }
      if (width < 992) await expect(mobileSections.locator('summary')).toContainText(`Sections · ${tab}`)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    if (width < 992 && !await mobileSections.evaluate(el => el.open)) await mobileSections.locator('summary').click()
    await navigation.getByRole('link', { name: 'Registrations', exact: true }).click()
    await expect(page).toHaveURL(/\/organiser\/events\/e-weather-demo\/rsvps(?:\?.*)?$/)
    await expect(workspace.locator('.workspace-header h1')).toContainText('Campus Green Social')
    await expect(page.getByRole('heading', { name: 'Registrations', exact: true })).toBeVisible()
    await expect(workspace.getByRole('link', { name: /Back to Manage event/ })).toHaveAttribute('href', '/organiser/events/e-weather-demo/manage?tab=weather')
    if (width >= 992) await expect(navigation.getByRole('link', { name: 'Tasks', exact: true })).toBeVisible()
    else await expect(mobileSections).toHaveJSProperty('open', false)
    await page.screenshot({ path: testInfo.outputPath(`event-workspace-${width}.png`) })
  }
  expect(errors).toEqual([])
})

test('live-only event tools keep their routes in the shared workspace shell', async ({ page }) => {
  await page.route(/\/src\/utils\/api(?:\.js)?(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: liveVisibilityApi }))
  await page.route(/\/src\/utils\/checkin\.js(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: liveCheckinFixture }))
  await page.route('**/*.supabase.co/**', route => route.abort())
  await page.goto('/organiser/events/e-weather-demo/manage?tab=tasks')
  const workspace = page.getByRole('region', { name: 'Event workspace' })
  const navigation = page.getByRole('navigation', { name: 'Event workspace navigation' })
  for (const [label, suffix, heading] of [
    ['Check-in station', 'check-in', 'Check-in station'],
    ['Venue QR', 'venue-qr', 'Campus Green Social'],
    ['Attendance report', 'attendance', 'Attendance report'],
    ['Floor plan', 'floor-plan', 'Floor plan'],
  ]) {
    await navigation.getByRole('link', { name: label, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/organiser/events/e-weather-demo/${suffix}(?:\\?.*)?$`))
    await expect(workspace.locator('.workspace-header h1')).toContainText('Campus Green Social')
    await expect(workspace.getByRole('link', { name: /Back to Manage event/ })).toHaveAttribute('href', '/organiser/events/e-weather-demo/manage?tab=tasks')
    if (label === 'Venue QR') {
      await expect(page.locator('.venue-qr-page')).toBeVisible()
      await expect(page.getByRole('img', { name: 'Venue check-in QR code' })).toBeVisible()
    } else {
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    }
    await expect(navigation.getByRole('link', { name: label, exact: true })).toHaveAttribute('aria-current', 'page')
  }
})

test('task search, filter and draft survive RSVP navigation and Back to Manage event', async ({ page }) => {
  await page.goto('/organiser/events/e-weather-demo/manage?tab=tasks')
  const workspace = page.getByRole('region', { name: 'Event workspace' })
  const navigation = page.getByRole('navigation', { name: 'Event workspace navigation' })
  const filters = page.getByRole('group', { name: 'Filter tasks by status' })
  await filters.getByRole('button', { name: /^All\b/ }).click()
  await page.getByLabel('Search tasks', { exact: true }).fill('task')
  await page.getByRole('button', { name: 'Add task', exact: true }).click()
  await page.getByLabel('Task title', { exact: true }).fill('Draft kept across RSVP route')
  await expect(page).toHaveURL(/taskFilter=all.*taskSearch=task|taskSearch=task.*taskFilter=all/)

  await navigation.getByRole('link', { name: 'Registrations', exact: true }).click()
  await expect(page).toHaveURL(/\/organiser\/events\/e-weather-demo\/rsvps/)
  await expect(workspace.locator('.workspace-header h1')).toContainText('Campus Green Social')
  await page.getByRole('link', { name: /Back to Manage event/ }).click()

  await expect(page).toHaveURL(/\/organiser\/events\/e-weather-demo\/manage\?tab=tasks/)
  await expect(page.getByLabel('Search tasks', { exact: true })).toHaveValue('task')
  await expect(filters.getByRole('button', { name: /^All\b/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Task title', { exact: true })).toHaveValue('Draft kept across RSVP route')
})

test('Budget Back to Manage event opens Tasks and restores the full task query', async ({ page }) => {
  await page.goto('/organiser/events/e-weather-demo/manage?tab=tasks')
  const workspace = page.getByRole('region', { name: 'Event workspace' })
  await page.getByLabel('Search tasks', { exact: true }).fill('Campus')
  await page.getByRole('group', { name: 'Filter tasks by status' }).getByRole('button', { name: /^All\b/ }).click()
  await page.getByRole('navigation', { name: 'Event workspace navigation' }).getByRole('link', { name: 'Budget', exact: true }).click()
  await expect.poll(async () => page.evaluate(() => {
    const params = new URLSearchParams(location.search)
    return params.get('tab') === 'budget' && params.get('taskFilter') === 'all' && params.get('taskSearch') === 'Campus'
  })).toBe(true)
  await page.getByRole('link', { name: /Back to Manage event/ }).click()
  await expect.poll(async () => page.evaluate(() => {
    const params = new URLSearchParams(location.search)
    return params.get('tab') === 'tasks' && params.get('taskFilter') === 'all' && params.get('taskSearch') === 'Campus'
  })).toBe(true)
  await expect(workspace.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible()
  await expect(page.getByLabel('Search tasks', { exact: true })).toHaveValue('Campus')
  await expect(page.getByRole('group', { name: 'Filter tasks by status' }).getByRole('button', { name: /^All\b/ })).toHaveAttribute('aria-pressed', 'true')
})
