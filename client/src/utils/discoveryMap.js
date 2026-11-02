// OneMap discovery helpers. Positions are the venue's real coordinates; events
// without valid Singapore coordinates stay in the list rather than being guessed.
export const SINGAPORE_BOUNDS = { south: 1.144, west: 103.535, north: 1.494, east: 104.131 }
export const SINGAPORE_CENTER = { lat: 1.3521, lng: 103.8198 }

export function eventLatLng(event) {
  const lat = event?.lat ?? event?.venue?.lat
  const lng = event?.lng ?? event?.venue?.lng
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return inBounds({ lat, lng }, SINGAPORE_BOUNDS) ? { lat, lng } : null
}

// bounds: { south, west, north, east } (Leaflet's LatLngBounds getters map onto these).
export function inBounds(point, bounds) {
  return Boolean(point && bounds) && point.lat >= bounds.south && point.lat <= bounds.north
    && point.lng >= bounds.west && point.lng <= bounds.east
}

// Great-circle distance in kilometres between two { lat, lng } points.
export function distanceKm(a, b) {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}
export function eventsNear(events, center, radiusKm) {
  return events.filter(event => {
    const position = eventLatLng(event)
    return position && distanceKm(position, center) <= radiusKm
  })
}

// Each category pairs a Hawker Glow colour with a letter, so pins never rely on colour alone.
const CATEGORY_STYLES = {
  tech: { tone: 'teal', glyph: 'T' }, music: { tone: 'pink', glyph: 'M' },
  sports: { tone: 'teal', glyph: 'S' }, arts: { tone: 'pink', glyph: 'A' },
  food: { tone: 'mango', glyph: 'F' }, volunteering: { tone: 'mango', glyph: 'V' },
  career: { tone: 'ink', glyph: 'C' }, outdoors: { tone: 'teal', glyph: 'O' },
  gaming: { tone: 'pink', glyph: 'G' }, wellness: { tone: 'mango', glyph: 'W' },
}
export function eventCategory(event) {
  return event?.category || event?.tags?.find(tag => CATEGORY_STYLES[tag]) || event?.tags?.[0] || ''
}
export function categoryStyle(event) {
  const category = eventCategory(event)
  return { category, ...(CATEGORY_STYLES[category] || { tone: 'ink', glyph: '•' }) }
}

// Prominent events are removed before clustering; counts never duplicate them.
// Same-location events remain in a selectable group even at maximum zoom.
// Points are screen-space { x, y } (pixels at the current zoom), so zoom = 1 there.
export function groupMarkers(points, zoom = 1, prominentIds = []) {
  const prominent = new Set(prominentIds)
  const groups = []
  for (const point of points) {
    if (prominent.has(point.id)) {
      groups.push({ key: point.id, x: point.x, y: point.y, events: [point], prominent: true })
      continue
    }
    const nearby = groups.find(g => !g.prominent && Math.hypot(g.x - point.x, g.y - point.y) < 55 / zoom)
    if (nearby) nearby.events.push(point)
    else groups.push({ key: point.id, x: point.x, y: point.y, events: [point], prominent: false })
  }
  return groups
}

// Real map pins cannot be displaced from their venue, so any pins whose hit areas
// would overlap merge into one cluster (keeping the "picked" flag when either had it).
export function mergeOverlapping(groups, minDistance = 44) {
  const merged = []
  for (const group of groups) {
    const target = merged.find(g => Math.hypot(g.x - group.x, g.y - group.y) < minDistance)
    if (target) {
      target.events.push(...group.events)
      target.prominent = target.prominent || group.prominent
    } else merged.push({ ...group, events: [...group.events] })
  }
  return merged
}
