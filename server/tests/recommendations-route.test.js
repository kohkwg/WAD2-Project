const test = require('node:test');
const { checkEqual, checkDeepEqual, checkTrue } = require('./checks');
const { fixture, candidate, USER, EVENT, NOW } = require('./recommendation-route-fixture');

test('V1 route retains flat events, forwards JWT and uses explicit interests rather than boosted weights', async () => {
  const app = fixture({ tables: { profiles: [{ id: USER, interest_weights: { sports: 500 } }],
    events_with_counts: [candidate(EVENT), candidate('sports', ['sports'])] } });
  const res = await app.request('/', { query: { limit: '1' } });
  checkEqual(res.statusCode, 200);
  checkDeepEqual(Object.keys(res.body), ['events']);
  checkEqual(res.body.events[0].id, EVENT);
  checkEqual(res.body.events[0].compatibilityScore, 50);
  checkEqual(res.body.events[0].score, 0.5);
  checkEqual(res.body.events[0].source, 'personalised');
  checkTrue(res.body.events[0].reason.includes('selected interests: music'));
  checkDeepEqual(app.tokens, ['caller-jwt']);
  for (const table of ['registrations', 'check_ins', 'event_members', 'user_event_preferences']) {
    checkTrue(app.calls.some(call => call.table === table && call.method === 'eq' && call.args[0] === 'user_id' && call.args[1] === USER));
  }
});

test('route loads historical attendance independently and continues capped pagination', async () => {
  const app = fixture({ readCap: 1, tables: {
    profile_interests: [],
    registrations: [{ id: 'r1', user_id: USER, event_id: 'past', status: 'confirmed' }],
    user_event_preferences: [{ user_id: USER, event_id: 'past', first_confirmed_at: '2029-12-30T00:00:00Z' }],
    check_ins: [{ id: 'c1', user_id: USER, event_id: 'past', registration_id: 'r1', checked_in_at: '2029-12-31T00:00:00Z', fraud_flag: false }],
    events: [{ id: 'past', event_interests: [{ interests: { slug: 'arts' } }] }],
    events_with_counts: [candidate(EVENT), candidate('arts', ['arts'])],
  } });
  const res = await app.request('/');
  checkEqual(res.statusCode, 200);
  checkEqual(res.body.events[0].id, 'arts');
  checkEqual(res.body.events[0].compatibilityScore, 60);
  checkTrue(res.body.events[0].reason.includes('recent activity'));
  checkTrue(app.calls.some(call => call.table === 'events_with_counts' && call.method === 'range' && call.args[0] === 1));
  checkTrue(app.calls.some(call => call.table === 'events' && call.method === 'in' && call.args[1].includes('past')));
});

test('team, organiser, rejected, confirmed and unexpired offered events never enter either feed', async () => {
  const app = fixture({ tables: {
    profile_interests: [],
    events_with_counts: ['team', 'own', 'rejected', 'confirmed', 'offer', 'expired', 'open'].map(id => candidate(id, ['music'], id === 'own' ? { organiser_id: USER } : {})),
    event_members: [{ user_id: USER, event_id: 'team' }],
    registrations: [
      { id: 'r1', user_id: USER, event_id: 'rejected', status: 'rejected' },
      { id: 'r2', user_id: USER, event_id: 'confirmed', status: 'confirmed' },
      { id: 'r3', user_id: USER, event_id: 'offer', status: 'offered', offer_expires_at: '2030-01-02T00:00:00Z' },
      { id: 'r4', user_id: USER, event_id: 'expired', status: 'offered', offer_expires_at: NOW },
    ],
    user_event_preferences: [{ user_id: USER, event_id: 'confirmed', first_confirmed_at: '2029-12-31T00:00:00Z' }],
  } });
  const res = await app.request('/');
  checkDeepEqual(res.body.events.map(event => event.id), ['expired', 'open']);
  // The excluded confirmed event still supplies valid interest evidence.
  checkTrue(res.body.events.every(event => event.source === 'personalised' && event.compatibilityScore === 50));
});

test('cold-start route labels general discovery without fabricated match scores', async () => {
  const res = await fixture({ tables: { profile_interests: [] } }).request('/');
  checkEqual(res.body.events[0].source, 'general_discovery');
  checkEqual(res.body.events[0].compatibilityScore, 0);
  checkEqual(res.body.events[0].rankingScore, null);
});

test('missing deployment metadata fails explicitly; read errors do not become empty history', async () => {
  const missing = await fixture({ failure: 'user_event_preferences' }).request('/');
  checkEqual(missing.statusCode, 503);
  checkEqual(missing.body.code, 'RECOMMENDATION_SETUP_REQUIRED');
  const noDate = await fixture({ tables: { registrations: [{ id: 'r', user_id: USER, event_id: EVENT, status: 'confirmed' }] } }).request('/');
  checkEqual(noDate.statusCode, 503);
  checkEqual((await fixture({ failure: 'profile_interests' }).request('/')).statusCode, 500);
});

test('limit validation rejects malformed values and caps valid requests', async () => {
  const app = fixture();
  for (const limit of ['-1', '2.5', 'abc']) checkEqual((await app.request('/', { query: { limit } })).statusCode, 400);
  checkDeepEqual((await app.request('/', { query: { limit: '0' } })).body.events, []);
  checkEqual((await app.request('/', { query: { limit: '100' } })).statusCode, 200);
});
