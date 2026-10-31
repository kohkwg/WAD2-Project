// Interest arrays contain canonical slug strings. Missing arrays mean no tags.
function calculateInterestSimilarity(a, b) {
  const first = new Set(Array.isArray(a) ? a : []);
  const second = new Set(Array.isArray(b) ? b : []);
  let sharedCount = 0;

  for (const interest of first) {
    if (second.has(interest)) {
      sharedCount += 1;
    }
  }

  const unionCount = first.size + second.size - sharedCount;
  if (unionCount === 0) {
    return 0;
  }
  return sharedCount / unionCount;
}

// Expects eligible candidates with valid IDs and finite compatibility scores
// from 0 to 100. Duplicate IDs must carry identical canonical evidence.
// Input order breaks ties. rankingScore records the score WHEN selected.
function selectDiverseEvents(scoredEvents, limit, diversityPenalty = 0.3) {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new RangeError('limit must be a nonnegative integer');
  }
  if (!Number.isFinite(diversityPenalty) || diversityPenalty < 0 || diversityPenalty > 1) {
    throw new RangeError('diversityPenalty must be between 0 and 1');
  }

  const pool = [];
  const selected = [];
  const seenEvents = new Set();

  for (const event of scoredEvents) {
    if (seenEvents.has(event.eventId)) {
      continue;
    }
    seenEvents.add(event.eventId);
    if (event.compatibilityScore > 0) {
      pool.push(event);
    }
  }

  while (selected.length < limit && pool.length > 0) {
    let bestIndex = -1;
    let bestRankingScore = -Infinity;

    for (let index = 0; index < pool.length; index += 1) {
      const candidate = pool[index];
      let maximumSimilarity = 0;

      for (const chosen of selected) {
        const similarity = calculateInterestSimilarity(candidate.interests, chosen.interests);
        maximumSimilarity = Math.max(maximumSimilarity, similarity);
      }

      const rankingScore = candidate.compatibilityScore * (1 - diversityPenalty * maximumSimilarity);
      if (rankingScore > bestRankingScore) {
        bestIndex = index;
        bestRankingScore = rankingScore;
      }
    }

    selected.push({ ...pool[bestIndex], rankingScore: bestRankingScore });
    pool.splice(bestIndex, 1);
  }

  return selected;
}

module.exports = { calculateInterestSimilarity, selectDiverseEvents };
