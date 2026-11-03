import test from 'node:test'
import assert from 'node:assert/strict'
import { lateJoinOptions, etaMessage } from '../lateJoin.js'
import { buildIcs, planText } from '../calendar.js'
import { horizonFor, pickForecast } from '../../lib/hangoutWeather.js'

const at = t => Date.parse(`2026-11-07T${t}:00+08:00`)
const stops = [
  { id: 's1', title: 'Lunch', venueName: 'Bugis, Street', start: at('12:00'), end: at('13:00') },
  { id: 's2', title: 'Gig', venueName: 'Campus Green', start: at('13:30'), end: at('15:00') },
]

test('late join suggests the earliest stop reached 20+ minutes before the group leaves', () => {
  const result = lateJoinOptions(stops, [{ minutes: 30, live: false }, { minutes: 30, live: true }], at('12:15'))
  assert.equal(result.best.stop.id, 's2')
  assert.equal(result.rows[0].feasible, false) // 12:45 arrival, group leaves 13:00
  assert.equal(result.best.together, 90) // arrives 12:45, waits for the 13:30 start, leaves 15:00
  assert.equal(etaMessage(result.best), 'I’m on the way to Gig, arriving about 12:45 pm.')
  const early = lateJoinOptions(stops, [{ minutes: 10 }, { minutes: 10 }], at('11:00'))
  assert.equal(early.best.stop.id, 's1')
  assert.equal(early.alternatives[0].stop.id, 's2')
  assert.equal(lateJoinOptions(stops, [{ minutes: 10 }, { minutes: 10 }], at('15:30')).reason, 'The plan has already finished.')
  assert.match(lateJoinOptions(stops, [{ minutes: 300 }, { minutes: 300 }], at('11:00')).reason, /less than 20 minutes/)
})

test('calendar files escape text, use UTC and say nothing is booked', () => {
  const ics = buildIcs({ title: 'Makan; run', stops, meetingPoint: 'Exit B', now: at('09:00') })
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/)
  assert.match(ics, /DTSTART:20261107T040000Z/)
  assert.match(ics, /SUMMARY:Makan\\; run: Lunch/)
  assert.match(ics, /LOCATION:Bugis\\, Street/)
  assert.match(ics.replace(/\r\n /g, ''), /Not booked/)
  assert.ok(ics.split('\r\n').every(line => line.length <= 75))
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2)
  const text = planText({ title: 'Makan', stops, meetingPoint: 'Exit B', url: 'https://example.test/h' })
  assert.match(text, /^Makan: Saturday, 7 November/)
  assert.match(text, /1\. 12:00 pm–1:00 pm Lunch @ Bugis, Street/)
  assert.match(text, /Not booked/)
})

test('forecast horizon follows the start time and never invents data', () => {
  const now = at('10:00')
  assert.equal(horizonFor(at('11:30'), now), 'two-hr-forecast')
  assert.equal(horizonFor(at('20:00'), now), 'twenty-four-hr-forecast')
  assert.equal(horizonFor(at('10:00') + 3 * 86400000, now), 'four-day-outlook')
  assert.equal(horizonFor(at('10:00') + 6 * 86400000, now), null)
  const two = { data: { area_metadata: [{ name: 'Rochor', label_location: { latitude: 1.303, longitude: 103.853 } }, { name: 'Tampines', label_location: { latitude: 1.345, longitude: 103.944 } }], items: [{ forecasts: [{ area: 'Rochor', forecast: 'Cloudy' }], valid_period: { end: '2026-11-07T12:00:00+08:00' } }] } }
  const pick = pickForecast('two-hr-forecast', two, at('11:00'), { lat: 1.2995, lng: 103.8545 })
  assert.equal(pick.text, 'Cloudy')
  assert.match(pick.where, /Rochor/)
  const day = { data: { records: [{ periods: [{ timePeriod: { start: '2026-11-07T18:00:00+08:00', end: '2026-11-08T06:00:00+08:00', text: 'Tonight' }, regions: { east: { text: 'Thundery Showers' } } }] }] } }
  assert.equal(pickForecast('twenty-four-hr-forecast', day, at('20:00'), { lat: 1.353, lng: 103.94 }).text, 'Thundery Showers')
  assert.equal(pickForecast('twenty-four-hr-forecast', day, at('12:00'), { lat: 1.353, lng: 103.94 }).available, false)
  assert.equal(pickForecast('four-day-outlook', { data: { records: [{ forecasts: [] }] } }, at('12:00')).available, false)
  assert.equal(pickForecast(null, null, at('12:00')).available, false)
})
