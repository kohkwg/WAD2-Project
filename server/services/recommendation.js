/**
 * Event recommendation engine (pure functions, no DB calls -> easy to test).
 *
 * Factors (each scaled to 0..1):
 *   interest   - how well event tags match the user's adaptive interest weights
 *   recency    - how soon the event starts (sooner = higher)
 *   popularity - how many confirmed attendees (relative to other candidates)
 *   distance   - closeness to the user's postal-code area (OneMap lat/lng)
 *   spots      - spots left (full = 0)
 *
 * Then a diversity pass spreads the top results across categories.
 */

const BASE_WEIGHTS = {
  interest: 0.4,
  distance: 0.2,
  recency: 0.15,
  popularity: 0.15,
  spots: 0.1,
};

const DIVERSITY_PENALTY = 0.8; // each repeat of a category multiplies score by this
const MAX_INTEREST_WEIGHT = 5;
const INTERACTION_BOOST = { rsvp: 0.5, attend: 1.0 };

// ---------- helpers ----------

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function interestScore(tags, weights) {
  // sum matched weights, then saturate so 1 match ~0.63, 2 matches ~0.86 (weights = 1)
  const matched = (tags || []).filter((t) => weights[t] > 0);
  const sum = matched.reduce((acc, t) => acc + weights[t], 0);
  return { score: 1 - Math.exp(-sum), matched };
}

function recencyScore(startTime, now) {
  const days = (new Date(startTime) - now) / 86400000;
  if (days < 0) return 0;
  return Math.exp(-days / 14); // sooner events score higher
}

function distanceScore(km) {
  return Math.exp(-km / 10); // ~0.9 at 1km, ~0.37 at 10km, ~0.1 at 23km
}

function spotsScore(spotsLeft) {
  if (spotsLeft <= 0) return 0;
  return Math.min(1, spotsLeft / 10);
}

// ---------- main scoring ----------

/**
 * @param {Array}  events   rows from events_with_counts
 * @param {Object} profile  { interest_weights, lat, lng }
 * @param {Object} opts     { now?: Date, excludeEventIds?: Set }
 */
function scoreEvents(events, profile, opts = {}) {
  const now = opts.now || new Date();
  const exclude = opts.excludeEventIds || new Set();
  const weights = profile?.interest_weights || {};
  const hasLocation = profile?.lat != null && profile?.lng != null;

  const candidates = events.filter(
    (e) => !exclude.has(e.id) && new Date(e.start_time) > now
  );

  const maxPop = Math.max(1, ...candidates.map((e) => e.confirmed_count || 0));

  // Drop distance weight if we don't know where the user is; renormalise the rest
  const w = { ...BASE_WEIGHTS };
  if (!hasLocation) delete w.distance;
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  Object.keys(w).forEach((k) => (w[k] /= total));

  return candidates.map((e) => {
    const { score: interest, matched } = interestScore(e.tags, weights);
    const recency = recencyScore(e.start_time, now);
    const popularity = Math.log1p(e.confirmed_count || 0) / Math.log1p(maxPop);
    const spots = spotsScore(e.spots_left);

    let distKm = null;
    let distance = 0;
    if (hasLocation && e.lat != null && e.lng != null) {
      distKm = haversineKm(profile.lat, profile.lng, e.lat, e.lng);
      distance = distanceScore(distKm);
    }

    const parts = { interest, recency, popularity, spots };
    if (hasLocation) parts.distance = distance;

    let score = 0;
    for (const key of Object.keys(w)) score += w[key] * (parts[key] || 0);

    return {
      ...e,
      score,
      distance_km: distKm != null ? Math.round(distKm * 10) / 10 : null,
      reason: buildReason({ parts, w, matched, distKm, e }),
    };
  });
}

// Explains the factor that contributed most (shown on the event card)
function buildReason({ parts, w, matched, distKm, e }) {
  const contributions = Object.keys(w).map((k) => [k, w[k] * (parts[k] || 0)]);
  contributions.sort((a, b) => b[1] - a[1]);
  const top = contributions[0]?.[0];

  switch (top) {
    case "interest":
      return matched.length
        ? `Matches your interests: ${matched.join(", ")}`
        : "Suggested for you";
    case "distance":
      return distKm != null ? `Near you (${distKm.toFixed(1)} km away)` : "Near you";
    case "popularity":
      return "Popular with other participants";
    case "recency":
      return "Happening soon";
    case "spots":
      return e.spots_left <= 10 ? `Only ${e.spots_left} spots left` : "Spots available";
    default:
      return "Suggested for you";
  }
}

/**
 * Greedy diversity re-ranking: repeatedly pick the best remaining event,
 * penalising categories that have already been picked.
 */
function diversify(scored, limit) {
  const pool = [...scored];
  const picked = [];
  const categoryCount = {};

  while (pool.length && picked.length < limit) {
    let bestIdx = 0;
    let bestAdj = -Infinity;
    pool.forEach((e, i) => {
      const n = categoryCount[e.category] || 0;
      const adj = e.score * Math.pow(DIVERSITY_PENALTY, n);
      if (adj > bestAdj) {
        bestAdj = adj;
        bestIdx = i;
      }
    });
    const [chosen] = pool.splice(bestIdx, 1);
    categoryCount[chosen.category] = (categoryCount[chosen.category] || 0) + 1;
    picked.push(chosen);
  }
  return picked;
}

function recommend(events, profile, opts = {}) {
  const limit = opts.limit || 10;
  return diversify(scoreEvents(events, profile, opts), limit);
}

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

module.exports = { recommend, scoreEvents, diversify, bumpInterestWeights, haversineKm };
