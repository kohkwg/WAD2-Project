import { test, expect } from '@playwright/test';

test('live navigation hides personal links until a session arrives', async ({
  page
}) => {
  // substitute only navbar's auth dependency; page data keeps the demo adapter.
  await page.route('**/__nav-auth.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: `
    export const USING_SUPABASE = true;
    export const getCurrentUser = async () => null;
    export const onAuthChange = callback => {
      const listener = event => callback(event.detail);
      window.addEventListener('test-auth-change', listener);
      return () => window.removeEventListener('test-auth-change', listener);
    };
    export const signOut = async () => {};
    export const resetDemoData = () => {};
  `
  }));
  await page.route(/\/src\/components\/NavBar\.vue(?:\?.*)?$/, async route => {
    const response = await route.fetch();
    const source = (await response.text()).replace(/from (["'])\/src\/utils\/api\.js\1/, 'from "/__nav-auth.js"');
    await route.fulfill({
      response,
      body: source
    });
  });
  await page.goto('/discover');
  const nav = page.getByRole('navigation', {
    name: 'Main navigation'
  });
  await expect(nav.getByRole('link', {
    name: 'Sign in',
    exact: true
  })).toBeVisible();
  for (const name of ['Plans', 'Organise', 'Your profile']) {
    await expect(nav.getByRole('link', {
      name,
      exact: true
    })).toHaveCount(0);
  }
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('test-auth-change', {
    detail: {
      id: 'test-user',
      email: 'test@example.invalid'
    }
  })));
  await expect(nav.getByRole('link', {
    name: 'Plans',
    exact: true
  })).toBeVisible();
  await expect(nav.getByRole('link', {
    name: 'Organise',
    exact: true
  })).toBeVisible();
  // below 768px a signed-in visitor has bottom tabs and no menu button
  await page.setViewportSize({
    width: 768,
    height: 800
  });
  const toggle = nav.getByRole('button', {
    name: 'Toggle navigation'
  });
  await toggle.click();
  await nav.getByRole('link', {
    name: 'Plans',
    exact: true
  }).focus();
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('test-auth-change', {
    detail: null
  })));
  await toggle.click();
  await expect(nav.getByRole('link', {
    name: 'Organise',
    exact: true
  })).toHaveCount(0);
});
