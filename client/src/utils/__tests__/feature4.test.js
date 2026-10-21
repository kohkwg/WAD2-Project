import test, { beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as api from '../api.js'
import { createSeedData } from '../mockData.js'

const KEY = 'bookedz-feature2-demo'
const now = Date.parse('2026-10-16T04:00:00Z')
const originalNow = Date.now
const originalFetch = globalThis.fetch
let stored, failWrite, writes, failAfterCommit
beforeEach((context) => {
  // Freeze construction as well as Date.now: offer-expiry reads use new Date().
  context.mock.timers.enable({ apis: ['Date'], now })
  Date.now = () => now
  stored = new Map()
  writes = 0
  failWrite = false
  failAfterCommit = false
  globalThis.localStorage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem(key, value) {
      if (failWrite) throw new Error('Storage full')
      stored.set(key, value)
      writes++
      if (failAfterCommit) { failAfterCommit = false; throw new Error('Response lost after commit') }
    },
    removeItem: (key) => stored.delete(key),
  }
})
afterEach(() => { Date.now = originalNow; globalThis.fetch = originalFetch; delete globalThis.localStorage })
const db = () => JSON.parse(stored.get(KEY))
function seed(change = () => {}) {
  const value = createSeedData()
  change(value)
  stored.set(KEY, JSON.stringify(value))
}
function weather(forecast = 'Thundery Showers', changes = {}) {
  return { code: 0, data: {
    area_metadata: [
      { name: 'City', label_location: { latitude: 1.292, longitude: 103.844 } },
      { name: 'Tampines', label_location: { latitude: 1.345, longitude: 103.944 } },
    ],
    items: [{ timestamp: '2026-10-16T11:30:00+08:00', update_timestamp: '2026-10-16T11:35:00+08:00',
      valid_period: { start: '2026-10-16T11:30:00+08:00', end: '2026-10-16T13:30:00+08:00', text: '11.30 am to 1.30 pm' },
      forecasts: [{ area: 'City', forecast }, { area: 'Tampines', forecast: 'Fair (Day)' }], ...changes }],
  }, errorMsg: '' }
}
function mockWeather(payload = weather()) {
  globalThis.fetch = async (url) => {
    assert.equal(url, 'https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast')
    return { ok: true, json: async () => payload }
  }
}

test('adds Feature 4 storage without replacing prior events or RSVP records', async () => {
  seed((value) => { value.events.find((e) => e.id === 'e1').title = 'A saved custom title'; value.custom = { keep: true } })
  const before = db()
  const workspace = await api.getEventOperations('e1')
  assert.equal(workspace.event.title, 'A saved custom title')
  assert.deepEqual(workspace.tasks, [])
  assert.deepEqual(workspace.budget, { limitCents: null, items: [] })
  assert.equal(workspace.forecastAreaOverride, null)
  assert.deepEqual(db().rsvps, before.rsvps)
  assert.deepEqual(db().custom, { keep: true })
  assert.equal(db().events.length, before.events.length)
})

test('deleting an event removes its RSVPs and Feature 4 records while preserving another event', async () => {
  seed()
  await api.createTask('e1', { title: 'Prepare room' })
  await api.createTask('e2', { title: 'Keep this task' })
  await api.createAnnouncement('e1', 'Cancelled event')
  await api.saveBudgetLimit('e1', 10000)
  const withArea = db()
  withArea.feature4.forecastAreas.e1 = 'City'
  stored.set(KEY, JSON.stringify(withArea))
  const otherBefore = db().events.find((event) => event.id === 'e2')
  await api.deleteEvent('e1')
  const saved = db()
  assert.equal(saved.events.some((event) => event.id === 'e1'), false)
  assert.equal(saved.rsvps.some((rsvp) => rsvp.eventId === 'e1'), false)
  assert.equal(saved.feature4.tasks.some((task) => task.eventId === 'e1'), false)
  assert.equal(saved.feature4.announcements.some((post) => post.eventId === 'e1'), false)
  assert.equal(saved.feature4.budgets.e1, undefined)
  assert.equal(saved.feature4.forecastAreas.e1, undefined)
  assert.deepEqual(saved.events.find((event) => event.id === 'e2'), otherBefore)
  assert.equal(saved.feature4.tasks.filter((task) => task.eventId === 'e2').length, 1)
  await assert.rejects(api.getEvent('e1'), /not found/i)
})

test('tasks validate, retain plain text, update, order atomically, isolate events, and delete', async () => {
  seed()
  await assert.rejects(api.createTask('e1', { title: '  ' }), /title/i)
  const a = await api.createTask('e1', { title: ' Book hall ', notes: '<b>Call</b>' })
  const b = await api.createTask('e1', { title: 'Second' })
  const c = await api.createTask('e2', { title: 'Other event' })
  assert.equal(a.title, 'Book hall')
  assert.equal(a.notes, '<b>Call</b>')
  assert.equal(b.position, 1)
  const edited = await api.updateTask('e1', a.id, { title: 'Confirm hall', notes: 'Paid' })
  assert.equal(edited.title, 'Confirm hall')
  const moved = await api.saveTaskBoard('e1', { todo: [], in_progress: [b.id, a.id], done: [] })
  assert.deepEqual(moved.map(({ id, status, position }) => ({ id, status, position })), [
    { id: b.id, status: 'in_progress', position: 0 }, { id: a.id, status: 'in_progress', position: 1 },
  ])
  const saved = stored.get(KEY)
  for (const invalid of [
    { todo: [a.id], in_progress: [], done: [] },
    { todo: [a.id, a.id], in_progress: [], done: [] },
    { todo: [a.id, c.id], in_progress: [], done: [] },
    { todo: [a.id, b.id], in_progress: [], done: [], unexpected: [] },
  ]) await assert.rejects(api.saveTaskBoard('e1', invalid), /board|task|column/i)
  assert.equal(stored.get(KEY), saved)
  failWrite = true
  await assert.rejects(api.saveTaskBoard('e1', { todo: [a.id, b.id], in_progress: [], done: [] }), /Storage/)
  failWrite = false
  assert.equal(stored.get(KEY), saved)
  await assert.rejects(api.updateTask('e1', c.id, { title: 'Attack' }), /not found/i)
  await api.deleteTask('e1', b.id)
  assert.deepEqual((await api.getEventOperations('e1')).tasks.map((t) => [t.id, t.position]), [[a.id, 0]])
  assert.equal((await api.getEventOperations('e2')).tasks[0].id, c.id)
  await api.deleteTask('e1', a.id)
  assert.deepEqual((await api.getEventOperations('e1')).tasks, [])
})

test('every private operation checks event ownership, while public posts contain only post fields', async () => {
  seed()
  const calls = [
    () => api.getEventOperations('e3'), () => api.createTask('e3', { title: 'x' }),
    () => api.updateTask('e3', 'x', { title: 'x' }), () => api.deleteTask('e3', 'x'),
    () => api.saveTaskBoard('e3', { todo: [], in_progress: [], done: [] }),
    () => api.createAnnouncement('e3', 'x'), () => api.updateAnnouncement('e3', 'x', 'x'),
    () => api.deleteAnnouncement('e3', 'x'), () => api.saveBudgetLimit('e3', 1),
    () => api.saveBudgetItem('e3', {}), () => api.deleteBudgetItem('e3', 'x'),
    () => api.setForecastArea('e3', 'City'), () => api.getEventForecast('e3'),
    () => api.confirmBackupVenueSwitch('e3'),
  ]
  for (const call of calls) await assert.rejects(call(), /owner|organiser|permission/i)
  assert.deepEqual(await api.getAnnouncements('e3'), [])
  await assert.rejects(api.getEventOperations('missing'), /not found/i)
  await api.createTask('e1', { title: 'Private secret' })
  await assert.rejects(api.createAnnouncement('e1', '  '), /content|body|announcement/i)
  const post = await api.createAnnouncement('e1', '<script>alert(1)</script>')
  assert.equal(post.body, '<script>alert(1)</script>')
  assert.equal(post.kind, 'manual')
  assert.equal(post.updatedAt, null)
  Date.now = () => now + 1000
  const edited = await api.updateAnnouncement('e1', post.id, 'Changed')
  assert.equal(edited.updatedAt, '2026-10-16T04:00:01.000Z')
  const newer = await api.createAnnouncement('e1', 'Newest')
  const posts = await api.getAnnouncements('e1')
  assert.equal(posts[0].id, newer.id)
  assert.deepEqual(Object.keys(posts[0]).sort(), ['body', 'createdAt', 'eventId', 'id', 'kind', 'updatedAt'])
  await assert.rejects(api.updateAnnouncement('e2', post.id, 'Wrong event'), /not found/i)
  await api.deleteAnnouncement('e1', post.id)
  assert.equal((await api.getAnnouncements('e1')).length, 1)
})

test('budget persists separate limit and integer nonnegative expense rows', async () => {
  seed()
  for (const bad of [0, -1, 1.5, NaN, '10', Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(api.saveBudgetLimit('e1', bad), /budget|limit|cents/i)
  }
  await api.saveBudgetLimit('e1', 10000)
  const input = { name: ' Snacks ', category: 'Food & drink', plannedCents: 1200, actualCents: 0 }
  const item = await api.saveBudgetItem('e1', input)
  assert.equal(item.name, 'Snacks')
  for (const patch of [{ name: '' }, { category: 'Unknown' }, { plannedCents: -1 }, { actualCents: 0.1 }]) {
    await assert.rejects(api.saveBudgetItem('e1', { ...input, ...patch }), /name|category|cents|amount/i)
  }
  await api.saveBudgetItem('e1', { ...item, actualCents: 999 })
  assert.deepEqual((await api.getEventOperations('e1')).budget, {
    limitCents: 10000, items: [{ ...item, actualCents: 999 }],
  })
  await assert.rejects(api.saveBudgetItem('e2', { ...item, actualCents: 1 }), /not found/i)
  await assert.rejects(api.deleteBudgetItem('e2', item.id), /not found/i)
  await api.deleteBudgetItem('e1', item.id)
  await api.saveBudgetLimit('e1', null)
  assert.deepEqual((await api.getEventOperations('e1')).budget, { limitCents: null, items: [] })
})

test('forecast reads actual snake_case payload, nearest area, and saved manual fallback', async () => {
  seed()
  mockWeather()
  assert.deepEqual(await api.getForecastAreas(), [{ name: 'City', lat: 1.292, lng: 103.844 }, { name: 'Tampines', lat: 1.345, lng: 103.944 }])
  const forecast = await api.getEventForecast('e-weather-demo')
  assert.equal(forecast.area, 'City')
  assert.equal(forecast.areaSource, 'coordinates')
  assert.equal(forecast.available, true)
  assert.equal(forecast.canSwitch, true)
  assert.equal(forecast.rainExpected, true)
  assert.equal(forecast.updatedAt, '2026-10-16T11:35:00+08:00')
  const saved = db()
  saved.events.find((e) => e.id === 'e-weather-demo').venue = { name: 'Ungeocoded venue', address: 'Singapore' }
  stored.set(KEY, JSON.stringify(saved))
  assert.equal((await api.getEventForecast('e-weather-demo')).area, null)
  await assert.rejects(api.setForecastArea('e-weather-demo', 'Invented'), /area/i)
  assert.equal(await api.setForecastArea('e-weather-demo', 'Tampines'), 'Tampines')
  assert.equal((await api.getEventOperations('e-weather-demo')).forecastAreaOverride, 'Tampines')
  const manual = await api.getEventForecast('e-weather-demo')
  assert.equal(manual.areaSource, 'manual')
  assert.equal(manual.rainExpected, false)
  assert.equal(manual.canSwitch, false)
})

test('weather never treats unknown, malformed, stale, future, or unavailable data as safe', async () => {
  seed()
  for (const payload of [
    weather('Unknown'), weather('Alien sunshine'), weather(''),
    weather('Rain', { timestamp: 'bad' }),
    weather('Rain', { update_timestamp: '2026-10-16T12:30:00+08:00' }),
    weather('Rain', { timestamp: '2026-10-16T08:00:00+08:00', update_timestamp: '2026-10-16T08:00:00+08:00' }),
    weather('Rain', { valid_period: { start: '2026-10-16T09:00:00+08:00', end: '2026-10-16T11:00:00+08:00' } }),
    weather('Rain', { forecasts: [] }), { code: 0, data: { area_metadata: [], items: [] } },
  ]) {
    mockWeather(payload)
    const forecast = await api.getEventForecast('e-weather-demo')
    assert.equal(forecast.canSwitch, false)
    assert.equal(forecast.available, false)
    assert.ok(forecast.reason)
  }
  globalThis.fetch = async () => { throw new Error('Offline') }
  await assert.rejects(api.getEventForecast('e-weather-demo'), /weather|forecast|offline/i)
  globalThis.fetch = async () => ({ ok: false, status: 503 })
  await assert.rejects(api.getForecastAreas(), /503|weather|forecast/i)
})

test('switch guards reject indoor, ended, far future, missing backup, and dry events', async () => {
  for (const change of [
    { isOutdoor: false }, { backupVenue: null },
    { endTime: '2026-10-16T04:00:00.000Z', startTime: '2026-10-16T03:00:00.000Z' },
    { startTime: '2026-10-16T05:30:00.000Z', endTime: '2026-10-16T07:00:00.000Z' },
  ]) {
    seed((value) => Object.assign(value.events.find((e) => e.id === 'e-weather-demo'), change))
    mockWeather()
    assert.equal((await api.getEventForecast('e-weather-demo')).canSwitch, false)
    await assert.rejects(api.confirmBackupVenueSwitch('e-weather-demo'))
    assert.equal((await api.getAnnouncements('e-weather-demo')).length, 0)
  }
  seed()
  mockWeather(weather('Fair (Day)'))
  await assert.rejects(api.confirmBackupVenueSwitch('e-weather-demo'), /rain|showers/i)
  mockWeather(weather('Rain'))
  const value = db()
  Object.assign(value.events.find((e) => e.id === 'e-weather-demo'), { startTime: '2026-10-16T03:00:00.000Z', endTime: '2026-10-16T05:00:00.000Z' })
  stored.set(KEY, JSON.stringify(value))
  assert.equal((await api.getEventForecast('e-weather-demo')).canSwitch, true)
})

test('switch is one atomic write, retains original venue, protects history, and double clicks reconcile', async () => {
  seed()
  await api.getEventOperations('e-weather-demo')
  const original = db().events.find((e) => e.id === 'e-weather-demo').venue
  mockWeather()
  writes = 0
  const [first, second] = await Promise.all([
    api.confirmBackupVenueSwitch('e-weather-demo'), api.confirmBackupVenueSwitch('e-weather-demo'),
  ])
  assert.equal(writes, 1)
  assert.deepEqual(first, second)
  assert.equal(first.event.venue.name, 'SMU Administration Building')
  assert.deepEqual(first.event.originalVenue, original)
  assert.equal(first.event.usingBackup, true)
  assert.equal(first.announcement.kind, 'venue-switch')
  assert.match(first.announcement.body, /SMU Campus Green/)
  assert.match(first.announcement.body, /SMU Administration Building/)
  assert.match(first.announcement.body, /188065/)
  assert.match(first.announcement.body, /2026|2026-10-16/)
  assert.equal((await api.getAnnouncements('e-weather-demo')).length, 1)
  await assert.rejects(api.updateAnnouncement('e-weather-demo', first.announcement.id, 'Erase history'), /automatic|history|immutable/i)
  await assert.rejects(api.deleteAnnouncement('e-weather-demo', first.announcement.id), /automatic|history|immutable/i)
  assert.equal((await api.getEvent('e-weather-demo')).venue.name, 'SMU Administration Building')
  globalThis.fetch = async () => { throw new Error('Offline') }
  assert.deepEqual(await api.confirmBackupVenueSwitch('e-weather-demo'), first)
})

test('switch write failures preserve both records, and a lost response returns the persisted success on retry', async () => {
  seed()
  await api.getEventOperations('e-weather-demo')
  mockWeather()
  const saved = stored.get(KEY)
  failWrite = true
  await assert.rejects(api.confirmBackupVenueSwitch('e-weather-demo'), /Storage/)
  assert.equal(stored.get(KEY), saved)
  failWrite = false
  failAfterCommit = true
  await assert.rejects(api.confirmBackupVenueSwitch('e-weather-demo'), /Response lost/)
  const recovered = await api.confirmBackupVenueSwitch('e-weather-demo')
  assert.equal(recovered.event.usingBackup, true)
  assert.equal((await api.getAnnouncements('e-weather-demo')).length, 1)
})

test('reset removes Feature 4 data and retains the existing RSVP promotion behavior', async () => {
  seed()
  await api.createTask('e1', { title: 'Reset me' })
  api.resetDemoData()
  assert.deepEqual((await api.getEventOperations('e1')).tasks, [])
  const event = await api.getEvent('e1')
  assert.equal(event.spotsLeft, 0)
  assert.equal(event.offeredCount, 1)
  const rsvps = await api.getRsvpsForEvent('e1')
  assert.deepEqual(rsvps.filter((r) => r.status === 'waitlisted').sort((a, b) => a.rank - b.rank).map((r) => r.userId), ['u6', 'u3', 'u5'])
  await api.cancelRsvp('r3')
  assert.equal((await api.getRsvpsForEvent('e1')).find((r) => r.id === 'r6').status, 'offered')
})

test('malformed metadata entries remain unavailable and never crash weather rendering', async () => {
  seed()
  const payload = weather('Rain')
  payload.data.area_metadata = [null, {}, { name: 'City', label_location: { latitude: null, longitude: 103.8 } }]
  mockWeather(payload)
  const forecast = await api.getEventForecast('e-weather-demo')
  assert.equal(forecast.available, false)
  assert.equal(forecast.canSwitch, false)
  await assert.rejects(api.getForecastAreas(), /area/i)
})

test('malformed forecast validity cannot permit a switch far beyond the two-hour window', async () => {
  seed()
  mockWeather(weather('Rain', { valid_period: { start: '2026-10-15T00:00:00+08:00', end: '2026-10-17T00:00:00+08:00' } }))
  assert.equal((await api.getEventForecast('e-weather-demo')).available, false)
  await assert.rejects(api.confirmBackupVenueSwitch('e-weather-demo'), /invalid|window/i)
})

test('forecast confirmation rechecks the latest event and time after the HTTP response', async () => {
  seed()
  await api.getEventOperations('e-weather-demo')
  let release
  globalThis.fetch = () => new Promise((resolve) => { release = () => resolve({ ok: true, json: async () => weather('Rain') }) })
  const pending = api.confirmBackupVenueSwitch('e-weather-demo')
  const changed = db()
  changed.events.find((e) => e.id === 'e-weather-demo').isOutdoor = false
  stored.set(KEY, JSON.stringify(changed))
  release()
  await assert.rejects(pending, /indoors/i)
  assert.equal((await api.getAnnouncements('e-weather-demo')).length, 0)
  seed()
  const next = api.confirmBackupVenueSwitch('e-weather-demo')
  Date.now = () => now + 2 * 60 * 60 * 1000
  release()
  await assert.rejects(next, /stale|valid|ended/i)
  assert.equal((await api.getAnnouncements('e-weather-demo')).length, 0)
})

test('weather guards keep invalid event times and missing coordinates out of switching', async () => {
  for (const patch of [
    { startTime: 'bad' }, { endTime: 'bad' },
    { venue: { name: 'No coordinates', address: 'Singapore', lat: null, lng: null } },
    { venue: { name: 'Invalid coordinates', address: 'Singapore', lat: 999, lng: 103 } },
  ]) {
    seed((value) => Object.assign(value.events.find((e) => e.id === 'e-weather-demo'), patch))
    mockWeather(weather('Rain'))
    assert.equal((await api.getEventForecast('e-weather-demo')).canSwitch, false)
  }
})

test('forecast start and validity end boundaries are exclusive while ongoing starts are allowed', async () => {
  seed((value) => Object.assign(value.events.find((e) => e.id === 'e-weather-demo'), {
    startTime: '2026-10-16T05:30:00Z', endTime: '2026-10-16T07:00:00Z',
  }))
  mockWeather(weather('Heavy Thundery Showers with Gusty Winds'))
  assert.equal((await api.getEventForecast('e-weather-demo')).canSwitch, false)
  Date.now = () => Date.parse('2026-10-16T05:30:00Z')
  const expired = await api.getEventForecast('e-weather-demo')
  assert.equal(expired.available, false)
  assert.equal(expired.canSwitch, false)
})
