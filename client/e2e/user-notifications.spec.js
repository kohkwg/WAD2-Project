import { test, expect } from '@playwright/test';

// each browser context owns its demo data; nothing is written to the hosted project
test.beforeEach(async ({
  page
}) => {
  await page.goto('/discover');
  await page.waitForFunction(() => Object.keys(localStorage).some(key => key.startsWith('dino-notification-state-v1:')));
  await page.evaluate(async () => {
    const {
      clearToasts
    } = await import('/src/composables/useToast.js');
    clearToasts();
  });
  await expect(page.locator('.toast-item')).toHaveCount(0);
});
test('top-right dino notices fit both themes, close manually and expire after ten seconds', async ({
  page
}) => {
  await page.evaluate(async () => {
    const {
      toast
    } = await import('/src/composables/useToast.js');
    toast('[TEST] Your place is confirmed.', {
      to: '/my-rsvps'
    });
  });
  const notice = page.locator('.toast-item');
  await expect(notice).toContainText('[TEST] Your place is confirmed.');
  await expect(notice.locator('img')).toHaveJSProperty('complete', true);
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
    for (const width of [375, 575, 768, 1280]) {
      await page.setViewportSize({
        width,
        height: 900
      });
      await expect(async () => {
        const bounds = await page.locator('.toast-host').boundingBox();
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
        expect(bounds.y).toBeLessThan(40);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }).toPass({
        timeout: 2000
      });
    }
  }
  await notice.getByRole('button', {
    name: 'Dismiss notification'
  }).click();
  await expect(notice).toHaveCount(0);
  await page.evaluate(async () => {
    const {
      toast
    } = await import('/src/composables/useToast.js');
    toast('[TEST] Auto close', {
      tone: 'sad'
    });
  });
  await expect(notice).toHaveCount(1);
  await expect(notice).toHaveCount(0, {
    timeout: 12_000
  });
});
test('background event decisions and announcement edits appear without opening the event', async ({
  page
}) => {
  async function changeStatus(status) {
    await page.evaluate(status => {
      const db = JSON.parse(localStorage.getItem('dino-feature2-demo'));
      db.rsvps.find(row => row.id === 'r11').status = status;
      localStorage.setItem('dino-feature2-demo', JSON.stringify(db));
      window.dispatchEvent(new Event('focus'));
    }, status);
  }
  await changeStatus('pending');
  await expect(page.locator('.toast-item').filter({
    hasText: /waiting for approval/
  })).toBeVisible();
  await changeStatus('confirmed');
  await expect(page.locator('.toast-item').filter({
    hasText: /Your RSVP for .*is confirmed/
  })).toBeVisible();
  await changeStatus('rejected');
  await expect(page.locator('.toast-item').filter({
    hasText: /declined or removed/
  })).toBeVisible();
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('dino-feature2-demo'));
    const eventId = db.rsvps.find(row => row.id === 'r3').eventId;
    db.feature4.announcements.push({
      id: 'test-notice',
      eventId,
      body: '[TEST] bring a jacket',
      kind: 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: null
    });
    localStorage.setItem('dino-feature2-demo', JSON.stringify(db));
    window.dispatchEvent(new Event('focus'));
  });
  await expect(page.locator('.toast-item').filter({
    hasText: /New announcement.*bring a jacket/
  })).toBeVisible();
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('dino-feature2-demo'));
    const post = db.feature4.announcements.find(post => post.id === 'test-notice');
    post.body = '[TEST] bring a coat';
    post.updatedAt = new Date().toISOString();
    localStorage.setItem('dino-feature2-demo', JSON.stringify(db));
    window.dispatchEvent(new Event('focus'));
  });
  await expect(page.locator('.toast-item').filter({
    hasText: /Announcement updated.*bring a coat/
  })).toBeVisible();
});
