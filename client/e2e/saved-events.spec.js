import { test, expect } from '@playwright/test';
import { createSeedData } from '../src/utils/mockData.js';

// saved events are one journey: save on discover → the toast links to plans → saved,
// a saved chip filters discover, and each saved card leads to an rsvp (docs/decisions.md, 5 november 2026).

// discover in live mode, with a small in-browser supabase stand-in: events_with_counts honours
// .in('id', …) and user_event_preferences reflects saves made through the recommendations api.

async function liveDiscover(page) {
  await page.route('**/*.supabase.co/**', route => route.abort());
  await page.route('**/__saved-fixture.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: `
    export const USING_SUPABASE = true;
    export const getEvents = async () => [];
    const day = 86400000, soon = Date.now() + 2 * day;
    const row = (id, title, offset, extra = {}) => ({ id, title, kind: 'official', status: 'published', tags: ['arts'], category: 'arts',
      start_time: new Date(soon + offset * day).toISOString(), end_time: new Date(soon + offset * day + 7200000).toISOString(),
      capacity: 20, spots_left: 12, confirmed_count: 8, venue_name: 'Demo community room', ...extra });
    const events = [row('pottery', 'Pottery evening', 0), row('music', 'Music night', 1), row('walk', 'Heritage walk', 2)];
    const saved = new Set(['pottery']);
    const session = { user: { id: 'fixture-user' } };
    const result = ({ table, filters, head }) => {
      const ids = filters.find(([method, column]) => method === 'in' && (column === 'id' || column === 'event_id'))?.[2];
      if (table === 'events_with_counts') {
        const rows = ids ? events.filter(event => ids.includes(event.id)) : events;
        return { data: head ? null : rows, count: rows.length, error: null };
      }
      if (table === 'user_event_preferences') {
        const rows = [...saved].map(id => ({ event_id: id, save_active: true }));
        return { data: ids ? rows.filter(r => ids.includes(r.event_id)) : rows, error: null };
      }
      return { data: [], error: null };
    };
    const query = table => {
      const state = { table, filters: [], head: false };
      const builder = new Proxy({}, { get(_target, method) {
        if (method === 'then') return resolve => resolve(result(state));
        return (...args) => {
          if (method === 'select') state.head = Boolean(args[1]?.head);
          if (method === 'in' || method === 'eq') state.filters.push([method, ...args]);
          return builder;
        };
      } });
      return builder;
    };
    export const supabase = { auth: { getSession: async () => ({ data: { session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: query };
    export const api = {
      get: async () => ({ data: { events: [] } }),
      post: async (url, body) => {
        const id = decodeURIComponent(url.split('/')[3]);
        if (body.action === 'save') saved.add(id);
        if (body.action === 'unsave') saved.delete(id);
        return { data: {} };
      },
    };
  `
  }));
  // a reused dev server may add an hmr ?t= stamp to these imports
  const stub = /from (["'])\/src\/(?:lib\/supabase|lib\/api|utils\/api)\.js(?:\?[^"']*)?\1/g;
  for (const pattern of [/\/src\/views\/DiscoverView\.vue(?:\?.*)?$/, /\/src\/composables\/useEvents\.js(?:\?.*)?$/]) {
    await page.route(pattern, async route => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: (await response.text()).replace(stub, 'from "/__saved-fixture.js"')
      });
    });
  }
}

const rowTitles = page => page.locator('.discovery-list .row-title');
test('Discover: the Saved chip filters to saved events and saving points to Plans', async ({
  page
}, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await liveDiscover(page);
  await page.emulateMedia({
    reducedMotion: 'reduce'
  });
  await page.setViewportSize({
    width: 1280,
    height: 900
  });
  await page.goto('/discover');
  const categories = page.getByRole('navigation', {
    name: 'Event categories'
  });
  const savedChip = categories.getByRole('button', {
    name: 'Saved events, 1',
    exact: true
  });
  const all = categories.getByRole('button', {
    name: 'All',
    exact: true
  });
  await expect(rowTitles(page)).toHaveCount(3);
  await expect(savedChip).toHaveAttribute('aria-pressed', 'false');
  // the chip leads the row
  expect(await categories.locator('button').first().getAttribute('aria-label')).toBe('Saved events, 1');
  await savedChip.click();
  await expect(savedChip).toHaveAttribute('aria-pressed', 'true');
  await expect(all).toHaveAttribute('aria-pressed', 'false');
  await expect(page).toHaveURL(/[?&]saved=true/);
  await expect(rowTitles(page)).toHaveText(['Pottery evening']);
  await page.screenshot({
    path: testInfo.outputPath('discover-saved-selected.png')
  });
  await all.click();
  await expect(page).not.toHaveURL(/saved=/);
  await expect(rowTitles(page)).toHaveCount(3);

  // one word for it: save / remove from saved
  const save = page.getByRole('button', {
    name: 'Save Music night',
    exact: true
  });
  await save.click();
  const toast = page.locator('.toast-item').filter({
    hasText: 'Saved to your list'
  });
  await expect(toast).toBeVisible();
  await expect(categories.getByRole('button', {
    name: 'Saved events, 2',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('button', {
    name: 'Remove Music night from saved',
    exact: true
  })).toHaveAttribute('aria-pressed', 'true');
  await toast.screenshot({
    path: testInfo.outputPath('toast-view-saved.png')
  });
  await toast.getByRole('button', {
    name: 'View saved',
    exact: true
  }).click();
  await expect(page).toHaveURL(/\/my-rsvps\?tab=saved$/);
  expect(errors).toEqual([]);
});
test('Discover: emptying Saved keeps the chip so it can be turned off', async ({
  page
}) => {
  await liveDiscover(page);
  await page.emulateMedia({
    reducedMotion: 'reduce'
  });
  await page.goto('/discover?saved=true');
  const categories = page.getByRole('navigation', {
    name: 'Event categories'
  });
  await expect(rowTitles(page)).toHaveText(['Pottery evening']);
  await page.getByRole('button', {
    name: 'Remove Pottery evening from saved',
    exact: true
  }).click();
  await expect(page.getByRole('heading', {
    name: 'No saved events here',
    exact: true
  })).toBeVisible();
  await expect(categories.getByRole('button', {
    name: 'Saved events, 0',
    exact: true
  })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', {
    name: 'Browse all events',
    exact: true
  }).click();
  await expect(rowTitles(page)).toHaveCount(3);
  // nothing saved and not selected: the chip steps aside
  await expect(categories.getByRole('button', {
    name: /^Saved events/
  })).toHaveCount(0);
});
test('Discover: signed-out visitors never see the Saved chip', async ({
  page
}) => {
  await page.route('**/*.supabase.co/**', route => route.abort());
  await page.goto('/discover?saved=true');
  await expect(page.locator('.discovery-list .row-title').first()).toBeVisible();
  await expect(page.getByRole('navigation', {
    name: 'Event categories'
  }).getByRole('button', {
    name: /^Saved events/
  })).toHaveCount(0);
  await expect(page.getByRole('navigation', {
    name: 'Event categories'
  }).getByRole('button', {
    name: 'All',
    exact: true
  })).toHaveAttribute('aria-pressed', 'true');
});

// plans runs in demo mode with seeded saves

const STORE = 'bookedz-feature2-demo';

const NOW = Date.parse('2026-11-02T10:00:00Z');

function savedFixture() {
  const db = createSeedData(),
    base = db.events[0];
  db.events = [['going', 'Board games together', 6, 24], ['soon', 'Coffee meetup', 1, 24], ['full', 'Pottery class', 4, 1], ['later', 'Sketch walk', 3, 24], ['ended', 'Past picnic', -3, 24]].map(([id, title, days, capacity]) => ({
    ...base,
    id,
    title,
    organiserId: 'org1',
    capacity,
    status: days < 0 ? 'completed' : 'published',
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
  db.rsvps = [{
    id: 'r-going',
    eventId: 'going',
    userId: 'u1',
    status: 'confirmed',
    answers: {},
    createdAt: new Date(NOW - 86400000).toISOString()
  }, {
    id: 'r-full',
    eventId: 'full',
    userId: 'u2',
    status: 'confirmed',
    answers: {},
    createdAt: new Date(NOW - 86400000).toISOString()
  }];
  db.eventPreferences = ['ended', 'later', 'going', 'full', 'soon'].map((eventId, i) => ({
    userId: 'u1',
    eventId,
    saveActive: true,
    savedAt: new Date(NOW - i * 60000).toISOString()
  }));
  return db;
}
test('Plans: ?tab=saved opens Saved; cards are ordered and lead to the right action', async ({
  page
}, testInfo) => {
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
    data: savedFixture()
  });
  await page.goto('/my-rsvps?tab=saved');
  const panel = page.locator('#panel-saved');
  await expect(page.getByRole('tab', {
    name: /^Saved/
  })).toHaveAttribute('aria-selected', 'true');
  await expect(panel).toBeVisible();
  // upcoming first (soonest first), ended last
  await expect(panel.locator('.saved-event h3')).toHaveText(['Coffee meetup', 'Sketch walk', 'Pottery class', 'Board games together', 'Past picnic']);
  await expect(panel.locator('.saved-badge')).toHaveText(['Starts tomorrow', 'Starts in 3 days', 'Full · waitlist open', "You're going", 'Ended']);
  await expect(panel.getByRole('link', {
    name: 'RSVP: Coffee meetup',
    exact: true
  })).toHaveAttribute('href', '/events/soon/rsvp#rsvp');
  await expect(panel.getByRole('link', {
    name: 'Join waitlist: Pottery class',
    exact: true
  })).toHaveAttribute('href', '/events/full/rsvp#waitlist');
  await expect(panel.getByRole('link', {
    name: 'View your RSVP: Board games together',
    exact: true
  })).toHaveAttribute('href', '/events/going/rsvp');
  await expect(panel.getByRole('link', {
    name: 'View event: Past picnic',
    exact: true
  })).toHaveAttribute('href', '/events/ended/rsvp');
  await expect(panel.locator('.saved-event.is-closed')).toHaveCount(1);
  // the filled bookmark removes it
  const remove = panel.getByRole('button', {
    name: 'Remove Sketch walk from saved',
    exact: true
  });
  await expect(remove).toHaveAttribute('aria-pressed', 'true');
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({
      colorScheme: scheme
    });
    for (const width of [375, 575, 768, 1280]) {
      await page.setViewportSize({
        width,
        height: 900
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      // the badge never runs under the bookmark
      const [badge, mark] = await Promise.all([panel.locator('.saved-badge').nth(2).boundingBox(), panel.locator('.event-bookmark').nth(2).boundingBox()]);
      expect(badge.x + badge.width).toBeLessThanOrEqual(mark.x);
      if (width === 375 || width === 1280) await panel.screenshot({
        path: testInfo.outputPath(`saved-cards-${scheme}-${width}.png`)
      });
    }
  }
  await remove.click();
  await expect(panel.locator('.saved-event')).toHaveCount(4);
  await expect(page.getByRole('status').filter({
    hasText: 'Event removed'
  })).toBeFocused();
  // changing tab updates the url; upcoming is the default and drops the parameter
  await page.getByRole('tab', {
    name: /^Past/
  }).click();
  await expect(page).toHaveURL(/\/my-rsvps\?tab=past$/);
  await page.getByRole('tab', {
    name: /^Upcoming/
  }).click();
  await expect(page).toHaveURL(/\/my-rsvps$/);
});
