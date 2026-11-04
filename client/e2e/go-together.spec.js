import { test, expect } from '@playwright/test'

// Community is Go together (DESIGN.md, Community): groups are tied to one official event,
// public or private with an invite link; joining offers an event RSVP; members plan food
// before and after on the group page. Groups stay out of Discover and My events.
const STORE = 'bookedz-feature2-demo'

test.beforeEach(async ({ page }) => {
  await page.goto('/discover')
  await page.evaluate((key) => localStorage.removeItem(key), STORE)
})

test('join a group, get the event RSVP prompt, plan lunch and chat', async ({ page }) => {
  // The food server isn't running in this test; the planner still takes typed places
  await page.route('**/api/food/nearby**', (route) => route.fulfill({ json: { deals: [{ id: 'd1', kind: 'deal', title: '1-for-1 lattes', merchant: 'Kopi Corner', priceText: '$4', outlet: { name: 'Kopi Corner', lat: 1.297, lng: 103.851 }, distanceM: 120, validAt: 'valid', source: { name: 'Telegram', url: 'https://t.me/example/1' } }], places: [], status: { places: 'unconfigured', deals: 'ok' } } }))
  await page.goto('/community')
  await expect(page.getByRole('heading', { level: 1, name: 'Go together' })).toBeVisible()
  const card = page.locator('#group-grp2')
  await expect(card).toContainText('Intro to Vue Workshop')
  await card.getByRole('button', { name: 'Join group' }).click()
  await expect(card).toContainText('You’re in')
  await expect(card.getByText(/RSVP to Intro to Vue Workshop so you have a spot/)).toBeVisible()
  await expect(card.getByRole('link', { name: 'Request a spot' })).toHaveAttribute('href', '/events/e2/rsvp#rsvp')

  await card.getByRole('link', { name: /Open group/ }).click()
  await expect(page).toHaveURL(/\/groups\/grp2$/)
  await expect(page.getByLabel('Invite link')).toHaveValue(/\/g\/inv-grp2$/)
  const before = page.getByRole('article', { name: /before$/ })
  // Paint free times when2meet style: drag down your column
  const cells = before.getByRole('button', { name: /you’re not free/ })
  await cells.nth(10).scrollIntoViewIfNeeded()
  const first = await cells.nth(6).boundingBox()
  const last = await cells.nth(10).boundingBox()
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2)
  await page.mouse.down()
  await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2, { steps: 6 })
  await page.mouse.up()
  await expect(before.getByRole('button', { name: /you’re free/ })).toHaveCount(5)
  await expect(before).toContainText(/Best time, 1 of 2 free:.*You/)
  // Keyboard toggles one cell
  await before.getByRole('button', { name: /you’re free/ }).first().press('Space')
  await expect(before.getByRole('button', { name: /you’re free/ })).toHaveCount(4)
  const after = page.getByRole('article', { name: /after$/ })
  await after.getByRole('button', { name: 'I can’t make it' }).click()
  await expect(after).toContainText('Not marked yet: Ethan')
  await before.getByRole('button', { name: /Suggest a spot/ }).click()
  await expect(before.getByText('1-for-1 lattes')).toBeVisible()
  await before.getByRole('button', { name: 'Suggest' }).click()
  await expect(before.locator('.group-idea', { hasText: 'Kopi Corner' })).toContainText('Keen 1')

  await page.getByLabel('Message').fill('See you there')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('See you there')).toBeVisible()
})

test('start a private group from an event page and open it by invite link', async ({ page }) => {
  await page.goto('/events/e5/rsvp')
  await page.getByRole('region', { name: 'Go together' }).getByRole('link', { name: 'Start a group' }).click()
  const dialog = page.getByRole('dialog', { name: 'Start a group' })
  await expect(dialog.getByLabel('Event', { exact: true })).toHaveValue('e5')
  await dialog.getByLabel(/Note/).fill('Who wants to try the wheel?')
  await dialog.getByRole('radio', { name: /^Private/ }).check()
  await dialog.getByRole('button', { name: 'Start group' }).click()
  await expect(page).toHaveURL(/\/groups\/g\d+$/)
  await expect(page.getByText('Private · only people with the link can find it')).toBeVisible()
  const link = await page.getByLabel('Invite link').inputValue()

  // The host picks a typed idea for after the event
  const after = page.getByRole('article', { name: /after$/ })
  await after.getByRole('button', { name: /Suggest a spot/ }).click()
  await after.getByLabel('Or type a place').fill('Maxwell Food Centre')
  await after.getByRole('button', { name: 'Add' }).click()
  await after.getByRole('button', { name: 'Pick' }).click()
  await expect(after).toContainText('Planned')

  await page.goto(new URL(link).pathname)
  await expect(page.getByRole('heading', { level: 1, name: 'Your group' })).toBeVisible()
  await page.goto('/g/not-a-real-token')
  await expect(page.getByText('This invite link isn’t valid any more.')).toBeVisible()
})

test('groups stay out of Discover and My events', async ({ page }) => {
  await page.goto('/discover')
  await expect(page.locator('.discovery-event-row').first()).toBeVisible()
  await expect(page.locator('.discovery-event-row', { hasText: 'Going to' })).toHaveCount(0)
  await page.goto('/organiser/events')
  await expect(page.locator('.organiser-event-card', { hasText: 'Going to' })).toHaveCount(0)
})
