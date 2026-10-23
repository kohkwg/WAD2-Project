// Live floor plan test (Feature 6) against the real Supabase project:
// organiser draws and saves a plan for a [TEST] event -> it persists across reloads ->
// participants see it read-only on the event page and cannot edit or write it.
// Run on its own with: pnpm test:e2e:live e2e-live/floor-plan.spec.mjs
import { test, expect } from '@playwright/test'
import { ACCOUNTS, authFile } from './accounts.mjs'
import { createTestEvent, db, deleteEvent, openAs } from './helpers.mjs'

test.describe.configure({ mode: 'serial' })

const TITLE = `[TEST] e2e floor plan ${Date.now()}`
let organiser
let participant
let eventId = null

const savedPlan = (page, id) =>
  db(page, async (eid) => {
    const { getFloorPlan } = await import('/src/utils/floorPlan.js')
    return getFloorPlan(eid)
  }, id)

test.beforeAll(async ({ browser }) => {
  organiser = await openAs(browser, 'organiser')
  participant = await openAs(browser, 'participant')
  await expect(organiser.page.getByText(ACCOUNTS.organiser)).toBeVisible()
  await expect(participant.page.getByText(ACCOUNTS.participant)).toBeVisible()
})

test.afterAll(async () => {
  if (eventId && organiser) await deleteEvent(organiser.page, eventId) // cascades to floor_plans
  for (const [role, s] of [['organiser', organiser], ['participant', participant]]) {
    if (!s) continue
    await s.context.storageState({ path: authFile(role) }) // refresh tokens are single-use
    await s.context.close()
  }
})

test('event page shows no floor plan before one is saved', async () => {
  eventId = await createTestEvent(organiser.page, { title: TITLE, tag: 'arts' })
  const { page } = participant
  await page.goto(`/events/${eventId}/rsvp`)
  await expect(page.locator('main')).toContainText(TITLE)
  await expect(page.getByRole('heading', { name: 'Floor plan', exact: true })).toHaveCount(0)
})

test('organiser opens an empty editor from Manage event', async () => {
  const { page } = organiser
  await page.goto(`/organiser/events/${eventId}/manage`)
  await page.getByRole('link', { name: 'Floor plan' }).click()
  await expect(page).toHaveURL(new RegExp(`/organiser/events/${eventId}/floor-plan`))
  await expect(page.getByRole('heading', { name: 'Floor plan', level: 1, exact: true })).toBeVisible()
  await expect(page.getByText('No floor plan yet.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save floor plan' })).toBeDisabled()
})

test('organiser adds a zone and a helper spot, then saves', async () => {
  const { page } = organiser
  await page.getByRole('button', { name: 'Add box' }).click()
  await page.getByRole('button', { name: 'Add box' }).click()
  await page.getByRole('button', { name: 'Add person' }).click()
  await page.getByLabel('Box name: New Box 1').fill('Stage')
  await expect(page.getByText('Unsaved changes')).toBeVisible()

  await page.getByRole('button', { name: 'Save floor plan' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  await expect(page.getByText('All changes saved')).toBeVisible()

  const plan = await savedPlan(page, eventId)
  expect(plan.layout.objects.map((o) => o.label)).toEqual(['Stage', 'New Box 2'])
  expect(plan.layout.people).toHaveLength(1)
})

test('the saved plan survives a reload, and edits update the same plan', async () => {
  const { page } = organiser
  await page.reload()
  await expect(page.getByLabel('Box name: Stage')).toHaveValue('Stage')
  await page.getByRole('button', { name: 'Remove New Box 2' }).click()
  await page.getByRole('button', { name: 'Save floor plan' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()

  const plan = await savedPlan(page, eventId)
  expect(plan.layout.objects.map((o) => o.label)).toEqual(['Stage'])
  const count = await db(page, async (eid) => {
    const { supabase } = await import('/src/utils/supabase.js')
    const { count: n } = await supabase.from('floor_plans').select('id', { count: 'exact', head: true }).eq('event_id', eid)
    return n
  }, eventId)
  expect(count).toBe(1) // one plan per event, updated in place
})

test('participants see the plan read-only on the event page', async () => {
  const { page } = participant
  await page.goto(`/events/${eventId}/rsvp`)
  await expect(page.getByRole('heading', { name: 'Floor plan', exact: true })).toBeVisible()
  await expect(page.locator('.konvajs-content canvas').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save floor plan' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add box' })).toHaveCount(0)
})

test('a participant cannot edit or overwrite the plan', async () => {
  const { page } = participant
  await page.goto(`/organiser/events/${eventId}/floor-plan`)
  await expect(page.getByText('View only')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save floor plan' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add box' })).toHaveCount(0)

  // Even calling the database directly is refused by RLS
  const result = await db(page, async (eid) => {
    const { getFloorPlan, saveFloorPlan } = await import('/src/utils/floorPlan.js')
    const plan = await getFloorPlan(eid)
    try {
      await saveFloorPlan(eid, { id: plan.id, width: 900, height: 560, objects: [], people: [] })
      return 'saved'
    } catch (e) {
      return 'refused'
    }
  }, eventId)
  expect(result).toBe('refused')
  const plan = await savedPlan(organiser.page, eventId)
  expect(plan.layout.objects.map((o) => o.label)).toEqual(['Stage'])
})
