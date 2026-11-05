<script setup>
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import EventArtwork from '../EventArtwork.vue';
import EventBookmark from '../EventBookmark.vue';
import { formatEventTime } from '../../utils/helpers.js';
import { savedEventState } from '../../utils/rsvpOverview.js';
// use the viewer’s registration status to choose the badge and action

const props = defineProps({
  event: {
    type: Object,
    required: true
  },
  rsvpStatus: {
    type: String,
    default: null
  },
  now: {
    type: Number,
    default: () => Date.now()
  },
  busy: Boolean,
  disabled: Boolean
});
defineEmits(['unsave']);

const state = computed(() => savedEventState(props.event, props.rsvpStatus, props.now));

const eventPath = computed(() => `/events/${props.event.id}/rsvp`);
</script>

<template>
  <article class="saved-event" :class="{ 'is-closed': state.ended }" :aria-busy="busy">
    <div class="saved-art" aria-hidden="true">
    <EventArtwork :category="event.tags?.[0]" /></div>
    <!-- show the registration status, availability or timing -->
    <span v-if="state.badge" class="saved-badge">{{ state.badge }}</span>
    <!-- use the bookmark to remove this event from saved -->
    <EventBookmark saved :pending="disabled" :event-title="event.title" @toggle="$emit('unsave', event.id)" />
    <div class="saved-copy">
      <h3 class="event-title">
      <RouterLink :to="eventPath">{{ event.title }}</RouterLink></h3>
      <p class="text-meta">{{ formatEventTime(event) }}</p>
      <p class="text-meta">{{ event.venue?.name || 'Venue to be confirmed' }}</p>
      <div class="saved-actions">
        <RouterLink
          class="btn"
          :class="state.action.primary ? 'btn-primary' : 'btn-outline-secondary'"
          :to="{ path: eventPath, hash: state.action.hash }"
          :aria-label="`${state.action.label}: ${event.title}`">{{ state.action.label }}</RouterLink>
      </div>
    </div>
  </article>
</template>

<style scoped>
.saved-event {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--bookedz-border);
  border-radius: 20px;
  background: var(--bookedz-surface);
}

.saved-art {
  height: 140px;
  background: var(--bookedz-hover);
}

.saved-art :deep(svg) {
  width: 100%;
  height: 100%;
}

.saved-copy {
  padding: 20px;
  min-width: 0;
}

h3 {
  margin: 0 0 10px;
}

h3 a {
  color: var(--bookedz-ink);
  text-decoration: none;
  overflow-wrap: anywhere;
}

p {
  font-size: var(--text-small);
  color: var(--bookedz-muted);
  margin: 6px 0;
  overflow-wrap: anywhere;
}

.saved-actions {
  display: flex;
  margin-top: 16px;
}

.saved-actions>* {
  flex: 1;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* leave space beside the badge for the bookmark button */

.saved-badge {
  position: absolute;
  top: 14px;
  left: 14px;
  z-index: 2;
  max-width: calc(100% - 84px);
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--bookedz-ink);
  color: var(--bookedz-surface);
  font-size: var(--text-caption);
  font-weight: 700;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

/* mute ended or cancelled events while keeping the text readable */

.is-closed .saved-art {
  filter: grayscale(.85);
  opacity: .55;
}

.is-closed .saved-badge {
  background: var(--bookedz-surface);
  color: var(--bookedz-muted);
  border: 1px solid var(--bookedz-border);
}

.is-closed h3 a {
  color: var(--bookedz-muted);
}
</style>
