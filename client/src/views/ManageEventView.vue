<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import * as api from '../utils/api.js'
import { formatEventTime } from '../utils/helpers.js'
import TaskBoard from '../components/event-operations/TaskBoard.vue'
import AnnouncementManager from '../components/event-operations/AnnouncementManager.vue'
import BudgetTracker from '../components/event-operations/BudgetTracker.vue'
import WeatherTool from '../components/event-operations/WeatherTool.vue'
import { TASK_STATUSES } from '../utils/feature4.js'

const route = useRoute()
const router = useRouter()
const tabs = ['tasks', 'announcements', 'budget', 'weather']
const operationLinks = [
  { id: 'tasks', label: 'Tasks', hint: 'Plan the work' },
  { id: 'announcements', label: 'Announcements', hint: 'Tell attendees' },
  { id: 'budget', label: 'Budget', hint: 'Track costs' },
  { id: 'weather', label: 'Weather', hint: 'Venue plan' },
]
const eventToolLinks = [
  { label: 'Manage RSVPs', suffix: 'rsvps', hint: 'Guest list and waitlist', alwaysAvailable: true },
  { label: 'Check-in station', suffix: 'check-in', hint: 'Scan and admit guests' },
  { label: 'Venue QR', suffix: 'venue-qr', hint: 'Guest entry code' },
  { label: 'Attendance', suffix: 'attendance', hint: 'Attendance records' },
  { label: 'Floor plan', suffix: 'floor-plan', hint: 'Venue layout' },
]
const availableEventToolLinks = computed(() => eventToolLinks.filter(item => item.alwaysAvailable || api.USING_SUPABASE))
const activeTab = computed(() => tabs.includes(route.query.tab) ? route.query.tab : 'tasks')
const workspace = ref(null)
const loading = ref(false)
const loadError = ref('')
const forecast = ref(null)
const areas = ref([])
const weatherLoading = ref(false)
const weatherError = ref('')
const areasError = ref('')
const pending = reactive({ tasks: false, announcements: false, budget: false, weather: false })
const errors = reactive({ tasks: '', announcements: '', budget: '', weather: '' })
const successes = reactive({ tasks: '', announcements: '', budget: '', weather: '' })
const retries = reactive({ tasks: null, announcements: null, budget: null, weather: null })
const retryVersions = { tasks: 0, announcements: 0, budget: 0, weather: 0 }
const isOwner = computed(() => workspace.value?.event.isMine || workspace.value?.event.organiserId === api.CURRENT_ORGANISER_ID)
let epoch = 0
let weatherRequest = 0
const createRequestIds = new WeakMap()

function createRequestId(action) {
  if (!createRequestIds.has(action)) createRequestIds.set(action, crypto.randomUUID())
  return createRequestIds.get(action)
}

watch(() => route.query.tab, tab => {
  if (!tabs.includes(tab)) router.replace({ path: route.path, query: { ...route.query, tab: 'tasks' }, hash: route.hash })
}, { immediate: true })
async function load() {
  const ticket = ++epoch
  weatherRequest++; workspace.value = null; forecast.value = null; loading.value = true; loadError.value = ''; weatherError.value = ''; areasError.value = ''; weatherLoading.value = false
  tabs.forEach(tab => { pending[tab] = false; errors[tab] = ''; successes[tab] = ''; retries[tab] = null })
  try { const result = await api.getEventOperations(String(route.params.id)); if (ticket === epoch) workspace.value = result }
  catch (error) { if (ticket === epoch) loadError.value = error.message || 'Could not load this event.' }
  finally { if (ticket === epoch) loading.value = false }
}
watch(() => route.params.id, load, { immediate: true })
watch(() => [activeTab.value, workspace.value?.event.id], ([tab, eventId]) => { if (tab === 'weather' && eventId && isOwner.value) refreshWeather() })
onBeforeUnmount(() => { epoch++; weatherRequest++ })

async function mutate(tool, action, operation, apply, message) {
  if (pending[tool] || !isOwner.value) return
  const ticket = epoch
  const retryVersion = retryVersions[tool]
  const eventId = String(route.params.id)
  pending[tool] = true; errors[tool] = ''; successes[tool] = ''; retries[tool] = null
  try {
    const result = await operation(eventId)
    if (ticket !== epoch) return
    apply(result); action.done?.(); successes[tool] = message
  } catch (error) {
    if (ticket === epoch) { action.failed?.(); errors[tool] = error.message || 'Could not save. Please try again.'; retries[tool] = () => { if (retryVersions[tool] === retryVersion) mutate(tool, action, operation, apply, message) } }
  } finally { if (ticket === epoch) pending[tool] = false }
}
function cancelDestructiveAction(tool) {
  retryVersions[tool]++
  retries[tool] = null
  errors[tool] = ''
  successes[tool] = ''
}
function saveTask(action, mode) {
  const input = mode === 'create' && api.USING_SUPABASE ? { ...action.input, requestId: createRequestId(action) } : action.input
  mutate('tasks', action, id => mode === 'create' ? api.createTask(id, input) : mode === 'update' ? api.updateTask(id, action.id, action.input) : api.deleteTask(id, action.id), result => {
    workspace.value.tasks = mode === 'delete' ? workspace.value.tasks.filter(task => task.id !== action.id) : mode === 'create' ? [...workspace.value.tasks, result] : workspace.value.tasks.map(task => task.id === result.id ? result : task)
    // deleteTask reindexes the saved columns; keep the visible snapshot identical.
    if (mode === 'delete') {
      for (const status of TASK_STATUSES) {
        workspace.value.tasks.filter(task => task.status === status)
          .sort((a, b) => a.position - b.position)
          .forEach((task, index) => { task.position = index })
      }
    }
  }, mode === 'delete' ? 'Task deleted.' : 'Task saved.')
}
function saveBoard(action) { mutate('tasks', action, id => api.saveTaskBoard(id, action.input), tasks => { workspace.value.tasks = tasks }, 'Task board saved.') }
function saveAnnouncement(action, mode) {
  const requestId = mode === 'create' && api.USING_SUPABASE ? createRequestId(action) : null
  mutate('announcements', action, id => mode === 'create' ? api.createAnnouncement(id, action.body, requestId) : mode === 'update' ? api.updateAnnouncement(id, action.id, action.body) : api.deleteAnnouncement(id, action.id), result => {
    workspace.value.announcements = mode === 'delete' ? workspace.value.announcements.filter(post => post.id !== action.id) : mode === 'create' ? [result, ...workspace.value.announcements] : workspace.value.announcements.map(post => post.id === result.id ? result : post)
  }, mode === 'delete' ? 'Announcement deleted.' : 'Announcement saved.')
}
function saveLimit(action) { mutate('budget', action, id => api.saveBudgetLimit(id, action.input), () => { workspace.value.budget.limitCents = action.input }, 'Budget limit saved.') }
function saveItem(action) {
  const input = action.input.id || !api.USING_SUPABASE ? action.input : { ...action.input, requestId: createRequestId(action) }
  mutate('budget', action, id => api.saveBudgetItem(id, input), item => { workspace.value.budget.items = action.input.id ? workspace.value.budget.items.map(row => row.id === item.id ? item : row) : [...workspace.value.budget.items, item] }, 'Expense saved.')
}
function deleteItem(action) { mutate('budget', action, id => api.deleteBudgetItem(id, action.id), () => { workspace.value.budget.items = workspace.value.budget.items.filter(item => item.id !== action.id) }, 'Expense deleted.') }
async function refreshWeather() {
  const ticket = ++weatherRequest
  const page = epoch
  const eventId = String(route.params.id)
  weatherLoading.value = true; weatherError.value = ''; areasError.value = ''; forecast.value = null; areas.value = []
  let snapshot
  try { snapshot = await api.getEventWeather(eventId) }
  catch (error) {
    if (ticket === weatherRequest && page === epoch) {
      weatherError.value = error.message || 'Weather could not be loaded.'
      weatherLoading.value = false
    }
    return
  }
  if (ticket !== weatherRequest || page !== epoch) return
  forecast.value = snapshot.forecast
  areas.value = snapshot.areas
  areasError.value = areas.value.length ? '' : 'Forecast areas are unavailable. Refresh to retry.'
  weatherLoading.value = false
}
function saveArea(action) { mutate('weather', action, id => api.setForecastArea(id, action.input), area => { workspace.value.forecastAreaOverride = area; refreshWeather() }, 'Forecast area saved.') }
function switchVenue(action) { mutate('weather', action, id => api.confirmBackupVenueSwitch(id), result => { workspace.value.event = result.event; workspace.value.announcements = [result.announcement, ...workspace.value.announcements.filter(post => post.id !== result.announcement.id)]; refreshWeather() }, 'Backup venue is now active. The public venue update has been saved.') }
</script>

<template>
  <RouterLink to="/organiser/events" class="workspace-back">← My events</RouterLink>
  <p v-if="loading" class="my-5 text-center" role="status">Loading event workspace…</p>
  <div v-else-if="loadError" class="alert alert-danger mt-3" role="alert">{{ loadError }} <button type="button" class="btn btn-sm btn-outline-danger" @click="load">Retry event</button></div>
  <div v-else-if="workspace && !isOwner" class="alert alert-danger mt-3" role="alert">Only this event’s organiser can manage its tasks, announcements, budget, and weather plan.</div>
  <template v-else-if="workspace">
    <header class="workspace-header mt-3">
      <div class="workspace-title-row"><div class="workspace-title-copy"><p class="workspace-eyebrow">Organiser workspace</p><h1>{{ workspace.event.title }}</h1></div><span class="workspace-mode">{{ api.USING_SUPABASE ? 'Live workspace' : 'Demo workspace' }}</span></div>
      <div class="workspace-context"><span><strong>Event time</strong>{{ formatEventTime(workspace.event) }}</span><span><strong>Active venue</strong>{{ workspace.event.venue?.name || 'Venue not set' }}<em v-if="workspace.event.usingBackup">Backup active</em></span><details class="workspace-address"><summary>Venue address</summary><p>{{ workspace.event.venue?.address || 'No address provided.' }}</p></details></div>
      <div class="workspace-header-links"><RouterLink class="workspace-public-link" :to="'/events/' + workspace.event.id + '/rsvp'">View public event</RouterLink><span class="workspace-save-note">{{ api.USING_SUPABASE ? 'Saved to your organiser account' : 'Saved in this browser' }}</span></div>
    </header>
    <div class="workspace-layout">
      <aside class="workspace-rail" aria-label="Event workspace navigation">
        <nav class="rail-group" aria-labelledby="operations-nav-heading">
          <h2 id="operations-nav-heading">Event operations</h2>
          <RouterLink v-for="item in operationLinks" :key="item.id" class="rail-link" :class="{ active: activeTab === item.id }" :to="{ path: route.path, query: { ...route.query, tab: item.id }, hash: route.hash }" :aria-current="activeTab === item.id ? 'page' : undefined"><span>{{ item.label }}</span><small>{{ item.hint }}</small></RouterLink>
        </nav>
        <nav class="rail-group" aria-labelledby="tools-nav-heading">
          <h2 id="tools-nav-heading">Event tools</h2>
          <RouterLink v-for="item in availableEventToolLinks" :key="item.suffix" class="rail-link" :to="'/organiser/events/' + workspace.event.id + '/' + item.suffix"><span>{{ item.label }}</span><small>{{ item.hint }}</small></RouterLink>
        </nav>
      </aside>
      <div class="workspace-main">
        <nav class="event-tool-nav" aria-label="Event operations">
          <RouterLink v-for="item in operationLinks" :key="item.id" :to="{ path: route.path, query: { ...route.query, tab: item.id }, hash: route.hash }" class="operation-link" :class="{ active: activeTab === item.id }" :aria-current="activeTab === item.id ? 'page' : undefined"><span>{{ item.label }}</span><small>{{ item.hint }}</small></RouterLink>
        </nav>
        <details class="mobile-tools">
          <summary><span>Event tools</span><small>RSVPs, check-in and venue</small></summary>
          <nav aria-label="Event tools">
            <RouterLink v-for="item in availableEventToolLinks" :key="item.suffix" class="mobile-tool-link" :to="'/organiser/events/' + workspace.event.id + '/' + item.suffix"><span>{{ item.label }}</span><small>{{ item.hint }}</small></RouterLink>
          </nav>
        </details>
        <div class="workspace-content">
    <div class="tool-feedback" aria-live="polite">
      <div v-if="errors[activeTab]" class="alert alert-danger" role="alert">{{ errors[activeTab] }} <button v-if="retries[activeTab]" type="button" class="btn btn-sm btn-outline-danger" :disabled="pending[activeTab]" @click="retries[activeTab]()">Retry save</button></div>
      <p v-if="pending[activeTab]" role="status" class="text-secondary">Saving…</p><p v-else-if="successes[activeTab]" role="status" class="text-success">{{ successes[activeTab] }}</p>
    </div>
    <TaskBoard v-show="activeTab === 'tasks'" :key="'tasks-' + workspace.event.id" :tasks="workspace.tasks" :pending="pending.tasks" :action-error="errors.tasks" @create="saveTask($event, 'create')" @update="saveTask($event, 'update')" @delete="saveTask($event, 'delete')" @save-board="saveBoard" @cancel-action="cancelDestructiveAction('tasks')" />
    <AnnouncementManager v-show="activeTab === 'announcements'" :key="'posts-' + workspace.event.id" :posts="workspace.announcements" :pending="pending.announcements" :action-error="errors.announcements" @create="saveAnnouncement($event, 'create')" @update="saveAnnouncement($event, 'update')" @delete="saveAnnouncement($event, 'delete')" @cancel-action="cancelDestructiveAction('announcements')" />
    <BudgetTracker v-show="activeTab === 'budget'" :key="'budget-' + workspace.event.id" :budget="workspace.budget" :pending="pending.budget" :action-error="errors.budget" @save-limit="saveLimit" @save-item="saveItem" @delete-item="deleteItem" @cancel-action="cancelDestructiveAction('budget')" />
    <WeatherTool v-show="activeTab === 'weather'" :key="'weather-' + workspace.event.id" :event="workspace.event" :forecast="forecast" :areas="areas" :area-override="workspace.forecastAreaOverride" :loading="weatherLoading" :pending="pending.weather" :action-error="errors.weather" :error="weatherError" :areas-error="areasError" @refresh="refreshWeather" @save-area="saveArea" @switch-venue="switchVenue" @cancel-action="cancelDestructiveAction('weather')" />
        </div>
      </div>
    </div>
  </template>
</template>

<style scoped>
.workspace-back { display: inline-flex; align-items: center; min-height: 44px; padding: 0 .5rem; color: var(--bookedz-muted); font-weight: 600; text-decoration: none; }
.workspace-back:hover, .workspace-public-link:hover { text-decoration: underline; }
.workspace-header { padding: clamp(1rem, 2vw, 1.4rem); margin-bottom: 1.25rem; border: 1px solid var(--bookedz-border); border-radius: 1rem; background: var(--bookedz-surface); box-shadow: var(--bookedz-card-shadow); }
.workspace-title-row { display: flex; flex-wrap: wrap; align-items: start; justify-content: space-between; gap: .5rem 1rem; }
.workspace-title-copy { min-width: 0; }
.workspace-eyebrow { margin: 0 0 .2rem; color: var(--bookedz-primary-dark); font-size: .75rem; font-weight: 700; }
.workspace-header h1 { margin: 0; color: var(--bookedz-ink); font-size: clamp(1.45rem, 2.5vw, 1.9rem); font-weight: 700; letter-spacing: -.04em; overflow-wrap: anywhere; }
.workspace-mode { display: inline-flex; align-items: center; min-height: 30px; padding: .25rem .65rem; border: 1px solid var(--bookedz-border); border-radius: 99px; background: var(--bookedz-glass-solid); color: var(--bookedz-muted); font-size: .75rem; font-weight: 650; white-space: nowrap; }
.workspace-context { display: flex; flex-wrap: wrap; align-items: center; gap: .45rem 1.4rem; margin-top: .7rem; color: var(--bookedz-ink); font-size: .88rem; }
.workspace-context > span { display: inline-flex; flex-wrap: wrap; align-items: baseline; gap: .3rem .5rem; min-width: 0; overflow-wrap: anywhere; }
.workspace-context strong { color: var(--bookedz-muted); font-size: .76rem; }
.workspace-context em { color: var(--bookedz-success); font-size: .74rem; font-style: normal; font-weight: 650; }
.workspace-address { color: var(--bookedz-muted); }
.workspace-address summary { min-height: 44px; display: flex; align-items: center; cursor: pointer; color: var(--bookedz-primary-dark); font-size: .84rem; font-weight: 600; }
.workspace-address p { max-width: 36rem; margin: .15rem 0 .4rem; color: var(--bookedz-muted); font-size: .84rem; overflow-wrap: anywhere; }
.workspace-header-links { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem 1rem; padding-top: .45rem; margin-top: .4rem; border-top: 1px solid var(--bookedz-border); }
.workspace-public-link { display: inline-flex; align-items: center; min-height: 44px; color: var(--bookedz-primary-dark); font-size: .86rem; font-weight: 650; text-decoration: none; }
.workspace-save-note { color: var(--bookedz-muted); font-size: .78rem; }
.workspace-layout { display: grid; grid-template-columns: 13.5rem minmax(0, 1fr); align-items: start; gap: 1.25rem; }
.workspace-rail { position: sticky; top: 1rem; display: grid; gap: 1.25rem; padding: .35rem 0; }
.rail-group { display: grid; gap: .25rem; }
.rail-group h2 { margin: 0 0 .25rem; padding: 0 .7rem; color: var(--bookedz-muted); font-size: .72rem; font-weight: 750; letter-spacing: .07em; text-transform: uppercase; }
.rail-link, .mobile-tool-link { display: grid; align-content: center; min-height: 48px; gap: .1rem; padding: .45rem .7rem; border-left: 3px solid transparent; border-radius: .4rem .7rem .7rem .4rem; color: var(--bookedz-ink); text-decoration: none; }
.rail-link span, .mobile-tool-link span, .operation-link span { font-size: .88rem; font-weight: 650; }
.rail-link small, .mobile-tool-link small, .operation-link small { color: var(--bookedz-muted); font-size: .72rem; }
.rail-link:hover, .mobile-tool-link:hover { background: var(--bookedz-glass-hover); color: var(--bookedz-ink); }
.rail-link.active { border-left-color: var(--bookedz-primary); background: var(--bookedz-glass-solid); color: var(--bookedz-primary-dark); }
.workspace-main { min-width: 0; }
.event-tool-nav { display: none; }
.mobile-tools { display: none; }
.workspace-content { min-width: 0; }
.operation-link:focus-visible, .rail-link:focus-visible, .mobile-tool-link:focus-visible, .mobile-tools summary:focus-visible, .workspace-public-link:focus-visible, .workspace-back:focus-visible { outline: 3px solid var(--bookedz-primary-dark); outline-offset: 2px; }
.tool-feedback:empty { display: none; }
.tool-feedback .alert { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .75rem; }
.tool-feedback .btn { min-height: 44px; }
:deep(.tool-heading) { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: start; gap: 1rem; padding: .2rem 0 1rem; margin-bottom: 1.25rem; border-bottom: 1px solid var(--bookedz-border); }
:deep(.tool-heading h2) { margin: 0; color: var(--bookedz-ink); font-size: clamp(1.45rem, 2.5vw, 1.8rem); font-weight: 700; letter-spacing: -.035em; }
:deep(.tool-description) { max-width: 44rem; margin: .35rem 0 0; color: var(--bookedz-muted); }
:deep(.tool-heading .btn) { min-height: 44px; }
:deep(.workspace-panel) { padding: clamp(1rem, 2vw, 1.35rem); border: 1px solid var(--bookedz-border); border-radius: 1rem; background: var(--bookedz-surface); box-shadow: var(--bookedz-card-shadow); }
:deep(.section-heading) { color: var(--bookedz-ink); font-weight: 700; }
@media (max-width: 991.98px) {
  .workspace-layout { display: block; }
  .workspace-rail { display: none; }
  .workspace-main { display: grid; gap: .75rem; }
  .event-tool-nav { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .35rem; padding: .35rem; border: 1px solid var(--bookedz-border); border-radius: .9rem; background: var(--bookedz-glass-solid); }
  .operation-link { display: grid; align-content: center; min-width: 0; min-height: 58px; gap: .1rem; padding: .45rem .55rem; border: 1px solid transparent; border-radius: .65rem; color: var(--bookedz-muted); text-decoration: none; }
  .operation-link:hover { background: var(--bookedz-glass-hover); color: var(--bookedz-ink); }
  .operation-link.active { border-color: var(--bookedz-border); background: var(--bookedz-surface); box-shadow: var(--bookedz-tab-shadow); color: var(--bookedz-primary-dark); }
  .operation-link small { font-size: .68rem; }
  .mobile-tools { display: block; border: 1px solid var(--bookedz-border); border-radius: .8rem; background: var(--bookedz-surface); }
  .mobile-tools summary { display: grid; align-content: center; min-height: 52px; padding: .35rem .8rem; cursor: pointer; color: var(--bookedz-ink); }
  .mobile-tools summary span { font-size: .88rem; font-weight: 700; }
  .mobile-tools summary small { color: var(--bookedz-muted); font-size: .73rem; }
  .mobile-tools nav { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); padding: .25rem .55rem .55rem; border-top: 1px solid var(--bookedz-border); }
  .mobile-tool-link { min-height: 52px; }
}
@media (max-width: 575.98px) {
  .workspace-context { align-items: flex-start; flex-direction: column; gap: .15rem; }
  .workspace-header-links { align-items: flex-start; flex-direction: column; }
  .event-tool-nav { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .operation-link { min-height: 54px; }
  .mobile-tools nav { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) { .operation-link { transition: none; } }
</style>
