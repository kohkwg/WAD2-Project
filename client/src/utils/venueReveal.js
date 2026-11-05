// physical events whose venue is announced later (5 november). an organiser can publish with no
// venue yet, or choose it and keep it hidden until a set time before the start; afterwards it is
// an ordinary venue everyone sees. the demo backend, the live backend, the create event wizard
// and the event pages use these rules; the database mirrors them in
// 20261105150000_venue_to_be_announced.sql. pure functions, no vue.

import { toDateTimeInputValue } from './helpers.js';

export const VENUE_TBA_NAME = 'Venue to be announced';

// what a physical event without a visible venue shows wherever a venue is shown. no address or
// map position, so maps, directions, weather and go together leave it out. never stored.

export const pendingVenue = () => ({
  name: VENUE_TBA_NAME,
  address: '',
  postal: '',
  lat: null,
  lng: null
});

// a reveal time (iso or datetime-local) that is still to come

export const isStillHidden = (revealAt, now = Date.now()) => Boolean(revealAt) && Date.parse(revealAt) > now;

// whether the event has a real place people can go to (not online, venue announced)

export const hasPlace = event => Boolean(event) && !event.isOnline && !event.venuePending;

// "venue revealed on 6 nov 2026, 7:00 pm" or "venue to be announced"

export function venuePendingText(event) {
  const reveal = Date.parse(event?.venueRevealAt);
  if (!Number.isFinite(reveal)) return VENUE_TBA_NAME;
  return `Venue revealed on ${new Intl.DateTimeFormat('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(reveal))}`;
}

// suggested reveal time: a day before the start, as a datetime-local value

export function defaultVenueRevealTime(startTime) {
  const start = Date.parse(startTime);
  return Number.isFinite(start) ? toDateTimeInputValue(new Date(start - 24 * 3600e3)) : '';
}

// the venue part of the create event form for a physical event. form.venuerevealat is '' when
// the venue shows as soon as it is published. with no venue chosen there is nothing to hide and
// no rain plan: the wizard hides those controls and saves neither (see venuerevealtosave).

export function venueRevealErrors(form) {
  const errors = [];
  if (!form.venue || !form.venueRevealAt) return errors;
  const reveal = Date.parse(form.venueRevealAt);
  const start = Date.parse(form.startTime);
  if (!Number.isFinite(reveal)) errors.push('Choose when the venue is revealed.');else if (Number.isFinite(start) && reveal > start) errors.push('The venue has to be revealed before the event starts.');
  return errors;
}

// the reveal time to save: an iso time still to come, or null (shown now / nothing to hide)

export function venueRevealToSave(form, now = Date.now()) {
  if (form.isOnline || !form.venue || !isStillHidden(form.venueRevealAt, now)) return null;
  return new Date(form.venueRevealAt).toISOString();
}

// go together groups meet at the venue, so a hidden venue makes them wait (events with no venue
// at all keep allowing groups, as before). the same rule and wording as public.create_group.

export const isVenueHiddenForGroups = event => Boolean(event?.venueRevealAt);

export const HIDDEN_VENUE_GROUP_ERROR = 'Go together groups meet at the venue, so they can start once it’s revealed.';
