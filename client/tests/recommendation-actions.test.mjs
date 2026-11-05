import { test, vi } from 'vitest';
import checks from '../../server/tests/checks.js';

const {
  checkEqual,
  checkDeepEqual,
  checkTrue
} = checks;

// Vitest replaces the composable's data boundary. The fake database has a signed-in user and
// reports an event as saved when the test's recommendations API has saved it.
vi.mock('@/lib/api', () => ({
  api: { get: (...args) => globalThis.__recApi.get(...args), post: (...args) => globalThis.__recApi.post(...args) }
}));
vi.mock('@/lib/supabase', () => {
  const rows = table => table === 'user_event_preferences' && globalThis.__recSaved?.()
    ? [{ event_id: 'event-1', save_active: true }]
    : [];
  const query = table => {
    const builder = new Proxy({}, { get(_target, method) {
      if (method === 'then') return resolve => resolve({ data: rows(table), error: null });
      return () => builder;
    } });
    return builder;
  };
  return { supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) }, from: query } };
});
const { useRecommendations } = await import('../src/composables/useEvents.js');

const event = {
  id: 'event-1',
  title: 'Music',
  source: 'personalised',
  saved: false
};
test('save refreshes recommendations; dismiss and undo retain the event for reversal', async () => {
  const calls = [];
  let saved = false;
  globalThis.__recSaved = () => saved;
  let dismissed = false;
  globalThis.__recApi = {
    post: async (path, {
      action
    }) => {
      calls.push([path, action]);
      if (action === 'save') saved = true;
      if (action === 'dismiss') dismissed = true;
      if (action === 'undo_dismiss') dismissed = false;
    },
    get: async () => ({
      data: {
        events: dismissed ? [] : [{
          ...event,
          saved
        }]
      }
    })
  };
  const state = useRecommendations();
  await state.fetchRecommendations();
  await state.updatePreference(event, 'save');
  checkEqual(state.recommended.value[0].saved, true);
  await state.updatePreference(event, 'dismiss');
  checkEqual(state.recommended.value.length, 0);
  checkEqual(state.undoEvent.value.id, event.id);
  await state.updatePreference(state.undoEvent.value, 'undo_dismiss');
  checkEqual(state.recommended.value.length, 1);
  checkEqual(state.undoEvent.value, null);
  checkDeepEqual(calls.map(call => call[1]), ['save', 'dismiss', 'undo_dismiss']);
});
test('failed action preserves cards for retry and does not invent success', async () => {
  globalThis.__recApi = {
    get: async () => ({
      data: {
        events: [event]
      }
    }),
    post: async () => {
      throw new Error('Network');
    }
  };
  const state = useRecommendations();
  await state.fetchRecommendations();
  await state.updatePreference(event, 'dismiss');
  checkEqual(state.recommended.value.length, 1);
  checkEqual(state.undoEvent.value, null);
  checkTrue(state.actionError.value.includes('try again'));
  checkEqual(state.actionPending.value, false);
});
test('sign-out discards an old pending action and its refresh', async () => {
  let resolvePost;
  let gets = 0;
  globalThis.__recApi = {
    get: async () => {
      gets++;
      return {
        data: {
          events: [event]
        }
      };
    },
    post: () => new Promise(resolve => {
      resolvePost = resolve;
    })
  };
  const state = useRecommendations();
  const pending = state.updatePreference(event, 'dismiss');
  state.clearRecommendations();
  resolvePost();
  await pending;
  checkEqual(gets, 0);
  checkEqual(state.undoEvent.value, null);
  checkEqual(state.recommended.value.length, 0);
});
test('saved action followed by refresh failure retains undo and reports the difference', async () => {
  globalThis.__recApi = {
    post: async () => ({}),
    get: async () => {
      throw new Error('Refresh failed');
    }
  };
  const state = useRecommendations();
  await state.updatePreference(event, 'dismiss');
  checkEqual(state.undoEvent.value.id, event.id);
  checkTrue(state.actionError.value.includes('preference was saved'));
  checkTrue(state.error.value.length > 0);
});
