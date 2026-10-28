// Waitlist priority scoring (Gregory's algorithm)
//
// Score = 0.4 × member + 0.3 × interest match + 0.3 × show-up rate
//   member         1 if the organiser marked this person as a club/group member, else 0
//   interest match share of the event's tags that are in the person's interests (0 to 1)
//   show-up rate   how reliably they turned up to past events (0 to 1), where
//                  recent events count more and late cancellations are penalised
//
// Highest score gets the next free spot. The weights are a first guess — tune them after testing.

export const WEIGHTS = { member: 0.4, interest: 0.3, showUp: 0.3 }

// An event this many days ago counts HALF as much as one today (90 days ago → 0.5, 180 → 0.25)
export const HALF_LIFE_DAYS = 90

// A late cancellation takes away this much of that event's weight (on top of not attending)
export const LATE_CANCEL_PENALTY = 0.5

// Someone with no history yet gets this middle value, so new users aren't punished
export const NEW_USER_SHOW_UP = 0.5

const DAY_MS = 24 * 60 * 60 * 1000

// Example: event tags ['music', 'tech'], interests ['music'] → 1 of 2 tags match → 0.5
export function interestMatch(userInterests, eventTags) {
  if (eventTags.length === 0) return 0
  const matches = eventTags.filter((tag) => userInterests.includes(tag)).length
  return matches / eventTags.length
}

// history: [{ eventDate, attended: true/false, lateCancel: true/false }, ...]
export function showUpRate(history, today = new Date()) {
  if (history.length === 0) return NEW_USER_SHOW_UP

  let attendedWeight = 0
  let totalWeight = 0

  for (const past of history) {
    const daysAgo = Math.max(0, (today - new Date(past.eventDate)) / DAY_MS)
    const weight = Math.pow(0.5, daysAgo / HALF_LIFE_DAYS) // recent → close to 1, old → close to 0

    totalWeight += weight
    if (past.attended) attendedWeight += weight
    if (past.lateCancel) attendedWeight -= weight * LATE_CANCEL_PENALTY
  }

  // Never below 0 (lots of late cancels could push it negative)
  return Math.max(0, attendedWeight / totalWeight)
}

// Returns the total plus each part, so the organiser page can show WHY someone ranks where they do
export function calculateWaitlistScore({ isMember, userInterests, eventTags, history, today }) {
  const parts = {
    member: isMember ? 1 : 0,
    interest: interestMatch(userInterests, eventTags),
    showUp: showUpRate(history, today),
  }
  const total =
    WEIGHTS.member * parts.member +
    WEIGHTS.interest * parts.interest +
    WEIGHTS.showUp * parts.showUp

  return { total, parts }
}
