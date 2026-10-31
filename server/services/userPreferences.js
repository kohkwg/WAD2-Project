// Expects valid interest slugs and canonical evidence. Duplicate event records
// must agree; conflicting versions must be resolved before calling this function.
function buildUserPreferences(selectedInterests, eventEvidence) {
  const explicitPreferences = {};
  const learnedPreferences = {};

  for (const interest of selectedInterests) {
    explicitPreferences[interest] = 10;
  }

  const seenEvents = new Set();

  for (const event of eventEvidence) {
    if (seenEvents.has(event.eventId)) {
      continue;
    }

    seenEvents.add(event.eventId);

    const uniqueInterests = [...new Set(event.interests)];
    if (uniqueInterests.length === 0 || event.contribution === 0) {
      continue;
    }

    const share = event.contribution / uniqueInterests.length;

    for (const interest of uniqueInterests) {
      if (!Object.hasOwn(learnedPreferences, interest)) {
        learnedPreferences[interest] = 0;
      }
      learnedPreferences[interest] += share;
    }
  }

  const combinedPreferences = { ...explicitPreferences };

  for (const interest of Object.keys(learnedPreferences)) {
    if (!Object.hasOwn(combinedPreferences, interest)) {
      combinedPreferences[interest] = 0;
    }
    combinedPreferences[interest] += learnedPreferences[interest];
  }

  return {
    explicitPreferences,
    learnedPreferences,
    combinedPreferences,
  };
}

module.exports = { buildUserPreferences };
