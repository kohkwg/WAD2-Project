<script setup>
import { ref, watch, onMounted, onBeforeUnmount, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'vue-router'
import { useEvents, useRecommendations } from '@/composables/useEvents'
import EventCard from '@/components/EventCard.vue'
import EventFilters from '@/components/EventFilters.vue'
import PickedForYou from '@/components/PickedForYou.vue'

const defaults = () => ({ search: '', category: '', categories: [], tag: '', dateFrom: '', dateTo: '', availableOnly: false, sort: 'soonest', page: 1 })
const filters = ref(defaults())
const router = useRouter()
// Gregory owns the registration flows. Navigate to his page until a parent
// integration supplies them; no RSVP or waitlist mutation happens here.
function openEventAction(event, action) {
  router.push({ path: `/events/${event.id}`, hash: `#${action}` })
}
const { events, total, loading, error, fetchEvents, PAGE_SIZE } = useEvents()
const { recommended, loading: recLoading, error: recError, fetchRecommendations } = useRecommendations()
const loggedIn = ref(false)
const navbarHeight = ref(56)
let navbarResizeObserver
onMounted(() => {
  // Measure the existing navbar without changing the shared app layout.
  const navbar = document.querySelector('#app > .navbar')
  if (!navbar) return
  const measureNavbar = () => { navbarHeight.value = navbar.getBoundingClientRect().height }
  measureNavbar()
  navbarResizeObserver = new ResizeObserver(measureNavbar)
  navbarResizeObserver.observe(navbar)
})
onBeforeUnmount(() => navbarResizeObserver?.disconnect())
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
const filtersActive = computed(() => {
  const f = filters.value
  return !!(f.search || f.category || f.categories?.length || f.tag || f.dateFrom || f.dateTo || f.availableOnly || f.sort !== 'soonest')
})
const discoveryPicks = computed(() => loggedIn.value ? recommended.value
  : [...events.value].sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
    .slice(0, 6).map(event => ({ ...event, reason: 'Upcoming event' })))
const dateGroups = computed(() => {
  const groups = new Map()
  for (const event of events.value) {
    const date = new Date(event.start_time)
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    if (!groups.has(key)) groups.set(key, {
      key,
      date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      weekday: date.toLocaleDateString('en-US', { weekday: 'long' }),
      year: date.getFullYear() !== new Date().getFullYear() ? date.getFullYear() : '',
      events: [],
    })
    groups.get(key).events.push(event)
  }
  // Preserve query ranking: in popular mode a date appears at its highest-ranked event.
  return [...groups.values()]
})
let authSubscription
onMounted(async () => {
  const { data } = await supabase.auth.getSession()
  loggedIn.value = !!data.session
  if (loggedIn.value) fetchRecommendations(6)
  fetchEvents(filters.value)
  const { data: authData } = supabase.auth.onAuthStateChange((_event, session) => {
    loggedIn.value = !!session
    // Run queries after Supabase finishes its auth callback.
    setTimeout(() => {
      fetchEvents(filters.value)
      if (session) fetchRecommendations(6)
    }, 0)
  })
  authSubscription = authData.subscription
})
onBeforeUnmount(() => authSubscription?.unsubscribe())
watch(filters, f => fetchEvents(f), { deep: true })
function clearFilters() { filters.value = defaults() }
function goToPage(page) {
  if (page < 1 || page > totalPages.value || loading.value) return
  filters.value = { ...filters.value, page }
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
</script>

<template>
  <div class="discover-page" :style="{ '--discover-navbar-height': `${navbarHeight}px` }">
    <main class="container discover-content">
      <header class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-4">
        <h1 class="fw-bold mb-0">Discover events</h1>
        <RouterLink v-if="loggedIn" to="/profile" class="btn btn-outline-secondary btn-sm">Edit interests</RouterLink>
      </header>

      <EventFilters v-model="filters" class="mb-4" />
      <PickedForYou
        v-if="!filtersActive"
        :events="discoveryPicks"
        :loading="loggedIn ? recLoading : loading"
        :error="loggedIn ? recError : error"
        :personalized="loggedIn"
        @retry="loggedIn ? fetchRecommendations(6) : fetchEvents(filters)"
        @rsvp="openEventAction($event, 'rsvp')"
        @waitlist="openEventAction($event, 'waitlist')"
      />
      <section aria-label="Upcoming events" :aria-busy="loading">
        <div v-if="loading" class="text-center loading-state" role="status">
          <div class="spinner-border text-primary" aria-hidden="true"></div>
          <p class="text-secondary mt-3">Finding your next event…</p>
        </div>
        <div v-else-if="error" class="alert alert-danger" role="alert">
          <p class="mb-2">We couldn’t load events. Please try again.</p>
          <p class="small mb-3">{{ error }}</p>
          <button type="button" class="btn btn-outline-danger btn-sm" @click="fetchEvents(filters)">Try again</button>
        </div>
        <div v-else-if="!events.length" class="empty-state text-center" role="status">
          <div class="empty-icon" aria-hidden="true">✧</div>
          <h2 class="h5 fw-bold">No events found</h2>
          <p class="text-secondary">Try another search or clear your filters to see what’s coming up.</p>
          <button type="button" class="btn btn-outline-secondary btn-sm" @click="clearFilters">Clear search and filters</button>
        </div>
        <div v-else class="event-timeline">
          <section v-for="group in dateGroups" :key="group.key" class="date-group" :aria-label="`${group.label}, ${group.weekday} ${group.year}`">
            <div class="timeline-date">
              <time :datetime="group.date"><span class="date-label">{{ group.label }}<template v-if="group.year">, {{ group.year }}</template></span><span class="weekday">{{ group.weekday }}</span></time>
            </div>
            <div class="date-events">
              <EventCard v-for="event in group.events" :key="event.id" :event="event" />
            </div>
          </section>
        </div>

        <nav v-if="totalPages > 1 && !error" class="mt-4" aria-label="Event pages">
          <ul class="pagination justify-content-center">
            <li class="page-item" :class="{ disabled: filters.page === 1 || loading }"><button class="page-link" :disabled="filters.page === 1 || loading" @click="goToPage(filters.page - 1)">Previous</button></li>
            <li class="page-item disabled"><span class="page-link">{{ filters.page }} / {{ totalPages }}</span></li>
            <li class="page-item" :class="{ disabled: filters.page === totalPages || loading }"><button class="page-link" :disabled="filters.page === totalPages || loading" @click="goToPage(filters.page + 1)">Next</button></li>
          </ul>
        </nav>
      </section>

    </main>
  </div>
</template>

<style scoped>
.discover-page { min-height: 100vh; background: linear-gradient(180deg, #eef3f9 0, #f7f8fa 240px); color: #252b35; }
.discover-content { max-width: 1060px; padding-top: 48px; padding-bottom: 64px; }
h1 { font-size: 2rem; letter-spacing: -.04em; }
.discover-page, .discover-content, .event-timeline, .date-group { overflow: visible; }
.event-timeline { --date-column: 145px; --timeline-axis: var(--date-column); position: relative; margin-top: 40px; }
/* One shared rail stays continuous through the spacing between date groups. */
.event-timeline::before { content: ''; position: absolute; left: calc(var(--timeline-axis) - .5px); top: 0; bottom: 0; width: 1px; background: repeating-linear-gradient(to bottom, #cbd2dc 0 5px, transparent 5px 10px); pointer-events: none; }
.date-group { position: relative; display: grid; grid-template-columns: var(--date-column) minmax(0, 1fr); padding-bottom: 32px; }
.date-group:last-child { padding-bottom: 0; }
/* Keep this direct grid child at its natural height so it can stick within its day. */
.timeline-date { position: sticky; top: calc(var(--discover-navbar-height, 56px) + 16px); align-self: start; padding-right: 28px; }
.timeline-date::after { content: ''; position: absolute; width: 10px; height: 10px; border-radius: 50%; background: #bac2cd; left: 100%; top: 12px; transform: translate(-50%, -50%); box-shadow: 0 0 0 5px #f7f8fa; }
.date-label, .weekday { display: block; }
.date-label { font-size: 1rem; font-weight: 650; }
.weekday { color: #848b96; font-size: .9rem; margin-top: 5px; }
.date-events { display: grid; gap: 16px; padding-left: 32px; }
.loading-state, .empty-state { padding: 70px 24px; }
.empty-state { background: white; border: 1px solid #e4e6eb; border-radius: 20px; }
.empty-icon { font-size: 2.6rem; color: #8194b6; margin-bottom: 12px; }
@media (max-width: 767px) {
  .discover-content { padding-top: 28px; }
  h1 { font-size: 1.65rem; }
  .event-timeline { --timeline-axis: 5px; margin-top: 28px; }
  .date-group { display: block; padding-bottom: 28px; }
  .timeline-date { position: relative; top: auto; padding: 0 0 12px 24px; }
  .timeline-date::after { left: var(--timeline-axis); width: 8px; height: 8px; }
  .date-events { padding: 0 0 0 24px; }
}
</style>
