<script setup>
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import EventArtwork from './EventArtwork.vue'

const props = defineProps({
  event: { type: Object, required: true },
  featured: { type: Boolean, default: false },
  preferencePending: { type: Boolean, default: false },
})
const emit = defineEmits(['view', 'rsvp', 'waitlist', 'preference'])
const optionsOpen = ref(false)
const failedCover = ref('')
const description = computed(() => props.event.description?.trim() || '')
const coverSource = computed(() => props.event.image_url || props.event.coverImageUrl || '')
const primaryCategory = computed(() => props.event.category || props.event.tags?.[0] || '')
const category = computed(() => (primaryCategory.value || 'Event').replace(/[_-]/g, ' '))
const matchScore = computed(() => Number.isFinite(props.event.compatibilityScore)
  ? Math.round(props.event.compatibilityScore) : null)
const venue = computed(() => props.event.venue_name || props.event.venue?.name
  || props.event.venue_address || props.event.venue?.address || 'Venue to be announced')
const startTime = computed(() => props.event.start_time || props.event.starts_at)
const dateLabel = computed(() => {
  const date = new Date(startTime.value)
  if (!Number.isFinite(date.getTime())) return 'Date to be announced'
  return new Intl.DateTimeFormat('en-SG', {
    timeZone: 'Asia/Singapore',
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }).format(date)
})
const isFull = computed(() => Boolean(props.event.is_full) ||
  (props.event.spots_left != null && Number(props.event.spots_left) <= 0))
const spotsLabel = computed(() => {
  if (isFull.value) return 'Full'
  const count = Number(props.event.spots_left)
  if (props.event.spots_left == null || !Number.isFinite(count)) return ''
  return `${count} ${count === 1 ? 'spot' : 'spots'} left`
})
const distanceLabel = computed(() => {
  const km = props.event.distance_km
  return typeof km === 'number' && Number.isFinite(km) && km >= 0
    ? `${km.toFixed(1)} km from you` : ''
})
const waitlistNote = computed(() => {
  const status = props.event.my_rsvp_status || props.event.registration_status
  if (status === 'waitlisted' && props.event.my_waitlist_priority)
    return `Your priority: ${props.event.my_waitlist_priority}`
  if (isFull.value && Number.isInteger(props.event.waitlist_count) &&
      props.event.waitlist_count >= 0)
    return `${props.event.waitlist_count} on the waitlist`
  return ''
})
function saveEvent() {
  if (props.preferencePending) return
  emit('preference', { event: props.event, action: props.event.saved ? 'unsave' : 'save' })
}
function dismissEvent() {
  if (props.preferencePending) return
  optionsOpen.value = false
  emit('preference', { event: props.event, action: 'dismiss' })
}
</script>

<template>
  <article class="recommendation-card"
    :class="{ 'recommendation-card--featured': featured }">
    <div class="pick-cover">
      <img v-if="coverSource && failedCover !== coverSource"
        :src="coverSource" :alt="`Cover for ${event.title}`"
        loading="lazy" @error="failedCover = coverSource">
      <EventArtwork v-else :category="primaryCategory" />
      <span class="pick-category">{{ category }}</span>
    </div>

    <div class="pick-details">
      <p v-if="event.source === 'general_discovery'" class="pick-source">
        General discovery
      </p>
      <p v-else-if="matchScore !== null" class="pick-source">
        {{ matchScore }}% match
      </p>
      <p class="pick-reason">{{ event.reason || 'Suggested for you' }}</p>

      <h3 class="pick-title">
        <RouterLink :to="`/events/${event.id}/rsvp`">{{ event.title }}</RouterLink>
      </h3>

      <details v-if="event.source" class="pick-explanation">
        <summary>Why this?</summary>
        <p v-if="event.source === 'personalised'">
          The match score measures topic fit, not your chance of attending.
        </p>
        <p v-else>This is an eligible upcoming event, not a personalised match.</p>
      </details>

      <p class="pick-date">
        <time :datetime="startTime">{{ dateLabel }}</time>
        <span v-if="featured && distanceLabel"> · {{ distanceLabel }}</span>
      </p>
      <p class="pick-venue">{{ venue }}</p>
      <p v-if="description" class="pick-description">{{ description }}</p>
      <p v-if="spotsLabel" class="pick-spots"
        :class="{ 'pick-spots--full': isFull }">{{ spotsLabel }}</p>

      <div class="pick-actions">
        <button type="button" class="btn event-cta"
          :aria-label="`View ${event.title}`" @click="emit('view', event)">
          View event
        </button>
        <button v-if="event.recommendation_actions" type="button"
          class="save-button" :disabled="preferencePending"
          :aria-pressed="Boolean(event.saved)"
          :aria-label="`${event.saved ? 'Unsave' : 'Save'} ${event.title}`"
          @click="saveEvent">
          {{ event.saved ? 'Saved' : 'Save' }}
        </button>
      </div>

      <p v-if="waitlistNote" class="pick-waitlist-note">{{ waitlistNote }}</p>

      <div v-if="event.recommendation_actions" class="pick-preferences"
        :aria-busy="preferencePending" @keydown.esc.stop="optionsOpen = false">
        <button type="button" class="options-button"
          :aria-expanded="optionsOpen" @click="optionsOpen = !optionsOpen">
          {{ optionsOpen ? 'Hide options' : 'More options' }}
        </button>
        <button v-if="optionsOpen" type="button" class="options-button"
          :disabled="preferencePending" @click="dismissEvent">
          Not interested
        </button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.recommendation-card {
  display: flex;
  align-items: stretch;
  gap: 16px;
  min-width: 0;
  height: 100%;
  padding: 16px;
  border: 1px solid var(--bookedz-border);
  border-radius: 8px;
  background: var(--bookedz-surface);
  color: var(--bookedz-ink);
}
.pick-cover {
  position: relative;
  flex: 0 0 96px;
  width: 96px;
  min-height: 120px;
  overflow: hidden;
  border-radius: 6px;
  background: var(--bookedz-canvas);
}
.pick-cover > img,
.pick-cover :deep(.event-artwork) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.pick-category {
  position: absolute;
  bottom: 10px;
  left: 10px;
  max-width: calc(100% - 20px);
  padding: 4px 8px;
  border-radius: 4px;
  background: var(--bookedz-surface);
  color: var(--bookedz-ink);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.pick-details { flex: 1; min-width: 0; }
.pick-source {
  margin: 0 0 6px;
  color: var(--bookedz-primary-dark);
  font-weight: 700;
}
.pick-reason {
  margin: 0 0 8px;
  color: var(--bookedz-muted);
  font-size: 14px;
  overflow-wrap: anywhere;
}
.pick-title {
  margin: 0 0 8px;
  font-family: var(--bookedz-heading);
  font-size: 22px;
  letter-spacing: 0;
  overflow-wrap: anywhere;
}
.pick-title a { color: inherit; text-decoration: none; }
.pick-title a:hover { text-decoration: underline; }
.pick-explanation { margin-bottom: 12px; color: var(--bookedz-muted); font-size: 14px; }
.pick-explanation summary { cursor: pointer; }
.pick-explanation p { margin: 8px 0; }
.pick-date, .pick-venue, .pick-waitlist-note {
  margin: 6px 0;
  color: var(--bookedz-muted);
  font-size: 14px;
  overflow-wrap: anywhere;
}
.pick-description {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
  margin: 8px 0;
  color: var(--bookedz-muted);
  font-size: 14px;
}
.pick-spots {
  display: inline-block;
  margin: 8px 0 0;
  padding: 4px 8px;
  border-radius: 4px;
  background: #e5f2e8;
  color: #315c3e;
  font-size: 13px;
}
.pick-spots--full { background: #fbebd9; color: #714a2d; }
.recommendation-card--featured { gap: 0; padding: 0; overflow: hidden; }
.recommendation-card--featured .pick-cover {
  flex-basis: 38%;
  width: 38%;
  min-height: 300px;
  border-radius: 0;
}
.recommendation-card--featured .pick-details { padding: 22px; }
.pick-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 16px; }
.pick-actions .event-cta { min-height: 44px; }
.save-button {
  min-height: 44px;
  padding: 9px 14px;
  border: 1px solid var(--bookedz-control-border);
  border-radius: 6px;
  background: var(--bookedz-surface);
  color: var(--bookedz-ink);
  font: inherit;
  cursor: pointer;
}
.save-button[aria-pressed="true"] {
  color: var(--bookedz-primary-dark);
  border-color: var(--bookedz-primary-dark);
  font-weight: 600;
}
.pick-preferences { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 10px; }
.options-button {
  padding: 6px 0;
  border: 0;
  background: transparent;
  color: var(--bookedz-muted);
  font: inherit;
  font-size: 13px;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}
button:disabled { opacity: .6; cursor: wait; }
button:focus-visible, a:focus-visible, summary:focus-visible {
  outline: 2px solid var(--bookedz-primary-dark);
  outline-offset: 3px;
}
@media (max-width: 767px) {
  .recommendation-card { flex-direction: column; gap: 0; padding: 0; overflow: hidden; }
  .pick-cover, .recommendation-card--featured .pick-cover {
    flex-basis: auto;
    width: 100%;
    height: 180px;
    min-height: 180px;
    border-radius: 0;
  }
  .pick-details, .recommendation-card--featured .pick-details { padding: 16px; }
}
</style>