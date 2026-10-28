const test = require('node:test');
const { checkEqual, checkTrue } = require('./checks');
const { calculateCompatibility } = require('../services/eventCompatibility');
const { buildUserPreferences } = require('../services/userPreferences');

const preferences = { pottery: 20, music: 10 };
const examples = [
  { tags: ['pottery'], expected: 200 / 3 },
  { tags: ['music'], expected: 50 },
  { tags: ['pottery', 'music'], expected: 175 / 3 },
  { tags: ['pottery', 'sports'], expected: 100 / 3 },
  { tags: ['pottery', 'pottery'], expected: 200 / 3 },
];

for (const example of examples) {
  test(`agreed example: ${example.tags.join(', ')} → ${example.expected}`, () => {
    const score = calculateCompatibility(preferences, example.tags);
    checkTrue(Math.abs(score - example.expected) < 1e-10, `Unexpected compatibility: ${score}`);
  });
}

test('missing, empty or non-array event tags return zero', () => {
  for (const tags of [undefined, null, [], 'pottery']) {
    checkEqual(calculateCompatibility(preferences, tags), 0);
  }
});

test('empty preferences, unknown tags and zero points return zero', () => {
  checkEqual(calculateCompatibility({}, ['pottery']), 0);
  checkEqual(calculateCompatibility(preferences, ['sports']), 0);
  checkEqual(calculateCompatibility({ pottery: 0 }, ['pottery']), 0);
  // Inherited object properties are not preference evidence.
  checkEqual(calculateCompatibility({}, ['constructor', 'toString']), 0);
});

test('scores remain bounded and increase with preference points without rounding', () => {
  let previous = -1;
  for (const points of [0, 0.001, 5, 10, 20, 1000, Number.MAX_VALUE]) {
    const score = calculateCompatibility({ pottery: points }, ['pottery']);
    checkTrue(Number.isFinite(score) && score >= 0 && score <= 100, `Score outside bounds: ${score}`);
    checkTrue(score >= previous, 'More preference points must not reduce compatibility');
    previous = score;
  }
  const fractional = calculateCompatibility(preferences, ['pottery']);
  checkTrue(fractional !== Math.round(fractional), 'Return the unrounded score');
});

test('unrelated candidate events and unrelated preference points do not change a score', () => {
  const pottery = { interests: ['pottery'] };
  const original = calculateCompatibility(preferences, pottery.interests);
  const scores = [pottery, { interests: ['sports'] }].map(event =>
    calculateCompatibility(preferences, event.interests));
  checkEqual(scores[0], original);
  checkEqual(calculateCompatibility({ ...preferences, sports: 1000 }, pottery.interests), original);
});

test('explicit preferences start at 50 and behavioural evidence increases compatibility', () => {
  const initial = buildUserPreferences(['pottery'], []);
  checkEqual(calculateCompatibility(initial.combinedPreferences, ['pottery']), 50);
  const learned = buildUserPreferences(['pottery'], [
    { eventId: 'pottery-event', contribution: 10, interests: ['pottery'] },
  ]);
  checkTrue(Math.abs(calculateCompatibility(learned.combinedPreferences, ['pottery']) - 200 / 3) < 1e-10);
});

test('inputs stay unchanged and tag order does not change the score', () => {
  const points = Object.freeze({ ...preferences });
  const tags = Object.freeze(['pottery', 'music']);
  checkEqual(calculateCompatibility(points, tags), calculateCompatibility(points, ['music', 'pottery']));
  checkEqual(tags.length, 2);
  checkEqual(points.pottery, 20);
});
