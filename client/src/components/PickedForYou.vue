<script setup>
import { computed, ref } from 'vue';
import { useRouter, RouterLink } from 'vue-router';
import RecommendationCard from './RecommendationCard.vue';

const props = defineProps({
  events: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  },
  error: {
    type: String,
    default: ''
  },
  personalized: {
    type: Boolean,
    default: false
  },
  fallback: {
    type: Boolean,
    default: false
  },
  collapsedCount: {
    type: Number,
    default: 3
  },
  preferencePending: {
    type: Boolean,
    default: false
  },
  actionError: {
    type: String,
    default: ''
  },
  undoEvent: {
    type: Object,
    default: null
  },
  compact: {
    type: Boolean,
    default: false
  },
  strip: {
    type: Boolean,
    default: false
  },
  filtered: {
    type: Boolean,
    default: false
  },
  otherPicks: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['retry', 'rsvp', 'waitlist', 'preference', 'other-picks']);

const router = useRouter();

const showAll = ref(false);

const collapsedLimit = computed(() => Math.max(1, Math.floor(props.collapsedCount) || 3));

// preserve the existing featured-event selection and backend ranking.

const featured = computed(() => {
  if (props.events.some(event => event.source)) {
    return props.events[0] || null;
  }
  const available = props.events.filter(event => !event.is_full && (event.spots_left == null || Number(event.spots_left) > 0));
  return available.find(event => event.reason_type === 'interest' || !event.reason_type && /^Matches your interests/i.test(event.reason || '')) || available[0] || props.events[0] || null;
});

const orderedEvents = computed(() => {
  if (!featured.value) return [];
  return [featured.value, ...props.events.filter(event => event.id !== featured.value.id)];
});

const visibleEvents = computed(() => showAll.value ? orderedEvents.value : orderedEvents.value.slice(0, collapsedLimit.value));

const canToggle = computed(() => props.events.length > collapsedLimit.value);

function view(event) {
  router.push(`/events/${event.id}/rsvp`);
}
</script>

<template>
  <section
    class="picked-for-you"
    :class="{ 'picked-for-you--compact': compact, 'picked-for-you--strip': strip }"
    aria-labelledby="picked-for-you-title"
    :aria-busy="loading"
  >
    <header class="picks-header">
      <p v-if="strip" class="picks-eyebrow">{{ personalized ? 'Ranked for you' : 'Up next' }}</p>
      <h2 id="picked-for-you-title" class="section-title" tabindex="-1">Picked for you</h2>

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

    <p v-if="strip && personalized" class="picks-note">Based on your interests and activity.</p>

    <p v-dismissible v-if="actionError" class="alert alert-danger" role="alert">
      {{ actionError }}
    </p>

    <div v-dismissible v-if="undoEvent" class="alert alert-info" role="status">
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
      {{ strip ? 'Upcoming events to explore. Sign in for personalised picks.' : "Explore upcoming events. Personalised picks are available when you’re signed in." }}
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

    <div v-dismissible v-else-if="error" class="picks-message" role="status">
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
        :strip="strip"
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
  color: var(--bookedz-ink);
}

.see-all {
  min-height: 40px;
  padding: 7px 12px;
  border: 1px solid var(--bookedz-control-border);
  border-radius: 5px;
  background: var(--bookedz-surface);
  color: var(--bookedz-ink);
  font-family: var(--bookedz-body);
  font-weight: 600;
  font-size: var(--text-button);
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
  font-size: var(--text-small);
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

.picks-grid :deep(.pick-title a) {
  min-height: 0;
}

.picks-grid :deep(.pick-source) {
  display: block;
  margin: 0 0 6px;
  font-size: var(--text-small);
}

.picks-grid :deep(.pick-reason) {
  margin: 0 0 8px;
  font-size: var(--text-small);
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
}

.picked-for-you--compact .picks-grid {
  grid-template-columns: minmax(0, 360px);
}

.picked-for-you :deep(:focus-visible) {
  outline: 2px solid var(--bookedz-primary-dark);
  outline-offset: 3px;
}

/* compact ranked strip: display only; featured selection and server order above
   are unchanged. preference actions and explanations remain available. */

.picked-for-you--strip {
  display: grid;
  grid-template-columns: 156px minmax(0,1fr);
  gap: 0 14px;
  align-items: start;
  padding: 14px;
  margin: 0;
  border: 1px solid var(--bookedz-primary);
  border-radius: 15px;
  background: var(--bookedz-glass-active);
}

.picked-for-you--strip .picks-header {
  grid-column: 1;
  grid-row: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  margin: 4px 0 0;
}

.picked-for-you--strip .picks-header h2 {
  font-size: 20px;
  line-height: 1.15;
}

.picks-eyebrow {
  margin: 0;
  color: var(--bookedz-primary-dark);
  font-size: 11px;
  font-weight: 700;
}

.picked-for-you--strip .see-all {
  min-height: 36px;
  padding: 4px 0;
  border: 0;
  background: transparent;
  font-size: 12px;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.picked-for-you--strip .picks-note {
  grid-column: 1;
  grid-row: 2;
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
}

.picked-for-you--strip .picks-grid {
  grid-column: 2;
  grid-row: 1 / span 4;
  grid-template-columns: repeat(var(--columns), minmax(0,1fr));
  gap: 10px;
  align-self: stretch;
}

.picked-for-you--strip .picks-context {
  grid-column: 1;
  grid-row: 3;
  margin: 8px 0 0;
  gap: 2px;
}

.picked-for-you--strip .picks-context p {
  min-width: 0;
  font-size: 12px;
}

.picked-for-you--strip .picks-loading {
  grid-column: 2;
  grid-row: 1 / span 4;
  grid-template-columns: repeat(3,minmax(0,1fr));
}

.picked-for-you--strip .pick-skeleton {
  height: 145px;
}

.picked-for-you--strip .picks-message,.picked-for-you--strip > .alert {
  grid-column: 2;
  padding: 10px;
  margin: 0 0 8px;
  font-size: 12px;
}

.picked-for-you--strip .picks-grid :deep(.recommendation-card) {
  border: 0;
  border-radius: 11px;
  overflow: visible;
}

.picked-for-you--strip .picks-grid :deep(.pick-details) {
  padding: 12px;
}

@media(max-width:1199px) {
  .picked-for-you--strip {
    grid-template-columns: 128px minmax(0,1fr);
    gap: 0 10px;
  }
  .picked-for-you--strip .picks-grid {
    grid-template-columns: repeat(2,minmax(0,1fr));
  }
}

@media(max-width:767px) {
  .picked-for-you--strip {
    display: block;
    padding: 12px;
  }
  .picked-for-you--strip .picks-header {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    margin: 0;
  }
  .picked-for-you--strip .picks-eyebrow {
    width: 100%;
  }
  .picked-for-you--strip .picks-note {
    margin: 6px 0 12px;
  }
  .picked-for-you--strip .picks-grid {
    grid-template-columns: minmax(0,1fr);
    gap: 8px;
  }
  .picked-for-you--strip .picks-loading {
    grid-template-columns: minmax(0,1fr);
  }
  .picked-for-you--strip .picks-context {
    margin-bottom: 10px;
  }
}
</style>