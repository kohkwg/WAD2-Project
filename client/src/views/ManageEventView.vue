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
      <div class="workspace-overview">
        <div class="overview-item"><span class="overview-label">Event time</span><strong>{{ formatEventTime(workspace.event) }}</strong></div>
        <div class="overview-item"><span class="overview-label">Active venue</span><strong>{{ workspace.event.venue?.name || 'Venue not set' }}</strong><span v-if="workspace.event.usingBackup" class="workspace-mode workspace-mode--success">Backup active</span></div>
        <details class="workspace-address"><summary>Venue address</summary><p>{{ workspace.event.venue?.address }}</p></details>
      </div>
      <div class="workspace-link-groups">
        <div class="workspace-primary-links"><RouterLink class="btn event-cta" :to="'/organiser/events/' + workspace.event.id + '/rsvps'">Manage RSVPs</RouterLink><RouterLink class="btn btn-primary" :to="'/events/' + workspace.event.id + '/rsvp'">View public event</RouterLink><span class="workspace-save-note">{{ api.USING_SUPABASE ? 'Saved to your organiser account' : 'Saved in this browser' }}</span></div>
        <div v-if="api.USING_SUPABASE" class="workspace-quick-links" aria-label="More event tools">
          <span>Quick links</span><RouterLink :to="'/organiser/events/' + workspace.event.id + '/check-in'">Check-in station</RouterLink><RouterLink :to="'/organiser/events/' + workspace.event.id + '/venue-qr'">Venue QR</RouterLink><RouterLink :to="'/organiser/events/' + workspace.event.id + '/attendance'">Attendance</RouterLink>
        </div>
      </div>
    </header>
    <nav class="nav event-tool-nav mb-4" aria-label="Event tools"><RouterLink v-for="tab in tabs" :key="tab" :aria-label="tab[0].toUpperCase() + tab.slice(1)" :to="{ path: route.path, query: { ...route.query, tab } }" class="nav-link" :class="{ active: activeTab === tab }" :aria-current="activeTab === tab ? 'page' : undefined"><span class="tool-tab-label">{{ tab[0].toUpperCase() + tab.slice(1) }}</span><span class="tool-tab-hint">{{ { tasks: 'Plan the work', announcements: 'Tell attendees', budget: 'Track costs', weather: 'Venue plan' }[tab] }}</span></RouterLink></nav>
    <div class="tool-feedback" aria-live="polite">
      <div v-if="errors[activeTab]" class="alert alert-danger" role="alert">{{ errors[activeTab] }} <button v-if="retries[activeTab]" type="button" class="btn btn-sm btn-outline-danger" :disabled="pending[activeTab]" @click="retries[activeTab]()">Retry save</button></div>
      <p v-if="pending[activeTab]" role="status" class="text-secondary">Saving…</p><p v-else-if="successes[activeTab]" role="status" class="text-success">{{ successes[activeTab] }}</p>
    </div>
    <TaskBoard v-show="activeTab === 'tasks'" :key="'tasks-' + workspace.event.id" :tasks="workspace.tasks" :pending="pending.tasks" :action-error="errors.tasks" @create="saveTask($event, 'create')" @update="saveTask($event, 'update')" @delete="saveTask($event, 'delete')" @save-board="saveBoard" @cancel-action="cancelDestructiveAction('tasks')" />
    <AnnouncementManager v-show="activeTab === 'announcements'" :key="'posts-' + workspace.event.id" :posts="workspace.announcements" :pending="pending.announcements" :action-error="errors.announcements" @create="saveAnnouncement($event, 'create')" @update="saveAnnouncement($event, 'update')" @delete="saveAnnouncement($event, 'delete')" @cancel-action="cancelDestructiveAction('announcements')" />
    <BudgetTracker v-show="activeTab === 'budget'" :key="'budget-' + workspace.event.id" :budget="workspace.budget" :pending="pending.budget" :action-error="errors.budget" @save-limit="saveLimit" @save-item="saveItem" @delete-item="deleteItem" @cancel-action="cancelDestructiveAction('budget')" />
    <WeatherTool v-show="activeTab === 'weather'" :key="'weather-' + workspace.event.id" :event="workspace.event" :forecast="forecast" :areas="areas" :area-override="workspace.forecastAreaOverride" :loading="weatherLoading" :pending="pending.weather" :action-error="errors.weather" :error="weatherError" :areas-error="areasError" @refresh="refreshWeather" @save-area="saveArea" @switch-venue="switchVenue" @cancel-action="cancelDestructiveAction('weather')" />
  </template>
</template>

<style scoped>
.workspace-back { display: inline-flex; align-items: center; min-height: 44px; padding: 0 .5rem; color: var(--bookedz-muted); font-weight: 600; text-decoration: none; }
.workspace-header { padding: clamp(1.15rem, 3vw, 2rem); margin-bottom: 1.25rem; border: 1px solid var(--bookedz-border); border-radius: 1.25rem; background: var(--bookedz-surface); box-shadow: var(--bookedz-card-shadow); }
.workspace-title-row { display: flex; flex-wrap: wrap; align-items: start; justify-content: space-between; gap: .7rem 1rem; }
.workspace-title-copy { min-width: 0; }
.workspace-eyebrow { margin: 0 0 .35rem; color: var(--bookedz-primary-dark); font-size: .78rem; font-weight: 700; }
.workspace-header h1 { margin: 0; color: var(--bookedz-ink); font-size: clamp(1.55rem, 3vw, 2.2rem); font-weight: 700; letter-spacing: -.04em; overflow-wrap: anywhere; }
.workspace-mode { display: inline-flex; align-items: center; min-height: 30px; padding: .25rem .65rem; border: 1px solid var(--bookedz-border); border-radius: 99px; background: var(--bookedz-glass-solid); color: var(--bookedz-muted); font-size: .75rem; font-weight: 650; white-space: nowrap; }
.workspace-mode--success { border-color: var(--bookedz-success); color: var(--bookedz-success); }
.workspace-overview { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; gap: .75rem; margin-top: 1.25rem; }
.overview-item { display: grid; align-content: start; gap: .25rem; min-width: 0; padding: .8rem .9rem; border-radius: .85rem; background: var(--bookedz-glass-solid); }
.overview-label { color: var(--bookedz-muted); font-size: .74rem; font-weight: 650; }
.overview-item strong { color: var(--bookedz-ink); font-size: .9rem; overflow-wrap: anywhere; }
.workspace-address { align-self: stretch; display: flex; align-items: center; min-width: 8rem; padding: .65rem .8rem; border: 1px solid var(--bookedz-border); border-radius: .85rem; color: var(--bookedz-muted); }
.workspace-address[open] { display: block; }
.workspace-address summary { min-height: 44px; display: flex; align-items: center; cursor: pointer; color: var(--bookedz-primary-dark); font-size: .85rem; font-weight: 600; }
.workspace-address p { margin: .25rem 0; color: var(--bookedz-muted); font-size: .85rem; overflow-wrap: anywhere; }
.workspace-link-groups { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .75rem 1.25rem; padding-top: 1rem; margin-top: 1rem; border-top: 1px solid var(--bookedz-border); }
.workspace-primary-links, .workspace-quick-links { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem .9rem; }
.workspace-primary-links .btn { min-height: 44px; }
.workspace-save-note, .workspace-quick-links > span { color: var(--bookedz-muted); font-size: .8rem; }
.workspace-quick-links a { display: inline-flex; align-items: center; min-height: 44px; color: var(--bookedz-primary-dark); font-size: .84rem; font-weight: 600; text-decoration: none; }
.workspace-quick-links a:hover, .workspace-back:hover { text-decoration: underline; }
.event-tool-nav { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .5rem; max-width: none; padding: .45rem; border: 1px solid var(--bookedz-border); border-radius: 1rem; background: var(--bookedz-glass-solid); }
.event-tool-nav .nav-link { display: grid; align-content: center; min-height: 58px; gap: .1rem; padding: .55rem .7rem; border: 1px solid transparent; border-radius: .75rem; color: var(--bookedz-muted); text-align: left; text-decoration: none; transition: color .18s ease, background-color .18s ease, border-color .18s ease, transform .18s ease; }
.event-tool-nav .nav-link:hover { background: var(--bookedz-glass-hover); color: var(--bookedz-ink); }
.event-tool-nav .nav-link.active { border-color: var(--bookedz-border); background: var(--bookedz-surface); box-shadow: var(--bookedz-tab-shadow); color: var(--bookedz-primary-dark); transform: translateY(-1px); }
.tool-tab-label { font-size: .9rem; font-weight: 700; }
.tool-tab-hint { color: var(--bookedz-muted); font-size: .72rem; }
.event-tool-nav .nav-link.active .tool-tab-hint { color: var(--bookedz-muted); }
.tool-feedback:empty { display: none; }
.tool-feedback .alert { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .75rem; }
.tool-feedback .btn { min-height: 44px; }
:deep(.tool-heading) { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: start; gap: 1rem; padding: .2rem 0 1rem; margin-bottom: 1.25rem; border-bottom: 1px solid var(--bookedz-border); }
:deep(.tool-heading h2) { margin: 0; color: var(--bookedz-ink); font-size: clamp(1.45rem, 2.5vw, 1.8rem); font-weight: 700; letter-spacing: -.035em; }
:deep(.tool-description) { max-width: 44rem; margin: .35rem 0 0; color: var(--bookedz-muted); }
:deep(.tool-heading .btn) { min-height: 44px; }
:deep(.workspace-panel) { padding: clamp(1rem, 2vw, 1.35rem); border: 1px solid var(--bookedz-border); border-radius: 1rem; background: var(--bookedz-surface); box-shadow: var(--bookedz-card-shadow); }
:deep(.section-heading) { color: var(--bookedz-ink); font-weight: 700; }
@media (max-width: 767.98px) { .workspace-overview { grid-template-columns: 1fr 1fr; } .workspace-address { grid-column: 1 / -1; } .workspace-quick-links { width: 100%; } }
@media (max-width: 575.98px) { .workspace-overview { grid-template-columns: 1fr; } .workspace-address { grid-column: auto; } .workspace-link-groups { align-items: stretch; } .workspace-primary-links { align-items: stretch; } .workspace-primary-links .btn { width: 100%; } .event-tool-nav { grid-template-columns: repeat(2, minmax(0, 1fr)); } .event-tool-nav .nav-link { min-height: 54px; } }
@media (prefers-reduced-motion: reduce) { .event-tool-nav .nav-link { transition: none; } }
</style>
