import test from 'node:test'
import assert from 'node:assert/strict'
import { programmePayload, singaporeInput, clampPosition, validateFloorImage } from '../floorPlanModel.js'
test('programme uses explicit Singapore times and trims optional content', () => {
  const row = programmePayload({ title: ' Opening ', starts_at: '2026-11-01T09:00', ends_at: '2026-11-01T10:00', description: ' ', zone_key: 'stage' }, [{ id: 'stage' }])
  assert.equal(row.starts_at, '2026-11-01T01:00:00.000Z')
  assert.equal(row.ends_at, '2026-11-01T02:00:00.000Z')
  assert.equal(row.title, 'Opening'); assert.equal(row.description, null)
  assert.equal(singaporeInput(row.starts_at), '2026-11-01T09:00')
})
test('programme refuses missing title, invalid chronology, or deleted zone', () => {
  const row = { title: 'Item', starts_at: '2026-11-01T09:00' }
  assert.throws(() => programmePayload({ ...row, title: ' ' }), /title/)
  assert.throws(() => programmePayload({ ...row, starts_at: '' }), /start time/)
  assert.throws(() => programmePayload({ ...row, ends_at: '2026-11-01T08:59' }), /after/)
  assert.throws(() => programmePayload({ ...row, zone_key: 'missing' }), /existing zone/)
})
test('keyboard/canvas placement clamps all edges and non-numeric inputs', () => {
  assert.deepEqual(clampPosition({ radius: 20 }, -100, 9999), { x: 40, y: 486 })
  assert.deepEqual(clampPosition({ width: 130, height: 70 }, 9999, -100), { x: 750, y: 20 })
  assert.deepEqual(clampPosition({ radius: 20 }, 'bad', ''), { x: 40, y: 40 })
})
test('public image validates content type and size before requesting upload', () => {
  assert.throws(() => validateFloorImage({ type: 'image/svg+xml', size: 100 }), /JPEG/)
  assert.throws(() => validateFloorImage({ type: 'image/png', size: 11 * 1024 * 1024 }), /10 MiB/)
  assert.throws(() => validateFloorImage({ type: 'image/png', size: 0 }), /10 MiB/)
  assert.doesNotThrow(() => validateFloorImage({ type: 'image/webp', size: 100 }))
})
