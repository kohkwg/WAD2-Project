const supabaseForUser = require('../lib/userSupabase');

const ACTIONS = new Set(['save', 'unsave', 'dismiss', 'undo_dismiss']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Instantiate only after requireAuth verifies the caller's token. No service-role
// client, user ID override, client timestamps or client attendance input.
function createEventEvidenceStore(accessToken, { clientFactory = supabaseForUser } = {}) {
  if (typeof accessToken !== 'string' || !accessToken.trim()) {
    throw new TypeError('An authenticated access token is required');
  }
  const client = clientFactory(accessToken);

  async function call(functionName, eventId, action) {
    if (typeof eventId !== 'string' || !UUID.test(eventId)) {
      throw new TypeError('eventId must be a UUID');
    }
    eventId = eventId.toLowerCase();
    const params = { p_event_id: eventId };
    if (action !== undefined) params.p_action = action;
    const { data, error } = await client.rpc(functionName, params);
    if (error) throw new Error('Unable to persist or read event evidence', { cause: error });
    if (!data || data.eventId !== eventId) {
      throw new Error('Invalid event evidence response');
    }
    return data;
  }

  return {
    getSnapshot(eventId) {
      return call('get_recommendation_event_evidence', eventId);
    },
    setPreference(eventId, action) {
      if (!ACTIONS.has(action)) throw new TypeError('Unsupported event preference action');
      return call('set_recommendation_event_preference', eventId, action);
    },
  };
}

module.exports = { createEventEvidenceStore };
