<script setup>
import '../assets/design-baseline.css'
import { ref, watch, onMounted, onBeforeUnmount, computed, nextTick } from 'vue'
import { supabase } from '@/lib/supabase'
import { USING_SUPABASE } from '@/utils/api'
import { observeDiscoverySession } from '@/lib/discoveryState'
import { useRouter, useRoute } from 'vue-router'
import { useEvents, useRecommendations } from '@/composables/useEvents'
import DiscoveryEventRow from '@/components/discovery/DiscoveryEventRow.vue'
import DiscoveryDayRow from '@/components/discovery/DiscoveryDayRow.vue'
import DiscoveryWeekCalendar from '@/components/discovery/DiscoveryWeekCalendar.vue'
import DiscoveryStreetMap from '@/components/discovery/DiscoveryStreetMap.vue'
import EventFilters from '@/components/EventFilters.vue'
import SkeletonList from '@/components/ui/SkeletonList.vue'
import BumpValue from '@/components/ui/BumpValue.vue'
import { toast } from '@/composables/useToast'
import { useDiscoveryMotion } from '@/composables/useDiscoveryMotion'
import { CATEGORIES } from '@/lib/constants'
import { EVENT_GROUPS, sameCategories } from '@/lib/eventGroups'
import { normalizeDiscoveryFilters, discoveryDateRange, discoveryEventQuery, discoveryUrlQuery, discoveryFiltersFromQuery } from '@/lib/discoveryFilters'

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
// Saved, All and the category groups are one row of choices: picking one clears the others
function chooseCategory(category = '') {
  searchControl.value?.flushSearch()
  filters.value = { ...filters.value, saved: false, categories: category ? [category] : [] }
}
function chooseGroup(group) {
  searchControl.value?.flushSearch()
  filters.value = { ...filters.value, saved: false, categories: [...group.categories] }
}
function chooseSaved() {
  searchControl.value?.flushSearch()
  filters.value = { ...filters.value, saved: !filters.value.saved, categories: [] }
}
// Set before the first render so phones never flash both panes
const smallScreen = ref(window.matchMedia('(max-width: 991px)').matches)
let smallMedia
const updateSmallScreen = () => { smallScreen.value = smallMedia?.matches ?? false }
onMounted(() => {
  smallMedia = window.matchMedia('(max-width: 991px)')
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
// Phones and tablets (up to 991px) show the list or the map (List | Map toggle); from 992px both sit side by side.
// The pane is the remembered view mode, so it survives returning to Discover.
// Coming back to the list returns to the same scroll spot instead of jumping around.
const mobilePane = viewMode
const toolbar = ref(null)
let listScrollY = 0
async function showPane(pane) {
  if (pane === mobilePane.value) return
  searchControl.value?.flushSearch()
  if (pane === 'map') listScrollY = window.scrollY
  mobilePane.value = pane
  await nextTick()
  if (pane === 'list') window.scrollTo({ top: listScrollY, behavior: 'instant' })
  else {
    // Keep the toggle and the map in view (the sticky top bar covers the first 72px)
    const top = toolbar.value.getBoundingClientRect().top + window.scrollY - 80
    if (window.scrollY > top) window.scrollTo({ top: Math.max(0, top), behavior: 'instant' })
  }
}
const selectedEventId = ref(null)
// Row clicks pass { scroll: false } and just select; on phones the thumbnail's "Show on map"
// opens the Map pane instead of scrolling down the page
function selectMapEvent(event, { scroll = true } = {}) {
  selectedEventId.value = event.id
  if (scroll && smallScreen.value) showPane('map')
}
const resultList = ref(null)
const router = useRouter()
const commonCategories = CATEGORIES
// When nothing matches, offer a few other categories to jump to instead of a dead end.
const emptySuggestions = computed(() => EVENT_GROUPS.filter(group => !sameCategories(filters.value.categories, group.categories)).slice(0, 4))
const activeCategory = computed(() => filters.value.categories.length === 1 ? filters.value.categories[0] : '')
const categoryTitle = computed(() => filters.value.saved && loggedIn.value ? 'Your saved events' : activeCategory.value
  ? `${activeCategory.value.charAt(0).toUpperCase() + activeCategory.value.slice(1)} events` : 'Discover events')
const clock = ref(Date.now())
const STEP = 10
const visibleCount = ref(STEP)
// Saved needs a session; a remembered Saved choice is ignored while signed out
// Laptops and up browse one Monday-to-Sunday week at a time; the calendar's arrows move it, and the
// list and map follow. Searching or filtering looks across every upcoming date instead, so nothing
// outside the displayed week is hidden from discovery (the calendar still shows that week's slice).
const weekOffset = ref(0)
function weekWindow(range) {
  if (smallScreen.value || filtersActive.value) return range
  const week = discoveryDateRange('week', clock.value + weekOffset.value * 7 * 86400000)
  const dateFrom = range.dateFrom && range.dateFrom > week.dateFrom ? range.dateFrom : week.dateFrom
  const dateTo = range.dateTo && range.dateTo < week.dateTo ? range.dateTo : week.dateTo
  return { ...range, dateFrom, dateTo }
}
const baseQuery = () => weekWindow(discoveryEventQuery({ ...filters.value, saved: filters.value.saved && loggedIn.value }, { search: search.value, sort: sort.value, page: 1, now: clock.value }))
const eventQuery = computed(() => ({ ...baseQuery(), limit: visibleCount.value }))
// The map always gets every matching event, whatever the list has revealed so far.
const mapQuery = computed(() => ({ ...baseQuery(), forMap: true }))
let clockTimer
onMounted(() => { clockTimer = setInterval(() => { clock.value = Date.now() }, 60000) })
onBeforeUnmount(() => clearInterval(clockTimer))
// Gregory owns the registration flows. Navigate to his page until a parent
// integration supplies them; no RSVP or waitlist mutation happens here.
function openEventAction(event, action) {
  router.push({ path: `/events/${event.id}/rsvp`, hash: `#${action}` })
}
const { events, total, loading, error, fetchEvents } = useEvents()
const { events: mapEvents, loading: mapLoading, fetchEvents: fetchMapEvents } = useEvents()
// The Saved chip's count: every upcoming saved event Discover can show, whatever else is filtered
const { total: savedCount, fetchEvents: fetchSavedCount } = useEvents()
function refreshSavedCount() {
  if (loggedIn.value) fetchSavedCount({ savedOnly: true, countOnly: true })
  else savedCount.value = 0
}
function refreshDiscovery() {
  fetchEvents(eventQuery.value)
  fetchMapEvents(mapQuery.value)
  refreshSavedCount()
}
// Shown once there is something saved, and kept while selected so it can be turned off again
const showSavedChip = computed(() => loggedIn.value && (savedCount.value > 0 || filters.value.saved))
const savedSelected = computed(() => filters.value.saved && loggedIn.value)
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
  if (!actionError.value) {
    if (payload.action === 'save') {
      // Says where saves go, and goes there in one tap
      toast('Saved to your list', { duration: 6000, action: { label: 'View saved', onClick: () => router.push({ path: '/my-rsvps', query: { tab: 'saved' } }) } })
    } else toast(`Removed ${payload.event.title} from saved`)
    refreshDiscovery()
  }
}
const loggedIn = ref(false)
const remaining = computed(() => Math.max(0, total.value - events.value.length))
const filtersActive = computed(() => Boolean(search.value || filters.value.when || filters.value.extras.length || filters.value.categories.length || savedSelected.value))
// Only real recommendations earn a "Picked for you" badge; signed-out visitors have none.
const discoveryPicks = computed(() => loggedIn.value ? recommended.value : [])
watch([filters, search, sort, weekOffset], () => { visibleCount.value = STEP }, { deep: true })
// Display supplied recommendation metadata only; ranking/scoring stays upstream.
const recommendationById = computed(() => new Map(discoveryPicks.value.map(event => [event.id, event])))
const mappedPageEvents = computed(() => (mapEvents.value.length || mapLoading.value ? mapEvents.value : events.value).map(event => {
  const pick = recommendationById.value.get(event.id)
  return pick ? { ...event, pickedForYou: pick.source !== 'general_discovery', compatibilityScore: pick.compatibilityScore, source: pick.source, reason: pick.reason } : event
}))
watch(mapEvents, rows => { if (!rows.some(event => event.id === selectedEventId.value)) selectedEventId.value = null })
const dateGroups = computed(() => {
  const groups = new Map()
  for (const event of events.value) {
    const date = new Date(event.start_time)
    const key = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' })
    if (!groups.has(key)) groups.set(key, {
      key,
      date: key,
      label: date.toLocaleDateString('en-SG', { timeZone: 'Asia/Singapore', day: 'numeric', month: 'short' }),
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
  const hasFilters = ['search', 'when', 'extras', 'categories', 'category', 'saved'].some(key => Object.hasOwn(query, key))
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
watch(mapQuery, (value, previous) => {
  if (JSON.stringify(value) !== JSON.stringify(previous)) fetchMapEvents(value)
})
function clearFilters() { filters.value = defaults(); search.value = ''; sort.value = 'soonest'; visibleCount.value = STEP }
function showMore() { if (!loading.value) visibleCount.value += STEP }
</script>

<template>
  <div ref="pageRoot" class="discover-page" tabindex="-1">
    <h1 class="visually-hidden">{{ categoryTitle }}</h1>
      <div class="discovery-search"><EventFilters ref="searchControl" v-model="filters" v-model:search="search" v-model:sort="sort" :total="total" :loading="loading" :error="error" show-active @show="showList" @retry="refreshDiscovery" /></div>
      <div ref="toolbar" class="discovery-toolbar">
        <nav ref="categoryRow" class="category-shortcuts" :class="{ 'fade-start': rowFade.start, 'fade-end': rowFade.end }" aria-label="Event categories" @scroll.passive="updateRowFade">
          <button v-if="showSavedChip" type="button" class="category-shortcut saved-shortcut" :aria-pressed="savedSelected" :aria-label="`Saved events, ${savedCount}`" @click="chooseSaved"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4V3Z" /></svg>Saved<span class="saved-count" aria-hidden="true">{{ savedCount }}</span></button>
          <button type="button" class="category-shortcut" :aria-pressed="!filters.categories.length && !savedSelected" @click="chooseCategory()">All</button>
          <button v-for="group in EVENT_GROUPS" :key="group.id" type="button" class="category-shortcut cat-tint" :class="`cat-${group.categories[0]}`" :aria-pressed="sameCategories(filters.categories, group.categories)" @click="chooseGroup(group)">{{ group.label }}</button>
        </nav>
        <div class="results-tools">
          <span aria-live="polite"><BumpValue :value="total" /> {{ total === 1 ? 'event' : 'events' }}</span>
          <div v-if="smallScreen" class="pane-switch" :class="{ 'is-map': mobilePane === 'map' }" role="group" aria-label="Show events as">
            <span class="pane-thumb" aria-hidden="true"></span>
            <button type="button" :aria-pressed="mobilePane === 'list'" @click="showPane('list')">List</button>
            <button type="button" :aria-pressed="mobilePane === 'map'" @click="showPane('map')">Map</button>
          </div>
        </div>
      </div>
      <div class="discovery-workspace" :data-pane="smallScreen ? mobilePane : undefined" id="event-directory">
        <section ref="resultList" class="discovery-list" aria-label="Upcoming events" :aria-busy="loading" tabindex="-1">
          <h2 class="visually-hidden">What’s coming up</h2>
          <!-- First load shows placeholder rows; later filter changes keep the old results visible (dimmed) until the new ones arrive. -->
          <SkeletonList v-if="loading && !events.length" :count="5" label="Finding your next event…" />
          <div v-dismissible v-else-if="error" class="empty-state" role="alert"><h2>We couldn’t load events</h2><p>{{ error }}</p><button type="button" class="btn btn-outline-danger" @click="refreshDiscovery">Try again</button></div>
          <div v-else-if="!events.length && !loading" class="empty-state" role="status">
            <template v-if="savedSelected">
              <h2>No saved events here</h2>
              <p>{{ search || filters.when || filters.extras.length ? 'None of your saved events match these filters.' : 'Tap the bookmark on any event to keep it here. Past saves stay in My RSVPs.' }}</p>
              <button type="button" class="btn btn-outline-secondary" @click="chooseCategory()">Browse all events</button>
            </template>
            <template v-else-if="!smallScreen && !filtersActive">
              <h2>Nothing on this week</h2>
              <p>Try another week in the calendar, or search and pick a category to see events on every date.</p>
              <button type="button" class="btn btn-outline-secondary" @click="weekOffset = Math.min(weekOffset + 1, 52)">Next week</button>
            </template>
            <template v-else>
            <h2>No events found</h2>
            <p>{{ filters.categories.length ? 'Nothing in this group right now. Try another one:' : 'Try another search, or browse a category:' }}</p>
            <div class="empty-suggestions">
              <button v-for="group in emptySuggestions" :key="group.id" type="button" class="category-shortcut cat-tint" :class="`cat-${group.categories[0]}`" @click="search = ''; chooseGroup(group)">{{ group.label }}</button>
            </div>
            <button type="button" class="btn btn-outline-secondary" @click="clearFilters">Clear search and filters</button>
            </template>
          </div>
          <div v-else-if="!smallScreen" class="event-days" :class="{ 'is-refreshing': loading }">
            <DiscoveryDayRow v-for="group in dateGroups" :key="group.key" :group="group" :recommendation-by-id="recommendationById" :selected-event-id="selectedEventId" :bookmark-enabled="loggedIn" :preference-pending="actionPending" @select="selectMapEvent" @preference="changeListingPreference" />
          </div>
          <div v-else class="event-timeline" :class="{ 'is-refreshing': loading }">
            <section v-for="group in dateGroups" :key="group.key" class="date-group" :aria-label="`${group.label}, ${group.weekday} ${group.year}`">
              <div class="timeline-date"><time :datetime="group.date"><span class="date-label">{{ group.label }}<template v-if="group.year">, {{ group.year }}</template></span><span class="weekday">{{ group.weekday }}</span></time></div>
              <TransitionGroup tag="div" name="list-fade" class="date-events">
                <DiscoveryEventRow v-for="event in group.events" :key="event.id" :event="event" :recommendation="recommendationById.get(event.id)" :selected="selectedEventId === event.id" :bookmark-enabled="loggedIn" :preference-pending="actionPending" @select="selectMapEvent" @preference="changeListingPreference" />
              </TransitionGroup>
            </section>
          </div>
          <div v-if="remaining > 0 && !error" class="event-more"><button type="button" class="btn btn-outline-secondary" :disabled="loading" @click="showMore">{{ loading ? 'Loading…' : `Show ${Math.min(STEP, remaining)} more` }}</button><span>Showing {{ events.length }} of {{ total }}</span></div>
        </section>
        <div class="discovery-map-column">
          <DiscoveryStreetMap :events="mappedPageEvents" :search-text="search" :focused-event-id="selectedEventId" :prominent-ids="discoveryPicks.map(event => event.id)" :loading="loading" :error="error" @select="selectedEventId = $event" @retry="refreshDiscovery" />
          <DiscoveryWeekCalendar v-if="!smallScreen" v-model:offset="weekOffset" :events="mapEvents.length || mapLoading ? mapEvents : events" :selected-event-id="selectedEventId" @select="selectedEventId = $event.id" />
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
.category-shortcuts { padding: 6px 8px 8px 4px; margin: -6px -8px -8px -4px; }
.category-shortcuts.fade-end { -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 48px), transparent); mask-image: linear-gradient(to right, #000 calc(100% - 48px), transparent); }
.category-shortcuts.fade-start { -webkit-mask-image: linear-gradient(to right, transparent, #000 48px); mask-image: linear-gradient(to right, transparent, #000 48px); }
.category-shortcuts.fade-start.fade-end { -webkit-mask-image: linear-gradient(to right, transparent, #000 48px, #000 calc(100% - 48px), transparent); mask-image: linear-gradient(to right, transparent, #000 48px, #000 calc(100% - 48px), transparent); }
.category-shortcut { flex: none; white-space: nowrap; }
.category-shortcut { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 9px 15px; border: 1px solid transparent; border-radius: 99px; color: var(--bookedz-ink); font-size: 12px; }
.category-shortcut:not(.cat-tint) { background: var(--bookedz-hover); }
.category-shortcut[aria-pressed=true] { background: var(--bookedz-ink); color: var(--bookedz-surface); }
.category-shortcut:hover { border-color: var(--bookedz-control-border); }
.category-shortcut { transition: background-color var(--bookedz-motion-fast) var(--bookedz-ease), color var(--bookedz-motion-fast) var(--bookedz-ease), transform var(--bookedz-motion-feedback) var(--bookedz-ease); }
.category-shortcut:active { transform: scale(.95); }
/* Saved: bookmark icon + count, drawn in the chip's own colour so it follows the theme and pressed state */
.saved-shortcut { gap: 6px; }
.saved-shortcut svg { flex: none; width: 16px; height: 16px; fill: currentColor; stroke: currentColor; stroke-width: 1.8; stroke-linejoin: round; }
.saved-count { display: inline-grid; place-items: center; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px; background: color-mix(in srgb, currentColor 16%, transparent); font-size: .72rem; font-weight: 700; }
.category-shortcut[aria-pressed=true] { animation: pop-once var(--bookedz-motion-slip) var(--bookedz-ease-stamp); }
.pane-switch button { transition: background-color var(--bookedz-motion-fast) var(--bookedz-ease), color var(--bookedz-motion-fast) var(--bookedz-ease); }
.all-categories-link,.browse-back { display: inline-flex; align-items: center; min-height: 44px; padding: 6px; color: var(--bookedz-primary-dark); font-size: 12px; }
.results-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; color: var(--bookedz-muted); font-size: 12px; }
/* Phones: List | Map segmented toggle (44px tall in all) */
.pane-switch { position: relative; display: inline-grid; grid-template-columns: 1fr 1fr; padding: 2px; border-radius: 99px; background: var(--bookedz-hover); }
.pane-switch button { position: relative; z-index: 1; min-width: 64px; min-height: 40px; padding: 6px 14px; border: 0; border-radius: 99px; background: transparent; color: var(--bookedz-muted); font-size: 12px; font-weight: 600; }
.pane-switch button[aria-pressed=true] { color: var(--bookedz-ink); }
/* The white pill slides between List and Map instead of jumping */
.pane-thumb { position: absolute; top: 2px; bottom: 2px; left: 2px; width: calc(50% - 2px); border-radius: 99px; background: var(--bookedz-surface); box-shadow: var(--bookedz-tab-shadow); transition: transform var(--bookedz-motion-normal) var(--bookedz-ease-stamp); }
.pane-switch.is-map .pane-thumb { transform: translateX(100%); }

.discovery-workspace { display: grid; grid-template-columns: minmax(0,2fr) minmax(0,1fr); align-items: start; gap: 16px; min-width: 0; }
.discovery-list,.discovery-map-column { min-width: 0; }
.discovery-map-column { position: sticky; top: calc(var(--topbar-h, 0px) + 18px); }

.event-timeline { --date-column: 66px; position: relative; }
.event-timeline::before { content: ''; position: absolute; left: var(--date-column); top: 8px; bottom: 12px; width: 1px; background: var(--bookedz-border); }
.date-group { display: grid; grid-template-columns: var(--date-column) minmax(0,1fr); padding-bottom: 12px; }
.timeline-date { position: relative; padding: 7px 12px 0 0; }
.timeline-date::after { content: ''; position: absolute; top: 12px; right: -4px; width: 8px; height: 8px; border-radius: 50%; background: var(--bookedz-control-border); box-shadow: 0 0 0 3px var(--bookedz-canvas); }
.date-label,.weekday { display: block; }
.date-label { font-size: 13px; font-weight: 700; }
.weekday { margin-top: 2px; font-size: 10px; color: var(--bookedz-muted); }
.date-events { display: grid; gap: 8px; padding-left: 12px; min-width: 0; }
.event-timeline { transition: opacity var(--bookedz-motion-fast) var(--bookedz-ease); }
.event-timeline.is-refreshing { opacity: .55; }
.date-group { animation: route-in var(--bookedz-motion-normal) var(--bookedz-ease) both; }
.event-more { display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 12px; margin: 18px 0 8px; font-size: 12px; color: var(--bookedz-muted); }
.empty-state,.loading-state { padding: 28px 16px; border: 1px solid var(--bookedz-border); border-radius: 12px; background: var(--bookedz-surface); color: var(--bookedz-muted); font-size: 14px; }
.empty-state h2 { color: var(--bookedz-ink); font-size: 18px; }
.empty-suggestions { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 14px; }

@media(max-width:991px) { .discovery-toolbar { flex-wrap: wrap; }.category-shortcuts { flex-basis: 100%; }.results-tools { width: 100%; justify-content: space-between; } }
@media(min-width:992px) {
  .discover-page { display: flex; flex-direction: column; box-sizing: border-box; height: calc(100svh - var(--topbar-h, 0px)); padding-bottom: 16px; overflow: hidden; }
  .discovery-workspace { flex: 1; min-height: 0; }
  .discovery-list { height: 100%; overflow-y: auto; overscroll-behavior: contain; padding: 4px 8px 8px 0; }
  .discovery-map-column { position: static; align-self: stretch; display: flex; flex-direction: column; gap: 16px; min-height: 0; }
  /* Map and week share the column's width; the map keeps its shape so the whole island shows */
  .discovery-map-column > :first-child { flex: none; }
  .event-days { transition: opacity var(--bookedz-motion-fast) var(--bookedz-ease); }
  .event-days.is-refreshing { opacity: .55; }
}
@media(max-width:991px) {
  .discover-page { padding: 18px 12px 32px; }
}
/* Phones and tablets: one pane at a time; laptops and up keep the list and the pinned map side by side */
@media(max-width:991px) {
  .discovery-workspace { display: block; min-width: 0; }
  .discovery-map-column { position: relative; top: auto; }
  .discovery-workspace[data-pane='list'] .discovery-map-column,
  .discovery-workspace[data-pane='map'] .discovery-list { display: none; }
}
@media(max-width:575px) { .event-timeline { --date-column: 52px; }.date-events { padding-left: 10px; }.date-label { font-size: 12px; }.weekday { font-size: 10px; }.results-tools { width: 100%; justify-content: space-between; }.category-shortcut { padding-inline: 12px; } }
</style>
