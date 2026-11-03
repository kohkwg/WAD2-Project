import test from 'node:test'
import { readFile } from 'node:fs/promises'
import checks from '../../server/tests/checks.js'
const { checkEqual, checkTrue, checkDeepEqual, checkRejects } = checks
let serial = 0
async function setup({ failure = false, attendanceFlags = [] } = {}) {
  const calls = [], posts = []
  const event = id => ({ id, title: id, organiser_id: 'organiser', starts_at: '2026-11-09T10:00:00Z', ends_at: '2026-11-09T12:00:00Z', event_interests: [], event_questions: [], venue: null })
  const rows = [{ event_id: 'old', saved_at: '2026-11-01T00:00:00Z', event: event('old') }, { event_id: 'new', saved_at: '2026-11-02T00:00:00Z', event: event('new') }, { event_id: 'hidden', saved_at: '2026-11-02T01:00:00Z', event: null }]
  const fixture = {
    supabase: {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'participant' } } } }) },
      from(table) {
        calls.push(['table', table])
        const query = {
          then(resolve) { resolve({ data: attendanceFlags.map((flag, index) => ({ id: `r${index}`, status: 'confirmed', event: event(`e${index}`), check_ins: [{ checked_in_at: '2026-11-01T10:00:00Z', fraud_flag: flag }] })) }) },
          select(value) { calls.push(['select', value]); return query },
          eq(...args) { calls.push(['eq', ...args]); return query },
          order(...args) { calls.push(['order', ...args]); return query },
          async range(offset) { calls.push(['range', offset]); return failure ? { error: { message: 'Saved read failed' } } : { data: rows.slice(offset, offset + 1) } },
        }
        return query
      },
      rpc: async () => ({ data: [] }),
    },
    recommendationApi: { post: async (...args) => { posts.push(args) } },
  }
  globalThis.__savedEventsFixture = fixture
  const source = (await readFile(new URL('../src/utils/supabaseApi.js', import.meta.url), 'utf8'))
    .replace("import * as hangouts from './supabaseHangoutsApi.js'", 'const hangouts = {}')
    .replace("import { supabase } from './supabase.js'", 'const { supabase } = globalThis.__savedEventsFixture')
    .replace("import { api as recommendationApi } from '../lib/api.js'", 'const { recommendationApi } = globalThis.__savedEventsFixture')
  const api = await import('data:text/javascript;base64,' + Buffer.from(source + `\n// fixture ${++serial}`).toString('base64'))
  return { api, calls, posts }
}

test('saved-event adapter reads caller-scoped active saves through capped pages and normalises events', async () => {
  const { api, calls } = await setup()
  const result = await api.getSavedEvents()
  checkDeepEqual(result.map(event => event.id), ['new', 'old'])
  checkTrue(result.every(event => event.saved && event.venue.name === 'Venue to be confirmed'))
  checkTrue(calls.some(call => JSON.stringify(call) === JSON.stringify(['eq', 'user_id', 'participant'])))
  checkTrue(calls.some(call => JSON.stringify(call) === JSON.stringify(['eq', 'save_active', true])))
  checkDeepEqual(calls.filter(call => call[0] === 'range').map(call => call[1]), [0, 1, 2, 3])
})

test('saved-event read failures surface rather than becoming empty bookmarks', async () => {
  const { api } = await setup({ failure: true })
  await checkRejects(() => api.getSavedEvents(), 'Saved read failed')
})

test('unsave uses the existing authenticated preference endpoint with no user override', async () => {
  const { api, posts } = await setup()
  await api.unsaveEvent('event-id')
  checkEqual(posts.length, 1)
  checkDeepEqual(posts[0], ['/api/recommendations/event-id/preferences', { action: 'unsave' }])
})

test('live registration adapter marks attendance verified only for explicitly unflagged check-ins', async () => {
  const { api } = await setup({ attendanceFlags: [false, true, null] })
  const registrations = await api.getMyRsvps()
  checkDeepEqual(registrations.map(row => row.attendanceVerified), [true, false, false])
  checkTrue(registrations.every(row => row.checkedInAt))
})
