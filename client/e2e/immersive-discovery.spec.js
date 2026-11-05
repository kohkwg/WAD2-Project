import { test, expect } from '@playwright/test';
test.beforeEach(async ({
  page
}) => {
  await page.route('**/*.supabase.co/**', route => route.abort());
  await page.route('**/onemap.gov.sg/maps/tiles/**', route => route.fulfill({
    contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=', 'base64')
  }));
  await page.route('**/api/common/elastic/search**', route => route.fulfill({
    json: {
      results: []
    }
  }));
});
test('Discover uses the committed street-map workspace', async ({
  page
}, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({
    width: 1440,
    height: 1000
  });
  // the landing page no longer has the island map (design.md, landing); start from discover
  await page.goto('/discover');
  await expect(page.locator('.discovery-event-row').first()).toBeVisible();
  const map = page.getByRole('region', {
    name: 'Explore events on the Singapore map',
    exact: true
  });
  await expect(map).toBeVisible();
  await expect(map.locator('[data-marker]').first()).toBeVisible();
  await map.locator('[data-marker]:not(.street-marker--cluster)').first().click();
  // choosing a pin highlights it (no pop-up) and opens that event's card in the list
  await expect(map.getByRole('region', {
    name: 'Selected map events'
  })).toHaveCount(0);
  await expect(map.locator('.street-marker--selected')).toHaveCount(1);
  await expect(page.locator('.discovery-event-row.is-selected .card-actions')).toBeVisible();
  await page.getByRole('searchbox', {
    name: 'Search by title, description or venue'
  }).fill('no-such-event-XYZ');
  await expect(page.getByRole('heading', {
    name: 'No events found',
    exact: true
  })).toBeVisible();
  await page.getByRole('button', {
    name: 'Clear search and filters',
    exact: true
  }).click();
  await expect(page.locator('.discovery-event-row').first()).toBeVisible();
  expect(errors).toEqual([]);
});
test('landing reflows on mobile and Create event and Community both open', async ({
  page
}, testInfo) => {
  await page.setViewportSize({
    width: 375,
    height: 900
  });
  await page.emulateMedia({
    reducedMotion: 'reduce'
  });
  await page.goto('/');
  await expect(page.getByRole('heading', {
    level: 1,
    name: 'Alex'
  })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('landing-account-mobile.png')
  });
  // create event makes official events only; going with others happens in community (design.md, community)
  await page.goto('/organiser/events/new');
  await expect(page.getByLabel('Event title', {
    exact: true
  })).toBeVisible();
  await page.goto('/organiser/events/new?template=hangout');
  await expect(page).toHaveURL(/\/community$/);
  await expect(page.getByRole('heading', {
    level: 1,
    name: 'Community'
  })).toBeVisible();
});
