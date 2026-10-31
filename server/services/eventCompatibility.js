// Points must be finite and nonnegative; interests must be canonical slug strings.
// Topic fit only: this function does not check event eligibility or rank events.
function calculateCompatibility(combinedPreferences, eventInterests) {
  if (!Array.isArray(eventInterests) || eventInterests.length === 0) {
    return 0;
  }

  const uniqueInterests = [...new Set(eventInterests)];
  let totalFit = 0;

  for (const interest of uniqueInterests) {
    let points = 0;
    if (Object.hasOwn(combinedPreferences, interest)) {
      points = combinedPreferences[interest];
    }

    totalFit += points / (points + 10);
  }

  return (totalFit / uniqueInterests.length) * 100;
}

module.exports = { calculateCompatibility };
