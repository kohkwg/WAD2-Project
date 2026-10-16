<script setup>
import { ref, computed, useId, watch } from 'vue'
import { formatEventTime } from '../utils/helpers.js'

// Read-only card with an event's key details.
// Used on the RSVP page and the "Review" step of Create Event.
// Anything placed between <EventSummary> ... </EventSummary> appears at the bottom (the <slot>).
const props = defineProps({
  event: Object,
  headingTag: { type: String, default: 'h2', validator: value => ['h1', 'h2', 'h3'].includes(value) },
})

const showFullDescription = ref(false)
const descriptionId = useId()
watch(() => props.event?.id, () => { showFullDescription.value = false })
const SHORT_LENGTH = 160

const isLong = computed(() => (props.event.description || '').length > SHORT_LENGTH)
const descriptionToShow = computed(() => {
  const text = props.event.description || ''
  if (!isLong.value || showFullDescription.value) return text
  return text.slice(0, SHORT_LENGTH) + '…'
})
</script>

<template>
  <div class="card event-summary">
    <div class="card-body">
      <component :is="headingTag" class="card-title mb-2">{{ event.title || 'Untitled event' }}</component>
      <p class="text-secondary small mb-3">{{ formatEventTime(event) }}</p>

      <p class="mb-1">
        <strong>Venue:</strong> {{ event.venue ? event.venue.name : 'not set yet' }}
      </p>
      <p v-if="event.venue" class="small text-secondary mb-2">{{ event.venue.address }}</p>

      <p v-if="event.usingBackup" class="small mb-2 text-success">Backup venue is active.</p>

      <p v-else-if="event.isOutdoor && event.backupVenue" class="small mb-2">
        Outdoor event. Backup venue if rain is forecast:
        <strong>{{ event.backupVenue.name }}</strong>
      </p>

      <p class="mb-2"><strong>Capacity:</strong> {{ event.capacity }}</p>

      <div class="mb-2">
        <span v-for="tag in event.tags" :key="tag" class="badge text-bg-light border me-1">
          {{ tag }}
        </span>
      </div>

      <!-- Progressive disclosure: long descriptions start short with a "Show more" toggle -->
      <template v-if="event.description">
        <p :id="descriptionId" class="keep-line-breaks mt-3 mb-1">{{ descriptionToShow }}</p>
        <button
          v-if="isLong"
          type="button"
          class="btn btn-link btn-sm p-0"
          :aria-expanded="showFullDescription"
          :aria-controls="descriptionId"
          @click="showFullDescription = !showFullDescription"
        >
          {{ showFullDescription ? 'Show less' : 'Show more' }}
        </button>
      </template>

      <slot></slot>
    </div>
  </div>
</template>
