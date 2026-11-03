<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { getOrganiserEvents, deleteEvent } from '../utils/api.js'
import { formatEventTime } from '../utils/helpers.js'
import EventArtwork from '../components/EventArtwork.vue'
import ConfirmationDialog from '../components/event-operations/ConfirmationDialog.vue'

// The organiser's list of events. (This may later merge into Denzel's organiser dashboard.)

const route = useRoute()

const events = ref([])
const loading = ref(true)
const errorMessage = ref('')
const statusMessage = ref('')
const statusAlert = ref(null)
const deleting = ref(null) // the event whose "Delete this event?" pop-up is open
const deleteError = ref('') // shown inside the pop-up, which stays open for a retry
const busyId = ref(null)
// Cover URLs that failed to load; those cards fall back to the category artwork
const failedCovers = ref(new Set())

// After publishing, Create Event sends us here as /organiser/events?created=<id>
const justCreatedId = computed(() => route.query.created)
// After saving an edit, Edit event sends us here as ?updated=<id> (plus &announced=1 if it posted one)
const justUpdatedId = computed(() => route.query.updated)
// Events can be edited until they start
const isUpcoming = (event) => new Date(event.startTime).getTime() > Date.now()

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
  deleteError.value = ''
  statusMessage.value = ''
  try {
    await deleteEvent(eventId)
    deleting.value = null
    events.value = events.value.filter((event) => event.id !== eventId)
    statusMessage.value = 'Event deleted, including its RSVPs and organiser records.'
    // The card and its Delete button are gone, so keyboard focus moves to the outcome message
    await nextTick()
    statusAlert.value?.focus()
  } catch (error) {
    deleteError.value = error.message
  } finally {
    busyId.value = null
  }
}

function cancelDelete() {
  deleting.value = null
  deleteError.value = ''
}

// ---------- "More actions" (⋯) list on each card ----------

const moreFor = ref(null) // id of the card whose list is open
const moreToggles = new Map() // card id → its ⋯ button, to return focus to
function setMoreToggle(id, element) {
  if (element) moreToggles.set(id, element)
  else moreToggles.delete(id)
}
function toggleMore(id) {
  moreFor.value = moreFor.value === id ? null : id
}
function closeMore(restoreFocus = false) {
  const id = moreFor.value
  moreFor.value = null
  if (restoreFocus && id) moreToggles.get(id)?.focus()
}
// Tabbing or clicking away closes an open list
function leaveMore(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) moreFor.value = null
}
function closeOnOutsidePointer(event) {
  if (moreFor.value && !event.target.closest?.('.more-actions')) moreFor.value = null
}
onMounted(() => document.addEventListener('pointerdown', closeOnOutsidePointer))
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeOnOutsidePointer))

// Delete still asks in the pop-up; ⋯ takes focus first, so Cancel returns to it
function askDelete(event) {
  moreToggles.get(event.id)?.focus()
  moreFor.value = null
  deleting.value = event
}

function fillPercent(event) {
  return event.capacity > 0 ? Math.min(100, Math.round((event.confirmedCount / event.capacity) * 100)) : 0
}
</script>

<template>
  <header class="organiser-heading d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
    <div><p class="organiser-kicker mb-2">Your hosting space</p><h1 class="mb-1">My events</h1><p class="organiser-lede mb-0">Keep every gathering, guest list and detail in one place.</p></div>
    <RouterLink to="/organiser/events/new" class="btn btn-primary">Create event</RouterLink>
  </header>

  <div v-if="justCreatedId" class="alert alert-success">
    Event published. Participants can now find it and RSVP.
  </div>
  <div v-if="justUpdatedId" class="alert alert-success" role="status">
    Changes saved. {{ route.query.announced ? 'An announcement about them is now on the event page.' : 'No announcement was posted.' }}
  </div>
  <div v-if="statusMessage" ref="statusAlert" class="alert alert-success" role="status" tabindex="-1">{{ statusMessage }}</div>
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

  <div v-else class="row row-cols-1 row-cols-sm-2 row-cols-xl-3 g-3">
    <div class="col" v-for="event in events" :key="event.id">
      <article class="card organiser-event-card h-100" :class="{ 'border-success': event.id === justCreatedId }">
        <!-- One fixed 16:9 box for every cover: photos and the fallback artwork are both centre-cropped to fill it -->
        <div class="organiser-event-cover">
          <img v-if="event.coverImageUrl && !failedCovers.has(event.coverImageUrl)" :src="event.coverImageUrl" :alt="'Cover image for ' + event.title" loading="lazy" @error="failedCovers.add(event.coverImageUrl)" />
          <EventArtwork v-else :category="event.tags?.[0] || 'community'" />
        </div>

        <div class="card-body organiser-event-body">
          <div class="event-title-row">
            <h2 class="h5 card-title mb-1">{{ event.title }}</h2>
            <div v-if="event.id === justCreatedId" class="event-title-tools">
              <span class="status-pill status-pill--new">Just published</span>
            </div>
          </div>
          <p class="event-meta small text-secondary mb-3">
            <span>{{ formatEventTime(event) }}</span><span>{{ event.venue.name }}</span>
          </p>

          <div class="capacity-copy"><strong>{{ event.confirmedCount }}</strong><span>{{ event.capacity == null ? 'confirmed · no capacity limit' : `of ${event.capacity} confirmed` }}</span></div>
          <div v-if="event.capacity > 0" class="progress mb-3" role="progressbar" :aria-label="'Confirmed RSVPs for ' + event.title" :aria-valuenow="Math.min(event.confirmedCount, event.capacity)" aria-valuemin="0" :aria-valuemax="event.capacity">
            <div class="progress-bar bg-success" :style="{ width: fillPercent(event) + '%' }"></div>
          </div>

          <div class="event-statuses" aria-label="Registration status">
            <span v-if="event.offeredCount > 0" class="status-pill status-pill--offered">{{ event.offeredCount }} offers out</span>
            <span v-if="event.pendingCount > 0" class="status-pill status-pill--pending">{{ event.pendingCount }} awaiting approval</span>
            <span v-if="event.waitlistCount > 0" class="status-pill status-pill--waitlist">{{ event.waitlistCount }} on waitlist</span>
          </div>
        </div>
        <footer class="card-footer event-card-actions">
          <!-- A hangout's own page (Time, Plan, On the day) is where its host manages it -->
          <RouterLink v-if="event.kind === 'hangout'" :to="'/events/' + event.id + '/rsvp'" class="btn btn-primary btn-sm">Open hangout</RouterLink>
          <RouterLink v-else :to="'/organiser/events/' + event.id + '/manage?tab=tasks'" class="btn btn-primary btn-sm">Manage event</RouterLink>
          <RouterLink :to="'/organiser/events/' + event.id + '/rsvps'" class="btn btn-outline-primary btn-sm">
            <span class="visually-hidden">Manage </span>RSVPs<span class="visually-hidden"> for {{ event.title }}</span>
          </RouterLink>
          <!-- Less frequent actions sit behind ⋯ so each card shows three controls; Delete is last and red -->
          <div class="more-actions" @keydown.esc="closeMore(true)" @focusout="leaveMore">
            <button
              :ref="(element) => setMoreToggle(event.id, element)"
              type="button"
              class="btn btn-outline-secondary btn-sm more-toggle"
              :aria-expanded="moreFor === event.id"
              :aria-controls="'more-' + event.id"
              :aria-label="'More actions for ' + event.title"
              @click="toggleMore(event.id)"
            >
              <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="4" cy="10" r="1.8" /><circle cx="10" cy="10" r="1.8" /><circle cx="16" cy="10" r="1.8" /></svg>
            </button>
            <ul v-if="moreFor === event.id" :id="'more-' + event.id" class="more-menu">
              <!-- Editing is only offered until the event starts -->
              <li v-if="isUpcoming(event)"><RouterLink :to="'/organiser/events/' + event.id + '/edit'">Edit details</RouterLink></li>
              <li v-if="event.kind === 'hangout'"><RouterLink :to="'/organiser/events/' + event.id + '/manage?tab=tasks'">Event tools</RouterLink></li>
              <li v-else><RouterLink :to="'/events/' + event.id + '/rsvp'">View public page</RouterLink></li>
              <li class="more-menu-divider"><button type="button" class="more-menu-danger" @click="askDelete(event)">Delete event</button></li>
            </ul>
          </div>
        </footer>
      </article>
    </div>
  </div>

  <!-- Deleting asks in a pop-up, so the card's footer keeps its shape -->
  <ConfirmationDialog
    v-if="deleting"
    title="Delete this event?"
    confirm-label="Delete event"
    pending-label="Deleting…"
    :pending="busyId === deleting.id"
    :error="deleteError"
    @cancel="cancelDelete"
    @confirm="removeEvent(deleting.id)"
  >
    <p>“{{ deleting.title }}” will be deleted for everyone, including its RSVPs and organiser records.</p>
    <p v-if="deleting.confirmedCount > 0">{{ deleting.confirmedCount }} {{ deleting.confirmedCount === 1 ? 'person has' : 'people have' }} a confirmed place.</p>
    <p class="mb-0">This can’t be undone.</p>
  </ConfirmationDialog>
</template>

<style scoped>
.organiser-heading { padding: 1.5rem clamp(1rem, 3vw, 2rem); border-radius: 22px; background: var(--bookedz-mint, #dceee3); }
.organiser-heading h1 { color: var(--bookedz-ink, #292d32); font-size: clamp(1.7rem, 3vw, 2.35rem); font-weight: 700; letter-spacing: -.035em; }
.organiser-kicker { color: var(--bookedz-forest); font-size: .875rem; font-weight: 650; }
/* Grey text-secondary was 3.9:1 on the light mint heading; ink reads clearly in both themes */
.organiser-lede { color: var(--bookedz-ink); }
/* on-action is the coral button's text colour in both themes (white on peach failed in dark mode) */
.empty-events { max-width: 42rem; margin: 3rem auto; padding: clamp(2rem, 6vw, 4rem) 1.5rem; border: 1px dashed var(--bookedz-border, #e5ded2); border-radius: 24px; background: var(--bookedz-surface, #fffdfa); }
.empty-events-mark { display: grid; place-items: center; width: 3.5rem; height: 3.5rem; margin: 0 auto 1.25rem; border-radius: 50%; background: var(--bookedz-yellow, #f6cf77); color: var(--bookedz-ink); font-size: 1.8rem; }
.empty-events p { max-width: 30rem; margin: 0 auto 1.5rem; }
.organiser-event-card { overflow: hidden; border-color: var(--bookedz-border, #e5ded2); border-radius: 18px; box-shadow: var(--bookedz-shadow, 0 4px 18px rgb(41 45 50 / 5%)) !important; }
/* Fixed 16:9 box; the photo or artwork is absolutely positioned so it can never resize the box
   (the artwork used to stretch it to 3:2, making no-photo cards taller) */
.organiser-event-cover { position: relative; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; background: var(--bookedz-mint, #dceee3); }
.organiser-event-cover > img, .organiser-event-cover > :deep(.event-artwork) { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.organiser-event-body { display: flex; flex-direction: column; }
.event-title-row { display: flex; flex-wrap: wrap; align-items: start; justify-content: space-between; gap: .5rem; }
.event-title-row h2 { flex: 1 1 12rem; min-width: 0; overflow-wrap: anywhere; }
.event-title-tools { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem; }
.event-meta { display: grid; gap: .2rem; margin-top: .2rem; }
.capacity-copy { display: flex; align-items: baseline; gap: .35rem; margin-top: auto; color: var(--bookedz-muted, #63665e); font-size: .9rem; }
.capacity-copy strong { color: var(--bookedz-ink, #292d32); font-size: 1.15rem; font-variant-numeric: tabular-nums; }
.organiser-event-card .progress { height: .5rem; overflow: hidden; border-radius: 99px; background: var(--bookedz-hover); }
.organiser-event-card .progress-bar.bg-success { background: var(--bookedz-success) !important; }
.event-statuses { display: flex; flex-wrap: wrap; gap: .4rem; min-height: 1.25rem; }
/* Registration status pills use theme tokens (Bootstrap's text-bg-* colours ignore the dark theme) */
.status-pill { display: inline-flex; align-items: center; padding: .3rem .65rem; border: 1px solid var(--bookedz-border); border-radius: 999px; color: var(--bookedz-ink); font-size: .78rem; font-weight: 650; line-height: 1.2; }
.status-pill--offered { background: color-mix(in srgb, var(--bookedz-yellow) 40%, var(--bookedz-surface)); }
.status-pill--pending { background: color-mix(in srgb, var(--bookedz-primary) 20%, var(--bookedz-surface)); }
.status-pill--waitlist { background: color-mix(in srgb, var(--bookedz-mint) 45%, var(--bookedz-surface)); }
.status-pill--new { background: color-mix(in srgb, var(--bookedz-success) 22%, var(--bookedz-surface)); }
/* The footer follows the theme (bg-white stayed white in dark mode) */
.event-card-actions { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem; border-color: var(--bookedz-border, #e5ded2); background: var(--bookedz-surface); }
/* The ⋯ list opens upwards so the card's rounded, clipped edge never cuts it off */
.more-actions { position: relative; margin-left: auto; }
.more-toggle { width: 44px; padding: 0; }
.more-menu { position: absolute; right: 0; bottom: calc(100% + 6px); z-index: 5; min-width: 12rem; margin: 0; padding: .35rem; list-style: none; border: 1px solid var(--bookedz-border); border-radius: 14px; background: var(--bookedz-surface); box-shadow: var(--bookedz-preview-shadow); }
.more-menu a, .more-menu button { display: flex; align-items: center; width: 100%; min-height: 44px; padding: .5rem .75rem; border: 0; border-radius: 10px; background: transparent; color: var(--bookedz-ink); font-size: .9rem; font-weight: 600; text-align: left; text-decoration: none; }
.more-menu a:hover, .more-menu button:hover { background: var(--bookedz-hover); }
.more-menu-divider { margin-top: .3rem; padding-top: .3rem; border-top: 1px solid var(--bookedz-border); }
.more-menu .more-menu-danger { color: var(--bookedz-danger); }
/* Two columns on small tablets: the main action gets its own row so nothing squeezes */
@media (min-width: 576px) and (max-width: 767.98px) {
  .event-card-actions > .btn-primary { flex: 1 0 100%; }
  .event-card-actions > .btn-outline-primary { flex: 1 1 auto; }
}
@media (max-width: 575.98px) {
  .organiser-heading { align-items: stretch !important; }
  .organiser-heading :deep(.btn) { width: 100%; }
}
</style>
