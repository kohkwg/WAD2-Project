const express = require('express');
const supabaseForUser = require('../lib/userSupabase');
const requireAuth = require('../lib/requireAuth');
const { createEventEvidenceStore } = require('../services/eventEvidenceStore');
const { buildRecommendationPipeline } = require('../services/recommendationPipeline');
const { haversineKm } = require('../services/recommendation');

const router = express.Router();
const PAGE_SIZE = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Keep query assembly here: the scoring pipeline stays independent of Supabase.
async function readPages(buildQuery) {
  const rows = [];
  for (let offset = 0; ; ) {
    const { data, error } = await buildQuery().range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('Incomplete recommendation read');
    if (!data.length) return rows;
    rows.push(...data);
    offset += data.length; // Continue to an empty page, including capped responses.
  }
}
function reportFailure(res, error) {
  const code = error.code || error.cause?.code;
  const setupMissing = ['42P01', '42703', '42883', 'PGRST202', 'PGRST205', 'RECOMMENDATION_SETUP_REQUIRED'].includes(code);
  const forbidden = code === '42501';
  return res.status(setupMissing ? 503 : forbidden ? 403 : 500).json({
    error: setupMissing ? 'Personalised recommendations are temporarily unavailable.'
      : forbidden ? 'This event is unavailable.' : 'Could not complete the recommendation request.',
    ...(setupMissing ? { code: 'RECOMMENDATION_SETUP_REQUIRED' } : {}),
  });
}

router.get('/', requireAuth, async (req, res) => {
  const suppliedLimit = req.query.limit === undefined ? 8 : Number(req.query.limit);
  if (!Number.isInteger(suppliedLimit) || suppliedLimit < 0) {
    return res.status(400).json({ error: 'limit must be a nonnegative integer' });
  }
  const limit = Math.min(suppliedLimit, 24);
  const now = new Date().toISOString();
  const supabase = supabaseForUser(req.accessToken);
  const userId = req.user.id;
  try {
    const [profileResult, explicit, preferences, registrations, checkIns, memberships, events] = await Promise.all([
      supabase.from('profiles').select('lat,lng').eq('id', userId).maybeSingle(),
      readPages(() => supabase.from('profile_interests').select('profile_id,interest_id,interests(slug)').eq('profile_id', userId).order('interest_id')),
      readPages(() => supabase.from('user_event_preferences').select('user_id,event_id,saved_at,save_active,dismissed,first_confirmed_at').eq('user_id', userId).order('event_id')),
      readPages(() => supabase.from('registrations').select('id,user_id,event_id,status,offer_expires_at').eq('user_id', userId).order('id')),
      readPages(() => supabase.from('check_ins').select('id,user_id,event_id,registration_id,checked_in_at,fraud_flag').eq('user_id', userId).order('id')),
      readPages(() => supabase.from('event_members').select('user_id,event_id').eq('user_id', userId).order('event_id')),
      readPages(() => supabase.from('events_with_counts').select('*').gt('starts_at', now).order('id')),
    ]);
    if (profileResult.error) throw profileResult.error;
    const profile = profileResult.data;
    for (const row of [...preferences, ...registrations, ...checkIns, ...memberships]) {
      if (row.user_id !== userId) throw new Error('Unexpected user in recommendation records');
    }
    const selectedInterests = explicit.map(row => {
      if (row.profile_id !== userId || !row.interests?.slug) throw new Error('Invalid explicit interest record');
      return row.interests.slug;
    });
    const prefByEvent = new Map(preferences.map(row => [row.event_id, row]));
    const regByEvent = new Map(registrations.map(row => [row.event_id, row]));
    const checkByEvent = new Map();
    for (const check of checkIns) {
      const registration = regByEvent.get(check.event_id);
      if (!registration || registration.id !== check.registration_id || checkByEvent.has(check.event_id)) {
        throw new Error('Inconsistent attendance record');
      }
      checkByEvent.set(check.event_id, check);
    }
    const historicalIds = [...new Set([...prefByEvent.keys(), ...regByEvent.keys(), ...checkByEvent.keys()])].sort();
    const eventInterestsById = {};
    // Batch historical reads independently of upcoming events. No per-event RPCs.
    for (let offset = 0; offset < historicalIds.length; offset += PAGE_SIZE) {
      const batch = historicalIds.slice(offset, offset + PAGE_SIZE);
      const historical = await readPages(() => supabase.from('events').select('id,event_interests(interests(slug))').in('id', batch).order('id'));
      for (const event of historical) {
        if (!Array.isArray(event.event_interests)) throw new Error('Incomplete historical interest mapping');
        eventInterestsById[event.id] = event.event_interests.map(link => {
          if (!link.interests?.slug) throw new Error('Unavailable historical interest');
          return link.interests.slug;
        });
      }
    }
    const evidenceSnapshots = historicalIds.map(eventId => {
      const pref = prefByEvent.get(eventId);
      const registration = regByEvent.get(eventId);
      const check = checkByEvent.get(eventId);
      if (registration?.status === 'confirmed' && !pref?.first_confirmed_at) {
        throw Object.assign(new Error('First confirmation metadata unavailable'), { code: 'RECOMMENDATION_SETUP_REQUIRED' });
      }
      return {
        eventId,
        save: { active: pref?.save_active === true, timestamp: pref?.saved_at ?? null },
        rsvp: { active: registration?.status === 'confirmed', timestamp: pref?.first_confirmed_at ?? null },
        attendance: { verified: !!check && check.fraud_flag === false, timestamp: check?.checked_in_at ?? null },
        dismissed: pref?.dismissed === true,
      };
    });
    const excludedIds = new Set(memberships.map(row => row.event_id));
    for (const row of registrations) if (row.status === 'rejected') excludedIds.add(row.event_id);
    const candidateEvents = events.filter(event => event.organiser_id !== userId && !excludedIds.has(event.id));
    for (const event of candidateEvents) {
      if (!Array.isArray(event.tags)) throw new Error('Incomplete candidate interest mapping');
      eventInterestsById[event.id] = event.tags;
    }
    const result = buildRecommendationPipeline({ selectedInterests, evidenceSnapshots,
      eventInterestsById, candidateEvents, registrations, now, limit });
    const savedIds = new Set(preferences.filter(row => row.save_active).map(row => row.event_id));
    const cards = result.recommendations.map(event => {
      const matched = event.interests.filter(interest => result.preferences.combinedPreferences[interest] > 0);
      const learned = matched.filter(interest => result.preferences.learnedPreferences[interest] > 0);
      const reason = event.source === 'general_discovery' ? 'Upcoming event to explore'
        : learned.length ? `Your recent activity supports your interest in ${learned.join(', ')}`
          : `Matches your selected interests: ${matched.join(', ')}`;
      const km = profile?.lat != null && profile?.lng != null && event.lat != null && event.lng != null
        ? haversineKm(profile.lat, profile.lng, event.lat, event.lng) : null;
      return { ...event, start_time: event.starts_at, tags: event.interests,
        score: event.compatibilityScore / 100, reason,
        reason_type: event.source === 'personalised' ? 'interest' : 'discovery',
        saved: savedIds.has(event.id), recommendation_actions: true,
        distance_km: km == null ? null : Math.round(km * 10) / 10 };
    });
    res.json({ events: cards });
  } catch (error) { reportFailure(res, error); }
});

router.post('/:eventId/preferences', requireAuth, async (req, res) => {
  const { eventId } = req.params;
  const action = req.body?.action;
  if (!UUID.test(eventId) || !['save', 'unsave', 'dismiss', 'undo_dismiss'].includes(action)) {
    return res.status(400).json({ error: 'A valid event and preference action are required' });
  }
  try {
    const store = createEventEvidenceStore(req.accessToken);
    const snapshot = await store.setPreference(eventId, action);
    res.json({ eventId: snapshot.eventId, saved: snapshot.save.active, dismissed: snapshot.dismissed });
  } catch (error) { reportFailure(res, error); }
});

// Compatibility endpoint: actions are verified facts, never browser-authored boosts.
router.post('/interactions', requireAuth, async (req, res) => {
  const { eventId, type } = req.body || {};
  if (!UUID.test(eventId) || !['rsvp', 'attend'].includes(type)) {
    return res.status(400).json({ error: 'eventId and type (rsvp|attend) required' });
  }
  try {
    const snapshot = await createEventEvidenceStore(req.accessToken).getSnapshot(eventId);
    const verified = type === 'attend' ? snapshot.attendance.verified : snapshot.rsvp.active;
    if (!verified) return res.status(409).json({ error: 'The interaction has not been verified.' });
    res.json({ recorded: true });
  } catch (error) { reportFailure(res, error); }
});

module.exports = router;
