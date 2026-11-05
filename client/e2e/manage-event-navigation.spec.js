import { test, expect } from '@playwright/test';
import { setColorTheme } from './support/colorTheme.js';

// these checks expect the expanded sidebar. from 992px the sidebar starts as an icon rail
// unless someone expanded it, so start from that remembered choice.
test.beforeEach(async ({
  page
}) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('dino-sidebar', 'expanded');
    } catch {/* storage blocked */}
  });
});
test('grouped tools support keyboard, closing, deep links and responsive themes', async ({
  page
}) => {
  await page.emulateMedia({
    reducedMotion: 'reduce'
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*.supabase.co/**', route => route.abort());
  await page.goto('/organiser/events/e-weather-demo/manage?tab=budget&source=tools');
  const nav = page.getByRole('navigation', {
    name: 'Event tools'
  });
  const planning = nav.getByRole('button', {
    name: /^Planning/
  });
  for (const scheme of ['light', 'dark']) {
    await setColorTheme(page, scheme);
    for (const width of [375, 575, 768, 1280]) {
      await page.setViewportSize({
        width,
        height: 900
      });
      await expect(planning).toContainText('Budget');
      await planning.focus();
      await page.keyboard.press('ArrowDown');
      await expect(nav.getByRole('link', {
        name: 'Tasks',
        exact: true
      })).toBeFocused();
      await page.keyboard.press('End');
      await expect(nav.getByRole('link', {
        name: 'Budget',
        exact: true
      })).toBeFocused();
      await expect(nav.getByRole('link', {
        name: 'Budget',
        exact: true
      })).toHaveAttribute('aria-current', 'page');
      for (const link of await nav.getByRole('link').all()) {
        expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(44);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.keyboard.press('Escape');
      await expect(planning).toBeFocused();
      await expect(planning).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('main')).toHaveCount(1);
    }
  }
  await planning.click();
  await nav.getByRole('button', {
    name: /^General/
  }).click();
  await expect(planning).toHaveAttribute('aria-expanded', 'false');
  await nav.getByRole('link', {
    name: 'Announcements',
    exact: true
  }).click();
  await expect(page).toHaveURL(/tab=announcements/);
  await expect(page).toHaveURL(/source=tools/);
  const general = nav.getByRole('button', {
    name: /^General/
  });
  await expect(general).toHaveAttribute('aria-expanded', 'false');
  await expect(general).toBeFocused();
  await general.click();
  await page.getByRole('heading', {
    level: 1
  }).click();
  await expect(general).toHaveAttribute('aria-expanded', 'false');
  await page.goBack();
  await expect(planning).toContainText('Budget');
  await page.reload();
  await expect(planning).toContainText('Budget');
  expect(errors).toEqual([]);
});
test('live tool grouping retains check-in, QR, attendance and floor-plan links', async ({
  page
}) => {
  // only the workspace's feature-availability flag changes. data remains the demo adapter.
  await page.route('**/__workspace-api.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: `export * from '/src/utils/api.js'; export const USING_SUPABASE = true;`
  }));
  await page.route(/\/src\/views\/ManageEventView\.vue(?:\?.*)?$/, async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace(/from (["'])\/src\/utils\/api\.js\1/g, 'from "/__workspace-api.js"');
    await route.fulfill({
      response,
      body
    });
  });
  await page.goto('/organiser/events/e-weather-demo/manage?tab=tasks');
  const nav = page.getByRole('navigation', {
    name: 'Event tools'
  });
  await nav.getByRole('button', {
    name: /^Planning/
  }).click();
  await expect(nav.getByRole('link', {
    name: 'Floor plan',
    exact: true
  })).toHaveAttribute('href', /tab=floor-plan/);
  await nav.getByRole('button', {
    name: /^On the day/
  }).click();
  for (const [label, id] of [['Weather', 'weather'], ['Check-in station', 'check-in'], ['Venue QR', 'venue-qr'], ['Attendance', 'attendance']]) {
    await expect(nav.getByRole('link', {
      name: label,
      exact: true
    })).toHaveAttribute('href', new RegExp(`tab=${id}`));
  }
});
