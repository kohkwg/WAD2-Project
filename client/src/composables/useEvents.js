import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { api } from '@/lib/api'
import { USING_SUPABASE, getEvents } from '@/utils/api'
import { demoDiscoveryEvents } from '@/lib/discoveryState'

const PAGE_SIZE = 12

async function confirmedAttendees(eventIds) {
  // Read through the user's existing RLS permissions. Never use a service key
  // here: other participants' registrations may intentionally be private.
  const attendees = new Map()
  const batchSize = 200
  for (let offset = 0; ; offset += batchSize) {
    const { data, error } = await supabase.from('registrations')
      .select('id, event_id, user_id, profile:profiles!registrations_user_id_fkey(id, display_name, avatar_key)')
      .eq('status', 'confirmed').in('event_id', eventIds)
      .order('id').range(offset, offset + batchSize - 1)
    if (error) return attendees // Optional photos must not prevent browsing.
    for (const row of data || []) {
      const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile
      if (!profile) continue
      if (!attendees.has(row.event_id)) attendees.set(row.event_id, [])
      attendees.get(row.event_id).push({ ...profile, id: profile.id || row.user_id })
    }
    if (!data || data.length < batchSize) return attendees
  }
}

const activeVenueId = event => event.using_backup ? event.backup_venue_id : event.venue_id

async function withEventDetails(rows, includeAttendees = true) {
  const venueIds = [...new Set(rows.map(activeVenueId).filter(Boolean))]
  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData.session?.user.id
  const [venues, attendees, registrations, preferences] = await Promise.all([
    venueIds.length
      ? supabase.from('venues').select('id, name, address, latitude, longitude').in('id', venueIds)
      : Promise.resolve({ data: [] }),
    includeAttendees && userId && rows.length
      ? confirmedAttendees(rows.map(e => e.id))
      : Promise.resolve(new Map()),
    userId && rows.length
      ? supabase.from('registrations').select('event_id, status')
        .eq('user_id', userId).in('event_id', rows.map(e => e.id))
      : Promise.resolve({ data: [] }),
    userId && rows.length
      ? supabase.from('user_event_preferences').select('event_id, save_active')
        .eq('user_id', userId).in('event_id', rows.map(e => e.id))
      : Promise.resolve({ data: [] }),
  ])
  if (preferences.error) throw preferences.error
  const savedIds = new Set((preferences.data || []).filter(row => row.save_active).map(row => row.event_id))
  if (registrations.error) throw registrations.error
  // Venues are optional; missing/inaccessible names simply omit the venue line.
  const venueDetails = new Map((venues.data || []).map(v => [v.id, v]))
  const statuses = new Map((registrations.data || []).map(r => [r.event_id, r.status]))
  return rows.map(e => ({
    ...e, saved: savedIds.has(e.id), venue_name: venueDetails.get(activeVenueId(e))?.name || e.venue_name || '',
    venue_address: venueDetails.get(activeVenueId(e))?.address || e.venue_address || '',
    lat: venueDetails.get(activeVenueId(e))?.latitude ?? (e.using_backup ? null : e.lat),
    lng: venueDetails.get(activeVenueId(e))?.longitude ?? (e.using_backup ? null : e.lng),
    registration_status: statuses.get(e.id) || null,
    attendees: attendees.get(e.id) || e.attendees || [],
  }))
}

export function useEvents() {
  const events = ref([])
  const total = ref(0)
  const loading = ref(false)
  const error = ref('')
  let requestId = 0

  // filters: { search, category (legacy), categories, tag, dateFrom, dateTo, availableOnly, sort, page }
  async function fetchEvents(filters = {}) {
    const currentRequest = ++requestId
    loading.value = true
    error.value = ''
    try {
      const page = filters.page || 1
      const mapMode = filters.forMap === true
      const from = mapMode ? 0 : (page - 1) * PAGE_SIZE
      const to = from + (mapMode ? 200 : PAGE_SIZE) - 1

      if (!USING_SUPABASE) {
        const rows = demoDiscoveryEvents(await getEvents(), filters)
        if (currentRequest !== requestId) return
        events.value = mapMode ? rows : rows.slice(from, to + 1)
        total.value = rows.length
        return
      }

      // The view has venue_id, but no venue_name. Resolve names separately so
      // this also works when PostgREST cannot infer a relationship on the view.
      const search = filters.search?.replace(/[,()%"\\]/g, ' ').trim()
      let matchingVenueIds = []
      if (search) {
        const { data } = await supabase
          .from('venues').select('id').ilike('name', `%${search}%`)
        matchingVenueIds = (data || []).map(v => v.id)
      }

      let q = supabase
        .from('events_with_counts')
        .select(filters.countOnly ? 'id' : '*', { count: 'exact', ...(filters.countOnly ? { head: true } : {}) })
        .gt('start_time', new Date().toISOString())

      if (search) {
        const terms = [`title.ilike.%${search}%`, `description.ilike.%${search}%`]
        if (matchingVenueIds.length) terms.push(`and(using_backup.eq.false,venue_id.in.(${matchingVenueIds.join(',')})),and(using_backup.eq.true,backup_venue_id.in.(${matchingVenueIds.join(',')}))`)
        q = q.or(terms.join(','))
      }
      // Category badges match event tags (event creation stores tags, not a category)
      if (filters.categories?.length) q = q.overlaps('tags', [...new Set(filters.categories)])
      else if (filters.category) q = q.contains('tags', [filters.category])
      if (filters.tag) q = q.contains('tags', [filters.tag])
      if (filters.dateFrom) q = q.gte('start_time', new Date(`${filters.dateFrom}T00:00:00+08:00`).toISOString())
      if (filters.dateTo) {
        const end = new Date(`${filters.dateTo}T23:59:59.999+08:00`)
        q = q.lte('start_time', end.toISOString())
      }
      if (filters.availableOnly) q = q.or('spots_left.gt.0,capacity.is.null')

      if (filters.sort === 'popular') q = q.order('confirmed_count', { ascending: false })
      q = q.order('start_time', { ascending: true }).order('id', { ascending: true })

      if (filters.countOnly) {
        const result = await q
        if (result.error) throw result.error
        if (!Number.isInteger(result.count) || result.count < 0) throw new Error('Event count is unavailable.')
        if (currentRequest === requestId) { total.value = result.count; events.value = [] }
        return
      }

      const { data, count, error: err } = await q.range(from, to)
      if (err) throw err

      const rows = [...(data || [])]
      // PostgREST caps pages. Fetch the full filtered map layer in bounded
      // batches, without changing the directory's existing 12-row contract.
      while (mapMode && rows.length < (count || 0) && rows.length) {
        if (currentRequest !== requestId) return
        const next = await q.range(rows.length, rows.length + 199)
        if (next.error) throw next.error
        if (!next.data?.length) break
        rows.push(...next.data)
      }
      const detailedRows = await withEventDetails(rows, !mapMode)
      if (currentRequest !== requestId) return
      events.value = detailedRows
      total.value = count || 0
    } catch (e) {
      if (currentRequest !== requestId) return
      events.value = []
      total.value = 0
      error.value = e.message || 'Could not load events.'
    } finally {
      if (currentRequest === requestId) loading.value = false
    }
  }

  return { events, total, loading, error, fetchEvents, PAGE_SIZE }
}

export function useRecommendations() {
  const recommended = ref([])
  const loading = ref(false)
  const error = ref('')
  const actionPending = ref(false)
  const actionError = ref('')
  const undoEvent = ref(null)
  let requestId = 0
  let identityVersion = 0
  let lastLimit = 6

  async function fetchRecommendations(limit = 6) {
    lastLimit = limit
    const currentRequest = ++requestId
    loading.value = true
    error.value = ''
    try {
      const { data } = await api.get('/api/recommendations', { params: { limit } })
      const rows = await withEventDetails(data.events || [])
      if (currentRequest === requestId) recommended.value = rows
    } catch (e) {
      if (currentRequest !== requestId) return
      recommended.value = []
      error.value = 'Could not load recommendations.'
    } finally {
      if (currentRequest === requestId) loading.value = false
    }
  }

  function clearRecommendations() {
    requestId++
    identityVersion++
    recommended.value = []
    loading.value = false
    error.value = ''
    actionPending.value = false
    actionError.value = ''
    undoEvent.value = null
  }
  async function updatePreference(event, action) {
    if (actionPending.value) return
    const version = identityVersion
    actionPending.value = true
    actionError.value = ''
    try {
      await api.post(`/api/recommendations/${event.id}/preferences`, { action })
      if (version !== identityVersion) return
      if (action === 'dismiss') undoEvent.value = event
      if (action === 'undo_dismiss') undoEvent.value = null
      await fetchRecommendations(lastLimit)
      if (version !== identityVersion) return
      if (error.value) actionError.value = 'Your preference was saved. Refresh recommendations to see the change.'
    } catch {
      if (version === identityVersion) actionError.value = 'Could not save your preference. Please try again.'
    } finally {
      if (version === identityVersion) actionPending.value = false
    }
  }
  return { recommended, loading, error, actionPending, actionError, undoEvent,
    fetchRecommendations, clearRecommendations, updatePreference }
}
