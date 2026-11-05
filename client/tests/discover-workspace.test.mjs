import { test } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createRouter, createMemoryHistory } from 'vue-router';
import checks from '../../server/tests/checks.js';

const {
  checkTrue,
  checkEqual
} = checks;

import Row from '../src/components/discovery/DiscoveryEventRow.vue';
async function render(component, props) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ['/', '/profile', '/events/:id/rsvp'].map(path => ({
      path,
      component: {
        render: () => null
      }
    }))
  });
  await router.push('/');
  return renderToString(createSSRApp(component, props).use(router));
}

const event = (id, extra = {}) => ({
  id,
  title: `Event ${id}`,
  start_time: '2030-01-03T10:00:00Z',
  venue_name: 'Campus Hall',
  tags: ['gaming'],
  spots_left: 8,
  ...extra
});
test('timeline row preserves actual registration status and routes full events to the waitlist', async () => {
  // unselected rows state your status in words; the status action appears once the row is selected.
  const going = await render(Row, {
    event: event('going', {
      registration_status: 'confirmed'
    })
  });
  checkTrue(going.includes('You’re going'));
  const confirmed = await render(Row, {
    event: event('going', {
      registration_status: 'confirmed'
    }),
    selected: true
  });
  checkTrue(confirmed.includes('Confirmed'));
  checkTrue(!confirmed.includes('href="/events/going/rsvp#rsvp"'));
  const full = await render(Row, {
    event: event('full', {
      spots_left: 0
    }),
    selected: true
  });
  checkTrue(full.includes('href="/events/full/rsvp#waitlist"') && full.includes('Join waitlist'));
  const unknown = await render(Row, {
    event: event('unknown', {
      spots_left: null
    }),
    recommendation: {
      source: 'general_discovery',
      compatibilityScore: 0
    }
  });
  checkTrue(!unknown.includes('spots left') && !unknown.includes('% match'));
});
test('event-row titles retain detail links alongside an explicit map-selection control', async () => {
  const html = await render(Row, {
    event: event('details')
  });
  checkTrue(html.includes('href="/events/details/rsvp"'));
  checkTrue(html.includes('Show Event details on map') && html.includes('aria-pressed="false"'));
});
