// The slugs in public.interests. Event creation (Feature 2) tags events with these,
// the view exposes them as events_with_counts.tags, and profiles.interest_weights is
// keyed by them, so filters, profile interests and recommendations all match.
// Lowercase because the recommendation engine matches on exact strings.
export const INTEREST_OPTIONS = [
  'tech', 'music', 'sports', 'arts', 'food',
  'volunteering', 'career', 'outdoors', 'gaming', 'wellness',
]

export const CATEGORIES = INTEREST_OPTIONS
