import { test, expect } from '@playwright/test';
import { setColorTheme } from './support/colorTheme.js';
import { createSeedData } from '../src/utils/mockData.js';

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

const STORE = 'bookedz-feature2-demo';

const NOW = Date.parse('2026-11-02T10:00:00Z');

function fixture() {
  const db = createSeedData();
  const base = db.events[0];
  db.events = [['confirmed', 'Board games together', 2], ['pending', 'Photography request', 1], ['offered', 'A spot for watercolours', 3], ['past', 'Past sketching', -2], ['cancelled', 'Cancelled running', 4], ['saved', 'Saved coffee meetup', 5]].map(([id, title, days]) => ({
    ...base,
    id,
    title,
    organiserId: 'org1',
    capacity: 24,
    startTime: new Date(NOW + days * 86400000).toISOString(),
    endTime: new Date(NOW + days * 86400000 + 7200000).toISOString(),
    venue: {
      name: 'Demo community room',
      address: '80 Stamford Road',
      lat: 1.2974,
      lng: 103.8496
    },
    tags: ['arts'],
    questions: []
  }));
  db.rsvps = ['confirmed', 'pending', 'offered', 'past', 'cancelled'].map(id => ({
    id: `r-${id}`,
    eventId: id,
    userId: 'u1',
    status: id === 'past' ? 'confirmed' : id,
    createdAt: new Date(NOW - 86400000).toISOString(),
    offerExpiresAt: id === 'offered' ? new Date(NOW + 120000).toISOString() : null,
    checkedInAt: id === 'past' ? new Date(NOW - 86400000).toISOString() : null,
    attendanceVerified: id === 'past',
    answers: {}
  }));
  db.eventPreferences = [{
    userId: 'u1',
    eventId: 'saved',
    saveActive: true,
    savedAt: new Date(NOW).toISOString()
  }];
  return db;
}
test.beforeEach(async ({
  page
}) => {
  await page.clock.install({
    time: new Date(NOW)
  });
  await page.emulateMedia({
    reducedMotion: 'reduce'
  });
  await page.route('**/*.supabase.co/**', route => route.abort());
  await page.addInitScript(({
    key,
    data
  }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data));
  }, {
    key: STORE,
    data: fixture()
  });
});
test('Saved shows independent bookmarks and unsave persists through refresh', async ({
  page
}) => {
  await page.goto('/my-rsvps');
  await page.getByRole('tab', {
    name: /^Saved/
  }).click();
  await expect(page.locator('#panel-saved').getByRole('link', {
    name: 'Saved coffee meetup',
    exact: true
  })).toBeVisible();
  await page.reload();
  await page.getByRole('tab', {
    name: /^Saved/
  }).click();
  await page.getByRole('button', {
    name: 'Remove Saved coffee meetup from saved',
    exact: true
  }).click();
  await expect(page.getByRole('status').filter({
    hasText: 'Event removed'
  })).toBeFocused();
  await expect(page.locator('#panel-saved')).toContainText('A little space for future plans.');
  await page.reload();
  await page.getByRole('tab', {
    name: /^Saved/
  }).click();
  await expect(page.locator('#panel-saved .saved-event')).toHaveCount(0);
  await expect(page.locator('#panel-saved')).toContainText('A little space for future plans.');
});
test('cancellation keeps keyboard focus; directions and calendar actions work', async ({
  page
}) => {
  await page.goto('/my-rsvps');
  const next = page.getByRole('region', {
    name: 'Board games together',
    exact: true
  });
  await expect(next.getByRole('link', {
    name: /Get directions/
  })).toHaveAttribute('href', /destination=1.2974%2C103.8496$/);
  const download = page.waitForEvent('download');
  await next.getByRole('button', {
    name: 'Add to calendar'
  }).click();
  expect((await download).suggestedFilename()).toBe('bookedz-event.ics');
  const cancel = page.getByRole('button', {
    name: 'Cancel RSVP for Board games together',
    exact: true
  });
  await cancel.click();
  await expect(page.locator('#keep-r-confirmed')).toBeFocused();
  await page.locator('#keep-r-confirmed').click();
  await expect(cancel).toBeFocused();
  await cancel.click();
  await page.getByRole('button', {
    name: 'Yes, cancel',
    exact: true
  }).click();
  await expect(page.getByRole('status').filter({
    hasText: 'RSVP cancelled.'
  })).toBeFocused();
  await expect(next).toHaveCount(0);
  await page.getByRole('tab', {
    name: /^Cancelled/
  }).click();
  await expect(page.locator('#panel-cancelled')).toContainText('Board games together');
});
test('offers expire across tabs and all layouts remain usable', async ({
  page
}, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/my-rsvps');
  await expect(page.getByRole('button', {
    name: 'Confirm my spot'
  })).toBeVisible();
  for (const theme of ['light', 'dark']) {
    await setColorTheme(page, theme);
    for (const width of [375, 575, 768, 1280]) {
      await page.setViewportSize({
        width,
        height: 900
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.locator('main')).toHaveCount(1);
      const box = await page.getByRole('button', {
        name: 'Confirm my spot'
      }).boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      if ([375, 1280].includes(width)) await page.screenshot({
        path: testInfo.outputPath(`my-rsvps-${theme}-${width}.png`),
        fullPage: true
      });
    }
  }
  await page.getByRole('tab', {
    name: /^Saved/
  }).click();
  await page.clock.fastForward(120000);
  await expect(page.getByRole('button', {
    name: 'Confirm my spot'
  })).toHaveCount(0);
  await page.getByRole('tab', {
    name: /^Cancelled/
  }).click();
  await expect(page.locator('#panel-cancelled')).toContainText('Offer expired');
  expect(errors).toEqual([]);
});

async function overridePageApi(page, source) {
  await page.route('**/__rsvp-api.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: source
  }));
  await page.route(/\/src\/views\/MyRsvpsView\.vue(?:\?.*)?$/, async route => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: (await response.text()).replace(/from (["'])\/src\/utils\/api\.js\1/g, 'from "/__rsvp-api.js"')
    });
  });
}
test('saved read and unsave failures are retryable without hiding registrations', async ({
  page
}) => {
  await page.addInitScript(() => {
    window.__failSavedRead = true;
    window.__failUnsave = true;
  });
  await overridePageApi(page, `
    export * from '/src/utils/api.js';
    import {getSavedEvents as read, unsaveEvent as remove} from '/src/utils/api.js';
    export const getSavedEvents = () => window.__failSavedRead ? Promise.reject(new Error('Read unavailable')) : read();
    export const unsaveEvent = id => window.__failUnsave ? Promise.reject(new Error('Write unavailable')) : remove(id);
  `);
  await page.goto('/my-rsvps');
  await expect(page.locator('#panel-upcoming .rsvp-row')).toHaveCount(3);
  await page.getByRole('tab', {
    name: /^Saved/
  }).click();
  await expect(page.locator('#panel-saved').getByRole('alert')).toContainText('Could not load saved events');
  await expect(page.locator('#panel-saved')).not.toContainText('A little space for future plans.');
  await page.evaluate(() => {
    window.__failSavedRead = false;
  });
  await page.getByRole('button', {
    name: 'Retry saved events'
  }).click();
  await page.getByRole('button', {
    name: 'Remove Saved coffee meetup from saved'
  }).click();
  await expect(page.locator('#panel-saved').getByRole('alert')).toContainText('Could not remove saved event');
  await expect(page.locator('#panel-saved .saved-event')).toHaveCount(1);
  await page.evaluate(() => {
    window.__failUnsave = false;
  });
  await page.getByRole('button', {
    name: 'Remove Saved coffee meetup from saved'
  }).click();
  await expect(page.locator('#panel-saved .saved-event')).toHaveCount(0);
});
test('ticket link uses the existing event ticket route when enabled', async ({
  page
}) => {
  // only the page adapter is substituted; this verifies navigation, not real qr data.
  await overridePageApi(page, `export * from '/src/utils/api.js'; export const USING_SUPABASE = true;`);
  await page.goto('/my-rsvps');
  const next = page.getByRole('region', {
    name: 'Board games together',
    exact: true
  });
  await expect(next.getByRole('link', {
    name: 'View ticket',
    exact: true
  })).toHaveAttribute('href', '/events/confirmed/ticket');
  await next.getByRole('link', {
    name: 'View ticket',
    exact: true
  }).click();
  await expect(page).toHaveURL(/\/events\/confirmed\/ticket$/);
});
test('empty tabs give distinct guidance and unverified past check-ins do not claim attendance', async ({
  page
}) => {
  await page.goto('/my-rsvps');
  await page.evaluate(key => {
    const db = JSON.parse(localStorage.getItem(key));
    db.rsvps.find(row => row.id === 'r-past').attendanceVerified = false;
    localStorage.setItem(key, JSON.stringify(db));
  }, STORE);
  await page.getByRole('button', {
    name: 'Refresh RSVPs'
  }).click();
  await page.getByRole('tab', {
    name: /^Past/
  }).click();
  await expect(page.locator('#panel-past')).toContainText('Past sketching');
  await expect(page.locator('#panel-past').getByText('Attended', {
    exact: true
  })).toHaveCount(0);
  await page.evaluate(key => {
    const db = JSON.parse(localStorage.getItem(key));
    db.rsvps = [];
    localStorage.setItem(key, JSON.stringify(db));
  }, STORE);
  await page.getByRole('button', {
    name: 'Refresh RSVPs'
  }).click();
  await expect(page.locator('#panel-past')).toContainText('Your event memories start here.');
  await page.getByRole('tab', {
    name: /^Upcoming/
  }).click();
  await expect(page.locator('#panel-upcoming')).toContainText('Your next plan is waiting.');
  await page.getByRole('tab', {
    name: /^Cancelled/
  }).click();
  await expect(page.locator('#panel-cancelled')).toContainText('No cancelled or closed RSVPs.');
});
test('offer accept and decline refresh registrations and announce the outcome', async ({
  page
}) => {
  await page.goto('/my-rsvps');
  await page.getByRole('button', {
    name: 'Confirm my spot',
    exact: true
  }).click();
  await expect(page.getByRole('status').filter({
    hasText: 'Spot confirmed.'
  })).toBeFocused();
  await expect(page.getByRole('button', {
    name: 'Confirm my spot',
    exact: true
  })).toHaveCount(0);
  const row = page.locator('.rsvp-row').filter({
    hasText: 'A spot for watercolours'
  });
  await expect(row.getByText('Confirmed', {
    exact: true
  })).toBeVisible();
  await page.evaluate(({
    key,
    data
  }) => localStorage.setItem(key, JSON.stringify(data)), {
    key: STORE,
    data: fixture()
  });
  await page.reload();
  await page.getByRole('button', {
    name: 'Decline',
    exact: true
  }).click();
  await expect(page.getByRole('status').filter({
    hasText: 'Offer declined.'
  })).toBeFocused();
  await page.getByRole('tab', {
    name: /^Cancelled/
  }).click();
  await expect(page.locator('#panel-cancelled')).toContainText('Offer declined');
});
test('confirmed live-style rows keep cancellation available and explain recorded check-ins', async ({
  page
}) => {
  await overridePageApi(page, `export * from '/src/utils/api.js'; export const USING_SUPABASE = true;`);
  await page.goto('/my-rsvps');
  const row = page.locator('.rsvp-row').filter({
    has: page.getByRole('heading', {
      name: 'Board games together',
      exact: true
    })
  });
  await expect(row.getByRole('link', {
    name: 'View ticket',
    exact: true
  })).toBeVisible();
  await expect(row.getByRole('button', {
    name: 'Cancel RSVP for Board games together',
    exact: true
  })).toBeEnabled();
  await page.evaluate(key => {
    const data = JSON.parse(localStorage.getItem(key));
    const r = data.rsvps.find(r => r.id === 'r-confirmed');
    r.checkedInAt = new Date().toISOString();
    r.attendanceVerified = false;
    localStorage.setItem(key, JSON.stringify(data));
  }, STORE);
  await page.getByRole('button', {
    name: 'Refresh RSVPs',
    exact: true
  }).click();
  await expect(row.getByRole('button', {
    name: 'Cancel RSVP',
    exact: true
  })).toBeDisabled();
  await expect(row.getByText('Cancellation unavailable: a check-in is recorded for this RSVP.', {
    exact: true
  })).toBeVisible();
});
