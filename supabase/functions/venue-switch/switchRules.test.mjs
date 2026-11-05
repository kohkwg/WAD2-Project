import test from 'node:test'
import assert from 'node:assert/strict'
import { trustedRainEvidence } from './switchRules.mjs'

const now = Date.parse('2026-10-22T04:00:00Z')
const payload = {
  code: 0,
  data: {
    area_metadata: [
      { name: 'Central', label_location: { latitude: 1.30, longitude: 103.85 } },
      { name: 'West', label_location: { latitude: 1.35, longitude: 103.70 } },
    ],
    items: [{
      timestamp: '2026-10-22T03:45:00Z',
      update_timestamp: '2026-10-22T03:50:00Z',
      valid_period: { start: '2026-10-22T03:30:00Z', end: '2026-10-22T05:30:00Z' },
      forecasts: [{ area: 'Central', forecast: 'Light rain' }, { area: 'West', forecast: 'Cloudy' }],
    }],
  },
}
const event = {
  starts_at: '2026-10-22T04:30:00Z', ends_at: '2026-10-22T06:00:00Z',
  using_backup: false, status: 'published',
  venue: { latitude: 1.30, longitude: 103.85, is_indoor: false },
  backup_venue: { id: 'backup-id', name: 'Hall', address: '12 Example Road' },
}

test('derives rain area from the original venue coordinates, ignoring browser area choices', () => {
  assert.equal(trustedRainEvidence(payload, event, { now, areaName: 'West' }).area, 'Central')
})

test('fails closed when the original venue has no valid trusted coordinates', () => {
  assert.throws(() => trustedRainEvidence(payload, { ...event, venue: { latitude: null, longitude: null } }, { now }), /coordinates/)
})

test('fails closed for stale or currently invalid forecast windows', () => {
  const stale = structuredClone(payload)
  stale.data.items[0].timestamp = '2026-10-22T01:30:00Z'
  assert.throws(() => trustedRainEvidence(stale, event, { now }), /stale|valid/i)
})

test('fails closed when the nearest area does not forecast rain', () => {
  const dry = structuredClone(payload)
  dry.data.items[0].forecasts[0].forecast = 'Cloudy'
  assert.throws(() => trustedRainEvidence(dry, event, { now }), /rain|showers/i)
})

test('requires outdoor published event with an addressed backup and event time in forecast window', () => {
  assert.throws(() => trustedRainEvidence(payload, { ...event, venue: { ...event.venue, is_indoor: true } }, { now }), /outdoor/i)
  assert.throws(() => trustedRainEvidence(payload, { ...event, backup_venue: null }, { now }), /backup/i)
  assert.throws(() => trustedRainEvidence(payload, { ...event, status: 'draft' }, { now }), /published/i)
  assert.throws(() => trustedRainEvidence(payload, { ...event, starts_at: '2026-10-22T05:45:00Z' }, { now }), /forecast window/i)
})
