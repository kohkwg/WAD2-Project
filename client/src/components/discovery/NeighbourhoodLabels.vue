<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  zoom: { type: Number, default: 1 },
  markerScale: { type: Number, default: 1 },
  center: { type: Object, default: () => ({ x: 600, y: 450 }) },
  compact: Boolean,
  frame: { type: Object, default: () => ({ width: 1200, height: 900 }) },
})
const emit = defineEmits(['focus'])
const selectedName = ref('')

// Authored label positions on the 1200×900 expanded illustration. These are
// navigation targets, independent of the real-coordinate event projection.
const places = [
  { name: 'Woodlands', x: 440, y: 100, major: true },
  { name: 'Jurong', x: 140, y: 430, major: true },
  { name: 'Changi', x: 1100, y: 440, major: true },
  { name: 'Marina Bay', x: 810, y: 625, major: true },
  { name: 'Sentosa', x: 585, y: 785, major: true },
  { name: 'Yishun', x: 685, y: 115 },
  { name: 'Punggol', x: 965, y: 140 },
  { name: 'Sengkang', x: 835, y: 185 },
  { name: 'Ang Mo Kio', x: 660, y: 225 },
  { name: 'Bukit Timah', x: 360, y: 280 },
  { name: 'Clementi', x: 265, y: 345 },
  { name: 'Tampines', x: 1040, y: 230 },
  { name: 'Bedok', x: 845, y: 340 },
  { name: 'Mandai', x: 230, y: 160, detail: true },
  { name: 'Botanic Gardens', x: 460, y: 320, detail: true },
  { name: 'Orchard', x: 650, y: 390, detail: true },
  { name: 'Chinatown', x: 400, y: 510, detail: true },
  { name: 'Kampong Glam', x: 570, y: 475, detail: true },
  { name: 'Sports Hub', x: 930, y: 275, detail: true },
  { name: 'Bishan', x: 600, y: 270, detail: true },
  { name: 'Queenstown', x: 320, y: 455, detail: true },
]
const visiblePlaces = computed(() => {
  const scale = props.markerScale
  const left = props.center.x - props.frame.width / 2 / props.zoom
  const top = props.center.y - props.frame.height / 2 / props.zoom
  const right = left + props.frame.width / props.zoom
  const bottom = top + props.frame.height / props.zoom
  const placed = []
  const candidates = places.filter(place =>
    (!place.detail || props.zoom >= 1.65) &&
    (!props.compact || props.zoom >= 1.65 || place.major))
  // Retain the activated button while zooming, including its keyboard focus.
  candidates.sort((a, b) => Number(b.name === selectedName.value) - Number(a.name === selectedName.value))
  for (const place of candidates) {
    const width = Math.max(64, place.name.length * 6 + 22)
    const halfWidth = width * scale / 2
    const halfHeight = 22 * scale
    if (place.x - halfWidth < left || place.x + halfWidth > right ||
      place.y - halfHeight < top || place.y + halfHeight > bottom) continue
    if (placed.some(other => Math.abs(other.x - place.x) < (other.width + width + 6) * scale / 2 &&
      Math.abs(other.y - place.y) < 44 * scale)) continue
    placed.push({ ...place, width })
  }
  return placed
})
function choose(place) {
  selectedName.value = place.name
  emit('focus', { x: place.x, y: place.y })
}
</script>

<template>
  <g class="neighbourhood-labels" aria-label="Explore neighbourhoods and attractions">
    <g v-for="place in visiblePlaces" :key="place.name"
      :transform="`translate(${place.x} ${place.y}) scale(${markerScale})`">
      <foreignObject :x="-place.width / 2" y="-22" :width="place.width" height="44">
        <button xmlns="http://www.w3.org/1999/xhtml" type="button"
          class="neighbourhood-button" data-neighbourhood
          :aria-label="`Zoom to ${place.name}`"
          @pointerdown.stop @click.stop="choose(place)">
          <span class="neighbourhood-pill">{{ place.name }}</span>
        </button>
      </foreignObject>
    </g>
  </g>
</template>

<style scoped>
.neighbourhood-button {
  display: flex; align-items: center; justify-content: center;
  width: 100%; height: 44px; padding: 0; border: 0;
  background: transparent; color: var(--bookedz-ink); font: inherit; cursor: pointer;
}
.neighbourhood-pill {
  display: inline-block; padding: 4px 7px;
  border: 1px solid var(--bookedz-muted-border); border-radius: 99px;
  background: var(--bookedz-surface); box-shadow: var(--bookedz-map-shadow);
  font-family: var(--bookedz-body); font-size: 10px; font-weight: 500;
  line-height: 1.3; white-space: nowrap;
}
.neighbourhood-button:hover .neighbourhood-pill { border-color: var(--bookedz-forest); }
.neighbourhood-button:focus-visible { outline: 2px solid var(--bookedz-primary-dark); outline-offset: -3px; border-radius: 12px; }
</style>
