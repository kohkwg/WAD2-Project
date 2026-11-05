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

// the profile page opens in view mode, and the input boxes show only after this click.

async function openProfileEditor(page) {
  await page.getByRole('button', {
    name: 'Edit profile',
    exact: true
  }).click();
}

// replace only profile's data boundary; the shell and routing retain demo mode.

async function profileFixture(page, missingUsername = false) {
  await page.route('**/__profile-fixture.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: `
      export const USING_SUPABASE = true;
      export const changePassword = async () => ({});
      export const geocodePostalCode = async () => ({ lat: 1.3, lng: 103.8 });
      let attempts = 0;
      export const supabase = {
        auth: { getUser: async () => ({ data: { user: { id: 'profile-fixture' } } }) },
        from: () => ({
          select: columns => ({ eq: () => ({ maybeSingle: async () => ${missingUsername ? `columns.includes('username') ? { error: { code: '42703', message: 'column profiles.username does not exist' } } : ` : ''}({ data: {
            display_name: 'Test Explorer', username: 'test_explorer', postal_code: '', interest_weights: { sports: 5 }, profile_interests: [{ interests: { slug: 'music' } }]
          } }) }) }),
        }),
        rpc: async (_name, payload) => {
          window.profilePayload = payload;
          await new Promise(resolve => setTimeout(resolve, 250));
          attempts++;
          if (attempts === 1) return { error: { message: 'Could not save. Try again.' } };
          if (attempts === 2) return { error: { code: '23505', message: 'duplicate key' } };
          return { error: null };
        }

      };
    `
  }));
  await page.route(/\/src\/views\/ProfileView\.vue(?:\?.*)?$/, async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace(/from (["'])\/src\/(?:lib\/(?:supabase|onemap)|utils\/api)\.js\1/g, 'from "/__profile-fixture.js"');
    await route.fulfill({
      response,
      body
    });
  });
}
test('discover reflows in both themes', async ({
  page
}, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (['warning', 'error'].includes(message.type())) errors.push(message.text());
  });
  await page.emulateMedia({
    reducedMotion: 'reduce'
  });
  await page.goto('/discover');
  await expect(page.locator('main article.discovery-event-row').first()).toBeVisible();
  for (const scheme of ['light', 'dark']) {
    await setColorTheme(page, scheme);
    for (const width of [375, 575, 768, 1280]) {
      await page.setViewportSize({
        width,
        height: 900
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`discover-${scheme}-${width}.png`)
      });
    }
  }
  expect(errors).toEqual([]);
});
