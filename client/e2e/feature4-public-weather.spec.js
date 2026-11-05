import { test, expect } from '@playwright/test';
import { createSeedData } from '../src/utils/mockData.js';

const ENDPOINT = '**/v2/real-time/api/two-hr-forecast*';

const STORE = 'dino-feature2-demo';

function forecast() {
  return {
    code: 0,
    data: {
      area_metadata: [{
        name: 'City',
        label_location: {
          latitude: 1.2966,
          longitude: 103.8502
        }
      }],
      items: [{
        timestamp: '2026-10-16T11:55:00+08:00',
        update_timestamp: '2026-10-16T11:55:00+08:00',
        valid_period: {
          start: '2026-10-16T12:00:00+08:00',
          end: '2026-10-16T14:00:00+08:00'
        },
        forecasts: [{
          area: 'City',
          forecast: 'Thundery Showers'
        }]
      }]
    }
  };
}
test.beforeEach(async ({
  page
}) => {
  await page.clock.setFixedTime(new Date('2026-10-16T04:00:00Z'));
  await page.route('**/*.supabase.co/**', route => route.abort());
  await page.route(ENDPOINT, route => route.fulfill({
    json: forecast()
  }));
});
test('weather entry and refresh each use one response snapshot', async ({
  page
}) => {
  let requests = 0;
  await page.unroute(ENDPOINT);
  await page.route(ENDPOINT, route => {
    requests++;
    return route.fulfill({
      json: forecast()
    });
  });
  await page.goto('/organiser/events/e-weather-demo/manage?tab=weather');
  await expect(page.getByRole('heading', {
    name: 'Thundery Showers',
    exact: true
  })).toBeVisible();
  expect(requests).toBe(1);
  await page.getByRole('button', {
    name: 'Refresh weather',
    exact: true
  }).click();
  await expect.poll(() => requests).toBe(2);
  await expect(page.getByRole('heading', {
    name: 'Thundery Showers',
    exact: true
  })).toBeVisible();
});
