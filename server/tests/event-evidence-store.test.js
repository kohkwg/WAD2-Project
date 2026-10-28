const test = require('node:test');
const { checkEqual, checkDeepEqual, checkThrows, checkRejects } = require('./checks');
const { createEventEvidenceStore } = require('../services/eventEvidenceStore');
const { calculateEventEvidence } = require('../services/eventEvidence');

const EVENT = '11111111-1111-4111-8111-111111111111';
const NOW = Date.parse('2026-10-27T12:00:00Z');
const DAY = 86_400_000;

// Contract fixture only. Does not execute SQL or establish database concurrency,
// RLS, atomicity or grants. Authoritative RSVP/check-in inputs live outside the
// preference action API, as they must in production.
function fixture() {
  let clock = NOW - 20 * DAY;
  const rows = new Map();
  const registrations = new Map();
  const checkIns = new Map();
  const calls = [];
  const key = (token, event) => `${token}:${event}`;
  const iso = () => new Date(clock).toISOString();
  function rowFor(token, event) {
    const k = key(token, event);
    if (!rows.has(k)) rows.set(k, { save: { active: false, timestamp: null }, dismissed: false, firstConfirmedAt: null });
    return rows.get(k);
  }
  function snapshot(token, event) {
    const row = rowFor(token, event);
    const reg = registrations.get(key(token, event));
    const attendance = checkIns.get(key(token, event));
    return {
      eventId: event,
      save: { ...row.save },
      rsvp: { active: reg?.status === 'confirmed', timestamp: row.firstConfirmedAt },
      attendance: { verified: !!attendance && !attendance.flagged, timestamp: attendance?.timestamp ?? null },
      dismissed: row.dismissed,
    };
  }
  return {
    calls,
    setTime(time) { clock = time; },
    register(token, event, status = 'confirmed') {
      const row = rowFor(token, event);
      if (status === 'confirmed') row.firstConfirmedAt ??= iso();
      registrations.set(key(token, event), { status });
    },
    cancel(token, event) { registrations.set(key(token, event), { status: 'cancelled' }); },
    checkIn(token, event, flagged = false) { checkIns.set(key(token, event), { timestamp: iso(), flagged }); },
    removeCheckIn(token, event) { checkIns.delete(key(token, event)); },
    clientFactory(token) {
      return { async rpc(name, params) {
        calls.push({ token, name, params });
        const row = rowFor(token, params.p_event_id);
        if (name === 'set_recommendation_event_preference') {
          switch (params.p_action) {
            case 'save': row.save.timestamp ??= iso(); row.save.active = true; break;
            case 'unsave': row.save.active = false; break;
            case 'dismiss': row.dismissed = true; break;
            case 'undo_dismiss': row.dismissed = false; break;
            default: throw new Error('Unexpected fixture action');
          }
        } else if (name !== 'get_recommendation_event_evidence') throw new Error('Unexpected RPC');
        return { data: snapshot(token, params.p_event_id), error: null };
      } };
    },
  };
}

test('save → RSVP → attend → dismiss → undo returns one contribution and original dates', async () => {
  const db = fixture();
  const store = createEventEvidenceStore('alice', db);
  const points = snapshot => calculateEventEvidence(snapshot, { now: NOW }).contribution;
  const saved = await store.setPreference(EVENT, 'save');
  checkEqual(points(saved), 5);
  db.setTime(NOW - 10 * DAY);
  db.register('alice', EVENT);
  const registered = await store.getSnapshot(EVENT);
  checkEqual(points(registered), 10);
  db.setTime(NOW - DAY);
  db.checkIn('alice', EVENT);
  const attended = await store.getSnapshot(EVENT);
  checkEqual(points(attended), 15);
  const dismissed = await store.setPreference(EVENT, 'dismiss');
  checkEqual(points(dismissed), 0);
  checkEqual(dismissed.rsvp.active, true);
  checkDeepEqual(await store.setPreference(EVENT, 'dismiss'), dismissed);
  const restored = await store.setPreference(EVENT, 'undo_dismiss');
  checkDeepEqual(restored, attended);
  checkEqual(restored.save.timestamp, saved.save.timestamp);
  checkEqual(restored.rsvp.timestamp, registered.rsvp.timestamp);
  checkEqual(points(restored), 15);
});

test('cancellation falls back to saved date; resave and re-registration keep first dates', async () => {
  const db = fixture();
  const store = createEventEvidenceStore('alice', db);
  const saved = await store.setPreference(EVENT, 'save');
  db.register('alice', EVENT);
  const first = await store.getSnapshot(EVENT);
  db.setTime(NOW);
  db.cancel('alice', EVENT);
  const cancelled = await store.getSnapshot(EVENT);
  checkEqual(calculateEventEvidence(cancelled, { now: NOW }).contribution, 5);
  checkEqual(cancelled.save.timestamp, saved.save.timestamp);
  await store.setPreference(EVENT, 'unsave');
  const resaved = await store.setPreference(EVENT, 'save');
  checkEqual(resaved.save.timestamp, saved.save.timestamp);
  db.register('alice', EVENT);
  checkEqual((await store.getSnapshot(EVENT)).rsvp.timestamp, first.rsvp.timestamp);
});

test('adapter forwards caller token, no user ID or timestamp, and preserves errors', async () => {
  const db = fixture();
  const alice = createEventEvidenceStore('alice', db);
  const bob = createEventEvidenceStore('bob', db);
  await alice.setPreference(EVENT, 'save');
  checkEqual((await bob.getSnapshot(EVENT)).save.active, false);
  checkDeepEqual(db.calls[0], {
    token: 'alice', name: 'set_recommendation_event_preference',
    params: { p_event_id: EVENT, p_action: 'save' },
  });
  const failing = createEventEvidenceStore('alice', { clientFactory: () => ({
    rpc: async () => ({ data: null, error: { message: 'permission denied' } }),
  }) });
  await checkRejects(() => failing.getSnapshot(EVENT), 'Unable to persist or read');
  const missing = createEventEvidenceStore('alice', { clientFactory: () => ({
    rpc: async () => ({ data: null, error: null }),
  }) });
  await checkRejects(() => missing.getSnapshot(EVENT), 'Invalid event evidence response');
});

test('preference API cannot accept attendance, RSVP, forged fields or invalid identifiers', async () => {
  const db = fixture();
  const store = createEventEvidenceStore('alice', db);
  for (const action of ['attend', 'rsvp', 'cancel', { action: 'save', verified: true }, null]) {
    checkThrows(() => store.setPreference(EVENT, action), TypeError);
  }
  await checkRejects(() => store.getSnapshot('bad-id'), 'UUID');
  checkThrows(() => createEventEvidenceStore(''), TypeError);
  checkEqual(db.calls.length, 0);
});

test('flagged or removed check-in does not supply attendance evidence', async () => {
  const db = fixture();
  const store = createEventEvidenceStore('alice', db);
  db.register('alice', EVENT);
  db.checkIn('alice', EVENT, true);
  checkEqual(calculateEventEvidence(await store.getSnapshot(EVENT), { now: NOW }).effectiveAction, 'rsvp');
  db.removeCheckIn('alice', EVENT);
  checkEqual((await store.getSnapshot(EVENT)).attendance.verified, false);
});

test('only confirmed registrations earn RSVP points; other statuses preserve saved evidence', async () => {
  for (const status of ['pending', 'waitlisted', 'offered', 'cancelled', 'declined', 'expired', 'rejected']) {
    const db = fixture();
    const store = createEventEvidenceStore('alice', db);
    db.register('alice', EVENT, status);
    const snapshot = await store.getSnapshot(EVENT);
    checkEqual(snapshot.rsvp.active, false);
    checkEqual(snapshot.rsvp.timestamp, null);
    checkEqual(calculateEventEvidence(snapshot, { now: NOW }).contribution, 0);
    await store.setPreference(EVENT, 'save');
    checkEqual(calculateEventEvidence(await store.getSnapshot(EVENT), { now: NOW }).contribution, 5);
  }
});

test('direct confirmation and transitions to confirmed capture the confirmation time once', async () => {
  for (const initialStatus of ['confirmed', 'pending', 'waitlisted', 'offered']) {
    const db = fixture();
    const store = createEventEvidenceStore('alice', db);
    db.register('alice', EVENT, initialStatus);
    const before = await store.getSnapshot(EVENT);
    if (initialStatus !== 'confirmed') checkEqual(before.rsvp.timestamp, null);
    db.setTime(NOW - DAY);
    db.register('alice', EVENT, 'confirmed');
    const confirmed = await store.getSnapshot(EVENT);
    const expected = new Date(NOW - (initialStatus === 'confirmed' ? 20 : 1) * DAY).toISOString();
    checkEqual(confirmed.rsvp.timestamp, expected);
    checkEqual(calculateEventEvidence(confirmed, { now: NOW }).contribution, 10);
    db.setTime(NOW);
    db.register('alice', EVENT, 'confirmed');
    checkEqual((await store.getSnapshot(EVENT)).rsvp.timestamp, expected);
  }
});

test('cancel/reconfirm retains first confirmation and its 45/91-day ageing', async () => {
  for (const [age, expected] of [[45, 5], [91, 0]]) {
    const db = fixture();
    const store = createEventEvidenceStore('alice', db);
    db.setTime(NOW - age * DAY);
    db.register('alice', EVENT, 'confirmed');
    const original = await store.getSnapshot(EVENT);
    db.setTime(NOW - DAY);
    db.cancel('alice', EVENT);
    const cancelled = await store.getSnapshot(EVENT);
    checkEqual(cancelled.rsvp.active, false);
    checkEqual(cancelled.rsvp.timestamp, original.rsvp.timestamp);
    checkEqual(calculateEventEvidence(cancelled, { now: NOW }).contribution, 0);
    db.setTime(NOW);
    db.register('alice', EVENT, 'confirmed');
    const restored = await store.getSnapshot(EVENT);
    checkEqual(restored.rsvp.active, true);
    checkEqual(restored.rsvp.timestamp, original.rsvp.timestamp);
    checkEqual(calculateEventEvidence(restored, { now: NOW }).contribution, expected);
  }
});

test('91-day-old save stays expired after unsave/resave and dismissal undo', async () => {
  const db = fixture();
  const store = createEventEvidenceStore('alice', db);
  db.setTime(NOW - 91 * DAY);
  const original = await store.setPreference(EVENT, 'save');
  db.setTime(NOW);
  await store.setPreference(EVENT, 'unsave');
  const resaved = await store.setPreference(EVENT, 'save');
  checkEqual(resaved.save.timestamp, original.save.timestamp);
  checkEqual(resaved.save.active, true);
  checkEqual(calculateEventEvidence(resaved, { now: NOW }).contribution, 0);
  await store.setPreference(EVENT, 'dismiss');
  const restored = await store.setPreference(EVENT, 'undo_dismiss');
  checkEqual(restored.save.timestamp, original.save.timestamp);
  checkEqual(calculateEventEvidence(restored, { now: NOW }).contribution, 0);
});

test('flagged attendance never creates attendance points or suppresses valid save evidence', async () => {
  const db = fixture();
  const store = createEventEvidenceStore('alice', db);
  db.checkIn('alice', EVENT, true);
  checkEqual(calculateEventEvidence(await store.getSnapshot(EVENT), { now: NOW }).contribution, 0);
  await store.setPreference(EVENT, 'save');
  db.register('alice', EVENT, 'pending');
  checkEqual(calculateEventEvidence(await store.getSnapshot(EVENT), { now: NOW }).contribution, 5);
});
