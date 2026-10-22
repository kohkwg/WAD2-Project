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
