import { test, expect } from '@playwright/test';

// these checks use the theme dropdown in the expanded sidebar; from 992px the sidebar starts as an icon rail
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

// replace only profile's data boundary; the shell and routing retain demo mode.

async function profileFixture(page, missingUsername = false) {
  await page.route('**/__profile-fixture.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: `
      export const USING_SUPABASE = true;
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
test('profile reflows in both themes and preserves interest drafts through save failure', async ({
  page
}, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (['warning', 'error'].includes(message.type())) errors.push(message.text());
  });
  await profileFixture(page);
  await page.emulateMedia({
    reducedMotion: 'reduce'
  });
  await page.goto('/profile');
  await expect(page.getByLabel('Name', {
    exact: true
  })).toHaveValue('Test Explorer');
  await expect(page.getByLabel('Username', {
    exact: true
  })).toHaveValue('test_explorer');
  const theme = page.getByLabel('Color theme');
  for (const scheme of ['light', 'dark']) {
    await theme.selectOption(scheme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
    for (const width of [375, 575, 768, 1199, 1200, 1280]) {
      await page.setViewportSize({
        width,
        height: 900
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.locator('main')).toHaveCount(1);
      await expect.poll(() => page.locator('.profile-details-grid').evaluate(el => {
        const tops = [...el.children].map(field => Math.round(field.getBoundingClientRect().top));
        return new Set(tops).size;
      })).toBe(width < 768 ? 3 : width < 1200 ? 2 : 1);
      if (width >= 768) {
        const fields = await page.locator('.profile-details-grid').evaluate(el => [...el.children].map(field => ({
          x: field.getBoundingClientRect().left,
          y: field.getBoundingClientRect().top
        })));
        expect(Math.abs(fields[0].y - fields[1].y)).toBeLessThan(2);
        expect(fields[1].x).toBeGreaterThan(fields[0].x);
      }
      await expect(page.locator('.profile-form')).toHaveCSS('background-color', scheme === 'dark' ? 'rgb(41, 37, 36)' : 'rgb(255, 255, 255)');
      const contrast = await page.locator('label[for="int-music"]').evaluate(el => {
        const luminance = color => {
          const channels = color.match(/\d+/g).slice(0, 3).map(Number).map(v => {
            const c = v / 255;
            return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
          });
          return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
        };
        const style = getComputedStyle(el);
        const a = luminance(style.color),
          b = luminance(style.backgroundColor);
        return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      });
      expect(contrast).toBeGreaterThanOrEqual(4.5);
      const legendContrast = await page.locator('.profile-section legend').first().evaluate(el => {
        const luminance = color => {
          const values = color.match(/\d+/g).slice(0, 3).map(Number).map(v => {
            const c = v / 255;
            return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
          });
          return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
        };
        const a = luminance(getComputedStyle(el).color);
        const b = luminance(getComputedStyle(el.closest('form')).backgroundColor);
        return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      });
      expect(legendContrast).toBeGreaterThanOrEqual(4.5);
      const chip = await page.locator('label[for="int-music"]').boundingBox();
      expect(chip.height).toBeGreaterThanOrEqual(44);
      await page.screenshot({
        path: testInfo.outputPath(`profile-${scheme}-${width}.png`),
        fullPage: true
      });
    }
  }
  const arts = page.getByRole('checkbox', {
    name: 'arts',
    exact: true
  });
  await arts.focus();
  await expect(arts).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.getByRole('status')).toHaveText('2 interests selected');
  const username = page.getByLabel('Username', {
    exact: true
  });
  await username.fill('bad name');
  await page.getByRole('button', {
    name: 'Save profile',
    exact: true
  }).click();
  await expect(page.getByText('Use 3–20 letters, numbers or underscores.', {
    exact: true
  })).toBeVisible();
  await username.fill('My_Username');
  await page.getByLabel('Name', {
    exact: true
  }).fill('Updated Explorer');
  await page.getByRole('button', {
    name: 'Save profile',
    exact: true
  }).click();
  await expect(page.getByRole('button', {
    name: 'Saving profile…'
  })).toBeDisabled();
  await expect(page.getByLabel('Name', {
    exact: true
  })).toBeDisabled();
  await expect(page.getByRole('alert')).toHaveText('Could not save. Try again.');
  await expect(arts).toBeChecked();
  await expect(page.getByLabel('Name', {
    exact: true
  })).toHaveValue('Updated Explorer');
  await page.getByRole('button', {
    name: 'Save profile',
    exact: true
  }).click();
  await expect(page.getByText('That username is already taken. Choose another.', {
    exact: true
  })).toBeVisible();
  await expect(username).toHaveValue('My_Username');
  await username.fill('My_New_Username');
  await page.getByRole('button', {
    name: 'Save profile',
    exact: true
  }).click();
  await expect(page.getByText('Profile saved.', {
    exact: true
  })).toBeVisible();
  expect(await page.evaluate(() => window.profilePayload.p_username)).toBe('my_new_username');
  expect(await page.evaluate(() => window.profilePayload.p_interests)).toEqual(['music', 'arts']);
  await page.getByRole('link', {
    name: 'Back to Discover',
    exact: true
  }).click();
  await expect(page).toHaveURL(/\/discover$/);
  expect(errors).toEqual([]);
});
test('discovery view controls and hosting invitation reflow in both themes', async ({
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
  await page.getByRole('button', {
    name: 'Map',
    exact: true
  }).click();
  for (const scheme of ['light', 'dark']) {
    await page.getByLabel('Color theme').selectOption(scheme);
    for (const width of [375, 575, 768, 1280]) {
      await page.setViewportSize({
        width,
        height: 900
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const name of ['Map', 'List']) {
        const rect = await page.getByRole('button', {
          name,
          exact: true
        }).boundingBox();
        expect(rect.height).toBeGreaterThanOrEqual(44);
      }
    }
  }
  await page.getByRole('button', {
    name: 'List',
    exact: true
  }).click();
  await page.locator('.hosting-invitation').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath('discovery-hosting-dark.png')
  });
  await expect(page.getByRole('link', {
    name: 'Host an event'
  })).toBeVisible();
  expect(await page.locator('.hosting-invitation').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(35, 31, 28)');
  expect(errors).toEqual([]);
});
test('profile stays editable when the live schema has no username column', async ({
  page
}) => {
  await profileFixture(page, true);
  await page.goto('/profile');
  await expect(page.getByLabel('Name', {
    exact: true
  })).toHaveValue('Test Explorer');
  await expect(page.getByLabel('Username', {
    exact: true
  })).toBeDisabled();
  await expect(page.getByText('Username setup is coming soon. You can still edit your other profile details.')).toBeVisible();
  await expect(page.getByRole('button', {
    name: 'Save profile',
    exact: true
  })).toBeEnabled();
  await expect(page.getByRole('checkbox', {
    name: 'music',
    exact: true
  })).toBeChecked();
  await expect(page.getByRole('button', {
    name: 'Retry profile',
    exact: true
  })).toHaveCount(0);
});
