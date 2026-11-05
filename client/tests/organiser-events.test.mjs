import test from 'node:test'
import checks from '../../server/tests/checks.js'
import { organiserEventState, organiserEventCounts, filterOrganiserEvents } from '../src/utils/organiserEvents.js'
const { checkEqual, checkDeepEqual } = checks
const now = Date.parse('2026-11-02T10:00:00Z')
const row = (id, changes = {}) => ({ id, title: id, status: 'published', startTime: '2026-11-03T10:00:00Z', endTime: '2026-11-03T12:00:00Z', pendingCount: 0, ...changes })
const data = [row('upcoming', { pendingCount: 2, tags: ['gaming'] }), row('ongoing', { startTime: '2026-11-02T09:00:00Z', endTime: '2026-11-02T11:00:00Z' }), row('past', { endTime: '2026-11-02T10:00:00Z' }), row('draft', { status: 'draft', endTime: '2026-10-01T10:00:00Z' }), row('cancelled', { status: 'cancelled', pendingCount: 5 })]
test('event state uses end time, keeps old drafts editable, and separates cancelled events', () => {
  checkEqual(organiserEventState(data[1], now), 'upcoming')
  checkEqual(organiserEventState(data[2], now), 'past')
  checkEqual(organiserEventState(data[3], now), 'drafts')
  checkDeepEqual(organiserEventCounts(data, now), { upcoming: 2, drafts: 1, past: 1, all: 5 })
})
test('tabs, tag/venue/title search and pending requests combine without changing inputs', () => {
  const input = JSON.stringify(data)
  checkDeepEqual(filterOrganiserEvents(data, { tab: 'all', pendingOnly: true, now }).map(row => row.id), ['upcoming'])
  checkDeepEqual(filterOrganiserEvents(data, { tab: 'all', search: ' GAMING ', now }).map(row => row.id), ['upcoming'])
  checkDeepEqual(filterOrganiserEvents(data, { tab: 'drafts', search: 'nothing', now }), [])
  checkEqual(JSON.stringify(data), input)
})
test('sorting is stable and unknown draft dates come last in either direction', () => {
  const events = [row('b'), row('a'), row('unknown', { startTime: null })]
  for (const sort of ['soonest', 'newest']) checkDeepEqual(filterOrganiserEvents(events, { tab: 'all', sort, now }).map(row => row.id), ['a', 'b', 'unknown'])
})

test('live update adapter can reschedule a draft while protecting started published events', async () => {
  const { readFile } = await import('node:fs/promises')
  const { checkRejects, checkTrue } = checks
  const source = (await readFile(new URL('../src/utils/supabaseApi.js', import.meta.url), 'utf8'))
    .replace("import * as hangouts from './supabaseHangoutsApi.js'", 'const hangouts = {}')
    .replace("import { supabase } from './supabase.js'", 'const supabase = {}')
    .replace("import { api as recommendationApi } from '../lib/api.js'", 'const recommendationApi = {}')
    // Pure helper modules load from their real files (a data: URL can't resolve relative imports)
    .replace(/from '\.\/(onlineEvents|venueReveal)\.js'/g, (_, name) => `from '${new URL(`../src/utils/${name}.js`, import.meta.url).href}'`)
  const { updateEventWith } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
  const updates = []
  const client = { from() { return { update(value) { updates.push(value); return { eq: () => ({ select: async () => ({ data: [{ id: 'draft' }] }) }) } } } } }
  const venue = { name: 'Demo room', address: '80 Stamford Road', lat: 1.3, lng: 103.8 }
  const current = { id: 'draft', organiserId: 'owner', status: 'draft', startTime: '2000-01-01T10:00:00Z', venue, backupVenue: null, questions: [], tags: [] }
  const changes = { title: 'Rescheduled draft', startTime: '2099-01-01T10:00:00Z', endTime: '2099-01-01T12:00:00Z', venue, backupVenue: null, questions: [], tags: [] }
  await updateEventWith(client, { current, myId: 'owner', rsvpCount: 0 }, changes)
  checkEqual(updates.length, 1)
  checkTrue(!Object.hasOwn(updates[0], 'status'))
  await checkRejects(() => updateEventWith(client, { current: { ...current, status: 'published' }, myId: 'owner', rsvpCount: 0 }, changes), 'already started')
})

test('demo public browsing hides drafts while the organiser list retains them', async () => {
  const { createSeedData } = await import('../src/utils/mockData.js')
  const api = await import('../src/utils/mockApi.js')
  const db = createSeedData()
  db.events = db.events.slice(0, 3).map((event, index) => ({ ...event, organiserId: 'org1', status: ['draft', 'published', 'cancelled'][index] }))
  db.rsvps = []
  let stored = JSON.stringify(db)
  globalThis.localStorage = { getItem: () => stored, setItem: (_key, value) => { stored = value } }
  checkDeepEqual((await api.getEvents()).map(event => event.id), [db.events[1].id])
  checkEqual((await api.getOrganiserEvents()).length, 3)
  delete globalThis.localStorage
})
