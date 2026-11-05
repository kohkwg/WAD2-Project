import test from 'node:test';
import assert from 'node:assert/strict';
import { groupErrors, groupEventData, slotTimes, fitSlots, slotCells, availabilityError, mealLabel, suggestionFrom, suggestionErrors, emptyPlan, isGroup } from '../groups.js';

const event = {
  id: 'e1',
  title: 'Picnic',
  startTime: '2026-12-05T05:00:00Z',
  endTime: '2026-12-05T07:00:00Z',
  tags: ['food'],
  venue: {
    name: 'SMU Green',
    lat: 1.29,
    lng: 103.85
  }
};

const now = new Date('2026-12-01T00:00:00Z');
test('groupErrors checks the event, note, spots and visibility', () => {
  assert.deepEqual(groupErrors({
    eventId: 'e1',
    capacity: 4
  }, [event], now), []);
  const fields = groupErrors({
    eventId: 'x',
    capacity: 20,
    visibility: 'secret',
    note: 'a'.repeat(201)
  }, [event], now).map(e => e.field);
  assert.deepEqual(fields, ['event', 'note', 'capacity', 'visibility']);
});
test('groupEventData makes a private group with an invite token and an empty plan', () => {
  const group = groupEventData(event, {
    visibility: 'private',
    token: 'abc'
  });
  assert.ok(isGroup(group));
  assert.equal(group.group.visibility, 'private');
  assert.equal(group.group.inviteToken, 'abc');
  assert.deepEqual(group.plan, emptyPlan());
  assert.equal(groupEventData(event, {}).group.inviteToken.length, 16);
});
test('slotTimes fit an hour before and after with a 15-minute walk', () => {
  const t = slotTimes(event);
  assert.equal(t.before.start, '2026-12-05T03:45:00.000Z');
  assert.equal(t.before.end, '2026-12-05T04:45:00.000Z');
  assert.equal(t.after.start, '2026-12-05T07:15:00.000Z');
  assert.equal(mealLabel(t.before.start), 'Lunch'); // 11:45 in singapore
  assert.equal(mealLabel('2026-12-05T11:00:00Z'), 'Dinner'); // 19:00
});
test('suggestions come from nearby places, searched places or typed names, without duplicates', () => {
  const place = suggestionFrom({
    kind: 'place',
    id: 'place:1',
    name: 'Kopi Corner',
    category: 'cafe',
    lat: 1,
    lng: 2
  });
  assert.equal(place.name, 'Kopi Corner');
  assert.equal(place.refId, 'place:1');
  // a place picked from search keeps its address and pin; a typed name has neither
  const searched = suggestionFrom({
    name: 'Maxwell Food Centre',
    address: '1 Kadayanallur Street',
    lat: 1.28,
    lng: 103.84
  });
  assert.deepEqual([searched.kind, searched.address, searched.lat, searched.lng], ['custom', '1 Kadayanallur Street', 1.28, 103.84]);
  assert.deepEqual([suggestionFrom({
    name: 'Lau Pa Sat'
  }).lat, suggestionFrom({
    name: 'Lau Pa Sat'
  }).address], [null, null]);
  const plan = emptyPlan();
  plan.before.suggestions.push({
    ...place,
    id: 's1'
  });
  assert.equal(suggestionErrors(plan, 'before', place), 'That place is already suggested.');
  assert.equal(suggestionErrors(plan, 'after', place), '');
  assert.equal(suggestionErrors(plan, 'before', suggestionFrom({
    name: '  '
  })), 'Name the place you have in mind.');
  assert.equal(suggestionErrors(plan, 'during', place), 'Choose before or after the event.');
});
test('slotCells gives twelve 15-minute cells each side, leaving a walk gap', () => {
  const before = slotCells(event, 'before');
  assert.equal(before.length, 12);
  assert.equal(before[0], '2026-12-05T01:45:00.000Z'); // 3h15 before 05:00
  assert.equal(before[11], '2026-12-05T04:30:00.000Z'); // last cell ends 04:45
  assert.equal(slotCells(event, 'after')[0], '2026-12-05T07:15:00.000Z');
  assert.equal(availabilityError(event, 'before', ['2026-12-05T09:00:00.000Z']), 'Those times are outside the planner. Refresh and try again.');
  assert.equal(availabilityError(event, 'before', before.slice(2)), '');
});
test('fitSlots picks the longest stretch with the most people free', () => {
  const before = slotCells(event, 'before');
  const availability = {
    a: {
      before: before.slice(4)
    },
    b: {
      before: before.slice(6, 10)
    },
    c: {
      before: []
    }
  };
  const f = fitSlots(event, availability, ['a', 'b', 'c', 'd']);
  assert.equal(f.before.start, before[6]); // a and b both free in cells 6–9
  assert.equal(f.before.end, '2026-12-05T04:15:00.000Z');
  assert.deepEqual(f.before.coming, ['a', 'b']);
  assert.deepEqual(f.before.cant, ['c']);
  assert.deepEqual(f.before.noReply, ['d']);
  assert.deepEqual(f.before.cells[6].free, ['a', 'b']);
  // nobody marked: the default hour
  assert.equal(f.after.fitted, false);
  assert.equal(f.after.start, slotTimes(event).after.start);
});
test('isOfficialEvent keeps groups and older hangout rows out of event lists', async () => {
  const {
    isOfficialEvent,
    isPrivateGroup
  } = await import('../groups.js');
  const group = groupEventData(event, {
    visibility: 'private',
    token: 'abc'
  });
  assert.equal(isOfficialEvent(event), true);
  assert.equal(isOfficialEvent({
    ...event,
    kind: 'official'
  }), true);
  assert.equal(isOfficialEvent(group), false);
  assert.equal(isOfficialEvent({
    ...event,
    kind: 'hangout'
  }), false);
  assert.equal(isPrivateGroup(group), true);
});
test('saved demo data with hangout-shaped groups is upgraded to kind group', async () => {
  const {
    addSampleGroups
  } = await import('../mockData.js');
  const old = {
    ...groupEventData(event, {
      token: 'tok'
    }),
    id: 'g9',
    status: 'published'
  };
  old.kind = 'hangout';
  old.hangout = {
    mode: 'group',
    stage: 'planning',
    ...old.group
  };
  delete old.group;
  const db = {
    events: [event, old],
    rsvps: [],
    groupComments: []
  };
  addSampleGroups(db);
  const g = db.events.find(e => e.id === 'g9');
  assert.equal(g.kind, 'group');
  assert.deepEqual(g.group, {
    visibility: 'public',
    inviteToken: 'tok',
    eventId: 'e1'
  });
  assert.equal(g.hangout, undefined);
});
test('settingsErrors checks visibility, who can join, spots against members, and the note', async () => {
  const {
    settingsErrors
  } = await import('../groups.js');
  assert.deepEqual(settingsErrors({
    visibility: 'private',
    joinMode: 'approval',
    capacity: 4,
    note: ''
  }, 3), []);
  assert.deepEqual(settingsErrors({
    visibility: 'x',
    joinMode: 'auto',
    capacity: 2,
    note: 'a'.repeat(201)
  }, 3).map(e => e.field), ['visibility', 'joinMode', 'capacity', 'note']);
  assert.match(settingsErrors({
    visibility: 'public',
    joinMode: 'open',
    capacity: 2
  }, 3)[0].message, /3 people are already in/);
});
test('countdownLabel says when the event is, in Singapore days', async () => {
  const {
    countdownLabel
  } = await import('../groups.js');
  const now = new Date('2026-11-05T02:00:00Z'); // 10 am in singapore
  assert.equal(countdownLabel('2026-11-05T03:00:00Z', now), 'In 1h');
  assert.equal(countdownLabel('2026-11-05T12:00:00Z', now), 'Today');
  assert.equal(countdownLabel('2026-11-05T17:00:00Z', now), 'Tomorrow'); // 1 am the next day in singapore
  assert.equal(countdownLabel('2026-11-09T12:00:00Z', now), 'In 4 days');
  assert.equal(countdownLabel('2026-11-01T12:00:00Z', now), 'Happening now');
});
test('demo data version 6 adds friends, friends-only groups, an invite and a host request', async () => {
  const {
    createSeedData
  } = await import('../mockData.js');
  const db = createSeedData();
  assert.ok(db.users.find(u => u.id === 'u2').username);
  assert.ok(db.friendships.some(f => f.status === 'accepted' && f.a === 'u1' && f.b === 'u2'));
  const invite = db.groupInvites.find(i => i.userId === 'u1');
  if (invite) assert.equal(db.events.find(e => e.id === invite.groupId).group.visibility, 'private');
  const request = db.rsvps.find(r => r.eventId === 'grp6' && r.status === 'pending');
  if (request) assert.ok(request.message.length > 0);
});
