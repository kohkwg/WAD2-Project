// pure v1 evidence calculation. not connected to the live recommendation route.

const DAY_MS = 86_400_000;

const STAGES = Object.freeze([{
  field: 'attendance',
  action: 'attend',
  flag: 'verified',
  points: 15
}, {
  field: 'rsvp',
  action: 'rsvp',
  flag: 'active',
  points: 10
}, {
  field: 'save',
  action: 'save',
  flag: 'active',
  points: 5
}]);

function timestampMs(value, name) {
  // reject timezone-free strings so results cannot depend on the host timezone.
  const explicitZone = typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
  const milliseconds = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : explicitZone ? Date.parse(value) : NaN;
  if (!Number.isFinite(milliseconds) || !Number.isFinite(new Date(milliseconds).getTime())) {
    throw new TypeError(`${name} must be a valid timestamp with an explicit timezone`);
  }
  return milliseconds;
}

/**
 * input is a canonical snapshot for one authenticated user's event, not a raw
 * action log. the persistence adapter owns deduplication and current statuses.
 * save: { active: boolean, timestamp: original save time }
 * rsvp: { active: boolean, timestamp: first confirmed time }. active means the
 * authoritative registration is currently confirmed, not pending/waitlisted/offered.
 * first save/confirmation times survive deactivation and reactivation.
 * attendance: { verified: boolean, timestamp: authoritative check-in time }
 * dismissed: boolean. omitting a stage means no evidence for that stage.
 * cancellation/unsaving sets active=false without destroying historical dates.
 * a valid stage requires its flag to be exactly true; client claims are not
 * authoritative verification. invalid selected-stage dates throw, never refresh.
 */

function calculateEventEvidence(snapshot, {
  now = Date.now()
} = {}) {
  if (!snapshot || typeof snapshot.eventId !== 'string' || !snapshot.eventId.trim()) {
    throw new TypeError('eventId is required');
  }
  if (snapshot.dismissed !== undefined && typeof snapshot.dismissed !== 'boolean') {
    throw new TypeError('dismissed must be a boolean');
  }
  const nowMs = timestampMs(now, 'now');
  const empty = {
    eventId: snapshot.eventId,
    effectiveAction: snapshot.dismissed ? 'not_interested' : 'none',
    effectiveTimestamp: null,
    basePoints: 0,
    ageMultiplier: 0,
    contribution: 0
  };
  if (snapshot.dismissed) return empty;
  const stage = STAGES.find(stage => snapshot[stage.field]?.[stage.flag] === true);
  if (!stage) return empty;
  const timeMs = timestampMs(snapshot[stage.field].timestamp, `${stage.field}.timestamp`);
  // allow a small difference between database and application clocks.
  const CLOCK_SKEW_TOLERANCE_MS = 5_000;
  if (timeMs - nowMs > CLOCK_SKEW_TOLERANCE_MS) {
    throw new RangeError(`Evidence timestamp is ${timeMs - nowMs} ms ahead of recommendation time`);
  }

  // select the strongest valid stage before ageing; do not stack stages or
  // fall back to a weaker action merely because the stronger action is old.
  const ageMs = Math.max(0, nowMs - timeMs);
  const ageDays = ageMs / DAY_MS;
  const HALF_LIFE_DAYS = 45;
  const ageMultiplier = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
  return {
    eventId: snapshot.eventId,
    effectiveAction: stage.action,
    effectiveTimestamp: new Date(timeMs).toISOString(),
    basePoints: stage.points,
    ageMultiplier,
    contribution: stage.points * ageMultiplier
  };
}
module.exports = {
  calculateEventEvidence
};
