<script setup>
import { ref, computed, onMounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { getOrganiserEvents, deleteEvent } from '../utils/api.js'
import { formatEventTime } from '../utils/helpers.js'
import EventArtwork from '../components/EventArtwork.vue'
import { vOrganiserMotion } from '../utils/organiserMotion.js'

// The organiser's list of events. (This may later merge into Denzel's organiser dashboard.)

const route = useRoute()

const events = ref([])
const loading = ref(true)
const errorMessage = ref('')
const statusMessage = ref('')
const confirmDeleteId = ref(null)
const busyId = ref(null)

// After publishing, Create Event sends us here as /organiser/events?created=<id>
const justCreatedId = computed(() => route.query.created)

async function loadEvents() {
  loading.value = true
  errorMessage.value = ''
  try {
    events.value = await getOrganiserEvents()
  } catch (error) {
    errorMessage.value = 'Could not load your events: ' + error.message
  } finally {
    loading.value = false
  }
}
onMounted(loadEvents)

async function removeEvent(eventId) {
  if (busyId.value) return
  busyId.value = eventId
  errorMessage.value = ''
  statusMessage.value = ''
  try {
    await deleteEvent(eventId)
    confirmDeleteId.value = null
    events.value = events.value.filter((event) => event.id !== eventId)
    statusMessage.value = 'Event deleted, including its RSVPs and organiser records.'
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    busyId.value = null
  }
}

function fillPercent(event) {
  return event.capacity > 0 ? Math.min(100, Math.round((event.confirmedCount / event.capacity) * 100)) : 0
}
</script>

<template>
  <div v-organiser-motion>
  <header class="organiser-heading d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
    <div><p class="organiser-kicker mb-2">Your hosting space</p><h1 class="mb-1">My events</h1><p class="text-secondary mb-0">Keep every gathering, guest list and detail in one place.</p></div>
    <RouterLink to="/organiser/events/new" class="btn btn-primary">Create event</RouterLink>
  </header>

  <div v-if="justCreatedId" class="alert alert-success">
    Event published. Participants can now find it and RSVP.
  </div>
  <div v-if="statusMessage" class="alert alert-success" role="status">{{ statusMessage }}</div>
  <div v-if="errorMessage && events.length" class="alert alert-danger" role="alert">{{ errorMessage }}</div>

  <div v-if="loading" class="text-center my-5" role="status" aria-live="polite">
    <div class="spinner-border text-primary" aria-hidden="true"></div>
    <span class="visually-hidden">Loading your events…</span>
  </div>

  <div v-else-if="errorMessage" class="alert alert-danger" role="alert">
    {{ errorMessage }}
    <button type="button" class="btn btn-sm btn-outline-danger ms-2" @click="loadEvents">Retry loading events</button>
  </div>

  <div v-else-if="events.length === 0" class="empty-events text-center">
    <span class="empty-events-mark" aria-hidden="true">✳</span>
    <h2 class="h4">Your first event starts here</h2>
    <p class="text-secondary">Create a gathering and Bookedz will give you a home for its RSVPs and organiser tools.</p>
    <RouterLink to="/organiser/events/new" class="btn btn-primary">Create your first event</RouterLink>
  </div>

  <TransitionGroup v-else tag="div" name="organiser-list" class="row row-cols-1 row-cols-md-2 g-3">
    <div class="col" v-for="event in events" :key="event.id" data-organiser-enter>
      <article class="card organiser-event-card h-100" :class="{ 'border-success': event.id === justCreatedId }">
        <img v-if="event.coverImageUrl" class="organiser-event-cover" :src="event.coverImageUrl" :alt="'Cover image for ' + event.title" loading="lazy" />
        <div v-else class="organiser-event-cover organiser-event-cover--empty"><EventArtwork :category="event.tags?.[0] || 'community'" /></div>

        <div class="card-body organiser-event-body">
          <div class="event-title-row"><h2 class="h5 card-title mb-1">{{ event.title }}</h2><span v-if="event.id === justCreatedId" class="badge text-bg-success">Just published</span></div>
          <p class="event-meta small text-secondary mb-3">
            <span>{{ formatEventTime(event) }}</span><span>{{ event.venue.name }}</span>
          </p>

          <div class="capacity-copy"><strong>{{ event.confirmedCount }}</strong><span>{{ event.capacity == null ? 'confirmed · no capacity limit' : `of ${event.capacity} confirmed` }}</span></div>
          <div v-if="event.capacity > 0" class="progress mb-3" role="progressbar" :aria-label="'Confirmed RSVPs for ' + event.title" :aria-valuenow="Math.min(event.confirmedCount, event.capacity)" aria-valuemin="0" :aria-valuemax="event.capacity">
            <div class="progress-bar bg-success" :style="{ width: fillPercent(event) + '%' }"></div>
          </div>

          <div class="event-statuses" aria-label="Registration status">
            <span v-if="event.offeredCount > 0" class="badge text-bg-info">{{ event.offeredCount }} offers out</span>
            <span v-if="event.pendingCount > 0" class="badge text-bg-secondary">{{ event.pendingCount }} awaiting approval</span>
            <span v-if="event.waitlistCount > 0" class="badge text-bg-warning">{{ event.waitlistCount }} on waitlist</span>
          </div>
        </div>
        <footer class="card-footer bg-white event-card-actions">
          <div class="event-primary-actions">
            <RouterLink :to="'/organiser/events/' + event.id + '/manage?tab=tasks'" class="btn btn-primary btn-sm">Manage event</RouterLink>
            <RouterLink :to="'/events/' + event.id + '/rsvp'" class="btn btn-link btn-sm">View public page</RouterLink>
          </div>
          <div class="event-delete-action">
            <template v-if="confirmDeleteId === event.id">
              <button type="button" class="btn btn-danger btn-sm me-1" :disabled="busyId === event.id" @click="removeEvent(event.id)">Yes, delete event</button>
              <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="busyId === event.id" @click="confirmDeleteId = null">Keep event</button>
            </template>
            <button v-else type="button" class="btn btn-outline-danger btn-sm" @click="confirmDeleteId = event.id">Delete event</button>
          </div>
        </footer>
      </article>
    </div>
  </TransitionGroup>
  </div>
</template>

<style scoped>
.organiser-heading { padding: 1.5rem clamp(1rem, 3vw, 2rem); border-radius: 22px; background: var(--bookedz-mint, #dceee3); }
.organiser-heading h1 { color: var(--bookedz-ink, #292d32); font-size: clamp(1.7rem, 3vw, 2.35rem); font-weight: 700; letter-spacing: -.035em; }
.organiser-kicker { color: #385b49; font-size: .875rem; font-weight: 650; }
.organiser-heading :deep(.btn-primary), .empty-events :deep(.btn-primary) { background: var(--bookedz-primary-dark, #aa3e2c); border-color: var(--bookedz-primary-dark, #aa3e2c); color: #fff; }
.organiser-heading :deep(.btn-primary):hover, .empty-events :deep(.btn-primary):hover { background: #873020; border-color: #873020; }
.empty-events { max-width: 42rem; margin: 3rem auto; padding: clamp(2rem, 6vw, 4rem) 1.5rem; border: 1px dashed var(--bookedz-border, #e5ded2); border-radius: 24px; background: var(--bookedz-surface, #fffdfa); }
.empty-events-mark { display: grid; place-items: center; width: 3.5rem; height: 3.5rem; margin: 0 auto 1.25rem; border-radius: 50%; background: var(--bookedz-yellow, #f6cf77); color: #44371a; font-size: 1.8rem; }
.empty-events p { max-width: 30rem; margin: 0 auto 1.5rem; }
.organiser-event-card { overflow: hidden; border-color: var(--bookedz-border, #e5ded2); border-radius: 18px; box-shadow: var(--bookedz-shadow, 0 4px 18px rgb(41 45 50 / 5%)) !important; }
.organiser-event-cover { display: block; width: 100%; aspect-ratio: 16 / 7; object-fit: cover; background: var(--bookedz-mint, #dceee3); }
.organiser-event-cover--empty { display: grid; place-items: center; color: #385b49; font-size: .9rem; font-weight: 650; }
.organiser-event-body { display: flex; flex-direction: column; }
.event-title-row { display: flex; flex-wrap: wrap; align-items: start; justify-content: space-between; gap: .5rem; }
.event-meta { display: grid; gap: .2rem; margin-top: .2rem; }
.capacity-copy { display: flex; align-items: baseline; gap: .35rem; margin-top: auto; color: var(--bookedz-muted, #63665e); font-size: .9rem; }
.capacity-copy strong { color: var(--bookedz-ink, #292d32); font-size: 1.15rem; font-variant-numeric: tabular-nums; }
.organiser-event-card .progress { height: .5rem; overflow: hidden; border-radius: 99px; background: #eee9df; }
.organiser-event-card .progress-bar.bg-success { background: #56896a !important; }
.event-statuses { display: flex; flex-wrap: wrap; gap: .4rem; min-height: 1.25rem; }
.event-card-actions { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: .75rem; border-color: var(--bookedz-border, #e5ded2); }
.event-primary-actions { display: flex; flex-wrap: wrap; align-items: center; gap: .45rem; }
.event-primary-actions :deep(.btn-primary) { background: var(--bookedz-primary-dark, #aa3e2c); border-color: var(--bookedz-primary-dark, #aa3e2c); color: #fff; }
.event-delete-action { margin-left: auto; }
@media (max-width: 575.98px) {
  .organiser-heading { align-items: stretch !important; }
  .organiser-heading :deep(.btn) { width: 100%; }
  .event-card-actions { align-items: stretch; }
  .event-primary-actions { display: grid; grid-template-columns: 1fr 1fr; }
  .event-primary-actions :deep(.btn:first-child) { grid-column: 1 / -1; }
  .event-delete-action { margin-left: 0; }
}
.organiser-event-cover--empty :deep(svg) { width: 100%; height: 100%; object-fit: cover; }
</style>
