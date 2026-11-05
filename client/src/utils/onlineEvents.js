// online events and hidden capacity (5 november). the demo backend, the live backend, the
// create event wizard and the event page all use these rules, so both modes store and show
// the same thing. the database mirrors them in 20261105120000_online_events_hidden_capacity.sql.
// pure functions, no vue.

import { toDateTimeInputValue } from './helpers.js';

export const ONLINE_VENUE_NAME = 'Online';

// what an online event shows wherever a venue is shown. it has no address or map position, so
// maps, directions and the weather check leave it out. never stored: online events have no venue.

export const onlineVenue = () => ({
  name: ONLINE_VENUE_NAME,
  address: '',
  postal: '',
  lat: null,
  lng: null
});

// events saved before these options existed are physical, with their capacity shown.

export function applyEventDefaults(event) {
  event.isOnline = Boolean(event.isOnline);
  event.hideCapacity = Boolean(event.hideCapacity);
  if (event.isOnline) {
    event.venue = null;
    event.backupVenue = null;
    event.isOutdoor = false;
  }
  return event;
}

// same rule as the database check on event_online_links.url: a full https:// address
// without a user name or password in it.

const MEETING_URL = /^https:\/\/[^/\s?#@]+([/?#][^\s<>]*)?$/;

export const MAX_LINK_LENGTH = 2048;

export function isMeetingUrl(value) {
  const text = String(value ?? '').trim();
  if (!text || text.length > MAX_LINK_LENGTH || !MEETING_URL.test(text)) return false;
  try {
    return new URL(text).protocol === 'https:';
  } catch {
    return false;
  }
}

// the link part of the create event form. a blank link is allowed: the organiser can add it
// later from manage event → edit event. a link needs a time to appear, before the event ends.

export function onlineLinkErrors(link, endTime) {
  const url = String(link?.url ?? '').trim();
  if (!url) return [];
  const errors = [];
  if (!isMeetingUrl(url)) errors.push('Enter the online link as a full https:// address, e.g. https://zoom.us/j/123456.');
  const reveal = Date.parse(link.revealAt);
  const end = Date.parse(endTime);
  if (!Number.isFinite(reveal)) errors.push('Choose when the online link appears to confirmed attendees.');else if (Number.isFinite(end) && reveal > end) errors.push('The online link has to appear before the event ends.');
  return errors;
}

// suggested reveal time: 15 minutes before the start, as a datetime-local value.

export function defaultRevealTime(startTime) {
  const start = Date.parse(startTime);
  return Number.isFinite(start) ? toDateTimeInputValue(new Date(start - 15 * 60000)) : '';
}

// who can open the link: the organiser always; confirmed attendees once the reveal time has
// passed; nobody else. mirrors public.event_online_access. physical events have no link (null).
// link = { url, revealat } or null; rsvpstatus = the viewer's own rsvp status, if any.

export function onlineAccess({
  event,
  link,
  isOrganiser = false,
  rsvpStatus = null,
  now = Date.now()
}) {
  if (!event?.isOnline) return null;
  if (!link) return {
    hasLink: false,
    revealAt: null,
    url: null
  };
  const revealed = Date.parse(link.revealAt) <= now;
  const canOpen = isOrganiser || rsvpStatus === 'confirmed' && revealed;
  return {
    hasLink: true,
    revealAt: link.revealAt,
    url: canOpen ? link.url : null
  };
}

// hidden capacity: people outside the event's team see whether it is full, never the numbers.
// full shows as 0 spots left; otherwise the numbers are unknown (null), which every card already
// leaves out. the organiser and their team keep the real numbers.

export function hideCapacityNumbers(event) {
  if (!event?.hideCapacity) return event;
  const full = event.spotsLeft != null && event.spotsLeft <= 0;
  return {
    ...event,
    capacity: null,
    spotsLeft: full ? 0 : null
  };
}

// go together groups meet at the event's venue, so online events can't have them.
// the same wording as public.create_group.

export const ONLINE_GROUP_ERROR = 'Go together groups are for in-person events, so online events can’t have one.';

// whether new rsvps go to the waitlist. unknown or unlimited spots (null) are not full.

export const isEventFull = event => event?.spotsLeft != null && event.spotsLeft <= 0;
