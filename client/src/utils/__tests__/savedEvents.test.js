import test from 'node:test';
import assert from 'node:assert/strict';
import { savedEventState, sortSavedEvents } from '../rsvpOverview.js';

// 2 nov 2026, 18:00 in singapore

const NOW = Date.parse('2026-11-02T10:00:00Z');

const HOUR = 3600000;

const event = (startOffsetHours, extra = {}) => ({
  id: `e${startOffsetHours}`,
  status: 'published',
  capacity: 20,
  spotsLeft: 12,
  startTime: new Date(NOW + startOffsetHours * HOUR).toISOString(),
  endTime: new Date(NOW + (startOffsetHours + 2) * HOUR).toISOString(),
  ...extra
});
test('open events lead to RSVP with a Singapore-day timing badge', () => {
  assert.deepEqual(savedEventState(event(3), null, NOW), {
    ended: false,
    badge: 'Starts today',
    action: {
      label: 'RSVP',
      hash: '#rsvp',
      primary: true
    }
  });
  assert.equal(savedEventState(event(8), null, NOW).badge, 'Starts tomorrow'); // 02:00 on 3 nov in singapore
  assert.equal(savedEventState(event(24 * 4), null, NOW).badge, 'Starts in 4 days');
  assert.equal(savedEventState(event(24 * 30), null, NOW).badge, '');
  assert.equal(savedEventState(event(-1), null, NOW).badge, 'Happening now');
});
test('availability outranks timing, and full events offer the waitlist', () => {
  assert.equal(savedEventState(event(3, {
    spotsLeft: 1
  }), null, NOW).badge, '1 spot left');
  assert.equal(savedEventState(event(3, {
    spotsLeft: 4
  }), null, NOW).badge, '4 spots left');
  assert.deepEqual(savedEventState(event(3, {
    spotsLeft: 0
  }), null, NOW).action, {
    label: 'Join waitlist',
    hash: '#waitlist',
    primary: true
  });
  assert.equal(savedEventState(event(3, {
    capacity: null,
    spotsLeft: null
  }), null, NOW).badge, 'Starts today');
});
test('your own RSVP replaces the RSVP button', () => {
  assert.deepEqual(savedEventState(event(48), 'confirmed', NOW), {
    ended: false,
    badge: "You're going",
    action: {
      label: 'View your RSVP',
      hash: ''
    }
  });
  assert.equal(savedEventState(event(48, {
    spotsLeft: 0
  }), 'waitlisted', NOW).badge, 'On the waitlist');
  assert.equal(savedEventState(event(48), 'offered', NOW).action.label, 'Review offer');
  // closed rsvps (cancelled, declined…) fall back to the event's own state
  assert.equal(savedEventState(event(48), 'cancelled', NOW).action.label, 'RSVP');
});
test('ended and cancelled events only offer a look', () => {
  assert.deepEqual(savedEventState(event(-5), 'confirmed', NOW), {
    ended: true,
    badge: 'Ended',
    action: {
      label: 'View event',
      hash: ''
    }
  });
  assert.equal(savedEventState(event(48, {
    status: 'cancelled'
  }), null, NOW).badge, 'Cancelled');
});
test('upcoming saves come first, soonest first; closed ones follow, most recent first', () => {
  const rows = [event(-50), event(72), event(-5), event(5), event(10, {
    status: 'cancelled'
  })];
  assert.deepEqual(sortSavedEvents(rows, NOW).map(row => row.id), ['e5', 'e72', 'e10', 'e-5', 'e-50']);
});
