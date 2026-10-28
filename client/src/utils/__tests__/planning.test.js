import test from 'node:test'
import assert from 'node:assert/strict'

// In-memory localStorage for the demo backends
const store = new Map()
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, value),
  removeItem: (key) => store.delete(key),
}

const api = await import('../planningMockApi.js')
const { findSlots } = await import('../planning/slotFinder.js')
const { generateItinerary } = await import('../planning/itineraryGenerator.js')
const { resolveVotes } = await import('../planning/voteResolution.js')
const { whereIsGroup } = await import('../planning/lateJoin.js')
const { isDealValidAt } = await import('../planning/dealValidity.js')

function freshDemo() {
  store.clear()
}

// ---------- Demo backend (plumbing) ----------

test('createHangout makes the demo user the host and validates dates', async () => {
  freshDemo()
  const hangout = await api.createHangout({ title: ' Friday dinner ', mode: 'group', dateFrom: '2026-11-06', dateTo: '2026-11-08' })
  assert.equal(hangout.title, 'Friday dinner')
  assert.equal(hangout.members.length, 1)
  assert.equal(hangout.members[0].role, 'host')
  await assert.rejects(api.createHangout({ title: 'Bad', dateFrom: '2026-11-08', dateTo: '2026-11-06' }), /on or after/)
  await assert.rejects(api.createHangout({ title: ' ', dateFrom: '2026-11-06', dateTo: '2026-11-06' }), /name/)
})

test('joinHangout records how the member shares availability', async () => {
  freshDemo()
  const hangout = await api.joinHangout('demo-h1', 'gcal')
  assert.equal(hangout.members.find((m) => m.userId === 'u1').availabilitySource, 'gcal')
  await assert.rejects(api.joinHangout('demo-h1', 'email'), /availability/)
  await assert.rejects(api.joinHangout('no-such-code', 'grid'), /not valid/)
})

test('lockSlot is host-only and rejects an end before the start', async () => {
  freshDemo()
  await assert.rejects(api.lockSlot('h1', '2026-11-07T10:00:00Z', '2026-11-07T09:00:00Z'), /end after/)
  const hangout = await api.lockSlot('h1', '2026-11-07T06:00:00Z', '2026-11-07T10:00:00Z')
  assert.equal(hangout.status, 'slot_locked')
})

test('voteOnStop keeps one vote per member', async () => {
  freshDemo()
  await api.voteOnStop('h2', 's1', 1)
  const stop = await api.voteOnStop('h2', 's1', -1)
  assert.deepEqual(stop.votes, [{ userId: 'u1', value: -1 }])
  await assert.rejects(api.voteOnStop('h2', 's1', 2), /1 or -1/)
})

test('algorithm-backed calls reject with NOT_IMPLEMENTED until the stubs are written', async () => {
  freshDemo()
  await assert.rejects(api.suggestSlots('h1'), { code: 'NOT_IMPLEMENTED' })
  await assert.rejects(api.generateItineraryFor('h2'), { code: 'NOT_IMPLEMENTED' })
  await assert.rejects(api.applyVotes('h2'), { code: 'NOT_IMPLEMENTED' })
  await assert.rejects(api.lookUpArrival('h2', new Date().toISOString()), { code: 'NOT_IMPLEMENTED' })
})

// ---------- Algorithms: behaviour the owners need to implement ----------
// Marked todo so they report without failing the suite. Remove { todo: true } once a stub is built.

test('A1 findSlots returns only windows where every required member is free', { todo: true }, () => {
  const slots = findSlots({
    dateFrom: '2026-11-07', dateTo: '2026-11-07', minDurationMins: 120,
    members: [{ userId: 'a', required: true }, { userId: 'b', required: false }],
    availability: [
      { userId: 'a', kind: 'free', startsAt: '2026-11-07T06:00:00Z', endsAt: '2026-11-07T10:00:00Z' },
      { userId: 'b', kind: 'free', startsAt: '2026-11-07T08:00:00Z', endsAt: '2026-11-07T12:00:00Z' },
    ],
  })
  assert.ok(slots.length > 0)
  for (const slot of slots) assert.ok(slot.freeUserIds.includes('a'))
  assert.deepEqual(slots[0].freeUserIds.sort(), ['a', 'b'])
})

test('A2 generateItinerary keeps every stop inside the slot and includes a meal', { todo: true }, () => {
  const { stops } = generateItinerary({
    startsAt: '2026-11-07T04:00:00Z', endsAt: '2026-11-07T09:00:00Z',
    area: { lat: 1.3006, lng: 103.8559 }, interests: { food: 1, arts: 1 },
    candidates: { events: [], externalEvents: [], deals: [], places: [] },
  })
  for (const stop of stops) {
    assert.ok(stop.startsAt >= '2026-11-07T04:00:00Z' && stop.endsAt <= '2026-11-07T09:00:00Z')
  }
  assert.ok(stops.some((s) => s.kind === 'meal'))
})

test('A3 resolveVotes swaps a stop with more rejections than approvals', { todo: true }, () => {
  const result = resolveVotes({ stops: [{ id: 's1', votes: [{ userId: 'a', value: -1 }, { userId: 'b', value: -1 }], alternatives: [{ refType: 'place', refId: 'p9', title: 'Other', score: 1 }] }] })
  assert.deepEqual(result.replacedStopIds, ['s1'])
})

test('A4 whereIsGroup finds the stop in progress at the arrival time', { todo: true }, () => {
  const stops = [
    { id: 's1', seq: 1, kind: 'activity', title: 'Gallery', startsAt: '2026-11-07T05:00:00Z', endsAt: '2026-11-07T07:00:00Z' },
    { id: 's2', seq: 2, kind: 'meal', title: 'Lunch', startsAt: '2026-11-07T07:20:00Z', endsAt: '2026-11-07T08:00:00Z' },
  ]
  assert.equal(whereIsGroup(stops, '2026-11-07T06:00:00Z').stop.id, 's1')
  assert.equal(whereIsGroup(stops, '2026-11-07T07:10:00Z').status, 'in_transit')
})

test('A5 isDealValidAt respects days of week and time windows (Singapore time)', { todo: true }, () => {
  const deal = { dateFrom: null, dateTo: null, daysOfWeek: [6], timeWindows: [{ start: '12:00', end: '15:00' }] }
  assert.equal(isDealValidAt(deal, '2026-11-07T05:00:00Z'), true)  // Sat 1 pm SGT
  assert.equal(isDealValidAt(deal, '2026-11-07T09:00:00Z'), false) // Sat 5 pm SGT
  assert.equal(isDealValidAt(deal, '2026-11-08T05:00:00Z'), false) // Sun
})
