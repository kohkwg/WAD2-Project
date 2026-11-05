import test from 'node:test'
import checks from '../../server/tests/checks.js'
import { groupRsvps, directionsUrl, eventCalendar } from '../src/utils/rsvpOverview.js'
const { checkEqual, checkDeepEqual, checkTrue } = checks
const now = Date.parse('2026-11-02T10:00:00Z')
const event = (id, start, end) => ({ id, title: id, startTime: start, endTime: end })

test('time groups keep ongoing plans upcoming, choose earliest confirmed, and retain terminal labels', () => {
  const ongoing = event('ongoing', '2026-11-02T09:00:00Z', '2026-11-02T11:00:00Z')
  const ended = event('ended', '2026-11-01T09:00:00Z', '2026-11-02T10:00:00Z')
  const future = event('future', '2026-11-03T09:00:00Z', '2026-11-03T11:00:00Z')
  const rows = [
    { id: 'later', status: 'confirmed', event: future },
    { id: 'pending', status: 'pending', event: ongoing },
    { id: 'next', status: 'confirmed', event: ongoing },
    { id: 'past', status: 'confirmed', event: ended },
    { id: 'closed', status: 'rejected', event: ended },
    { id: 'offer', status: 'offered', offerExpiresAt: '2026-11-02T10:01:00Z', event: future },
    { id: 'expired', status: 'offered', offerExpiresAt: '2026-11-02T10:00:00Z', event: future },
    { id: 'invalid', status: 'offered', offerExpiresAt: 'invalid', event: future },
  ]
  const result = groupRsvps(rows, now)
  checkEqual(result.next.id, 'next')
  checkDeepEqual(result.past.map(row => row.id), ['past'])
  checkDeepEqual(result.cancelled.map(row => row.status), ['rejected', 'expired', 'expired'])
  checkTrue(result.upcoming.some(row => row.id === 'pending'))
  checkEqual(rows[6].status, 'offered')
})

test('directions use actual coordinates or an encoded address and omit unknown venues', () => {
  checkTrue(directionsUrl({ venue: { lat: 1.3, lng: 103.8 } }).endsWith('1.3%2C103.8'))
  checkTrue(directionsUrl({ venue: { address: '80 Stamford Road' } }).endsWith('80%20Stamford%20Road'))
  checkEqual(directionsUrl({ venue: { name: 'Venue to be confirmed' } }), '')
})

test('calendar uses real times in UTC and escapes text without injecting ICS fields', () => {
  const content = eventCalendar({ ...event('e1', '2026-11-09T18:00:00+08:00', '2026-11-09T20:00:00+08:00'), title: 'Games, friends; fun', description: 'Hello\nEND:VEVENT', venue: { name: 'Room A' } }, now)
  checkTrue(content.includes('DTSTART:20261109T100000Z\r\n'))
  checkTrue(content.includes('SUMMARY:Games\\, friends\\; fun\r\n'))
  checkTrue(content.includes('DESCRIPTION:Hello\\nEND:VEVENT\r\n'))
  checkEqual(eventCalendar({ startTime: 'invalid' }), null)
})
