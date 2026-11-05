// A tiny expect() for Node's built-in test runner, so tests read like Jest/Vitest without
// adding a package: expect(actual).toBe(expected), .toEqual, .toContain, .toHaveLength and .not.
import assert from 'node:assert/strict'

const show = (value) => JSON.stringify(value)

export function expect(actual) {
  return {
    toBe: (expected) => assert.strictEqual(actual, expected),
    toEqual: (expected) => assert.deepStrictEqual(actual, expected),
    toContain: (item) => assert.ok(actual.includes(item), `Expected ${show(actual)} to contain ${show(item)}`),
    toHaveLength: (length) => assert.strictEqual(actual.length, length, `Expected length ${length}, got ${actual.length}`),
    not: {
      toBe: (expected) => assert.notStrictEqual(actual, expected),
      toEqual: (expected) => assert.notDeepStrictEqual(actual, expected),
      toContain: (item) => assert.ok(!actual.includes(item), `Expected ${show(actual)} not to contain ${show(item)}`),
    },
  }
}
