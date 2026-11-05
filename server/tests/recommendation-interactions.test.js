const test = require('node:test');
const { checkEqual, checkTrue } = require('./checks');
const { fixture, candidate, USER, EVENT } = require('./recommendation-route-fixture');

test('saved events teach preferences but only unsaved events are recommended', async () => {
  const app = fixture({ tables: {
    profile_interests: [],
    events: [{ id: EVENT, organiser_id: 'another-organiser',
      event_interests: [{ interests: { slug: 'music' } }] }],
    events_with_counts: [candidate(EVENT), candidate('other-music')],
  } });
  const act = action => app.request('/:eventId/preferences', {
    method: 'post', params: { eventId: EVENT }, body: { action },
  });

  checkEqual((await act('save')).body.saved, true);
  const first = app.data.user_event_preferences[0].saved_at;
  const saved = await app.request('/');
  checkEqual(saved.statusCode, 200);
  checkEqual(saved.body.events.length, 1);
  checkEqual(saved.body.events[0].id, 'other-music');
  checkEqual(saved.body.events[0].source, 'personalised');
  checkTrue(Math.abs(saved.body.events[0].compatibilityScore - 100 / 3) < 1e-10);

  await act('dismiss');
  const dismissed = await app.request('/');
  checkEqual(dismissed.body.events.length, 1);
  checkEqual(dismissed.body.events[0].source, 'general_discovery');

  await act('undo_dismiss');
  const restored = await app.request('/');
  checkEqual(restored.body.events[0].id, 'other-music');
  checkEqual(restored.body.events[0].source, 'personalised');

  await act('unsave');
  const unsaved = await app.request('/');
  checkTrue(unsaved.body.events.some(event => event.id === EVENT));
  checkTrue(unsaved.body.events.every(event => event.source === 'general_discovery'));
  await act('save');
  checkEqual(app.data.user_event_preferences[0].saved_at, first);
  checkTrue(app.calls.every(call => call.method !== 'update'));
});

test('preference actions reject forged attendance and map undeployed RPC failures', async () => {
  const app = fixture();
  const forged = await app.request('/:eventId/preferences', { method: 'post', params: { eventId: EVENT }, body: { action: 'attend' } });
  checkEqual(forged.statusCode, 400);
  const missing = fixture({ rpcError: { code: 'PGRST202' } });
  checkEqual((await missing.request('/:eventId/preferences', { method: 'post', params: { eventId: EVENT }, body: { action: 'save' } })).statusCode, 503);
});

test('legacy interaction notifications verify database state without permanent interest boosts', async () => {
  const app = fixture();
  const notify = () => app.request('/interactions', { method: 'post', body: { eventId: EVENT, type: 'rsvp' } });
  checkEqual((await notify()).statusCode, 409);
  app.data.registrations.push({ id: 'r1', event_id: EVENT, user_id: USER, status: 'confirmed' });
  checkEqual((await notify()).body.recorded, true);
  checkTrue(app.calls.every(call => call.method !== 'update'));
});
