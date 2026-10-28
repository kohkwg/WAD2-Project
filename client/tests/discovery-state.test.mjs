import test from 'node:test'
import assert from 'node:assert/strict'
import { observeDiscoverySession, demoDiscoveryEvents } from '../src/lib/discoveryState.js'

test('session lookup, initial event and repeated sign-in cause one refresh per user', async () => {
  let callback
  let stopped = false
  const seen = []
  const alice = { user: { id: 'alice' } }
  const client = { auth: {
    getSession: async () => ({ data: { session: alice } }),
    onAuthStateChange(fn) { callback = fn; return { data: { subscription: { unsubscribe() { stopped = true } } } } },
  } }
  const stop = observeDiscoverySession(client, session => seen.push(session?.user.id ?? null), assert.fail)
  callback('INITIAL_SESSION', alice)
  await new Promise(resolve => setTimeout(resolve, 10))
  callback('SIGNED_IN', alice)
  callback('TOKEN_REFRESHED', alice)
  await new Promise(resolve => setTimeout(resolve, 10))
  assert.deepEqual(seen, ['alice'])
  callback('SIGNED_OUT', null)
  await new Promise(resolve => setTimeout(resolve, 10))
  assert.deepEqual(seen, ['alice', null])
  stop()
  callback('SIGNED_IN', alice)
  await new Promise(resolve => setTimeout(resolve, 10))
  assert.deepEqual(seen, ['alice', null])
  assert.ok(stopped)
})

test('demo discovery uses event DTOs and filters tags, venue, dates and available seats', () => {
  const events = [
    { id: 'a', title: 'Music', tags: ['music'], startTime: '2026-12-01T10:00:00Z', venue: { name: 'Hall', address: 'Campus' }, capacity: 5, spotsLeft: 2, confirmedCount: 3 },
    { id: 'b', title: 'Sport', tags: ['sports'], startTime: '2026-12-02T10:00:00Z', venue: { name: 'Field' }, capacity: 2, spotsLeft: 0 },
  ]
  const rows = demoDiscoveryEvents(events, {search: 'campus', categories: ['music'], availableOnly: true}, new Date('2026-11-01'))
  assert.equal(rows.length, 1)
  assert.equal(rows[0].start_time, events[0].startTime)
  assert.equal(rows[0].venue_name, 'Hall')
  assert.equal(rows[0].confirmed_count, 3)
  assert.equal(demoDiscoveryEvents(events, {dateFrom: '2026-12-03'}, new Date('2026-11-01')).length, 0)
})
