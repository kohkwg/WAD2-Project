<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
// Leaflet's default pin image doesn't load with Vite, so we import the images ourselves
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

// A OneMap (Singapore) map with one pin.
// draggable = true → the organiser can drag the pin or click the map to move it; we emit 'move'
//
// Things that might look odd:
// - Events created before this map was added still show it, with the pin wherever
//   OneMap's search put it.
// - A venue entered through the "Use … anyway" fallback has no coordinates, so the pages
//   don't show a map for it (v-if="...lat"). That's expected.
// - Have not updated the map to move based on where he places the pin, e.g. if he puts SMU then pins suntech it still shows SMU, feature was meant for the user to show more exact location.
const props = defineProps({
  lat: Number,
  lng: Number,
  draggable: Boolean,
})
const emit = defineEmits(['move'])

const mapDiv = ref(null) // the <div> Leaflet draws the map into
let map = null
let pin = null

onMounted(() => {
  // Leaflet needs the real <div> on the page, so this has to wait until onMounted
  // scrollWheelZoom: false → the mouse wheel doesn't zoom the map. That's on purpose, so
  // scrolling the page doesn't zoom the map by accident. Use the + / − buttons instead.
  map = L.map(mapDiv.value, { scrollWheelZoom: false }).setView([props.lat, props.lng], 17)

  L.tileLayer('https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png', {
    minZoom: 11,
    maxZoom: 19,
    attribution:
      '<a href="https://www.onemap.gov.sg/" target="_blank">OneMap</a> © contributors | ' +
      '<a href="https://www.sla.gov.sg/" target="_blank">Singapore Land Authority</a>', // required by OneMap
  }).addTo(map)

  pin = L.marker([props.lat, props.lng], {
    draggable: props.draggable,
    icon: L.icon({
      iconUrl: markerIcon,
      shadowUrl: markerShadow,
      iconSize: [25, 41],
      iconAnchor: [12, 41], // the tip of the pin sits on the spot
    }),
  }).addTo(map)

  if (props.draggable) {
    // Fires once, when the user lets go of the pin
    pin.on('dragend', () => {
      const { lat, lng } = pin.getLatLng()
      emit('move', { lat, lng })
    })
    // Clicking the map drops the pin there
    map.on('click', (e) => {
      pin.setLatLng(e.latlng)
      emit('move', { lat: e.latlng.lat, lng: e.latlng.lng })
    })
  }
})

watch(() => [props.lat, props.lng], ([lat, lng]) => {
  if (!map || !pin || !Number.isFinite(lat) || !Number.isFinite(lng)) return
  pin.setLatLng([lat, lng])
  map.setView([lat, lng])
})

onUnmounted(() => {
  map?.remove() // clean up, otherwise Leaflet keeps listening after you press Back / Next
  map = null
  pin = null
})
</script>

<template>
  <div ref="mapDiv" class="venue-map border rounded"></div>
</template>

<style scoped>
.venue-map {
  height: 260px; /* Leaflet shows nothing without a height */
  isolation: isolate; /* keeps internal z-indexes inside the map so it does not cover navbar */
}
</style>
