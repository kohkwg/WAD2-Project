import { test } from 'vitest';
import assert from 'node:assert/strict';
import { blankHangout, hangoutStepErrors, hangoutEventData, joinOutcome, inclusiveDays, sgToday, isPrivateHangout } from '../hangouts.js';

const now = new Date('2026-11-03T02:00:00Z'); // 10:00 in singapore

const fields = errors => errors.map(e => e.field);
test('Singapore dates: today and inclusive day counts', () => {
  assert.equal(sgToday(new Date('2026-11-03T17:30:00Z')), '2026-11-04');
  assert.equal(inclusiveDays('2026-11-05', '2026-11-11'), 7);
});
test('basics need a title, at most 200-char description and 1–5 interests', () => {
  const form = blankHangout();
  assert.deepEqual(fields(hangoutStepErrors(form, 1, now)), ['title', 'interests']);
  Object.assign(form, {
    title: 'x'.repeat(61),
    description: 'y'.repeat(201),
    interests: ['tech', 'music', 'food', 'arts', 'sports', 'gaming']
  });
  assert.deepEqual(fields(hangoutStepErrors(form, 1, now)), ['title', 'description', 'interests']);
});
test('group ranges are at most seven days and never in the past', () => {
  const form = {
    ...blankHangout(),
    startDate: '2026-11-02',
    endDate: '2026-11-04'
  };
  assert.deepEqual(fields(hangoutStepErrors(form, 2, now)), ['startDate']);
  Object.assign(form, {
    startDate: '2026-11-05',
    endDate: '2026-11-12'
  });
  assert.deepEqual(fields(hangoutStepErrors(form, 2, now)), ['endDate']);
  Object.assign(form, {
    endDate: '2026-11-11'
  });
  assert.deepEqual(hangoutStepErrors(form, 2, now), []);
});
test('fixed slots are 1–12 hours in the future; public capacity is 2–8', () => {
  const form = {
    ...blankHangout(),
    mode: 'public',
    date: '2026-11-03',
    startTime: '09:00',
    endTime: '09:30',
    capacity: 9
  };
  assert.deepEqual(fields(hangoutStepErrors(form, 2, now)), ['startTime', 'endTime', 'capacity']);
  Object.assign(form, {
    startTime: '14:00',
    endTime: '18:00',
    capacity: 4
  });
  assert.deepEqual(hangoutStepErrors(form, 2, now), []);
  assert.deepEqual(hangoutStepErrors({
    ...form,
    mode: 'solo',
    capacity: ''
  }, 2, now), []);
});
test('the start area must have real coordinates', () => {
  assert.deepEqual(fields(hangoutStepErrors({
    ...blankHangout(),
    startArea: {
      name: 'typed',
      lat: null,
      lng: null
    }
  }, 3, now)), ['startArea']);
  assert.deepEqual(hangoutStepErrors({
    ...blankHangout(),
    startArea: {
      name: 'Bugis',
      lat: 1.3,
      lng: 103.85
    }
  }, 3, now), []);
});
test('event data: group spans its days with an invite token; solo has a fixed slot', () => {
  const base = {
    ...blankHangout(),
    title: ' Makan ',
    interests: ['food'],
    startArea: {
      name: 'Bugis',
      lat: 1.3,
      lng: 103.85
    }
  };
  const group = hangoutEventData({
    ...base,
    startDate: '2026-11-05',
    endDate: '2026-11-06'
  });
  assert.equal(group.title, 'Makan');
  assert.equal(group.startTime, '2026-11-04T16:00:00.000Z');
  assert.equal(group.hangout.stage, 'collecting');
  assert.match(group.hangout.inviteToken, /^[0-9a-f]{32}$/);
  assert.equal(isPrivateHangout(group), true);
  const solo = hangoutEventData({
    ...base,
    mode: 'solo',
    date: '2026-11-05',
    startTime: '10:00',
    endTime: '14:00',
    joinMode: 'approval'
  });
  assert.equal(solo.capacity, 1);
  assert.equal(solo.joinMode, 'open');
  assert.equal(solo.hangout.inviteToken, null);
  assert.equal(solo.hangout.lockedSlot.startTime, '2026-11-05T02:00:00.000Z');
  const pub = hangoutEventData({
    ...base,
    mode: 'public',
    date: '2026-11-05',
    startTime: '10:00',
    endTime: '14:00'
  });
  assert.equal(isPrivateHangout(pub), false);
});
test('join outcome: open refuses when full, auto waitlists, approval pends', () => {
  assert.equal(joinOutcome({
    joinMode: 'open',
    capacity: 2
  }, 1), 'confirmed');
  assert.equal(joinOutcome({
    joinMode: 'open',
    capacity: 2
  }, 2), 'full');
  assert.equal(joinOutcome({
    joinMode: 'auto',
    capacity: 2
  }, 2), 'waitlisted');
  assert.equal(joinOutcome({
    requiresApproval: true,
    capacity: 2
  }, 0), 'pending');
  assert.equal(joinOutcome({
    requiresApproval: false,
    capacity: 2
  }, 0), 'confirmed');
});
