import { test, expect } from '@playwright/test';
import { setColorTheme } from './support/colorTheme.js';
import { writeFile } from 'node:fs/promises';

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

// discover no longer shows the "picked for you" strip (docs/decisions.md, 4 november 2026), so these
// strip journeys are skipped. re-enable them if the strip returns.

test.skip('filtered discovery retains compact matching picks and explicitly labelled other picks', async ({
  page
}, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await fixture(page);
  await page.emulateMedia({
    reducedMotion: 'reduce'
  });
  await page.goto('/discover');
  const picks = page.getByRole('region', {
    name: 'Picked for you'
  });
  const search = page.getByLabel('Search by title, description or venue');
  await expect(picks.locator('.recommendation-card')).toHaveCount(2);
  await page.getByRole('button', {
    name: 'Filters',
    exact: false
  }).click();
  await page.getByRole('group', {
    name: 'Category',
    exact: true
  }).getByRole('checkbox', {
    name: 'Arts',
    exact: true
  }).check();
  await page.getByRole('button', {
    name: 'Close filters',
    exact: true
  }).click();
  await expect(picks).toHaveClass(/picked-for-you--compact/);
  await expect(picks.getByText('Picks matching your current filters.')).toBeVisible();
  await expect(picks.locator('.recommendation-card')).toHaveCount(1);
  await expect(picks.getByText('50% match', {
    exact: true
  })).toBeVisible();
  await picks.getByText('Why this?', {
    exact: true
  }).click();
  await expect(picks.getByText(/not your chance of attending/)).toBeVisible();
  for (const scheme of ['light', 'dark']) {
    await setColorTheme(page, scheme);
    for (const width of [375, 575, 768, 1280]) {
      await page.setViewportSize({
        width,
        height: 900
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(picks.getByRole('button', {
        name: 'Save Pottery afternoon',
        exact: true
      })).toBeVisible();
      if (width === 375) await picks.screenshot({
        path: testInfo.outputPath(`compact-picks-${scheme}.png`)
      });
    }
  }
  await picks.getByRole('button', {
    name: 'Save Pottery afternoon',
    exact: true
  }).click();
  await expect(picks.getByText('60% match', {
    exact: true
  })).toBeVisible();
  await expect(picks.getByRole('link', {
    name: 'Pottery afternoon',
    exact: true
  })).toHaveCount(0);
  await expect(picks.getByText('Your recent activity: you saved an event about arts', {
    exact: true
  })).toBeVisible();
  await dismissSketching(picks);
  await expect(picks.getByText(/No picks match your current filters/)).toBeVisible();
  await picks.getByRole('button', {
    name: 'Undo',
    exact: true
  }).click();
  await expect(picks.getByText('60% match', {
    exact: true
  })).toBeVisible();
  await search.fill('No such workshop');
  await expect(picks.getByText(/No picks match your current filters/)).toBeVisible();
  await expect(picks.locator('.recommendation-card')).toHaveCount(0);
  await picks.getByRole('button', {
    name: 'View all picks',
    exact: true
  }).click();
  await expect(picks.getByText(/These picks may be outside your current filters/)).toBeVisible();
  await expect(picks.locator('.recommendation-card')).toHaveCount(2);
  await expect(search).toHaveValue('No such workshop');
  await expect(page.getByRole('button', {
    name: 'Remove Arts filter'
  })).toBeVisible();
  await expect(picks.getByRole('link', {
    name: 'Sketching afternoon',
    exact: true
  })).toHaveAttribute('href', '/events/sketching/rsvp');
  await page.getByRole('button', {
    name: 'Clear search',
    exact: true
  }).click();
  await expect(picks.locator('.recommendation-card')).toHaveCount(1);
  await expect(picks.getByText('Picks matching your current filters.')).toBeVisible();
  await expect(page.getByText('Finding your next event…', {
    exact: true
  })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('filtered-picks-desktop.png'),
    fullPage: true
  });
  expect(errors).toEqual([]);
});

async function fixture(page) {
  let saved = false,
    dismissed = false,
    fail = false,
    failReads = false,
    empty = false;
  await page.route('**/*.supabase.co/**', route => route.abort());
  await page.route('**/__recommendations', route => {
    if (route.request().method() === 'POST') {
      if (fail) return route.fulfill({
        status: 503,
        json: {}
      });
      const {
        action
      } = route.request().postDataJSON();
      if (action === 'save') saved = true;
      if (action === 'unsave') saved = false;
      if (action === 'dismiss') dismissed = true;
      if (action === 'undo_dismiss') dismissed = false;
      return route.fulfill({
        json: {}
      });
    }
    if (failReads) return route.fulfill({
      status: 503,
      json: {
        error: 'Unavailable'
      }
    });
    if (empty) return route.fulfill({
      json: {
        events: []
      }
    });
    return route.fulfill({
      json: {
        events: [...(!saved ? [{
          id: 'pottery',
          title: 'Pottery afternoon',
          category: 'arts',
          tags: ['arts'],
          start_time: '2030-01-02T10:00:00Z',
          spots_left: 10,
          compatibilityScore: 50,
          source: 'personalised',
          reason_type: 'interest',
          reason: 'Matches your selected interests: arts',
          recommendation_actions: true,
          saved: false
        }] : []), ...(saved && !dismissed ? [{
          id: 'sketching',
          title: 'Sketching afternoon',
          category: 'arts',
          tags: ['arts'],
          start_time: '2030-01-04T10:00:00Z',
          spots_left: 10,
          compatibilityScore: 60,
          source: 'personalised',
          reason_type: 'interest',
          reason: 'Your recent activity: you saved an event about arts',
          recommendation_actions: true,
          saved: false
        }] : []), {
          id: 'music',
          title: 'Music evening',
          category: 'music',
          tags: ['music'],
          start_time: '2030-01-03T10:00:00Z',
          spots_left: 10,
          source: 'general_discovery',
          compatibilityScore: 0,
          rankingScore: null,
          reason: 'Upcoming event to explore',
          recommendation_actions: true
        }]
      }
    });
  });
  await page.route('**/__recommendation-fixture.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: `
    export const USING_SUPABASE = true;
    const session = {user: {id: 'fixture-user'}};
    export const supabase = {auth: {
      getSession: async () => ({data: {session}}),
      onAuthStateChange: () => ({data: {subscription: {unsubscribe() {}}}})
    }, from: () => new Proxy({}, {get(_target, method) {
      if (method === 'then') return resolve => resolve({data: []});
      return () => supabase.from();
    }})};
    export const api = {
      get: async () => {
        const response = await fetch('/__recommendations');
        if (!response.ok) throw new Error('Recommendations unavailable');
        return {data: await response.json()};
      },
      post: async (_url, body) => {
        const response = await fetch('/__recommendations', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
        if (!response.ok) throw new Error('Request failed');
        return {data: await response.json()};
      }
    };
  `
  }));
  for (const [pattern, imports] of [[/\/src\/views\/DiscoverView\.vue(?:\?.*)?$/, /from (["'])\/src\/(?:lib\/supabase|utils\/api)\.js\1/g], [/\/src\/composables\/useEvents\.js(?:\?.*)?$/, /from (["'])\/src\/lib\/(?:supabase|api)\.js\1/g]]) await page.route(pattern, async route => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: (await response.text()).replace(imports, 'from "/__recommendation-fixture.js"')
    });
  });
  return {
    failActions(value) {
      fail = value;
    },
    failReads(value) {
      failReads = value;
    },
    empty(value) {
      empty = value;
    }
  };
}
test.skip('recommendation MVP displays scores and supports save, dismiss, undo and retry', async ({
  page
}, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'warning') errors.push(message.text());
  });
  const state = await fixture(page);
  await page.emulateMedia({
    reducedMotion: 'reduce'
  });
  await page.goto('/discover');
  const picks = page.getByRole('region', {
    name: 'Picked for you'
  });
  await expect(picks.getByText('50% match', {
    exact: true
  })).toBeVisible();
  await expect(picks.getByText('Something to explore', {
    exact: true
  })).toBeVisible();
  for (const scheme of ['light', 'dark']) {
    await setColorTheme(page, scheme);
    for (const width of [375, 575, 768, 1280]) {
      await page.setViewportSize({
        width,
        height: 900
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.locator('main')).toHaveCount(1);
      const box = await picks.getByRole('button', {
        name: 'Save Pottery afternoon',
        exact: true
      }).boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  }
  await picks.screenshot({
    path: testInfo.outputPath('mock-before-save.png')
  });
  await picks.getByRole('button', {
    name: 'Save Pottery afternoon',
    exact: true
  }).focus();
  const refreshedResponse = page.waitForResponse(response => response.url().endsWith('/__recommendations') && response.request().method() === 'GET');
  await page.keyboard.press('Enter');
  const responsePath = testInfo.outputPath('mock-recommendations-after-save.json');
  await writeFile(responsePath, JSON.stringify(await (await refreshedResponse).json(), null, 2));
  await testInfo.attach('mock-recommendations-after-save.json', {
    path: responsePath,
    contentType: 'application/json'
  });
  await expect(picks.getByRole('link', {
    name: 'Pottery afternoon',
    exact: true
  })).toHaveCount(0);
  await expect(picks.getByRole('link', {
    name: 'Sketching afternoon',
    exact: true
  })).toBeVisible();
  await expect(picks.getByText('Your recent activity: you saved an event about arts', {
    exact: true
  })).toBeVisible();
  await expect(picks.getByText('60% match', {
    exact: true
  })).toBeVisible();
  await picks.screenshot({
    path: testInfo.outputPath('mock-after-save.png')
  });
  await page.reload();
  await expect(picks.getByRole('link', {
    name: 'Pottery afternoon',
    exact: true
  })).toHaveCount(0);
  await expect(picks.getByRole('link', {
    name: 'Sketching afternoon',
    exact: true
  })).toBeVisible();
  await dismissSketching(picks);
  await expect(picks.getByRole('link', {
    name: 'Sketching afternoon',
    exact: true
  })).toHaveCount(0);
  await expect(picks.getByRole('button', {
    name: 'Undo',
    exact: true
  })).toBeFocused();
  await picks.getByRole('button', {
    name: 'Undo',
    exact: true
  }).click();
  await expect(picks.getByRole('link', {
    name: 'Sketching afternoon',
    exact: true
  })).toBeVisible();
  state.failActions(true);
  await dismissSketching(picks);
  await expect(picks.getByRole('alert')).toContainText('Could not save your preference');
  state.failActions(false);
  await dismissSketching(picks);
  await expect(picks.getByRole('link', {
    name: 'Sketching afternoon',
    exact: true
  })).toHaveCount(0);
  await picks.getByRole('button', {
    name: 'Undo',
    exact: true
  }).click();
  await expect(picks.getByRole('link', {
    name: 'Sketching afternoon',
    exact: true
  })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('recommendation-mvp.png'),
    fullPage: true
  });
  expect(errors).toEqual([]);
});

async function dismissSketching(picks) {
  const card = picks.locator('.recommendation-card').filter({
    has: picks.page().getByRole('link', {
      name: 'Sketching afternoon',
      exact: true
    })
  });
  const dismiss = card.getByRole('button', {
    name: 'Not interested in Sketching afternoon',
    exact: true
  });
  if (!(await dismiss.isVisible())) {
    const options = card.getByText('More options', {
      exact: true
    });
    await ((await options.count()) ? options : card.getByText('Why this?', {
      exact: true
    })).click();
  }
  await dismiss.click();
}
test.skip('mocked unavailable backend offers retry and empty results stay honest', async ({
  page
}, testInfo) => {
  const state = await fixture(page);
  state.failReads(true);
  await page.setViewportSize({
    width: 375,
    height: 900
  });
  await page.goto('/discover');
  const picks = page.getByRole('region', {
    name: 'Picked for you'
  });
  await expect(picks.getByText('Could not load recommendations.', {
    exact: true
  })).toBeVisible();
  await expect(picks.locator('.recommendation-card')).toHaveCount(0);
  await picks.screenshot({
    path: testInfo.outputPath('mock-backend-error.png')
  });
  state.failReads(false);
  await picks.getByRole('button', {
    name: 'Try again',
    exact: true
  }).click();
  await expect(picks.getByRole('link', {
    name: 'Pottery afternoon',
    exact: true
  })).toBeVisible();
  state.empty(true);
  await page.reload();
  await expect(picks.getByText(/No picks yet/)).toBeVisible();
  await expect(picks.locator('.recommendation-card')).toHaveCount(0);
  await picks.screenshot({
    path: testInfo.outputPath('mock-empty.png')
  });
});
