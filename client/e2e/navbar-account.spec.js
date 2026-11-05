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

async function mockNavigation(page) {
  let fail = false;
  await page.route('**/*.supabase.co/**', route => route.abort());
  await page.route('**/__nav-signout', route => route.fulfill({
    status: fail ? 503 : 200,
    json: {}
  }));
  await page.route('**/__sidebar-auth.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: `
    export const USING_SUPABASE = true;
    let user = { id: 'fixture-member', email: 'member@example.invalid' };
    export const getCurrentUser = async () => user;
    export const onAuthChange = callback => {
      const listener = event => { user = event.detail; callback(user); };
      window.addEventListener('fixture-sidebar-auth', listener);
      return () => window.removeEventListener('fixture-sidebar-auth', listener);
    };
    export const signOut = async () => {
      const response = await fetch('/__nav-signout', { method: 'POST' });
      if (!response.ok) throw new Error('Sign out failed');
      window.dispatchEvent(new CustomEvent('fixture-sidebar-auth', { detail: null }));
    };
    export const resetDemoData = () => {};
  `
  }));
  // the navbar and route guard must observe the same mocked signed-in identity.
  await page.route(/\/src\/(?:components\/NavBar\.vue|router\/index\.js)(?:\?.*)?$/, async route => {
    const response = await route.fetch();
    // a reused dev server adds an hmr ?t= stamp to the import after hot reloads
    const body = (await response.text()).replace(/from (["'])\/src\/utils\/api\.js(?:\?[^"']*)?\1/g, 'from "/__sidebar-auth.js"');
    await route.fulfill({
      response,
      body
    });
  });
  return {
    failSignOut(value) {
      fail = value;
    }
  };
}
test('sidebar keeps profile and sign-out at the bottom, with failure recovery and no theme control', async ({
  page
}, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const state = await mockNavigation(page);
  await page.emulateMedia({
    reducedMotion: 'reduce'
  });
  await page.setViewportSize({
    width: 1280,
    height: 900
  });
  await page.goto('/discover');
  const sidebar = page.locator('.app-sidebar');
  const settings = sidebar.getByRole('link', {
    name: 'Settings',
    exact: true
  });
  await expect(settings).toHaveCount(0);
  const profile = sidebar.getByRole('link', {
    name: 'Your profile',
    exact: true
  });
  const signOut = sidebar.getByRole('button', {
    name: 'Sign out',
    exact: true
  });
  await expect(profile).toBeVisible();
  await expect(profile).toHaveAttribute('href', '/profile');
  // the theme control is on the profile page only
  await expect(sidebar.getByLabel('Color theme')).toHaveCount(0);
  await expect(sidebar.locator('.sidebar-theme-toggle, .sidebar-theme-cycle')).toHaveCount(0);
  const profileBox = await profile.boundingBox();
  expect((await signOut.boundingBox()).y).toBeGreaterThanOrEqual(profileBox.y + profileBox.height);
  expect(profileBox.y).toBeGreaterThan(700);
  expect(await sidebar.evaluate(element => element.lastElementChild.classList.contains('sidebar-account'))).toBe(true);
  await expect(page.locator('.app-topbar .nav-profile')).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('sidebar-account-desktop.png')
  });
  state.failSignOut(true);
  await signOut.click();
  await expect(sidebar.getByRole('alert')).toHaveText('Sign out failed. Please try again.');
  await expect(signOut).toBeEnabled();
  await expect(profile).toBeVisible();
  state.failSignOut(false);
  await signOut.click();
  // sign-out opens the landing page, which holds the sign-in form
  await expect(page).toHaveURL(/:\d+\/$/);
  await expect(profile).toHaveCount(0);
  await expect(signOut).toHaveCount(0);
  await expect(settings).toHaveCount(0);
  // other pages show Sign in in the sidebar
  await sidebar.getByRole('link', {
    name: 'Discover',
    exact: true
  }).click();
  await expect(sidebar.getByRole('link', {
    name: 'Sign in',
    exact: true
  })).toBeVisible();
  expect(errors).toEqual([]);
});
test('tablet drawer keeps profile and sign-out with keyboard dismissal, and phones use bottom tabs', async ({
  page
}, testInfo) => {
  await mockNavigation(page);
  await page.emulateMedia({
    reducedMotion: 'reduce'
  });
  await page.setViewportSize({
    width: 768,
    height: 900
  });
  await page.goto('/discover');
  await expect(page.getByRole('heading', {
    name: 'Discover events',
    exact: true
  })).toBeVisible();
  const toggle = page.getByRole('button', {
    name: 'Toggle navigation'
  });
  const sidebar = page.locator('.app-sidebar');
  const profile = sidebar.getByRole('link', {
    name: 'Your profile'
  });
  await toggle.click();
  await expect(profile).toBeVisible();
  await expect(sidebar.getByRole('button', {
    name: 'Sign out',
    exact: true
  })).toBeVisible();
  await profile.focus();
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await toggle.click();
  await expect(profile).toBeInViewport();
  await page.screenshot({
    path: testInfo.outputPath('sidebar-account-tablet.png')
  });
  await profile.click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  // below 768px a signed-in visitor has the bottom tabs and no menu button
  await page.goto('/discover');
  for (const width of [375, 575]) {
    await page.setViewportSize({
      width,
      height: 900
    });
    await expect(toggle).toBeHidden();
    await expect(page.getByRole('navigation', {
      name: 'Quick links'
    })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
