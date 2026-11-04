import { CLOSED_STATUSES } from './helpers.js'

export function eventEnded(event, now) {
  const end = Date.parse(event.endTime || event.end_time || event.ends_at)
  return Number.isFinite(end) && end <= now
}

export function groupRsvps(rows, now) {
  const upcoming = [], past = [], cancelled = []
  for (const row of rows) {
    if (!row.event) continue
    const expiredOffer = row.status === 'offered'
      && !(Date.parse(row.offerExpiresAt) > now)
    if (CLOSED_STATUSES.includes(row.status) || expiredOffer) {
      cancelled.push(expiredOffer ? { ...row, status: 'expired' } : row)
    } else if (eventEnded(row.event, now)) past.push(row)
    else if (['confirmed', 'pending', 'waitlisted', 'offered'].includes(row.status)) upcoming.push(row)
  }
  upcoming.sort((a, b) => Date.parse(a.event.startTime) - Date.parse(b.event.startTime))
  past.sort((a, b) => Date.parse(b.event.endTime) - Date.parse(a.event.endTime))
  return { upcoming, past, cancelled, next: upcoming.find(row => row.status === 'confirmed') || null }
}

export function directionsUrl(event) {
  const venue = event.venue
  if (!venue) return ''
  const query = Number.isFinite(venue.lat) && Number.isFinite(venue.lng)
    ? `${venue.lat},${venue.lng}` : venue.address
  return query ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}` : ''
}

const escapeIcs = value => String(value || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')
const stamp = value => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

export function eventCalendar(event, now = Date.now()) {
  const start = Date.parse(event.startTime), end = Date.parse(event.endTime)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bookedz//Events//EN',
    'BEGIN:VEVENT', `UID:${escapeIcs(event.id)}@bookedz`, `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${escapeIcs(event.title)}`,
    `LOCATION:${escapeIcs([event.venue?.name, event.venue?.address].filter(Boolean).join(', '))}`,
    `DESCRIPTION:${escapeIcs(event.description)}`, 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n')
}
