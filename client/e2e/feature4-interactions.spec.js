import { test, expect } from '@playwright/test';

const STORE = 'bookedz-feature2-demo';

const ENDPOINT = '**/v2/real-time/api/two-hr-forecast*';

function forecast() {
  return {
    code: 0,
    data: {
      area_metadata: [{
        name: 'City',
        label_location: {
          latitude: 1.2966,
          longitude: 103.8502
        }
      }],
      items: [{
        update_timestamp: '2026-10-16T11:55:00+08:00',
        timestamp: '2026-10-16T11:55:00+08:00',
        valid_period: {
          start: '2026-10-16T12:00:00+08:00',
          end: '2026-10-16T14:00:00+08:00'
        },
        forecasts: [{
          area: 'City',
          forecast: 'Thundery Showers'
        }]
      }]
    }
  };
}

async function openTool(page, tab = 'tasks') {
  await page.goto(`/organiser/events/e-weather-demo/manage?tab=${tab}`);
  const heading = {
    tasks: 'Tasks',
    announcements: 'Announcements',
    budget: 'Budget',
    weather: 'Weather'
  }[tab];
  await expect(page.getByRole('heading', {
    name: heading,
    exact: true
  })).toBeVisible();
}

async function failStorage(page) {
  await page.evaluate(() => {
    window.__originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'bookedz-feature2-demo') throw new DOMException('Storage full', 'QuotaExceededError');
      return window.__originalSetItem.call(this, key, value);
    };
  });
}

async function restoreStorage(page) {
  await page.evaluate(() => {
    Storage.prototype.setItem = window.__originalSetItem;
  });
}

async function failDelete(page, target, cancelWith = 'Cancel') {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', {
    name: 'Delete',
    exact: true
  }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await dialog.getByRole('button', {
    name: cancelWith,
    exact: true
  }).click();
  await expect(dialog).toHaveCount(0);
  await restoreStorage(page);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(target).toBeVisible();
}
test.beforeEach(async ({
  page
}) => {
  await page.clock.setFixedTime(new Date('2026-10-16T04:00:00.000Z'));
  await page.route('**/*.supabase.co/**', route => route.abort());
  await page.route(ENDPOINT, route => route.fulfill({
    json: forecast()
  }));
});
test('dialog cancel and Escape restore the opener; successful delete focuses a nearby task action', async ({
  page
}) => {
  await openTool(page);
  await page.getByLabel('Task title', {
    exact: true
  }).fill('Dialog focus task');
  await page.getByRole('button', {
    name: 'Add task',
    exact: true
  }).click();
  const opener = page.getByRole('button', {
    name: 'Delete task: Dialog focus task',
    exact: true
  });
  await opener.focus();
  await opener.click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', {
    name: 'Cancel',
    exact: true
  }).click();
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  await dialog.getByRole('button', {
    name: 'Delete',
    exact: true
  }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', {
    name: 'New task',
    exact: true
  })).toBeFocused();
});
test('weather confirmation returns focus on cancellation and success', async ({
  page
}) => {
  await openTool(page, 'weather');
  const opener = page.getByRole('button', {
    name: 'Switch to backup venue',
    exact: true
  });
  await expect(opener).toBeEnabled();
  await opener.focus();
  await opener.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  await page.getByRole('dialog').getByRole('button', {
    name: 'Confirm switch',
    exact: true
  }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', {
    name: 'Weather',
    exact: true
  })).toBeFocused();
});
test('missing forecast areas expose Retry areas and recover from a valid snapshot', async ({
  page
}) => {
  await openTool(page);
  await page.evaluate(key => {
    const db = JSON.parse(localStorage.getItem(key));
    const event = db.events.find(item => item.id === 'e-weather-demo');
    delete event.venue.lat;
    delete event.venue.lng;
    if (event.originalVenue) {
      delete event.originalVenue.lat;
      delete event.originalVenue.lng;
    }
    localStorage.setItem(key, JSON.stringify(db));
  }, STORE);
  await page.unroute(ENDPOINT);
  let validAreas = false;
  await page.route(ENDPOINT, route => route.fulfill({
    json: validAreas ? forecast() : {
      code: 0,
      data: {
        area_metadata: [{
          name: 'Broken',
          label_location: {
            latitude: 1000,
            longitude: 103.85
          }
        }],
        items: forecast().data.items
      }
    }
  }));
  await openTool(page, 'weather');
  await expect(page.getByRole('alert')).toContainText(/forecast areas are unavailable/i);
  await expect(page.getByRole('button', {
    name: 'Retry areas',
    exact: true
  })).toBeEnabled();
  await expect(page.getByRole('heading', {
    name: 'Forecast unavailable',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('button', {
    name: 'Switch to backup venue',
    exact: true
  })).toHaveCount(0);
  validAreas = true;
  await page.getByRole('button', {
    name: 'Retry areas',
    exact: true
  }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByLabel('Forecast area', {
    exact: true
  }).locator('option', {
    hasText: 'City'
  })).toHaveCount(1);
  await page.getByLabel('Forecast area', {
    exact: true
  }).selectOption('City');
  await page.getByRole('button', {
    name: 'Save forecast area',
    exact: true
  }).click();
  await expect(page.getByRole('button', {
    name: 'Switch to backup venue',
    exact: true
  })).toBeEnabled();
});
