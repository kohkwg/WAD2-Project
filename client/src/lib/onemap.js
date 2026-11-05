// OneMap search endpoint (no API token needed for basic search).
// Converts a 6-digit Singapore postal code into coordinates.
export async function geocodePostalCode(postal) {
  if (!/^\d{6}$/.test(postal)) throw new Error('Postal code must be 6 digits')

  const url =
    'https://www.onemap.gov.sg/api/common/elastic/search' +
    `?searchVal=${postal}&returnGeom=Y&getAddrDetails=Y&pageNum=1`

  const res = await fetch(url)
  if (!res.ok) throw new Error('OneMap lookup failed. Try again.')
  const data = await res.json()

  const hit = data.results?.[0]
  if (!hit) throw new Error('Postal code not found')

  return {
    lat: parseFloat(hit.LATITUDE),
    lng: parseFloat(hit.LONGITUDE),
    address: hit.ADDRESS,
  }
}

// Free-text place search (building, street or area name) for centring the map.
export async function searchPlace(text, signal) {
  const url =
    'https://www.onemap.gov.sg/api/common/elastic/search' +
    `?searchVal=${encodeURIComponent(text)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error('OneMap lookup failed.')
  const hit = (await res.json()).results?.[0]
  if (!hit) return null
  return { lat: parseFloat(hit.LATITUDE), lng: parseFloat(hit.LONGITUDE), name: hit.BUILDING && hit.BUILDING !== 'NIL' ? hit.BUILDING : hit.ADDRESS }
}

// OneMap names are in capitals ("MAXWELL FOOD CENTRE"); show them as "Maxwell Food Centre".
// Words with digits stay as they are (unit numbers, "TE18"), and "SINGAPORE 069184" reads naturally.
const KEEP_CAPS = new Set(['mrt', 'lrt', 'smu', 'nus', 'ntu', 'sutd', 'sit', 'suss', 'kfc', 'ion', 'cbd', 'hdb', 'ymca', 'ywca', 'nex'])
function readable(text = '') {
  return String(text).toLowerCase().replace(/[a-z0-9'’#-]+/g, (word) => (/\d/.test(word) || KEEP_CAPS.has(word) ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1)))
}

// Up to `limit` matches for a typed place (building, street, food centre or postal code), for
// suggesting a spot: [{ name, address, postal, lat, lng }]. OneMap needs no key for this. It
// pages results 10 at a time in its own order, so `pages` pages are fetched together, letting the
// caller sort a wider set (e.g. nearest branch of a chain first).
export async function searchPlaces(text, signal, limit = 5, pages = 1) {
  const page = async (n) => {
    const url =
      'https://www.onemap.gov.sg/api/common/elastic/search' +
      `?searchVal=${encodeURIComponent(text)}&returnGeom=Y&getAddrDetails=Y&pageNum=${n}`
    const res = await fetch(url, { signal })
    if (!res.ok) throw new Error('Place search is unavailable right now.')
    const body = await res.json()
    return { results: body.results || [], total: Number(body.totalNumPages) || 1 }
  }
  const first = await page(1)
  const more = await Promise.all(Array.from({ length: Math.min(pages, first.total) - 1 }, (_, i) => page(i + 2).then((p) => p.results).catch(() => [])))
  const seen = new Set()
  const places = []
  for (const hit of [first.results, ...more].flat()) {
    const name = hit.BUILDING && hit.BUILDING !== 'NIL' ? hit.BUILDING : hit.SEARCHVAL
    const key = `${name}|${hit.POSTAL}`
    const lat = parseFloat(hit.LATITUDE), lng = parseFloat(hit.LONGITUDE)
    if (!name || seen.has(key) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue
    seen.add(key)
    // OneMap's address repeats the building name ("1 Kadayanallur Street Maxwell Food Centre Singapore 069184")
    // anywhere in it, including at the end), so take the name out of the address line
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const address = String(hit.ADDRESS || '').replace(new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, 'i'), ' ').replace(/\s+/g, ' ').trim()
    places.push({ name: readable(name), address: readable(address), postal: hit.POSTAL !== 'NIL' ? hit.POSTAL : '', lat, lng })
    if (places.length >= limit) break
  }
  return places
}
