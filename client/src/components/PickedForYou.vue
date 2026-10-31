<script setup>
import { computed, ref } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import RecommendationCard from './RecommendationCard.vue'

const props = defineProps({
  events: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  personalized: { type: Boolean, default: false },
  fallback: { type: Boolean, default: false },
  collapsedCount: { type: Number, default: 3 },
  preferencePending: { type: Boolean, default: false },
  actionError: { type: String, default: '' },
  undoEvent: { type: Object, default: null },
  compact: { type: Boolean, default: false },
  filtered: { type: Boolean, default: false },
  otherPicks: { type: Boolean, default: false },
})

const emit = defineEmits([
  'retry', 'rsvp', 'waitlist', 'preference', 'other-picks',
])

const router = useRouter()
const showAll = ref(false)

const collapsedLimit = computed(() =>
  Math.max(1, Math.floor(props.collapsedCount) || 3)
)

// Preserve the existing featured-event selection and backend ranking.
const featured = computed(() => {
  if (props.events.some(event => event.source)) {
    return props.events[0] || null
  }

  const available = props.events.filter(event =>
    !event.is_full &&
    (event.spots_left == null || Number(event.spots_left) > 0)
  )

  return available.find(event =>
    event.reason_type === 'interest' ||
    (!event.reason_type &&
      /^Matches your interests/i.test(event.reason || ''))
  ) || available[0] || props.events[0] || null
})

const orderedEvents = computed(() => {
  if (!featured.value) return []

  return [
    featured.value,
    ...props.events.filter(event => event.id !== featured.value.id),
  ]
})

const visibleEvents = computed(() =>
  showAll.value
    ? orderedEvents.value
    : orderedEvents.value.slice(0, collapsedLimit.value)
)

const canToggle = computed(() =>
  props.events.length > collapsedLimit.value
)

function view(event) {
  router.push(`/events/${event.id}/rsvp`)
}
</script>

<template>
  <section
    class="picked-for-you"
    :class="{ 'picked-for-you--compact': compact }"
    aria-labelledby="picked-for-you-title"
    :aria-busy="loading"
  >
    <header class="picks-header">
      <h2 id="picked-for-you-title">Picked for you</h2>

      <button
        v-if="!loading && !error && canToggle"
        type="button"
        class="see-all"
        :aria-expanded="showAll"
        aria-controls="picked-for-you-cards"
        @click="showAll = !showAll"
      >
        {{ showAll ? 'Show less' : 'See all' }}
      </button>
    </header>

    <p v-if="actionError" class="alert alert-danger" role="alert">
      {{ actionError }}
    </p>

    <div v-if="undoEvent" class="alert alert-info" role="status">
      Hidden {{ undoEvent.title }}.
      <button
        id="undo-recommendation-dismiss"
        type="button"
        class="btn btn-outline-secondary btn-sm"
        :disabled="preferencePending"
        @click="emit('preference', {
          event: undoEvent,
          action: 'undo_dismiss'
        })"
      >
        Undo
      </button>
    </div>

    <p v-if="fallback" class="picks-note" role="status">
      Personalised picks couldn't load.
      Here are upcoming events to explore instead.
    </p>

    <p v-else-if="!personalized" class="picks-note">
      Explore upcoming events.
      Personalised picks are available when you're signed in.
    </p>

    <div v-if="filtered && !loading && !error" class="picks-context">
      <p v-if="otherPicks">
        These picks may be outside your current filters.
      </p>
      <p v-else-if="events.length">
        Picks matching your current filters.
      </p>
      <p v-else>
        No picks match your current filters.
        You can still explore your other picks.
      </p>

      <button
        type="button"
        class="see-all"
        :aria-pressed="otherPicks"
        @click="emit('other-picks')"
      >
        {{ otherPicks ? 'Show matching picks' : 'View all picks' }}
      </button>
    </div>

    <div v-if="loading" class="picks-loading" role="status">
      <span class="visually-hidden">Finding recommendations</span>
      <div
        v-for="i in 3"
        :key="i"
        class="pick-skeleton"
        aria-hidden="true"
      ></div>
    </div>

    <div v-else-if="error" class="picks-message" role="status">
      <p>{{ error }}</p>
      <button type="button" class="see-all" @click="emit('retry')">
        Try again
      </button>
    </div>

    <p
      v-else-if="!events.length && (!filtered || otherPicks)"
      class="picks-message"
    >
      No picks yet.
      <RouterLink v-if="personalized" to="/profile">
        Add your interests
      </RouterLink>
      <template v-else>Check back for upcoming events</template>
      to find your next event.
    </p>

    <div
      v-else-if="visibleEvents.length"
      id="picked-for-you-cards"
      class="picks-grid"
      :style="{ '--columns': Math.min(visibleEvents.length, 3) }"
    >
      <RecommendationCard
        v-for="event in visibleEvents"
        :key="event.id"
        :event="event"
        :preference-pending="preferencePending"
        @view="view"
        @preference="emit('preference', $event)"
        @rsvp="emit('rsvp', $event)"
        @waitlist="emit('waitlist', $event)"
      />
    </div>
  </section>
</template>

<style scoped>
.picked-for-you {
  margin: 30px 0 42px;
}

.picked-for-you--compact {
  margin: 0 0 28px;
}

.picks-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.picks-header h2 {
  margin: 0;
  font-family: var(--bookedz-heading);
  color: var(--bookedz-ink);
  font-size: 28px;
  letter-spacing: 0;
}

.see-all {
  min-height: 40px;
  padding: 7px 12px;
  border: 1px solid var(--bookedz-control-border);
  border-radius: 5px;
  background: var(--bookedz-surface);
  color: var(--bookedz-ink);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.see-all:hover {
  border-color: var(--bookedz-primary-dark);
  color: var(--bookedz-primary-dark);
}

.picks-note,
.picks-context p,
.picks-message {
  color: var(--bookedz-muted);
  font-size: 14px;
}

.picks-note {
  margin: 0 0 18px;
}

.picks-context {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 18px;
}

.picks-context p {
  margin: 0;
  flex: 1;
  min-width: 180px;
}

.picks-message {
  padding: 20px 0;
}

.picks-grid {
  display: grid;
  grid-template-columns: repeat(var(--columns), minmax(0, 440px));
  justify-content: center;
  align-items: stretch;
  gap: 24px;
}

.picks-grid :deep(.recommendation-card) {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  border-radius: 8px;
}

.picks-grid :deep(.pick-cover) {
  flex: none;
  width: 100%;
  height: 220px;
  min-height: 220px;
  border-radius: 0;
}

.picks-grid :deep(.pick-details) {
  display: flex;
  flex-direction: column;
  align-self: stretch;
  flex: 1;
  min-width: 0;
  padding: 20px;
}

.picks-grid :deep(.pick-title) {
  font-size: 20px;
  letter-spacing: 0;
}

.picks-grid :deep(.pick-title a) {
  min-height: 0;
}

.picks-grid :deep(.pick-source) {
  display: block;
  margin: 0 0 6px;
  font-size: 14px;
}

.picks-grid :deep(.pick-reason) {
  margin: 0 0 8px;
  font-size: 13px;
}

.picks-grid :deep(.pick-explanation) {
  margin-bottom: 8px;
}

.picks-grid :deep(.pick-description) {
  display: none;
}

.picks-grid :deep(.pick-spots) {
  align-self: flex-start;
}

.picks-grid :deep(.pick-actions) {
  margin-top: auto;
  padding-top: 14px;
}

.picks-grid :deep(.pick-preferences) {
  margin-top: 8px;
  flex-wrap: wrap;
}

.picks-loading {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 360px));
  gap: 20px;
}

.pick-skeleton {
  height: 340px;
  border-radius: 8px;
  background: var(--bookedz-border);
}

@media (max-width: 1000px) {
  .picks-grid,
  .picks-loading {
    grid-template-columns: repeat(2, minmax(0, 360px));
  }
}

@media (max-width: 600px) {
  .picks-grid,
  .picks-loading {
    grid-template-columns: minmax(0, 360px);
  }

  .picks-header h2 {
    font-size: 24px;
  }
}

.picked-for-you--compact .picks-grid {
  grid-template-columns: minmax(0, 360px);
}

.picked-for-you :deep(:focus-visible) {
  outline: 2px solid var(--bookedz-primary-dark);
  outline-offset: 3px;
}
</style>