// small helper functions shared by several pages.

// ---------- rsvp rules (used by the pages and by both backends: mockapi + supabaseapi) ----------

// how long someone has to accept a waitlist offer

export const OFFER_HOURS = 24;

// rsvps that still hold or want a place at the event

export const ACTIVE_STATUSES = ['pending', 'confirmed', 'waitlisted', 'offered'];
// rsvps that count as "you've joined" for the clash warning

export const JOINED_STATUSES = ['pending', 'confirmed', 'offered'];
// rsvps that are over

export const CLOSED_STATUSES = ['rejected', 'cancelled', 'declined', 'expired'];

// ---------- dates and times ----------

// "sat, 18 oct 2026, 7:00 pm – 10:00 pm"

export function formatEventTime(event) {
  if (!event.startTime || !event.endTime) return 'Date and time not set';
  const start = new Date(event.startTime);
  const end = new Date(event.endTime);
  const dayFormat = {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  };
  const timeFormat = {
    hour: 'numeric',
    minute: '2-digit'
  };
  const day = start.toLocaleDateString('en-SG', dayFormat);
  const from = start.toLocaleTimeString('en-SG', timeFormat);
  const to = end.toLocaleTimeString('en-SG', timeFormat);
  // multi-day events also name the end date, so "thu 5 pm – sun 5 pm" doesn't read as one evening
  if (start.toDateString() !== end.toDateString()) {
    return `${day}, ${from} – ${end.toLocaleDateString('en-SG', dayFormat)}, ${to}`;
  }
  return `${day}, ${from} – ${to}`;
}

// "14 oct 2026, 1:05 am" — used for "when did they rsvp"

export function formatShortDateTime(isoString) {
  const d = new Date(isoString);
  const day = d.toLocaleDateString('en-SG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
  const time = d.toLocaleTimeString('en-SG', {
    hour: 'numeric',
    minute: '2-digit'
  });
  return `${day}, ${time}`;
}

// how long until an offer expires: "23h 15m", "40m" or "expired"

export function formatTimeLeft(expiresAt, now) {
  const msLeft = new Date(expiresAt) - now;
  if (msLeft <= 0) return 'expired';
  const hours = Math.floor(msLeft / (60 * 60 * 1000));
  const minutes = Math.floor(msLeft % (60 * 60 * 1000) / (60 * 1000));
  // in the last hour the seconds matter, so the countdown shows them.
  const seconds = Math.floor(msLeft % (60 * 1000) / 1000);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

// <input type="datetime-local"> wants "2026-10-14t19:30" (local time, no seconds)

export function toDateTimeInputValue(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// two events clash if each one starts before the other ends.
// example: a 7pm–10pm and b 8pm–9pm → 7pm < 9pm and 8pm < 10pm → clash.
// back-to-back (a ends 8pm, b starts 8pm) is not a clash.

export function eventsOverlap(a, b) {
  return new Date(a.startTime) < new Date(b.endTime) && new Date(b.startTime) < new Date(a.endTime);
}

// progress bar colour by how full an event is: green → amber from 80% → red when full.
// the colour lets organisers spot busy events at a glance without reading the numbers.

export function fillColour(percent) {
  if (percent >= 100) return 'bg-danger';
  if (percent >= 80) return 'bg-warning';
  return 'bg-success';
}

// ---------- tags ----------

// same categories, in the same order, as discover's category chips.

export const TAG_OPTIONS = ['tech', 'music', 'sports', 'arts', 'food', 'volunteering', 'career', 'outdoors', 'gaming', 'wellness', 'others' // for events that fit none of the above; always last, never suggested
];

// words that hint at each tag. a word in the title/description that starts with one of
// these suggests the tag, e.g. "coding" starts with "cod" → tech.

const TAG_KEYWORDS = {
  music: ['music', 'acoustic', 'band', 'concert', 'jam', 'sing', 'choir', 'guitar'],
  sports: ['sport', 'futsal', 'football', 'soccer', 'run', 'basketball', 'badminton', 'gym'],
  tech: ['tech', 'cod', 'program', 'vue', 'javascript', 'hackathon', 'data', 'software'],
  career: ['career', 'resume', 'interview', 'internship', 'networking', 'job'],
  arts: ['art', 'paint', 'pottery', 'craft', 'drawing', 'photo'],
  food: ['food', 'cook', 'bak', 'dinner', 'lunch', 'potluck', 'brunch'],
  volunteering: ['volunteer', 'charity', 'community', 'donat', 'cleanup'],
  outdoors: ['outdoor', 'hike', 'hiking', 'park', 'trail', 'beach', 'cycling', 'nature'],
  gaming: ['game', 'gaming', 'esport'],
  wellness: ['wellness', 'yoga', 'meditat', 'mindful', 'pilates', 'mental'],
  others: []
};

export function suggestTags(text) {
  // "acoustic night @ smu!" → ["acoustic", "night", "smu"]
  const words = text.toLowerCase().split(/[^a-z]+/).filter(w => w !== '');
  return TAG_OPTIONS.filter(tag => TAG_KEYWORDS[tag].some(keyword => words.some(word => word.startsWith(keyword))));
}

// onemap returns addresses in capitals ("30 victoria street singapore 187996").
// show them in normal case; leave mixed-case text and known short names alone.

const ADDRESS_ACRONYMS = new Set(['SMU', 'NUS', 'NTU', 'SUTD', 'SUSS', 'SIM', 'MRT', 'LRT', 'CBD', 'SIS', 'SCIS', 'YMCA', 'NEX', 'UOB', 'OCBC', 'DBS']);

export function formatAddress(address) {
  const text = String(address || '').trim();
  if (!text || /[a-z]/.test(text)) return text;
  return text.split(/(\s+)/).map(word => {
    if (/^\s+$/.test(word) || /\d/.test(word) || ADDRESS_ACRONYMS.has(word.replace(/[^A-Z]/g, ''))) return word;
    return word.charAt(0) + word.slice(1).toLowerCase();
  }).join('');
}
