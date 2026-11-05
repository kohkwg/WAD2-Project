const {
  calculateEventEvidence
} = require('./eventEvidence');

function buildRecommendationReason({
  event,
  selectedInterests = [],
  evidenceSnapshots = [],
  eventInterestsById = {},
  now
}) {
  if (event.source === 'general_discovery') return 'Upcoming event to explore';
  const tags = new Set(event.interests || []);
  let best = null;
  for (const snapshot of evidenceSnapshots) {
    const evidence = calculateEventEvidence(snapshot, {
      now
    });
    if (evidence.contribution <= 0) continue;
    const interests = [...new Set(eventInterestsById[snapshot.eventId] || [])];
    const contribution = evidence.contribution / interests.length;
    for (const interest of interests) {
      if (!tags.has(interest)) continue;
      if (!best || contribution > best.contribution) {
        best = {
          action: evidence.effectiveAction,
          interest,
          contribution
        };
      }
    }
  }
  if (best) {
    const action = {
      save: 'saved',
      rsvp: 'registered for',
      attend: 'attended'
    }[best.action];
    const interest = best.interest.replace(/[_-]/g, ' ');
    return `Your recent activity: you ${action} an event about ${interest}`;
  }
  const explicit = [...new Set(selectedInterests)].filter(interest => tags.has(interest)).map(interest => interest.replace(/[_-]/g, ' '));
  return explicit.length ? `Matches your selected interests: ${explicit.join(', ')}` : 'Suggested for you';
}
module.exports = {
  buildRecommendationReason
};
