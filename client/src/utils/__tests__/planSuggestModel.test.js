import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeTitle, likePattern, rankTitleSuggestions, resolveProgramme, applyPlan } from '../planSuggestModel.js'

const row = (title, organiser = 'other', starts = '2026-05-01T10:00:00Z') => ({ title, organiser_id: organiser, starts_at: starts })

test('title normalising and LIKE escaping', () => {
  assert.equal(normalizeTitle('  Coders   ASSEMBLY '), 'coders assembly')
  assert.equal(likePattern(' 100%_a\\ '), '%100\\%\\_a\\\\%')
})

test('suggestions put your own events first, then prefix matches, then popularity', () => {
  const rows = [
    row('Intro to Coding'), row('Coders Assembly'), row('Coders Assembly', 'other', '2026-06-01T10:00:00Z'), row('Coders Assembly'),
    row('Coding Night'), row('Coding Night'),
    row('Weekly coding club', 'me'),
  ]
  const result = rankTitleSuggestions(rows, 'cod', 'me')
  assert.deepEqual(result.map(r => r.title), ['Weekly coding club', 'Coders Assembly', 'Coding Night', 'Intro to Coding'])
  assert.equal(result[0].kind, 'own')
  assert.equal(result[1].kind, 'community')
})

test('suggestions merge names that differ only by case or spacing and use the latest spelling', () => {
  const rows = [row('Coders  Assembly', 'other', '2026-01-01T00:00:00Z'), row('CODERS ASSEMBLY', 'other', '2026-09-01T00:00:00Z')]
  assert.deepEqual(rankTitleSuggestions(rows, 'coders', 'me'), [{ title: 'CODERS ASSEMBLY', kind: 'community' }])
})

test('suggestions need two characters, respect the limit, and ignore bad rows', () => {
  assert.deepEqual(rankTitleSuggestions([row('Coders')], 'c', 'me'), [])
  assert.deepEqual(rankTitleSuggestions([null, { title: '' }, row('Coders')], 'co', 'me').map(r => r.title), ['Coders'])
  const many = Array.from({ length: 12 }, (_, i) => row(`Code ${i}`))
  assert.equal(rankTitleSuggestions(many, 'code', 'me', 6).length, 6)
})

test('programme fractions become real times inside the new event', () => {
  const items = [
    { title: 'Closing', description: '', startFraction: 0.9, durationFraction: 0.25 },
    { title: 'Welcome', description: 'Hi', startFraction: 0, durationFraction: 0.125 },
    { title: 'Mingle', description: '', startFraction: 0.5, durationFraction: null },
  ]
  const result = resolveProgramme(items, '2026-12-01T10:00:00Z', '2026-12-01T14:00:00Z')
  assert.deepEqual(result.map(r => r.title), ['Welcome', 'Mingle', 'Closing'])
  assert.deepEqual(result.map(r => r.position), [0, 1, 2])
  assert.equal(result[0].starts_at, '2026-12-01T10:00:00.000Z')
  assert.equal(result[0].ends_at, '2026-12-01T10:30:00.000Z') // 1/8 of 4h
  assert.equal(result[0].description, 'Hi')
  assert.equal(result[1].starts_at, '2026-12-01T12:00:00.000Z')
  assert.equal(result[1].ends_at, null)
  assert.equal(result[2].ends_at, '2026-12-01T14:00:00.000Z') // clipped to the event end
  assert.ok(result[2].starts_at < '2026-12-01T14:00:00.000Z')
})

test('programme fitting copes with invalid dates and shorter events', () => {
  assert.deepEqual(resolveProgramme([{ title: 'A', startFraction: 0 }], 'x', 'y'), [])
  assert.deepEqual(resolveProgramme([{ title: 'A', startFraction: 0 }], '2026-12-01T10:00:00Z', '2026-12-01T09:00:00Z'), [])
  const [item] = resolveProgramme([{ title: 'End', startFraction: 1, durationFraction: 0.5 }], '2026-12-01T10:00:00Z', '2026-12-01T10:30:00Z')
  assert.ok(Date.parse(item.starts_at) < Date.parse('2026-12-01T10:30:00Z'))
  assert.ok(Date.parse(item.ends_at) <= Date.parse('2026-12-01T10:30:00Z'))
})

test('applying a plan resumes after a failure without repeating items', async () => {
  const plan = {
    programme: [{ title: 'A', startFraction: 0, durationFraction: 0.1 }, { title: 'B', startFraction: 0.5, durationFraction: 0.1 }],
    tasks: [{ title: 'T1', notes: '', requestId: 'r1' }, { title: 'T2', notes: '', requestId: 'r2' }],
  }
  const dates = { startsAt: '2026-12-01T10:00:00Z', endsAt: '2026-12-01T14:00:00Z' }
  const added = []
  let failOn = 'T1'
  const deps = {
    addProgrammeItem: async (item) => { added.push(item.title) },
    addTask: async (task) => { if (task.title === failOn) throw new Error('network'); added.push(task.title) },
  }
  const progress = { programme: 0, tasks: 0 }
  await assert.rejects(applyPlan(plan, dates, progress, deps), /network/)
  assert.deepEqual(progress, { programme: 2, tasks: 0 })
  failOn = 'T2'
  await assert.rejects(applyPlan(plan, dates, progress, deps), /network/)
  assert.deepEqual(progress, { programme: 2, tasks: 1 })
  failOn = ''
  assert.deepEqual(await applyPlan(plan, dates, progress, deps), { total: 4, done: 4 })
  assert.deepEqual(added, ['A', 'B', 'T1', 'T2']) // nothing repeated
  assert.deepEqual(await applyPlan(plan, dates, progress, deps), { total: 4, done: 4 })
  assert.equal(added.length, 4)
})

test('applying an empty plan does nothing', async () => {
  const progress = { programme: 0, tasks: 0 }
  assert.deepEqual(await applyPlan(null, { startsAt: 'x', endsAt: 'y' }, progress, {}), { total: 0, done: 0 })
})
