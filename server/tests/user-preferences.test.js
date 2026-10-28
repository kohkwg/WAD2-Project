const test = require('node:test');
const { checkEqual, checkDeepEqual, checkTrue } = require('./checks');
const { buildUserPreferences } = require('../services/userPreferences');

test('selected interests receive 10 each, duplicates once; no history leaves learned empty', () => {
  checkDeepEqual(buildUserPreferences(['technology', 'music', 'technology'], []), {
    explicitPreferences: { technology: 10, music: 10 },
    learnedPreferences: {},
    combinedPreferences: { technology: 10, music: 10 },
  });
  checkDeepEqual(buildUserPreferences([], []), {
    explicitPreferences: {}, learnedPreferences: {}, combinedPreferences: {},
  });
});

test('duplicate events and tags do not multiply evidence in the agreed example', () => {
  const event = { eventId: 'event-1', contribution: 5, interests: ['pottery'] };
  checkDeepEqual(buildUserPreferences(['technology', 'music'], [
    event, { ...event },
    { eventId: 'event-2', contribution: 10, interests: ['music', 'technology', 'music'] },
  ]), {
    explicitPreferences: { technology: 10, music: 10 },
    learnedPreferences: { pottery: 5, music: 5, technology: 5 },
    combinedPreferences: { technology: 15, music: 15, pottery: 5 },
  });
});

test('distinct events accumulate and can outweigh explicit interests', () => {
  const result = buildUserPreferences(['technology'], [
    { eventId: 'pottery-1', contribution: 5, interests: ['pottery'] },
    { eventId: 'pottery-2', contribution: 15, interests: ['pottery'] },
  ]);
  checkEqual(result.learnedPreferences.pottery, 20);
  checkEqual(result.combinedPreferences.pottery, 20);
  checkEqual(result.explicitPreferences.technology, 10);
});

test('already-aged contribution is used directly; zero and empty-tag events add nothing', () => {
  const result = buildUserPreferences([], [
    { eventId: 'old-save', contribution: 2.5, basePoints: 5, ageMultiplier: 0.5, interests: ['pottery'] },
    { eventId: 'dismissed', contribution: 0, interests: ['music'] },
    { eventId: 'unclassified', contribution: 15, interests: [] },
  ]);
  checkDeepEqual(result.learnedPreferences, { pottery: 2.5 });
});

test('fractional shares retain precision and conserve the classified event contribution', () => {
  const result = buildUserPreferences([], [
    { eventId: 'mixed', contribution: 5, interests: ['music', 'pottery', 'technology'] },
  ]);
  for (const score of Object.values(result.learnedPreferences)) {
    checkEqual(score, 5 / 3);
  }
  const sum = Object.values(result.learnedPreferences).reduce((total, score) => total + score, 0);
  checkTrue(Math.abs(sum - 5) < 1e-12, 'Split evidence should preserve its total');
});

test('same initial choices diverge after different event evidence', () => {
  const interests = ['technology', 'music'];
  const a = buildUserPreferences(interests, [{ eventId: 'coding', contribution: 15, interests: ['technology'] }]);
  const b = buildUserPreferences(interests, [{ eventId: 'concert', contribution: 15, interests: ['music'] }]);
  checkDeepEqual(a.explicitPreferences, b.explicitPreferences);
  checkDeepEqual(a.combinedPreferences, { technology: 25, music: 10 });
  checkDeepEqual(b.combinedPreferences, { technology: 10, music: 25 });
});

test('inputs remain unchanged and returned score objects are independent', () => {
  const interests = Object.freeze(['music']);
  const events = Object.freeze([Object.freeze({ eventId: 'concert', contribution: 5, interests: Object.freeze(['music']) })]);
  const result = buildUserPreferences(interests, events);
  checkEqual(result.explicitPreferences.music, 10);
  checkEqual(result.learnedPreferences.music, 5);
  checkEqual(result.combinedPreferences.music, 15);
  result.combinedPreferences.music = 100;
  checkEqual(result.explicitPreferences.music, 10);
  checkEqual(result.learnedPreferences.music, 5);
  checkEqual(events[0].contribution, 5);
});
