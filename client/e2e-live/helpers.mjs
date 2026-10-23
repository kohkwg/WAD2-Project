// Shared steps for the live suites.
import { expect } from '@playwright/test'
import { authFile } from './accounts.mjs'

export async function openAs(browser, role) {
  const context = await browser.newContext({ storageState: authFile(role) })
  const page = await context.newPage()
  await page.goto('/events')
  return { context, page }
}

// Runs inside the app page, using the app's own signed-in Supabase client
export const db = (page, fn, arg) => page.evaluate(fn, arg)

// Organiser creates a published [TEST] event (starts in 1 h, at SMU SCIS) and returns its id
export async function createTestEvent(page, { title, tag, coverFile }) {
  await page.goto('/organiser/events/new')
  const { start, end } = await page.evaluate(() => {
    const p = (n) => String(n).padStart(2, '0')
    const f = (d) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
    const s = new Date(Date.now() + 60 * 60 * 1000)
    return { start: f(s), end: f(new Date(s.getTime() + 2 * 60 * 60 * 1000)) }
  })
  await page.getByPlaceholder('e.g. Acoustic Night at the Campus Green').fill(title)
  await page.getByPlaceholder('What will happen? What should people bring?').fill('Live e2e test event. Deleted automatically.')
  if (coverFile) {
    await page.getByLabel('Cover image (optional)').setInputFiles(coverFile)
    await expect(page.getByRole('img', { name: 'Event cover preview' })).toBeVisible()
  }
  await page.getByLabel('Starts').fill(start)
  await page.getByLabel('Ends').fill(end)
  await page.getByLabel('Capacity').fill('5')
  // Tags are Bootstrap .btn-check inputs (visually hidden), so click the visible label
  await page.locator(`label[for="tag-${tag}"]`).click()
  await expect(page.getByRole('checkbox', { name: tag })).toBeChecked()
  await page.getByRole('button', { name: 'Next' }).click()

  await page.getByPlaceholder('Start typing a building, street or postal code').fill('178902')
  await page.locator('button', { hasText: 'SMU SCHOOL OF COMPUTING' }).first().click()
  await page.getByRole('button', { name: 'Next' }).click() // RSVP questions
  await page.getByRole('button', { name: 'Next' }).click() // review
  await expect(page.locator('main')).toContainText(title)
  await page.getByRole('button', { name: 'Publish event' }).click()

  await page.waitForURL(/created=/)
  return new URL(page.url()).searchParams.get('created')
}

export async function deleteEvent(page, id) {
  await db(page, async (eventId) => {
    const { supabase } = await import('/src/utils/supabase.js')
    await supabase.from('events').delete().eq('id', eventId)
  }, id)
}
