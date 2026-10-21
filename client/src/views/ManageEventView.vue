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
  mutate('tasks', action, id => mode === 'create' ? api.createTask(id, action.input) : mode === 'update' ? api.updateTask(id, action.id, action.input) : api.deleteTask(id, action.id), result => {
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
  mutate('announcements', action, id => mode === 'create' ? api.createAnnouncement(id, action.body) : mode === 'update' ? api.updateAnnouncement(id, action.id, action.body) : api.deleteAnnouncement(id, action.id), result => {
    workspace.value.announcements = mode === 'delete' ? workspace.value.announcements.filter(post => post.id !== action.id) : mode === 'create' ? [result, ...workspace.value.announcements] : workspace.value.announcements.map(post => post.id === result.id ? result : post)
  }, mode === 'delete' ? 'Announcement deleted.' : 'Announcement saved.')
}
function saveLimit(action) { mutate('budget', action, id => api.saveBudgetLimit(id, action.input), () => { workspace.value.budget.limitCents = action.input }, 'Budget limit saved.') }
function saveItem(action) { mutate('budget', action, id => api.saveBudgetItem(id, action.input), item => { workspace.value.budget.items = action.input.id ? workspace.value.budget.items.map(row => row.id === item.id ? item : row) : [...workspace.value.budget.items, item] }, 'Expense saved.') }
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
  <RouterLink to="/organiser/events" class="small">← My events</RouterLink>
  <p v-if="loading" class="my-5 text-center" role="status">Loading event workspace…</p>
  <div v-else-if="loadError" class="alert alert-danger mt-3" role="alert">{{ loadError }} <button type="button" class="btn btn-sm btn-outline-danger" @click="load">Retry event</button></div>
  <div v-else-if="workspace && !isOwner" class="alert alert-danger mt-3" role="alert">Only this event’s organiser can manage its tasks, announcements, budget, and weather plan.</div>
  <template v-else-if="workspace">
    <header class="workspace-header mt-3">
      <div class="d-flex flex-wrap align-items-center gap-2 mb-2"><h1 class="mb-0">{{ workspace.event.title }}</h1><span class="badge text-bg-light border">Demo workspace</span></div>
      <p class="text-secondary mb-1">{{ formatEventTime(workspace.event) }}</p>
      <p class="workspace-venue"><span>Active venue</span><strong>{{ workspace.event.venue?.name }}</strong><span v-if="workspace.event.usingBackup" class="badge text-bg-success ms-2">Backup active</span></p>
      <details class="workspace-address mb-2"><summary>Venue address</summary><p>{{ workspace.event.venue?.address }}</p></details>
      <div class="workspace-meta"><span>Saved in this browser</span><RouterLink :to="'/events/' + workspace.event.id + '/rsvp'">View public event page</RouterLink></div>
    </header>
    <nav class="nav event-tool-nav mb-4" aria-label="Event tools"><RouterLink v-for="tab in tabs" :key="tab" :to="{ path: route.path, query: { ...route.query, tab } }" class="nav-link" :class="{ active: activeTab === tab }" :aria-current="activeTab === tab ? 'page' : undefined">{{ tab[0].toUpperCase() + tab.slice(1) }}</RouterLink></nav>
    <div v-if="errors[activeTab]" class="alert alert-danger" role="alert">{{ errors[activeTab] }} <button v-if="retries[activeTab]" type="button" class="btn btn-sm btn-outline-danger" :disabled="pending[activeTab]" @click="retries[activeTab]()">Retry save</button></div>
    <p v-if="pending[activeTab]" role="status" class="text-secondary">Saving…</p><p v-else-if="successes[activeTab]" role="status" class="text-success">{{ successes[activeTab] }}</p>
    <TaskBoard v-show="activeTab === 'tasks'" :key="'tasks-' + workspace.event.id" :tasks="workspace.tasks" :pending="pending.tasks" :action-error="errors.tasks" @create="saveTask($event, 'create')" @update="saveTask($event, 'update')" @delete="saveTask($event, 'delete')" @save-board="saveBoard" @cancel-action="cancelDestructiveAction('tasks')" />
    <AnnouncementManager v-show="activeTab === 'announcements'" :key="'posts-' + workspace.event.id" :posts="workspace.announcements" :pending="pending.announcements" :action-error="errors.announcements" @create="saveAnnouncement($event, 'create')" @update="saveAnnouncement($event, 'update')" @delete="saveAnnouncement($event, 'delete')" @cancel-action="cancelDestructiveAction('announcements')" />
    <BudgetTracker v-show="activeTab === 'budget'" :key="'budget-' + workspace.event.id" :budget="workspace.budget" :pending="pending.budget" :action-error="errors.budget" @save-limit="saveLimit" @save-item="saveItem" @delete-item="deleteItem" @cancel-action="cancelDestructiveAction('budget')" />
    <WeatherTool v-show="activeTab === 'weather'" :key="'weather-' + workspace.event.id" :event="workspace.event" :forecast="forecast" :areas="areas" :area-override="workspace.forecastAreaOverride" :loading="weatherLoading" :pending="pending.weather" :action-error="errors.weather" :error="weatherError" :areas-error="areasError" @refresh="refreshWeather" @save-area="saveArea" @switch-venue="switchVenue" @cancel-action="cancelDestructiveAction('weather')" />
  </template>
</template>
