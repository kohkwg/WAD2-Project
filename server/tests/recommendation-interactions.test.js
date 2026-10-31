const test = require('node:test');
const { checkEqual, checkTrue } = require('./checks');
const { fixture, USER, EVENT } = require('./recommendation-route-fixture');

test('save/dismiss/undo refreshes route results and unsave retains original timestamp', async () => {
  const app = fixture({ tables: { events: [{ id: EVENT, event_interests: [{ interests: { slug: 'music' } }] }] } });
  const act = action => app.request('/:eventId/preferences', { method: 'post', params: { eventId: EVENT }, body: { action } });
  checkEqual((await act('save')).body.saved, true);
  const first = app.data.user_event_preferences[0].saved_at;
  checkEqual((await app.request('/')).body.events[0].compatibilityScore, 60);
  checkEqual((await act('dismiss')).body.dismissed, true);
  checkEqual((await app.request('/')).body.events.length, 0);
  checkEqual((await act('undo_dismiss')).body.dismissed, false);
  checkEqual((await app.request('/')).body.events[0].saved, true);
  await act('unsave'); await act('save');
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
