import { trustedRainEvidence } from './switchRules.mjs'

const WEATHER_URL = 'https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast'
const MAX_HTTP_MS = 15_000
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
}
const EVENT_SELECT = 'id,organiser_id,title,starts_at,ends_at,status,using_backup,venue:venues!events_venue_id_fkey(id,name,address,latitude,longitude,is_indoor),backup_venue:venues!events_backup_venue_id_fkey(id,name,address,latitude,longitude,is_indoor)'

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: CORS })
}

function bearer(req: Request) {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.get('Authorization') ?? '')
  return match?.[1] ?? null
}

function apiKeys() {
  const anon = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}').default
    ?? Deno.env.get('SUPABASE_ANON_KEY')
  const legacyService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const service = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default ?? legacyService
  const url = Deno.env.get('SUPABASE_URL')
  if (!url || !anon || !service) throw new Error('Supabase function secrets are not configured.')
  return {
    url: url.replace(/\/$/, ''), anon, service,
    serviceAuthorization: !JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default && legacyService
      ? `Bearer ${legacyService}` : null,
  }
}

async function jsonRequest(url: string, init: RequestInit, timeoutMs = MAX_HTTP_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    let body: any
    try { body = await response.json() } catch { body = null }
    return { response, body }
  } finally {
    clearTimeout(timer)
  }
}

function databaseError(body: any, fallback: string) {
  return typeof body?.message === 'string' ? body.message
    : typeof body?.details === 'string' ? body.details
      : typeof body?.error === 'string' ? body.error : fallback
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return reply(405, { error: 'Use POST to request a venue switch.' })

  const token = bearer(req)
  if (!token) return reply(401, { error: 'Sign in to switch this event venue.' })
  let body: any
  try { body = await req.json() } catch { return reply(400, { error: 'Request body must be valid JSON.' }) }
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).length !== 1 || typeof body.eventId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.eventId)) {
    return reply(400, { error: 'Provide only a valid eventId.' })
  }

  try {
    const { url, anon, service, serviceAuthorization } = apiKeys()
    const auth = await jsonRequest(`${url}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
    })
    if (!auth.response.ok || typeof auth.body?.id !== 'string') {
      return reply(401, { error: 'Your session is invalid or expired. Sign in and retry.' })
    }
    const ownerId = auth.body.id
    const eventResult = await jsonRequest(`${url}/rest/v1/events?select=${encodeURIComponent(EVENT_SELECT)}&id=eq.${encodeURIComponent(body.eventId)}&limit=1`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
    })
    if (!eventResult.response.ok) return reply(500, { error: 'Could not load the event for venue switching.' })
    const event = Array.isArray(eventResult.body) ? eventResult.body[0] : null
    if (!event) return reply(404, { error: 'Event not found.' })
    if (event.organiser_id !== ownerId) return reply(403, { error: 'Only the event owner can switch its venue.' })

    let evidence = null
    if (!event.using_backup) {
      let weather
      try { weather = await jsonRequest(WEATHER_URL, { headers: { Accept: 'application/json' } }) } catch {
        return reply(502, { error: 'Could not reach the NEA 2-hour forecast service.' })
      }
      if (!weather.response.ok) return reply(502, { error: `NEA weather service returned HTTP ${weather.response.status}.` })
      try {
        evidence = trustedRainEvidence(weather.body, event)
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('NEA returned an invalid')) {
          return reply(502, { error: error.message })
        }
        return reply(409, { error: error instanceof Error ? error.message : 'The current forecast does not allow a venue switch.' })
      }
    }

    const rpcHeaders: Record<string, string> = { apikey: service, 'Content-Type': 'application/json' }
    if (serviceAuthorization) rpcHeaders.Authorization = serviceAuthorization
    const result = await jsonRequest(`${url}/rest/v1/rpc/commit_trusted_venue_switch`, {
      method: 'POST',
      headers: rpcHeaders,
      body: JSON.stringify({ p_event_id: body.eventId, p_owner_id: ownerId, p_evidence: evidence }),
    })
    if (!result.response.ok) {
      const message = databaseError(result.body, 'The trusted venue switch could not be saved.')
      const conflict = /already using|switch record|only the event owner|eligib|forecast|backup venue/i.test(message)
      return reply(conflict ? 409 : 500, { error: message })
    }
    if (!result.body?.event || !result.body?.announcement) {
      return reply(500, { error: 'The venue switch succeeded, but its saved response could not be read. Retry to reconcile it.' })
    }
    return reply(200, result.body)
  } catch (error) {
    return reply(500, { error: error instanceof Error ? error.message : 'Venue switch failed.' })
  }
})
