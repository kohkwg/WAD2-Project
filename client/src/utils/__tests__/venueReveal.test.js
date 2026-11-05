import { test } from 'vitest';
import { expect } from './expect.js';
import { blankEventForm } from '../eventForm.js';
import { describeEventChanges } from '../eventChanges.js';
import { hasPlace, isStillHidden, isVenueHiddenForGroups, pendingVenue, venuePendingText, defaultVenueRevealTime, VENUE_TBA_NAME } from '../venueReveal.js';

// venues announced later (5 november): the shared rules, and the public change announcements,
// which must never name a venue that is still hidden.

const now = new Date(2026, 10, 3, 10, 0).getTime(); // 3 nov 2026, 10:00

const smu = {
  name: 'SMU Campus Green',
  address: '81 Victoria Street',
  postal: '',
  lat: 1.2966,
  lng: 103.8502
};

const hall = {
  name: 'Hidden Hall',
  address: '2 Secret Road',
  postal: '',
  lat: 1.3,
  lng: 103.85
};

const form = (extra = {}) => ({
  ...blankEventForm(),
  title: 'Supper club',
  startTime: '2026-11-10T19:00',
  endTime: '2026-11-10T21:00',
  tags: ['food'],
  ...extra
});

const texts = (before, after) => describeEventChanges(before, after, {
  now
}).map(change => change.text);
test('a pending venue has no address or map position, so maps and directions leave it out', () => {
  expect(pendingVenue()).toEqual({
    name: VENUE_TBA_NAME,
    address: '',
    postal: '',
    lat: null,
    lng: null
  });
  expect(hasPlace({
    isOnline: false,
    venuePending: true
  })).toBe(false);
  expect(hasPlace({
    isOnline: true
  })).toBe(false);
  expect(hasPlace({
    isOnline: false,
    venuePending: false
  })).toBe(true);
});
test('participants see when a hidden venue appears, or that it is still to be announced', () => {
  expect(venuePendingText({
    venueRevealAt: null
  })).toBe('Venue to be announced');
  expect(/^Venue revealed on 9 Nov 2026, 7:00\s?pm$/i.test(venuePendingText({
    venueRevealAt: '2026-11-09T19:00'
  }))).toBe(true);
  expect(defaultVenueRevealTime('2026-11-10T19:00')).toBe('2026-11-09T19:00');
  expect(isStillHidden('2026-11-09T19:00', now)).toBe(true);
  expect(isStillHidden('2026-11-01T19:00', now)).toBe(false);
  expect(isStillHidden('', now)).toBe(false);
});
test('only a hidden venue holds Go together back; no venue at all still allows groups', () => {
  expect(isVenueHiddenForGroups({
    venueRevealAt: '2026-11-09T19:00'
  })).toBe(true);
  expect(isVenueHiddenForGroups({
    venueRevealAt: null,
    venuePending: true
  })).toBe(false);
});
test('announcements never name a venue that is still hidden', () => {
  const hidden = form({
    venue: hall,
    venueRevealAt: '2026-11-09T19:00'
  });
  for (const before of [form({
    venue: smu
  }), form({
    venue: null
  }), form({
    isOnline: true
  }), form({
    venue: smu,
    venueRevealAt: '2026-11-08T19:00'
  })]) {
    const lines = texts(before, hidden);
    expect(lines.length > 0).toBe(true);
    expect(lines.some(line => line.includes('Hidden Hall') || line.includes('Secret Road'))).toBe(false);
    expect(lines.some(line => /revealed on 9 Nov 2026/.test(line))).toBe(true);
  }
  // a hidden outdoor event's rain plan stays hidden too
  const outdoor = texts(form({
    venue: smu
  }), {
    ...hidden,
    isOutdoor: true,
    backupVenue: {
      ...hall,
      name: 'Dry Room'
    }
  });
  expect(outdoor).toContain('Outdoor event; the rain plan is shared when the venue is revealed');
  expect(outdoor.some(line => line.includes('Dry Room'))).toBe(false);
  // editing something else leaves the hidden venue out of the announcement entirely
  expect(texts(hidden, {
    ...hidden,
    title: 'Supper club II'
  })).toEqual(['New name: “Supper club II”']);
});
test('revealing, announcing and removing a venue read naturally', () => {
  const hidden = form({
    venue: hall,
    venueRevealAt: '2026-11-09T19:00'
  });
  expect(texts(hidden, form({
    venue: hall
  }))).toEqual(['Venue revealed: Hidden Hall']);
  expect(texts(form({
    venue: null
  }), form({
    venue: smu
  }))).toEqual(['Venue announced: SMU Campus Green']);
  expect(texts(form({
    venue: smu
  }), form({
    venue: null
  }))).toEqual(['Venue to be announced']);
  expect(texts(form({
    isOnline: true
  }), form({
    venue: null
  }))).toEqual(['Now in person; venue to be announced']);
  expect(texts(form({
    venue: smu
  }), form({
    venue: hall
  }))).toEqual(['Venue: SMU Campus Green → Hidden Hall']);
  expect(texts(form({
    venue: null
  }), form({
    venue: null
  }))).toEqual([]);
});
