// actor identity comes from the verified jwt; membership is checked with that jwt.

export async function canManageVenueSwitch(actorId, ownerId, readMembership) {
  if (!actorId || !ownerId) return false;
  if (actorId === ownerId) return true;
  return (await readMembership()) === true;
}
