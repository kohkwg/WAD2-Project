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
  await page.getByRole('group', { name: 'Elements on this plan' }).getByRole('button', { name: 'New Box 1' }).click()
  await page.getByRole('group', { name: 'Selected element' }).getByLabel('Name', { exact: true }).fill('Stage')
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
  const elements = page.getByRole('group', { name: 'Elements on this plan' })
  await expect(elements.getByRole('button', { name: 'Stage' })).toBeVisible()
  await elements.getByRole('button', { name: 'New Box 2' }).click()
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

test('real team helper positions persist with keyboard controls', async () => {
  const { page } = organiser
  await page.getByLabel('Team member', { exact: true }).selectOption({ index: 1 })
  await page.getByRole('button', { name: 'Add helper', exact: true }).click()
  const section = page.getByRole('region', { name: 'Team helper placements' })
  await section.getByLabel('X', { exact: true }).fill('240')
  await section.getByLabel('Y', { exact: true }).fill('250')
  await page.getByRole('button', { name: 'Save helper positions' }).click()
  await expect(page.getByText('Helper positions saved.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save helper positions' })).toBeDisabled()
  await page.reload()
  await expect(section.getByLabel('X', { exact: true })).toHaveValue('240')
  await expect(section.getByLabel('Y', { exact: true })).toHaveValue('250')
  const rows = await db(page, async eid => {
    const { getHelperPlacements } = await import('/src/utils/floorPlan.js')
    return getHelperPlacements(eid)
  }, eventId)
  expect(rows).toHaveLength(1)
  expect(rows[0].user_id).toBeTruthy()
})

test('programme creates, edits and persists a linked zone', async () => {
  const { page } = organiser
  await page.getByRole('button', { name: 'Add programme item' }).click()
  const form = page.getByRole('region', { name: 'Programme flow' })
  await form.getByLabel('Title', { exact: true }).fill('Opening programme')
  await form.getByLabel('Starts (Singapore)').fill('2026-11-01T09:00')
  await form.getByLabel('Ends (Singapore)').fill('2026-11-01T10:00')
  await form.getByLabel('Description', { exact: true }).fill('Meet the event team.')
  await form.getByLabel('Floor-plan zone').selectOption({ label: 'Stage' })
  await form.getByRole('button', { name: 'Save programme item' }).click()
  await expect(form.getByRole('heading', { name: 'Opening programme' })).toBeVisible()
  await page.reload()
  await form.getByRole('button', { name: 'Edit Opening programme' }).click()
  await form.getByLabel('Title', { exact: true }).fill('Welcome programme')
  await form.getByRole('button', { name: 'Save programme item' }).click()
  await expect(form.getByRole('heading', { name: 'Welcome programme' })).toBeVisible()
})

test('participants see the plan read-only on the event page', async () => {
  const { page } = participant
  await page.goto(`/events/${eventId}/rsvp`)
  await expect(page.getByRole('heading', { name: 'Floor plan', exact: true })).toBeVisible()
  await expect(page.locator('.konvajs-content canvas').first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Welcome programme' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Team helper placements' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add programme item' })).toHaveCount(0)
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
  const privateAndWriteResults = await db(page, async eid => {
    const { getProgramme, getHelperPlacements, saveProgrammeItem, saveHelperPlacement } = await import('/src/utils/floorPlan.js')
    const programme = await getProgramme(eid)
    const helpers = await getHelperPlacements(eid)
    const attempt = async fn => { try { await fn(); return 'saved' } catch { return 'refused' } }
    return {
      helperCount: helpers.length,
      programmeWrite: await attempt(() => saveProgrammeItem(eid, { id: programme[0].id, title: 'Unauthorised update' })),
      helperWrite: await attempt(() => saveHelperPlacement(eid, { floor_plan_id: '00000000-0000-0000-0000-000000000000', user_id: '00000000-0000-0000-0000-000000000000', x: 1, y: 1 })),
    }
  }, eventId)
  expect(privateAndWriteResults).toEqual({ helperCount: 0, programmeWrite: 'refused', helperWrite: 'refused' })
})

test('programme deletion and responsive canvas keep one main and no Vue event warnings', async () => {
  const { page } = organiser
  const warnings = []
  page.on('console', message => { if (/Extraneous|dragend/.test(message.text())) warnings.push(message.text()) })
  await page.goto(`/organiser/events/${eventId}/floor-plan`)
  await page.getByRole('button', { name: 'Delete Welcome programme' }).click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome programme' })).toBeVisible()
  await page.getByRole('button', { name: 'Delete Welcome programme' }).click()
  await page.getByRole('button', { name: 'Confirm delete programme item' }).click()
  await expect(page.getByRole('heading', { name: 'Welcome programme' })).toHaveCount(0)
  for (const width of [375, 575, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(page.locator('main')).toHaveCount(1)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const canvas = page.locator('.konvajs-content').first()
    await expect(canvas).toBeVisible()
    await expect.poll(async () => (await canvas.boundingBox()).width <= width).toBe(true)
  }
  expect(warnings).toEqual([])
})
