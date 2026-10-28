const TWO_HOURS_MS = 2 * 60 * 60 * 1000
const TIMESTAMP = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/

function instant(value) {
  if (typeof value !== 'string' || !TIMESTAMP.test(value)) return NaN
  return Date.parse(value)
}

function coordinates(lat, lng) {
  return typeof lat === 'number' && Number.isFinite(lat) && Math.abs(lat) <= 90
    && typeof lng === 'number' && Number.isFinite(lng) && Math.abs(lng) <= 180
}

function distanceSquaredRadians(a, b) {
  const rad = (degrees) => degrees * Math.PI / 180
  const lat1 = rad(a.latitude)
  const lat2 = rad(b.latitude)
  const dLat = lat2 - lat1
  const dLng = rad(b.longitude - a.longitude)
  const haversine = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)))
}

function isRain(description) {
  if (/^(?:(?:light|moderate|heavy|passing|thundery|widespread)\s+)*(?:rain|showers)(?:\s+with gusty winds)?$/i.test(description)) return true
  if (/^(?:fair(?: \((?:day|night)\))?|sunny|partly cloudy(?: \((?:day|night)\))?|cloudy|hazy|slightly hazy|windy|mist|fog)$/i.test(description)) return false
  return null
}

/** Validate one server-fetched NEA response against the persisted original venue. */
export function trustedRainEvidence(payload, event, { now = Date.now() } = {}) {
  const data = payload?.data
  if (payload?.code !== 0 || !Array.isArray(data?.area_metadata) || !Array.isArray(data?.items)) {
    throw new Error('NEA returned an invalid 2-hour forecast response.')
  }
  const original = event?.venue
  if (!coordinates(original?.latitude, original?.longitude)) {
    throw new Error('The original venue has no valid trusted coordinates.')
  }
  if (!event || event.status !== 'published') throw new Error('Only a published event can switch venues.')
  if (event.using_backup) throw new Error('The event is already using its backup venue.')
  if (original.is_indoor !== false) throw new Error('This event is not configured as an outdoor event.')
  if (!event.backup_venue?.id || typeof event.backup_venue.name !== 'string' || !event.backup_venue.name.trim()
    || typeof event.backup_venue.address !== 'string' || !event.backup_venue.address.trim()) {
    throw new Error('A backup venue with a name and address is required.')
  }

  const areas = data.area_metadata.filter((area) => typeof area?.name === 'string' && area.name.trim()
    && coordinates(area.label_location?.latitude, area.label_location?.longitude))
  if (!areas.length) throw new Error('NEA forecast areas are unavailable.')
  const area = areas.reduce((nearest, candidate) => {
    if (!nearest) return candidate
    return distanceSquaredRadians(original, candidate.label_location) < distanceSquaredRadians(original, nearest.label_location)
      ? candidate : nearest
  }, null)

  const item = [...data.items].sort((a, b) => (instant(b?.update_timestamp) || 0) - (instant(a?.update_timestamp) || 0))[0]
  if (!item || !Array.isArray(item.forecasts)) throw new Error('An NEA forecast observation is unavailable.')
  const issuedAt = item.timestamp
  const updatedAt = item.update_timestamp
  const validFrom = item.valid_period?.start
  const validUntil = item.valid_period?.end
  const issued = instant(issuedAt)
  const updated = instant(updatedAt)
  const from = instant(validFrom)
  const until = instant(validUntil)
  if (![issued, updated, from, until].every(Number.isFinite) || from >= until || until - from > TWO_HOURS_MS || issued > updated) {
    throw new Error('NEA forecast timestamps are invalid.')
  }
  if (issued > now || updated > now || now - issued > TWO_HOURS_MS || now - updated > TWO_HOURS_MS || now < from || now >= until) {
    throw new Error('NEA forecast is stale or not currently valid.')
  }

  const description = item.forecasts.find((forecast) => forecast?.area === area.name)?.forecast
  if (typeof description !== 'string' || !description.trim()) throw new Error('No NEA forecast is available for the original venue area.')
  const normalized = description.trim()
  if (isRain(normalized) !== true) throw new Error(isRain(normalized) === false
    ? 'The original venue area has no rain or showers forecast.'
    : 'The NEA weather description is unknown; switching is unavailable.')

  const start = instant(event.starts_at)
  const end = instant(event.ends_at)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end <= now) {
    throw new Error('The event has ended or has invalid times.')
  }
  const eventTime = Math.max(start, now)
  if (eventTime < from || eventTime >= until) throw new Error('The event is outside the current NEA forecast window.')

  return {
    area: area.name,
    forecast: normalized,
    issuedAt: new Date(issued).toISOString(),
    updatedAt: new Date(updated).toISOString(),
    validFrom: new Date(from).toISOString(),
    validUntil: new Date(until).toISOString(),
    verifiedAt: new Date(now).toISOString(),
  }
}
