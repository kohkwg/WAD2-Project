import test from 'node:test';
import assert from 'node:assert/strict';
import { formatEventTime, formatShortDateTime } from '../helpers.js';

// local-time date constructors keep these cases independent of the machine's time zone.

const at = (day, hour, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();
test('same-day events show one date and a time range', () => {
  const text = formatEventTime({
    startTime: at(22, 14),
    endTime: at(22, 17)
  });
  assert.match(text, /22 Oct 2026/);
  assert.equal(text.match(/Oct/g).length, 1);
});
test('multi-day events also show the end date', () => {
  const text = formatEventTime({
    startTime: at(22, 17, 54),
    endTime: at(25, 17, 54)
  });
  assert.match(text, /22 Oct 2026.*–.*25 Oct 2026/);
});
test('RSVP timestamps also show the year', () => {
  assert.match(formatShortDateTime(at(14, 1, 5)), /14 Oct 2026/);
});
test('missing times keep the existing placeholder', () => {
  assert.equal(formatEventTime({
    startTime: '',
    endTime: ''
  }), 'Date and time not set');
});
