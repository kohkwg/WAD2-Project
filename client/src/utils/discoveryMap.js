// A local equirectangular projection: geographic positions stay stable while
// the illustrated terrain supplies depth. Bounds include Singapore's islands.
export function projectVenue(event) {
  const lat = event.lat ?? event.venue?.lat
  const lng = event.lng ?? event.venue?.lng
  if (!Number.isFinite(lat) || !Number.isFinite(lng)
    || lat < 1.15 || lat > 1.49 || lng < 103.59 || lng > 104.1) return null
  return { x: 100 + (lng - 103.59) / 0.51 * 1000, y: 570 - (lat - 1.15) / 0.34 * 480 }
}

// Authored regional control points on the supplied illustration (1200×900).
// These register broad neighbourhoods, not surveyed street-level positions.
// All events use the same continuous geographic warp; none get manual slots.
export const ILLUSTRATION_ANCHORS = [
  { name: 'Jurong', lat: 1.34, lng: 103.7, x: 215, y: 390 },
  { name: 'Woodlands', lat: 1.435, lng: 103.79, x: 550, y: 155 },
  { name: 'Central / Orchard', lat: 1.3048, lng: 103.8318, x: 510, y: 420 },
  { name: 'Bishan', lat: 1.35, lng: 103.85, x: 520, y: 300 },
  { name: 'Tampines', lat: 1.355, lng: 103.945, x: 810, y: 305 },
  { name: 'Changi', lat: 1.365, lng: 104.0, x: 1055, y: 385 },
  { name: 'Marina Bay', lat: 1.282, lng: 103.855, x: 715, y: 525 },
  { name: 'Sentosa', lat: 1.25, lng: 103.83, x: 605, y: 740 },
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
