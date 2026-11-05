import { test, expect } from '@playwright/test';
import { setColorTheme } from './support/colorTheme.js';

// these checks expect the expanded sidebar. from 992px the sidebar starts as an icon rail
// unless someone expanded it (docs/decisions.md, 5 november), so start from that remembered choice.
test.beforeEach(async ({
  page
}) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('bookedz-sidebar', 'expanded');
    } catch {/* storage blocked */}
  });
});
test.beforeEach(async ({
  page
}) => {
  await page.route('**/*.supabase.co/**', route => route.abort());
});
test('theme follows the device until a choice is saved, and a saved choice persists', async ({
  page
}, testInfo) => {
  await page.emulateMedia({
    colorScheme: 'dark',
    reducedMotion: 'reduce'
  });
  await page.goto('/discover');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('heading', {
    name: 'Discover events'
  })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('dark-discovery.png')
  });
  // the device setting has no effect after a saved choice
  await setColorTheme(page, 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({
    colorScheme: 'dark'
  });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  // an old saved "system" choice counts as no choice, so the theme follows the device
  await page.evaluate(() => localStorage.setItem('bookedz-color-theme', 'system'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({
    colorScheme: 'light'
  });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
