import { test } from 'vitest';
import { expect } from './expect.js';
import { applyEventDefaults, defaultRevealTime, hideCapacityNumbers, isEventFull, isMeetingUrl, onlineAccess, onlineLinkErrors } from '../onlineEvents.js';
import { blankEventForm, errorsForStep } from '../eventForm.js';
import { describeEventChanges } from '../eventChanges.js';
import { TAG_OPTIONS, suggestTags } from '../helpers.js';

// online events, hidden capacity and the others tag (5 november). the database check
// server/checks/online-events-db.check.mjs covers the same rules in sql.

const now = new Date(2026, 10, 3, 10, 0);

const valid = () => ({
  ...blankEventForm(),
  title: 'Online talk',
  startTime: '2026-11-10T19:00',
  endTime: '2026-11-10T21:00',
  tags: ['others']
});
test('Others is the last tag and is never suggested', () => {
  expect(TAG_OPTIONS.at(-1)).toBe('others');
  expect(suggestTags('others other things')).toEqual([]);
});
test('older events become physical with capacity shown; online events drop any venue', () => {
  expect(applyEventDefaults({
    id: 'e1',
    venue: {
      name: 'Hall'
    }
  })).toEqual({
    id: 'e1',
    venue: {
      name: 'Hall'
    },
    isOnline: false,
    hideCapacity: false
  });
  const online = applyEventDefaults({
    isOnline: true,
    venue: {
      name: 'Hall'
    },
    backupVenue: {
      name: 'Tent'
    },
    isOutdoor: true
  });
  expect(online.venue).toBe(null);
  expect(online.backupVenue).toBe(null);
  expect(online.isOutdoor).toBe(false);
});
test('meeting links must be full https addresses without a user name', () => {
  expect(isMeetingUrl('https://zoom.us/j/123?pwd=abc')).toBe(true);
  expect(isMeetingUrl('https://meet.google.com')).toBe(true);
  expect(isMeetingUrl('http://zoom.us/j/1')).toBe(false);
  expect(isMeetingUrl('zoom.us/j/1')).toBe(false);
  expect(isMeetingUrl('https://user:pw@zoom.us/j/1')).toBe(false);
  expect(isMeetingUrl('https://zoom.us/j/1 2')).toBe(false);
  expect(isMeetingUrl('https://zoom.us/' + 'a'.repeat(2048))).toBe(false);
});
test('an online event needs no venue; a link needs a time before the event ends', () => {
  const online = {
    ...valid(),
    isOnline: true
  };
  expect(errorsForStep(online, 2, {
    now,
    live: true
  })).toEqual([]);
  const link = (url, revealAt) => ({
    ...online,
    onlineLink: {
      url,
      revealAt
    }
  });
  expect(errorsForStep(link('https://zoom.us/j/1', '2026-11-10T18:45'), 2, {
    now
  })).toEqual([]);
  expect(errorsForStep(link('zoom.us/j/1', '2026-11-10T18:45'), 2, {
    now
  })[0]).toContain('https://');
  expect(errorsForStep(link('https://zoom.us/j/1', ''), 2, {
    now
  })).toContain('Choose when the online link appears to confirmed attendees.');
  expect(errorsForStep(link('https://zoom.us/j/1', '2026-11-10T21:30'), 2, {
    now
  })).toContain('The online link has to appear before the event ends.');
  // a physical event may leave its venue to be announced (5 november, venuereveal.js)
  expect(errorsForStep(valid(), 2, {
    now
  })).toEqual([]);
  expect(onlineLinkErrors({
    url: '  ',
    revealAt: ''
  }, '2026-11-10T21:00')).toEqual([]);
});
test('the link appears 15 minutes before the start by default', () => {
  expect(defaultRevealTime('2026-11-10T19:00')).toBe('2026-11-10T18:45');
  expect(defaultRevealTime('')).toBe('');
});
test('only the organiser, or confirmed attendees after the reveal time, get the link', () => {
  const event = {
    isOnline: true
  };
  const link = {
    url: 'https://zoom.us/j/1',
    revealAt: '2026-11-10T10:45:00.000Z'
  };
  const before = Date.parse('2026-11-10T10:00:00.000Z');
  const after = Date.parse('2026-11-10T11:00:00.000Z');
  expect(onlineAccess({
    event: {
      isOnline: false
    },
    link
  })).toBe(null);
  expect(onlineAccess({
    event,
    link: null
  })).toEqual({
    hasLink: false,
    revealAt: null,
    url: null
  });
  expect(onlineAccess({
    event,
    link,
    isOrganiser: true,
    now: before
  }).url).toBe(link.url);
  expect(onlineAccess({
    event,
    link,
    rsvpStatus: 'confirmed',
    now: before
  }).url).toBe(null);
  expect(onlineAccess({
    event,
    link,
    rsvpStatus: 'confirmed',
    now: after
  }).url).toBe(link.url);
  for (const status of ['waitlisted', 'pending', 'offered', null]) {
    expect(onlineAccess({
      event,
      link,
      rsvpStatus: status,
      now: after
    })).toEqual({
      hasLink: true,
      revealAt: link.revealAt,
      url: null
    });
  }
});
test('hidden capacity leaves participants only "full" or unknown', () => {
  const shown = {
    capacity: 20,
    spotsLeft: 5,
    hideCapacity: false
  };
  expect(hideCapacityNumbers(shown)).toBe(shown);
  expect(hideCapacityNumbers({
    ...shown,
    hideCapacity: true
  })).toEqual({
    capacity: null,
    spotsLeft: null,
    hideCapacity: true
  });
  expect(hideCapacityNumbers({
    capacity: 20,
    spotsLeft: 0,
    hideCapacity: true
  })).toEqual({
    capacity: null,
    spotsLeft: 0,
    hideCapacity: true
  });
  expect(isEventFull({
    spotsLeft: 0
  })).toBe(true);
  expect(isEventFull({
    spotsLeft: null
  })).toBe(false);
  expect(isEventFull({
    spotsLeft: 3
  })).toBe(false);
});
test('public change announcements never include the link or hidden numbers', () => {
  const before = {
    ...valid(),
    isOnline: true,
    onlineLink: {
      url: '',
      revealAt: ''
    },
    capacity: 30
  };
  const after = {
    ...before,
    onlineLink: {
      url: 'https://zoom.us/j/secret',
      revealAt: '2026-11-10T18:45'
    },
    capacity: 40,
    hideCapacity: true
  };
  const text = describeEventChanges(before, after).map(change => change.text).join('\n');
  expect(text.includes('secret')).toBe(false);
  expect(text.includes('40')).toBe(false);
  expect(text).toContain('Online link updated');
  expect(text).toContain('More spots are now available');
  expect(text).toContain('The number of spots is no longer shown');
  const venue = {
    name: 'SMU Hall',
    address: '1 Road',
    lat: 1,
    lng: 103
  };
  const moved = describeEventChanges({
    ...valid(),
    venue
  }, {
    ...valid(),
    isOnline: true,
    venue
  });
  expect(moved.map(change => change.text)).toEqual(['Now an online event']);
});
