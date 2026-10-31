const test = require('node:test');
const assert = require('node:assert/strict');
const { EVENTS } = require('../scripts/seed-planner.js');
const { suggestPlan } = require('../services/planSuggest');

const NOW = Date.parse('2026-10-28T00:00:00Z');
// The seed data as the plan-suggestions route would see it (plain titles)
const candidates = EVENTS.map((spec, index) => {
  const end = NOW - spec.daysAgo * 86400000;
  const start = end - spec.minutes * 60000;
  return {
    id: `seed${index}`, title: spec.title, description: spec.description, category: spec.category, tags: spec.tags, capacity: spec.capacity,
    startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(), own: spec.owner === 'own', attendance: null,
    programme: spec.programme.map(([title, at, length, description]) => ({ title, description, startsAt: new Date(start + at * 60000).toISOString(), endsAt: new Date(start + (at + length) * 60000).toISOString() })),
    tasks: spec.tasks.map(([title, notes], position) => ({ title, notes, position })),
  };
});
const plan = (target) => suggestPlan({ startsAt: '2026-12-01T10:00:00Z', endsAt: '2026-12-01T14:00:00Z', ...target }, candidates, { now: NOW });
const titles = (items) => items.map(item => item.title);

test('seed data is well formed: unique titles, items inside the event, tasks only on your own events', () => {
  assert.equal(new Set(EVENTS.map(spec => spec.title)).size, EVENTS.length);
  for (const spec of EVENTS) {
    for (const [title, at, length] of spec.programme) {
      assert.ok(title && at >= 0 && length > 0 && at + length <= spec.minutes, `${spec.title}: ${title} fits the event`);
    }
    if (spec.owner === 'community') assert.equal(spec.tasks.length, 0, `${spec.title} has no tasks`);
  }
  assert.ok(EVENTS.some(spec => spec.owner === 'own') && EVENTS.some(spec => spec.owner === 'community'));
});

test('typing a seeded name copies it: your own event brings tasks, the community one only a programme', () => {
  const own = plan({ title: 'Coders Assembly' });
  assert.equal(own.source, 'exact');
  assert.equal(own.programme.length, 6);
  assert.equal(own.tasks.length, 6);
  const community = plan({ title: 'Charity Bake Sale' });
  assert.equal(community.source, 'exact');
  assert.deepEqual(titles(community.programme), ['Setup', 'Sales open', 'Pack up']);
  assert.equal(community.tasks.length, 0);
});

test('a new tech meetup gets a plan from your events and the community, without duplicates', () => {
  const result = plan({ title: 'Code Meetup', description: 'monthly coding meetup', tags: ['tech'], capacity: 40 });
  assert.ok(['mixed', 'own'].includes(result.source));
  assert.ok(titles(result.programme).includes('Lightning talks'));
  assert.ok(titles(result.programme).includes('Networking'));
  assert.ok(result.tasks.length > 0);
  assert.equal(new Set(titles(result.programme)).size, result.programme.length, 'no repeated programme titles');
  assert.ok(result.programme.every(item => item.startFraction >= 0 && item.startFraction <= 1));
  assert.ok(result.confidence > 0 && result.confidence <= 1);
});

test('an unrelated event gets no suggestion', () => {
  assert.equal(plan({ title: 'Charity Fun Run', description: 'run for a cause', tags: ['sports', 'volunteering'], capacity: 150 }).source, 'none');
});
