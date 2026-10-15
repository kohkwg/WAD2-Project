<script setup>
import { ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { getEvents } from '../utils/api.js'
import { formatEventTime } from '../utils/helpers.js'

// PLACEHOLDER: a plain list so we can reach the RSVP page.
// Aishani's discovery page (search, filters, "For you") replaces this view.
// The only thing it needs from Feature 2 is a link to /events/<id>/rsvp.

const events = ref([])
const loading = ref(true)
const errorMessage = ref('')

onMounted(async () => {
  try {
    events.value = await getEvents()
  } catch (error) {
    errorMessage.value = 'Could not load events: ' + error.message
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <h1 class="h3">Events</h1>
  <p class="text-secondary small">Placeholder list (Aishani's discovery page goes here).</p>

  <div v-if="loading" class="text-center my-5">
    <div class="spinner-border text-primary" role="status"></div>
  </div>

  <div v-else-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>

  <div v-else class="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-3">
    <div class="col" v-for="event in events" :key="event.id">
      <div class="card h-100 shadow-sm">
        <div class="card-body">
          <h5 class="card-title">{{ event.title }}</h5>
          <p class="small text-secondary mb-2">{{ formatEventTime(event) }}</p>
          <p class="small mb-2">{{ event.venue.name }}</p>
          <span v-for="tag in event.tags" :key="tag" class="badge text-bg-light border me-1">
            {{ tag }}
          </span>
        </div>
        <div class="card-footer bg-white d-flex justify-content-between align-items-center">
          <span v-if="event.spotsLeft > 0" class="small text-success">
            {{ event.spotsLeft }} spot{{ event.spotsLeft === 1 ? '' : 's' }} left
          </span>
          <span v-else class="small text-warning-emphasis">Full: waitlist open</span>
          <RouterLink :to="'/events/' + event.id + '/rsvp'" class="btn btn-primary btn-sm">
            RSVP
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>
