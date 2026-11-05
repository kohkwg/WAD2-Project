import { test } from 'vitest';
import { expect } from './expect.js';
import { blankHangout, hangoutStepErrors, hangoutFormFromEvent, hangoutChanges } from '../hangouts.js';

// hangout wizard: what each input accepts, and what editing a hangout keeps unchanged.

const now = new Date('2026-11-03T02:00:00Z'); // 10:00 in singapore

const messages = errors => errors.map(error => error.message);
test('a hangout title is required and at most 60 characters', () => {
  const form = {
    ...blankHangout(),
    interests: ['food']
  };
  expect(messages(hangoutStepErrors(form, 1, now))).toContain('Give your hangout a title.');
  expect(messages(hangoutStepErrors({
    ...form,
    title: 'x'.repeat(61)
  }, 1, now))).toContain('Keep the title to 60 characters or fewer.');
  expect(hangoutStepErrors({
    ...form,
    title: 'Jio makan'
  }, 1, now)).toEqual([]);
});
test('pick 1 to 5 interests', () => {
  const form = {
    ...blankHangout(),
    title: 'Jio makan'
  };
  expect(messages(hangoutStepErrors(form, 1, now))).toContain('Pick at least one interest.');
  const six = ['tech', 'music', 'sports', 'arts', 'food', 'gaming'];
  expect(messages(hangoutStepErrors({
    ...form,
    interests: six
  }, 1, now))).toContain('Pick up to 5 interests.');
});
test('group size is 2–8 people, including the host', () => {
  const form = {
    ...blankHangout(),
    mode: 'public',
    date: '2026-11-05',
    startTime: '14:00',
    endTime: '18:00'
  };
  expect(messages(hangoutStepErrors({
    ...form,
    capacity: 1
  }, 2, now))).toContain('Choose between 2 and 8 people, including you.');
  expect(messages(hangoutStepErrors({
    ...form,
    capacity: 9
  }, 2, now))).toContain('Choose between 2 and 8 people, including you.');
  expect(hangoutStepErrors({
    ...form,
    capacity: 8
  }, 2, now)).toEqual([]);
});

const openJio = {
  id: 'h1',
  kind: 'hangout',
  title: 'Arcade jio',
  description: 'Then supper',
  tags: ['gaming', 'food'],
  startTime: '2026-11-05T06:00:00.000Z',
  endTime: '2026-11-05T10:00:00.000Z',
  // 14:00–18:00 in singapore
  capacity: 4,
  joinMode: 'auto',
  requiresApproval: false,
  isOutdoor: false,
  backupVenue: null,
  venue: {
    name: 'Bugis Junction',
    address: '200 Victoria Street',
    lat: 1.2995,
    lng: 103.8553
  },
  hangout: {
    mode: 'public',
    visibility: 'public',
    stage: 'voting',
    dateRange: null,
    lockedSlot: {
      startTime: '2026-11-05T06:00:00.000Z',
      endTime: '2026-11-05T10:00:00.000Z'
    }
  }
};
test('editing reads a hangout back into the wizard, in Singapore time', () => {
  const form = hangoutFormFromEvent(openJio);
  expect(form.mode).toBe('public');
  expect(form.date).toBe('2026-11-05');
  expect(form.startTime).toBe('14:00');
  expect(form.endTime).toBe('18:00');
  expect(form.interests).toEqual(['gaming', 'food']);
  expect(form.startArea.name).toBe('Bugis Junction');
  expect(form.joinMode).toBe('auto');
});
test('saving an edit changes the details but keeps the time, join mode and approval', () => {
  const form = {
    ...hangoutFormFromEvent(openJio),
    title: '  Arcade jio v2 ',
    interests: ['gaming'],
    capacity: 6
  };
  const changes = hangoutChanges(openJio, form);
  expect(changes.title).toBe('Arcade jio v2');
  expect(changes.tags).toEqual(['gaming']);
  expect(changes.capacity).toBe(6);
  expect(changes.startTime).toBe(openJio.startTime);
  expect(changes.endTime).toBe(openJio.endTime);
  expect(changes.requiresApproval).toBe(false);
  expect(changes.backupVenue).toBe(null); // hangouts never get a rain backup venue
  expect(changes.questions).toEqual([]);
});
test('a solo plan keeps its size of 1', () => {
  const solo = {
    ...openJio,
    capacity: 1,
    hangout: {
      ...openJio.hangout,
      mode: 'solo',
      visibility: 'private'
    }
  };
  expect(hangoutChanges(solo, {
    ...hangoutFormFromEvent(solo),
    capacity: 6
  }).capacity).toBe(1);
});
