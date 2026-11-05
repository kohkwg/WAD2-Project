import { test, expect } from '@playwright/test'
import { createSeedData } from '../src/utils/mockData.js'

// These checks use the theme dropdown in the expanded sidebar; from 992px the sidebar starts as an icon rail
// unless someone expanded it (docs/decisions.md, 5 November), so start from that remembered choice.
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { try { localStorage.setItem('bookedz-sidebar', 'expanded') } catch { /* storage blocked */ } }) })
const STORE = 'bookedz-feature2-demo'
const NOW = Date.parse('2026-11-02T10:00:00Z')
function fixture() {
  const db = createSeedData(), base = db.events[0]
  db.events = [
    ['review', 'Board Games Meetup', 2, 'published', 'gaming'],
    ['reject', 'Photography Walk', 3, 'published', 'arts'],
    ['manage', 'Watercolour Workshop', 4, 'published', 'arts'],
    ['draft', 'Draft Sketching Plan', 5, 'draft', 'arts'],
    ['old-draft', 'Older Draft Plan', -5, 'draft', 'gaming'],
    ['past', 'Past Coding Meetup', -2, 'completed', 'tech'],
    ['cancelled', 'Cancelled Social', 7, 'cancelled', 'gaming'],
  ].map(([id, title, days, status, tag]) => ({ ...base, id, title, status, tags: [tag], capacity: 24, organiserId: 'org1',
    startTime: new Date(NOW + days * 86400000).toISOString(), endTime: new Date(NOW + days * 86400000 + 7200000).toISOString(),
    venue: { name: 'Demo community room', address: '80 Stamford Road', lat: 1.2974, lng: 103.8496 }, questions: [], requiresApproval: id === 'review' }))
  db.rsvps = [
    ['review', 'u1', 'pending'], ['review', 'u2', 'confirmed'],
    ['reject', 'u1', 'pending'], ['manage', 'u1', 'confirmed'],
  ].map(([eventId, userId, status]) => ({ id: `r-${eventId}-${userId}`, eventId, userId, status, answers: {}, createdAt: new Date(NOW - 86400000).toISOString() }))
  return db
}
async function setup(page) {
  await page.clock.install({ time: new Date(NOW) })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/*.supabase.co/**', route => route.abort())
  await page.addInitScript(({ key, data }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)) }, { key: STORE, data: fixture() })
}
test.beforeEach(async ({ page }) => setup(page))
const card = (page, title) => page.locator('.organiser-event-card').filter({ has: page.getByRole('heading', { name: title, exact: true }) })

test('organiser tabs, search, ordering and state-specific actions persist across visits', async ({ page }) => {
  await page.goto('/organiser/events')
  await expect(page.getByRole('tab', { name: 'Upcoming 3', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.organiser-event-card')).toHaveCount(3)
  await expect(card(page, 'Board Games Meetup').getByRole('link', { name: 'Review requests' })).toHaveAttribute('href', '/organiser/events/review/rsvps?status=pending')
  await expect(card(page, 'Watercolour Workshop').getByRole('link', { name: 'Manage event', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Drafts 2', exact: true }).click()
  await expect(page.locator('.organiser-event-card')).toHaveCount(2)
  await expect(card(page, 'Older Draft Plan').getByRole('link', { name: 'Edit draft' })).toBeVisible()
  await page.getByRole('tab', { name: 'Past 1', exact: true }).click()
  await expect(page.getByRole('link', { name: 'View results' })).toHaveAttribute('href', '/organiser/events/past/attendance')
  await page.getByRole('tab', { name: 'All 7', exact: true }).click()
  await page.getByRole('searchbox', { name: 'Search your events' }).fill('Photography')
  await expect(page.locator('.organiser-event-card')).toHaveCount(1)
  await page.reload()
  await expect(page.getByRole('tab', { name: 'All 7', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('searchbox', { name: 'Search your events' })).toHaveValue('Photography')
  await page.getByRole('searchbox', { name: 'Search your events' }).fill('yoga')
  await expect(page.getByRole('heading', { name: 'No events match “yoga”' })).toBeVisible()
  await page.getByRole('button', { name: 'Clear search', exact: true }).click()
  await expect(page.locator('.organiser-event-card')).toHaveCount(7)
})

test('pending summary filters requests and direct review opens the pending tab', async ({ page }) => {
  await page.goto('/organiser/events')
  await expect(page.getByRole('complementary', { name: 'Pending RSVP requests' })).toContainText('2 RSVPs are waiting for your approval across 2 events')
  await page.getByRole('button', { name: 'Review all requests' }).click()
  await expect(page.locator('.organiser-event-card')).toHaveCount(2)
  await expect(page.getByRole('heading', { name: 'Today and upcoming 2 events' })).toBeFocused()
  // This event does not require approval by default: query must select Pending.
  await card(page, 'Photography Walk').getByRole('link', { name: 'Review requests' }).click()
  await expect(page).toHaveURL(/reject\/rsvps\?status=pending$/)
  await expect(page.getByRole('group', { name: 'Filter RSVPs by status' }).getByRole('button', { name: /Pending approval/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Approve Alex Tan' })).toBeVisible()
})

test('organiser approval, rejection and removal update participant Plans on focus', async ({ page, context }) => {
  const participant = await context.newPage()
  await setup(participant)
  await participant.goto('/my-rsvps')
  const participantRow = title => participant.locator('#panel-upcoming .rsvp-row').filter({ hasText: title })
  await expect(participantRow('Board Games Meetup')).toContainText('Awaiting approval')
  await page.goto('/organiser/events/review/rsvps?status=pending')
  await page.getByRole('button', { name: 'Approve Alex Tan' }).click()
  await expect(page.getByRole('status').filter({ hasText: /approved|confirmed/i })).toBeVisible()
  await participant.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(participantRow('Board Games Meetup').getByText('Confirmed', { exact: true })).toBeVisible()
  await page.goto('/organiser/events/reject/rsvps?status=pending')
  await page.getByRole('button', { name: 'Reject Alex Tan' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'RSVP rejected.' })).toBeVisible()
  await participant.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(participantRow('Photography Walk')).toHaveCount(0)
  await participant.getByRole('tab', { name: /^Cancelled/ }).click()
  await expect(participant.locator('#panel-cancelled')).toContainText('Declined by organiser')
  await page.goto('/organiser/events/manage/rsvps?status=confirmed')
  await page.getByRole('button', { name: 'Remove Alex Tan', exact: true }).click()
  await page.getByRole('button', { name: 'Yes, remove Alex Tan', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Attendee removed.' })).toBeVisible()
  await participant.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(participant.locator('#panel-cancelled')).toContainText('Watercolour Workshop')
  await page.goto('/organiser/events')
  await expect(page.getByRole('complementary', { name: 'Pending RSVP requests' })).toHaveCount(0)
  await participant.close()
})

test('draft editing works with an old planned date and keeps the event unpublished', async ({ page }) => {
  await page.goto('/organiser/events')
  await page.getByRole('tab', { name: 'Drafts 2', exact: true }).click()
  await card(page, 'Older Draft Plan').getByRole('link', { name: 'Edit draft' }).click()
  await expect(page.getByLabel('Event title', { exact: true })).toHaveValue('Older Draft Plan')
  await expect(page.getByText('This event has already started, so it can no longer be edited.', { exact: true })).toHaveCount(0)
  // Exercise the same normal demo update adapter the form uses, without publishing.
  await page.evaluate(async () => {
    const { getEvent, updateEvent } = await import('/src/utils/api.js')
    const event = await getEvent('old-draft')
    await updateEvent(event.id, { ...event, title: 'Updated Draft Plan', startTime: '2026-11-12T10:00:00Z', endTime: '2026-11-12T12:00:00Z' })
  })
  await page.goto('/organiser/events')
  await expect(page.getByRole('tab', { name: 'Drafts 2', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(card(page, 'Updated Draft Plan')).toContainText('Not published yet')
})

test('empty states and mobile layouts remain useful in both themes', async ({ page }, testInfo) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/organiser/events')
  await expect(page.locator('.organiser-event-card')).toHaveCount(3)
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Color theme').selectOption(theme)
    for (const width of [375, 575, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await expect(page.locator('main')).toHaveCount(1)
      const button = await page.getByRole('button', { name: 'Review all requests' }).boundingBox()
      expect(button.height).toBeGreaterThanOrEqual(44)
      if ([375,1280].includes(width)) await page.screenshot({ path: testInfo.outputPath(`organiser-${theme}-${width}.png`), fullPage: true })
    }
  }
  await page.evaluate(key => { const db = JSON.parse(localStorage.getItem(key)); db.events = []; db.rsvps = []; localStorage.setItem(key, JSON.stringify(db)) }, STORE)
  await page.reload()
  await page.getByRole('tab', { name: 'All 0', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'You haven’t hosted anything yet.' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Create your first event' })).toBeVisible()
  expect(errors).toEqual([])
})

test('delete confirmation preserves safe focus and removes only the chosen demo event', async ({ page }) => {
  await page.goto('/organiser/events')
  const event = card(page, 'Watercolour Workshop')
  await event.getByLabel('More actions for Watercolour Workshop').click()
  await event.getByRole('button', { name: 'Delete event', exact: true }).click()
  await expect(event.getByRole('button', { name: 'Keep event' })).toBeFocused()
  await event.getByRole('button', { name: 'Keep event' }).click()
  await expect(event.getByRole('button', { name: 'Delete event', exact: true })).toBeFocused()
  await event.getByRole('button', { name: 'Delete event', exact: true }).click()
  await event.getByRole('button', { name: 'Yes, delete event', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Event deleted' })).toBeFocused()
  await expect(event).toHaveCount(0)
  await expect(card(page, 'Board Games Meetup')).toBeVisible()
})


test('Organise fills the available width and fits more cards on large screens',async({page})=>{
  await page.goto('/organiser/events')
  await page.getByRole('tab',{name:'All 7',exact:true}).click()
  await expect(page.locator('.organiser-event-card')).toHaveCount(7)
  for(const scheme of ['light','dark']){
    await page.getByLabel('Color theme').selectOption(scheme)
    for(const width of [375,575,768,1280,1600,1920,2560]){
      await page.setViewportSize({width,height:1000})
      await expect.poll(()=>page.locator('main').evaluate(el=>{
        const sidebar=parseFloat(getComputedStyle(document.querySelector('.app-shell')).paddingLeft)
        return Math.abs(el.getBoundingClientRect().width-(innerWidth-sidebar))
      })).toBeLessThan(3)
      const geometry=await page.locator('.organiser-grid').evaluate(el=>({columns:getComputedStyle(el).gridTemplateColumns.split(' ').length,overflow:document.documentElement.scrollWidth>innerWidth}))
      expect(geometry.overflow).toBe(false)
      if(width>=1920)expect(geometry.columns).toBeGreaterThanOrEqual(4)
      await expect(page.locator('main')).toHaveCount(1)
    }
  }
})
