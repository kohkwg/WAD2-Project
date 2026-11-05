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

// the landing page is the front door (design.md, landing): signed-out visitors sign in or create
// an account; signed-in people (and the demo account) see an account summary. no island map.

test('demo account sees its summary, and Bookedz logos return home', async ({
  page
}, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*.supabase.co/**', route => route.abort());
  await page.emulateMedia({
    reducedMotion: 'reduce'
  });
  await page.goto('/');
  await expect(page.getByRole('heading', {
    level: 1,
    name: 'Alex'
  })).toBeVisible();
  await expect(page.getByText(/Demo mode\./)).toBeVisible();
  await expect(page.getByRole('heading', {
    name: 'Your next plan'
  })).toBeVisible();
  await expect(page.locator('.hero-map, .discovery-hero')).toHaveCount(0);
  await expect(page.locator('main')).toHaveCount(1);
  for (const scheme of ['light', 'dark']) {
    await page.evaluate(async value => {
      const {
        setTheme
      } = await import('/src/lib/theme.js');
      setTheme(value);
    }, scheme);
    for (const width of [375, 575, 768, 1280]) {
      await page.setViewportSize({
        width,
        height: 900
      });
      await expect(page.locator('.dash-hero-actions').getByRole('link', {
        name: 'Discover events'
      })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width === 375 || width === 1280) await page.screenshot({
        path: testInfo.outputPath(`landing-${scheme}-${width}.png`)
      });
    }
  }
  await page.setViewportSize({
    width: 1280,
    height: 900
  });
  for (const path of ['/discover', '/my-rsvps']) {
    await page.goto(path);
    await page.locator('.sidebar-brand').click();
    await expect(page).toHaveURL(/:\d+\/$/);
    await expect(page.getByRole('heading', {
      level: 1,
      name: 'Alex'
    })).toBeVisible();
  }
  expect(errors).toEqual([]);
});
test('signed-out live visitors get the sign-in form on the landing page', async ({
  page
}, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({
    reducedMotion: 'reduce'
  });
  await page.route('**/*.supabase.co/**', route => route.abort());
  await page.route('**/__home-auth.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: `
    export const USING_SUPABASE = true;
    export const getCurrentUser = async () => { throw new Error('Account lookup unavailable'); };
    export const getUser = async () => { throw new Error('Signed out'); };
    export const getMyRsvps = async () => [];
    export const getSavedEvents = async () => [];
    export const onAuthChange = () => () => {};
    export const signIn = async () => {};
    export const signUp = async () => false;
    export const signOut = async () => {};
    export const resetDemoData = () => {};
  `
  }));
  await page.route(/\/src\/(?:components\/NavBar\.vue|router\/index\.js|views\/LandingView\.vue)(?:\?.*)?$/, async route => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: (await response.text()).replace(/from (["'])\/src\/utils\/api(?:\.js)?\1/g, 'from "/__home-auth.js"')
    });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', {
    level: 1,
    name: /Less .*what.*plan/
  })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByRole('link', {
    name: /Explore events/
  })).toHaveAttribute('href', '/discover');
  await expect(page.getByRole('heading', {
    name: 'Good plans. Great company.',
    exact: true
  })).toBeVisible();
  await page.getByRole('button', {
    name: /^Sign up/
  }).click();
  await expect(page.getByLabel('Name', {
    exact: true
  })).toBeFocused();
  await page.getByRole('button', {
    name: 'Log in',
    exact: true
  }).click();
  await expect(page.getByLabel('Email', {
    exact: true
  })).toBeFocused();
  await page.getByRole('button', {
    name: 'Create account',
    exact: true
  }).first().click();
  await page.getByRole('button', {
    name: 'Log in',
    exact: true
  }).click();
  await expect(page.getByLabel('Name', {
    exact: true
  })).toHaveCount(0);
  for (const scheme of ['light', 'dark']) {
    await page.evaluate(async value => {
      const {
        setTheme
      } = await import('/src/lib/theme.js');
      setTheme(value);
    }, scheme);
    for (const width of [375, 575, 768, 1280]) {
      await page.setViewportSize({
        width,
        height: 900
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.locator('main')).toHaveCount(1);
      await expect(page.getByRole('heading', {
        level: 1
      })).toHaveCount(1);
      if (width === 375 || width === 1280) await page.screenshot({
        path: testInfo.outputPath(`welcome-${scheme}-${width}.png`),
        fullPage: true
      });
    }
  }
  expect(errors).toEqual([]);
  await expect(page.locator('.app-topbar').getByRole('link', {
    name: 'Sign in',
    exact: true
  })).toHaveCount(0);
  await expect(page).toHaveURL(/:\d+\/$/);
});
test('old /login links open the landing page and keep where to go next', async ({
  page
}) => {
  await page.goto('/login?redirect=/my-rsvps');
  await expect(page).toHaveURL(/:\d+\/\?redirect=(%2F|\/)my-rsvps$/);
});
