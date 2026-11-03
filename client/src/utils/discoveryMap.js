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


// Retained illustrated-landing compatibility helpers.
// A local equirectangular projection: geographic positions stay stable while
// the illustrated terrain supplies depth. Bounds include Singapore's islands.
export function projectVenue(event) {
  const lat = event.lat ?? event.venue?.lat
  const lng = event.lng ?? event.venue?.lng
  if (!Number.isFinite(lat) || !Number.isFinite(lng)
    || lat < 1.15 || lat > 1.49 || lng < 103.59 || lng > 104.1) return null
  return { x: 100 + (lng - 103.59) / 0.51 * 1000, y: 570 - (lat - 1.15) / 0.34 * 480 }
}

// Authored regional control points on the expanded illustration (1200×900).
// These register broad neighbourhoods, not surveyed street-level positions.
// All events use the same continuous geographic warp; none get manual slots.
export const ILLUSTRATION_ANCHORS = [
  { name: 'Jurong', lat: 1.34, lng: 103.7, x: 180, y: 440 },
  { name: 'Woodlands', lat: 1.435, lng: 103.79, x: 440, y: 100 },
  { name: 'Central / Orchard', lat: 1.3048, lng: 103.8318, x: 650, y: 390 },
  { name: 'Bishan', lat: 1.35, lng: 103.85, x: 600, y: 270 },
  { name: 'Tampines', lat: 1.355, lng: 103.945, x: 1005, y: 255 },
  { name: 'Changi', lat: 1.365, lng: 104.0, x: 1095, y: 430 },
  { name: 'Marina Bay', lat: 1.282, lng: 103.855, x: 810, y: 610 },
  { name: 'Sentosa', lat: 1.25, lng: 103.83, x: 585, y: 780 },
]
const illustrationBase = point => ({ x: (point.x - 100) * 1.2, y: (point.y - 90) * 1.875 })
const calibratedAnchors = ILLUSTRATION_ANCHORS.map(anchor => ({ ...anchor, base: illustrationBase(projectVenue(anchor)) }))

export function projectIllustratedVenue(event) {
  const geographic = projectVenue(event)
  if (!geographic) return null
  const base = illustrationBase(geographic)
  let weightSum = 0, offsetX = 0, offsetY = 0
  for (const anchor of calibratedAnchors) {
    const distanceSquared = (base.x - anchor.base.x) ** 2 + (base.y - anchor.base.y) ** 2
    if (distanceSquared < .000001) return { x: anchor.x, y: anchor.y }
    const weight = 1 / distanceSquared
    weightSum += weight
    offsetX += (anchor.x - anchor.base.x) * weight
    offsetY += (anchor.y - anchor.base.y) * weight
  }
  const point = { x: base.x + offsetX / weightSum, y: base.y + offsetY / weightSum }
  // Locations beyond the authored canvas remain discoverable in the list.
  return point.x >= 0 && point.x <= 1200 && point.y >= 0 && point.y <= 900 ? point : null
}

// Prominent events are removed before clustering; counts never duplicate them.
// Same-location events remain in a selectable group even at maximum zoom.
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
