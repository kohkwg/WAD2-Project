import { travelEstimate } from '../utils/itinerary.js'

// Travel for late join: the server's OneMap route when available, otherwise a
// distance-based estimate that is always labelled as an estimate.
const apiBase = () => import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000'
// Once the server says routing isn't configured, skip it for the rest of the session.
let notConfigured = false

export async function routeTravel(from, to, departMs) {
  const estimate = () => {
    const e = travelEstimate(from, to)
    return { minutes: e.minutes, mode: e.mode, live: false, km: e.km }
  }
  if (notConfigured) return estimate()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const params = new URLSearchParams({ from: `${from.lat},${from.lng}`, to: `${to.lat},${to.lng}`, mode: 'pt', depart: new Date(departMs).toISOString() })
    const response = await fetch(`${apiBase()}/api/route?${params}`, { signal: controller.signal })
    if (!response.ok) {
      if (response.status === 503 && (await response.json().catch(() => null))?.error === 'configuration') notConfigured = true
      return estimate()
    }
    const body = await response.json()
    return Number.isFinite(body.minutes) ? { minutes: body.minutes, mode: body.mode, live: true, transfers: body.transfers } : estimate()
  } catch {
    return estimate()
  } finally {
    clearTimeout(timer)
  }
}
