import test from 'node:test'
import assert from 'node:assert/strict'
import { rankSlots, heatmap, previewSlot, rescueSuggestions, normaliseIntervals, rangeBounds } from '../hangoutSlots.js'
import { sgDateTime } from '../hangouts.js'

const range = { start: '2026-11-06', end: '2026-11-08' } // Fri–Sun
const at = (date, time) => sgDateTime(date, time).getTime()
const free = (date, from, to) => ({ start: at(date, from), end: at(date, to) })
const member = (id, intervals, extra = {}) => ({ id, name: id.toUpperCase(), required: false, responded: true, intervals, ...extra })

test('intervals are clipped to the range and merged when touching', () => {
  const bounds = rangeBounds(range)
  const merged = normaliseIntervals([free('2026-11-05', '20:00', '23:00'), free('2026-11-06', '10:00', '12:00'), free('2026-11-06', '12:00', '14:00')], bounds)
  assert.deepEqual(merged, [free('2026-11-06', '10:00', '14:00')])
})

test('no replies or a missing required reply produce no options', () => {
  assert.equal(rankSlots([member('a', [], { responded: false })], range).options.length, 0)
  const result = rankSlots([member('h', [free('2026-11-07', '10:00', '18:00')], { required: true }), member('b', [], { responded: false, required: true })], range)
  assert.equal(result.options.length, 0)
  assert.deepEqual(result.pendingRequired.map(m => m.id), ['b'])
})

test('ranking prefers more attendees, then weekend/band fit; no-reply stays separate', () => {
  const members = [
    member('h', [free('2026-11-06', '18:00', '23:00'), free('2026-11-07', '10:00', '20:00')], { required: true }),
    member('b', [free('2026-11-07', '12:00', '18:00')]),
    member('c', [free('2026-11-06', '18:00', '23:00')]),
    member('d', [], { responded: false }),
  ]
  const { options } = rankSlots(members, range)
  assert.ok(options.length >= 2)
  const best = options[0]
  assert.deepEqual(best.available.map(m => m.id).sort(), ['b', 'h'])
  assert.equal(best.start, at('2026-11-07', '12:00'))
  assert.equal(best.minutes, 300)
  assert.deepEqual(best.noReply.map(m => m.id), ['d'])
  assert.ok(options.every(o => o.available.some(m => m.id === 'h')))
  assert.ok(options.every(o => o.minutes >= 120))
  assert.equal(new Set(options.map(o => `${o.start}-${o.end}`)).size, options.length)
})

test('windows split at midnight and short windows are discarded', () => {
  const members = [member('h', [{ start: at('2026-11-06', '22:30'), end: at('2026-11-07', '01:30') }])]
  assert.equal(rankSlots(members, range).options.length, 0)
  assert.equal(rankSlots(members, range, { minMinutes: 60 }).options.length, 2)
})

test('heatmap counts only fully covered cells and hides individuals', () => {
  const members = [member('a', [{ start: at('2026-11-06', '10:15'), end: at('2026-11-06', '11:00') }]), member('b', [free('2026-11-06', '10:00', '11:00')])]
  const map = heatmap(members, range)
  const cell = start => map.cells.find(c => c.start === at('2026-11-06', start)).count
  assert.equal(cell('10:00'), 1)
  assert.equal(cell('10:30'), 2)
  assert.equal(map.responders, 2)
  assert.ok(map.cells.every(c => Object.keys(c).join() === 'start,count'))
})

test('custom slot preview blocks on required members and never treats no-reply as free', () => {
  const members = [member('h', [free('2026-11-07', '10:00', '16:00')], { required: true }), member('b', [free('2026-11-07', '13:00', '16:00')], { required: true }), member('c', [], { responded: false })]
  const blocked = previewSlot(members, range, { start: at('2026-11-07', '11:00'), end: at('2026-11-07', '15:00') })
  assert.equal(blocked.ok, false)
  assert.match(blocked.blockers[0], /B is required/)
  const ok = previewSlot(members, range, { start: at('2026-11-07', '13:00'), end: at('2026-11-07', '15:00') })
  assert.equal(ok.ok, true)
  assert.deepEqual(ok.noReply.map(m => m.id), ['c'])
  assert.equal(previewSlot(members, range, { start: at('2026-11-09', '13:00'), end: at('2026-11-09', '15:00') }).ok, false)
})

test('rescue suggestions are explicit choices', () => {
  const members = [member('h', [free('2026-11-07', '10:00', '13:00')], { required: true }), member('b', [free('2026-11-07', '15:00', '18:00')], { required: true })]
  const kinds = rescueSuggestions(members, range, 'h').map(s => s.kind)
  assert.deepEqual(kinds, ['optional', 'extend'])
  assert.equal(rescueSuggestions([member('h', [free('2026-11-07', '10:00', '11:00')], { required: true })], range, 'h').some(s => s.kind === 'shorter'), true)
})

test('grid cells round inward and merge back into intervals', async () => {
  const { cellsFromIntervals, intervalsFromCells } = await import('../hangoutSlots.js')
  const cells = cellsFromIntervals([{ start: at('2026-11-06', '10:15'), end: at('2026-11-06', '12:00') }])
  assert.deepEqual([...cells], [at('2026-11-06', '10:30'), at('2026-11-06', '11:00'), at('2026-11-06', '11:30')])
  assert.deepEqual(intervalsFromCells(cells), [free('2026-11-06', '10:30', '12:00')])
})
