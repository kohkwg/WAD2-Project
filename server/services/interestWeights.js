const MAX_INTEREST_WEIGHT = 5;
const INTERACTION_BOOST = { rsvp: 0.5, attend: 1.0 };

/**
 * Adaptive weights: RSVPing / attending raises weights of the event's tags.
 * Returns a NEW weights object.
 */
function bumpInterestWeights(weights, tags, type = "rsvp") {
  const boost = INTERACTION_BOOST[type] ?? 0;
  const next = { ...(weights || {}) };
  for (const tag of tags || []) {
    next[tag] = Math.min(MAX_INTEREST_WEIGHT, (next[tag] || 0) + boost);
  }
  return next;
}


module.exports = { bumpInterestWeights };
