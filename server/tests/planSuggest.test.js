const test = require('node:test');
const assert = require('node:assert/strict');
const { suggestPlan, similarity, normalizeTitle, tokenize } = require('../services/planSuggest');

const NOW = Date.parse('2026-10-28T00:00:00Z');
let counter = 0;
// An ended 4-hour event; programme/tasks given as [title, startMinute, lengthMinutes] / [title].
function past({ title = 'Coders Assembly', own = false, programme = [], tasks = [], daysAgo = 30, capacity = 100, attendance = null, tags = ['tech'], category = 'Tech', description = 'A night of coding talks' } = {}) {
  const end = NOW - daysAgo * 86400000;
  const start = end - 4 * 3600000;
  return {
    id: `e${++counter}`, title, description, category, tags, capacity, own, attendance,
    startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(),
    programme: programme.map(([name, at, length]) => ({ title: name, description: `${name} details`, startsAt: new Date(start + at * 60000).toISOString(), endsAt: length ? new Date(start + (at + length) * 60000).toISOString() : null })),
    tasks: tasks.map((name, index) => ({ title: name, notes: `${name} notes`, position: index })),
  };
}
const target = (overrides = {}) => ({ title: 'Coders Assembly', description: 'coding talks', category: 'Tech', tags: ['tech'], capacity: 100, startsAt: '2026-12-01T10:00:00Z', endsAt: '2026-12-01T14:00:00Z', ...overrides });
const run = (t, c) => suggestPlan(t, c, { now: NOW });

test('normalisation ignores case, spacing and common words', () => {
  assert.equal(normalizeTitle('  Coders   ASSEMBLY '), 'coders assembly');
  assert.deepEqual(tokenize('The Coders of Assemblies'), ['coder', 'assemblie']);
});

test('exact title copies the programme and, for your own event, the tasks', () => {
  const own = past({ own: true, programme: [['Registration', 0, 30], ['Keynote', 60, 60]], tasks: ['Book venue', 'Print badges'] });
  const result = run(target(), [own, past({ programme: [['Other', 10, 10]] })]);
  assert.equal(result.source, 'exact');
  assert.deepEqual(result.programme.map(item => item.title), ['Registration', 'Keynote']);
  assert.equal(result.programme[1].startFraction, 0.25); // 60 of 240 minutes
  assert.equal(result.programme[1].durationFraction, 0.25);
  assert.deepEqual(result.tasks.map(task => task.title), ['Book venue', 'Print badges']);
  assert.deepEqual(result.basedOn, [{ title: 'Coders Assembly', kind: 'own' }]);
});

test('exact title from the community copies the programme only, never tasks', () => {
  const community = past({ programme: [['Welcome', 0, 15]], tasks: ['Should never be used'] });
  const result = run(target(), [community]);
  assert.equal(result.source, 'exact');
  assert.equal(result.programme.length, 1);
  assert.deepEqual(result.tasks, []);
  assert.equal(result.basedOn[0].kind, 'community');
});

test('exact match fills missing parts: own tasks plus community programme', () => {
  const own = past({ own: true, tasks: ['Book venue'] });
  const community = past({ programme: [['Welcome', 0, 15]] });
  const result = run(target(), [own, community]);
  assert.equal(result.programme[0].title, 'Welcome');
  assert.equal(result.tasks[0].title, 'Book venue');
  assert.equal(result.basedOn.length, 2);
});

test('exact choice prefers the more similar, then the more recent event', () => {
  const older = past({ own: true, programme: [['Old plan', 0, 30]], daysAgo: 400 });
  const newer = past({ own: true, programme: [['New plan', 0, 30]], daysAgo: 20 });
  assert.equal(run(target(), [older, newer]).programme[0].title, 'New plan');
});

test('events that have not ended are never used', () => {
  const upcoming = { ...past({ own: true, programme: [['Future', 0, 30]] }), endsAt: '2027-01-01T00:00:00Z' };
  assert.equal(run(target(), [upcoming]).source, 'none');
});

test('community patterns need at least three events and a 40% share', () => {
  const items = [['Registration', 0, 30], ['Closing', 210, 30]];
  const two = [past({ title: 'Coding Night', programme: items }), past({ title: 'Coding Night', programme: items })];
  assert.equal(run(target({ title: 'Code Meetup' }), two).programme.length, 0);
  const three = [...two, past({ title: 'Coding Night', programme: items })];
  const result = run(target({ title: 'Code Meetup' }), three);
  assert.equal(result.source, 'community');
  assert.deepEqual(result.programme.map(item => item.title), ['Registration', 'Closing']);
  assert.equal(result.tasks.length, 0);
});

test('an item only one of four events has is dropped even when the event count is met', () => {
  const common = [['Registration', 0, 30]];
  const events = [0, 1, 2].map(() => past({ title: 'Coding Night', programme: common })).concat(past({ title: 'Coding Night', programme: [...common, ['Lucky draw', 200, 20]] }));
  const titles = run(target({ title: 'Code Meetup' }), events).programme.map(item => item.title);
  assert.deepEqual(titles, ['Registration']);
});

test('your own similar events need 40% of the weighted neighbours and also give tasks', () => {
  const mine = (programme, tasks) => past({ title: 'Coding Night', own: true, programme, tasks });
  const result = run(target({ title: 'Code Meetup' }), [
    mine([['Registration', 0, 30], ['Pizza break', 120, 20]], ['Book venue', 'Order pizza']),
    mine([['Registration', 0, 30], ['Pizza break', 120, 20]], ['Book venue', 'Print badges']),
    mine([['Registration', 0, 30], ['Lucky draw', 200, 20]], ['Book venue']),
  ]);
  assert.equal(result.source, 'own');
  assert.deepEqual(result.programme.map(item => item.title), ['Registration', 'Pizza break']); // lucky draw: 1 of 3 is under 40%
  assert.deepEqual(result.tasks.map(task => task.title), ['Book venue']); // each other task is in 1 of 3
});

test('one similar event of your own is enough to build a plan', () => {
  const only = past({ title: 'Coding Night', own: true, programme: [['Registration', 0, 30]], tasks: ['Book venue'] });
  const result = run(target({ title: 'Code Meetup' }), [only]);
  assert.equal(result.source, 'own');
  assert.equal(result.programme.length, 1);
  assert.equal(result.tasks.length, 1);
});

test('similar item titles are merged and the most common wording wins', () => {
  const make = name => past({ title: 'Coding Night', programme: [[name, 0, 30]] });
  const result = run(target({ title: 'Code Meetup' }), [make('Registration desk'), make('Registration desk'), make('Desk registration')]);
  assert.equal(result.programme.length, 1);
  assert.equal(result.programme[0].title, 'Registration desk');
});

test('unrelated events are not neighbours', () => {
  const unrelated = past({ title: 'Charity Bake Sale', description: 'cakes and cookies', category: 'Food', tags: ['food'], own: true, programme: [['Bake', 0, 60]], tasks: ['Buy flour'] });
  assert.equal(run(target(), [unrelated]).source, 'none');
});

test('similarity ranks close events above distant ones and ignores missing data', () => {
  const close = past({ title: 'Coders Night', capacity: 90 });
  const far = past({ title: 'Wine Tasting', description: 'wine', category: 'Food', tags: ['food'], capacity: 20 });
  assert.ok(similarity(target(), close).score > similarity(target(), far).score);
  const noTags = similarity(target({ tags: [] }), close);
  assert.ok(noTags.parts.tags === null && noTags.score > 0);
});

test('blank title or bad input gives an empty plan', () => {
  for (const bad of [target({ title: '  ' }), null]) assert.equal(run(bad, [past()]).source, 'none');
  assert.equal(suggestPlan(target(), null).source, 'none');
});

test('two equally similar events of your own both contribute their items', () => {
  const mine = (programme) => past({ title: 'Coding Night', own: true, programme });
  const result = run(target({ title: 'Code Meetup' }), [mine([['Registration', 0, 30], ['Pizza break', 120, 20]]), mine([['Registration', 0, 30], ['Lucky draw', 200, 20]])]);
  assert.deepEqual(result.programme.map(item => item.title).sort(), ['Lucky draw', 'Pizza break', 'Registration']);
});

test('the same title at very different points of the event is not merged', () => {
  const make = () => past({ title: 'Coding Night', programme: [['Break', 30, 10], ['Break', 200, 10]] });
  const result = run(target({ title: 'Code Meetup' }), [make(), make(), make()]);
  assert.equal(result.programme.filter(item => item.title === 'Break').length, 2);
});

test('titles whose words contain each other merge when they are at the same time', () => {
  const a = past({ title: 'Coding Night', programme: [['Registration', 0, 20]] });
  const b = past({ title: 'Coding Night', programme: [['Registration and networking', 5, 20]] });
  const c = past({ title: 'Coding Night', programme: [['Registration', 0, 20]] });
  assert.equal(run(target({ title: 'Code Meetup' }), [a, b, c]).programme.length, 1);
});

test('a community item is dropped when your own plan already covers it at that time, but not at another time', () => {
  const own = past({ title: 'Coding Night', own: true, programme: [['Registration and networking', 0, 30]] });
  const community = (items) => [0, 1, 2].map(() => past({ title: 'Coding Night', programme: items }));
  const covered = run(target({ title: 'Code Meetup' }), [own, ...community([['Registration', 0, 20]])]);
  assert.equal(covered.programme.length, 1);
  const different = run(target({ title: 'Code Meetup' }), [own, ...community([['Networking', 210, 30]])]);
  assert.deepEqual(different.programme.map(item => item.title).sort(), ['Networking', 'Registration and networking']);
});

test('a shared tag and a similar size alone do not make events neighbours', () => {
  const other = past({ title: 'Salsa Dancing Social', description: 'dance floor and music', tags: ['tech'], category: '', own: true, programme: [['Dance', 0, 60]] });
  assert.equal(run(target({ title: 'Quantum Physics Lecture', description: 'particles', tags: ['tech'], category: '' }), [other]).source, 'none');
});
