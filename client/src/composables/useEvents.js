import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { api } from '@/lib/api'

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

async function withEventDetails(rows) {
  const venueIds = [...new Set(rows.map(e => e.venue_id).filter(Boolean))]
  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData.session?.user.id
  const [venues, attendees, registrations] = await Promise.all([
    venueIds.length
      ? supabase.from('venues').select('id, name, address').in('id', venueIds)
      : Promise.resolve({ data: [] }),
    userId && rows.length
      ? confirmedAttendees(rows.map(e => e.id))
      : Promise.resolve(new Map()),
    userId && rows.length
      ? supabase.from('registrations').select('event_id, status')
        .eq('user_id', userId).in('event_id', rows.map(e => e.id))
      : Promise.resolve({ data: [] }),
  ])
  if (registrations.error) throw registrations.error
  // Venues are optional; missing/inaccessible names simply omit the venue line.
  const venueDetails = new Map((venues.data || []).map(v => [v.id, v]))
  const statuses = new Map((registrations.data || []).map(r => [r.event_id, r.status]))
  return rows.map(e => ({
    ...e, venue_name: venueDetails.get(e.venue_id)?.name || e.venue_name || '',
    venue_address: venueDetails.get(e.venue_id)?.address || e.venue_address || '',
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
      const from = (page - 1) * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

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
        .select('*', { count: 'exact' })
        .gt('start_time', new Date().toISOString())

      if (search) {
        const terms = [`title.ilike.%${search}%`, `description.ilike.%${search}%`]
        if (matchingVenueIds.length) terms.push(`venue_id.in.(${matchingVenueIds.join(',')})`)
        q = q.or(terms.join(','))
      }
      // Category badges match event tags (event creation stores tags, not a category)
      if (filters.categories?.length) q = q.overlaps('tags', [...new Set(filters.categories)])
      else if (filters.category) q = q.contains('tags', [filters.category])
      if (filters.tag) q = q.contains('tags', [filters.tag])
      if (filters.dateFrom) q = q.gte('start_time', new Date(`${filters.dateFrom}T00:00:00`).toISOString())
      if (filters.dateTo) {
        const end = new Date(`${filters.dateTo}T23:59:59.999`)
        q = q.lte('start_time', end.toISOString())
      }
      if (filters.availableOnly) q = q.or('spots_left.gt.0,capacity.is.null')

      if (filters.sort === 'popular') q = q.order('confirmed_count', { ascending: false })
      q = q.order('start_time', { ascending: true }).order('id', { ascending: true })

      const { data, count, error: err } = await q.range(from, to)
      if (err) throw err

      const rows = data || []
      const detailedRows = await withEventDetails(rows)
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
  let requestId = 0

  async function fetchRecommendations(limit = 6) {
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

  return { recommended, loading, error, fetchRecommendations }
}
