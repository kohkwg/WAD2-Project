import test from 'node:test'
import assert from 'node:assert/strict'
import * as weather from '../feature4Weather.js'

// Control the actual timer boundary; never sleep for the production deadline.
function captureDeadline(t) {
  const scheduled = []
  const cleared = []
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => {
    const handle = { callback, delay }
    scheduled.push(handle)
    return handle
  })
  t.mock.method(globalThis, 'clearTimeout', (handle) => { cleared.push(handle) })
  return { scheduled, cleared }
}
const data = { area_metadata: [], items: [] }

test('an upstream request that never returns times out, aborts, and permits a later retry', async (t) => {
  const timers = captureDeadline(t)
  let signal
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    signal = options?.signal
    return new Promise(() => {})
  })
  const pending = weather.fetchForecastData()
  assert.equal(timers.scheduled.length, 1, 'every weather read must have a deadline')
  assert.equal(timers.scheduled[0].delay, 15000)
  timers.scheduled[0].callback()
  await assert.rejects(pending, /timed out.*retry/i)
  assert.equal(signal.aborted, true)
  assert.deepEqual(timers.cleared, timers.scheduled)
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ code: 0, data }) }))
  assert.deepEqual(await weather.fetchForecastData(), data)
})

test('the weather deadline includes a response body that never finishes', async (t) => {
  const timers = captureDeadline(t)
  let signal
  let bodyStarted = false
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    signal = options?.signal
    return { ok: true, json: () => { bodyStarted = true; return new Promise(() => {}) } }
  })
  const pending = weather.fetchForecastData()
  // Let fetch resolve and response.json start before expiring the deadline.
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(bodyStarted, true)
  assert.equal(timers.scheduled.length, 1, 'the deadline remains active during body parsing')
  timers.scheduled[0].callback()
  await assert.rejects(pending, /timed out.*retry/i)
  assert.equal(signal.aborted, true)
  assert.deepEqual(timers.cleared, timers.scheduled)
})

test('weather success and service failures clear their request deadline', async (t) => {
  const timers = captureDeadline(t)
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ code: 0, data }) }))
  assert.deepEqual(await weather.fetchForecastData(), data)
  assert.equal(timers.scheduled.length, 1)
  assert.deepEqual(timers.cleared, timers.scheduled)
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Offline') })
  await assert.rejects(weather.fetchForecastData(), /weather.*Offline/i)
  assert.equal(timers.scheduled.length, 2)
  assert.deepEqual(timers.cleared, timers.scheduled)
})

test('shared coordinate validity rejects values requiring manual area selection', () => {
  assert.equal(typeof weather.validCoordinates, 'function')
  assert.equal(weather.validCoordinates(1.2966, 103.8502), true)
  assert.equal(weather.validCoordinates(-90, -180), true)
  assert.equal(weather.validCoordinates(90, 180), true)
  for (const [lat, lng] of [['1.3', '103.8'], [null, 103.8], [1.3, undefined], [91, 103.8], [1.3, 181], [NaN, 103.8], [1.3, Infinity]]) {
    assert.equal(weather.validCoordinates(lat, lng), false)
  }
})
