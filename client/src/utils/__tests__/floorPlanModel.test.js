import test from 'node:test'
import assert from 'node:assert/strict'
import { programmePayload, singaporeInput, clampPosition, validateFloorImage, backgroundUrl, fitContain, clampOpacity, fitRotated, clampRotation, clampScale } from '../floorPlanModel.js'
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
test('background URL only comes from this event\'s floor-plan folder', () => {
  const base = 'https://images.example.test/'
  const key = 'floorplans/e1/p1/background/uuid-plan one.png'
  assert.equal(backgroundUrl(base, 'e1', key), 'https://images.example.test/floorplans/e1/p1/background/uuid-plan%20one.png')
  for (const bad of ['floorplans/e2/p1/a.png', 'covers/u/a.png', 'floorplans/e1/../e2/a.png', 'floorplans/e1/p1/a.png?x=1', 'floorplans/e1//a.png', '', null]) assert.equal(backgroundUrl(base, 'e1', bad), '')
  assert.equal(backgroundUrl('', 'e1', key), '')
})
test('background fits inside the floor area without stretching and opacity stays visible', () => {
  const box = { x: 20, y: 20, width: 860, height: 520 }
  const wide = fitContain(2000, 500, box)
  assert.equal(wide.width, 860); assert.equal(wide.height, 215); assert.equal(wide.x, 20); assert.equal(wide.y, 20 + (520 - 215) / 2)
  const tall = fitContain(500, 2000, box)
  assert.equal(tall.height, 520); assert.equal(tall.width, 130); assert.equal(tall.y, 20)
  assert.deepEqual(fitContain(0, 0, box), box)
  assert.equal(clampOpacity(0), 1); assert.equal(clampOpacity(0.01), 0.1); assert.equal(clampOpacity(5), 1); assert.equal(clampOpacity('0.5'), 0.5)
})
test('rotated background stays inside the floor area and rotates about the centre', () => {
  const box = { x: 20, y: 20, width: 860, height: 520 }
  const upright = fitRotated(800, 400, box, 0)
  assert.equal(upright.width, 860); assert.equal(upright.height, 430); assert.equal(upright.cx, 450); assert.equal(upright.cy, 280)
  const sideways = fitRotated(800, 400, box, 90)
  assert.ok(Math.abs(sideways.width - 520) < 1e-9); assert.ok(Math.abs(sideways.height - 260) < 1e-9); assert.equal(sideways.rotation, 90)
  for (const deg of [15, 45, 133, 270]) {
    const r = fitRotated(800, 400, box, deg), a = deg * Math.PI / 180
    assert.ok(r.width * Math.abs(Math.cos(a)) + r.height * Math.abs(Math.sin(a)) <= box.width + 1e-6)
    assert.ok(r.width * Math.abs(Math.sin(a)) + r.height * Math.abs(Math.cos(a)) <= box.height + 1e-6)
  }
  assert.equal(clampRotation(-90), 270); assert.equal(clampRotation(370), 10); assert.equal(clampRotation('x'), 0)
})
test('background size scales about the floor centre and is bounded', () => {
  const box = { x: 20, y: 20, width: 860, height: 520 }
  const base = fitRotated(800, 400, box, 0)
  const big = fitRotated(800, 400, box, 0, 2)
  assert.equal(big.width, base.width * 2); assert.equal(big.height, base.height * 2)
  assert.equal(big.cx, base.cx); assert.equal(big.cy, base.cy)
  assert.equal(fitRotated(800, 400, box, 0, undefined).width, base.width)
  assert.equal(clampScale(0.1), 0.5); assert.equal(clampScale(10), 3); assert.equal(clampScale('x'), 1); assert.equal(clampScale(1.5), 1.5)
})
