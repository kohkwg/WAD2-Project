<script setup>
import { ref, watch, onMounted, onBeforeUnmount, computed, nextTick } from 'vue'
import { supabase } from '@/lib/supabase'
import { USING_SUPABASE } from '@/utils/api'
import { observeDiscoverySession } from '@/lib/discoveryState'
import { useRouter } from 'vue-router'
import { useEvents, useRecommendations } from '@/composables/useEvents'
import EventCard from '@/components/EventCard.vue'
import EventFilters from '@/components/EventFilters.vue'
import PickedForYou from '@/components/PickedForYou.vue'
import SingaporeMap from '@/components/discovery/SingaporeMap.vue'
import DiscoveryHero from '@/components/discovery/DiscoveryHero.vue'
import EventArtwork from '@/components/EventArtwork.vue'
import { useDiscoveryMotion } from '@/composables/useDiscoveryMotion'
import { CATEGORIES } from '@/lib/constants'
import islandArt from '@/assets/illustrations/singapore-animated-plate.webp'

const defaults = () => ({ search: '', category: '', categories: [], tag: '', dateFrom: '', dateTo: '', availableOnly: false, sort: 'soonest', page: 1 })
const filters = ref(defaults())
const viewMode = ref('illustration')
const pageRoot = ref(null)
const liveStage = ref(null)
const mapRegion = ref(null)
useDiscoveryMotion(pageRoot)
const neighbourhoods = [
  { name: 'Marina Bay', note: 'A different kind of city escape', lat: 1.282, lng: 103.855, position: '60% 65%' },
  { name: 'Tampines', note: 'Good things in the east', lat: 1.355, lng: 103.945, position: '85% 35%' },
  { name: 'Jurong', note: 'Make a little room for the west', lat: 1.34, lng: 103.7, position: '15% 45%' },
  { name: 'Woodlands', note: 'Take your curiosity north', lat: 1.435, lng: 103.79, position: '45% 12%' },
]
let modeTransition
async function changeMode(mode) {
  if (mode === viewMode.value) return
  const update = async () => {
    viewMode.value = mode
    await nextTick()
    const target = mode === 'list' ? resultList.value : mode === 'map' ? liveStage.value : pageRoot.value
    target?.focus({ preventScroll: true })
    target?.scrollIntoView({ behavior: 'instant', block: 'start' })
  }
  modeTransition?.skipTransition()
  if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    modeTransition = document.startViewTransition(update)
    try { await modeTransition.finished } catch { /* A newer interaction may supersede this transition. */ }
  } else await update()
}
async function exploreNeighbourhood(region) {
  mapRegion.value = { ...region }
  await changeMode('map')
}
async function exploreCategory(category) {
  filters.value = { ...defaults(), categories: [category] }
  await showList()
}
const resultList = ref(null)
const router = useRouter()
// Gregory owns the registration flows. Navigate to his page until a parent
// integration supplies them; no RSVP or waitlist mutation happens here.
function openEventAction(event, action) {
  router.push({ path: `/events/${event.id}/rsvp`, hash: `#${action}` })
}
const { events, total, loading, error, fetchEvents, PAGE_SIZE } = useEvents()
const { events: mapEvents, loading: mapLoading, error: mapError, fetchEvents: fetchMapEvents } = useEvents()
function refreshDiscovery() {
  fetchEvents(filters.value)
  fetchMapEvents({ ...filters.value, forMap: true })
}
function showList() { return changeMode('list') }
const { recommended, loading: recLoading, error: recError, fetchRecommendations, clearRecommendations } = useRecommendations()
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
onBeforeUnmount(() => { navbarResizeObserver?.disconnect(); modeTransition?.skipTransition() })
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
const filtersActive = computed(() => {
  const f = filters.value
  return !!(f.search || f.category || f.categories?.length || f.tag || f.dateFrom || f.dateTo || f.availableOnly || f.sort !== 'soonest')
})
const generalPicks = computed(() => [...(mapEvents.value.length ? mapEvents.value : events.value)]
  .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
  .slice(0, 6).map(event => ({ ...event, reason: 'Upcoming event' })))
const personalisedReady = computed(() => loggedIn.value && !recError.value && recommended.value.length > 0)
const discoveryPicks = computed(() => personalisedReady.value ? recommended.value : generalPicks.value)
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
let stopAuth
onMounted(() => {
  if (!USING_SUPABASE) { refreshDiscovery(); return }
  stopAuth = observeDiscoverySession(supabase, session => {
    loggedIn.value = Boolean(session)
    clearRecommendations()
    refreshDiscovery()
    if (session) fetchRecommendations(6)
  }, failure => { error.value = failure.message || 'Could not load your session.' })
})
onBeforeUnmount(() => { stopAuth?.(); clearRecommendations() })
watch(filters, (value, previous) => {
  fetchEvents(value)
  if (JSON.stringify({ ...value, page: 1 }) !== JSON.stringify({ ...previous, page: 1 })) fetchMapEvents({ ...value, forMap: true })
}, { deep: true })
function clearFilters() { filters.value = defaults() }
function goToPage(page) {
  if (page < 1 || page > totalPages.value || loading.value) return
  filters.value = { ...filters.value, page }
  resultList.value?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })
}
</script>

<template>
  <div ref="pageRoot" class="discover-page" tabindex="-1" :style="{ '--discover-navbar-height': `${navbarHeight}px` }">
    <div class="discovery-mode-host">
      <DiscoveryHero v-if="viewMode === 'illustration'" key="island" v-model="filters" :total="total" @mode="changeMode" />
      <div v-else key="live" ref="liveStage" class="discovery-stage" tabindex="-1">
        <div class="discovery-topbar">
          <div><p class="discovery-eyebrow">Your next experience, a little closer.</p><h1>Discover events</h1></div>
          <div class="discovery-top-actions">
            <RouterLink v-if="loggedIn" to="/profile" class="interests-link">Your interests <span aria-hidden="true">↗</span></RouterLink>
            <div class="view-switch" role="group" aria-label="Discovery view"><button type="button" :aria-pressed="false" @click="changeMode('illustration')">Island</button><button type="button" :aria-pressed="viewMode === 'map'" @click="changeMode('map')">Map</button><button type="button" :aria-pressed="viewMode === 'list'" @click="showList">List</button></div>
          </div>
        </div>
        <div class="discovery-search"><EventFilters v-model="filters" /></div>
        <SingaporeMap v-if="viewMode === 'map'" :events="mapEvents" :region="mapRegion" :prominent-ids="discoveryPicks.map(event => event.id)" :loading="mapLoading" :error="mapError" @retry="refreshDiscovery" @list="showList" />
      </div>
    </div>
    <div ref="resultList" class="container discover-content" id="event-directory" tabindex="-1">
      <div class="directory-intro"><div><p class="discovery-eyebrow">Good plans start here</p><h2>Go where your curiosity takes you.</h2></div><span>{{ total }} {{ total === 1 ? 'event' : 'events' }} to explore</span></div>
      <PickedForYou
        v-if="viewMode === 'illustration' && !filtersActive"
        :events="discoveryPicks"
        :loading="loading || (loggedIn && recLoading && !generalPicks.length)"
        :error="discoveryPicks.length ? '' : error"
        :personalized="personalisedReady"
        :fallback="Boolean(loggedIn && recError)"
        @retry="loggedIn ? fetchRecommendations(6) : refreshDiscovery()"
        @rsvp="openEventAction($event, 'rsvp')"
        @waitlist="openEventAction($event, 'waitlist')"
      />
      <section v-if="viewMode === 'illustration'" class="curiosity-section" aria-labelledby="curiosity-title" data-scroll-reveal>
        <div class="section-intro"><div><p class="discovery-eyebrow">There’s a little of everything here</p><h2 id="curiosity-title">What are you in the mood for?</h2></div><span>Follow a feeling. Find a plan.</span></div>
        <div class="category-experiences"><button v-for="category in CATEGORIES.slice(0, 6)" :key="category" type="button" @click="exploreCategory(category)"><EventArtwork :category="category" /><span>{{ category.charAt(0).toUpperCase() + category.slice(1) }}<span aria-hidden="true">↗</span></span></button></div>
      </section>
      <section aria-label="Upcoming events" :aria-busy="loading">
        <h2 class="directory-title">What’s coming up</h2>
        <div v-if="loading" class="text-center loading-state" role="status">
          <div class="spinner-border text-primary" aria-hidden="true"></div>
          <p class="text-secondary mt-3">Finding your next event…</p>
        </div>
        <div v-else-if="error" class="alert alert-danger" role="alert">
          <p class="mb-2">We couldn’t load events. Please try again.</p>
          <p class="small mb-3">{{ error }}</p>
          <button type="button" class="btn btn-outline-danger btn-sm" @click="refreshDiscovery">Try again</button>
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
      <section v-if="viewMode === 'illustration'" class="neighbourhood-section" aria-labelledby="neighbourhood-title" data-scroll-reveal>
        <div class="section-intro"><div><p class="discovery-eyebrow">Familiar places. Fresh possibilities.</p><h2 id="neighbourhood-title">Find your corner of the island.</h2></div><span>Open a neighbourhood on the live map.</span></div>
        <div class="neighbourhood-grid"><button v-for="region in neighbourhoods" :key="region.name" type="button" @click="exploreNeighbourhood(region)"><img :src="islandArt" alt="" loading="lazy" width="360" height="220" :style="{ objectPosition: region.position }" /><span class="neighbourhood-name">{{ region.name }} <span aria-hidden="true">↗</span></span><span class="neighbourhood-note">{{ region.note }}</span></button></div>
      </section>
      <section v-if="viewMode === 'illustration'" class="hosting-invitation" aria-labelledby="hosting-title" data-scroll-reveal>
        <div><p class="discovery-eyebrow">Good things happen when people get together</p><h2 id="hosting-title">Got a good idea?<br>Make it a great gathering.</h2><p>From a small workshop to a big night out, give your people something to look forward to.</p><RouterLink to="/organiser/events/new" class="btn btn-primary">Host an event <span aria-hidden="true">↗</span></RouterLink></div>
        <div class="hosting-art" aria-hidden="true"><EventArtwork category="community" /><span class="hosting-stamp">More together.<br>More Bookedz.</span></div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.discover-page { outline: none; color: var(--bookedz-ink); }
.discovery-stage { background: var(--bookedz-canvas); border-bottom: 1px solid var(--bookedz-border); }
.discovery-topbar { max-width: 1440px; margin: 0 auto; padding: 28px 40px 18px; display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.discovery-eyebrow { color: var(--bookedz-muted); font-size: .75rem; font-weight: 500; margin: 0 0 7px; }
.discovery-topbar h1 { font-size: clamp(1.8rem,2.8vw,2.6rem); margin: 0; }
.discovery-top-actions { display: flex; gap: 24px; align-items: center; }.interests-link { font-size: .8rem; text-decoration: none; }
.view-switch { display: inline-flex; padding: 4px; border-radius: 12px; border: 1px solid var(--bookedz-border); background: var(--bookedz-glass-active); gap: 3px; }.view-switch button { min-height: 44px; display: flex; align-items: center; justify-content: center; gap: 7px; padding: 8px 16px; border: 0; border-radius: 9px; background: transparent; font-size: .8rem; color: var(--bookedz-muted); font-weight: 600; }.view-switch button[aria-pressed=true] { background: var(--bookedz-surface); color: var(--bookedz-ink); box-shadow: 0 2px 4px #4b5e3512; }.view-switch svg { width: 16px; height: 16px; }
.discovery-search { max-width: 1440px; margin: 0 auto; padding: 0 40px 18px; }
.discover-content { max-width: 1200px; padding-top: 50px; padding-bottom: 64px; scroll-margin-top: 20px; }
.directory-intro { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 20px; align-items: end; margin-bottom: 32px; }.directory-intro h2 { margin: 0; }.directory-intro > span { font-size: .8rem; color: var(--bookedz-muted); }.directory-title { font-size: 1.5rem; margin: 40px 0 24px; }
.event-timeline { --date-column: 130px; position: relative; margin-top: 24px; }.event-timeline::before { content: ''; position: absolute; left: calc(var(--date-column) - 1px); top: 0; bottom: 0; width: 1px; background: var(--bookedz-border); }
.date-group { position: relative; display: grid; grid-template-columns: var(--date-column) minmax(0,1fr); padding-bottom: 28px; }.timeline-date { align-self: start; padding: 16px 20px 0 0; position: sticky; top: calc(var(--discover-navbar-height) + 24px); }.timeline-date::after { content: ''; position: absolute; width: 9px; height: 9px; border-radius: 50%; background: #c2b891; left: calc(var(--date-column) - 5px); top: 24px; box-shadow: 0 0 0 5px var(--bookedz-canvas); }.date-label,.weekday { display: block; }.date-label { font-family: var(--bookedz-heading); font-size: 1.1rem; font-weight: 650; }.weekday { color: var(--bookedz-muted); font-size: .8rem; margin-top: 4px; }.date-events { display: grid; gap: 16px; padding-left: 28px; }
.loading-state,.empty-state { padding: 60px 24px; }.empty-state { background: var(--bookedz-surface); border: 1px solid var(--bookedz-border); border-radius: 22px; }.empty-icon { font-size: 2.6rem; color: #a45038; margin-bottom: 12px; }
@media(max-width:767px) { .discovery-topbar { padding: 22px 18px 16px; gap: 12px; }.discovery-top-actions { gap: 8px; }.interests-link { display: none; }.view-switch button { padding: 7px 10px; min-height: 44px; }.view-switch svg { display: none; }.discovery-search { padding: 0 18px 8px; }.discover-content { padding-top: 32px; }.directory-intro h2 { font-size: 1.55rem; }.directory-intro { margin-bottom: 24px; }.event-timeline { --date-column: 5px; }.date-group { display: block; padding-bottom: 24px; }.timeline-date { position: relative; padding: 0 0 12px 22px; }.timeline-date::after { left: 0; top: 12px; }.date-events { padding-left: 22px; }.discovery-eyebrow { font-size: .65rem; }.discovery-topbar h1 { font-size: 1.65rem; } }
.discovery-stage:focus,.discover-content:focus { outline: none; }
.discovery-mode-host > * { animation: discovery-arrive .32s cubic-bezier(.2,.7,.2,1); }
@keyframes discovery-arrive { from { opacity: .5; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@media(prefers-reduced-motion:reduce) { .discovery-mode-host > * { animation: none; } }
.section-intro { display: flex; align-items: end; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 24px; }.section-intro h2 { margin: 0; font-size: clamp(1.6rem,2.8vw,2.2rem); }.section-intro > span { font-size: .75rem; color: var(--bookedz-muted); }
.curiosity-section,.neighbourhood-section { margin: 64px 0; }.category-experiences { display: grid; grid-template-columns: repeat(6,minmax(0,1fr)); gap: 14px; }.category-experiences button { border: 1px solid var(--bookedz-border); padding: 0; background: var(--bookedz-surface); border-radius: 22px; overflow: hidden; text-align: left; transition: transform var(--bookedz-motion-fast) ease,box-shadow var(--bookedz-motion-fast) ease; }.category-experiences button > span { padding: 14px; display: flex; justify-content: space-between; font-size: .85rem; font-weight: 650; color: var(--bookedz-ink); }.category-experiences :deep(svg) { width: 100%; height: 125px; display: block; }.category-experiences button:hover { transform: translateY(-5px); box-shadow: var(--bookedz-shadow); }
.neighbourhood-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 18px; }.neighbourhood-grid button { display: flex; flex-direction: column; border: 1px solid var(--bookedz-border); background: var(--bookedz-surface); border-radius: 22px; padding: 0 0 18px; overflow: hidden; text-align: left; color: var(--bookedz-ink); }.neighbourhood-grid img { width: 100%; height: 170px; object-fit: cover; margin-bottom: 16px; transition: transform .45s ease; }.neighbourhood-grid button:hover img { transform: scale(1.045); }.neighbourhood-name { display: flex; justify-content: space-between; width: 100%; padding: 0 18px; font-family: var(--bookedz-heading); font-size: 1.3rem; font-weight: 650; }.neighbourhood-note { margin-top: 5px; padding: 0 18px; font-size: .75rem; color: var(--bookedz-muted); }
.hosting-invitation { display: grid; grid-template-columns: 1.1fr 1fr; align-items: center; gap: 30px; padding: 48px; margin: 70px 0 10px; border-radius: 32px; background: var(--bookedz-hover); border: 1px solid var(--bookedz-border); overflow: hidden; }.hosting-invitation h2 { font-size: clamp(2rem,3.5vw,3rem); line-height: 1.05; }.hosting-invitation p:not(.discovery-eyebrow) { font-size: .9rem; max-width: 360px; color: var(--bookedz-muted); margin: 18px 0 24px; }.hosting-art { position: relative; }.hosting-art :deep(svg) { width: 100%; height: auto; border-radius: 50%; transform: rotate(-5deg); }.hosting-stamp { position: absolute; right: -10px; bottom: 0; display: grid; place-content: center; width: 115px; height: 115px; border-radius: 50%; color: var(--bookedz-ink); background: var(--bookedz-yellow); border: 1px dashed var(--bookedz-control-border); font-family: var(--bookedz-heading); font-size: 1rem; text-align: center; transform: rotate(10deg); }
@media(max-width:991px) { .category-experiences { grid-template-columns: repeat(3,minmax(0,1fr)); }.neighbourhood-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }.hosting-invitation { padding: 30px; } }
@media(max-width:575px) { .category-experiences { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; }.curiosity-section,.neighbourhood-section { margin: 44px 0; }.neighbourhood-grid { gap: 12px; }.neighbourhood-grid img { height: 125px; }.neighbourhood-name { font-size: 1.1rem; padding: 0 12px; }.neighbourhood-note { padding: 0 12px; font-size: .65rem; }.hosting-invitation { grid-template-columns: 1fr; padding: 28px; margin-top: 48px; }.hosting-art { max-width: 300px; margin: 0 auto; }.hosting-stamp { width: 95px; height: 95px; }.section-intro > span { font-size: .7rem; } }
@media(max-width:575px) { .discovery-topbar { flex-wrap: wrap; align-items: flex-start; }.discovery-top-actions { width: 100%; }.view-switch { width: 100%; }.view-switch button { flex: 1; } }
@media(prefers-reduced-motion:reduce) { .category-experiences button,.neighbourhood-grid img { transition: none; }.category-experiences button:hover,.neighbourhood-grid button:hover img { transform: none; } }
</style>
