import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

// Load the real composable, replacing only its external service clients.
const source = (await readFile(new URL('../src/composables/useEvents.js', import.meta.url), 'utf8'))
  .replace("from 'vue'", `from '${import.meta.resolve('vue')}'`)
  .replace("import { supabase } from '@/lib/supabase'", 'const supabase = globalThis.discoverTestClient')
  .replace("import { api } from '@/lib/api'", 'const api = globalThis.discoverTestApi')
let responses
let requests
let session
const client = {
  auth: { getSession: async () => ({ data: { session } }) },
  from(table) {
    const calls = []
    const request = { table, calls }
    requests.push(request)
    const query = new Proxy({}, {
      get(_target, method) {
        if (method === 'then') return (resolve, reject) => Promise.resolve(responses(table, calls)).then(resolve, reject)
        return (...args) => { calls.push([method, ...args]); return query }
      },
    })
    return query
  },
}
globalThis.discoverTestClient = client
globalThis.discoverTestApi = { get: async () => ({ data: { events: [] } }) }
const { useEvents } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const event = { id: 'event-1', title: 'Futsal', venue_id: 'venue-1', confirmed_count: 3 }
function reset(responder, signedIn = true) {
  requests = []
  session = signedIn ? { user: { id: 'user-1' } } : null
  responses = responder
}

test('searches title, description and resolved venue IDs; retains all filters and pagination', async () => {
  reset((table, calls) => table === 'events_with_counts' ? { data: [event], count: 31 }
    : table === 'registrations' ? { data: [{ event_id: 'event-1', status: 'confirmed' }] }
    : { data: calls.some(c => c[0] === 'ilike') ? [{ id: 'venue-1' }] : [{ id: 'venue-1', name: 'Sports Hall' }] })
  const state = useEvents()
  await state.fetchEvents({ search: 'Sports', category: 'sports', dateFrom: '2026-10-21', dateTo: '2026-10-24', availableOnly: true, sort: 'popular', page: 2 })
  assert.equal(state.error.value, '')
  assert.equal(state.events.value[0].venue_name, 'Sports Hall')
  assert.equal(state.events.value[0].registration_status, 'confirmed')
  assert.equal(state.total.value, 31)
  const calls = requests.find(r => r.table === 'events_with_counts').calls
  assert.ok(calls.some(c => c[0] === 'or' && c[1] === 'title.ilike.%Sports%,description.ilike.%Sports%,venue_id.in.(venue-1)'))
  assert.ok(calls.some(c => c[0] === 'contains' && c[1] === 'tags' && c[2][0] === 'sports'))
  assert.ok(calls.some(c => c[0] === 'gte' && c[1] === 'start_time'))
  assert.ok(calls.some(c => c[0] === 'lte' && c[1] === 'start_time'))
  assert.ok(calls.some(c => c[0] === 'or' && c[1] === 'spots_left.gt.0,capacity.is.null'))
  assert.deepEqual(calls.filter(c => c[0] === 'order').map(c => c[1]), ['confirmed_count', 'start_time', 'id'])
  assert.deepEqual(calls.find(c => c[0] === 'range'), ['range', 12, 23])
})

test('missing venues still allow title search; signed-out users do not query registrations', async () => {
  reset(table => table === 'events_with_counts' ? { data: [event], count: 1 } : { data: null, error: { message: 'Venue table unavailable' } }, false)
  const state = useEvents()
  await state.fetchEvents({ search: 'Futsal' })
  assert.equal(state.error.value, '')
  assert.equal(state.events.value[0].venue_name, '')
  assert.equal(state.events.value[0].registration_status, null)
  assert.ok(!requests.some(r => r.table === 'registrations'))
})

test('does not treat pending registration as confirmed', async () => {
  reset(table => table === 'events_with_counts' ? { data: [event], count: 1 }
    : table === 'registrations' ? { data: [{ event_id: event.id, status: 'pending' }] } : { data: [] })
  const state = useEvents()
  await state.fetchEvents()
  assert.equal(state.events.value[0].registration_status, 'pending')
})

test('older requests cannot overwrite a newer result or clear its loading indicator', async () => {
  let resolveOld
  let resolveNew
  let calls = 0
  reset(table => {
    if (table !== 'events_with_counts') return { data: [] }
    return new Promise(resolve => { if (++calls === 1) resolveOld = resolve; else resolveNew = resolve })
  }, false)
  const state = useEvents()
  const oldRequest = state.fetchEvents()
  const newRequest = state.fetchEvents({ category: 'sports' })
  await Promise.resolve()
  resolveOld({ data: [{ id: 'old' }], count: 1 })
  await oldRequest
  assert.equal(state.loading.value, true)
  resolveNew({ data: [{ id: 'new' }], count: 1 })
  await newRequest
  assert.equal(state.events.value[0].id, 'new')
  assert.equal(state.loading.value, false)
})

test('a database error clears previous results and is exposed for the retry state', async () => {
  reset(() => ({ data: [event], count: 1 }), false)
  const state = useEvents()
  await state.fetchEvents()
  responses = () => ({ data: null, error: { message: 'View unavailable' } })
  await state.fetchEvents()
  assert.equal(state.error.value, 'View unavailable')
  assert.deepEqual(state.events.value, [])
  assert.equal(state.total.value, 0)
  assert.equal(state.loading.value, false)
})

test('attendee photos are joined only from confirmed registrations visible to the current user', async () => {
  reset((table, calls) => {
    if (table === 'events_with_counts') return { data: [event], count: 1 }
    if (table === 'venues') return { data: [] }
    const isAttendeeQuery = calls.some(c => c[0] === 'eq' && c[1] === 'status' && c[2] === 'confirmed')
    return { data: isAttendeeQuery
      ? [{ id: 'registration-1', event_id: event.id, user_id: 'person-1', profile: { id: 'person-1', display_name: 'Alex Tan', avatar_key: 'avatars/person-1/photo.jpg' } }]
      : [{ event_id: event.id, status: 'pending' }] }
  })
  const state = useEvents()
  await state.fetchEvents()
  assert.equal(state.error.value, '')
  assert.deepEqual(state.events.value[0].attendees, [{ id: 'person-1', display_name: 'Alex Tan', avatar_key: 'avatars/person-1/photo.jpg' }])
  assert.equal(state.events.value[0].registration_status, 'pending')
})

test('unavailable attendee profiles do not prevent browsing', async () => {
  reset((table, calls) => {
    if (table === 'events_with_counts') return { data: [event], count: 1 }
    if (calls.some(c => c[0] === 'eq' && c[1] === 'status')) return { data: null, error: { message: 'Attendee profiles unavailable' } }
    return { data: [] }
  })
  const state = useEvents()
  await state.fetchEvents()
  assert.equal(state.error.value, '')
  assert.deepEqual(state.events.value[0].attendees, [])
})

test('attendee loading continues across batches rather than silently truncating the list', async () => {
  const people = Array.from({ length: 201 }, (_, i) => ({ id: `registration-${i}`, event_id: event.id, user_id: `person-${i}`, profile: { id: `person-${i}`, display_name: `Person ${i}` } }))
  reset((table, calls) => {
    if (table === 'events_with_counts') return { data: [event], count: 1 }
    const range = calls.find(c => c[0] === 'range')
    return { data: table === 'registrations' && range ? people.slice(range[1], range[2] + 1) : [] }
  })
  const state = useEvents()
  await state.fetchEvents()
  assert.equal(state.error.value, '')
  assert.equal(state.events.value[0].attendees.length, 201)
})

test('multiple category badges query any selected category alongside existing filters', async () => {
  reset(() => ({ data: [], count: 0 }), false)
  const state = useEvents()
  await state.fetchEvents({ categories: ['sports', 'hackathon', 'sports'], category: 'music', search: 'Meetup', availableOnly: true, sort: 'popular' })
  assert.equal(state.error.value, '')
  const calls = requests.find(r => r.table === 'events_with_counts').calls
  assert.deepEqual(calls.find(c => c[0] === 'overlaps' && c[1] === 'tags'), ['overlaps', 'tags', ['sports', 'hackathon']])
  assert.ok(!calls.some(c => c[0] === 'contains' && c[1] === 'tags'))
  assert.ok(calls.some(c => c[0] === 'or' && c[1].includes('title.ilike.%Meetup%')))
  assert.ok(calls.some(c => c[0] === 'or' && c[1] === 'spots_left.gt.0,capacity.is.null'))
  assert.ok(calls.some(c => c[0] === 'order' && c[1] === 'confirmed_count'))
})

test('All categories omits the category constraint', async () => {
  reset(() => ({ data: [], count: 0 }), false)
  const state = useEvents()
  await state.fetchEvents({ category: '', categories: [] })
  const calls = requests.find(r => r.table === 'events_with_counts').calls
  assert.ok(!calls.some(c => ['contains', 'overlaps'].includes(c[0]) && c[1] === 'tags'))
})

test('venue lookup supplies both the location name and street address', async () => {
  reset(table => table === 'events_with_counts' ? { data: [event], count: 1 }
    : { data: [{ id: event.venue_id, name: 'Sports Hall', address: '81 Victoria Street' }] }, false)
  const state = useEvents()
  await state.fetchEvents()
  assert.equal(state.events.value[0].venue_name, 'Sports Hall')
  assert.equal(state.events.value[0].venue_address, '81 Victoria Street')
})

test('existing event locations are retained if the optional venue lookup is unavailable', async () => {
  reset(table => table === 'events_with_counts'
    ? { data: [{ ...event, venue_name: 'Sports Hall', venue_address: '81 Victoria Street' }], count: 1 }
    : { data: null, error: { message: 'Venue lookup unavailable' } }, false)
  const state = useEvents()
  await state.fetchEvents()
  assert.equal(state.error.value, '')
  assert.equal(state.events.value[0].venue_name, 'Sports Hall')
  assert.equal(state.events.value[0].venue_address, '81 Victoria Street')
})
