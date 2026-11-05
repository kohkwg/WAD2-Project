/**
 * Feature 1 ranking only: no database, geocoding, auth, or interaction calls.
 * Kept separate from recommendation.js so existing callers retain their behavior.
 *
 * Hydrate event tags from event_interests/interests before calling (tags are slug
 * strings). A profile can supply interests as slug strings (weight 1 each), plus
 * optional interest_weights. Interest blends the share of positive weight
 * matched with match strength. Duplicate tags count only once.
 *
 * Distance requires pre-geocoded profile and venue coordinates: { lat, lng }
 * or { latitude, longitude }, with event.venue also accepted. A postal code by
 * itself is not a coordinate. Missing location drops distance for that event.
 */

const RANKING_CONFIG = Object.freeze({
  weights: Object.freeze({
    interest: 0.40,
    recency: 0.20,
    popularity: 0.15,
    distance: 0.15,
    spots: 0.10,
  }),
  recencyDays: 14,
  distanceKm: 5,
  diversityPenalty: 0.3, // Tunable heuristic for maximum tag similarity.
});

const DAY_MS = 86400000;
const clamp = value => Math.max(0, Math.min(1, value));
const validNumber = value => typeof value === "number" && Number.isFinite(value);

function tagNames(tags) {
  return [...new Set((Array.isArray(tags) ? tags : []).filter(tag => typeof tag === "string" && tag.trim()).map(tag => tag.trim()))];
}

function tagSimilarity(a, b) {
  const A = new Set(tagNames(a));
  const B = new Set(tagNames(b));
  if (A.size === 0 || B.size === 0) return 0;
  let both = 0;
  for (const tag of A) if (B.has(tag)) both++;
  return both / (A.size + B.size - both);
}

function profileWeights(profile) {
  const weights = new Map(tagNames(profile.interests).map(tag => [tag, 1]));
  for (const [tag, weight] of Object.entries(profile.interest_weights || {})) {
    if (tag.trim() && validNumber(weight)) weights.set(tag.trim(), Math.max(0, weight));
  }
  return weights;
}

function interestScore(weights, tags) {
  const interests = profileWeights({ interest_weights: weights });
  const total = [...interests.values()].reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return 0;
  const matched = tagNames(tags).reduce((sum, tag) => sum + (interests.get(tag) || 0), 0);
  const share = matched / total;
  const strength = 1 - Math.exp(-matched / 2);
  return 0.5 * share + 0.5 * strength;
}

function coordinates(value) {
  if (!value) return null;
  const lat = value.lat ?? value.latitude;
  const lng = value.lng ?? value.longitude;
  return validNumber(lat) && validNumber(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { lat, lng } : null;
}

function distanceKm(a, b) {
  const rad = degrees => degrees * Math.PI / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(clamp(h)));
}

function positiveRatio(numerator, denominator) {
  return validNumber(numerator) && validNumber(denominator) && denominator > 0
    ? clamp(numerator / denominator) : 0;
}

function reasonFor(signals, weights, matched) {
  let strongest = null;
  let contribution = 0;
  for (const [signal, weight] of Object.entries(weights)) {
    const value = signals[signal] * weight;
    if (value > contribution) {
      contribution = value;
      strongest = signal;
    }
  }
  switch (strongest) {
    case "interest": return `Matches your interests: ${matched.join(", ")}`;
    case "recency": return "Starting soon";
    case "popularity": return "Popular";
    case "distance": return "Near you";
    case "spots": return "Spots available";
    default: return "Suggested for you";
  }
}

/**
 * @param {Array} events Upcoming candidates. Invalid/past dates are excluded.
 * @param {Object} userProfile { interests?, interest_weights?, lat?, lng? }
 * @param {Object} options { now?: Date|string|number, limit?: number,
 *                          excludeEventIds?: Set|Array }
 * @returns {Array<{event: Object, score: number, reason: string}>}
 * score is the normalized signal score BEFORE diversity, for explainability.
 * Returned order penalises maximum tag overlap with earlier selections by up
 * to 30%, using a tunable heuristic. Missing tags receive no penalty.
 * Ties retain input order. Neither input events nor the profile are modified.
 * Unknown/unlimited capacity contributes 0 popularity/spots rather than a
 * fabricated ratio. Cold starts use only recency and popularity, renormalized.
 */
function rankEvents(events, userProfile = {}, options = {}) {
  const profile = userProfile || {};
  const now = options.now === undefined ? Date.now() : new Date(options.now).getTime();
  if (!Number.isFinite(now)) throw new TypeError("options.now must be a valid date");
  const limit = options.limit === undefined ? 10 : options.limit;
  if (!Number.isInteger(limit) || limit < 0) throw new RangeError("options.limit must be a non-negative integer");
  if (!limit) return [];
  const excluded = new Set(options.excludeEventIds || []);
  const interests = profileWeights(profile);
  const maximumInterest = [...interests.values()].reduce((sum, weight) => sum + weight, 0);
  const hasInterests = maximumInterest > 0;
  const interestWeights = Object.fromEntries(interests);
  const userLocation = coordinates(profile);
  const pool = [];

  for (const event of events || []) {
    if (!event || excluded.has(event.id)) continue;
    const startsAt = new Date(event.start_time).getTime();
    if (!Number.isFinite(startsAt) || startsAt < now) continue;
    const matched = tagNames(event.tags).filter(tag => (interests.get(tag) || 0) > 0);
    const venueLocation = coordinates(event.venue) || coordinates(event);
    const hasDistance = !!(userLocation && venueLocation);
    const signals = {
      interest: hasInterests ? interestScore(interestWeights, event.tags) : 0,
      recency: Math.exp(-((startsAt - now) / DAY_MS) / RANKING_CONFIG.recencyDays),
      popularity: positiveRatio(event.confirmed_count, event.capacity),
      distance: hasDistance ? 1 / (1 + distanceKm(userLocation, venueLocation) / RANKING_CONFIG.distanceKm) : 0,
      spots: positiveRatio(event.spots_left, event.capacity),
    };
    const weights = hasInterests
      ? { ...RANKING_CONFIG.weights }
      : { recency: RANKING_CONFIG.weights.recency, popularity: RANKING_CONFIG.weights.popularity };
    if (!hasDistance) delete weights.distance;
    const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
    const score = Object.entries(weights).reduce((sum, [signal, weight]) => sum + signals[signal] * weight, 0) / totalWeight;
    pool.push({ event, score: clamp(score), reason: reasonFor(signals, weights, matched) });
  }

  const ranked = [];
  while (pool.length && ranked.length < limit) {
    let bestIndex = 0;
    let bestScore = -1;
    pool.forEach((candidate, index) => {
      let maxSimilarity = 0;
      for (const chosen of ranked) {
        maxSimilarity = Math.max(maxSimilarity, tagSimilarity(candidate.event.tags, chosen.event.tags));
      }
      const adjusted = candidate.score * (1 - RANKING_CONFIG.diversityPenalty * maxSimilarity);
      if (adjusted > bestScore) { bestScore = adjusted; bestIndex = index; }
    });
    const [chosen] = pool.splice(bestIndex, 1);
    ranked.push(chosen);
  }
  return ranked;
}

module.exports = { rankEvents, interestScore, tagSimilarity, RANKING_CONFIG };
