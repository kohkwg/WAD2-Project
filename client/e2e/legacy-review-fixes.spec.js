import { test, expect } from '@playwright/test'

const STORE = 'bookedz-feature2-demo'
const EVENT_ID = 'e-weather-demo'

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-16T04:00:00.000Z'))
  await page.route('**/api/common/elastic/search**', route => route.fulfill({ json: {
    results: [{ BUILDING: 'SMU Campus Green', SEARCHVAL: 'SMU Campus Green', ADDRESS: '81 Victoria Street', POSTAL: '188065', LATITUDE: '1.2966', LONGITUDE: '103.8502' }],
  } }))
})

test('My RSVPs refreshes offer data on its existing cadence and on focus', async ({ page }) => {
  await page.goto('/my-rsvps')
  await expect(page.getByRole('heading', { name: 'My RSVPs' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Refresh RSVPs' })).toBeVisible()
  await page.evaluate(key => {
    const state = JSON.parse(localStorage.getItem(key))
    state.rsvps.find(rsvp => rsvp.id === 'r3').status = 'waitlisted'
    localStorage.setItem(key, JSON.stringify(state))
  }, STORE)
  await page.clock.fastForward(30_000)
  await expect(page.getByText(/A spot opened up for/)).toHaveCount(0)
  await page.evaluate(key => {
    const state = JSON.parse(localStorage.getItem(key))
    state.rsvps.find(rsvp => rsvp.id === 'r3').status = 'offered'
    localStorage.setItem(key, JSON.stringify(state))
  }, STORE)
  await page.getByRole('button', { name: 'Refresh RSVPs' }).click()
  await expect(page.getByText(/A spot opened up for/)).toBeVisible()
  await page.evaluate(key => {
    const state = JSON.parse(localStorage.getItem(key))
    state.rsvps.find(rsvp => rsvp.id === 'r3').status = 'waitlisted'
    localStorage.setItem(key, JSON.stringify(state))
  }, STORE)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByText(/A spot opened up for/)).toHaveCount(0)
})

test('a stale OneMap response cannot replace results for the current query', async ({ page }) => {
  let releaseOld
  await page.route('**/api/common/elastic/search**', async route => {
    const query = new URL(route.request().url()).searchParams.get('searchVal')
    if (query === 'Old query') {
      await new Promise(resolve => { releaseOld = resolve })
      await route.fulfill({ json: { results: [{ BUILDING: 'Old place', SEARCHVAL: 'Old place', ADDRESS: 'Old address', POSTAL: '123456', LATITUDE: '1', LONGITUDE: '103' }] } })
      return
    }
    await route.fulfill({ json: { results: [{ BUILDING: 'New place', SEARCHVAL: 'New place', ADDRESS: 'New address', POSTAL: '654321', LATITUDE: '1.3', LONGITUDE: '103.8' }] } })
  })
  await page.goto('/organiser/events/new')
  await page.getByLabel('Event title').fill('Address test')
  await page.getByLabel('Starts').fill('2026-10-20T19:00')
  await page.getByLabel('Ends').fill('2026-10-20T21:00')
  await page.getByText('music', { exact: true }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  const search = page.getByLabel('Search for the venue (OneMap)')
  const oldRequest = page.waitForRequest(request => new URL(request.url()).searchParams.get('searchVal') === 'Old query')
  await search.fill('Old query')
  await oldRequest
  await search.fill('New query')
  await expect(page.getByRole('button', { name: /New place/ })).toBeVisible()
  const oldResponse = page.waitForResponse(response => new URL(response.url()).searchParams.get('searchVal') === 'Old query' && response.status() === 200)
  releaseOld?.()
  await oldResponse
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await expect(page.getByRole('button', { name: /Old place/ })).toHaveCount(0)
})

test('Escape dismisses pending OneMap suggestions and ignores the late result', async ({ page }) => {
  let releaseSearch
  await page.route('**/api/common/elastic/search**', async route => {
    await new Promise(resolve => { releaseSearch = resolve })
    await route.fulfill({ json: {
      results: [{ BUILDING: 'Dismissed place', SEARCHVAL: 'Dismissed place', ADDRESS: 'Late address', POSTAL: '123456', LATITUDE: '1', LONGITUDE: '103' }],
    } })
  })
  await page.goto('/organiser/events/new')
  await page.getByLabel('Event title').fill('Escape test')
  await page.getByLabel('Starts').fill('2026-10-20T19:00')
  await page.getByLabel('Ends').fill('2026-10-20T21:00')
  await page.getByText('music', { exact: true }).click()
  await page.getByRole('button', { name: 'Next' }).click()

  const search = page.getByLabel('Search for the venue (OneMap)')
  const request = page.waitForRequest(request => new URL(request.url()).searchParams.get('searchVal') === 'Dismiss query')
  await search.fill('Dismiss query')
  await request
  await search.press('Escape')
  await expect(search).toHaveValue('Dismiss query')
  await expect(page.getByRole('status')).toHaveCount(0)

  const response = page.waitForResponse(response => new URL(response.url()).searchParams.get('searchVal') === 'Dismiss query')
  releaseSearch?.()
  await response
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await expect(page.getByRole('button', { name: /Dismissed place/ })).toHaveCount(0)
  await expect(page.getByRole('status')).toHaveCount(0)
})

test('Publish revalidates elapsed start time and preserves the draft at Basics', async ({ page }) => {
  await page.goto('/organiser/events/new')
  await page.getByLabel('Event title').fill('Future event')
  await page.getByLabel('Starts').fill('2026-10-16T12:01')
  await page.getByLabel('Ends').fill('2026-10-16T13:00')
  await page.getByText('music', { exact: true }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Search for the venue (OneMap)').fill('SMU venue')
  await page.getByRole('button', { name: /SMU Campus Green/ }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.clock.setFixedTime(new Date('2026-10-16T04:02:00.000Z'))
  await page.getByRole('button', { name: 'Publish event' }).click()
  await expect(page.locator('#start')).toBeFocused()
  await expect(page.locator('[aria-current="step"]')).toHaveText('1')
  await expect(page.getByText('The start time cannot be in the past.')).toBeVisible()
  await expect(page.getByLabel('Event title')).toHaveValue('Future event')
})

test('Basics validation focuses the missing date field and keeps the draft', async ({ page }) => {
  await page.goto('/organiser/events/new')
  await page.getByLabel('Event title').fill('Date focus test')
  await page.getByText('music', { exact: true }).click()

  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByLabel('Starts')).toBeFocused()
  await expect(page.getByLabel('Event title')).toHaveValue('Date focus test')

  await page.getByLabel('Starts').fill('2026-10-20T19:00')
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByLabel('Ends')).toBeFocused()
  await expect(page.getByLabel('Starts')).toHaveValue('2026-10-20T19:00')
})

test('Manage RSVPs reloads the event when the mounted route changes IDs', async ({ page }) => {
  await page.goto('/organiser/events/e-weather-demo/rsvps')
  await expect(page.getByRole('heading', { name: /Campus Green Social/ })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Filter RSVPs by status' }).getByRole('button', { name: /Confirmed/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('progressbar', { name: /Occupancy:/ })).toHaveAttribute('aria-valuemax', '30')
  await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/organiser/events/e2/rsvps'))
  await expect(page.getByRole('heading', { name: 'Intro to Vue Workshop' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'My events', exact: true })).toBeVisible()
})

test('closed RSVP disclosure exposes its expanded state and controlled list', async ({ page }) => {
  await page.goto('/my-rsvps')
  await expect(page.getByRole('heading', { name: 'My RSVPs' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Refresh RSVPs' })).toBeVisible()
  await page.evaluate(key => {
    const state = JSON.parse(localStorage.getItem(key))
    state.rsvps.find(rsvp => rsvp.id === 'r11').status = 'cancelled'
    localStorage.setItem(key, JSON.stringify(state))
  }, STORE)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'My RSVPs' })).toBeVisible()
  await page.getByRole('button', { name: /Show cancelled and closed RSVPs/ }).click()
  const disclosure = page.getByRole('button', { name: /Hide cancelled and closed RSVPs/ })
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('#closed-rsvps')).toBeVisible()
})
