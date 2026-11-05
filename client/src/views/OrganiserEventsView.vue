<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { getOrganiserEvents, deleteEvent } from '../utils/api.js'
import EventTeamPanel from '../components/event-operations/EventTeamPanel.vue'
import OrganiserEventCard from '../components/organiser/OrganiserEventCard.vue'
import SkeletonList from '../components/ui/SkeletonList.vue'
import { organiserEventState, organiserEventCounts, filterOrganiserEvents } from '../utils/organiserEvents.js'
import { isOfficialEvent } from '../utils/groups.js'

const route = useRoute()
const events = ref([])
const loading = ref(true)
const errorMessage = ref('')
const statusMessage = ref('')
const confirmDeleteId = ref(null)
const busyId = ref(null)
const now = ref(Date.now())
const statusAlert = ref(null)
const errorAlert = ref(null)
const resultsHeading = ref(null)
const storageKey = 'bookedz-organiser-events-view-v1'
let stored = {}
try { stored = JSON.parse(sessionStorage.getItem(storageKey) || '{}') || {} } catch { /* unavailable or obsolete state */ }
const activeTab = ref(['upcoming', 'drafts', 'past', 'all'].includes(stored.tab) ? stored.tab : 'upcoming')
const search = ref(typeof stored.search === 'string' ? stored.search : '')
const sort = ref(stored.sort === 'newest' ? 'newest' : 'soonest')
const pendingOnly = ref(stored.pendingOnly === true)
watch([activeTab, search, sort, pendingOnly], () => {
  try { sessionStorage.setItem(storageKey, JSON.stringify({ tab: activeTab.value, search: search.value, sort: sort.value, pendingOnly: pendingOnly.value })) } catch { /* browsing still works without storage */ }
})
const justCreatedId = computed(() => route.query.created)
const justUpdatedId = computed(() => route.query.updated)
const counts = computed(() => organiserEventCounts(events.value, now.value))
const tabs = computed(() => [
  { id: 'upcoming', label: 'Upcoming' }, { id: 'drafts', label: 'Drafts' },
  { id: 'past', label: 'Past' }, { id: 'all', label: 'All' },
])
const pendingEvents = computed(() => events.value.filter(event => organiserEventState(event, now.value) === 'upcoming' && event.pendingCount > 0))
const pendingCount = computed(() => pendingEvents.value.reduce((sum, event) => sum + event.pendingCount, 0))
const visibleEvents = computed(() => filterOrganiserEvents(events.value, { tab: activeTab.value, search: search.value, sort: sort.value, pendingOnly: pendingOnly.value, now: now.value }))
const sectionTitle = computed(() => ({ upcoming: 'Today and upcoming', drafts: 'Your drafts', past: 'Past events', all: 'All your events' })[activeTab.value])
const emptyTitle = computed(() => search.value.trim() ? `No events match “${search.value.trim()}”` : pendingOnly.value ? 'All caught up on requests.' : ({ upcoming: 'Your next gathering starts here.', drafts: 'No drafts waiting in the wings.', past: 'Your hosting memories start here.', all: 'You haven’t hosted anything yet.' })[activeTab.value])
const emptyCopy = computed(() => search.value.trim() ? 'Check the spelling, or clear your search to see your events again.' : pendingOnly.value ? 'There are no upcoming events waiting for your approval.' : ({ upcoming: 'Create your next event and bring people together.', drafts: 'Any unpublished events will appear here, ready for you to keep editing.', past: 'Results and attendance will appear here after your events end.', all: 'Create your first event and give your community something to look forward to.' })[activeTab.value])
let mounted = false, requestId = 0, refreshing = false, timer
async function loadEvents() {
  if (!mounted || refreshing || busyId.value) return
  refreshing = true
  const request = ++requestId
  now.value = Date.now()
  errorMessage.value = ''
  try {
    // My Events lists official events; Go together groups are managed from Community
    const rows = (await getOrganiserEvents()).filter(isOfficialEvent)
    if (mounted && request === requestId) events.value = rows
  } catch (error) {
    if (mounted && request === requestId) errorMessage.value = 'Could not load your events: ' + error.message
  } finally {
    if (mounted && request === requestId) { loading.value = false; refreshing = false }
  }
}
onMounted(() => {
  mounted = true
  if (justCreatedId.value) { activeTab.value = 'upcoming'; search.value = ''; pendingOnly.value = false }
  loadEvents()
  timer = setInterval(loadEvents, 30000)
  window.addEventListener('focus', loadEvents)
})
onUnmounted(() => { mounted = false; requestId++; clearInterval(timer); window.removeEventListener('focus', loadEvents) })
function selectTab(id) {
  activeTab.value = id
  pendingOnly.value = false
  sort.value = id === 'past' ? 'newest' : 'soonest'
}
async function moveTab(event, index) {
  let target
  if (event.key === 'ArrowRight') target = (index + 1) % tabs.value.length
  else if (event.key === 'ArrowLeft') target = (index + tabs.value.length - 1) % tabs.value.length
  else if (event.key === 'Home') target = 0
  else if (event.key === 'End') target = tabs.value.length - 1
  else return
  event.preventDefault()
  selectTab(tabs.value[target].id)
  await nextTick()
  document.getElementById(`organiser-tab-${activeTab.value}`)?.focus()
}
async function reviewAll() {
  activeTab.value = 'upcoming'
  pendingOnly.value = true
  search.value = ''
  await nextTick()
  resultsHeading.value?.focus()
}
async function askDelete(id) {
  confirmDeleteId.value = id
  await nextTick()
  document.getElementById(`keep-event-${id}`)?.focus()
}
async function keepEvent(id) {
  confirmDeleteId.value = null
  await nextTick()
  document.getElementById(`delete-event-${id}`)?.focus()
}
async function removeEvent(eventId) {
  if (busyId.value) return
  busyId.value = eventId
  errorMessage.value = ''
  statusMessage.value = ''
  // Invalidate an in-flight read so it cannot restore the deleted card.
  requestId++
  refreshing = false
  try {
    await deleteEvent(eventId)
    if (!mounted) return
    confirmDeleteId.value = null
    events.value = events.value.filter(event => event.id !== eventId)
    statusMessage.value = 'Event deleted, including its RSVPs and organiser records.'
    await nextTick()
    statusAlert.value?.focus()
  } catch (error) {
    if (mounted) { errorMessage.value = error.message; await nextTick(); errorAlert.value?.focus() }
  } finally { if (mounted) busyId.value = null }
}
</script>

<template>
  <div class="organiser-events-page">
    <header class="organiser-heading"><div><p class="organiser-kicker">Your hosting space</p><h1 class="page-title">My Events</h1><p>{{ loading ? 'Your gatherings, all in one place.' : `${counts.all} events · ${counts.upcoming} upcoming · ${counts.drafts} drafts` }}</p></div><RouterLink to="/organiser/events/new" class="btn btn-primary">＋ Create event</RouterLink></header>
    <div v-dismissible v-if="justCreatedId" class="alert alert-success" role="status">Event published. Participants can now find it and RSVP.</div>
    <div v-dismissible v-if="justUpdatedId" class="alert alert-success" role="status">Changes saved. {{ route.query.announced ? 'An announcement about them is now on the event page.' : 'No announcement was posted.' }}</div>
    <div v-dismissible v-if="statusMessage" ref="statusAlert" tabindex="-1" class="alert alert-success" role="status">{{ statusMessage }}</div>
    <div v-dismissible v-if="errorMessage" ref="errorAlert" tabindex="-1" class="alert alert-danger" role="alert">{{ errorMessage }} <button type="button" class="btn btn-outline-secondary" :disabled="busyId !== null" @click="loadEvents">Retry loading events</button></div>
    <EventTeamPanel class="mb-4" compact />
    <SkeletonList v-if="loading" variant="card" :count="3" label="Loading your events…" />
    <template v-else>
      <aside v-if="pendingCount > 0" class="pending-summary" aria-label="Pending RSVP requests"><p><span aria-hidden="true">!</span><strong>{{ pendingCount }}</strong> {{ pendingCount === 1 ? 'RSVP is' : 'RSVPs are' }} waiting for your approval across {{ pendingEvents.length }} {{ pendingEvents.length === 1 ? 'event' : 'events' }}.</p><button type="button" class="btn btn-primary" @click="reviewAll">Review all requests</button></aside>
      <div class="events-controls">
        <label class="event-search"><span class="visually-hidden">Search your events</span><input v-model="search" type="search" placeholder="Search your events" /></label>
        <div class="event-tabs" role="tablist" aria-label="Organiser event sections"><button v-for="(tab, index) in tabs" :id="`organiser-tab-${tab.id}`" :key="tab.id" role="tab" type="button" :aria-selected="activeTab === tab.id" aria-controls="organiser-events-panel" :tabindex="activeTab === tab.id ? 0 : -1" @click="selectTab(tab.id)" @keydown="moveTab($event, index)">{{ tab.label }} <span>{{ counts[tab.id] }}</span></button></div>
        <label class="event-sort">Sort by <select v-model="sort"><option value="soonest">Soonest first</option><option value="newest">Latest date first</option></select></label>
      </div>
      <div v-if="pendingOnly" class="request-filter">Showing events with pending requests. <button type="button" @click="pendingOnly = false">Show all {{ activeTab }} events</button></div>
      <section id="organiser-events-panel" :key="activeTab" role="tabpanel" :aria-labelledby="`organiser-tab-${activeTab}`" tabindex="0">
        <h2 ref="resultsHeading" tabindex="-1" class="events-section-title section-title">{{ sectionTitle }} <span>{{ visibleEvents.length }} {{ visibleEvents.length === 1 ? 'event' : 'events' }}</span></h2>
        <TransitionGroup v-if="visibleEvents.length" tag="div" name="list-fade" class="organiser-grid stagger-in"><OrganiserEventCard v-for="event in visibleEvents" :key="event.id" :event="event" :now="now" :confirming="confirmDeleteId === event.id" :busy="busyId === event.id" :disabled="busyId !== null" :just-created="event.id === justCreatedId" @ask-delete="askDelete" @keep="keepEvent" @delete="removeEvent" /></TransitionGroup>
        <div v-else-if="!errorMessage" class="empty-events"><span aria-hidden="true">{{ search.trim() ? '⌕' : '✳' }}</span><h3 class="event-title">{{ emptyTitle }}</h3><p>{{ emptyCopy }}</p><button v-if="search.trim()" type="button" class="btn btn-outline-secondary" @click="search = ''">Clear search</button><button v-else-if="pendingOnly" type="button" class="btn btn-outline-secondary" @click="pendingOnly = false">Show all upcoming events</button><RouterLink v-else-if="activeTab !== 'past'" to="/organiser/events/new" class="btn btn-primary">{{ counts.all ? 'Create event' : 'Create your first event' }}</RouterLink><RouterLink v-else to="/discover" class="btn btn-outline-secondary">Explore events</RouterLink></div>
      </section>
      <div v-if="activeTab === 'upcoming' && counts.past > 0" class="past-shortcut"><p><strong>Past events · {{ counts.past }}</strong> Results and attendance for events that have ended.</p><button type="button" @click="selectTab('past')">Show past events</button></div>
    </template>
  </div>
</template>
<style scoped>
.organiser-events-page{max-width:1120px;margin:0 auto;padding:12px 0 48px;color:var(--bookedz-ink)}.organiser-heading{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:20px;padding:28px;border-radius:24px;background:linear-gradient(120deg,var(--bookedz-peach),var(--bookedz-mango));margin-bottom:22px}.organiser-heading h1{ margin:7px 0 10px; }.organiser-heading p{font-size:var(--text-body);margin:0}.organiser-heading .organiser-kicker{font-size:var(--text-caption);font-weight:650}.btn-primary{background:var(--bookedz-primary);border-color:var(--bookedz-primary);color:var(--bookedz-on-action)}.organiser-heading .btn{ min-height:44px; }.pending-summary{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 18px;margin-bottom:22px;border:1px solid color-mix(in srgb,var(--bookedz-yellow) 60%,var(--bookedz-border));border-radius:16px;background:color-mix(in srgb,var(--bookedz-yellow) 18%,var(--bookedz-surface))}.pending-summary p{font-size:var(--text-small);margin:0}.pending-summary p>span{display:inline-grid;place-items:center;width:25px;height:25px;margin-right:8px;border-radius:50%;background:color-mix(in srgb,var(--bookedz-yellow) 65%,var(--bookedz-surface));font-weight:700}.pending-summary .btn{ flex-shrink:0; min-height:44px; }.events-controls{display:flex;flex-wrap:wrap;margin-bottom:24px;align-items:center;gap:10px}.event-search{flex:1 1 190px;min-width:0}.event-search input{width:100%;min-height:44px;border:1px solid var(--bookedz-border);border-radius:13px;padding:10px 14px;background:var(--bookedz-surface);color:var(--bookedz-ink);font-size:var(--text-small)}/* Wraps instead of scrolling: the selected tab lifts and casts a 3px shadow, which a scroll box would clip (and show a scrollbar for) */.event-tabs{display:flex;flex-wrap:wrap;gap:8px 6px;max-width:100%;padding:2px 3px 3px 0}.event-tabs button{min-height:44px;border:1px solid var(--bookedz-border);border-radius:24px;background:var(--bookedz-surface);color:var(--bookedz-ink);padding:8px 12px;font-size:var(--text-button);white-space:nowrap}.event-tabs button[aria-selected=true]{background:var(--bookedz-ink);color:var(--bookedz-surface);border-color:var(--bookedz-ink)}.event-tabs span{font-size:var(--text-caption);margin-left:4px}.event-sort{display:flex;align-items:center;gap:6px;font-size:var(--text-small)}.event-sort select{min-height:44px;max-width:155px;border:1px solid var(--bookedz-border);border-radius:12px;padding:8px;background:var(--bookedz-surface);color:var(--bookedz-ink);font-size:var(--text-small)}.view-memory{font-size:var(--text-caption);color:var(--bookedz-muted);margin:10px 0 24px}.events-section-title{ margin:0 0 18px; }.events-section-title>span{font-size:var(--text-small);font-weight:400;color:var(--bookedz-muted);margin-left:5px}.organiser-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;align-items:stretch}.request-filter{display:flex;align-items:center;flex-wrap:wrap;gap:6px;font-size:var(--text-small);margin-bottom:18px}.request-filter button,.past-shortcut button{background:transparent;border:0;color:var(--bookedz-primary-dark);text-decoration:underline;min-height:44px;padding:6px;font-size:.8rem}.empty-events{max-width:650px;margin:24px auto;padding:42px 22px;border:1px dashed var(--bookedz-border);border-radius:22px;background:var(--bookedz-surface);text-align:center}.empty-events>span{display:inline-grid;place-items:center;width:48px;height:48px;border-radius:50%;background:var(--bookedz-hover);font-size:1.8rem;color:var(--bookedz-primary-dark)}.empty-events h3{ margin:18px 0 12px; overflow-wrap:anywhere; }.empty-events p{font-size:var(--text-body);max-width:390px;margin:0 auto 20px;color:var(--bookedz-muted)}.empty-events .btn{ min-height:44px; }.past-shortcut{display:flex;justify-content:space-between;align-items:center;gap:12px;border-top:1px solid var(--bookedz-border);margin-top:32px;padding-top:18px}.past-shortcut p{font-size:var(--text-small);color:var(--bookedz-muted);margin:0}.past-shortcut strong{color:var(--bookedz-ink);margin-right:8px}.alert{overflow-wrap:anywhere}.alert .btn{min-height:44px}:deep(:focus-visible){outline:3px solid var(--bookedz-primary-dark);outline-offset:3px}
@media(max-width:1000px){.organiser-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.event-sort{margin-left:auto}}
@media(max-width:575px){.organiser-heading{padding:24px 20px}.organiser-heading>.btn{width:100%}.pending-summary{align-items:stretch;flex-direction:column}.events-controls{gap:12px}.event-search{flex-basis:100%}.event-tabs{width:100%;gap:8px 6px}.event-tabs button{flex:1;padding:8px 10px;font-size:.75rem}.organiser-grid{grid-template-columns:1fr}.event-sort{width:100%;margin-left:0;justify-content:space-between}.event-sort select{max-width:none;min-width:160px}.past-shortcut{align-items:flex-start;flex-direction:column}.organiser-events-page{padding-top:0}}
</style>
