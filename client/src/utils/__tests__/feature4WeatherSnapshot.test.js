import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as api from '../api.js'
import { createSeedData } from '../mockData.js'

const KEY = 'bookedz-feature2-demo'
let stored
let originalLocalStorage
let originalFetch

describe('weather snapshot API', () => {
  beforeEach(() => {
    originalLocalStorage = globalThis.localStorage
    originalFetch = globalThis.fetch
    const now = Date.now()
    const seeded = createSeedData()
    const event = seeded.events.find(item => item.id === 'e-weather-demo')
    event.startTime = new Date(now + 30 * 60 * 1000).toISOString()
    event.endTime = new Date(now + 2 * 60 * 60 * 1000).toISOString()
    stored = new Map([[KEY, JSON.stringify(seeded)]])
    globalThis.localStorage = {
      getItem: key => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, value),
      removeItem: key => stored.delete(key),
    }
  })

  afterEach(() => {
    if (originalLocalStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = originalLocalStorage
    globalThis.fetch = originalFetch
  })

  function payload(areas = [
    { name: 'City', label_location: { latitude: 1.2966, longitude: 103.8502 } },
  ]) {
    const now = Date.now()
    const issued = new Date(now - 5 * 60 * 1000).toISOString()
    return { code: 0, data: {
      area_metadata: areas,
      items: [{ timestamp: issued, update_timestamp: issued,
        valid_period: { start: issued, end: new Date(now + 115 * 60 * 1000).toISOString() },
        forecasts: [{ area: 'City', forecast: 'Thundery Showers' }] }],
    } }
  }

  test('getEventWeather returns forecast and areas from one guarded response snapshot', async () => {
    let requests = 0
    globalThis.fetch = async () => {
      requests++
      return { ok: true, json: async () => payload() }
    }

    const result = await api.getEventWeather('e-weather-demo')

    assert.equal(requests, 1)
    assert.deepEqual(result.areas.map(area => area.name), ['City'])
    assert.equal(result.forecast.area, 'City')
    assert.equal(result.forecast.forecast, 'Thundery Showers')
  })

  test('getEventWeather keeps unusable areas explicit for retry or manual selection', async () => {
    globalThis.fetch = async () => ({ ok: true, json: async () => payload([
      { name: 'Bad area', label_location: { latitude: '1.29', longitude: 103.85 } },
    ]) })

    const result = await api.getEventWeather('e-weather-demo')

    assert.deepEqual(result.areas, [])
    assert.equal(result.forecast.available, false)
    assert.match(result.forecast.reason, /areas are unavailable|choose a forecast area/i)
  })

  test('getEventWeather rejects non-owned events before its request', async () => {
    let requests = 0
    globalThis.fetch = async () => { requests++; return { ok: true, json: async () => payload() } }
    const db = JSON.parse(stored.get(KEY))
    db.events.find(event => event.id === 'e-weather-demo').organiserId = 'org2'
    stored.set(KEY, JSON.stringify(db))

    await assert.rejects(api.getEventWeather('e-weather-demo'), /Only the event owner/)
    assert.equal(requests, 0)
  })

  test('getEventWeather rechecks event ownership after its request', async () => {
    globalThis.fetch = async () => {
      const db = JSON.parse(stored.get(KEY))
      db.events.find(event => event.id === 'e-weather-demo').organiserId = 'org2'
      stored.set(KEY, JSON.stringify(db))
      return { ok: true, json: async () => payload() }
    }

    await assert.rejects(api.getEventWeather('e-weather-demo'), /Only the event owner/)
  })
})
