import { test, expect } from '@playwright/test';

// from 992px the sidebar starts as an icon rail at every size and only expands when someone uses
// the toggle; that choice is remembered. below 992px it stays a drawer (design.md, navigation).
test('sidebar starts as an icon rail on laptops and desktops and remembers an expand', async ({
  page
}) => {
  await page.setViewportSize({
    width: 1366,
    height: 800
  });
  await page.goto('/discover');
  await page.evaluate(() => localStorage.removeItem('bookedz-sidebar'));
  await page.reload();
  const nav = page.getByRole('navigation', {
    name: 'Main navigation'
  });
  const sidebar = page.locator('.app-sidebar');
  const shellPadding = () => page.locator('.app-shell').evaluate(el => getComputedStyle(el).paddingLeft);
  // every bootstrap size from lg up starts collapsed, and the page makes room for exactly the rail
  for (const width of [992, 1199, 1200, 1400, 1920]) {
    await page.setViewportSize({
      width,
      height: 800
    });
    await expect(sidebar).toHaveCSS('width', '76px');
    expect(await shellPadding()).toBe('76px');
  }
  await page.setViewportSize({
    width: 1366,
    height: 800
  });
  await expect(nav.getByRole('button', {
    name: 'Expand sidebar'
  })).toHaveAttribute('aria-expanded', 'false');
  // links keep their names for screen readers; the label shows as a tooltip
  const community = nav.getByRole('link', {
    name: 'Community'
  });
  await community.hover();
  await expect(community).toHaveAttribute('data-label', 'Community');
  await nav.getByRole('button', {
    name: 'Expand sidebar'
  }).click();
  await expect(sidebar).toHaveCSS('width', '240px');
  await page.reload();
  await expect(nav.getByRole('button', {
    name: 'Collapse sidebar'
  })).toHaveAttribute('aria-expanded', 'true');
  await expect(sidebar).toHaveCSS('width', '240px');
  await nav.getByRole('button', {
    name: 'Collapse sidebar'
  }).click();
  await expect(sidebar).toHaveCSS('width', '76px');
  await page.reload();
  await expect(sidebar).toHaveCSS('width', '76px');
});
test('below 992px the sidebar stays a closed drawer whatever was remembered', async ({
  page
}) => {
  await page.goto('/discover');
  for (const stored of ['collapsed', 'expanded']) {
    await page.evaluate(value => localStorage.setItem('bookedz-sidebar', value), stored);
    for (const width of [375, 575, 768, 991]) {
      await page.setViewportSize({
        width,
        height: 800
      });
      await page.reload();
      await expect(page.locator('.app-sidebar')).toBeHidden();
      expect(await page.locator('.app-shell').evaluate(el => getComputedStyle(el).paddingLeft)).toBe('0px');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
  await page.getByRole('button', {
    name: 'Toggle navigation'
  }).click();
  await expect(page.locator('.app-sidebar')).toBeVisible();
});
test('collapse toggle sits on the divider at the sidebar edge and labels itself on hover', async ({
  page
}, testInfo) => {
  await page.emulateMedia({
    reducedMotion: 'reduce'
  });
  await page.setViewportSize({
    width: 1280,
    height: 800
  });
  await page.goto('/discover');
  await page.evaluate(() => localStorage.removeItem('bookedz-sidebar'));
  await page.reload();
  const toggle = page.locator('.sidebar-collapse');
  const centred = () => page.evaluate(() => {
    const button = document.querySelector('.sidebar-collapse').getBoundingClientRect();
    const line = document.querySelector('.sidebar-divider').getBoundingClientRect().top;
    const edge = document.querySelector('.app-sidebar').getBoundingClientRect().right;
    return Math.abs(button.top + button.height / 2 - line) <= 1.5 && Math.abs(button.left + button.width / 2 - edge) <= 1.5;
  });
  const tooltip = () => toggle.evaluate(el => [getComputedStyle(el, '::after').content.split(' / ')[0], getComputedStyle(el, '::after').opacity]);
  // starts on the rail
  await expect.poll(centred).toBe(true);
  // tooltip text is visual only: names are not doubled by it
  await expect(page.getByRole('navigation', {
    name: 'Main navigation'
  }).getByRole('link', {
    name: 'Community',
    exact: true
  })).toBeVisible();
  await toggle.hover();
  await expect.poll(tooltip).toEqual(['"Expand"', '1']);
  await page.screenshot({
    path: testInfo.outputPath('collapse-toggle-collapsed.png'),
    clip: {
      x: 0,
      y: 0,
      width: 420,
      height: 400
    }
  });
  await page.getByRole('button', {
    name: 'Expand sidebar'
  }).click();
  await expect(page.locator('.app-sidebar')).toHaveCSS('width', '240px');
  await expect.poll(centred).toBe(true);
  await toggle.hover(); // the toggle moved with the edge
  await expect.poll(tooltip).toEqual(['"Collapse"', '1']);
  await page.mouse.move(900, 600);
  await page.getByRole('button', {
    name: 'Collapse sidebar'
  }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.app-sidebar')).toHaveCSS('width', '76px');
  await expect(page.getByRole('button', {
    name: 'Expand sidebar'
  })).toBeFocused();
  // a short window scrolls the sidebar; the toggle stays on the line
  await page.getByRole('button', {
    name: 'Expand sidebar'
  }).click();
  await page.setViewportSize({
    width: 1280,
    height: 300
  });
  await page.locator('.app-sidebar').evaluate(el => {
    el.scrollTop = 40;
  });
  await expect.poll(centred).toBe(true);
});
