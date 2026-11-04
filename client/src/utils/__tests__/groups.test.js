import test from 'node:test'
import assert from 'node:assert/strict'
import { groupErrors, groupEventData, slotTimes, fitSlots, slotCells, availabilityError, mealLabel, suggestionFrom, suggestionErrors, emptyPlan, isGroup } from '../groups.js'

const event = { id: 'e1', title: 'Picnic', startTime: '2026-12-05T05:00:00Z', endTime: '2026-12-05T07:00:00Z', tags: ['food'], venue: { name: 'SMU Green', lat: 1.29, lng: 103.85 } }
const now = new Date('2026-12-01T00:00:00Z')

test('groupErrors checks the event, note, spots and visibility', () => {
  assert.deepEqual(groupErrors({ eventId: 'e1', capacity: 4 }, [event], now), [])
  const fields = groupErrors({ eventId: 'x', capacity: 20, visibility: 'secret', note: 'a'.repeat(201) }, [event], now).map((e) => e.field)
  assert.deepEqual(fields, ['event', 'note', 'capacity', 'visibility'])
})

test('groupEventData makes a private group with an invite token and an empty plan', () => {
  const group = groupEventData(event, { visibility: 'private', token: 'abc' })
  assert.ok(isGroup(group))
  assert.equal(group.hangout.visibility, 'private')
  assert.equal(group.hangout.inviteToken, 'abc')
  assert.deepEqual(group.plan, emptyPlan())
  assert.equal(groupEventData(event, {}).hangout.inviteToken.length, 16)
})

test('slotTimes fit an hour before and after with a 15-minute walk', () => {
  const t = slotTimes(event)
  assert.equal(t.before.start, '2026-12-05T03:45:00.000Z')
  assert.equal(t.before.end, '2026-12-05T04:45:00.000Z')
  assert.equal(t.after.start, '2026-12-05T07:15:00.000Z')
  assert.equal(mealLabel(t.before.start), 'Lunch') // 11:45 in Singapore
  assert.equal(mealLabel('2026-12-05T11:00:00Z'), 'Dinner') // 19:00
})

test('suggestions come from deals, places or typed names, without duplicates', () => {
  const deal = suggestionFrom({ kind: 'deal', id: 'd1', title: '1-for-1', merchant: 'Cafe', outlet: { lat: 1, lng: 2 }, source: { url: 'https://t.me/x' } })
  assert.equal(deal.name, 'Cafe')
  assert.equal(deal.sourceUrl, 'https://t.me/x')
  const plan = emptyPlan()
  plan.before.suggestions.push({ ...deal, id: 's1' })
  assert.equal(suggestionErrors(plan, 'before', deal), 'That place is already suggested.')
  assert.equal(suggestionErrors(plan, 'after', deal), '')
  assert.equal(suggestionErrors(plan, 'before', suggestionFrom({ name: '  ' })), 'Name the place you have in mind.')
  assert.equal(suggestionErrors(plan, 'during', deal), 'Choose before or after the event.')
})

test('slotCells gives twelve 15-minute cells each side, leaving a walk gap', () => {
  const before = slotCells(event, 'before')
  assert.equal(before.length, 12)
  assert.equal(before[0], '2026-12-05T01:45:00.000Z') // 3h15 before 05:00
  assert.equal(before[11], '2026-12-05T04:30:00.000Z') // last cell ends 04:45
  assert.equal(slotCells(event, 'after')[0], '2026-12-05T07:15:00.000Z')
  assert.equal(availabilityError(event, 'before', ['2026-12-05T09:00:00.000Z']), 'Those times are outside the planner. Refresh and try again.')
  assert.equal(availabilityError(event, 'before', before.slice(2)), '')
})

test('fitSlots picks the longest stretch with the most people free', () => {
  const before = slotCells(event, 'before')
  const availability = { a: { before: before.slice(4) }, b: { before: before.slice(6, 10) }, c: { before: [] } }
  const f = fitSlots(event, availability, ['a', 'b', 'c', 'd'])
  assert.equal(f.before.start, before[6]) // a and b both free in cells 6–9
  assert.equal(f.before.end, '2026-12-05T04:15:00.000Z')
  assert.deepEqual(f.before.coming, ['a', 'b'])
  assert.deepEqual(f.before.cant, ['c'])
  assert.deepEqual(f.before.noReply, ['d'])
  assert.deepEqual(f.before.cells[6].free, ['a', 'b'])
  // Nobody marked: the default hour
  assert.equal(f.after.fitted, false)
  assert.equal(f.after.start, slotTimes(event).after.start)
})
