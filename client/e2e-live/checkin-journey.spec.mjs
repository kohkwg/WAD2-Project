// Live end-to-end check-in journey (Feature 3) against the real Supabase project:
// organiser creates an event -> participant RSVPs and gets a ticket (QR + barcode)
// -> staff check-in by name/email search -> live ticket + dashboard update ->
// attendance export, interest-weight bump, and the RSVP rules around check-in.
// Uses throwaway [TEST] data that afterAll deletes, even when a step fails.
import { test, expect } from '@playwright/test'
import { ACCOUNTS, authFile } from './accounts.mjs'
import { createTestEvent, db, openAs } from './helpers.mjs'

test.describe.configure({ mode: 'serial' })

const TITLE = `[TEST] e2e check-in ${Date.now()}`
const TAG = 'gaming'
let organiser // { context, page }
let participant
let eventId = null
let ticketCode = ''
let weightBefore = null

const myWeight = (page, tag) =>
  db(page, async (t) => {
    const { supabase } = await import('/src/utils/supabase.js')
    const { data: auth } = await supabase.auth.getUser()
    const { data } = await supabase.from('profiles').select('interest_weights').eq('id', auth.user.id).single()
    return Number(data.interest_weights?.[t] ?? 0)
  }, tag)

test.beforeAll(async ({ browser }) => {
  organiser = await openAs(browser, 'organiser')
  participant = await openAs(browser, 'participant')
  await expect(organiser.page.getByText(ACCOUNTS.organiser)).toBeVisible()
  await expect(participant.page.getByText(ACCOUNTS.participant)).toBeVisible()
})

test.afterAll(async () => {
  // Undo the attendance bump so repeated runs don't keep raising the test account's weight
  if (participant && weightBefore !== null) {
    await db(participant.page, async ({ tag, weight }) => {
      const { supabase } = await import('/src/utils/supabase.js')
      const { data: auth } = await supabase.auth.getUser()
      const { data } = await supabase.from('profiles').select('interest_weights').eq('id', auth.user.id).single()
      const weights = { ...(data.interest_weights || {}) }
      if (weight > 0) weights[tag] = weight
      else delete weights[tag]
      await supabase.from('profiles').update({ interest_weights: weights }).eq('id', auth.user.id)
    }, { tag: TAG, weight: weightBefore })
  }
  if (eventId && organiser) {
    await db(organiser.page, async (id) => {
      const { supabase } = await import('/src/utils/supabase.js')
      await supabase.from('events').delete().eq('id', id)
    }, eventId)
  }
  // Supabase refresh tokens are single-use, so keep the refreshed sessions
  for (const [role, s] of [['organiser', organiser], ['participant', participant]]) {
    if (!s) continue
    await s.context.storageState({ path: authFile(role) })
    await s.context.close()
  }
})

test('organiser creates a [TEST] event', async () => {
  eventId = await createTestEvent(organiser.page, { title: TITLE, tag: TAG })
  expect(eventId).toMatch(/^[0-9a-f-]{36}$/)
})

test('organiser cannot RSVP to their own event', async () => {
  const { page } = organiser
  await page.goto(`/events/${eventId}/rsvp`)
  await page.getByRole('button', { name: 'RSVP', exact: true }).click()
  await expect(page.locator('main')).toContainText("Organisers and helpers can't RSVP to their own event")
})

test('participant RSVPs and gets a ticket with QR and barcode', async () => {
  const { page } = participant
  weightBefore = await myWeight(page, TAG)

  await page.goto(`/events/${eventId}/rsvp`)
  await page.getByRole('button', { name: 'RSVP', exact: true }).click()
  await expect(page.locator('main')).toContainText('Confirmed')

  await page.goto('/my-rsvps')
  await page.locator('.card', { hasText: TITLE }).getByRole('link', { name: 'My ticket' }).click()
  await expect(page.getByRole('img', { name: 'Your personal check-in QR code' })).toBeVisible()
  const barcode = page.getByRole('img', { name: /Your ticket barcode, code / })
  await expect(barcode).toBeVisible()
  ticketCode = (await barcode.getAttribute('aria-label')).split('code ').pop()
  expect(ticketCode).toMatch(/^[0-9A-F]{10}$/)
  // stays open: the next test checks it updates live when staff check them in
})

test('staff check the participant in by email search; the ticket updates live', async () => {
  const station = organiser.page
  await station.goto(`/organiser/events/${eventId}/check-in`)
  await station.locator('#attendee-search').fill(ACCOUNTS.participant)
  const matches = station.getByRole('list', { name: 'Matching attendees' })
  await matches.getByRole('button', { name: 'Check in' }).click()

  await expect(station.locator('.alert-success')).toContainText('Checked in at')
  await expect(matches.getByText('In', { exact: true })).toBeVisible()
  await expect(participant.page.getByText(/Checked in at/)).toBeVisible() // Realtime on the ticket page
})

test('typing the barcode code again does not create a second check-in', async () => {
  const station = organiser.page
  await station.locator('#typed-code').fill(ticketCode.toLowerCase())
  await station.locator('#typed-code').press('Enter')
  // within 30 s of the first check-in it may show as fresh (clock slack); either way it is the same row
  await expect(station.locator('.alert-success, .alert-warning')).toBeVisible()
  const rows = await db(station, async (id) => {
    const { supabase } = await import('/src/utils/supabase.js')
    const { data } = await supabase.from('check_ins').select('id, method').eq('event_id', id)
    return data
  }, eventId)
  expect(rows).toHaveLength(1)
  expect(rows[0].method).toBe('manual')
})

test('attendance dashboard shows 1 of 1 checked in', async () => {
  const { page } = organiser
  await page.goto(`/organiser/events/${eventId}/attendance`)
  await expect(page.locator('main')).toContainText('/ 1 confirmed checked in')
  await expect(page.locator('main')).toContainText('100%')
  await expect(page.locator('main')).toContainText('Manual ·')
})

test('attendance export: organiser gets the row, participant gets none', async () => {
  const exportRows = (page) =>
    db(page, async (id) => {
      const { supabase } = await import('/src/utils/supabase.js')
      const { data } = await supabase.rpc('export_attendance', { p_event_id: id })
      return data ?? []
    }, eventId)
  const organiserRows = await exportRows(organiser.page)
  expect(organiserRows).toHaveLength(1)
  expect(organiserRows[0].email).toBe(ACCOUNTS.participant)
  expect(await exportRows(participant.page)).toHaveLength(0)
})

test("attending raised the participant's interest weight for the event's tag", async () => {
  const after = await myWeight(participant.page, TAG)
  expect(after).toBe(Math.min(5, weightBefore + 1))
})

test('a checked-in participant cannot cancel', async () => {
  const { page } = participant
  await page.goto('/my-rsvps')
  const card = page.locator('.card', { hasText: TITLE })
  await card.getByRole('button', { name: 'Cancel RSVP' }).click()
  await card.getByRole('button', { name: 'Yes, cancel' }).click()
  await expect(page.locator('main')).toContainText("You have already checked in, so this RSVP can't be cancelled")
})
