// Public data.gov.sg v2 reads only; no simulated weather or silent fallback.
// Endpoint/payload: https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast
const WEATHER_URL = 'https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast'
const TWO_HOURS = 2 * 60 * 60 * 1000

// Bound the complete read, including a stalled JSON response body.
const WEATHER_TIMEOUT_MS = 15000

export async function fetchForecastData() {
  const controller = new AbortController()
  let deadline
  const timeout = new Promise((_, reject) => {
    deadline = setTimeout(() => {
      reject(new Error('Weather request timed out after 15 seconds. Please retry.'))
      controller.abort()
    }, WEATHER_TIMEOUT_MS)
  })
  const read = async () => {
    const response = await fetch(WEATHER_URL, { signal: controller.signal })
    if (!response.ok) throw new Error(`Weather service returned HTTP ${response.status}.`)
    const payload = await response.json()
    if (payload.code !== 0 || !payload.data || !Array.isArray(payload.data.area_metadata) || !Array.isArray(payload.data.items)) {
      throw new Error('Weather service returned an invalid forecast response.')
    }
    return payload.data
  }
  try {
    return await Promise.race([read(), timeout])
  } catch (error) {
    throw new Error(`Could not load the weather forecast. ${error.message || 'Please retry.'}`)
  } finally {
    clearTimeout(deadline)
  }
}

export function validCoordinates(lat, lng) {
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
}

export function forecastAreas(data) {
  return data.area_metadata.filter((area) => typeof area?.name === 'string' && area.name.trim()
    && validCoordinates(area.label_location?.latitude, area.label_location?.longitude))
    .map((area) => ({ name: area.name, lat: area.label_location.latitude, lng: area.label_location.longitude }))
}

function distance(venue, area) {
  const radians = (degrees) => degrees * Math.PI / 180
  const latDifference = radians(area.lat - venue.lat)
  const lngDifference = radians(area.lng - venue.lng)
  const a = Math.sin(latDifference / 2) ** 2 + Math.cos(radians(venue.lat)) * Math.cos(radians(area.lat)) * Math.sin(lngDifference / 2) ** 2
  return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)))
}

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)) return NaN
  return Date.parse(value)
}

function classifyRain(description) {
  if (/^(?:(?:light|moderate|heavy|passing|thundery|widespread)\s+)*(?:rain|showers)(?:\s+with gusty winds)?$/i.test(description)) return true
  if (/^(?:fair(?: \((?:day|night)\))?|sunny|partly cloudy(?: \((?:day|night)\))?|cloudy|hazy|slightly hazy|windy|mist|fog)$/i.test(description)) return false
  return null
}

/** Nearest forecast label is an approximation, never a venue-level forecast. */
export function eventForecast(data, event, manualArea, now = Date.now()) {
  const areas = forecastAreas(data)
  const primary = event.originalVenue || event.venue
  const hasCoordinates = validCoordinates(primary?.lat, primary?.lng)
  const selected = hasCoordinates
    ? areas.reduce((nearest, area) => !nearest || distance(primary, area) < distance(primary, nearest) ? area : nearest, null)
    : areas.find((area) => area.name === manualArea)
  const result = {
    available: false, area: selected?.name || null, areaSource: selected ? (hasCoordinates ? 'coordinates' : 'manual') : null,
    forecast: null, issuedAt: null, updatedAt: null, validFrom: null, validUntil: null,
    rainExpected: null, canSwitch: false, reason: '',
  }
  const unavailable = (reason) => ({ ...result, reason })
  if (!areas.length) return unavailable('Forecast areas are unavailable. Refresh to retry.')
  if (!selected) return unavailable('Choose a forecast area for this venue without coordinates.')
  // If multiple observations arrive, use the most recently updated one.
  const item = [...data.items].sort((a, b) => (timestamp(b?.update_timestamp) || 0) - (timestamp(a?.update_timestamp) || 0))[0]
  if (!item || !Array.isArray(item.forecasts)) return unavailable('A forecast observation is unavailable. Refresh to retry.')
  result.issuedAt = typeof item.timestamp === 'string' ? item.timestamp : null
  result.updatedAt = typeof item.update_timestamp === 'string' ? item.update_timestamp : null
  result.validFrom = typeof item.valid_period?.start === 'string' ? item.valid_period.start : null
  result.validUntil = typeof item.valid_period?.end === 'string' ? item.valid_period.end : null
  const description = item.forecasts.find((entry) => entry?.area === selected.name)?.forecast
  result.forecast = typeof description === 'string' && description.trim() ? description.trim() : null
  if (!result.forecast) return unavailable('No forecast is available for the selected area.')
  const issued = timestamp(result.issuedAt)
  const updated = timestamp(result.updatedAt)
  const from = timestamp(result.validFrom)
  const until = timestamp(result.validUntil)
  if (![issued, updated, from, until].every(Number.isFinite) || from >= until || until - from > TWO_HOURS || issued > updated) {
    return unavailable('The forecast has invalid timestamps. Refresh to retry.')
  }
  if (issued > now || updated > now || now - issued > TWO_HOURS || now - updated > TWO_HOURS || now < from || now >= until) {
    return unavailable('The forecast is stale or not currently valid. Refresh to retry.')
  }
  const rain = classifyRain(result.forecast)
  if (rain === null) return unavailable('The weather description is unknown; no switch recommendation is available.')
  result.available = true
  result.rainExpected = rain
  if (event.usingBackup) return { ...result, reason: 'The event is already using its backup venue.' }
  if (event.isOutdoor !== true) return { ...result, reason: 'This event is indoors.' }
  if (!event.backupVenue?.name || !event.backupVenue?.address) return { ...result, reason: 'No backup venue with an address is configured.' }
  const start = timestamp(event.startTime)
  const end = timestamp(event.endTime)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return { ...result, reason: 'The event has invalid start or end times.' }
  if (end <= now) return { ...result, reason: 'This event has ended.' }
  if (Math.max(start, now) < from || Math.max(start, now) >= until) return { ...result, reason: 'The event start is outside this forecast window.' }
  if (!rain) return { ...result, reason: 'No rain or showers are forecast for this area.' }
  return { ...result, canSwitch: true, reason: 'Rain or showers are forecast during this event. The backup venue is available to confirm.' }
}
