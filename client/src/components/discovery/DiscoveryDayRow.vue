<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import DiscoveryEventRow from './DiscoveryEventRow.vue'

// One date on laptops and up: a sideways row of event cards, or every event in a grid after "See more".
const props = defineProps({
  group: { type: Object, required: true },
  recommendationById: { type: Object, required: true },
  selectedEventId: { type: [String, Number], default: null },
  bookmarkEnabled: Boolean, preferencePending: Boolean,
})
const emit = defineEmits(['select', 'preference'])
const expanded = ref(false)
const track = ref(null)
const canBack = ref(false)
const canForward = ref(false)
function updateArrows() {
  const el = track.value
  canBack.value = Boolean(el) && el.scrollLeft > 4
  canForward.value = Boolean(el) && el.scrollLeft + el.clientWidth < el.scrollWidth - 4
}
function scrollBy(direction) {
  const el = track.value
  el?.scrollBy({ left: direction * el.clientWidth * .9, behavior: 'smooth' })
}
async function toggle() { expanded.value = !expanded.value; await nextTick(); updateArrows() }
let observer
onMounted(() => {
  observer = new ResizeObserver(updateArrows)
  if (track.value) observer.observe(track.value)
  updateArrows()
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <section class="day-row" :class="{ 'is-expanded': expanded }" :aria-label="`${group.label}, ${group.weekday} ${group.year}`">
    <header class="day-head">
      <span class="day-dot" aria-hidden="true"></span>
      <time :datetime="group.date"><strong>{{ group.label }}<template v-if="group.year">, {{ group.year }}</template></strong><span class="day-weekday">{{ group.weekday }}</span></time>
      <span class="day-line" aria-hidden="true"></span>
      <span class="day-count">{{ group.events.length }} {{ group.events.length === 1 ? 'event' : 'events' }}</span>
      <button v-if="expanded || group.events.length > 2" type="button" class="day-more" :aria-expanded="expanded" @click="toggle">
        {{ expanded ? 'Close' : 'See more' }}
        <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="expanded ? 'M6 6l12 12M18 6 6 18' : 'm6 9 6 6 6-6'" /></svg>
      </button>
    </header>
    <div v-if="expanded" class="day-grid">
      <DiscoveryEventRow v-for="event in group.events" :key="event.id" :event="event" :recommendation="recommendationById.get(event.id)" :selected="selectedEventId === event.id" :bookmark-enabled="bookmarkEnabled" :preference-pending="preferencePending" @select="(...args) => emit('select', ...args)" @preference="emit('preference', $event)" />
    </div>
    <div v-else class="day-carousel">
      <div ref="track" class="day-track" @scroll.passive="updateArrows">
        <DiscoveryEventRow v-for="event in group.events" :key="event.id" class="day-card" :event="event" :recommendation="recommendationById.get(event.id)" :selected="selectedEventId === event.id" :bookmark-enabled="bookmarkEnabled" :preference-pending="preferencePending" @select="(...args) => emit('select', ...args)" @preference="emit('preference', $event)" />
      </div>
      <button v-if="canBack" type="button" class="day-arrow day-arrow--back" :aria-label="`Earlier events on ${group.label}`" @click="scrollBy(-1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg></button>
      <button v-if="canForward" type="button" class="day-arrow day-arrow--forward" :aria-label="`More events on ${group.label}`" @click="scrollBy(1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></button>
    </div>
  </section>
</template>

<style scoped>
.day-row { margin-bottom: 18px; }
.day-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; font-size: 12px; color: var(--bookedz-muted); }
.day-dot { flex: none; width: 12px; height: 12px; border: 2px solid var(--bookedz-ink); border-radius: 50%; background: var(--bookedz-fill); }
.day-head time { display: inline-flex; align-items: baseline; gap: 8px; }
.day-head strong { color: var(--bookedz-ink); font-size: 15px; }
.day-weekday { color: var(--bookedz-primary-dark); font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.day-line { flex: 1; min-width: 12px; height: 2px; background: var(--bookedz-border); }
.day-more { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 6px 14px; border: 2px solid var(--bookedz-ink); border-radius: 99px; background: var(--bookedz-surface); color: var(--bookedz-ink); font: inherit; font-weight: 700; }
.day-more:hover { background: var(--bookedz-hover); }
.day-more svg,.day-arrow svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.day-carousel { position: relative; }
.day-track { display: flex; gap: 12px; padding: 2px 6px 10px 2px; margin: -2px -6px -10px -2px; overflow-x: auto; scroll-snap-type: x proximity; scrollbar-width: none; }
.day-track::-webkit-scrollbar { display: none; }
.day-card { flex: 0 0 calc(50% - 6px); min-width: 250px; scroll-snap-align: start; }
/* Cards here show everything: the title and facts wrap instead of ending in "…" */
.day-row :deep(.discovery-event-row) { grid-template-columns: 66px minmax(0, 1fr) auto; align-items: center; gap: 12px; height: 100%; }
.day-row :deep(.row-cover) { width: 66px; height: 66px; }
.day-row :deep(.row-actions) { grid-column: auto; justify-content: flex-end; }
.day-row :deep(.row-title),.day-row :deep(.row-facts) { white-space: normal; overflow: visible; text-overflow: clip; overflow-wrap: anywhere; }
.day-row :deep(.row-title-line) { flex-wrap: wrap; }
.day-track { align-items: stretch; }
.day-arrow { position: absolute; top: 50%; display: grid; place-items: center; width: 44px; height: 44px; transform: translateY(-50%); border: 1px solid var(--bookedz-border); border-radius: 50%; background: color-mix(in srgb, var(--bookedz-surface) 92%, transparent); color: var(--bookedz-ink); box-shadow: var(--bookedz-card-shadow); }
.day-arrow--back { left: 4px; }
.day-arrow--forward { right: 4px; }
.day-arrow:hover { background: var(--bookedz-hover); }
/* "See more" opens every event of the day as one raised card */
.is-expanded { padding: 14px; border: 2px solid var(--bookedz-ink); border-radius: 18px; background: var(--bookedz-surface); box-shadow: 0 10px 28px #1f293722; }
.day-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding: 4px 6px 10px 2px; }
@media (prefers-reduced-motion: no-preference) { .day-track { scroll-behavior: smooth; } }
</style>
