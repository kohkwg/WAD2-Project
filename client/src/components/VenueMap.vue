<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';
import L from 'leaflet';
import { addOneMapTiles } from '@/lib/onemapTiles';
import 'leaflet/dist/leaflet.css';
// leaflet's default pin image doesn't load with vite, so we import the images ourselves
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// a onemap (singapore) map with one pin.
// draggable = true → the organiser can drag the pin or click the map to move it; we emit 'move'
//
// things that might look odd:
// - events created before this map was added still show it, with the pin wherever
//   onemap's search put it.
// - a venue entered through the "use … anyway" fallback has no coordinates, so the pages
//   don't show a map for it (v-if="...lat"). that's expected.
// - have not updated the map to move based on where he places the pin, e.g. if he puts smu then pins suntech it still shows smu, feature was meant for the user to show more exact location.

const props = defineProps({
  lat: Number,
  lng: Number,
  draggable: Boolean
});

const emit = defineEmits(['move']);

const mapDiv = ref(null); // the <div> leaflet draws the map into

let map = null;

let pin = null;

let stopTiles = null;

onMounted(() => {
  // leaflet needs the real <div> on the page, so this has to wait until onmounted
  // scrollwheelzoom: false → the mouse wheel doesn't zoom the map. that's on purpose, so
  // scrolling the page doesn't zoom the map by accident. use the + / − buttons instead.
  map = L.map(mapDiv.value, {
    scrollWheelZoom: false
  }).setView([props.lat, props.lng], 17);

  // onemap tiles with the required attribution; night tiles follow the dark theme.
  stopTiles = addOneMapTiles(map);
  pin = L.marker([props.lat, props.lng], {
    draggable: props.draggable,
    icon: L.icon({
      iconUrl: markerIcon,
      shadowUrl: markerShadow,
      iconSize: [25, 41],
      iconAnchor: [12, 41] // the tip of the pin sits on the spot
    })
  }).addTo(map);
  if (props.draggable) {
    // fires once, when the user lets go of the pin
    pin.on('dragend', () => {
      const {
        lat,
        lng
      } = pin.getLatLng();
      emit('move', {
        lat,
        lng
      });
    });
    // clicking the map drops the pin there
    map.on('click', e => {
      pin.setLatLng(e.latlng);
      emit('move', {
        lat: e.latlng.lat,
        lng: e.latlng.lng
      });
    });
  }
});

watch(() => [props.lat, props.lng], ([lat, lng]) => {
  if (!map || !pin || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
  pin.setLatLng([lat, lng]);
  map.setView([lat, lng]);
});

onUnmounted(() => {
  stopTiles?.();
  map?.remove(); // clean up, otherwise leaflet keeps listening after you press back / next
  map = null;
  pin = null;
});
</script>

<template>
  <div ref="mapDiv" class="venue-map border rounded"></div>
</template>

<style scoped>
.venue-map {
  height: 260px;
  /* leaflet shows nothing without a height */
  isolation: isolate;
  /* keeps internal z-indexes inside the map so it does not cover navbar */
}
</style>
