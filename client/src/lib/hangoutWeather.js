// NEA forecasts via data.gov.sg v2 (public, no key) for a hangout's start time and place.
// The horizon follows the start: two-hour area forecast, then the 24-hour regional
// forecast, then the four-day national outlook. Missing data is "unavailable"; no
// forecast is ever invented. Endpoints: https://api-open.data.gov.sg/v2/real-time/api/
const BASE = 'https://api-open.data.gov.sg/v2/real-time/api'
const HOUR = 3600000
// Approximate centres for NEA's five 24-hour forecast regions.
const REGIONS = { north: { lat: 1.418, lng: 103.82 }, south: { lat: 1.28, lng: 103.82 }, east: { lat: 1.35, lng: 103.94 }, west: { lat: 1.35, lng: 103.7 }, central: { lat: 1.355, lng: 103.82 } }
const sq = (a, b) => (a.lat - b.lat) ** 2 + (a.lng - b.lng) ** 2
const nearest = (point, entries) => entries.reduce((best, e) => (!best || sq(point, e) < sq(point, best) ? e : best), null)

export function horizonFor(startMs, now = Date.now()) {
  if (startMs - now <= 2 * HOUR) return 'two-hr-forecast'
  if (startMs - now <= 24 * HOUR) return 'twenty-four-hr-forecast'
  if (startMs - now <= 4 * 24 * HOUR) return 'four-day-outlook'
  return null
}

// Pure: picks the forecast for a start time and place from one payload.
export function pickForecast(kind, payload, startMs, point) {
  const unavailable = reason => ({ available: false, kind, reason })
  const data = payload?.data
  if (kind === 'two-hr-forecast') {
    const areas = (data?.area_metadata || []).map(a => ({ name: a.name, lat: a.label_location?.latitude, lng: a.label_location?.longitude })).filter(a => Number.isFinite(a.lat))
    const item = data?.items?.[0]
    const area = point && nearest(point, areas)
    const text = item?.forecasts?.find(f => f.area === area?.name)?.forecast
    if (!area || !text) return unavailable('No two-hour forecast for this area right now.')
    return { available: true, kind, label: 'Next 2 hours', text, where: `${area.name} (nearest NEA area)`, validUntil: item.valid_period?.end || null, updatedAt: item.update_timestamp || null }
  }
  if (kind === 'twenty-four-hr-forecast') {
    const record = data?.records?.[0]
    const period = record?.periods?.find(p => Date.parse(p.timePeriod?.start) <= startMs && startMs < Date.parse(p.timePeriod?.end))
    if (!period) return unavailable('The 24-hour forecast doesn’t cover this start time yet.')
    const region = point ? Object.entries(REGIONS).reduce((best, [name, c]) => (!best || sq(point, c) < sq(point, REGIONS[best]) ? name : best), null) : 'central'
    const text = period.regions?.[region]?.text
    if (!text) return unavailable('No regional forecast is available.')
    return { available: true, kind, label: period.timePeriod.text, text, where: `${region[0].toUpperCase()}${region.slice(1)} Singapore`, updatedAt: record.updatedTimestamp || null }
  }
  if (kind === 'four-day-outlook') {
    const record = data?.records?.[0]
    const sgDay = ms => new Date(ms + 8 * HOUR).toISOString().slice(0, 10)
    const day = record?.forecasts?.find(f => sgDay(Date.parse(f.timestamp)) === sgDay(startMs))
    if (!day?.forecast?.summary && !day?.forecast?.text) return unavailable('The four-day outlook doesn’t include this day yet.')
    return { available: true, kind, label: `${day.day} outlook`, text: day.forecast.summary || day.forecast.text, where: 'Singapore-wide', updatedAt: record.updatedTimestamp || null }
  }
  return unavailable('A forecast is available within four days of the hangout.')
}

export async function fetchHangoutForecast(startMs, point, now = Date.now()) {
  const kind = horizonFor(startMs, now)
  if (!kind) return pickForecast(null, null, startMs, point)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch(`${BASE}/${kind}`, { signal: controller.signal })
    if (!response.ok) return { available: false, kind, reason: 'NEA’s forecast service is unavailable. Try again later.' }
    return pickForecast(kind, await response.json(), startMs, point)
  } catch {
    return { available: false, kind, reason: 'NEA’s forecast couldn’t be reached. Try again later.' }
  } finally {
    clearTimeout(timer)
  }
}
