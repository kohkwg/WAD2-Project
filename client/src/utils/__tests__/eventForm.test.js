import { test } from 'vitest';
import { expect } from './expect.js';
import { blankEventForm, errorsForStep } from '../eventForm.js';
import { venueRevealToSave } from '../venueReveal.js';

// create event form: what each input accepts, and the message the organiser sees when it doesn't.
// local-time dates (like the form's datetime-local values) keep these independent of time zone.

const now = new Date(2026, 10, 3, 10, 0); // 3 nov 2026, 10:00

const valid = () => ({
  ...blankEventForm(),
  title: 'Acoustic Night',
  startTime: '2026-11-10T19:00',
  endTime: '2026-11-10T21:00',
  tags: ['music']
});

const smu = {
  name: 'SMU Campus Green',
  address: '81 Victoria Street',
  lat: 1.2966,
  lng: 103.8502
};
test('a new form starts empty, with 30 places and RSVPs confirmed automatically', () => {
  const form = blankEventForm();
  expect(form.title).toBe('');
  expect(form.capacity).toBe(30);
  expect(form.tags).toEqual([]);
  expect(form.requiresApproval).toBe(false);
  expect(form.isOutdoor).toBe(false);
});
test('filled-in basics pass', () => {
  expect(errorsForStep(valid(), 1, {
    now
  })).toEqual([]);
});
test('the title is required (spaces alone do not count)', () => {
  expect(errorsForStep({
    ...valid(),
    title: '   '
  }, 1, {
    now
  })).toContain('Give your event a title.');
});
test('both start and end times are required', () => {
  expect(errorsForStep({
    ...valid(),
    endTime: ''
  }, 1, {
    now
  })).toContain('Set a start and end time.');
});
test('the end must be after the start', () => {
  expect(errorsForStep({
    ...valid(),
    endTime: '2026-11-10T18:00'
  }, 1, {
    now
  })).toContain('The end time must be after the start time.');
  expect(errorsForStep({
    ...valid(),
    endTime: '2026-11-10T19:00'
  }, 1, {
    now
  })).toContain('The end time must be after the start time.');
});
test('the event cannot start in the past', () => {
  const past = {
    ...valid(),
    startTime: '2026-11-01T19:00',
    endTime: '2026-11-01T21:00'
  };
  expect(errorsForStep(past, 1, {
    now
  })).toContain('The start time cannot be in the past.');
});
test('capacity must be a whole number of at least 1', () => {
  for (const capacity of [0, -5, 2.5, '']) {
    expect(errorsForStep({
      ...valid(),
      capacity
    }, 1, {
      now
    })).toContain('Capacity must be a whole number, at least 1.');
  }
  expect(errorsForStep({
    ...valid(),
    capacity: 1
  }, 1, {
    now
  })).toEqual([]);
});
test('at least one tag is required', () => {
  expect(errorsForStep({
    ...valid(),
    tags: []
  }, 1, {
    now
  })).toContain('Pick at least one tag (used for recommendations and waitlist scoring).');
});
test('editing cannot lower capacity below people already confirmed or offered a place', () => {
  const errors = errorsForStep({
    ...valid(),
    capacity: 3
  }, 1, {
    now,
    editing: true,
    minCapacity: 5
  });
  expect(errors).toContain("Capacity can't be lower than 5: that many people are already confirmed or offered a place.");
  expect(errorsForStep({
    ...valid(),
    capacity: 5
  }, 1, {
    now,
    editing: true,
    minCapacity: 5
  })).toEqual([]);
});
test('an older event with no capacity limit can keep it when edited', () => {
  expect(errorsForStep({
    ...valid(),
    capacity: ''
  }, 1, {
    now,
    editing: true,
    originalCapacity: ''
  })).toEqual([]);
});
test('the venue is optional: it can be announced later, with no rain plan or reveal time yet', () => {
  expect(errorsForStep({
    ...valid(),
    venue: null
  }, 2)).toEqual([]);
  expect(errorsForStep({
    ...valid(),
    venue: smu
  }, 2)).toEqual([]);
  // settings left from a cleared venue are ignored (and not saved), not shown as errors
  expect(errorsForStep({
    ...valid(),
    venue: null,
    isOutdoor: true,
    venueRevealAt: '2026-11-10T20:00'
  }, 2)).toEqual([]);
  const saved = venueRevealToSave({
    ...valid(),
    venue: null,
    venueRevealAt: '2026-11-09T19:00'
  }, now.getTime());
  expect(saved).toBe(null);
});
test('a hidden venue is revealed no later than the start', () => {
  expect(errorsForStep({
    ...valid(),
    venue: smu,
    venueRevealAt: '2026-11-09T19:00'
  }, 2)).toEqual([]);
  expect(errorsForStep({
    ...valid(),
    venue: smu,
    venueRevealAt: '2026-11-10T19:00'
  }, 2)).toEqual([]);
  expect(errorsForStep({
    ...valid(),
    venue: smu,
    venueRevealAt: '2026-11-10T19:30'
  }, 2)).toContain('The venue has to be revealed before the event starts.');
  expect(errorsForStep({
    ...valid(),
    venue: smu,
    venueRevealAt: 'not a date'
  }, 2)).toContain('Choose when the venue is revealed.');
});
test('only a reveal time still to come keeps the venue hidden', () => {
  const form = {
    ...valid(),
    venue: smu,
    venueRevealAt: '2026-11-09T19:00'
  };
  expect(venueRevealToSave(form, now.getTime())).toBe(new Date('2026-11-09T19:00').toISOString());
  expect(venueRevealToSave(form, new Date(2026, 10, 9, 19, 1).getTime())).toBe(null); // passed: shown now
  expect(venueRevealToSave({
    ...form,
    isOnline: true
  }, now.getTime())).toBe(null);
});
test('outdoor events need a rain backup venue', () => {
  expect(errorsForStep({
    ...valid(),
    venue: smu,
    isOutdoor: true
  }, 2)).toContain('Outdoor events need a backup venue in case of rain.');
  expect(errorsForStep({
    ...valid(),
    venue: smu,
    isOutdoor: true,
    backupVenue: smu
  }, 2)).toEqual([]);
});
test('live events need venues with map coordinates; demo mode does not', () => {
  const typed = {
    name: 'Somewhere',
    address: ''
  };
  expect(errorsForStep({
    ...valid(),
    venue: typed
  }, 2, {
    live: true
  })).toContain('Choose a venue result with map coordinates for live events.');
  expect(errorsForStep({
    ...valid(),
    venue: typed
  }, 2, {
    live: false
  })).toEqual([]);
});
test('every RSVP question needs wording', () => {
  const blank = {
    id: 'q1',
    text: '  ',
    type: 'text',
    required: false
  };
  expect(errorsForStep({
    ...valid(),
    questions: [blank]
  }, 3)).toContain('Every RSVP question needs some wording.');
  expect(errorsForStep({
    ...valid(),
    questions: [{
      ...blank,
      text: 'Which year are you in?'
    }]
  }, 3)).toEqual([]);
});
