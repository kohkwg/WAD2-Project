import { test, expect } from '@playwright/test';

const eventPath = '/organiser/events/e-weather-demo/manage';
test.beforeEach(async ({
  page
}) => {
  await page.clock.setFixedTime(new Date('2026-10-16T04:00:00Z'));
  await page.setViewportSize({
    width: 375,
    height: 750
  });
  await page.route('**/*.supabase.co/**', route => route.abort());
});
for (const tool of [{
  tab: 'tasks',
  field: 'Task title',
  value: 'Check stage lighting',
  save: 'Add task',
  edit: 'Edit task: Check stage lighting'
}, {
  tab: 'announcements',
  field: 'Announcement text',
  value: 'Please bring your student card',
  save: 'Publish announcement',
  edit: 'Edit announcement: Please bring your student card'
}]) {
  test(`${tool.tab} edit brings the existing draft into keyboard focus and view`, async ({
    page
  }) => {
    await page.goto(`${eventPath}?tab=${tool.tab}`);
    const input = page.getByLabel(tool.field, {
      exact: true
    });
    await input.fill(tool.value);
    if (tool.tab === 'budget') await page.getByLabel('Planned unit cost (SGD)', {
      exact: true
    }).fill('125.00');
    await page.getByRole('button', {
      name: tool.save,
      exact: true
    }).click();
    await page.getByRole('button', {
      name: tool.edit,
      exact: true
    }).click();
    await expect(input).toBeFocused();
    await expect(input).toHaveValue(tool.value);
    await expect(input).toBeInViewport();
    await input.press('End');
    await input.press('!');
    await expect(input).toHaveValue(`${tool.value}!`);
  });
}
