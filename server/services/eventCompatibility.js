
function calculateCompatibility(combinedPreferences, eventInterests) {
  const uniqueInterests = [...new Set(eventInterests || [])];

  let remainingMismatch = 1;

  for (const interest of uniqueInterests) {
    const points = Object.hasOwn(combinedPreferences, interest)
      ? combinedPreferences[interest]
      : 0;

    const strength = points / (points + 10);
    remainingMismatch *= 1 - strength;
  }

  return (1 - remainingMismatch) * 100;
}

module.exports = { calculateCompatibility };