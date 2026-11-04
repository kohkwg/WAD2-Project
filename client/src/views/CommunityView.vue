<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { getEvents, getJios, JIOS_AVAILABLE } from '../utils/api.js'
import JioCard from '../components/community/JioCard.vue'
import StartJioDialog from '../components/community/StartJioDialog.vue'
import SkeletonList from '../components/ui/SkeletonList.vue'
import { toast } from '../composables/useToast'

// Community is the open jio hub: people post "I'm going to this event, who's coming?",
// others join, then RSVP to the event itself. Official events stay in Discover.
const route = useRoute()
const router = useRouter()
const jios = ref([])
const events = ref([])
const loading = ref(true)
const error = ref('')
const filter = ref('all')
const query = ref('')
const composerFor = ref(null) // null closed; '' open with no event; an event id to preselect
const highlightId = ref('')

const FILTERS = [
  { key: 'all', label: 'All jios' },
  { key: 'week', label: 'This week' },
  { key: 'joined', label: 'I’m going' },
  { key: 'hosting', label: 'Hosting' },
]

async function load() {
  error.value = ''
  try {
    const [jioList, eventList] = await Promise.all([getJios(), getEvents()])
    jios.value = jioList
    events.value = eventList.filter((e) => e.kind !== 'hangout' && e.status === 'published' && new Date(e.startTime) > new Date())
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

let refreshTimer
onMounted(async () => {
  if (!JIOS_AVAILABLE) { loading.value = false; return }
  await load()
  // ?start=<event id> opens Start a jio with that event chosen (linked from event pages)
  if (typeof route.query.start === 'string') openComposer(route.query.start)
  if (typeof route.query.jio === 'string') focusJio(route.query.jio)
  refreshTimer = setInterval(load, 30000)
  window.addEventListener('focus', load)
})
onBeforeUnmount(() => { clearInterval(refreshTimer); window.removeEventListener('focus', load) })

function openComposer(eventId = '') {
  composerFor.value = events.value.some((e) => e.id === eventId) ? eventId : ''
}
function closeComposer() {
  composerFor.value = null
  if (route.query.start) router.replace({ query: { ...route.query, start: undefined } })
}
async function onCreated(jio) {
  closeComposer()
  toast('Your jio is live')
  await load()
  filter.value = 'all'
  focusJio(jio.id)
}
async function focusJio(id) {
  highlightId.value = id
  await nextTick()
  document.getElementById(`jio-${id}`)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })
  setTimeout(() => { if (highlightId.value === id) highlightId.value = '' }, 2000)
}

const weekEnd = () => Date.now() + 7 * 86400000
const visible = computed(() => {
  const q = query.value.trim().toLowerCase()
  return jios.value.filter((jio) => {
    if (filter.value === 'week' && new Date(jio.startTime) > weekEnd()) return false
    if (filter.value === 'joined' && !['confirmed', 'pending'].includes(jio.myStatus)) return false
    if (filter.value === 'hosting' && jio.myStatus !== 'host') return false
    if (!q) return true
    return [jio.note, jio.host.name, jio.event?.title, jio.event?.venue?.name].some((text) => text?.toLowerCase().includes(q))
  })
})
const counts = computed(() => ({
  all: jios.value.length,
  week: jios.value.filter((j) => new Date(j.startTime) <= weekEnd()).length,
  joined: jios.value.filter((j) => ['confirmed', 'pending'].includes(j.myStatus)).length,
  hosting: jios.value.filter((j) => j.myStatus === 'host').length,
}))
watch(filter, () => { highlightId.value = '' })
</script>

<template>
  <div class="container community-page">
    <header class="community-hero">
      <div>
        <h1 class="page-title m-0">Open jios</h1>
        <p class="community-lede">Going to an event? Find people to go with, or start a jio and let others join you.</p>
      </div>
      <div v-if="JIOS_AVAILABLE" class="community-hero-actions">
        <button type="button" class="btn btn-primary" @click="openComposer()">Start a jio</button>
        <RouterLink to="/community/plan" class="btn btn-outline-secondary">Plan a hangout</RouterLink>
      </div>
    </header>

    <div v-if="!JIOS_AVAILABLE" class="community-soon" role="status">
      <h2 class="section-title">Coming soon</h2>
      <p>Open jios are coming to the live app. You can try them now in demo mode.</p>
      <RouterLink to="/discover" class="btn btn-outline-secondary">Browse events</RouterLink>
    </div>

    <template v-else>
      <div class="community-tools">
        <div class="community-filters" role="group" aria-label="Show jios">
          <button v-for="f in FILTERS" :key="f.key" type="button" class="community-filter" :aria-pressed="filter === f.key" @click="filter = f.key">
            {{ f.label }} <span class="tnum">{{ counts[f.key] }}</span>
          </button>
        </div>
        <label class="visually-hidden" for="jio-search">Search jios</label>
        <input id="jio-search" v-model="query" type="search" class="form-control community-search" placeholder="Search events, hosts or notes…" autocomplete="off" />
      </div>

      <SkeletonList v-if="loading" :count="3" label="Loading open jios…" />
      <div v-else-if="error" class="community-empty" role="alert">
        <h2 class="section-title">Couldn’t load jios</h2>
        <p>{{ error }}</p>
        <button type="button" class="btn btn-outline-secondary" @click="load">Try again</button>
      </div>
      <TransitionGroup v-else-if="visible.length" tag="div" name="list-fade" class="community-feed stagger-in">
        <JioCard v-for="jio in visible" :key="jio.id" :jio="jio" :highlight="highlightId === jio.id" @changed="load" />
      </TransitionGroup>
      <div v-else class="community-empty" role="status">
        <h2 class="section-title">{{ query || filter !== 'all' ? 'No jios match' : 'No open jios yet' }}</h2>
        <p>{{ filter === 'hosting' ? 'You aren’t hosting any jios.' : filter === 'joined' ? 'You haven’t joined any jios yet.' : 'Be the first: pick an event and ask who wants to come.' }}</p>
        <div class="d-flex flex-wrap gap-2 justify-content-center">
          <button type="button" class="btn btn-primary" @click="openComposer()">Start a jio</button>
          <button v-if="query || filter !== 'all'" type="button" class="btn btn-outline-secondary" @click="query = ''; filter = 'all'">Show all jios</button>
        </div>
      </div>
    </template>

    <StartJioDialog v-if="composerFor !== null" :events="events" :event-id="composerFor" @close="closeComposer" @created="onCreated" />
  </div>
</template>

<style scoped>
.community-page { max-width: 820px; padding-block: 1.5rem 3rem; }
.community-hero { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 22px; }
.community-lede { margin: 8px 0 0; max-width: 46ch; color: var(--bookedz-muted); }
.community-hero-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.community-hero-actions .btn { min-height: 44px; }
.community-tools { display: grid; gap: 12px; margin-bottom: 18px; }
.community-filters { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
.community-filters::-webkit-scrollbar { display: none; }
.community-filter { flex: none; display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 6px 14px; border: 1px solid var(--bookedz-border); border-radius: 99px; background: var(--bookedz-surface); color: var(--bookedz-ink); font-size: .88rem; transition: background-color var(--bookedz-motion-fast) var(--bookedz-ease), color var(--bookedz-motion-fast) var(--bookedz-ease); }
.community-filter span { padding: 0 6px; border-radius: 99px; background: var(--bookedz-hover); font-size: .75rem; }
.community-filter[aria-pressed='true'] { background: var(--bookedz-ink); border-color: var(--bookedz-ink); color: var(--bookedz-surface); }
.community-filter[aria-pressed='true'] span { background: color-mix(in srgb, var(--bookedz-surface) 20%, transparent); }
.community-search { min-height: 44px; }
.community-feed { display: grid; gap: 14px; }
.community-empty,.community-soon { padding: 32px 20px; border: 1px dashed var(--bookedz-border); border-radius: 20px; background: var(--bookedz-surface); text-align: center; }
.community-empty p,.community-soon p { color: var(--bookedz-muted); }
</style>
