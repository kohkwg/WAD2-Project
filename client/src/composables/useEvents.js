import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { api } from '@/lib/api'

const PAGE_SIZE = 12

export function useEvents() {
  const events = ref([])
  const total = ref(0)
  const loading = ref(false)
  const error = ref('')

  // filters: { search, category, tag, dateFrom, dateTo, availableOnly, sort, page }
  async function fetchEvents(filters = {}) {
    loading.value = true
    error.value = ''
    try {
      const page = filters.page || 1
      const from = (page - 1) * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      let q = supabase
        .from('events_with_counts')
        .select('*', { count: 'exact' })
        .gt('start_time', new Date().toISOString())

      if (filters.search?.trim()) {
        // strip characters that break PostgREST's or() syntax
        const s = filters.search.trim().replace(/[,()%]/g, ' ')
        q = q.or(`title.ilike.%${s}%,description.ilike.%${s}%,venue_name.ilike.%${s}%`)
      }
      if (filters.category) q = q.eq('category', filters.category)
      if (filters.tag) q = q.contains('tags', [filters.tag])
      if (filters.dateFrom) q = q.gte('start_time', new Date(filters.dateFrom).toISOString())
      if (filters.dateTo) {
        const end = new Date(filters.dateTo)
        end.setHours(23, 59, 59, 999)
        q = q.lte('start_time', end.toISOString())
      }
      if (filters.availableOnly) q = q.gt('spots_left', 0)

      if (filters.sort === 'popular') q = q.order('confirmed_count', { ascending: false })
      else q = q.order('start_time', { ascending: true })

      const { data, count, error: err } = await q.range(from, to)
      if (err) throw err

      events.value = data
      total.value = count || 0
    } catch (e) {
      error.value = e.message || 'Could not load events.'
    } finally {
      loading.value = false
    }
  }

  return { events, total, loading, error, fetchEvents, PAGE_SIZE }
}

export function useRecommendations() {
  const recommended = ref([])
  const loading = ref(false)
  const error = ref('')

  async function fetchRecommendations(limit = 6) {
    loading.value = true
    error.value = ''
    try {
      const { data } = await api.get('/api/recommendations', { params: { limit } })
      recommended.value = data.events
    } catch (e) {
      error.value = 'Could not load recommendations.'
    } finally {
      loading.value = false
    }
  }

  return { recommended, loading, error, fetchRecommendations }
}
