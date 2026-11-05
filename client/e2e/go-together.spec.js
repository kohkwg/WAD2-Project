import { test, expect } from '@playwright/test'

// Community is Go together (DESIGN.md, Community): groups are tied to one official event,
// public or private with an invite link; joining offers an event RSVP; members plan food
// before and after on the group page. Groups stay out of Discover and Organise.
const STORE = 'bookedz-feature2-demo'

test.beforeEach(async ({ page }) => {
  await page.goto('/discover')
  await page.evaluate((key) => localStorage.removeItem(key), STORE)
})

test('join a group, get the event RSVP prompt, plan lunch and chat', async ({ page }) => {
  // The food server isn't running in this test; the planner still takes typed places
  await page.route('**/api/food/nearby**', (route) => route.fulfill({ json: { deals: [{ id: 'd1', kind: 'deal', title: '1-for-1 lattes', merchant: 'Kopi Corner', priceText: '$4', outlet: { name: 'Kopi Corner', lat: 1.297, lng: 103.851 }, distanceM: 120, validAt: 'valid', source: { name: 'Telegram', url: 'https://t.me/example/1' } }], places: [], status: { places: 'unconfigured', deals: 'ok' } } }))
  await page.goto('/community')
  await expect(page.getByRole('heading', { level: 1, name: 'Community' })).toBeVisible()
  // Groups sit inside their event's card
  const eventCard = page.getByRole('region', { name: 'Intro to Vue Workshop' })
  const card = eventCard.locator('#group-grp2')
  await expect(card).toContainText('Public')
  await expect(card).toContainText('Anyone can join')
  await card.getByRole('button', { name: 'Join group' }).click()
  await expect(card).toContainText('You’re in')
  // Joining RSVPd Alex to the event (it needs the organiser's approval, so it's pending)
  await expect(card).toContainText('You’re waiting for the organiser to approve your RSVP')
  await expect(page.getByText(/You joined the group and RSVP’d to Intro to Vue Workshop/)).toBeVisible()
  // Now going to Intro to Vue, Alex can start a group for it: it's in Your events
  await page.getByRole('tab', { name: /Your events & groups/ }).click()
  await expect(page.getByRole('tabpanel')).toContainText('Intro to Vue Workshop')
  await page.getByRole('tab', { name: /All groups/ }).click()
  // Event teams are not in Community
  await expect(page.getByRole('heading', { name: 'Your event teams' })).toHaveCount(0)

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

test('only people going can start a group; start a friends-only one and open it by invite link', async ({ page }) => {
  // Not RSVPd to Pottery Basics: no Start a group on its page
  await page.goto('/events/e5/rsvp')
  const box = page.getByRole('region', { name: 'Go together' })
  // The group list starts hidden on the event page
  await box.getByRole('button', { name: /^Show groups/ }).click()
  await expect(box.getByRole('button', { name: /^Hide groups/ })).toHaveAttribute('aria-expanded', 'true')
  await expect(box).toContainText('Joining a group RSVPs you to the event too')
  await expect(box.getByRole('link', { name: 'Start a group' })).toHaveCount(0)
  // The dropdown only lists events Alex has RSVPd to
  await page.goto('/community')
  await page.getByRole('tab', { name: /Your events & groups/ }).click()
  await expect(page.getByRole('tabpanel')).toContainText('Career Fair Prep Talk')
  await page.getByRole('button', { name: 'Start a group' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Start a group' })
  const options = await dialog.getByLabel('Event you’re going to').locator('option:not([disabled])').allTextContents()
  expect(options).toContain('Career Fair Prep Talk')
  expect(options).not.toContain('Pottery Basics')
  await dialog.getByLabel('Event you’re going to').selectOption({ label: 'Career Fair Prep Talk' })
  await dialog.getByLabel(/Note/).fill('Who wants to try the wheel?')
  await dialog.getByRole('radio', { name: /^Friends only/ }).check()
  // Quick add: tick a friend to invite
  await dialog.getByRole('checkbox', { name: /Bea Lim/ }).check()
  await dialog.getByRole('button', { name: 'Start group & invite 1' }).click()
  await expect(page).toHaveURL(/\/groups\/g\d+$/)
  await expect(page.locator('.group-hero')).toContainText('Friends only')
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

test('groups stay out of Discover and Organise', async ({ page }) => {
  await page.goto('/discover')
  await expect(page.locator('.discovery-event-row').first()).toBeVisible()
  await expect(page.locator('.discovery-event-row', { hasText: 'Going to' })).toHaveCount(0)
  await page.goto('/organiser/events')
  await expect(page.locator('.organiser-event-card', { hasText: 'Going to' })).toHaveCount(0)
})

test('invites, join messages, host settings and deleting a group', async ({ page }) => {
  await page.goto('/community')
  // Chen invited Alex; accepting joins straight away
  const invites = page.getByRole('region', { name: /You’re invited/ })
  await expect(invites).toContainText('Chen Wei invited you to go to Pottery Basics')
  await invites.getByRole('button', { name: 'Accept' }).click()
  await expect(page).toHaveURL(/\/groups\/grp5$/)
  await expect(page.locator('.group-bar')).toContainText('Leave group')
  // A deleted-group notice can be dismissed
  await page.goto('/community')
  await expect(page.getByText('Ethan Ng deleted their group for Board Games Night')).toBeVisible()
  await page.getByRole('button', { name: /Dismiss notice/ }).click()
  await expect(page.getByText('Ethan Ng deleted their group')).toHaveCount(0)
  // Bea's friends-only group shows because Alex is her friend; asking sends a message
  const bea = page.locator('#group-grp4')
  await expect(bea).toContainText('Friends only')
  await expect(bea).toContainText('Your friend')
  await page.goto('/groups/grp4')
  await page.locator('.group-bar').getByRole('button', { name: 'Ask to join' }).click()
  await page.getByLabel(/Message for Bea Lim/).fill('Can I come to dinner too?')
  await page.getByRole('button', { name: 'Send request' }).click()
  await expect(page.locator('.group-bar')).toContainText('Withdraw request')
  // Alex hosts grp6: Farah's request shows her message; approve, change settings, then delete
  await page.goto('/groups/grp6')
  const requests = page.getByRole('list', { name: 'Requests to join' })
  await expect(requests).toContainText('Farah Ali asked to join')
  await expect(requests).toContainText('SCIS year 2')
  await requests.getByRole('button', { name: 'Accept' }).click()
  await expect(page.getByRole('list', { name: 'Requests to join' })).toHaveCount(0)
  // Approving her into the group RSVPd Farah to the Career Fair talk too
  const farahRsvp = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).rsvps.find((r) => r.eventId === 'e4' && r.userId === 'u6')?.status, STORE)
  expect(['confirmed', 'waitlisted', 'pending']).toContain(farahRsvp)
  await page.locator('.group-bar').getByRole('button', { name: 'Settings' }).click()
  const settings = page.getByRole('region', { name: 'Group settings' })
  await settings.getByLabel('Spots', { exact: true }).fill('2')
  await settings.getByRole('button', { name: 'Save changes' }).click()
  await expect(settings).toContainText('3 people are already in')
  await settings.getByLabel('Spots', { exact: true }).fill('6')
  await settings.getByRole('radio', { name: /^Friends only/ }).check()
  await settings.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.locator('.group-hero')).toContainText('Friends only')
  await expect(page.locator('.group-bar')).toContainText('3/6')
  await page.locator('.group-bar').getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Delete group…' }).click()
  await page.getByRole('button', { name: 'Yes, delete this group' }).click()
  await expect(page).toHaveURL(/\/community$/)
  await expect(page.locator('#group-grp6')).toHaveCount(0)
})

test('organisers see which RSVPs are coming with a group, as an indicator', async ({ page }) => {
  // Intro to Vue (e2) approves RSVPs by hand; Ethan hosts a group for it and is waiting
  await page.goto('/organiser/events/e2/rsvps?status=pending')
  await expect(page.getByRole('status').filter({ hasText: /coming with 1 Go together group/ })).toContainText('waiting for your approval')
  const ethan = page.locator('tr', { hasText: 'Ethan Ng' })
  await expect(ethan).toContainText('Hosting a group of 1')
  // Approving works as normal
  await expect(ethan.getByRole('button', { name: /Approve/ })).toBeEnabled()
  // Acoustic Night (e1): Bea hosts groups; Chen is on the waitlist and in Bea's group
  await page.goto('/organiser/events/e1/rsvps?status=waitlist')
  await expect(page.locator('tr, li', { hasText: 'Chen Wei' }).first()).toContainText('With Bea Lim’s group')
})

test('Friends is a full-height sidebar beside Community on wide screens', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/community')
  await expect(page.getByRole('heading', { name: 'Friends', level: 2 })).toBeVisible()
  const box = await page.evaluate(() => {
    const hero = document.querySelector('.community-hero').getBoundingClientRect()
    const aside = document.querySelector('#friends').getBoundingClientRect()
    return { heroTop: hero.top, asideTop: aside.top, asideLeft: aside.left, heroRight: hero.right, asideHeight: aside.height, vh: innerHeight }
  })
  expect(Math.abs(box.asideTop - box.heroTop)).toBeLessThan(4) // starts level with the top of the page
  expect(box.asideLeft).toBeGreaterThan(box.heroRight) // beside everything, not below
  expect(box.asideHeight).toBeGreaterThan(box.vh - 60) // fills the screen's height
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
