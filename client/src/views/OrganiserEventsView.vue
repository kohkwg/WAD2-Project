<script setup>
import { ref, computed, onMounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { getOrganiserEvents, deleteEvent } from '../utils/api.js'
import { formatEventTime, fillColour } from '../utils/helpers.js'

// The organiser's list of events. (This may later merge into Denzel's organiser dashboard.)

const route = useRoute()

const events = ref([])
const loading = ref(true)
const errorMessage = ref('')

// After publishing, Create Event sends us here as /organiser/events?created=<id>
const justCreatedId = computed(() => route.query.created)

onMounted(async () => {
  try {
    events.value = await getOrganiserEvents() // the signed-in organiser's events
  } catch (error) {
    errorMessage.value = 'Could not load your events: ' + error.message
  } finally {
    loading.value = false
  }
})

function fillPercent(event) {
  return Math.round(((event.confirmedCount + event.offeredCount) / event.capacity) * 100)
}

const confirmDeleteId = ref(null) // which event is showing "Yes, delete / Keep"
const busyId = ref(null) // the event being deleted (its button is disabled)
const deleteError = ref('')

async function removeEvent(eventId) {
  busyId.value = eventId
  deleteError.value = ''
  try {
    await deleteEvent(eventId)
    events.value = events.value.filter((e) => e.id !== eventId) // take it off the list
  } catch (error) {
    deleteError.value = 'Could not delete the event: ' + error.message
  } finally {
    busyId.value = null
    confirmDeleteId.value = null
  }
}
</script>

<template>
  <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
    <h1 class="h3 mb-0">My events</h1>
    <RouterLink to="/organiser/events/new" class="btn btn-primary">+ Create event</RouterLink>
  </div>

  <!-- Shown after publishing: Create event redirects here with ?created=<id> -->
  <div v-if="justCreatedId" class="alert alert-success">
    Event published. Participants can now find it and RSVP.
  </div>

  <!-- Kept outside the v-if chain below, so a failed delete doesn't hide the list -->
  <div v-if="deleteError" class="alert alert-danger">{{ deleteError }}</div>

  <!-- Only ONE of these shows: loading → error → no events → event cards -->
  <div v-if="loading" class="text-center my-5">
    <div class="spinner-border text-primary" role="status"></div>
  </div>

  <div v-else-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>

  <div v-else-if="events.length === 0" class="card card-body text-center text-secondary">
    You haven't created any events yet.
  </div>

  <div v-else class="row row-cols-1 row-cols-md-2 g-3">
    <div class="col" v-for="event in events" :key="event.id">
      <!-- Class object: green border only on the event you just created -->
      <div class="card h-100 shadow-sm" :class="{ 'border-success': event.id === justCreatedId }">
        <div class="card-body">
          <h5 class="card-title mb-1">{{ event.title }}</h5>
          <p class="small text-secondary mb-3">
            {{ formatEventTime(event) }} · {{ event.venue.name }}
          </p>

          <div class="d-flex justify-content-between small mb-1">
            <span>{{ event.confirmedCount }} confirmed of {{ event.capacity }}</span>
            <!-- Only shown when at least one offer is waiting for a reply -->
            <span v-if="event.offeredCount > 0">{{ event.offeredCount }} offer(s) out</span>
          </div>
          <div class="progress mb-3" style="height: 8px">
            <!-- Bar width = % of capacity filled; colour goes green → amber → red as it fills (fillColour) -->
            <div
              class="progress-bar"
              :class="fillColour(fillPercent(event))"
              :style="{ width: fillPercent(event) + '%' }"
            ></div>
          </div>

          <!-- Badges only appear when their count is above 0 -->
          <span v-if="event.pendingCount > 0" class="badge text-bg-secondary me-2">
            {{ event.pendingCount }} awaiting approval
          </span>
          <span v-if="event.waitlistCount > 0" class="badge text-bg-warning">
            {{ event.waitlistCount }} on waitlist
          </span>
        </div>
        <div class="card-footer bg-white d-flex gap-2">
          <!-- Link is built from the event id, e.g. /organiser/events/abc123/rsvps -->
          <RouterLink
            :to="'/organiser/events/' + event.id + '/rsvps'"
            class="btn btn-outline-primary btn-sm"
          >
            Manage RSVPs
          </RouterLink>
          <RouterLink :to="'/events/' + event.id + '/rsvp'" class="btn btn-link btn-sm">
            View RSVP page
          </RouterLink>

          <!-- Delete with a second "are you sure?" step, like Cancel RSVP -->
          <div class="ms-auto">
            <template v-if="confirmDeleteId === event.id">
              <button
                type="button"
                class="btn btn-danger btn-sm me-1"
                :disabled="busyId === event.id"
                @click="removeEvent(event.id)"
              >
                Yes, delete
              </button>
              <button
                type="button"
                class="btn btn-outline-secondary btn-sm"
                @click="confirmDeleteId = null"
              >
                Keep
              </button>
            </template>
            <button
              v-else
              type="button"
              class="btn btn-outline-danger btn-sm"
              @click="confirmDeleteId = event.id"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
