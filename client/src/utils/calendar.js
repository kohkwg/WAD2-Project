// Confirmed-plan handoff: an iCalendar file (RFC 5545) and copyable text.
// Neither implies a booking; both say so.

const pad = n => String(n).padStart(2, '0')
const icsDate = ms => { const d = new Date(ms); return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z` }
const escapeText = value => String(value ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
// Lines longer than 75 characters continue on the next line after a space.
function fold(line) {
  const parts = []
  for (let i = 0; i < line.length; i += 74) parts.push((i ? ' ' : '') + line.slice(i, i + 74))
  return parts.join('\r\n')
}

export function buildIcs({ title, stops, url = '', meetingPoint = '', now = Date.now() }) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bookedz//Hangout plan//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']
  stops.forEach((stop, i) => {
    const notes = [`Stop ${i + 1} of ${stops.length} in “${title}”.`, meetingPoint && i === 0 ? `Meet at: ${meetingPoint}` : '', 'Not booked: RSVP to Bookedz events separately.', url].filter(Boolean).join('\n')
    lines.push('BEGIN:VEVENT', `UID:${stop.id}@bookedz-hangout`, `DTSTAMP:${icsDate(now)}`, `DTSTART:${icsDate(stop.start)}`, `DTEND:${icsDate(stop.end)}`,
      `SUMMARY:${escapeText(`${title}: ${stop.title}`)}`, `LOCATION:${escapeText(stop.venueName || '')}`, `DESCRIPTION:${escapeText(notes)}`, 'END:VEVENT')
  })
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

export function planText({ title, stops, url = '', meetingPoint = '' }) {
  const time = ms => new Date(ms).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Singapore' })
  const day = stops.length ? new Date(stops[0].start).toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Singapore' }) : ''
  return [
    `${title}${day ? `: ${day}` : ''}`,
    meetingPoint ? `Meet at: ${meetingPoint}` : '',
    ...stops.map((s, i) => `${i + 1}. ${time(s.start)}–${time(s.end)} ${s.title}${s.venueName ? ` @ ${s.venueName}` : ''}`),
    'Not booked: RSVP to Bookedz events separately.',
    url,
  ].filter(Boolean).join('\n')
}

export const directionsUrl = stop => `https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}&travelmode=transit`
