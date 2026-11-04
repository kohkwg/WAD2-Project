<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { searchPlace } from '../../lib/onemap'
import { addOneMapTiles } from '../../lib/onemapTiles'
import EventCardActions from '../EventCardActions.vue'

const props = defineProps({
  events: { type: Array, default: () => [] },
  prominentIds: { type: Array, default: () => [] },
  focusedEventId: { type: String, default: null },
  searchText: { type: String, default: '' },
  loading: Boolean, error: String,
})
const emit = defineEmits(['select', 'retry'])
const container = ref(null)
const selectedId = ref(null)
const groupEvents = ref([])
const tileError = ref(false)
const place = ref(null)
const zoomed = ref(false)
const points = computed(() => props.events.flatMap(event => {
  const lat = event.lat ?? event.venue?.lat
  const lng = event.lng ?? event.venue?.lng
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 1.15 && lat <= 1.49 && lng >= 103.59 && lng <= 104.1
    ? [{ event, lat, lng }] : []
}))
const missing = computed(() => props.events.length - points.value.length)
const selected = computed(() => props.events.find(event => event.id === selectedId.value))
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const timeLabel = event => new Date(event.start_time).toLocaleString('en-SG', { timeZone: 'Asia/Singapore', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
let fittedSignature = ''
let map, tiles, stopTiles, markers, placeLayer, observer, opener, placeTimer, placeAbort
let renderFrame

function choose(event, focusTitle = false) {
  opener = document.activeElement
  selectedId.value = event.id
  groupEvents.value = []
  emit('select', event.id)
  showPoint(event.id)
  if (focusTitle) nextTick(() => container.value?.parentElement.querySelector('.street-preview h2')?.focus({ preventScroll: true }))
}
function showPoint(id) {
  const point = points.value.find(point => point.event.id === id)
  if (!map || !point) return
  if (map.getZoom() < 15) map.setView([point.lat, point.lng], 15, { animate: false })
  map.panInside([point.lat, point.lng], {
    paddingTopLeft: [30, 30], paddingBottomRight: [Math.min(260, map.getSize().x * .45), 80], animate: !reduced(),
  })
  scheduleMarkers()
}
function dismiss() {
  selectedId.value = null
  groupEvents.value = []
  emit('select', null)
  scheduleMarkers()
  if (opener?.isConnected && opener.getClientRects().length) opener.focus()
  else container.value?.parentElement.querySelector('.street-fit')?.focus()
}
function fitEvents() {
  if (!map) return
  if (place.value) { map.setView([place.value.lat, place.value.lng], 16, { animate: !reduced() }); return }
  if (points.value.length) map.fitBounds(L.latLngBounds(points.value.map(point => [point.lat, point.lng])), { padding: [44, 44], maxZoom: 15, animate: false })
  else map.setView([1.3521, 103.8198], 11, { animate: false })
}
function scheduleMarkers() {
  cancelAnimationFrame(renderFrame)
  renderFrame = requestAnimationFrame(renderMarkers)
}
function renderMarkers() {
  if (!map || !markers) return
  markers.clearLayers()
  if (props.loading || props.error) return
  const prominent = new Set(props.prominentIds.slice(0, 3))
  const groups = []
  for (const point of points.value) {
    const pixel = map.latLngToLayerPoint([point.lat, point.lng])
    const featured = prominent.has(point.event.id)
    const nearby = !featured && groups.find(group => !group.featured && pixel.distanceTo(group.pixel) < 38)
    if (nearby) nearby.events.push(point.event)
    else groups.push({ ...point, pixel, featured, events: [point.event] })
  }
  // Prominent co-located events share an honest count rather than hiding a pin.
  const located = []
  for (const group of groups) {
    const same = located.find(other => Math.abs(other.lat - group.lat) < .000001 && Math.abs(other.lng - group.lng) < .000001)
    if (same) { same.events.push(...group.events); same.featured ||= group.featured }
    else located.push(group)
  }
  for (const group of located) {
    const active = group.events.some(event => event.id === selectedId.value)
    const count = group.events.length
    const label = count > 1 ? `${count} events near ${group.events[0].venue_name || 'this venue'}` : `Preview ${group.events[0].title}`
    const icon = L.divIcon({
      className: `street-marker${count > 1 ? ' street-marker--cluster' : ''}${group.featured ? ' street-marker--featured' : ''}${active ? ' street-marker--selected' : ''}`,
      html: `<span class="street-pin"><span>${count > 1 ? count : '●'}</span></span>`,
      iconSize: [44, 44], iconAnchor: [22, 22],
    })
    const marker = L.marker([group.lat, group.lng], { icon, keyboard: true, title: label, alt: label, zIndexOffset: active ? 1000 : 0 }).addTo(markers)
    if (active && count === 1) marker.bindTooltip(`<strong>${group.events[0].title.replace(/[<>&]/g, '')}</strong><br>${timeLabel(group.events[0]).replace(/,/g, ' ·')}`, { permanent: true, direction: 'top', offset: [0, -20], className: 'street-tip' })
    const el = marker.getElement()
    el?.setAttribute('data-marker', '')
    el?.setAttribute('aria-label', label)
    el?.setAttribute('aria-pressed', String(active))
    const open = () => {
      if (count === 1) choose(group.events[0])
      else {
        opener = document.activeElement
        selectedId.value = null
        groupEvents.value = group.events
        emit('select', null)
        map.setView([group.lat, group.lng], Math.min(19, map.getZoom() + 2), { animate: !reduced() })
      }
    }
    marker.on('click', open)
    el?.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); open() }
    })
  }
}
// With no event matching the search, treat it as a place name and centre the map there.
function clearPlace() { place.value = null; placeLayer?.clearLayers() }
function lookupPlace() {
  clearTimeout(placeTimer)
  placeAbort?.abort()
  const text = props.searchText.trim()
  if (text.length < 3 || props.loading || props.error || props.events.length) { if (place.value) { clearPlace(); fitEvents() } return }
  placeTimer = setTimeout(async () => {
    placeAbort = new AbortController()
    try {
      const found = await searchPlace(text, placeAbort.signal)
      if (!found || !map) { clearPlace(); return }
      place.value = found
      placeLayer.clearLayers()
      L.marker([found.lat, found.lng], { interactive: false, icon: L.divIcon({ className: 'street-marker street-place', html: '<span class="street-pin street-pin--place"><span>●</span></span>', iconSize: [44, 44], iconAnchor: [22, 22] }) })
        .bindTooltip(found.name, { permanent: true, direction: 'top', offset: [0, -18], className: 'street-tip' }).addTo(placeLayer)
      map.setView([found.lat, found.lng], 16, { animate: !reduced() })
    } catch (failure) { if (failure.name !== 'AbortError') clearPlace() }
  }, 400)
}
function zoomOutAll() {
  clearPlace()
  fitEvents()
}
function retryTiles() { tileError.value = false; tiles?.redraw() }
onMounted(() => {
  map = L.map(container.value, { scrollWheelZoom: false, zoomControl: false, minZoom: 11, maxZoom: 19 }).setView([1.3521, 103.8198], 11)
  L.control.zoom({ position: 'topright' }).addTo(map)
  // Night tiles in dark mode, so the map does not glare inside the dark interface.
  stopTiles = addOneMapTiles(map)
  tiles = stopTiles.layer
  // Edge tiles over the sea or Johor are missing from OneMap; only warn when nothing loaded.
  let loadedTiles = 0, failedTiles = 0
  tiles.on('loading', () => { loadedTiles = 0; failedTiles = 0 })
  tiles.on('tileload', () => { loadedTiles++; tileError.value = false })
  tiles.on('tileerror', () => { failedTiles++ })
  tiles.on('load', () => { tileError.value = failedTiles > 0 && loadedTiles === 0 })
  markers = L.layerGroup().addTo(map)
  placeLayer = L.layerGroup().addTo(map)
  map.on('zoomend', () => { zoomed.value = map.getZoom() >= 14; scheduleMarkers() })
  // Wheel zoom only after clicking the map, so scrolling the page never gets trapped.
  map.on('click', () => map.scrollWheelZoom.enable())
  map.on('mouseout', () => map.scrollWheelZoom.disable())
  observer = new ResizeObserver(() => { map?.invalidateSize({ pan: false }); scheduleMarkers() })
  observer.observe(container.value)
  fitEvents()
  scheduleMarkers()
  if (props.focusedEventId) {
    selectedId.value = props.focusedEventId
    showPoint(props.focusedEventId)
  }
})
watch([() => props.events, () => props.prominentIds, () => props.loading, () => props.error], () => {
  if (!props.events.some(event => event.id === selectedId.value)) { selectedId.value = null; groupEvents.value = [] }
  // Re-fit only when the set of events changed, so panning and zooming survive a refresh.
  const signature = props.events.map(event => event.id).join(',')
  if (signature !== fittedSignature) { fittedSignature = signature; fitEvents() }
  if (props.focusedEventId) showPoint(props.focusedEventId)
  scheduleMarkers()
})
watch([() => props.searchText, () => props.events, () => props.loading, () => props.error], lookupPlace)
watch(() => props.focusedEventId, id => {
  if (!id) return
  opener = document.activeElement
  selectedId.value = id
  groupEvents.value = []
  showPoint(id)
})
onBeforeUnmount(() => { stopTiles?.(); clearTimeout(placeTimer); placeAbort?.abort(); observer?.disconnect(); cancelAnimationFrame(renderFrame); map?.remove(); map = null })
</script>

<template>
  <section class="discovery-street-map" aria-label="Explore events on the Singapore map" :aria-busy="loading" @keydown.esc="dismiss">
    <div ref="container" class="street-map-canvas" aria-label="Singapore street map. Use event pins or zoom controls to explore."></div>
    <span class="street-map-count">{{ points.length }} {{ points.length === 1 ? 'event' : 'events' }} on the map</span>
    <button type="button" class="street-fit" aria-label="Fit all events on map" @click="zoomOutAll">⌂</button>
    <button v-if="zoomed" type="button" class="street-zoom-out" @click="zoomOutAll">← Zoom out to all events</button>
    <div v-if="loading" class="street-map-message" role="status">Finding events…</div>
    <div v-else-if="error" class="street-map-message" role="alert">{{ error }} <button type="button" @click="emit('retry')">Try again</button></div>
    <div v-else-if="!points.length && !place" class="street-map-message" role="status">{{ events.length ? 'These events have no map coordinates yet. Their details are available in the list.' : 'No events match your search.' }}</div>
    <div v-if="tileError" class="street-tile-error" role="status">Map background couldn’t load. <button type="button" @click="retryTiles">Retry map</button></div>
    <div v-if="selected || groupEvents.length" class="street-preview" role="region" aria-label="Selected map events">
      <button type="button" class="preview-close" aria-label="Close event preview" @click="dismiss">×</button>
      <template v-if="selected">
        <p v-if="selected.pickedForYou" class="street-picked">Picked for you</p>
        <p class="street-preview-category">{{ selected.category || selected.tags?.[0] || 'Event' }}<template v-if="selected.source !== 'general_discovery' && Number.isFinite(selected.compatibilityScore)"> · {{ Math.round(selected.compatibilityScore) }}% match</template></p>
        <h2 tabindex="-1">{{ selected.title }}</h2>
        <p>{{ timeLabel(selected) }}</p><p>{{ selected.venue_name || 'Venue to be announced' }}<template v-if="Number.isFinite(selected.spots_left)"> · {{ selected.spots_left > 0 ? `${selected.spots_left} spots left` : 'Full' }}</template></p>
        <EventCardActions :event="selected" />
      </template>
      <template v-else><h2>{{ groupEvents.length }} events here</h2><ul class="street-cluster-list"><li v-for="event in groupEvents" :key="event.id"><button type="button" @click="choose(event, true)">{{ event.title }}</button></li></ul></template>
    </div>
  </section>
</template>

<style scoped>
.discovery-street-map { position: relative; isolation: isolate; overflow: hidden; border: 1px solid var(--bookedz-border); border-radius: 16px; background: var(--bookedz-surface); }
.street-map-canvas { position: relative; z-index: 0; width: 100%; height: clamp(480px,calc(100svh - 370px),720px); background: var(--bookedz-hover); }
.street-map-count,.street-map-count { top: 12px; left: 12px; padding: 6px 11px; border-radius: 99px; font-size: 11px; font-weight: 600; }
.street-zoom-out { position: absolute; z-index: 450; left: 12px; top: 58px; min-height: 40px; padding: 6px 14px; border: 1px solid var(--bookedz-border); border-radius: 99px; background: var(--bookedz-surface); color: var(--bookedz-primary-dark); font-size: 12px; font-weight: 700; box-shadow: var(--bookedz-card-shadow); }
.street-fit { top: 91px; right: 11px; width: 44px; height: 44px; border: 1px solid var(--bookedz-border); border-radius: 8px; font-size: 22px; }
.street-preview { position: absolute; top: 12px; right: 64px; z-index: 500; width: min(245px,calc(100% - 80px)); max-height: calc(100% - 120px); overflow: auto; padding: 14px; border: 1px solid var(--bookedz-border); border-radius: 12px; background: var(--bookedz-surface); color: var(--bookedz-ink); box-shadow: var(--bookedz-preview-shadow); }
.street-preview h2 { font-family: var(--bookedz-body); font-size: 16px; line-height: 1.3; margin: 0 20px 6px 0; }
.street-preview p { font-size: 12px; line-height: 1.5; margin: 4px 0; }
.street-preview .street-picked { display: inline-block; margin: 0 0 6px; padding: 1px 8px; border-radius: 99px; background: var(--bookedz-primary); color: var(--bookedz-on-action); font-size: 11px; font-weight: 700; }
.street-preview .street-preview-category { margin-right: 24px; color: var(--bookedz-primary-dark); font-size: 11px; font-weight: 600; text-transform: capitalize; }
.preview-close { position: absolute; top: 0; right: 0; width: 36px; height: 36px; border: 0; background: transparent; color: var(--bookedz-muted); font-size: 22px; }
.street-preview :deep(.card-action) { min-height: 40px; padding: 8px 10px; font-size: 12px; margin-top: 6px; }
.street-cluster-list { list-style: none; padding: 0; margin: 0; }.street-cluster-list button { min-height: 44px; width: 100%; padding: 8px 0; text-align: left; border: 0; border-bottom: 1px solid var(--bookedz-border); background: transparent; color: var(--bookedz-ink); font: inherit; font-size: 12px; }
.street-map-message,.street-tile-error { position: absolute; z-index: 480; left: 12px; right: 12px; bottom: 75px; padding: 10px; border-radius: 9px; background: var(--bookedz-surface); color: var(--bookedz-ink); font-size: 12px; }
.street-tile-error { bottom: 115px; }.street-map-message button,.street-tile-error button { min-height: 36px; border: 0; background: transparent; color: var(--bookedz-primary-dark); text-decoration: underline; }
:deep(.street-tip) { padding: 6px 10px; border: 0; border-radius: 8px; background: var(--bookedz-ink); color: var(--bookedz-surface); font-size: 12px; line-height: 1.35; }
:deep(.street-tip::before) { border-top-color: var(--bookedz-ink); }
:deep(.street-marker) { background: transparent; border: 0; display: grid; place-items: center; }
:deep(.street-pin) { display: grid; place-items: center; width: 32px; height: 32px; border: 2px solid var(--bookedz-surface); border-radius: 50%; background: #ec4899; color: #fff; font-size: 13px; font-weight: 700; box-shadow: 0 2px 8px #1f293740; }
:deep(.street-marker--featured .street-pin) { background: #ec4899; }
:deep(.street-pin--place) { background: var(--bookedz-forest); }
:deep(.street-marker--selected .street-pin) { width: 38px; height: 38px; background: var(--bookedz-forest); outline: none; }
:deep(.leaflet-control-zoom a) { width: 36px; height: 36px; line-height: 36px; background: var(--bookedz-surface); color: var(--bookedz-ink); }
:deep(.leaflet-control-attribution) { background: var(--bookedz-surface); color: var(--bookedz-muted); font-size: 10px; }:deep(.leaflet-control-attribution a) { color: var(--bookedz-primary-dark); }
@media(max-width:991px) { .street-map-canvas { height: clamp(480px,calc(100svh - 300px),640px); } }
@media(max-width:767px) { .street-map-canvas { height: clamp(420px,calc(100svh - 320px),620px); } }
@media(pointer:coarse) { .preview-close { width: 44px; height: 44px; }:deep(.leaflet-control-zoom a) { width: 44px; height: 44px; line-height: 44px; }.street-fit { top: 108px; } }
</style>
