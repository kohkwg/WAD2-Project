<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { addOneMapTiles } from '@/lib/onemapTiles';

// the event venue and the food ideas around it. pins: the event (dark), ideas (numbered),
// the host's picks (orange). clicking a pin shows its name.

const props = defineProps({
  venue: {
    type: Object,
    required: true
  },
  // { name, lat, lng }
  spots: {
    type: Array,
    default: () => []
  } // [{ id, name, lat, lng, label, chosen }]
});

const mapDiv = ref(null);

let map = null;

let layer = null;

let stopTiles = null;

const pin = (text, tone) => L.divIcon({
  className: '',
  html: `<span class="group-pin group-pin--${tone}">${text}</span>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});

const escape = text => String(text).replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[c]);

function draw() {
  if (!map) return;
  layer?.remove();
  layer = L.layerGroup().addTo(map);
  const points = [[props.venue.lat, props.venue.lng]];
  L.marker(points[0], {
    icon: pin('★', 'event'),
    title: props.venue.name
  }).bindPopup(`<strong>${escape(props.venue.name)}</strong><br>The event`).addTo(layer);
  props.spots.forEach((spot, index) => {
    if (!Number.isFinite(spot.lat) || !Number.isFinite(spot.lng)) return;
    points.push([spot.lat, spot.lng]);
    L.marker([spot.lat, spot.lng], {
      icon: pin(spot.chosen ? '✓' : index + 1, spot.chosen ? 'chosen' : 'idea'),
      title: spot.name
    }).bindPopup(`<strong>${escape(spot.name)}</strong><br>${escape(spot.label)}`).addTo(layer);
  });
  if (points.length > 1) map.fitBounds(points, {
    padding: [30, 30],
    maxZoom: 17
  });else map.setView(points[0], 16);
}

onMounted(() => {
  map = L.map(mapDiv.value, {
    scrollWheelZoom: false
  });
  stopTiles = addOneMapTiles(map);
  draw();
});

watch(() => [props.venue, props.spots], draw, {
  deep: true
});

onUnmounted(() => {
  stopTiles?.();
  map?.remove();
  map = null;
});
</script>

<template>
  <div
  ref="mapDiv"
  class="group-map"
  role="img"
  :aria-label="`Map of ${venue.name} and ${spots.length} food ideas nearby`"></div>
</template>

<style scoped>
.group-map {
  height: 280px;
  border: 1px solid var(--bookedz-border);
  border-radius: 16px;
  overflow: hidden;
}

.group-map :deep(.group-pin) {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow: 0 2px 6px rgba(0, 0, 0, .3);
  font: 700 .8rem/1 var(--bookedz-body, system-ui);
}

.group-map :deep(.group-pin) {
  animation: pin-drop var(--bookedz-motion-slip, .25s) var(--bookedz-ease-stamp, ease-out) both;
}

@keyframes pin-drop {
  from {
    opacity: 0;
    transform: translateY(-10px) scale(.7);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .group-map :deep(.group-pin) {
    animation: none;
  }
}

.group-map :deep(.group-pin--event) {
  background: #1c1917;
  color: #fff;
}

/* fixed colours: the theme's ink flips in dark mode */

.group-map :deep(.group-pin--idea) {
  background: #fff;
  color: #1c1917;
}

.group-map :deep(.group-pin--chosen) {
  background: var(--bookedz-primary);
  color: #fff;
}
</style>
