import { test, expect } from '@playwright/test';
import { setColorTheme } from './support/colorTheme.js';

// Checks for the app as it is on 6 November 2026, in demo mode (VITE_USE_MOCK=true).
// Each test fails on page errors, checks the shell's single main, and checks for no sideways scroll.

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  return errors;
}
async function noSidewaysScroll(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

for (const width of [375, 1280]) {
  test(`Discover lists the next week of events in day rows at ${width}px`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/discover');
    await expect(page.locator('main')).toHaveCount(1);
    const rows = page.locator('main article.discovery-event-row');
    await expect(rows.first()).toBeVisible();
    // The list starts with seven days and offers the next seven
    await expect(page.getByRole('button', { name: /^Show more \(/ })).toBeVisible();
    await noSidewaysScroll(page);
    expect(errors).toEqual([]);
  });
}

test('Discover: See more opens every event on a day and Close folds them back', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/discover');
  const more = page.locator('.day-more').first();
  await expect(more).toBeVisible();
  await more.click();
  await expect(page.locator('.day-row.is-expanded')).toHaveCount(1);
  await expect(page.locator('.day-row.is-expanded .day-more')).toHaveText(/Close/);
  await page.locator('.day-row.is-expanded .day-more').click();
  await expect(page.locator('.day-row.is-expanded')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Discover: Show more adds the following week', async ({ page }) => {
  await page.goto('/discover');
  const rows = page.locator('main article.discovery-event-row');
  await expect(rows.first()).toBeVisible();
  const before = await rows.count();
  await page.getByRole('button', { name: /^Show more \(/ }).click();
  await expect.poll(() => rows.count()).toBeGreaterThan(before);
});

test('event page shows who hosts it in the banner', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/events/e1/rsvp');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const hosts = page.locator('.event-hero .event-hosts');
  await expect(hosts).toContainText('Hosted by');
  await expect(hosts).toContainText('Dino Demo Club');
  await expect(hosts).toContainText('@dino_demo');
  await expect(page.locator('main')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('Community shows groups by event and a way to start one', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/community');
  await expect(page.getByRole('heading', { level: 1, name: 'Community' })).toBeAttached();
  await expect(page.locator('.event-groups-card').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start a group' }).first()).toBeVisible();
  await noSidewaysScroll(page);
  expect(errors).toEqual([]);
});

test('group planner: mark free times, suggest a spot by name and lock it in', async ({ page }) => {
  const errors = watchErrors(page);
  // No food server in this test: an empty nearby list keeps the place box to search and typed names
  await page.route('**/api/food/nearby**', route => route.fulfill({ json: { places: [], status: { places: 'unconfigured' } } }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/groups/grp6');
  await expect(page.getByRole('heading', { name: 'Before and after' })).toBeVisible();
  const after = page.getByRole('article', { name: /after$/ });
  // The free-time grid opens from its one-line summary and closes with Done
  await after.getByRole('button', { name: /Mark when you’re free|Change your times/ }).click();
  await expect(after.getByRole('button', { name: 'Done' })).toBeVisible();
  await after.getByRole('button', { name: 'Done' }).click();
  // One place box: type a name and add it
  await after.getByRole('button', { name: /Suggest a spot/ }).click();
  await after.getByLabel('Find a place').fill('Test Corner Cafe');
  await after.getByRole('button', { name: 'Add Test Corner Cafe by name' }).click();
  await expect(after.locator('.group-idea', { hasText: 'Test Corner Cafe' })).toBeVisible();
  // The host locks it in and it becomes the plan
  await after.locator('.group-idea', { hasText: 'Test Corner Cafe' }).getByRole('button', { name: 'Lock it in' }).click();
  await expect(after.locator('.group-the-plan')).toContainText('Test Corner Cafe');
  await expect(after).toContainText('Planned');
  expect(errors).toEqual([]);
});

test('group chat sends a message without an error', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/groups/grp6');
  await page.getByLabel('Message').fill('[TEST] see you at the gate');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('[TEST] see you at the gate')).toBeVisible();
  await expect(page.getByText(/nextTick/)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('phones get bottom tabs that navigate', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/discover');
  const tabs = page.getByRole('navigation', { name: 'Quick links' });
  await expect(tabs).toBeVisible();
  await tabs.getByRole('link', { name: /Community/ }).click();
  await expect(page).toHaveURL(/\/community$/);
  await expect(page.locator('main')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('Plans and Organise load for the demo account', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/my-rsvps');
  await expect(page.locator('main h1')).toBeVisible();
  await expect(page.getByRole('tablist').first()).toBeVisible();
  await page.goto('/organiser/events');
  await expect(page.locator('main h1')).toBeVisible();
  await noSidewaysScroll(page);
  expect(errors).toEqual([]);
});

test('dark theme applies across pages', async ({ page }) => {
  await page.goto('/discover');
  await setColorTheme(page, 'dark');
  await page.goto('/community');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  // A dark page background: each channel well below white
  const [r, g, b] = background.match(/\d+/g).map(Number);
  expect(Math.max(r, g, b)).toBeLessThan(90);
});
