import test from 'node:test'
import assert from 'node:assert/strict'
const helpers = await import('../feature4.js').catch(() => ({}))

test('money parsing keeps exact cents and rejects negative, malformed, or overly precise inputs', () => {
  assert.equal(typeof helpers.parseMoneyToCents, 'function')
  for (const [input, expected] of [['0', 0], ['12', 1200], ['12.3', 1230], ['0.29', 29], [' 1.01 ', 101], [2.34, 234]]) {
    assert.equal(helpers.parseMoneyToCents(input), expected)
  }
  assert.equal(helpers.parseMoneyToCents('', { allowBlank: true }), 0)
  for (const bad of ['', '-1', '-0', '1.001', '1e2', 'NaN', '1,000', 'Infinity', null, undefined, {}, '90071992547409.92']) {
    assert.throws(() => helpers.parseMoneyToCents(bad), /amount|money|decimal|cents/i)
  }
  assert.equal(helpers.formatMoney(123456), '$1,234.56')
})

test('budget totals and threshold warnings derive from actual spend without float errors', () => {
  assert.equal(typeof helpers.summariseBudget, 'function')
  assert.deepEqual(helpers.summariseBudget({ limitCents: null, items: [{ plannedCents: 29, actualCents: 10 }, { plannedCents: 1, actualCents: 20 }] }), {
    plannedCents: 30, actualCents: 30, remainingCents: null, percentage: null, level: 'unset',
  })
  for (const [actualCents, level, remainingCents] of [[8999, 'normal', 1001], [9000, 'warning', 1000], [9999, 'warning', 1], [10000, 'reached', 0], [10001, 'over', -1]]) {
    const summary = helpers.summariseBudget({ limitCents: 10000, items: [{ plannedCents: 12000, actualCents }] })
    assert.equal(summary.level, level)
    assert.equal(summary.remainingCents, remainingCents)
    assert.equal(summary.percentage, actualCents / 100)
  }
})

test('money formatting preserves every cent at the safe integer boundary, including negative remaining funds', () => {
  assert.equal(helpers.formatMoney(9007199254740991), '$90,071,992,547,409.91')
  assert.equal(helpers.formatMoney(9007199254740990), '$90,071,992,547,409.90')
  assert.equal(helpers.formatMoney(-9007199254740991), '-$90,071,992,547,409.91')
  assert.equal(helpers.formatMoney(0), '$0.00')
  assert.equal(helpers.formatMoney(-1), '-$0.01')
})

test('editing a valid money value round-trips exact cents without a floating-point division', () => {
  assert.equal(typeof helpers.formatMoneyInput, 'function')
  for (const [cents, input] of [[0, '0.00'], [29, '0.29'], [9007199254740990, '90071992547409.90'], [9007199254740991, '90071992547409.91']]) {
    assert.equal(helpers.formatMoneyInput(cents), input)
    assert.equal(helpers.parseMoneyToCents(helpers.formatMoneyInput(cents)), cents)
  }
})
