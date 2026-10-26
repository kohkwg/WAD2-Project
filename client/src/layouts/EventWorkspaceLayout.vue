<script setup>
import { computed, onBeforeUnmount, provide, reactive, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import * as api from '../utils/api.js'
import { formatEventTime } from '../utils/helpers.js'

const route = useRoute()
const event = ref(null)
const loading = ref(false)
const error = ref('')
const mobileSections = ref(null)
const lastManageLocations = reactive({})
let requestEpoch = 0

const eventId = computed(() => String(route.params.id || route.params.eventId || ''))
const isManage = computed(() => route.path.endsWith('/manage'))
const savedManageLocation = computed(() => lastManageLocations[eventId.value] || {
  path: `/organiser/events/${encodeURIComponent(eventId.value)}/manage`, query: {}, hash: '',
})
const operationLinks = [
  { label: 'Tasks', suffix: 'manage?tab=tasks', query: true },
  { label: 'Announcements', suffix: 'manage?tab=announcements', query: true },
  { label: 'Budget', suffix: 'manage?tab=budget', query: true },
  { label: 'Weather', suffix: 'manage?tab=weather', query: true },
]
const eventTools = [
  { label: 'RSVPs', suffix: 'rsvps', alwaysAvailable: true },
  { label: 'Check-in', suffix: 'check-in' },
  { label: 'Venue QR', suffix: 'venue-qr' },
  { label: 'Attendance', suffix: 'attendance' },
  { label: 'Floor plan', suffix: 'floor-plan' },
]
const visibleTools = computed(() => eventTools.filter(item => item.alwaysAvailable || api.USING_SUPABASE))
const currentTitle = computed(() => isManage.value
  ? ({ tasks: 'Tasks', announcements: 'Announcements', budget: 'Budget', weather: 'Weather' }[route.query.tab] || 'Tasks')
  : route.meta.title || 'Event workspace')
const isWorkspaceHome = computed(() => isManage.value && (!route.query.tab || route.query.tab === 'tasks'))
const backToManage = computed(() => isManage.value
  ? { path: route.path, query: { ...route.query, tab: 'tasks' }, hash: '' }
  : savedManageLocation.value)
const operationTab = item => item.suffix.split('?tab=')[1]
const isOperationActive = item => route.path.endsWith('/manage')
  && (route.query.tab === operationTab(item) || (!route.query.tab && operationTab(item) === 'tasks'))
const isToolActive = item => route.path.endsWith('/' + item.suffix)
const routeHref = item => {
  const suffix = item.query ? 'manage' : item.suffix
  const remembered = savedManageLocation.value
  const query = item.query ? { ...remembered.query, tab: operationTab(item) } : { ...route.query }
  return { path: `/organiser/events/${encodeURIComponent(eventId.value)}/${suffix}`, query, hash: item.query ? remembered.hash : route.hash }
}
function closeMobileSections(event) {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return
  if (mobileSections.value) mobileSections.value.open = false
  mobileSections.value?.querySelector('summary')?.focus({ preventScroll: true })
}
watch(() => [eventId.value, route.path, route.query, route.hash], () => {
  if (isManage.value) lastManageLocations[eventId.value] = { path: route.path, query: { ...route.query }, hash: route.hash }
}, { immediate: true, flush: 'sync' })
provide('syncWorkspaceEvent', updatedEvent => {
  if (updatedEvent && String(updatedEvent.id) === eventId.value) event.value = updatedEvent
})

async function loadEvent() {
  const ticket = ++requestEpoch
  event.value = null
  error.value = ''
  if (!eventId.value) return
  loading.value = true
  try {
    const result = await api.getEvent(eventId.value)
    if (ticket === requestEpoch) event.value = result
  } catch (cause) {
    if (ticket === requestEpoch) error.value = cause?.message || 'Could not load event details.'
  } finally {
    if (ticket === requestEpoch) loading.value = false
  }
}

watch(eventId, loadEvent, { immediate: true })
onBeforeUnmount(() => { requestEpoch++ })
</script>

<template>
  <section class="event-workspace" aria-label="Event workspace">
    <RouterLink v-if="isWorkspaceHome" to="/organiser/events" class="workspace-back">← My events</RouterLink>
    <RouterLink v-else :to="backToManage" class="workspace-back">← Back to Manage event</RouterLink>

    <header class="workspace-header">
      <div class="workspace-heading-row">
        <div class="workspace-heading-copy">
          <p class="workspace-eyebrow">Event workspace <span aria-hidden="true">·</span> {{ currentTitle }}</p>
          <h1>{{ event?.title || (loading ? 'Loading event…' : 'Event workspace') }}</h1>
          <p v-if="event" class="workspace-summary">
            <span>{{ formatEventTime(event) }}</span>
            <span aria-hidden="true">·</span>
            <span>{{ event.venue?.name || 'Venue not set' }}<template v-if="event.usingBackup"> · Backup active</template></span>
          </p>
        </div>
        <RouterLink v-if="event" :to="`/events/${event.id}/rsvp`" class="workspace-public-link">Public event ↗</RouterLink>
      </div>
      <details v-if="event" class="workspace-details">
        <summary>Event details</summary>
        <p><strong>Venue address:</strong> {{ event.venue?.address || 'No address provided.' }}</p>
        <p><strong>Storage:</strong> {{ api.USING_SUPABASE ? 'Saved to your organiser account' : 'Saved in this browser' }}</p>
      </details>
    </header>

    <details ref="mobileSections" class="workspace-mobile-sections">
      <summary>Sections · {{ currentTitle }}</summary>
      <nav class="workspace-mobile-nav" aria-label="Event workspace sections">
        <section class="mobile-nav-group" aria-label="Operations">
          <h2>Operations</h2>
          <RouterLink v-for="item in operationLinks" :key="item.label" :to="routeHref(item)" :aria-current="isOperationActive(item) ? 'page' : undefined" @click="closeMobileSections">{{ item.label }}</RouterLink>
        </section>
        <section class="mobile-nav-group" aria-label="Event tools">
          <h2>Event tools</h2>
          <RouterLink v-for="item in visibleTools" :key="item.suffix" :to="routeHref(item)" :aria-current="isToolActive(item) ? 'page' : undefined" @click="closeMobileSections">{{ item.label }}</RouterLink>
        </section>
      </nav>
    </details>

    <div v-if="loading" class="workspace-loading" role="status">Loading event details…</div>
    <div v-if="error" class="alert alert-danger" role="alert">
      {{ error }} <button class="btn btn-sm btn-outline-danger" type="button" @click="loadEvent">Retry</button>
    </div>

    <div class="workspace-layout">
      <aside class="workspace-sidebar">
        <nav aria-label="Event workspace navigation">
          <section class="workspace-nav-group">
            <h2>Operations</h2>
            <RouterLink v-for="item in operationLinks" :key="item.label" :to="routeHref(item)" :class="{ active: isOperationActive(item) }" :aria-current="isOperationActive(item) ? 'page' : undefined">{{ item.label }}</RouterLink>
          </section>
          <section class="workspace-nav-group">
            <h2>Event tools</h2>
            <RouterLink v-for="item in visibleTools" :key="item.suffix" :to="routeHref(item)" :class="{ active: isToolActive(item) }" :aria-current="isToolActive(item) ? 'page' : undefined">{{ item.label }}</RouterLink>
          </section>
        </nav>
      </aside>
      <div class="workspace-main">
        <RouterView v-slot="{ Component }">
          <KeepAlive include="ManageEventView" :max="1">
            <component :is="Component" :key="eventId" />
          </KeepAlive>
        </RouterView>
      </div>
    </div>
  </section>
</template>

<style scoped>
.event-workspace { --workspace-line: var(--bookedz-border); --workspace-ink: var(--bookedz-ink); --workspace-muted: var(--bookedz-muted); }
.workspace-back { display: inline-flex; align-items: center; min-height: 44px; margin-bottom: .25rem; color: var(--workspace-muted); font-size: .86rem; font-weight: 650; text-decoration: none; }
.workspace-back:hover, .workspace-public-link:hover { text-decoration: underline; }
.workspace-header { padding: .95rem 1.1rem; margin-bottom: .9rem; border: 1px solid var(--workspace-line); border-radius: 1rem; background: var(--bookedz-surface); box-shadow: var(--bookedz-card-shadow); }
.workspace-heading-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .35rem 1rem; }
.workspace-heading-copy { min-width: 0; }
.workspace-eyebrow { margin: 0 0 .12rem; color: var(--bookedz-primary-dark); font-size: .7rem; font-weight: 700; }
.workspace-header h1 { margin: 0; color: var(--workspace-ink); font-size: clamp(1.25rem, 2vw, 1.65rem); font-weight: 720; letter-spacing: -.035em; overflow-wrap: anywhere; }
.workspace-summary { display: flex; flex-wrap: wrap; gap: .2rem .5rem; margin: .2rem 0 0; color: var(--workspace-muted); font-size: .82rem; }
.workspace-public-link { display: inline-flex; align-items: center; min-height: 44px; color: var(--bookedz-primary-dark); font-size: .82rem; font-weight: 650; text-decoration: none; white-space: nowrap; }
.workspace-details { margin-top: .3rem; color: var(--workspace-muted); font-size: .8rem; }
.workspace-details summary { display: inline-flex; align-items: center; min-height: 44px; cursor: pointer; color: var(--bookedz-primary-dark); font-weight: 650; }
.workspace-details p { margin: 0 0 .1rem; overflow-wrap: anywhere; }
.workspace-layout { display: grid; grid-template-columns: 11.5rem minmax(0, 1fr); align-items: start; gap: 1.1rem; }
.workspace-sidebar { position: sticky; top: 1rem; display: grid; gap: 1rem; padding-top: .3rem; }
.workspace-nav-group { display: grid; gap: .15rem; }
.workspace-nav-group h2 { margin: 0 0 .2rem; padding: 0 .65rem; color: var(--workspace-muted); font-size: .68rem; font-weight: 750; letter-spacing: .07em; text-transform: uppercase; }
.workspace-nav-group a { display: flex; align-items: center; min-height: 44px; padding: .35rem .65rem; border-left: 3px solid transparent; border-radius: .35rem .6rem .6rem .35rem; color: var(--workspace-ink); font-size: .84rem; font-weight: 630; text-decoration: none; }
.workspace-nav-group a:hover { background: var(--bookedz-glass-hover); }
.workspace-nav-group a.active { border-left-color: var(--bookedz-primary); background: var(--bookedz-glass-solid); color: var(--bookedz-primary-dark); }
.workspace-main { min-width: 0; }
.workspace-mobile-sections { display: none; }
.workspace-loading { padding: .5rem 0; color: var(--workspace-muted); font-size: .84rem; }
.workspace-back:focus-visible, .workspace-public-link:focus-visible, .workspace-details summary:focus-visible, .workspace-nav-group a:focus-visible, .workspace-mobile-sections summary:focus-visible, .workspace-mobile-nav a:focus-visible { outline: 3px solid var(--bookedz-primary-dark); outline-offset: 2px; }
@media (max-width: 900px) {
  .workspace-layout { display: block; }
  .workspace-sidebar { display: none; }
  .workspace-mobile-sections { display: block; margin-bottom: .75rem; border: 1px solid var(--workspace-line); border-radius: .8rem; background: var(--bookedz-glass-solid); }
  .workspace-mobile-sections > summary { display: flex; align-items: center; min-height: 44px; padding: .3rem .75rem; cursor: pointer; color: var(--workspace-ink); font-size: .82rem; font-weight: 700; }
  .workspace-mobile-nav { display: grid; gap: .75rem; padding: .2rem .65rem .7rem; border-top: 1px solid var(--workspace-line); }
  .mobile-nav-group { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .2rem; }
  .mobile-nav-group h2 { grid-column: 1 / -1; margin: .35rem 0 0; color: var(--workspace-muted); font-size: .67rem; font-weight: 750; letter-spacing: .06em; text-transform: uppercase; }
  .mobile-nav-group a { display: flex; align-items: center; min-height: 44px; padding: .3rem .5rem; border-radius: .5rem; color: var(--workspace-ink); font-size: .8rem; font-weight: 650; text-decoration: none; }
  .mobile-nav-group a[aria-current="page"] { background: var(--bookedz-surface); color: var(--bookedz-primary-dark); }
}
@media (max-width: 575.98px) {
  .workspace-header { padding: .8rem .9rem; }
  .workspace-heading-row { align-items: flex-start; }
  .workspace-summary { font-size: .76rem; }
}
</style>
