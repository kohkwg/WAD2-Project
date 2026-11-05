import test from 'node:test'
import assert from 'node:assert/strict'
import { livePlanView as toPlan } from '../groups.js'
import { slotCells } from '../groups.js'

const event = { startTime: '2026-12-05T11:00:00Z', endTime: '2026-12-05T13:00:00Z' }
const before = slotCells(event, 'before')
// Postgres sends timestamps as "+00:00"; the planner compares toISOString() values
const pg = (iso) => iso.replace('.000Z', '+00:00')

test('toPlan shapes the live plan like the demo and fits the best shared stretch', () => {
  const raw = {
    ...event,
    hostId: 'h',
    members: [{ id: 'h', name: 'Hana' }, { id: 'b', name: 'Bob' }, { id: 'c', name: 'Cara' }],
    choices: { before: 'i2', after: null },
    ideas: [
      { id: 'i1', slot: 'before', kind: 'custom', name: 'Lau Pa Sat', suggestedBy: 'b', suggestedByName: 'Bob', votes: 3, myVote: false },
      { id: 'i2', slot: 'before', kind: 'deal', name: 'Kopi Corner', suggestedBy: 'h', suggestedByName: 'Hana', votes: 1, myVote: true },
    ],
    availability: { h: { before: before.slice(4).map(pg) }, b: { before: before.slice(6).map(pg), after: [] } },
  }
  const plan = toPlan(raw, 'h')
  assert.equal(plan.before.fitted, true)
  assert.equal(plan.before.start, before[6])
  assert.deepEqual(plan.before.coming.map((p) => p.name), ['Hana', 'Bob'])
  assert.deepEqual(plan.before.noReply.map((p) => p.name), ['Cara'])
  assert.equal(plan.before.myCells[0], before[4])
  assert.equal(plan.before.memberCount, 3)
  // the host's pick comes first, then by votes; "mine" follows who suggested it
  assert.deepEqual(plan.before.suggestions.map((s) => [s.id, s.mine]), [['i2', true], ['i1', false]])
  assert.equal(plan.after.myCells, null)
  assert.deepEqual(plan.after.cant.map((p) => p.name), ['Bob'])
})
