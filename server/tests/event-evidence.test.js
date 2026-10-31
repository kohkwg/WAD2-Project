const test = require('node:test');
const { checkTrue, checkEqual, checkDeepEqual, checkThrows } = require('./checks');
const { calculateEventEvidence } = require('../services/eventEvidence');

const NOW = Date.parse('2026-10-27T12:00:00Z');
const DAY = 86_400_000;
const ago = days => new Date(NOW - days * DAY).toISOString();
const active = days => ({ active: true, timestamp: ago(days) });
const attended = days => ({ verified: true, timestamp: ago(days) });
const evidence = fields => calculateEventEvidence({ eventId: 'pottery-1', ...fields }, { now: NOW });

test('no history contributes zero', () => {
  checkDeepEqual(evidence({}), {
    eventId: 'pottery-1', effectiveAction: 'none', effectiveTimestamp: null,
    basePoints: 0, ageMultiplier: 0, contribution: 0,
  });
});

test('save, RSVP and attendance on one event contribute 15 total', () => {
  const result = evidence({ save: active(5), rsvp: active(3), attendance: attended(1) });
  checkEqual(result.effectiveAction, 'attend');
  checkEqual(result.effectiveTimestamp, ago(1));
  checkEqual(result.contribution, 15);
});

test('recalculating an unchanged RSVP snapshot never accumulates points or refreshes time', () => {
  const recent = { rsvp: active(1) };
  checkEqual(evidence(recent).contribution, 10);
  checkDeepEqual(evidence(recent), evidence(recent));
  const snapshot = { rsvp: active(40) };
  checkDeepEqual(evidence(snapshot), evidence(snapshot));
  checkEqual(evidence(snapshot).basePoints, 10);
  checkEqual(evidence(snapshot).contribution, 5);
  checkEqual(evidence(snapshot).effectiveTimestamp, ago(40));
});

test('two distinct recent attendances contribute 30 before topic propagation', () => {
  const results = ['pottery-1', 'pottery-2'].map((eventId, index) =>
    evidence({ eventId, attendance: attended(index * 14) }));
  checkEqual(new Set(results.map(result => result.eventId)).size, 2);
  checkEqual(results.reduce((sum, result) => sum + result.contribution, 0), 30);
});

test('cancelled RSVP falls back to original save; verified attendance remains strongest', () => {
  const snapshot = { save: active(20), rsvp: { ...active(10), active: false } };
  checkEqual(evidence(snapshot).contribution, 5);
  checkEqual(evidence(snapshot).effectiveTimestamp, ago(20));
  checkEqual(evidence({ ...snapshot, attendance: attended(1) }).contribution, 15);
  checkEqual(evidence({ save: { ...active(1), active: false } }).contribution, 0);
});

test('UTC ageing handles exact boundaries, 45 days and 91 days', () => {
  for (const [ageMs, expected] of [
    [0, 15], [30 * DAY, 15], [30 * DAY + 1, 7.5],
    [45 * DAY, 7.5], [90 * DAY, 7.5], [90 * DAY + 1, 0], [91 * DAY, 0],
  ]) {
    checkEqual(evidence({ attendance: { verified: true, timestamp: NOW - ageMs } }).contribution, expected);
  }
});

test('recent attendance replaces old RSVP; old attendance does not fall back to a recent save', () => {
  checkEqual(evidence({ rsvp: active(40), attendance: attended(1) }).contribution, 15);
  const result = evidence({ save: active(1), attendance: attended(100) });
  checkEqual(result.effectiveAction, 'attend');
  checkEqual(result.contribution, 0);
});

test('dismissal suppresses saved and attended evidence without mutating history', () => {
  for (const positive of [{ save: active(1) }, { attendance: attended(1) }]) {
    const snapshot = { ...positive, dismissed: true };
    const before = JSON.stringify(snapshot);
    const result = evidence(snapshot);
    checkEqual(result.effectiveAction, 'not_interested');
    checkEqual(result.contribution, 0);
    checkDeepEqual(evidence(snapshot), result);
    checkEqual(JSON.stringify(snapshot), before);
    checkTrue(evidence({ ...snapshot, dismissed: false }).contribution > 0);
  }
});

test('undo dismissal uses original evidence age and affects only that event', () => {
  checkEqual(evidence({ save: active(40), dismissed: false }).contribution, 2.5);
  checkEqual(evidence({ attendance: attended(100), dismissed: false }).contribution, 0);
  checkEqual(evidence({ eventId: 'pottery-1', save: active(1), dismissed: true }).contribution, 0);
  checkEqual(evidence({ eventId: 'pottery-2', save: active(1) }).contribution, 5);
});

test('timezone offsets represent the same instant', () => {
  checkEqual(evidence({ save: { active: true, timestamp: '2026-10-27T20:00:00+08:00' } }).contribution, 5);
});

test('unverified attendance is ignored and invalid selected timestamps are rejected', () => {
  checkEqual(evidence({ attendance: { verified: false, timestamp: ago(1) }, save: active(1) }).contribution, 5);
  for (const timestamp of [null, undefined, '', 'yesterday', '2026-10-27T12:00:00', NOW + 1, Infinity]) {
    checkThrows(() => evidence({ rsvp: { active: true, timestamp } }));
  }
  checkThrows(() => evidence({ eventId: '' }), TypeError);
  checkThrows(() => evidence({ dismissed: 'false' }), TypeError);
  checkThrows(() => calculateEventEvidence({ eventId: 'x' }, { now: NaN }), TypeError);
});
