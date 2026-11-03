// Live hangout journey against the hosted project (needs migration 20261103120000_hangouts,
// the Express API with /api/hangouts and OneMap credentials). Creates one [TEST] group
// hangout and deletes it afterwards; existing events are never touched.
import { test, expect } from '@playwright/test'
import { authFile } from './accounts.mjs'
import { openAs, db } from './helpers.mjs'

test.describe.configure({ mode: 'serial' })
let organiser, participant, eventId, inviteLink
const title = `[TEST] hangout ${Date.now()}`
const sgDay = offset => new Date(Date.now() + 8 * 3600e3 + offset * 864e5).toISOString().slice(0, 10)

test.beforeAll(async ({ browser }) => {
  organiser = await openAs(browser, 'organiser')
  participant = await openAs(browser, 'participant')
  for (const s of [organiser, participant]) s.page.on('dialog', dialog => dialog.accept())
  const ready = await db(organiser.page, async () => {
    const { supabase } = await import('/src/utils/supabase.js')
    const { error } = await supabase.rpc('preview_hangout_invite', { p_token: 'probe' })
    return !error
  })
  test.skip(!ready, 'The hangout migration is not applied to this project yet.')
})
test.afterAll(async () => {
  if (eventId && organiser) {
    const left = await db(organiser.page, async id => {
      const { supabase } = await import('/src/utils/supabase.js')
      const { data: ev } = await supabase.from('events').select('venue_id').eq('id', id).maybeSingle()
      const { error } = await supabase.from('events').delete().eq('id', id)
      if (error) throw error
      const { data } = await supabase.from('venues').select('id').eq('id', ev?.venue_id || '00000000-0000-0000-0000-000000000000')
      return data?.length || 0
    }, eventId)
    expect(left, 'the start-area venue is removed with the hangout').toBe(0)
  }
  for (const [role, s] of [['organiser', organiser], ['participant', participant]]) {
    if (s) { await s.context.storageState({ path: authFile(role) }); await s.context.close() }
  }
})

test('organiser creates a private group hangout through the Hangout template', async () => {
  const page = organiser.page
  await page.goto('/organiser/events/new')
  await page.getByRole('button', { name: /^Hangout/ }).click()
  await page.getByLabel('Title').fill(title)
  await page.getByRole('button', { name: 'food', exact: true }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('First possible day').fill(sgDay(2))
  await page.getByLabel('Last possible day').fill(sgDay(3))
  await page.getByRole('button', { name: 'Next' }).click()
  await page.locator('#hangout-area-search').fill('Bugis Junction')
  await page.locator('.list-group-item').first().click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Create hangout' }).click()
  await expect(page.getByRole('heading', { name: 'Your hangout is ready' })).toBeVisible()
  inviteLink = await page.locator('#invite-link').inputValue()
  expect(inviteLink).toMatch(/\/j\/[0-9a-f]{32}$/)
  await page.getByRole('button', { name: 'Go to hangout' }).click()
  await page.waitForURL(/\/events\/[0-9a-f-]{36}\/rsvp/)
  eventId = page.url().match(/events\/([0-9a-f-]{36})/)[1]
  await expect(page.getByRole('heading', { name: 'You’re hosting' })).toBeVisible()
})

test('a non-member cannot see it; the invite previews it and joins', async () => {
  const page = participant.page
  const visible = await db(page, async id => {
    const { supabase } = await import('/src/utils/supabase.js')
    const { data } = await supabase.from('events_with_counts').select('id').eq('id', id)
    return data.length
  }, eventId)
  expect(visible).toBe(0)
  await page.goto(new URL(inviteLink).pathname)
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  await page.getByRole('button', { name: 'Join hangout' }).click()
  await expect(page.getByText('You’re in.')).toBeVisible()
})

test('both members save free times; ranking names both without exposing raw times', async () => {
  for (const [s, preset] of [[participant, 'Evenings 6–10pm'], [organiser, 'All day 10am–10pm']]) {
    await s.page.goto(`/events/${eventId}/rsvp`)
    await s.page.getByRole('button', { name: preset }).click()
    await s.page.getByRole('button', { name: 'Save my free times' }).click()
    await expect(s.page.getByText('Free times saved.')).toBeVisible()
  }
  const page = organiser.page
  await page.reload()
  const top = page.locator('.slot-card').first()
  await expect(top).toContainText('Can make it (2)')
  const leaked = await db(page, async id => {
    const { supabase } = await import('/src/utils/supabase.js')
    const { data: { session } } = await supabase.auth.getSession()
    const { data } = await supabase.from('hangout_free_blocks').select('user_id').eq('event_id', id).neq('user_id', session.user.id)
    return data.length
  }, eventId)
  expect(leaked).toBe(0)
  await top.getByRole('button', { name: 'Lock this time' }).click()
  await expect(page.getByText('Time locked')).toBeVisible()
})

test('plan with an own OneMap place, a member vote and confirmation', async () => {
  const page = organiser.page
  await page.getByRole('button', { name: 'Add a stop' }).click()
  await page.getByRole('button', { name: 'Your own place', exact: true }).click()
  await page.locator('#plan-place-search').fill('Bugis Street')
  await page.locator('.add-panel .list-group-item').first().click()
  await page.getByLabel('Name', { exact: true }).fill('[TEST] Dinner')
  await page.getByLabel('Kind', { exact: true }).selectOption('meal')
  await page.getByRole('button', { name: 'Add place' }).click()
  await expect(page.getByText('Place added to the end of the plan.')).toBeVisible()

  const member = participant.page
  await member.goto(`/events/${eventId}/rsvp`)
  const keep = member.locator('.vote-stamp--keep').first()
  await keep.click()
  await expect(keep).toHaveAttribute('aria-pressed', 'true')
  await expect(keep).toContainText('1')

  await page.reload()
  await page.getByRole('button', { name: 'Review and confirm plan' }).click()
  const accept = page.getByLabel('I accept these concerns')
  if (await accept.count()) await accept.check()
  await page.getByRole('button', { name: 'Confirm plan', exact: true }).click()
  await expect(page.getByText('Plan confirmed', { exact: true })).toBeVisible()
})

test('late join uses a live OneMap route', async () => {
  const page = organiser.page
  await page.reload()
  const go = page.locator('.go-panel')
  await expect(go.locator('.go-status--final')).toBeVisible()
  const depart = await db(page, async id => {
    const { supabase } = await import('/src/utils/supabase.js')
    const { data } = await supabase.from('hangouts').select('locked_start').eq('event_id', id).single()
    return new Date(Date.parse(data.locked_start) + 8 * 3600e3).toISOString().slice(0, 16)
  }, eventId)
  await go.locator('#late-origin').fill('Raffles Place MRT')
  await go.locator('.list-group-item').first().click()
  await go.getByLabel('Leaving at').fill(depart)
  await go.getByRole('button', { name: 'Find where to meet them' }).click()
  await expect(go.locator('.join-result')).toContainText('(OneMap route)', { timeout: 40_000 })
})
