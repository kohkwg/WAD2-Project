import { supabase } from './supabase.js'
import { eventForecast, fetchForecastData, forecastAreas } from './feature4Weather.js'

const EVENT_COLUMNS = `
  id, organiser_id, starts_at, ends_at, using_backup,
  venue:venues!events_venue_id_fkey(id,name,address,postal_code,latitude,longitude,is_indoor),
  backup_venue:venues!events_backup_venue_id_fkey(id,name,address,postal_code,latitude,longitude,is_indoor)
`

function check({ data, error }) {
  if (error) throw new Error(error.message)
  return data
}

function venueDto(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    address: row.address || '',
    postal: row.postal_code,
    lat: row.latitude,
    lng: row.longitude,
  }
}

function eventDto(row) {
  const originalVenue = venueDto(row.venue)
  return {
    id: row.id,
    startTime: row.starts_at,
    endTime: row.ends_at,
    isOutdoor: row.venue ? !row.venue.is_indoor : false,
    originalVenue,
    venue: row.using_backup ? venueDto(row.backup_venue) : originalVenue,
    backupVenue: venueDto(row.backup_venue),
    usingBackup: row.using_backup,
  }
}

export function createFeature4WeatherAdapter({ client = supabase, fetchData = fetchForecastData, now = Date.now } = {}) {
async function readEvent(eventId) {
  if (!client) throw new Error('Live Feature 4 weather is unavailable because Supabase is not configured.')
  const { data: sessionData, error: sessionError } = await client.auth.getSession()
  if (sessionError) throw new Error(sessionError.message)
  if (!sessionData.session) throw new Error('Please sign in first.')

  const row = check(await client.from('events').select(EVENT_COLUMNS).eq('id', eventId).maybeSingle())
  if (!row) throw new Error('Event not found.')
  if (row.organiser_id !== sessionData.session.user.id) throw new Error('Only the event owner can manage its weather settings.')
  return eventDto(row)
}

async function readManualArea(eventId) {
  const row = check(await client.from('event_operation_settings')
    .select('forecast_area')
    .eq('event_id', eventId)
    .maybeSingle())
  return row?.forecast_area || null
}

async function getEventSnapshot(eventId) {
  const event = await readEvent(eventId)
  const [manualArea, data] = await Promise.all([readManualArea(eventId), fetchData()])
  const forecast = eventForecast(data, event, manualArea, now())
  if (forecast.canSwitch && forecast.areaSource !== 'coordinates') {
    forecast.canSwitch = false
    forecast.reason = 'The original venue needs valid coordinates before a live backup switch can be confirmed.'
  }
  return { forecast, areas: forecastAreas(data) }
}

/** Read a single live weather response and derive both the forecast and area list. */
async function getEventWeather(eventId) { return getEventSnapshot(eventId) }

/** Public forecast-area catalogue from the Singapore data.gov.sg response. */
async function getForecastAreas() { return forecastAreas(await fetchData()) }

/** Read the saved organiser area and live forecast for this event. */
async function getEventForecast(eventId) { return (await getEventSnapshot(eventId)).forecast }

/** The Edge Function independently fetches NEA weather and authorizes the write. */
async function confirmBackupVenueSwitch(eventId) {
  if (!client?.functions?.invoke) throw new Error('Live backup venue switching is not configured.')
  const { data, error } = await client.functions.invoke('venue-switch', { body: { eventId } })
  if (error) {
    let reason
    try { reason = (await error.context?.json())?.error } catch { /* Keep the transport error. */ }
    throw new Error(reason || error.message || 'Could not confirm the backup venue switch.')
  }
  if (data?.event?.id !== eventId || data?.event?.usingBackup !== true || data?.announcement?.kind !== 'venue-switch') {
    throw new Error('The venue switch response is incomplete. Refresh the event before retrying.')
  }
  return data
}

return { getEventWeather, getForecastAreas, getEventForecast, confirmBackupVenueSwitch }
}

const liveWeather = createFeature4WeatherAdapter()
export const getEventWeather = liveWeather.getEventWeather
export const getForecastAreas = liveWeather.getForecastAreas
export const getEventForecast = liveWeather.getEventForecast
export const confirmBackupVenueSwitch = liveWeather.confirmBackupVenueSwitch
