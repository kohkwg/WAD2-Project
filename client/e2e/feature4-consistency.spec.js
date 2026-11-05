import { test, expect } from '@playwright/test';

const NOW = '2026-10-16T04:00:00.000Z';

const STORE = 'bookedz-feature2-demo';

const EVENT_ID = 'e-weather-demo';
test.beforeEach(async ({
  page,
  context
}) => {
  await page.clock.setFixedTime(new Date(NOW));
  await context.route('**/*.supabase.co/**', route => route.abort());
  await context.route('**/v2/real-time/api/two-hr-forecast*', route => route.fulfill({
    json: {
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
          timestamp: '2026-10-16T11:55:00+08:00',
          update_timestamp: '2026-10-16T11:55:00+08:00',
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
    }
  }));
});

async function addTask(page, title) {
  await page.getByLabel('Task title', {
    exact: true
  }).fill(title);
  await page.getByRole('button', {
    name: 'Add task',
    exact: true
  }).click();
  await expect(page.getByRole('button', {
    name: `Edit task: ${title}`,
    exact: true
  })).toBeVisible();
}

async function preparePublicPage(page) {
  await page.goto(`/organiser/events/${EVENT_ID}/manage?tab=tasks`);
  await expect(page.getByLabel('Task title', {
    exact: true
  })).toBeVisible();
  await page.evaluate(({
    key,
    id
  }) => {
    const state = JSON.parse(localStorage.getItem(key));
    state.events.find(event => event.id === id).questions = [{
      id: 'arrival',
      text: 'When will you arrive?',
      type: 'text',
      required: true
    }];
    localStorage.setItem(key, JSON.stringify(state));
  }, {
    key: STORE,
    id: EVENT_ID
  });
  await page.goto(`/events/${EVENT_ID}/rsvp`);
  await expect(page.getByLabel('Name', {
    exact: true
  })).toBeVisible();
  await page.getByLabel('Name', {
    exact: true
  }).fill('Draft participant');
  await page.getByLabel('Email', {
    exact: true
  }).fill('draft@demo.smu.edu.sg');
  await page.getByLabel(/When will you arrive/).fill('12:15');
  await expect(page.getByText(/^Venue:/).locator('..')).toContainText('SMU Campus Green');
}

async function switchVenue(page) {
  await page.evaluate(async id => {
    const api = await import('/src/utils/api.js');
    await api.confirmBackupVenueSwitch(id);
  }, EVENT_ID);
}

async function expectDraft(page) {
  await expect(page.getByLabel('Name', {
    exact: true
  })).toHaveValue('Draft participant');
  await expect(page.getByLabel('Email', {
    exact: true
  })).toHaveValue('draft@demo.smu.edu.sg');
  await expect(page.getByLabel(/When will you arrive/)).toHaveValue('12:15');
}
test('task order stays canonical after multiple deletions and a new task', async ({
  page
}) => {
  await page.goto(`/organiser/events/${EVENT_ID}/manage?tab=tasks`);
  for (const title of ['A', 'B', 'C', 'D']) await addTask(page, title);
  for (const title of ['A', 'B']) {
    await page.getByRole('button', {
      name: `Delete task: ${title}`,
      exact: true
    }).click();
    await page.getByRole('dialog').getByRole('button', {
      name: 'Delete',
      exact: true
    }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  }
  await addTask(page, 'E');
  const todo = page.locator('[aria-label="To do tasks"] .task-card h4');
  await expect(todo).toHaveText(['C', 'D', 'E']);
  await page.getByLabel('Status for E', {
    exact: true
  }).selectOption('in_progress');
  await expect(todo).toHaveText(['C', 'D']);
  await page.reload();
  await expect(todo).toHaveText(['C', 'D']);
  await expect(page.locator('[aria-label="In progress tasks"] .task-card h4')).toHaveText(['E']);
});
test('a standalone public feed still refreshes without a parent event loader', async ({
  page
}) => {
  await page.goto('/events');
  await page.evaluate(async id => {
    const {
      createApp
    } = await import('/node_modules/.vite/deps/vue.js');
    const {
      default: AnnouncementFeed
    } = await import('/src/components/event-operations/AnnouncementFeed.vue');
    const api = await import('/src/utils/api.js');
    const host = document.createElement('div');
    document.body.append(host);
    createApp(AnnouncementFeed, {
      eventId: id
    }).mount(host);
    await api.createAnnouncement(id, 'Standalone update');
  }, EVENT_ID);
  await page.getByRole('button', {
    name: 'Refresh announcements',
    exact: true
  }).click();
  await expect(page.getByText('Standalone update', {
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('button', {
    name: 'Refresh announcements',
    exact: true
  })).toBeEnabled();
});
