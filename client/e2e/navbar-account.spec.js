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
test('sidebar keeps theme above profile/sign-out at the bottom with failure recovery', async ({
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
  const theme = sidebar.getByLabel('Color theme');
  await expect(profile).toBeVisible();
  await expect(profile).toHaveAttribute('href', '/profile');
  const profileBox = await profile.boundingBox();
  expect((await theme.boundingBox()).y + (await theme.boundingBox()).height).toBeLessThanOrEqual(profileBox.y);
  expect((await signOut.boundingBox()).y).toBeGreaterThanOrEqual(profileBox.y + profileBox.height);
  expect(profileBox.y).toBeGreaterThan(700);
  expect(await sidebar.evaluate(element => element.lastElementChild.classList.contains('sidebar-account'))).toBe(true);
  await expect(page.locator('.app-topbar .nav-profile')).toHaveCount(0);
  for (const value of ['dark', 'light', 'system']) {
    await theme.selectOption(value);
    await expect(theme).toHaveValue(value);
    if (value !== 'system') await expect(page.locator('html')).toHaveAttribute('data-theme', value);
  }
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
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('link', {
    name: 'Sign in',
    exact: true
  })).toBeVisible();
  await expect(profile).toHaveCount(0);
  await expect(signOut).toHaveCount(0);
  await expect(settings).toHaveCount(0);
  await expect(theme).toBeVisible();
  expect(errors).toEqual([]);
});
test('mobile sidebar retains profile, theme and sign-out with keyboard dismissal and profile navigation', async ({
  page
}, testInfo) => {
  await mockNavigation(page);
  await page.emulateMedia({
    reducedMotion: 'reduce'
  });
  await page.setViewportSize({
    width: 375,
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
  for (const width of [375, 575, 768]) {
    await page.setViewportSize({
      width,
      height: 900
    });
    await toggle.click();
    await expect(sidebar.getByRole('link', {
      name: 'Your profile'
    })).toBeVisible();
    await expect(sidebar.getByRole('button', {
      name: 'Sign out',
      exact: true
    })).toBeVisible();
    await sidebar.getByLabel('Color theme').selectOption('dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await sidebar.getByLabel('Color theme').focus();
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({
    width: 375,
    height: 900
  });
  await toggle.click();
  await expect(sidebar.getByRole('link', {
    name: 'Your profile'
  })).toBeInViewport();
  await page.screenshot({
    path: testInfo.outputPath('sidebar-account-mobile.png')
  });
  await sidebar.getByRole('link', {
    name: 'Your profile'
  }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});
test('expanded sidebar: clicking the Theme text or icon cycles Auto → Light → Dark, the dropdown still picks directly', async ({
  page
}, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await mockNavigation(page);
  await page.emulateMedia({
    reducedMotion: 'reduce',
    colorScheme: 'light'
  });
  await page.setViewportSize({
    width: 1280,
    height: 900
  });
  await page.goto('/discover');
  const sidebar = page.locator('.app-sidebar');
  const select = sidebar.getByLabel('Color theme');
  const toggle = sidebar.locator('.sidebar-theme-toggle');
  const html = page.locator('html');
  await expect(select).toHaveValue('system');
  await expect(toggle).toHaveAccessibleName('Theme: Auto. Switch to Light');
  // the word and the icon are the same button
  await toggle.getByText('Theme', {
    exact: true
  }).click();
  await expect(select).toHaveValue('light');
  await expect(html).toHaveAttribute('data-theme', 'light');
  await toggle.locator('svg').click();
  await expect(select).toHaveValue('dark');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(toggle).toHaveAccessibleName('Theme: Dark. Switch to Auto');
  await toggle.screenshot({
    path: testInfo.outputPath('theme-toggle-dark.png')
  });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(select).toHaveValue('system');
  // the dropdown keeps working on its own
  await select.selectOption('dark');
  await expect(toggle).toHaveAccessibleName('Theme: Dark. Switch to Auto');
  // phones: the same row in the drawer
  await page.setViewportSize({
    width: 375,
    height: 800
  });
  await page.getByRole('button', {
    name: 'Toggle navigation'
  }).click();
  await sidebar.getByRole('button', {
    name: 'Theme: Dark. Switch to Auto',
    exact: true
  }).click();
  await expect(select).toHaveValue('system');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
test('collapsed sidebar swaps the theme dropdown for an Auto → Light → Dark cycle button', async ({
  page
}, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await mockNavigation(page);
  await page.emulateMedia({
    reducedMotion: 'reduce',
    colorScheme: 'light'
  });
  await page.setViewportSize({
    width: 1280,
    height: 900
  });
  await page.goto('/discover');
  const sidebar = page.locator('.app-sidebar');
  await sidebar.getByRole('button', {
    name: 'Collapse sidebar'
  }).click();
  await expect(sidebar.getByLabel('Color theme')).toBeHidden();
  const cycle = sidebar.locator('.sidebar-theme-cycle');
  await expect(cycle).toHaveAccessibleName('Theme: Auto. Switch to Light');
  await cycle.screenshot({
    path: testInfo.outputPath('sidebar-theme-auto.png')
  });
  for (const [next, label, after] of [['light', 'Light', 'Dark'], ['dark', 'Dark', 'Auto']]) {
    await cycle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', next);
    await expect(cycle).toHaveAccessibleName(`Theme: ${label}. Switch to ${after}`);
    await cycle.screenshot({
      path: testInfo.outputPath(`sidebar-theme-${next}.png`)
    });
  }
  await page.screenshot({
    path: testInfo.outputPath('sidebar-collapsed-theme-dark.png')
  });
  await cycle.focus();
  await page.keyboard.press('Enter');
  await expect(cycle).toHaveAccessibleName('Theme: Auto. Switch to Light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await sidebar.getByRole('button', {
    name: 'Expand sidebar'
  }).click();
  await expect(cycle).toBeHidden();
  await expect(sidebar.getByLabel('Color theme')).toHaveValue('system');
  expect(errors).toEqual([]);
});
test('sign out shows a door icon in the theme colour, icon-only with a tooltip on the collapsed rail', async ({
  page
}, testInfo) => {
  await mockNavigation(page);
  await page.emulateMedia({
    reducedMotion: 'reduce'
  });
  await page.setViewportSize({
    width: 1280,
    height: 900
  });
  await page.goto('/discover');
  const sidebar = page.locator('.app-sidebar');
  const signOut = sidebar.getByRole('button', {
    name: 'Sign out',
    exact: true
  });
  const icon = signOut.locator('svg');
  const colours = () => signOut.evaluate(el => [getComputedStyle(el).color, getComputedStyle(el.querySelector('svg')).stroke]);
  const seen = [];
  for (const scheme of ['light', 'dark']) {
    await sidebar.getByLabel('Color theme').selectOption(scheme);
    await expect(icon).toBeVisible();
    // the theme swap may animate, so wait until the icon and label settle on the same colour
    await expect.poll(async () => {
      const [text, stroke] = await colours();
      return stroke === text;
    }).toBe(true);
    seen.push((await colours())[1]);
    await sidebar.locator('.sidebar-account').screenshot({
      path: testInfo.outputPath(`sign-out-${scheme}.png`)
    });
  }
  expect(seen[0]).not.toBe(seen[1]);
  await sidebar.getByRole('button', {
    name: 'Collapse sidebar'
  }).click();
  await expect(signOut).toHaveAccessibleName('Sign out');
  await expect(icon).toBeVisible();
  expect(await signOut.locator('.side-label').evaluate(el => el.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
  await signOut.hover();
  await expect.poll(() => signOut.evaluate(el => [getComputedStyle(el, '::after').content.split(' / ')[0], getComputedStyle(el, '::after').opacity])).toEqual(['"Sign out"', '1']);
  await page.screenshot({
    path: testInfo.outputPath('sign-out-collapsed.png'),
    clip: {
      x: 0,
      y: 650,
      width: 240,
      height: 250
    }
  });
});
