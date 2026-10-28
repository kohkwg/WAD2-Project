import test from 'node:test'
import assert from 'node:assert/strict'
import { createFeature4WeatherAdapter } from '../supabaseFeature4Weather.js'

const now = Date.parse('2026-10-22T02:30:00Z')
const payload = {
  area_metadata: [{ name: 'City', label_location: { latitude: 1.29, longitude: 103.85 } }],
  items: [{
    timestamp: '2026-10-22T10:00:00+08:00',
    update_timestamp: '2026-10-22T10:05:00+08:00',
    valid_period: { start: '2026-10-22T10:00:00+08:00', end: '2026-10-22T12:00:00+08:00' },
    forecasts: [{ area: 'City', forecast: 'Thundery Showers' }],
  }],
}

function clientFor({ ownerId = 'user-1', eventError = null, settingError = null, area = null, coordinates = true, invoke = async () => ({ data: null, error: null }) } = {}) {
  const calls = []
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } }, error: null }) },
    functions: { invoke },
    from(table) {
      calls.push(table)
      const query = {
        select() { return query },
        eq() { return query },
        async maybeSingle() {
          if (table === 'events') {
            return { error: eventError, data: eventError ? null : {
              id: 'event-1', organiser_id: ownerId,
              starts_at: '2026-10-22T10:30:00+08:00', ends_at: '2026-10-22T11:30:00+08:00',
              using_backup: false,
              venue: { id: 'venue-1', name: 'Garden', address: 'Singapore', latitude: coordinates ? 1.29 : null, longitude: coordinates ? 103.85 : null, is_indoor: false },
              backup_venue: { id: 'venue-2', name: 'Hall', address: 'Singapore', latitude: 1.3, longitude: 103.8, is_indoor: true },
            } }
          }
          return { error: settingError, data: area ? { forecast_area: area } : null }
        },
      }
      return query
    },
  }
  return { client, calls }
}

test('live event weather derives areas and forecast from one weather response', async () => {
  const { client, calls } = clientFor({ area: 'City' })
  let weatherReads = 0
  const api = createFeature4WeatherAdapter({ client, now: () => now, fetchData: async () => { weatherReads += 1; return payload } })
  const result = await api.getEventWeather('event-1')

  assert.equal(weatherReads, 1)
  assert.deepEqual(calls.sort(), ['event_operation_settings', 'events'])
  assert.deepEqual(result.areas, [{ name: 'City', lat: 1.29, lng: 103.85 }])
  assert.equal(result.forecast.area, 'City')
  assert.equal(result.forecast.available, true)
  assert.equal(result.forecast.canSwitch, true)
})

test('live forecast rejects non-owner and setting read failures', async () => {
  const notOwner = createFeature4WeatherAdapter({ client: clientFor({ ownerId: 'someone-else' }).client, fetchData: async () => payload })
  await assert.rejects(notOwner.getEventForecast('event-1'), /Only the event owner/)

  const { client } = clientFor({ settingError: { message: 'settings denied' } })
  const failedSettings = createFeature4WeatherAdapter({ client, fetchData: async () => payload })
  await assert.rejects(failedSettings.getEventForecast('event-1'), /settings denied/)
})

test('manual forecast areas display weather but cannot authorize a live switch', async () => {
  const api = createFeature4WeatherAdapter({ client: clientFor({ area: 'City', coordinates: false }).client, now: () => now, fetchData: async () => payload })
  const result = await api.getEventWeather('event-1')
  assert.equal(result.forecast.available, true)
  assert.equal(result.forecast.canSwitch, false)
  assert.match(result.forecast.reason, /coordinates/i)
})

test('live confirmation delegates only the event ID to the authenticated server function', async () => {
  const expected = { event: { id: 'event-1', usingBackup: true }, announcement: { id: 'post-1', kind: 'venue-switch' } }
  const calls = []
  const api = createFeature4WeatherAdapter({ client: clientFor({ invoke: async (...args) => { calls.push(args); return { data: expected, error: null } } }).client })
  assert.deepEqual(await api.confirmBackupVenueSwitch('event-1'), expected)
  assert.deepEqual(calls, [['venue-switch', { body: { eventId: 'event-1' } }]])
})

test('live confirmation surfaces server eligibility errors without changing local state', async () => {
  const api = createFeature4WeatherAdapter({ client: clientFor({ invoke: async () => ({
    data: null, error: { message: 'Edge Function returned a non-2xx status code', context: { json: async () => ({ error: 'The forecast is stale.' }) } },
  }) }).client })
  await assert.rejects(api.confirmBackupVenueSwitch('event-1'), /forecast is stale/i)
})
