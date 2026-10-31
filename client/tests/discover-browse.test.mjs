import test from 'node:test'
import { closingSoonEvents, matchesDiscoveryFilters } from '../src/lib/discoveryState.js'
import checks from '../../server/tests/checks.js'
const { checkEqual, checkDeepEqual, checkTrue } = checks
const NOW = Date.parse('2030-01-01T00:00:00Z')
const HOUR = 3600000
const event = (id, fields = {}) => ({ id, title: id, start_time: new Date(NOW + 72 * HOUR).toISOString(),
  status: 'published', capacity: 30, spots_left: 20, ...fields })

test('recommendation display filtering shares search, category, date and availability rules without changing scores or order', () => {
  const pottery = Object.freeze(event('pottery', { title: 'Pottery workshop', tags: ['arts'], venue_name: 'Garden Studio', compatibilityScore: 75 }))
  const music = Object.freeze(event('music', { title: 'Music evening', tags: ['music'], spots_left: 0, compatibilityScore: 60 }))
  const rows = [pottery, music]
  checkDeepEqual(rows.filter(item => matchesDiscoveryFilters(item, { categories: ['arts'] })), [pottery])
  checkEqual(matchesDiscoveryFilters(pottery, { search: 'garden', categories: ['arts'] }), true)
  checkEqual(matchesDiscoveryFilters(pottery, { search: 'music', categories: ['arts'] }), false)
  checkEqual(matchesDiscoveryFilters(pottery, { dateFrom: '2030-01-05' }), false)
  checkEqual(matchesDiscoveryFilters(pottery, { dateTo: '2030-01-03' }), false)
  checkEqual(matchesDiscoveryFilters(music, { availableOnly: true }), false)
  checkEqual(matchesDiscoveryFilters(pottery, { tag: 'music' }), false)
  checkDeepEqual(rows.filter(item => matchesDiscoveryFilters(item, {})), rows)
  checkEqual(pottery.compatibilityScore, 75)
})

test('closing soon uses actual deadlines or five or fewer known places, capped at three', () => {
  const result = closingSoonEvents([
    event('places', { spots_left: 3 }),
    event('later', { registration_closes_at: new Date(NOW + 30 * HOUR).toISOString() }),
    event('first', { registration_closes_at: new Date(NOW + HOUR).toISOString() }),
    event('extra', { spots_left: 2 }),
  ], NOW)
  checkDeepEqual(result.map(item => item.id), ['first', 'later', 'extra'])
  checkTrue(result[0].reason.includes('Registration closes'))
  checkTrue(result[0].reason.includes('SGT'))
  checkEqual(result[2].reason, 'Only 2 places left')
})

test('closing soon excludes expired, full, unpublished, unknown availability and active registrations', () => {
  const result = closingSoonEvents([
    event('expired', { registration_closes_at: new Date(NOW).toISOString(), spots_left: 1 }),
    event('past', { start_time: new Date(NOW - 1).toISOString(), spots_left: 1 }),
    event('invalid', { registration_closes_at: 'invalid', spots_left: 1 }),
    event('full', { spots_left: 0 }), event('unknown', { spots_left: null }),
    event('unlimited', { capacity: null, spots_left: 1 }),
    event('cancelled', { status: 'cancelled', spots_left: 1 }),
    event('registered', { registration_status: 'confirmed', spots_left: 1 }),
    event('plenty', { spots_left: 6 }),
  ], NOW)
  checkDeepEqual(result, [])
})

test('deadline boundary, duplicate protection and input preservation are deterministic', () => {
  const first = Object.freeze(event('a', { registration_closes_at: new Date(NOW + 48 * HOUR).toISOString() }))
  const tooLate = event('b', { registration_closes_at: new Date(NOW + 48 * HOUR + 1).toISOString() })
  checkDeepEqual(closingSoonEvents([first, first, tooLate], NOW).map(item => item.id), ['a'])
  checkTrue(!Object.hasOwn(first, 'reason'))
  checkDeepEqual(closingSoonEvents([], NOW), [])
  checkDeepEqual(closingSoonEvents([first], NaN), [])
})
