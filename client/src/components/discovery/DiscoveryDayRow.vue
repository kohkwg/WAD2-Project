<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import DiscoveryEventRow from './DiscoveryEventRow.vue'
// Show each day's events in a scrollable row.
// "See more" expands them into a grid.
const props = defineProps({
  group: { type: Object, required: true },
  recommendationById: { type: Object, required: true },
  selectedEventId: { type: [String, Number], default: null },
  bookmarkEnabled: Boolean,
  preferencePending: Boolean,
})
const emit = defineEmits(['select', 'preference'])
const expanded = ref(false)
const rowRoot = ref(null)
const ariaLabel = computed(() => {
  return `${props.group.label}, ${props.group.weekday} ${props.group.year}`
})
const dateLabel = computed(() => {
  const { label, year } = props.group
  return year ? `${label}, ${year}` : label
})
const countLabel = computed(() => {
  const count = props.group.events.length
  return `${count} ${count === 1 ? 'event' : 'events'}`
})
// Arrow when closed, cross when open.
const moreIconPath = computed(() => {
  return expanded.value ? 'M6 6l12 12M18 6 6 18' : 'm6 9 6 6 6-6'
})
function toggle() {
  expanded.value = !expanded.value
}
function onSelect(...args) {
  emit('select', ...args)
}
function onPreference(payload) {
  emit('preference', payload)
}
// Scroll to the selected event's card.
function scrollToCard(id) {
  const card = rowRoot.value?.querySelector(`[data-event-id="${id}"]`)

  if (!card) {
    return
  }
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  card.scrollIntoView({
    behavior: reduceMotion ? 'auto' : 'smooth',
    block: 'nearest',
    inline: 'nearest',
  })
}

watch(
  () => props.selectedEventId,
  async (id) => {
    const inThisDay = props.group.events.some((event) => event.id === id)
    if (id == null || !inThisDay) {
      return
    }
    await nextTick()
    scrollToCard(id)
  },
)
</script>


<template>
  <section
    ref="rowRoot"
    class="day-row"
    :class="{ 'is-expanded': expanded }"
    :aria-label="ariaLabel"
  >
    <header class="day-head">
      <span class="day-dot" aria-hidden="true"></span>
      <time :datetime="group.date">
        <strong>{{ dateLabel }}</strong>
        <span class="day-weekday">{{ group.weekday }}</span>
      </time>
      <span class="day-line" aria-hidden="true"></span>
      <span class="day-count">{{ countLabel }}</span>
      <button
        v-if="expanded || group.events.length > 2"
        type="button"
        class="day-more"
        :aria-expanded="expanded"
        @click="toggle"
      >
        {{ expanded ? 'Close' : 'See more' }}
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path :d="moreIconPath" />
        </svg>
      </button>
    </header>


    <!-- Same cards either way: a sideways track, or a grid once expanded -->
    <div :class="expanded ? 'day-grid' : 'day-track'">
      <DiscoveryEventRow
        v-for="event in group.events"
        :key="event.id"
        :class="{ 'day-card': !expanded }"
        :event="event"
        :recommendation="recommendationById.get(event.id)"
        :selected="selectedEventId === event.id"
        :bookmark-enabled="bookmarkEnabled"
        :preference-pending="preferencePending"
        @select="onSelect"
        @preference="onPreference"
      />
    </div>
  </section>
</template>

<style scoped>
.day-row {
  margin-bottom: 18px;
}

/* Header */
.day-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--bookedz-muted);
}

.day-head time {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
}

.day-head strong {
  color: var(--bookedz-ink);
  font-size: 15px;
}

.day-dot {
  flex: none;
  width: 12px;
  height: 12px;
  border: 2px solid var(--bookedz-ink);
  border-radius: 50%;
  background: var(--bookedz-fill);
}

.day-weekday {
  color: var(--bookedz-primary-dark);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.day-line {
  flex: 1;
  min-width: 12px;
  height: 2px;
  background: var(--bookedz-border);
}

.day-more {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 6px 14px;
  border: 2px solid var(--bookedz-ink);
  border-radius: 99px;
  background: var(--bookedz-surface);
  color: var(--bookedz-ink);
  font: inherit;
  font-weight: 700;
}

.day-more:hover {
  background: var(--bookedz-hover);
}

.day-more svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
/* Sideways track and expanded grid share the same bleed */
.day-track,
.day-grid {
  padding: 10px 14px 16px 12px;
  margin: -10px -14px -16px -12px;
}
.day-track {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scroll-padding-inline: 12px;
  scrollbar-width: none;
}
.day-track::-webkit-scrollbar {
  display: none;
}
.day-card {
  flex: 0 0 calc(50% - 6px);
  min-width: 250px;
  scroll-snap-align: start;
}
.day-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
/* "See more" opens every event of the day as one raised card */
.is-expanded {
  padding: 14px;
  border: 2px solid var(--bookedz-ink);
  border-radius: 18px;
  background: var(--bookedz-surface);
  box-shadow: 0 10px 28px rgba(31, 41, 55, 0.13);
}
/* Every card is the same size: a fixed height, with a long title or venue
   wrapping to at most two lines (the full text is in the tooltip and on the event page) */
.day-row :deep(.discovery-event-row) {
  grid-template-columns: 66px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  height: 144px;
  box-sizing: border-box;
}
.day-row :deep(.row-cover) {
  width: 66px;
  height: 66px;
}
.day-row :deep(.row-details) {
  min-height: 0;
  max-height: 100%;
  overflow: hidden;
}
.day-row :deep(.row-actions) {
  grid-column: auto;
  justify-content: flex-end;
}
.day-row :deep(.row-title-line) {
  flex-wrap: wrap;
}
/* One line each... */
.day-row :deep(.row-title),
.day-row :deep(.row-facts),
.day-row :deep(.row-reason),
.day-row :deep(.row-going),
.day-row :deep(.row-selected-info) {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: normal;
  text-overflow: clip;
  overflow-wrap: anywhere;
  -webkit-line-clamp: 1;
  line-clamp: 1;
}
/* ...except title and venue, which get two */
.day-row :deep(.row-title),
.day-row :deep(.row-venue) {
  -webkit-line-clamp: 2;
  line-clamp: 2;
}
@media (prefers-reduced-motion: no-preference) {
  .day-track {
    scroll-behavior: smooth;
  }
}
</style>