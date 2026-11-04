import { test, expect } from '@playwright/test'

// Community is the open jio hub (DESIGN.md, Community): jios are tied to one official event,
// joining offers an event RSVP, and hangouts stay out of Discover and My events.
const STORE = 'bookedz-feature2-demo'

test.beforeEach(async ({ page }) => {
  await page.goto('/discover')
  await page.evaluate((key) => localStorage.removeItem(key), STORE)
})

test('join a jio, get the event RSVP prompt and chat', async ({ page }) => {
  await page.goto('/community')
  await expect(page.getByRole('heading', { level: 1, name: 'Open jios' })).toBeVisible()
  const card = page.locator('#jio-jio2')
  await expect(card).toContainText('Intro to Vue Workshop')
  await card.getByRole('button', { name: 'Join jio' }).click()
  await expect(card).toContainText('You’re in')
  await expect(card.getByText(/RSVP to Intro to Vue Workshop so you have a spot/)).toBeVisible()
  await expect(card.getByRole('link', { name: 'Request a spot' })).toHaveAttribute('href', '/events/e2/rsvp#rsvp')

  await card.getByRole('button', { name: /^Chat/ }).click()
  await card.getByLabel('Message').fill('See you there')
  await card.getByRole('button', { name: 'Send' }).click()
  await expect(card.getByText('See you there')).toBeVisible()
})

test('start a jio from an event page', async ({ page }) => {
  await page.goto('/events/e5/rsvp')
  await page.getByRole('region', { name: 'Go with others' }).getByRole('link', { name: 'Start a jio' }).click()
  const dialog = page.getByRole('dialog', { name: 'Start a jio' })
  await expect(dialog.getByLabel('Event')).toHaveValue('e5')
  await dialog.getByLabel(/Note/).fill('Who wants to try the wheel?')
  await dialog.getByRole('button', { name: 'Post jio' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.jio-card', { hasText: 'Who wants to try the wheel?' })).toContainText('Hosting')
})

test('hangouts stay out of Discover and My events', async ({ page }) => {
  await page.goto('/discover')
  await expect(page.locator('.discovery-event-row').first()).toBeVisible()
  await expect(page.locator('.discovery-event-row', { hasText: 'Going to' })).toHaveCount(0)
  await page.goto('/organiser/events')
  await expect(page.locator('.organiser-event-card', { hasText: 'Going to' })).toHaveCount(0)
})
