<script setup>
import { ref, watch, onMounted, onBeforeUnmount, computed, nextTick } from 'vue'
import { supabase } from '@/lib/supabase'
import { USING_SUPABASE } from '@/utils/api'
import { observeDiscoverySession } from '@/lib/discoveryState'
import { useRouter, useRoute } from 'vue-router'
import { useEvents, useRecommendations } from '@/composables/useEvents'
import DiscoveryEventRow from '@/components/discovery/DiscoveryEventRow.vue'
import DiscoveryStreetMap from '@/components/discovery/DiscoveryStreetMap.vue'
import EventFilters from '@/components/EventFilters.vue'
import { useDiscoveryMotion } from '@/composables/useDiscoveryMotion'
import { CATEGORIES } from '@/lib/constants'
import { normalizeDiscoveryFilters, discoveryEventQuery, discoveryUrlQuery, discoveryFiltersFromQuery } from '@/lib/discoveryFilters'

const defaults = () => normalizeDiscoveryFilters()
const route = useRoute()
function restoreBrowsing() {
  try {
    const saved = JSON.parse(sessionStorage.getItem('bookedz-discover-browsing'))
    const clean = normalizeDiscoveryFilters(saved?.filters)
    // One-time migration of the previous availability flag, never kept as state.
    if (saved?.filters?.availableOnly) clean.extras = ['spots_left']
    return { filters: clean, search: saved?.search || saved?.filters?.search || '',
      sort: (saved?.sort || saved?.filters?.sort) === 'popular' ? 'popular' : 'soonest',
      page: Number.isInteger(saved?.page) && saved.page > 0 ? saved.page : 1,
      mode: saved?.mode === 'map' ? 'map' : 'list' }
  } catch { return { filters: defaults(), search: '', sort: 'soonest', page: 1, mode: 'list' } }
}
const browsing = restoreBrowsing()
const filters = ref(browsing.filters)
const search = ref(browsing.search)
const sort = ref(browsing.sort)
const page = ref(browsing.page)
const viewMode = ref(browsing.mode)
const searchControl = ref(null)
watch([filters, search, sort, page, viewMode], () => {
  try { sessionStorage.setItem('bookedz-discover-browsing', JSON.stringify({ filters: filters.value, search: search.value, sort: sort.value, page: page.value, mode: viewMode.value })) }
  catch { /* Browsing still works if storage is unavailable. */ }
}, { deep: true, flush: 'sync' })
const pageRoot = ref(null)
useDiscoveryMotion(pageRoot)
function chooseCategory(category = '') {
  searchControl.value?.flushSearch()
  filters.value = { ...filters.value, categories: category ? [category] : [] }
}
const smallScreen = ref(false)
let smallMedia
const updateSmallScreen = () => { smallScreen.value = smallMedia?.matches ?? false }
onMounted(() => {
  smallMedia = window.matchMedia('(max-width: 767px)')
  updateSmallScreen()
  smallMedia.addEventListener('change', updateSmallScreen)
})
onBeforeUnmount(() => smallMedia?.removeEventListener('change', updateSmallScreen))
// Fade whichever end of the category row has more chips to scroll to.
const categoryRow = ref(null)
const rowFade = ref({ start: false, end: false })
function updateRowFade() {
  const el = categoryRow.value
  if (!el) return
  rowFade.value = { start: el.scrollLeft > 4, end: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 }
}
let rowObserver
onMounted(() => {
  rowObserver = new ResizeObserver(updateRowFade)
  if (categoryRow.value) rowObserver.observe(categoryRow.value)
  updateRowFade()
})
onBeforeUnmount(() => rowObserver?.disconnect())
const streetMap = ref(null)
const selectedEventId = ref(null)
// Below md the list and map share one space, so showing an event on the map switches to it.
function selectMapEvent(event) {
  selectedEventId.value = event.id
  if (smallScreen.value) showMap()
}
async function showMap() {
  searchControl.value?.flushSearch()
  viewMode.value = 'map'
  await nextTick()
  streetMap.value?.focus({ preventScroll: true })
}
const showListPane = computed(() => !smallScreen.value || viewMode.value === 'list')
const showMapPane = computed(() => !smallScreen.value || viewMode.value === 'map')
const resultList = ref(null)
const router = useRouter()
const commonCategories = CATEGORIES
const activeCategory = computed(() => filters.value.categories.length === 1 ? filters.value.categories[0] : '')
const categoryTitle = computed(() => activeCategory.value
  ? `${activeCategory.value.charAt(0).toUpperCase() + activeCategory.value.slice(1)} events` : 'Discover events')
const clock = ref(Date.now())
const eventQuery = computed(() => discoveryEventQuery(filters.value, { search: search.value, sort: sort.value, page: page.value, now: clock.value }))
let clockTimer
onMounted(() => { clockTimer = setInterval(() => { clock.value = Date.now() }, 60000) })
onBeforeUnmount(() => clearInterval(clockTimer))
// Gregory owns the registration flows. Navigate to his page until a parent
// integration supplies them; no RSVP or waitlist mutation happens here.
function openEventAction(event, action) {
  router.push({ path: `/events/${event.id}/rsvp`, hash: `#${action}` })
}
const { events, total, loading, error, fetchEvents, PAGE_SIZE } = useEvents()
function refreshDiscovery() {
  fetchEvents(eventQuery.value)
}
async function showList() {
  searchControl.value?.flushSearch()
  viewMode.value = 'list'
  await nextTick()
  resultList.value?.focus({ preventScroll: true })
}
const { recommended, loading: recLoading, error: recError, actionPending, actionError, undoEvent,
  fetchRecommendations, clearRecommendations, updatePreference } = useRecommendations()
async function changeListingPreference(payload) {
  if (!loggedIn.value || actionPending.value) return
  await updatePreference(payload.event, payload.action)
  if (!actionError.value) refreshDiscovery()
}
const loggedIn = ref(false)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
const filtersActive = computed(() => Boolean(search.value || filters.value.when || filters.value.extras.length || filters.value.categories.length))
// Only real recommendations earn a "Picked for you" badge; signed-out visitors have none.
const discoveryPicks = computed(() => loggedIn.value ? recommended.value : [])
watch([filters, search, sort], () => { page.value = 1 }, { deep: true })
// Display supplied recommendation metadata only; ranking/scoring stays upstream.
const recommendationById = computed(() => new Map(discoveryPicks.value.map(event => [event.id, event])))
const mappedPageEvents = computed(() => events.value.map(event => {
  const pick = recommendationById.value.get(event.id)
  return pick ? { ...event, pickedForYou: pick.source !== 'general_discovery', compatibilityScore: pick.compatibilityScore, source: pick.source, reason: pick.reason } : event
}))
watch(events, rows => { if (!rows.some(event => event.id === selectedEventId.value)) selectedEventId.value = null })
const dateGroups = computed(() => {
  const groups = new Map()
  for (const event of events.value) {
    const date = new Date(event.start_time)
    const key = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' })
    if (!groups.has(key)) groups.set(key, {
      key,
      date: key,
      label: date.toLocaleDateString('en-US', { timeZone: 'Asia/Singapore', month: 'short', day: 'numeric' }),
      weekday: date.toLocaleDateString('en-US', { timeZone: 'Asia/Singapore', weekday: 'long' }),
      year: date.getFullYear() !== new Date().getFullYear() ? date.getFullYear() : '',
      events: [],
    })
    groups.get(key).events.push(event)
  }
  // Preserve query ranking: in popular mode a date appears at its highest-ranked event.
  return [...groups.values()]
})
watch(() => route.query, query => {
  const hasFilters = ['search', 'when', 'extras', 'categories', 'category'].some(key => Object.hasOwn(query, key))
  if (hasFilters) {
    const next = discoveryFiltersFromQuery(query)
    if (JSON.stringify(filters.value) !== JSON.stringify(next)) filters.value = next
    search.value = typeof query.search === 'string' ? query.search : ''
    sort.value = query.sort === 'popular' ? 'popular' : 'soonest'
  }
  // Older links used view=map; the URL keeps view=list and phones open on the map.
  if (query.view === 'map') {
    viewMode.value = 'map'
    router.replace({ path: '/discover', query: { ...query, view: 'list' } })
  }
}, { immediate: true })
watch([filters, search, sort], () => {
  const query = discoveryUrlQuery(filters.value, search.value, 'list', sort.value)
  const target = router.resolve({ path: '/discover', query })
  if (target.fullPath !== route.fullPath) router.replace({ path: '/discover', query })
}, { deep: true })
let stopAuth
onMounted(() => {
  if (!USING_SUPABASE) { refreshDiscovery(); return }
  stopAuth = observeDiscoverySession(supabase, session => {
    loggedIn.value = Boolean(session)
    clearRecommendations()
    refreshDiscovery()
    if (session) fetchRecommendations(24)
  }, failure => { error.value = failure.message || 'Could not load your session.' })
})
onBeforeUnmount(() => { stopAuth?.(); clearRecommendations() })
// The clock ticks every minute; only refetch when the query actually changed.
watch(eventQuery, (value, previous) => {
  if (JSON.stringify(value) !== JSON.stringify(previous)) fetchEvents(value)
})
function clearFilters() { filters.value = defaults(); search.value = ''; sort.value = 'soonest'; page.value = 1 }
function goToPage(nextPage) {
  if (nextPage < 1 || nextPage > totalPages.value || loading.value) return
  page.value = nextPage
  resultList.value?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })
}
</script>

<template>
  <div ref="pageRoot" class="discover-page" tabindex="-1">
    <h1 class="visually-hidden">{{ categoryTitle }}</h1>
      <div class="discovery-search"><EventFilters ref="searchControl" v-model="filters" v-model:search="search" :total="total" :loading="loading" :error="error" show-active @show="showList" @retry="refreshDiscovery" /></div>
      <div class="discovery-toolbar">
        <nav ref="categoryRow" class="category-shortcuts" :class="{ 'fade-start': rowFade.start, 'fade-end': rowFade.end }" aria-label="Event categories" @scroll.passive="updateRowFade">
          <button type="button" class="category-shortcut" :aria-pressed="!filters.categories.length" @click="chooseCategory()">All</button>
          <button v-for="category in commonCategories" :key="category" type="button" class="category-shortcut cat-tint" :class="`cat-${category}`" :aria-pressed="filters.categories.includes(category)" @click="chooseCategory(category)">{{ category.charAt(0).toUpperCase() + category.slice(1) }}</button>
        </nav>
        <div class="results-tools">
          <span aria-live="polite">{{ total }} {{ total === 1 ? 'event' : 'events' }}</span>
          <div v-if="smallScreen" class="view-toggle" role="group" aria-label="Show events as">
            <button type="button" :aria-pressed="viewMode === 'list'" @click="showList">
              <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M7 5h10M7 10h10M7 15h10M3 5h.01M3 10h.01M3 15h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
              List
            </button>
            <button type="button" :aria-pressed="viewMode === 'map'" @click="showMap">
              <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M2.5 5 7 3l6 2 4.5-2v12L13 17l-6-2-4.5 2V5ZM7 3v12M13 5v12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg>
              Map
            </button>
          </div>
          <label class="results-sort"><span class="visually-hidden">Sort by</span><select v-model="sort" name="sort" aria-label="Sort events"><option value="soonest">Soonest first</option><option value="popular">Most popular</option></select></label>

        </div>
      </div>
      <div class="discovery-workspace" id="event-directory">
        <section v-show="showListPane" ref="resultList" class="discovery-list" aria-label="Upcoming events" :aria-busy="loading" tabindex="-1">
          <h2 class="visually-hidden">What’s coming up</h2>
          <div v-if="loading" class="loading-state" role="status"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span><p>Finding your next event…</p></div>
          <div v-else-if="error" class="empty-state" role="alert"><h2>We couldn’t load events</h2><p>{{ error }}</p><button type="button" class="btn btn-outline-danger" @click="refreshDiscovery">Try again</button></div>
          <div v-else-if="!events.length" class="empty-state" role="status"><h2>No events found</h2><p>Try another search or clear your filters.</p><button type="button" class="btn btn-outline-secondary" @click="clearFilters">Clear search and filters</button></div>
          <div v-else class="event-timeline">
            <section v-for="group in dateGroups" :key="group.key" class="date-group" :aria-label="`${group.label}, ${group.weekday} ${group.year}`">
              <div class="timeline-date"><time :datetime="group.date"><span class="date-label">{{ group.label }}<template v-if="group.year">, {{ group.year }}</template></span><span class="weekday">{{ group.weekday }}</span></time></div>
              <div class="date-events">
                <DiscoveryEventRow v-for="event in group.events" :key="event.id" :event="event" :recommendation="recommendationById.get(event.id)" :selected="selectedEventId === event.id" :bookmark-enabled="loggedIn" :preference-pending="actionPending" @select="selectMapEvent" @preference="changeListingPreference" />
              </div>
            </section>
          </div>
          <nav v-if="totalPages > 1 && !error" class="event-pagination" aria-label="Event pages">
            <button type="button" class="btn btn-outline-secondary" :disabled="page === 1 || loading" @click="goToPage(page - 1)">Previous</button><span>{{ page }} / {{ totalPages }}</span><button type="button" class="btn btn-outline-secondary" :disabled="page === totalPages || loading" @click="goToPage(page + 1)">Next</button>
          </nav>
        </section>
        <div v-show="showMapPane" ref="streetMap" class="discovery-map-column" tabindex="-1">
          <DiscoveryStreetMap :events="mappedPageEvents" :search-text="search" :focused-event-id="selectedEventId" :prominent-ids="discoveryPicks.map(event => event.id)" :loading="loading" :error="error" @select="selectedEventId = $event" @retry="refreshDiscovery" />
        </div>
      </div>
  </div>
</template>

<style scoped>
.discover-page { padding: 26px 24px 40px; max-width: 1600px; margin: 0 auto; color: var(--bookedz-ink); }
.discover-page:focus,.discovery-list:focus { outline: none; }
.discovery-search { position: relative; z-index: 12; margin-bottom: 14px; }
.discovery-search :deep(.search-toolbar) { border-radius: 10px; box-shadow: none; padding: 5px; }
.discovery-search :deep(.search-field input) { height: 44px; font-size: 14px; }
.discovery-search :deep(.filter-toggle) { border-radius: 7px; font-size: 12px; }
.discovery-toolbar { display: flex; flex-wrap: nowrap; justify-content: space-between; align-items: center; gap: 10px 20px; margin: 14px 0; }
.category-shortcuts { display: flex; flex-wrap: nowrap; align-items: center; gap: 6px; flex: 1 1 0; min-width: 0; overflow-x: auto; scrollbar-width: none; }
.category-shortcuts::-webkit-scrollbar { display: none; }
.category-shortcuts.fade-end { -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 48px), transparent); mask-image: linear-gradient(to right, #000 calc(100% - 48px), transparent); }
.category-shortcuts.fade-start { -webkit-mask-image: linear-gradient(to right, transparent, #000 48px); mask-image: linear-gradient(to right, transparent, #000 48px); }
.category-shortcuts.fade-start.fade-end { -webkit-mask-image: linear-gradient(to right, transparent, #000 48px, #000 calc(100% - 48px), transparent); mask-image: linear-gradient(to right, transparent, #000 48px, #000 calc(100% - 48px), transparent); }
.category-shortcut { flex: none; white-space: nowrap; }
.category-shortcut { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 9px 15px; border: 1px solid transparent; border-radius: 99px; color: var(--bookedz-ink); font-size: 12px; }
.category-shortcut:not(.cat-tint) { background: var(--bookedz-hover); }
.category-shortcut[aria-pressed=true] { background: var(--bookedz-ink); color: var(--bookedz-surface); }
.category-shortcut:hover { border-color: var(--bookedz-control-border); }
.all-categories-link,.browse-back { display: inline-flex; align-items: center; min-height: 44px; padding: 6px; color: var(--bookedz-primary-dark); font-size: 12px; }
.results-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; color: var(--bookedz-muted); font-size: 12px; }
.results-sort select { min-height: 44px; border: 0; background: transparent; color: var(--bookedz-ink); font: inherit; }

.discovery-workspace { display: grid; grid-template-columns: minmax(0,.94fr) minmax(0,1.06fr); align-items: start; gap: 16px; min-width: 0; }
.discovery-list,.discovery-map-column { min-width: 0; }
.discovery-map-column { position: sticky; top: 18px; }
.discovery-map-column:focus { outline: none; }
.view-toggle { display: inline-flex; padding: 3px; border-radius: 12px; background: var(--bookedz-hover); }
.view-toggle button { display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 6px 14px; border: 0; border-radius: 9px; background: transparent; color: var(--bookedz-muted); font: inherit; font-size: 13px; font-weight: 700; }
.view-toggle button[aria-pressed=true] { background: var(--bookedz-surface); color: var(--bookedz-ink); box-shadow: 0 1px 3px rgba(0,0,0,.12); }
.view-toggle button:focus-visible { outline: 3px solid var(--bookedz-primary-dark); outline-offset: 2px; }

.event-timeline { --date-column: 66px; position: relative; }
.event-timeline::before { content: ''; position: absolute; left: var(--date-column); top: 8px; bottom: 12px; width: 1px; background: var(--bookedz-border); }
.date-group { display: grid; grid-template-columns: var(--date-column) minmax(0,1fr); padding-bottom: 12px; }
.timeline-date { position: relative; padding: 7px 12px 0 0; }
.timeline-date::after { content: ''; position: absolute; top: 12px; right: -4px; width: 8px; height: 8px; border-radius: 50%; background: var(--bookedz-control-border); box-shadow: 0 0 0 3px var(--bookedz-canvas); }
.date-label,.weekday { display: block; }
.date-label { font-size: 13px; font-weight: 700; }
.weekday { margin-top: 2px; font-size: 10px; color: var(--bookedz-muted); }
.date-events { display: grid; gap: 8px; padding-left: 12px; min-width: 0; }
.event-pagination { display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 12px; margin-top: 18px; font-size: 12px; }
.empty-state,.loading-state { padding: 28px 16px; border: 1px solid var(--bookedz-border); border-radius: 12px; background: var(--bookedz-surface); color: var(--bookedz-muted); font-size: 14px; }
.empty-state h2 { color: var(--bookedz-ink); font-size: 18px; }

@media(max-width:767px) { .discovery-toolbar { flex-wrap: wrap; }.category-shortcuts { flex-basis: 100%; }.results-tools { width: 100%; justify-content: space-between; } }
@media(max-width:991px) {
  .discover-page { padding: 18px 12px 32px; }
  .discovery-workspace { grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 12px; }
}
/* Below md the list and map take turns, chosen with the List / Map toggle. */
@media(max-width:767px) {
  .discovery-workspace { display: block; }
  .discovery-map-column { position: relative; top: auto; }
}
@media(max-width:575px) { .event-timeline { --date-column: 52px; }.date-events { padding-left: 10px; }.date-label { font-size: 12px; }.weekday { font-size: 10px; }.results-tools { width: 100%; justify-content: space-between; }.category-shortcut { padding-inline: 12px; } }
</style>
