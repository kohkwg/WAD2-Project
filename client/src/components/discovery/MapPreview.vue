<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { addOneMapTiles, SINGAPORE_MAX_BOUNDS } from '@/lib/onemapTiles'
import { eventLatLng, categoryStyle, SINGAPORE_CENTER } from '@/utils/discoveryMap'

// A still OneMap preview for heroes. Pins are real upcoming venues only; the full,
// interactive map lives in Discover's Map view.
const props = defineProps({ events: { type: Array, default: () => [] }, loading: Boolean, error: { type: String, default: '' } })
const emit = defineEmits(['explore'])
const mapEl = ref(null)
const tilesFailed = ref(false)
let map, pinLayer, cleanupTiles, resizeObserver, tileErrors = 0

const points = computed(() => props.events.flatMap(event => {
  const position = eventLatLng(event)
  return position ? [{ ...event, ...position }] : []
}))
const caption = computed(() => {
  if (props.loading) return 'Finding upcoming events…'
  if (props.error) return 'Event pins couldn’t load right now.'
  if (!points.value.length) return 'No upcoming events with a mapped venue yet.'
  return `${points.value.length} upcoming ${points.value.length === 1 ? 'event' : 'events'} on the map`
})

function renderPins() {
  if (!map) return
  pinLayer.clearLayers()
  for (const point of points.value) {
    const tone = categoryStyle(point).tone
    L.marker([point.lat, point.lng], { interactive: false, keyboard: false, icon: L.divIcon({ className: 'hero-pin-icon', html: `<span class="hero-pin hero-pin--${tone}"></span>`, iconSize: [18, 18], iconAnchor: [9, 9] }) }).addTo(pinLayer)
  }
  if (points.value.length) map.fitBounds(L.latLngBounds(points.value.map(p => [p.lat, p.lng])), { padding: [40, 40], maxZoom: 13, animate: false })
}
watch(points, renderPins)

onMounted(() => {
  map = L.map(mapEl.value, {
    center: [SINGAPORE_CENTER.lat, SINGAPORE_CENTER.lng], zoom: 11, minZoom: 11, maxZoom: 14, maxBounds: SINGAPORE_MAX_BOUNDS,
    zoomControl: false, attributionControl: false, dragging: false, touchZoom: false, doubleClickZoom: false,
    scrollWheelZoom: false, boxZoom: false, keyboard: false, tap: false, fadeAnimation: false, zoomAnimation: false,
  })
  cleanupTiles = addOneMapTiles(map)
  map.eachLayer(layer => layer.on?.('tileerror', () => { if (++tileErrors > 4) tilesFailed.value = true }))
  pinLayer = L.layerGroup().addTo(map)
  resizeObserver = new ResizeObserver(() => { map?.invalidateSize(); renderPins() })
  resizeObserver.observe(mapEl.value)
  renderPins()
})
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  cleanupTiles?.()
  const current = map
  map = null
  current?.stop()
  // Leaflet 1.9 leaves an untracked zoom-end timer; this flag makes it return early after removal.
  if (current) current._animatingZoom = false
  current?.off()
  current?.remove()
})
</script>

<template>
  <figure class="hero-map" :class="{ 'hero-map--failed': tilesFailed }">
    <div ref="mapEl" class="hero-map-canvas" aria-hidden="true"></div>
    <div v-if="tilesFailed" class="hero-map-fallback" role="status">The map tiles couldn’t load. Events are still listed in Discover.</div>
    <figcaption class="hero-map-caption">
      <span class="hero-map-status" role="status"><span class="hero-map-dot" aria-hidden="true"></span>{{ caption }}</span>
      <button type="button" class="btn btn-primary btn-sm" @click="emit('explore')">Explore the map</button>
    </figcaption>
    <p class="hero-map-credit"><img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" alt="" width="14" height="14"> <a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener">OneMap</a> © contributors | <a href="https://www.sla.gov.sg/" target="_blank" rel="noopener">Singapore Land Authority</a></p>
  </figure>
</template>

<style scoped>
.hero-map { position: relative; margin: 0; width: 100%; aspect-ratio: 4 / 3; border: 1px solid var(--bookedz-border); border-radius: var(--bookedz-radius-card); overflow: hidden; background: var(--bookedz-glass-solid); box-shadow: var(--bookedz-preview-shadow); }
.hero-map-canvas { position: absolute; inset: 0; isolation: isolate; z-index: 0; background: var(--bookedz-glass-solid); }
.hero-map-canvas :deep(.leaflet-container) { cursor: default; }
.hero-map-caption { position: absolute; z-index: 500; left: 14px; right: 14px; top: 14px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
.hero-map-status { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 99px; background: var(--bookedz-map-overlay); border: 1px solid var(--bookedz-border); color: var(--bookedz-ink); font-size: .8rem; font-weight: 600; font-variant-numeric: tabular-nums; }
.hero-map-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--bookedz-teal); box-shadow: 0 0 0 4px rgb(20 184 166 / 22%); }
.hero-map-caption .btn { border-radius: 99px; }
.hero-map-credit { position: absolute; z-index: 500; right: 0; bottom: 0; margin: 0; padding: 3px 8px; border-top-left-radius: 10px; background: var(--bookedz-map-overlay); color: var(--bookedz-muted); font-size: .68rem; }
.hero-map-credit img { vertical-align: -2px; }
.hero-map-credit a { color: var(--bookedz-primary-dark); }
.hero-map-fallback { position: absolute; inset: 30% 12%; z-index: 400; display: grid; place-items: center; text-align: center; color: var(--bookedz-muted); font-size: .9rem; }
.hero-map :deep(.hero-pin-icon) { background: none; border: 0; }
.hero-map :deep(.hero-pin) { display: block; width: 18px; height: 18px; border-radius: 50%; border: 3px solid var(--bookedz-surface); box-shadow: 0 2px 6px rgb(31 41 55 / 30%); animation: hero-pin-pop var(--bookedz-motion-reveal) var(--bookedz-ease-stamp) both; }
.hero-map :deep(.hero-pin--teal) { background: var(--bookedz-teal); }
.hero-map :deep(.hero-pin--pink) { background: var(--bookedz-pink); }
.hero-map :deep(.hero-pin--mango) { background: var(--bookedz-mango); }
.hero-map :deep(.hero-pin--ink) { background: var(--bookedz-fill); }
@keyframes hero-pin-pop { from { transform: scale(.3); opacity: 0; } to { transform: none; opacity: 1; } }
@media(prefers-reduced-motion:reduce) { .hero-map :deep(.hero-pin) { animation: none; } }
</style>
