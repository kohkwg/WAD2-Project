import { CLOSED_STATUSES } from './helpers.js';

export function eventEnded(event, now) {
  const end = Date.parse(event.endTime || event.end_time || event.ends_at);
  return Number.isFinite(end) && end <= now;
}

export function groupRsvps(rows, now) {
  const upcoming = [],
    past = [],
    cancelled = [];
  for (const row of rows) {
    if (!row.event) continue;
    const expiredOffer = row.status === 'offered' && !(Date.parse(row.offerExpiresAt) > now);
    if (CLOSED_STATUSES.includes(row.status) || expiredOffer) {
      cancelled.push(expiredOffer ? {
        ...row,
        status: 'expired'
      } : row);
    } else if (eventEnded(row.event, now)) past.push(row);else if (['confirmed', 'pending', 'waitlisted', 'offered'].includes(row.status)) upcoming.push(row);
  }
  upcoming.sort((a, b) => Date.parse(a.event.startTime) - Date.parse(b.event.startTime));
  past.sort((a, b) => Date.parse(b.event.endTime) - Date.parse(a.event.endTime));
  return {
    upcoming,
    past,
    cancelled,
    next: upcoming.find(row => row.status === 'confirmed') || null
  };
}

// singapore calendar day number, so "starts tomorrow" doesn't depend on the device's time zone

const sgDay = ms => Math.floor((ms + 8 * 3600000) / 86400000);

const ACTIVE_RSVP = {
  confirmed: {
    badge: "You're going",
    action: {
      label: 'View your RSVP',
      hash: ''
    }
  },
  pending: {
    badge: 'Pending approval',
    action: {
      label: 'View your RSVP',
      hash: ''
    }
  },
  waitlisted: {
    badge: 'On the waitlist',
    action: {
      label: 'View your RSVP',
      hash: ''
    }
  },
  offered: {
    badge: 'Spot offered to you',
    action: {
      label: 'Review offer',
      hash: '#rsvp',
      primary: true
    }
  }
};

const FEW_SPOTS = 5;

// one badge (why to act now) and one main action for a saved event card. your own rsvp comes first,
// then availability, then timing. labels match eventcardactions on discover.

export function savedEventState(event, rsvpStatus = null, now = Date.now()) {
  if (event.status === 'cancelled') return {
    ended: true,
    badge: 'Cancelled',
    action: {
      label: 'View event',
      hash: ''
    }
  };
  if (eventEnded(event, now) || event.status === 'completed') return {
    ended: true,
    badge: 'Ended',
    action: {
      label: 'View event',
      hash: ''
    }
  };
  if (ACTIVE_RSVP[rsvpStatus]) return {
    ended: false,
    ...ACTIVE_RSVP[rsvpStatus]
  };
  const limited = event.capacity != null && Number.isFinite(Number(event.spotsLeft));
  const spots = limited ? Math.max(0, Number(event.spotsLeft)) : null;
  if (spots === 0) return {
    ended: false,
    badge: 'Full · waitlist open',
    action: {
      label: 'Join waitlist',
      hash: '#waitlist',
      primary: true
    }
  };
  const rsvp = {
    label: 'RSVP',
    hash: '#rsvp',
    primary: true
  };
  if (spots != null && spots <= FEW_SPOTS) return {
    ended: false,
    badge: `${spots} ${spots === 1 ? 'spot' : 'spots'} left`,
    action: rsvp
  };
  const start = Date.parse(event.startTime);
  if (!Number.isFinite(start)) return {
    ended: false,
    badge: '',
    action: rsvp
  };
  if (start <= now) return {
    ended: false,
    badge: 'Happening now',
    action: rsvp
  };
  const days = sgDay(start) - sgDay(now);
  const badge = days === 0 ? 'Starts today' : days === 1 ? 'Starts tomorrow' : days <= 13 ? `Starts in ${days} days` : '';
  return {
    ended: false,
    badge,
    action: rsvp
  };
}

// upcoming saves first (soonest first), then ended or cancelled ones (most recent first)

export function sortSavedEvents(events, now = Date.now()) {
  const closed = event => event.status === 'cancelled' || event.status === 'completed' || eventEnded(event, now);
  const start = event => Date.parse(event.startTime) || 0;
  return [...events].sort((a, b) => closed(a) - closed(b) || (closed(a) ? start(b) - start(a) : start(a) - start(b)) || String(a.id).localeCompare(String(b.id)));
}

export function directionsUrl(event) {
  const venue = event.venue;
  if (!venue || event.isOnline) return ''; // online events have no place to go to
  const query = Number.isFinite(venue.lat) && Number.isFinite(venue.lng) ? `${venue.lat},${venue.lng}` : venue.address;
  return query ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}` : '';
}

const escapeIcs = value => String(value || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');

const stamp = value => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function eventCalendar(event, now = Date.now()) {
  const start = Date.parse(event.startTime),
    end = Date.parse(event.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bookedz//Events//EN', 'BEGIN:VEVENT', `UID:${escapeIcs(event.id)}@bookedz`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${escapeIcs(event.title)}`, `LOCATION:${escapeIcs([event.venue?.name, event.venue?.address].filter(Boolean).join(', '))}`, `DESCRIPTION:${escapeIcs(event.description)}`, 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
}
