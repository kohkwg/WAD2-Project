import { test, expect } from '@playwright/test';

const STORE = 'bookedz-feature2-demo';

const EVENT_ID = 'e-weather-demo';
test.beforeEach(async ({
  page
}) => {
  await page.clock.setFixedTime(new Date('2026-10-16T04:00:00.000Z'));
  await page.route('**/api/common/elastic/search**', route => route.fulfill({
    json: {
      results: [{
        BUILDING: 'SMU Campus Green',
        SEARCHVAL: 'SMU Campus Green',
        ADDRESS: '81 Victoria Street',
        POSTAL: '188065',
        LATITUDE: '1.2966',
        LONGITUDE: '103.8502'
      }]
    }
  }));
});
test('Manage RSVPs reloads the event when the mounted route changes IDs', async ({
  page
}) => {
  await page.goto('/organiser/events/e-weather-demo/rsvps');
  await expect(page.getByRole('heading', {
    name: /Campus Green Social/
  })).toBeVisible();
  await expect(page.getByRole('group', {
    name: 'Filter RSVPs by status'
  }).getByRole('button', {
    name: /Confirmed/
  })).toHaveAttribute('aria-pressed', 'true');
  // the redesigned capacity bar is a labelled image of actual counts out of the event's capacity
  await expect(page.getByRole('img', {
    name: /^Capacity: .* of 30$/
  })).toBeVisible();
  await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/organiser/events/e2/rsvps'));
  await expect(page.getByRole('heading', {
    name: 'Intro to Vue Workshop'
  })).toBeVisible();
  await expect(page.getByRole('link', {
    name: 'Organise',
    exact: true
  })).toBeVisible();
});
