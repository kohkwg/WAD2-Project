const test = require('node:test');
const { checkEqual, checkDeepEqual, checkTrue, checkThrows } = require('./checks');
const { calculateInterestSimilarity, selectDiverseEvents } = require('../services/diverseEvents');

const candidate = (eventId, compatibilityScore, interests) => ({ eventId, compatibilityScore, interests });
const examples = [
  candidate('a', 80, ['pottery']),
  candidate('b', 75, ['pottery']),
  candidate('c', 65, ['music']),
];

test('Jaccard similarity handles identical, disjoint, partial and duplicate tags', () => {
  checkEqual(calculateInterestSimilarity(['pottery'], ['pottery']), 1);
  checkEqual(calculateInterestSimilarity(['pottery'], ['music']), 0);
  checkEqual(calculateInterestSimilarity(['music', 'live'], ['music', 'jazz']), 1 / 3);
  checkEqual(calculateInterestSimilarity(['music', 'music'], ['music']), 1);
  checkEqual(calculateInterestSimilarity(['music', 'jazz'], ['music', 'live']), 1 / 3);
});

test('missing and empty tags have zero similarity and do not crash selection', () => {
  for (const tags of [[], undefined, null, 'music']) {
    checkEqual(calculateInterestSimilarity(tags, ['music']), 0);
    checkEqual(calculateInterestSimilarity(tags, []), 0);
  }
  // Synthetic positive scores exercise selector robustness. In the actual
  // pipeline, compatibility gives events without tags a zero score.
  const results = selectDiverseEvents([candidate('a', 80), candidate('b', 70, [])], 2);
  checkDeepEqual(results.map(event => event.rankingScore), [80, 70]);
});

test('agreed example selects A → C → B and keeps compatibility separate', () => {
  const results = selectDiverseEvents(examples, 3);
  checkDeepEqual(results.map(event => event.eventId), ['a', 'c', 'b']);
  checkDeepEqual(results.map(event => event.compatibilityScore), [80, 65, 75]);
  checkDeepEqual(results.map(event => event.rankingScore), [80, 65, 52.5]);
});

test('partial tag overlap applies a proportional penalty', () => {
  const results = selectDiverseEvents([
    candidate('a', 90, ['music', 'live']),
    candidate('b', 80, ['music', 'jazz']),
  ], 2);
  checkEqual(results[1].rankingScore, 72);
});

test('ties preserve input order, including ties created by the penalty', () => {
  const equal = [candidate('b', 50, ['music']), candidate('a', 50, ['pottery'])];
  checkDeepEqual(selectDiverseEvents(equal, 2).map(event => event.eventId), ['b', 'a']);
  const adjustedTie = [candidate('first', 100, ['music']), candidate('earlier', 100, ['music']), candidate('later', 70, ['pottery'])];
  checkDeepEqual(selectDiverseEvents(adjustedTie, 3).map(event => event.eventId), ['first', 'earlier', 'later']);
});

test('zero penalty produces compatibility ordering and full penalty permits zero adjusted scores', () => {
  const ordinary = selectDiverseEvents(examples, 3, 0);
  checkDeepEqual(ordinary.map(event => event.eventId), ['a', 'b', 'c']);
  for (const event of ordinary) checkEqual(event.rankingScore, event.compatibilityScore);
  const full = selectDiverseEvents([candidate('a', 80, ['music']), candidate('b', 70, ['music'])], 2, 1);
  checkEqual(full.length, 2);
  checkEqual(full[1].rankingScore, 0);
});

test('penalty uses maximum similarity and original score without compounding', () => {
  const results = selectDiverseEvents([
    candidate('a', 100, ['music']),
    candidate('b', 90, ['music', 'live']),
    candidate('c', 80, ['music']),
  ], 3);
  checkDeepEqual(results.map(event => event.eventId), ['a', 'b', 'c']);
  checkEqual(results[1].rankingScore, 76.5);
  checkEqual(results[2].rankingScore, 56);
});

test('empty input, zero limit and oversized limit return only available matches', () => {
  checkDeepEqual(selectDiverseEvents([], 5), []);
  checkDeepEqual(selectDiverseEvents(examples, 0), []);
  checkEqual(selectDiverseEvents(examples, 100).length, 3);
});

test('duplicate event IDs are selected once and zero-compatibility events are excluded', () => {
  const results = selectDiverseEvents([
    examples[0], { ...examples[0] }, candidate('zero', 0, ['sports']), examples[2],
  ], 10);
  checkDeepEqual(results.map(event => event.eventId), ['a', 'c']);
  checkDeepEqual(selectDiverseEvents([candidate('zero', 0, ['music'])], 3), []);
});

test('invalid limits and penalties throw descriptive range errors', () => {
  for (const limit of [-1, 2.5, NaN, Infinity, undefined, '2']) {
    checkThrows(() => selectDiverseEvents(examples, limit), RangeError);
  }
  for (const penalty of [-0.1, 1.1, NaN, Infinity, null, '0.3']) {
    checkThrows(() => selectDiverseEvents(examples, 3, penalty), RangeError);
  }
});

test('selection returns new objects and leaves the original array, scores and tags unchanged', () => {
  const input = Object.freeze(examples.map(event => Object.freeze({
    ...event, interests: Object.freeze([...event.interests]),
  })));
  const results = selectDiverseEvents(input, 3);
  checkDeepEqual(input.map(event => event.eventId), ['a', 'b', 'c']);
  checkDeepEqual(input.map(event => event.compatibilityScore), [80, 75, 65]);
  checkTrue(results[0] !== input[0], 'Selected objects must be copies');
  checkTrue(input.every(event => !Object.hasOwn(event, 'rankingScore')));
  results[0].compatibilityScore = 1;
  checkEqual(input[0].compatibilityScore, 80);
});
