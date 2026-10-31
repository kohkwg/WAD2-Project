const { isDeepStrictEqual } = require('node:util');
const { calculateEventEvidence } = require('./eventEvidence');
const { buildUserPreferences } = require('./userPreferences');
const { calculateCompatibility } = require('./eventCompatibility');
const { selectDiverseEvents } = require('./diverseEvents');

// Timestamp validation only. Ageing remains owned by calculateEventEvidence().
function timeMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return new Date(value).getTime();
  if (typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    return Date.parse(value);
  }
  return NaN;
}

function uniqueRecords(records, idField, label) {
  if (!Array.isArray(records)) throw new TypeError(`${label} must be an array`);
  const byId = new Map();
  for (const record of records) {
    const id = record?.[idField];
    if (typeof id !== 'string' || !id.trim()) throw new TypeError(`${label} requires ${idField}`);
    if (byId.has(id) && !isDeepStrictEqual(byId.get(id), record)) {
      throw new Error(`Conflicting ${label} records for ${id}`);
    }
    byId.set(id, record);
  }
  return [...byId.values()];
}

function validateInterests(interests) {
  if (!Array.isArray(interests) || interests.some(interest =>
    typeof interest !== 'string' || !interest.trim() || interest !== interest.trim() || interest === '__proto__')) {
    throw new TypeError('Interests must be arrays of canonical nonempty slug strings');
  }
  return interests;
}

/**
 * Pure local pipeline. All inputs belong to ONE user and represent the same
 * supplied instant. Snapshots are canonical, not raw browser interaction logs.
 * Historical event tags must be supplied even when those events are not candidates.
 * Registrations must include all current records needed to exclude candidates.
 * No database client, wall-clock reads or live-route integration.
 */
function buildRecommendationPipeline({
  selectedInterests = [],
  evidenceSnapshots = [],
  eventInterestsById = {},
  candidateEvents = [],
  registrations = [],
  now,
  limit = 8,
  diversityPenalty = 0.3,
}) {
  const nowMs = timeMs(now);
  if (!Number.isFinite(nowMs)) throw new TypeError('now must be a valid timestamp with an explicit timezone');
  if (!Number.isInteger(limit) || limit < 0) throw new RangeError('limit must be a nonnegative integer');
  if (!Number.isFinite(diversityPenalty) || diversityPenalty < 0 || diversityPenalty > 1) {
    throw new RangeError('diversityPenalty must be between 0 and 1');
  }
  validateInterests(selectedInterests);
  if (!eventInterestsById || typeof eventInterestsById !== 'object' || Array.isArray(eventInterestsById)) {
    throw new TypeError('eventInterestsById must be an object keyed by event ID');
  }

  const diagnostics = [];
  const missingMappings = new Set();
  function interestsFor(eventId) {
    if (!Object.hasOwn(eventInterestsById, eventId)) {
      if (!missingMappings.has(eventId)) {
        diagnostics.push({ eventId, reason: 'missing_interest_mapping' });
        missingMappings.add(eventId);
      }
      return [];
    }
    return [...new Set(validateInterests(eventInterestsById[eventId]))];
  }

  // Part 1: reconstruct evidence once, then combine it with explicit interests.
  const dismissedIds = new Set();
  const evidence = [];
  for (const snapshot of uniqueRecords(evidenceSnapshots, 'eventId', 'evidence')) {
    const result = calculateEventEvidence(snapshot, { now: nowMs });
    if (result.effectiveAction === 'not_interested') dismissedIds.add(snapshot.eventId);
    evidence.push({ ...result, interests: interestsFor(snapshot.eventId) });
  }
  const preferences = buildUserPreferences(selectedInterests, evidence);

  // Part 2: apply the same eligibility rules before personalised OR general picks.
  const blockedIds = new Set();
  const terminalStatuses = new Set(['rejected', 'cancelled', 'declined', 'expired']);
  for (const registration of uniqueRecords(registrations, 'event_id', 'registration')) {
    if (['confirmed', 'pending', 'waitlisted'].includes(registration.status)) {
      blockedIds.add(registration.event_id);
    } else if (registration.status === 'offered') {
      const expiry = timeMs(registration.offer_expires_at);
      if (!Number.isFinite(expiry)) {
        diagnostics.push({ eventId: registration.event_id, reason: 'invalid_offer_expiry' });
        blockedIds.add(registration.event_id);
      } else if (expiry > nowMs) {
        blockedIds.add(registration.event_id);
      }
    } else if (!terminalStatuses.has(registration.status)) {
      diagnostics.push({ eventId: registration.event_id, reason: 'invalid_registration_status' });
      blockedIds.add(registration.event_id);
    }
  }

  const eligible = [];
  for (const event of uniqueRecords(candidateEvents, 'id', 'candidate')) {
    if (event.status !== 'published' || dismissedIds.has(event.id) || blockedIds.has(event.id)) continue;
    const start = timeMs(event.starts_at);
    if (!Number.isFinite(start)) {
      diagnostics.push({ eventId: event.id, reason: 'invalid_start_time' });
      continue;
    }
    if (start <= nowMs) continue;
    if (event.registration_closes_at !== null && event.registration_closes_at !== undefined) {
      const deadline = timeMs(event.registration_closes_at);
      if (!Number.isFinite(deadline)) {
        diagnostics.push({ eventId: event.id, reason: 'invalid_registration_deadline' });
        continue;
      }
      if (deadline <= nowMs) continue;
    }
    if (event.capacity !== null) {
      if (!Number.isInteger(event.capacity) || event.capacity <= 0) {
        diagnostics.push({ eventId: event.id, reason: 'invalid_capacity' });
        continue;
      }
      if (!Number.isInteger(event.spots_left) || event.spots_left < 0 || event.spots_left > event.capacity) {
        diagnostics.push({ eventId: event.id, reason: 'unknown_or_invalid_availability' });
        continue;
      }
      if (event.spots_left === 0) continue;
    }
    const interests = interestsFor(event.id);
    eligible.push({
      ...event,
      eventId: event.id,
      interests,
      compatibilityScore: calculateCompatibility(preferences.combinedPreferences, interests),
    });
  }

  // Numeric time comparison and ordinal ID comparison avoid locale-dependent ties.
  eligible.sort((a, b) => timeMs(a.starts_at) - timeMs(b.starts_at)
    || (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0));
  const recommendations = selectDiverseEvents(eligible, limit, diversityPenalty)
    .map(event => ({ ...event, source: 'personalised' }));
  const selectedIds = new Set(recommendations.map(event => event.eventId));
  for (const event of eligible) {
    if (recommendations.length >= limit) break;
    if (selectedIds.has(event.eventId)) continue;
    recommendations.push({ ...event, rankingScore: null, source: 'general_discovery' });
    selectedIds.add(event.eventId);
  }

  return { preferences, recommendations, diagnostics };
}

module.exports = { buildRecommendationPipeline };
