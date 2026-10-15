<script setup>
import { ref, computed, onMounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { getOrganiserEvents, CURRENT_ORGANISER_ID } from '../utils/api.js'
import { formatEventTime } from '../utils/helpers.js'

// The organiser's list of events. (This may later merge into Denzel's organiser dashboard.)

const route = useRoute()

const events = ref([])
const loading = ref(true)
const errorMessage = ref('')

// After publishing, Create Event sends us here as /organiser/events?created=<id>
const justCreatedId = computed(() => route.query.created)

onMounted(async () => {
  try {
    events.value = await getOrganiserEvents(CURRENT_ORGANISER_ID)
  } catch (error) {
    errorMessage.value = 'Could not load your events: ' + error.message
  } finally {
    loading.value = false
  }
})

function fillPercent(event) {
  return Math.round(((event.confirmedCount + event.offeredCount) / event.capacity) * 100)
}
</script>

<template>
  <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
    <h1 class="h3 mb-0">My events</h1>
    <RouterLink to="/organiser/events/new" class="btn btn-primary">+ Create event</RouterLink>
  </div>

  <div v-if="justCreatedId" class="alert alert-success">
    Event published. Participants can now find it and RSVP.
  </div>

  <div v-if="loading" class="text-center my-5">
    <div class="spinner-border text-primary" role="status"></div>
  </div>

  <div v-else-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>

  <div v-else-if="events.length === 0" class="card card-body text-center text-secondary">
    You haven't created any events yet.
  </div>

  <div v-else class="row row-cols-1 row-cols-md-2 g-3">
    <div class="col" v-for="event in events" :key="event.id">
      <div class="card h-100 shadow-sm" :class="{ 'border-success': event.id === justCreatedId }">
        <div class="card-body">
          <h5 class="card-title mb-1">{{ event.title }}</h5>
          <p class="small text-secondary mb-3">
            {{ formatEventTime(event) }} · {{ event.venue.name }}
          </p>

          <div class="d-flex justify-content-between small mb-1">
            <span>{{ event.confirmedCount }} confirmed of {{ event.capacity }}</span>
            <span v-if="event.offeredCount > 0">{{ event.offeredCount }} offer(s) out</span>
          </div>
          <div class="progress mb-3" style="height: 8px">
            <div class="progress-bar bg-success" :style="{ width: fillPercent(event) + '%' }"></div>
          </div>

          <span v-if="event.pendingCount > 0" class="badge text-bg-secondary me-2">
            {{ event.pendingCount }} awaiting approval
          </span>
          <span v-if="event.waitlistCount > 0" class="badge text-bg-warning">
            {{ event.waitlistCount }} on waitlist
          </span>
        </div>
        <div class="card-footer bg-white d-flex gap-2">
          <RouterLink
            :to="'/organiser/events/' + event.id + '/rsvps'"
            class="btn btn-outline-primary btn-sm"
          >
            Manage RSVPs
          </RouterLink>
          <RouterLink :to="'/events/' + event.id + '/rsvp'" class="btn btn-link btn-sm">
            View RSVP page
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>
