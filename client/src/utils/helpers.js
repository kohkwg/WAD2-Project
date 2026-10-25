// Small helper functions shared by several pages.

// ---------- RSVP rules (used by the pages AND by both backends: mockApi + supabaseApi) ----------

// How long someone has to accept a waitlist offer
export const OFFER_HOURS = 24

// RSVPs that still hold or want a place at the event
export const ACTIVE_STATUSES = ['pending', 'confirmed', 'waitlisted', 'offered']
// RSVPs that count as "you've joined" for the clash warning
export const JOINED_STATUSES = ['pending', 'confirmed', 'offered']
// RSVPs that are over
export const CLOSED_STATUSES = ['rejected', 'cancelled', 'declined', 'expired']

// ---------- Dates and times ----------

// "Sat, 18 Oct, 7:00 pm – 10:00 pm"
export function formatEventTime(event) {
  if (!event.startTime || !event.endTime) return 'Date and time not set'
  const start = new Date(event.startTime)
  const end = new Date(event.endTime)
  const dayFormat = { weekday: 'short', day: 'numeric', month: 'short' }
  const timeFormat = { hour: 'numeric', minute: '2-digit' }
  const day = start.toLocaleDateString('en-SG', dayFormat)
  const from = start.toLocaleTimeString('en-SG', timeFormat)
  const to = end.toLocaleTimeString('en-SG', timeFormat)
  // Multi-day events also name the end date, so "Thu 5 pm – Sun 5 pm" doesn't read as one evening
  if (start.toDateString() !== end.toDateString()) {
    return `${day}, ${from} – ${end.toLocaleDateString('en-SG', dayFormat)}, ${to}`
  }
  return `${day}, ${from} – ${to}`
}

// "14 Oct, 1:05 am" — used for "when did they RSVP"
export function formatShortDateTime(isoString) {
  const d = new Date(isoString)
  const day = d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
  const time = d.toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit' })
  return `${day}, ${time}`
}

// How long until an offer expires: "23h 15m", "40m" or "expired"
export function formatTimeLeft(expiresAt, now) {
  const msLeft = new Date(expiresAt) - now
  if (msLeft <= 0) return 'expired'
  const hours = Math.floor(msLeft / (60 * 60 * 1000))
  const minutes = Math.floor((msLeft % (60 * 60 * 1000)) / (60 * 1000))
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

// <input type="datetime-local"> wants "2026-10-14T19:30" (local time, no seconds)
export function toDateTimeInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

// Two events clash if each one starts before the other ends.
// Example: A 7pm–10pm and B 8pm–9pm → 7pm < 9pm and 8pm < 10pm → clash.
// Back-to-back (A ends 8pm, B starts 8pm) is NOT a clash.
export function eventsOverlap(a, b) {
  return new Date(a.startTime) < new Date(b.endTime) && new Date(b.startTime) < new Date(a.endTime)
}

// Progress bar colour by how full an event is: green → amber from 80% → red when full.
// The colour lets organisers spot busy events at a glance without reading the numbers.
export function fillColour(percent) {
  if (percent >= 100) return 'bg-danger'
  if (percent >= 80) return 'bg-warning'
  return 'bg-success'
}

// ---------- Tags ----------

export const TAG_OPTIONS = [
  'music',
  'sports',
  'tech',
  'career',
  'arts',
  'food',
  'volunteering',
  'gaming',
]

// Words that hint at each tag. A word in the title/description that STARTS WITH one of
// these suggests the tag, e.g. "coding" starts with "cod" → tech.
const TAG_KEYWORDS = {
  music: ['music', 'acoustic', 'band', 'concert', 'jam', 'sing', 'choir', 'guitar'],
  sports: ['sport', 'futsal', 'football', 'soccer', 'run', 'basketball', 'badminton', 'gym'],
  tech: ['tech', 'cod', 'program', 'vue', 'javascript', 'hackathon', 'data', 'software'],
  career: ['career', 'resume', 'interview', 'internship', 'networking', 'job'],
  arts: ['art', 'paint', 'pottery', 'craft', 'drawing', 'photo'],
  food: ['food', 'cook', 'bak', 'dinner', 'lunch', 'potluck', 'brunch'],
  volunteering: ['volunteer', 'charity', 'community', 'donat', 'cleanup'],
  gaming: ['game', 'gaming', 'esport'],
}

export function suggestTags(text) {
  // "Acoustic Night @ SMU!" → ["acoustic", "night", "smu"]
  const words = text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w !== '')
  return TAG_OPTIONS.filter((tag) =>
    TAG_KEYWORDS[tag].some((keyword) => words.some((word) => word.startsWith(keyword))),
  )
}
