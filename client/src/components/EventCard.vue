<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

const props = defineProps({
  event: { type: Object, required: true },
  showReason: { type: Boolean, default: false },
})

const dateLabel = computed(() =>
  new Date(props.event.start_time).toLocaleString('en-SG', {
    weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  }),
)

const isFull = computed(() => props.event.spots_left <= 0)
const lowSpots = computed(() => !isFull.value && props.event.spots_left <= 10)

// Progress bar only when the API gave us capacity and a confirmed count
const fillPercent = computed(() => {
  const { capacity, confirmed_count: confirmed } = props.event
  if (!capacity || confirmed == null) return null
  return Math.min(100, Math.round((confirmed / capacity) * 100))
})
</script>

<template>
  <div class="card h-100 shadow-sm event-card">
    <!-- optional cover image: falls back to a neutral block -->
    <img
      v-if="event.cover_image_url"
      :src="event.cover_image_url"
      :alt="`Cover image for ${event.title}`"
      class="card-img-top event-cover"
      loading="lazy"
    />
    <div v-else class="event-cover event-cover--empty d-flex align-items-center justify-content-center text-secondary">
      <span class="text-capitalize">{{ event.category || 'Event' }}</span>
    </div>

    <div class="card-body d-flex flex-column">
      <span v-if="showReason && event.reason" class="badge text-bg-primary align-self-start mb-2">
        {{ event.reason }}
      </span>

      <h3 class="h5 card-title fw-bold mb-1">{{ event.title }}</h3>
      <p class="small text-secondary mb-3">
        {{ dateLabel }}<template v-if="event.venue_name || event.venue_address"> · {{ event.venue_name || event.venue_address }}</template>
      </p>

      <div v-if="event.tags?.length" class="mb-3">
        <span v-for="tag in event.tags" :key="tag" class="badge rounded-pill text-bg-light border me-1">{{ tag }}</span>
      </div>

      <div class="mt-auto">
        <div class="d-flex justify-content-between align-items-center small mb-1">
          <span v-if="isFull" class="badge text-bg-warning">Full - join waitlist</span>
          <span v-else-if="lowSpots" class="badge text-bg-warning">Only {{ event.spots_left }} spots left</span>
          <span v-else class="text-secondary">{{ event.spots_left }} spots left</span>
        </div>
        <div v-if="fillPercent !== null" class="progress" style="height: 8px">
          <div
            class="progress-bar"
            :class="isFull || lowSpots ? 'bg-danger' : 'bg-success'"
            :style="{ width: fillPercent + '%' }"
          ></div>
        </div>
      </div>
    </div>

    <div class="card-footer bg-white">
      <!-- Route owned by Gregory (event detail / RSVP). Adjust name if different. -->
      <RouterLink :to="`/events/${event.id}`" class="btn btn-outline-primary btn-sm stretched-link">
        View / RSVP
      </RouterLink>
    </div>
  </div>
</template>

<style scoped>
.event-cover { height: 160px; object-fit: cover; }
.event-cover--empty { background: var(--bs-light); border-bottom: 1px solid var(--bs-border-color); }
</style>
