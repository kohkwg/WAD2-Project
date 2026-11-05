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
