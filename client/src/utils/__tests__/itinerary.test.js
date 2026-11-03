import test from 'node:test'
import assert from 'node:assert/strict'
import { retime, generatePlan, swapAlternatives, travelEstimate, eventListing, placeListing, candidatePool, memberWeights } from '../itinerary.js'
import { sgDateTime } from '../hangouts.js'

const at = t => sgDateTime('2026-11-07', t).getTime()
const iso = t => new Date(at(t)).toISOString()
const origin = { lat: 1.2995, lng: 103.8545 } // Bugis
const event = (id, from, to, tags, lat = 1.2966, lng = 103.8502, extra = {}) => eventListing({ id, title: id, startTime: iso(from), endTime: iso(to), tags, status: 'published', spotsLeft: 5, lat, lng, venue: { name: id }, ...extra })
const members = [{ weights: memberWeights(['music', 'food']) }, { weights: memberWeights(['arts']) }]
const input = slot => ({ slot: { start: at(slot[0]), end: at(slot[1]) }, origin, members })

test('travel is a labelled estimate: walking for short hops, transit otherwise', () => {
  const walk = travelEstimate(origin, { lat: 1.2966, lng: 103.8502 })
  assert.equal(walk.mode, 'walk')
  assert.equal(walk.estimated, true)
  assert.equal(travelEstimate(origin, { lat: 1.3533, lng: 103.9404 }).mode, 'transit')
})

test('retime reports missed events, long waits, overruns, closed places and soft issues', () => {
  const late = retime([event('a', '10:00', '12:00', ['music'])], input(['10:00', '16:00']))
  assert.equal(late.issues.find(i => i.type === 'missed_event').blocking, true)
  const waitLong = retime([event('a', '12:00', '13:00', ['music'])], input(['10:00', '16:00']))
  assert.ok(waitLong.issues.some(i => i.type === 'long_wait'))
  const over = retime([event('a', '15:00', '17:00', ['music'])], input(['14:00', '16:00']))
  assert.ok(over.issues.some(i => i.type === 'over_time'))
  const place = placeListing({ id: 'p', name: 'Kopi', lat: 1.2996, lng: 103.8546, minutes: 60, kind: 'meal', hours: { open: '08:00', close: '10:30' } })
  const closed = retime([place], input(['10:00', '16:00']))
  assert.ok(closed.issues.some(i => i.type === 'closed' && i.blocking))
  const unknown = retime([{ ...place, hours: null }], input(['10:00', '16:00']))
  assert.equal(unknown.issues.find(i => i.type === 'unknown_hours').blocking, false)
  // A 10:00–11:00 meal doesn't cover lunch, so the soft no-meal concern remains.
  assert.equal(unknown.issues.find(i => i.type === 'no_meal').blocking, false)
})

test('meal windows: lunch is required when the slot overlaps it by an hour', () => {
  const result = retime([event('a', '12:00', '14:00', ['music'])], input(['11:30', '16:00']))
  const noMeal = result.issues.find(i => i.type === 'no_meal')
  assert.equal(noMeal.blocking, false)
  assert.equal(result.mealsRequired, 1)
  const food = retime([event('f', '12:00', '13:00', ['food'])], input(['11:30', '16:00']))
  assert.equal(food.mealsCovered, 1)
})

test('consecutive meals block', () => {
  const r = retime([event('f1', '12:00', '13:00', ['food']), event('f2', '13:30', '14:30', ['food'])], input(['11:30', '16:00']))
  assert.ok(r.issues.some(i => i.type === 'consecutive_meals' && i.blocking))
})

test('generation picks a feasible multi-stop plan from real events only', () => {
  const listings = [
    event('lunch', '12:00', '13:00', ['food']),
    event('gig', '13:30', '15:00', ['music']),
    event('pottery', '13:30', '15:00', ['arts']),
    event('far', '13:30', '15:00', ['music'], 1.44, 103.79),
    event('outside', '17:00', '19:00', ['music']),
    eventListing({ id: 'hang', title: 'hang', kind: 'hangout', status: 'published', startTime: iso('12:00'), endTime: iso('13:00'), tags: ['food'], lat: 1.2966, lng: 103.8502 }),
  ]
  const plan = generatePlan(listings, input(['11:40', '16:00']))
  assert.equal(plan.ok, true)
  const ids = plan.listings.map(l => l.refId)
  assert.equal(ids[0], 'lunch')
  assert.ok(ids.length >= 2)
  assert.ok(!ids.includes('outside') && !ids.includes('hang') && !ids.includes('far'))
  assert.equal(plan.result.issues.filter(i => i.blocking).length, 0)
})

test('no feasible plan returns a diagnosis and explicit relaxations', () => {
  const plan = generatePlan([event('gig', '13:30', '15:00', ['music'])], input(['13:00', '16:00']))
  assert.equal(plan.ok, false)
  assert.deepEqual(plan.suggestions.map(s => s.kind), ['later-start', 'one-stop', 'add-place'])
  // An event two hours after the start only works if the host chooses to meet later.
  const evening = [event('gig', '19:00', '21:00', ['music'])]
  const strict = generatePlan(evening, input(['17:00', '23:00']), { minStops: 1, mealWanted: false })
  assert.equal(strict.ok, false)
  assert.deepEqual(strict.suggestions.map(s => s.kind), ['later-start', 'add-place'])
  const later = generatePlan(evening, input(['17:00', '23:00']), { minStops: 1, mealWanted: false, flexibleStart: true })
  assert.equal(later.ok, true)
  assert.equal(later.result.stops[0].wait, 0)
  // 13:00–16:00 overlaps lunch by an hour, so one stop alone still needs the meal relaxed too.
  assert.equal(generatePlan([event('gig', '13:30', '15:00', ['music'])], input(['13:00', '16:00']), { minStops: 1 }).ok, false)
  assert.equal(generatePlan([event('gig', '13:30', '15:00', ['music'])], input(['13:00', '16:00']), { minStops: 1, mealWanted: false }).ok, true)
  assert.match(generatePlan([], input(['13:00', '16:00'])).reason, /No Official Bookedz events/)
})

test('the pool widens to 12 km and excludes full events', () => {
  const near = event('near', '13:30', '15:00', ['music'])
  const mid = event('mid', '13:30', '15:00', ['music'], 1.3533, 103.9404) // ~10 km
  const full = event('full', '13:30', '15:00', ['music'], 1.2966, 103.8502, { spotsLeft: 0 })
  const { pool, radiusKm } = candidatePool([near, mid, full], input(['13:00', '16:00']))
  assert.equal(radiusKm, 12)
  assert.deepEqual(pool.map(l => l.refId).sort(), ['mid', 'near'])
})

test('swap alternatives keep the kind and the whole plan feasible', () => {
  const a = event('gig', '13:30', '15:00', ['music'])
  const b = event('pottery', '13:30', '15:00', ['arts'])
  const c = event('lunch', '13:30', '14:30', ['food'])
  const alts = swapAlternatives([a, b, c], 0, [a], input(['13:00', '16:00']))
  assert.deepEqual(alts.map(x => x.listing.refId), ['pottery'])
  assert.ok(alts[0].reasons.includes('Same-time fit'))
})
