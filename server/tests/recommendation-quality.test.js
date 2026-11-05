import { test } from "vitest";

const {
  checkEqual,
  checkTrue
} = require('./checks');

const {
  fixture,
  candidate,
  USER,
  NOW
} = require('./recommendation-route-fixture');

const {
  buildRecommendationReason
} = require('../services/recommendationReason');
for (const staffType of ['organiser', 'team']) {
  for (const action of ['save', 'rsvp', 'attend']) {
    test(`${staffType} ${action} evidence does not teach an interest`, async () => {
      const past = 'past';
      const tables = {
        profile_interests: [],
        user_event_preferences: [{
          user_id: USER,
          event_id: past,
          save_active: true,
          saved_at: NOW,
          first_confirmed_at: NOW
        }],
        events: [{
          id: past,
          organiser_id: staffType === 'organiser' ? USER : 'someone-else',
          event_interests: [{
            interests: {
              slug: 'music'
            }
          }]
        }],
        events_with_counts: [candidate('new-music')],
        event_members: staffType === 'team' ? [{
          user_id: USER,
          event_id: past
        }] : [],
        registrations: action === 'save' ? [] : [{
          id: 'r1',
          user_id: USER,
          event_id: past,
          status: 'confirmed'
        }],
        check_ins: action === 'attend' ? [{
          id: 'c1',
          user_id: USER,
          event_id: past,
          registration_id: 'r1',
          fraud_flag: false,
          checked_in_at: NOW
        }] : []
      };
      const res = await fixture({
        tables
      }).request('/');
      checkEqual(res.statusCode, 200);
      checkEqual(res.body.events[0].compatibilityScore, 0);
      checkEqual(res.body.events[0].source, 'general_discovery');
    });
  }
}
test('explicit interests still work when organiser saves are ignored', async () => {
  const res = await fixture({
    tables: {
      user_event_preferences: [{
        user_id: USER,
        event_id: 'own',
        save_active: true,
        saved_at: NOW
      }],
      events: [{
        id: 'own',
        organiser_id: USER,
        event_interests: [{
          interests: {
            slug: 'music'
          }
        }]
      }]
    }
  }).request('/');
  checkEqual(res.statusCode, 200);
  checkEqual(res.body.events[0].compatibilityScore, 50);
  checkTrue(/selected interests: music/.test(res.body.events[0].reason));
});
test('a participant save teaches preferences across different events', async () => {
  const res = await fixture({
    tables: {
      profile_interests: [],
      user_event_preferences: [{
        user_id: USER,
        event_id: 'past',
        save_active: true,
        saved_at: NOW
      }],
      events: [{
        id: 'past',
        organiser_id: 'another-organiser',
        event_interests: [{
          interests: {
            slug: 'music'
          }
        }]
      }],
      events_with_counts: [candidate('different-music')]
    }
  }).request('/');
  checkEqual(res.statusCode, 200);
  checkEqual(res.body.events[0].source, 'personalised');
  checkTrue(Math.abs(res.body.events[0].compatibilityScore - 100 / 3) < 1e-10);
  checkTrue(/saved an event about music/.test(res.body.events[0].reason));
});
for (const [stage, flag, verb] of [['save', 'active', 'saved'], ['rsvp', 'active', 'registered for'], ['attendance', 'verified', 'attended']]) {
  test(`explanation names the actual ${stage} action`, () => {
    const result = buildRecommendationReason({
      event: {
        source: 'personalised',
        interests: ['board-games']
      },
      evidenceSnapshots: [{
        eventId: 'past',
        [stage]: {
          [flag]: true,
          timestamp: NOW
        }
      }],
      eventInterestsById: {
        past: ['board-games']
      },
      now: NOW
    });
    checkEqual(result, `Your recent activity: you ${verb} an event about board games`);
  });
}
test('dismissed evidence cannot support an explanation and fallback stays labelled', () => {
  const input = {
    event: {
      source: 'personalised',
      interests: ['music']
    },
    selectedInterests: ['music'],
    evidenceSnapshots: [{
      eventId: 'past',
      dismissed: true,
      save: {
        active: true,
        timestamp: NOW
      }
    }],
    eventInterestsById: {
      past: ['music']
    },
    now: NOW
  };
  checkEqual(buildRecommendationReason(input), 'Matches your selected interests: music');
  checkEqual(buildRecommendationReason({
    ...input,
    event: {
      ...input.event,
      source: 'general_discovery'
    }
  }), 'Upcoming event to explore');
});
