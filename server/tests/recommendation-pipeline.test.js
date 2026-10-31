const test = require('node:test');
const { checkEqual, checkDeepEqual, checkTrue, checkThrows } = require('./checks');
const { buildRecommendationPipeline } = require('../services/recommendationPipeline');

const NOW = Date.parse('2026-10-27T12:00:00Z');
const DAY = 86_400_000;
const iso = offset => new Date(NOW + offset).toISOString();
const attended = (eventId, days = 1) => ({
  eventId, attendance: { verified: true, timestamp: iso(-days * DAY) },
});
const candidate = (id, fields = {}) => ({
  id, title: id, status: 'published', starts_at: iso(DAY),
  registration_closes_at: null, capacity: 10, spots_left: 5, ...fields,
});
const run = fields => buildRecommendationPipeline({ now: NOW, limit: 8, ...fields });
const ids = result => result.recommendations.map(event => event.eventId);

test('identical explicit choices diverge after different verified attendance histories', () => {
  const input = {
    selectedInterests: ['technology', 'music'],
    candidateEvents: [candidate('coding'), candidate('concert')],
    eventInterestsById: { coding: ['technology'], concert: ['music'], pastCoding: ['technology'], pastMusic: ['music'] },
    limit: 1,
  };
  const a = run({ ...input, evidenceSnapshots: [attended('pastCoding')] });
  const b = run({ ...input, evidenceSnapshots: [attended('pastMusic')] });
  checkDeepEqual(a.preferences.explicitPreferences, b.preferences.explicitPreferences);
  checkDeepEqual(ids(a), ['coding']);
  checkDeepEqual(ids(b), ['concert']);
});

test('two historical pottery experiences create drift without recommending historical events', () => {
  const result = run({
    selectedInterests: ['technology'],
    evidenceSnapshots: [attended('old1'), attended('old2', 15)],
    eventInterestsById: { old1: ['pottery'], old2: ['pottery'], workshop: ['pottery'], tech: ['technology'] },
    candidateEvents: [candidate('tech'), candidate('workshop')],
    limit: 1,
  });
  checkEqual(result.preferences.learnedPreferences.pottery, 30);
  checkEqual(result.preferences.explicitPreferences.technology, 10);
  checkDeepEqual(ids(result), ['workshop']);
  checkEqual(result.recommendations[0].compatibilityScore, 75);
});

test('canonical save → RSVP → attendance evidence and identical duplicate snapshots count once', () => {
  const snapshot = {
    ...attended('past'), save: { active: true, timestamp: iso(-5 * DAY) },
    rsvp: { active: true, timestamp: iso(-3 * DAY) },
  };
  const result = run({ evidenceSnapshots: [snapshot, structuredClone(snapshot)], eventInterestsById: { past: ['pottery'] } });
  checkEqual(result.preferences.learnedPreferences.pottery, 15);
});

test('conflicting duplicate evidence, candidates and registration records are rejected', () => {
  checkThrows(() => run({ evidenceSnapshots: [attended('a'), { ...attended('a'), dismissed: true }] }), /Conflicting evidence/);
  checkThrows(() => run({ candidateEvents: [candidate('a'), candidate('a', { spots_left: 0 })] }), /Conflicting candidate/);
  checkThrows(() => run({ registrations: [{ event_id: 'a', status: 'confirmed' }, { event_id: 'a', status: 'cancelled' }] }), /Conflicting registration/);
});

test('dismissal removes positive evidence and blocks both feeds; undo restores original age', () => {
  const input = {
    evidenceSnapshots: [{ ...attended('a', 45), dismissed: true }],
    eventInterestsById: { a: ['pottery'] }, candidateEvents: [candidate('a')],
  };
  const dismissed = run(input);
  checkDeepEqual(dismissed.preferences.learnedPreferences, {});
  checkDeepEqual(ids(dismissed), []);
  const restored = run({ ...input, evidenceSnapshots: [{ ...input.evidenceSnapshots[0], dismissed: false }] });
  checkEqual(restored.preferences.learnedPreferences.pottery, 7.5);
  checkEqual(restored.recommendations[0].source, 'personalised');
});

test('ageing uses the supplied time and evidence over 90 days loses influence', () => {
  const input = {
    evidenceSnapshots: [attended('past')], eventInterestsById: { past: ['pottery'], future: ['pottery'] },
    candidateEvents: [candidate('future', { starts_at: iso(200 * DAY) })],
  };
  checkEqual(run(input).recommendations[0].source, 'personalised');
  const later = run({ ...input, now: NOW + 100 * DAY });
  checkDeepEqual(later.preferences.learnedPreferences, {});
  checkEqual(later.recommendations[0].source, 'general_discovery');
  checkEqual(later.recommendations[0].compatibilityScore, 0);
});

test('active registration statuses block both feeds; expired offers use actual offer_expires_at', () => {
  const rows = [
    { event_id: 'confirmed', status: 'confirmed' },
    { event_id: 'pending', status: 'pending' },
    { event_id: 'waitlisted', status: 'waitlisted' },
    { event_id: 'activeOffer', status: 'offered', offer_expires_at: iso(1) },
    { event_id: 'expiredOffer', status: 'offered', offer_expires_at: iso(-1) },
    { event_id: 'exactExpiry', status: 'offered', offer_expires_at: iso(0) },
    { event_id: 'cancelled', status: 'cancelled' },
  ];
  const candidates = rows.map(row => candidate(row.event_id));
  for (const selectedInterests of [[], ['pottery']]) {
    const result = run({ selectedInterests, registrations: rows, candidateEvents: candidates,
      eventInterestsById: Object.fromEntries(rows.map(row => [row.event_id, ['pottery']])) });
    checkDeepEqual(ids(result), ['cancelled', 'exactExpiry', 'expiredOffer']);
  }
});

test('malformed offer expiry or registration status excludes candidate with diagnostics', () => {
  const result = run({
    registrations: [
      { event_id: 'bad', status: 'offered', offer_expires_at: null },
      { event_id: 'unknown', status: 'unexpected' },
    ], candidateEvents: [candidate('bad'), candidate('unknown')],
  });
  checkDeepEqual(ids(result), []);
  checkDeepEqual(result.diagnostics.map(entry => entry.reason), ['invalid_offer_expiry', 'invalid_registration_status']);
});

test('eligibility excludes unpublished, started, closed, full and unknown-availability events', () => {
  const result = run({ candidateEvents: [
    candidate('draft', { status: 'draft' }), candidate('cancelled', { status: 'cancelled' }),
    candidate('past', { starts_at: iso(-1) }), candidate('now', { starts_at: iso(0) }),
    candidate('closed', { registration_closes_at: iso(-1) }),
    candidate('deadlineNow', { registration_closes_at: iso(0) }),
    candidate('full', { spots_left: 0 }), candidate('unknown', { spots_left: null }),
    candidate('invalidDate', { starts_at: 'bad' }), candidate('invalidDeadline', { registration_closes_at: 'bad' }),
    candidate('invalidCapacity', { capacity: undefined }),
    candidate('open', { registration_closes_at: iso(1) }),
    candidate('unlimited', { capacity: null, spots_left: null }),
  ], eventInterestsById: { open: ['pottery'], unlimited: ['sports'] } });
  checkDeepEqual(ids(result), ['open', 'unlimited']);
  checkTrue(result.diagnostics.some(entry => entry.reason === 'unknown_or_invalid_availability'));
  checkTrue(result.diagnostics.some(entry => entry.reason === 'invalid_start_time'));
});

test('fallback fills remaining slots chronologically with actual scores and null ranking', () => {
  const result = run({ selectedInterests: ['pottery'], limit: 3,
    candidateEvents: [candidate('personal', { starts_at: iso(3 * DAY) }), candidate('general2', { starts_at: iso(2 * DAY) }), candidate('general1')],
    eventInterestsById: { personal: ['pottery'], general1: ['music'], general2: ['sports'] },
  });
  checkDeepEqual(ids(result), ['personal', 'general1', 'general2']);
  checkEqual(result.recommendations[0].compatibilityScore, 50);
  for (const event of result.recommendations.slice(1)) {
    checkEqual(event.source, 'general_discovery');
    checkEqual(event.compatibilityScore, 0);
    checkEqual(event.rankingScore, null);
  }
});

test('cold-start fallback and personalised ties are deterministic across candidate input order', () => {
  const candidates = [candidate('b'), candidate('a'), candidate('early', { starts_at: iso(DAY / 2) })];
  const mapping = { a: ['music'], b: ['music'], early: ['music'] };
  for (const selectedInterests of [[], ['music']]) {
    const input = { candidateEvents: candidates, eventInterestsById: mapping, selectedInterests };
    checkDeepEqual(ids(run(input)), ['early', 'a', 'b']);
    checkDeepEqual(run(input), run({ ...input, candidateEvents: [...candidates].reverse() }));
  }
});

test('missing mappings produce diagnostics and no fabricated preference or compatibility', () => {
  const result = run({ selectedInterests: ['music'], evidenceSnapshots: [attended('historical')], candidateEvents: [candidate('unclassified')] });
  checkDeepEqual(result.preferences.learnedPreferences, {});
  checkEqual(result.recommendations[0].compatibilityScore, 0);
  checkEqual(result.recommendations[0].source, 'general_discovery');
  checkDeepEqual(result.diagnostics, [
    { eventId: 'historical', reason: 'missing_interest_mapping' },
    { eventId: 'unclassified', reason: 'missing_interest_mapping' },
  ]);
});

test('real compatibility feeds diversity, preserving scores and avoiding duplicate candidates', () => {
  const result = run({ selectedInterests: ['pottery', 'music'],
    evidenceSnapshots: [attended('p1'), attended('p2'), { eventId: 'm1', save: { active: true, timestamp: iso(-DAY) } }],
    eventInterestsById: { p1: ['pottery'], p2: ['pottery'], m1: ['music'], a: ['pottery'], b: ['pottery'], c: ['music'] },
    candidateEvents: [candidate('a'), candidate('b'), candidate('a'), candidate('c')],
  });
  checkDeepEqual(ids(result), ['a', 'c', 'b']);
  checkDeepEqual(result.recommendations.map(event => event.compatibilityScore), [80, 60, 80]);
  checkDeepEqual(result.recommendations.map(event => event.rankingScore), [80, 60, 56]);
});

test('now is required and validated even on empty input; equivalent zones agree', () => {
  for (const now of [undefined, null, NaN, Infinity, new Date('bad'), 'bad', '2026-10-27T12:00:00']) {
    checkThrows(() => run({ now }), TypeError);
  }
  checkDeepEqual(run({ now: new Date(NOW) }), run({ now: '2026-10-27T20:00:00+08:00' }));
  checkThrows(() => run({ limit: 2.5 }), RangeError);
  checkThrows(() => run({ diversityPenalty: 2 }), RangeError);
  checkDeepEqual(run({ limit: 0 }).recommendations, []);
});

test('cancellation fallback and evidence timestamps remain owned by the evidence function', () => {
  const result = run({ evidenceSnapshots: [{ eventId: 'past',
    save: { active: true, timestamp: iso(-45 * DAY) },
    rsvp: { active: false, timestamp: iso(-DAY) },
  }], eventInterestsById: { past: ['music'] } });
  checkEqual(result.preferences.learnedPreferences.music, 2.5);
  checkThrows(() => run({ evidenceSnapshots: [{ eventId: 'future', attendance: { verified: true, timestamp: iso(1) } }] }), RangeError);
});

test('inputs are not mutated and unrelated candidates do not change compatibility', () => {
  const input = { selectedInterests: ['music'], evidenceSnapshots: [attended('past')],
    candidateEvents: [candidate('a')], eventInterestsById: { past: ['music'], a: ['music'], b: ['sports'] } };
  const original = structuredClone(input);
  function freeze(value) {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  }
  freeze(input);
  const first = run(input);
  const extended = run({ ...input, candidateEvents: [...input.candidateEvents, candidate('b')] });
  checkEqual(first.recommendations[0].compatibilityScore, extended.recommendations[0].compatibilityScore);
  checkDeepEqual(input, original);
  checkDeepEqual(first, run(input));
});
