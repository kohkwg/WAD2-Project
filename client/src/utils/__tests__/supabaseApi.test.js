import test from 'node:test'
import assert from 'node:assert/strict'
import { createEventWith, createRsvpWith, expireOffersNow } from '../supabaseApi.js'

function clientWithExistingRsvp(existing) {
  const calls = []
  return {
    calls,
    rpc(name, args) {
      calls.push({ kind: 'rpc', name, args })
      return Promise.resolve({ data: null, error: { message: 'You already have an RSVP for this event' } })
    },
    from(table) {
      const query = { table, filters: [], operation: 'select' }
      query.select = (columns) => { query.columns = columns; return query }
      query.eq = (column, value) => { query.filters.push([column, value]); return query }
      query.in = (column, values) => { query.filters.push([column, values]); return query }
      query.update = (payload) => { query.operation = 'update'; query.payload = payload; return query }
      query.maybeSingle = () => {
        calls.push({ kind: 'query', table, filters: query.filters, columns: query.columns })
        return Promise.resolve({ data: existing, error: null })
      }
      query.then = (resolve, reject) => {
        calls.push({ kind: 'query', table, filters: query.filters, operation: query.operation, payload: query.payload })
        return Promise.resolve({ data: null, error: null }).then(resolve, reject)
      }
      return query
    },
  }
}

test('live event creation sends the full normalized event to one idempotent RPC', async () => {
  const calls = []
  const client = {
    rpc(name, args) {
      calls.push({ name, args })
      return Promise.resolve({ data: 'event-1', error: null })
    },
    from() { assert.fail('Event creation must not make partial table writes') },
  }
  const eventData = {
    requestId: 'd3edb13b-9022-4c2d-95fb-34774f34339e',
    title: 'Acoustic Night', description: 'Live music',
    startTime: '2026-12-01T10:00:00.000Z', endTime: '2026-12-01T12:00:00.000Z',
    capacity: 30, requiresApproval: true, isOutdoor: true,
    venue: { name: 'Campus Green', address: '1 College Road', postal: '123456', lat: 1.3, lng: 103.8, sourceId: 12 },
    backupVenue: { name: 'Hall', address: '2 College Road', postal: '123457', lat: 1.31, lng: 103.81 },
    tags: ['music', 'arts'],
    questions: [{ id: 'temporary-question-id', text: 'Dietary needs?', type: 'text', required: true }],
  }

  const created = await createEventWith(client, eventData)

  assert.deepEqual(created, { id: 'event-1' })
  assert.deepEqual(calls, [{
    name: 'create_event_with_details',
    args: {
      p_request_id: eventData.requestId,
      p_event: {
        title: 'Acoustic Night', description: 'Live music',
        startTime: '2026-12-01T10:00:00.000Z', endTime: '2026-12-01T12:00:00.000Z',
        capacity: 30, requiresApproval: true, isOutdoor: true,
        venue: { name: 'Campus Green', address: '1 College Road', postal: '123456', lat: 1.3, lng: 103.8 },
        backupVenue: { name: 'Hall', address: '2 College Road', postal: '123457', lat: 1.31, lng: 103.81 },
        tags: ['music', 'arts'],
        questions: [{ text: 'Dietary needs?', type: 'text', required: true }],
      },
    },
  }])
})

test('live event creation requires a UUID request ID before calling Supabase', async () => {
  const client = { rpc() { assert.fail('Invalid request IDs must not reach Supabase') } }
  await assert.rejects(createEventWith(client, { title: 'No key' }), /valid request ID/i)
})

test('a retried RSVP returns the already committed active registration after a lost response', async () => {
  const existing = {
    id: 'registration-1', event_id: 'event-1', user_id: 'user-1', status: 'confirmed',
    created_at: '2026-10-22T00:00:00Z', offer_expires_at: null,
    registration_answers: [{ question_id: 'question-1', answer: 'yes' }],
  }
  const client = clientWithExistingRsvp(existing)

  const result = await createRsvpWith(client, 'user-1', {
    eventId: 'event-1', name: '', answers: { 'question-1': 'yes' },
  })

  assert.deepEqual(result, {
    id: 'registration-1', eventId: 'event-1', userId: 'user-1', status: 'confirmed',
    createdAt: '2026-10-22T00:00:00Z', offerExpiresAt: null,
    answers: { 'question-1': 'yes' },
  })
  assert.deepEqual(client.calls[1].filters, [
    ['event_id', 'event-1'], ['user_id', 'user-1'],
    ['status', ['pending', 'confirmed', 'waitlisted', 'offered']],
  ])
})

test('RSVP retry reconciliation does not mask other registration errors', async () => {
  const client = {
    rpc: async () => ({ data: null, error: { message: 'Registration has closed' } }),
    from() { assert.fail('Only duplicate RSVP errors should trigger a readback') },
  }
  await assert.rejects(
    createRsvpWith(client, 'user-1', { eventId: 'event-1', name: '', answers: {} }),
    /Registration has closed/,
  )
})

test('RSVP retry does not report success when persisted answers differ from the retry', async () => {
  const client = clientWithExistingRsvp({
    id: 'registration-1', event_id: 'event-1', user_id: 'user-1', status: 'confirmed',
    created_at: '2026-10-22T00:00:00Z', offer_expires_at: null,
    registration_answers: [{ question_id: 'question-1', answer: 'yes' }],
  })

  await assert.rejects(
    createRsvpWith(client, 'user-1', {
      eventId: 'event-1', name: '', answers: { 'question-1': 'no' },
    }),
    /You already have an RSVP for this event/,
  )
})

test('live mode refuses the demo-only offer expiry action', async () => {
  await assert.rejects(expireOffersNow('event-1'), /only available in demo mode/i)
})

test('event cover URL travels in the same atomic create RPC', async () => {
  let payload
  const client = {rpc: async (_name,args) => {payload=args.p_event;return {data:'event-cover-id',error:null}}}
  await createEventWith(client, {
    requestId:'d3edb13b-9022-4c2d-95fb-34774f34339e',
    title:'Cover event',description:'',startTime:'2026-12-01T10:00:00Z',endTime:'2026-12-01T11:00:00Z',
    capacity:5,tags:['arts'],questions:[],venue:null,backupVenue:null,
    coverImageUrl:'https://example.com/covers/test.png',
  })
  assert.equal(payload.coverImageUrl,'https://example.com/covers/test.png')
})
