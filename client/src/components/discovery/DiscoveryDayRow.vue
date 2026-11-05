<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import DiscoveryEventRow from './DiscoveryEventRow.vue'
// Show each day's events two at a time in a swipeable row, with a dot per page.
// "See more" opens them all as a grid.
const props = defineProps({
  group: { type: Object, required: true },
  recommendationById: { type: Object, required: true },
  selectedEventId: { type: [String, Number], default: null },
  bookmarkEnabled: Boolean,
  preferencePending: Boolean,
  // Cards side by side: 2, or 1 when the map is enlarged
  columns: { type: Number, default: 2 },
})
const emit = defineEmits(['select', 'preference'])
const expanded = ref(false)
const track = ref(null)
const page = ref(0)
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
const pageSize = computed(() => props.columns)
const pageCount = computed(() => Math.ceil(props.group.events.length / pageSize.value))
const paged = computed(() => !expanded.value && pageCount.value > 1)
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
function cards() {
  return track.value ? [...track.value.querySelectorAll('[data-event-id]')] : []
}
// Which page is showing, from how far the row has scrolled.
function onScroll() {
  const list = cards()
  const el = track.value
  if (!el || list.length <= pageSize.value) {
    return
  }
  if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 2) {
    page.value = pageCount.value - 1
    return
  }
  const stride = list[pageSize.value].offsetLeft - list[0].offsetLeft
  page.value = Math.min(pageCount.value - 1, Math.round(el.scrollLeft / stride))
}
function goToPage(index) {
  const card = cards()[index * pageSize.value]
  if (!card || !track.value) {
    return
  }
  page.value = index
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  track.value.scrollTo({
    left: card.offsetLeft - cards()[0].offsetLeft,
    behavior: reduceMotion ? 'auto' : 'smooth',
  })
}

// Bring the selected event's card into view.
watch(
  () => props.selectedEventId,
  async (id) => {
    const index = props.group.events.findIndex((event) => event.id === id)
    if (index < 0) {
      return
    }
    await nextTick()
    if (paged.value) {
      goToPage(Math.floor(index / pageSize.value))
    }
  },
)
watch([expanded, pageSize], () => {
  page.value = 0
  if (track.value) track.value.scrollLeft = 0
})
</script>


<template>
  <section
    class="day-row"
    :style="{ '--cols': columns, '--gap': columns === 1 ? '20px' : '16px' }"
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
        v-if="expanded || group.events.length > pageSize"
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


    <div
      ref="track"
      :class="expanded ? 'day-grid' : 'day-track'"
      @scroll.passive="onScroll"
    >
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

    <div v-if="paged" class="day-dots" role="group" :aria-label="`${group.label} pages`">
      <button
        v-for="n in pageCount"
        :key="n"
        type="button"
        class="day-dot-btn"
        :class="{ 'is-active': page === n - 1 }"
        :aria-label="`Page ${n} of ${pageCount}`"
        :aria-current="page === n - 1 ? 'true' : undefined"
        @click="goToPage(n - 1)"
      ></button>
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
/* Bleed so a hovered card's shadow isn't clipped */
.day-track,
.day-grid {
  padding: 10px 14px 16px 12px;
  margin: -10px -14px -16px -12px;
}
.day-track {
  position: relative;
  display: flex;
  /* Wider than the padding around the row, so a neighbouring card never peeks in at the edge */
  gap: var(--gap);
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scroll-padding-inline: 12px;
}
.day-track {
  scrollbar-width: none;
}
.day-track::-webkit-scrollbar {
  display: none;
}
.day-card {
  flex: 0 0 calc((100% - (var(--cols) - 1) * var(--gap)) / var(--cols));
  scroll-snap-align: start;
}
.day-grid {
  display: grid;
  grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
  gap: var(--gap);
}
/* One dot per page of cards */
.day-dots {
  display: flex;
  justify-content: center;
  gap: 2px;
  margin-top: 14px;
}
.day-dot-btn {
  position: relative;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
}
.day-dot-btn::before {
  content: '';
  position: absolute;
  inset: 7px;
  border: 2px solid var(--bookedz-ink);
  border-radius: 50%;
  background: transparent;
  transition: background 0.15s;
}
.day-dot-btn.is-active::before {
  background: var(--bookedz-fill);
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
/* The selected card grows to show its View event and RSVP buttons */
.day-row :deep(.discovery-event-row.is-selected) {
  height: auto;
  min-height: 144px;
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
.day-row :deep(.row-going) {
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
/* Selected cards grow so the recommendation can be read without clipping. */
.day-row :deep(.discovery-event-row.is-selected) {
  height: auto;
  min-height: 144px;
}
.day-row :deep(.is-selected .row-details) {
  max-height: none;
  overflow: visible;
}
.day-row :deep(.is-selected .row-selected-info) {
  display: flex;
  overflow: visible;
  -webkit-line-clamp: unset;
  line-clamp: unset;
}
.day-row :deep(.row-selected-info > span) {
  min-width: 0;
  overflow-wrap: anywhere;
}
@media (prefers-reduced-motion: no-preference) {
  .day-track {
    scroll-behavior: smooth;
  }
}
</style>