// Actor identity comes from the verified JWT; membership is checked with that JWT.
export async function canManageVenueSwitch(actorId, ownerId, readMembership) {
  if (!actorId || !ownerId) return false
  if (actorId === ownerId) return true
  return (await readMembership()) === true
}
