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
const zoomLevel = ref(11)
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
  else container.value?.parentElement.querySelector('.street-chip--action, .street-zoom-plus')?.focus()
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
    // Single pins use their category colour (same as the chips); picks are orange stars;
    // clusters are neutral with a count, and a small star when they contain a pick.
    const category = String(group.events[0].category || group.events[0].tags?.[0] || '').toLowerCase()
    const names = group.events.slice(0, 3).map(event => event.title).join(', ') + (count > 3 ? ` and ${count - 3} more` : '')
    const label = count > 1 ? `${count} events near ${group.events[0].venue_name || 'this venue'}: ${names}` : `Preview ${group.events[0].title}${category ? `, ${category}` : ''}`
    const glyph = count > 1 ? `${count}${group.featured ? '<i class="street-pin-star" aria-hidden="true">★</i>' : ''}` : group.featured ? '★' : ''
    const icon = L.divIcon({
      className: `street-marker${count > 1 ? ' street-marker--cluster' : ` cat-${category}`}${group.featured ? ' street-marker--featured' : ''}${active ? ' street-marker--selected' : ''}`,
      html: `<span class="street-pin"><span>${glyph}</span></span>`,
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
function zoomIn() { map?.zoomIn() }
function zoomOut() { map?.zoomOut() }
onMounted(() => {
  // Half-step zoom lets "Show all" fit the events snugly instead of jumping out a whole level.
  // Zoom buttons are our own (bottom-right, in the app's style) rather than Leaflet's.
  map = L.map(container.value, { scrollWheelZoom: false, zoomControl: false, zoomSnap: 0.5, minZoom: 11, maxZoom: 19 }).setView([1.3521, 103.8198], 11)
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
  map.on('zoomend', () => { zoomLevel.value = map.getZoom(); zoomed.value = map.getZoom() >= 14; scheduleMarkers() })
  // Wheel zoom only after clicking the map, so scrolling the page never gets trapped.
  map.on('click', () => map.scrollWheelZoom.enable())
  map.on('mouseout', () => map.scrollWheelZoom.disable())
  // A map hidden by the phone List | Map toggle has no size; when it's shown again, re-frame the
  // selected event (or all events) instead of keeping a view worked out at zero size
  let wasHidden = false
  observer = new ResizeObserver(([entry]) => {
    if (!entry.contentRect.width || !entry.contentRect.height) { wasHidden = true; return }
    map?.invalidateSize({ pan: false })
    if (wasHidden) {
      wasHidden = false
      if (selectedId.value) showPoint(selectedId.value)
      else fitEvents()
    }
    scheduleMarkers()
  })
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
    <!-- One chip: how many events are on the map, or the way back to all of them once zoomed in -->
    <button v-if="zoomed" type="button" class="street-chip street-chip--action" @click="zoomOutAll">{{ points.length ? `← Show all ${points.length} ${points.length === 1 ? 'event' : 'events'}` : '← Zoom out' }}</button>
    <span v-else class="street-chip">{{ points.length }} {{ points.length === 1 ? 'event' : 'events' }} on the map</span>
    <div class="street-zoom" role="group" aria-label="Map zoom">
      <button type="button" class="street-zoom-plus" aria-label="Zoom in" :disabled="zoomLevel >= 19" @click="zoomIn">+</button>
      <button type="button" class="street-zoom-minus" aria-label="Zoom out" :disabled="zoomLevel <= 11" @click="zoomOut">−</button>
    </div>
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
/* Framed like the app's cards: an 8px surface border, 20px corners and a soft shadow */
.discovery-street-map { position: relative; isolation: isolate; overflow: hidden; padding: 8px; border: 1px solid var(--bookedz-border); border-radius: 20px; background: var(--bookedz-surface); box-shadow: var(--bookedz-card-shadow); }
/* Desktop: the pinned card ends 48px above the screen bottom (84px = 18px above + 48px below +
   the frame; --topbar-h is the top bar when it shows) */
.street-map-canvas { position: relative; z-index: 0; width: 100%; height: max(440px,calc(100svh - 84px - var(--topbar-h, 0px))); overflow: hidden; border-radius: 14px; background: var(--bookedz-hover); }
.street-chip { position: absolute; z-index: 450; top: 20px; left: 20px; display: inline-flex; align-items: center; min-height: 36px; max-width: calc(100% - 40px); padding: 6px 14px; border: 1px solid var(--bookedz-border); border-radius: 99px; background: var(--bookedz-surface); color: var(--bookedz-ink); font-size: 12px; font-weight: 600; box-shadow: var(--bookedz-card-shadow); }
.street-chip--action { min-height: 44px; color: var(--bookedz-primary-dark); font-weight: 700; cursor: pointer; }
.street-chip--action:hover { background: var(--bookedz-hover); }
/* + and − in one stack at the bottom right, above the map credits */
.street-zoom { position: absolute; z-index: 450; right: 20px; bottom: 36px; display: grid; overflow: hidden; border: 1px solid var(--bookedz-border); border-radius: 12px; background: var(--bookedz-surface); box-shadow: var(--bookedz-card-shadow); }
.street-zoom button { width: 40px; height: 40px; border: 0; background: transparent; color: var(--bookedz-ink); font-size: 20px; line-height: 1; }
.street-zoom button + button { border-top: 1px solid var(--bookedz-border); }
.street-zoom button:hover:not(:disabled) { background: var(--bookedz-hover); }
.street-zoom button:disabled { color: var(--bookedz-disabled-ink); cursor: not-allowed; }
.street-zoom button:focus-visible { outline-offset: -3px; }
.street-preview { position: absolute; top: 20px; right: 20px; z-index: 500; width: min(245px,calc(100% - 40px)); max-height: calc(100% - 40px); overflow: auto; padding: 14px; border: 1px solid var(--bookedz-border); border-radius: 12px; background: var(--bookedz-surface); color: var(--bookedz-ink); box-shadow: var(--bookedz-preview-shadow); }
.street-preview h2 { font-family: var(--bookedz-body); font-size: 16px; line-height: 1.3; margin: 0 20px 6px 0; }
.street-preview p { font-size: 12px; line-height: 1.5; margin: 4px 0; }
.street-preview .street-picked { display: inline-block; margin: 0 0 6px; padding: 1px 8px; border-radius: 99px; background: var(--bookedz-primary); color: var(--bookedz-on-action); font-size: 11px; font-weight: 700; }
.street-preview .street-preview-category { margin-right: 24px; color: var(--bookedz-primary-dark); font-size: 11px; font-weight: 600; text-transform: capitalize; }
.preview-close { position: absolute; top: 0; right: 0; width: 36px; height: 36px; border: 0; background: transparent; color: var(--bookedz-muted); font-size: 22px; }
.street-preview :deep(.card-action) { min-height: 40px; padding: 8px 10px; font-size: 12px; margin-top: 6px; }
.street-cluster-list { list-style: none; padding: 0; margin: 0; }.street-cluster-list button { min-height: 44px; width: 100%; padding: 8px 0; text-align: left; border: 0; border-bottom: 1px solid var(--bookedz-border); background: transparent; color: var(--bookedz-ink); font: inherit; font-size: 12px; }
.street-map-message,.street-tile-error { position: absolute; z-index: 480; left: 20px; right: 76px; bottom: 20px; padding: 10px; border: 1px solid var(--bookedz-border); border-radius: 12px; background: var(--bookedz-surface); color: var(--bookedz-ink); font-size: 12px; box-shadow: var(--bookedz-card-shadow); }
.street-tile-error { bottom: 72px; }.street-map-message button,.street-tile-error button { min-height: 36px; border: 0; background: transparent; color: var(--bookedz-primary-dark); text-decoration: underline; }
:deep(.street-tip) { padding: 6px 10px; border: 0; border-radius: 8px; background: var(--bookedz-ink); color: var(--bookedz-surface); font-size: 12px; line-height: 1.35; }
:deep(.street-tip::before) { border-top-color: var(--bookedz-ink); }
:deep(.street-marker) { background: transparent; border: 0; display: grid; place-items: center; }
:deep(.street-pin) { position: relative; display: grid; place-items: center; width: 28px; height: 28px; border: 2.5px solid var(--bookedz-surface); border-radius: 50%; background: var(--cat-hue, var(--bookedz-pink)); color: var(--bookedz-on-fill); font-size: 13px; font-weight: 700; box-shadow: 0 2px 8px #1f293740; transition: transform var(--bookedz-motion-fast) var(--bookedz-ease); }
:deep(.street-marker--cluster .street-pin) { width: 34px; height: 34px; background: var(--bookedz-ink); color: var(--bookedz-surface); }
:deep(.street-marker--featured:not(.street-marker--cluster) .street-pin) { width: 32px; height: 32px; background: var(--bookedz-primary); font-size: 15px; }
:deep(.street-pin-star) { position: absolute; top: -6px; right: -6px; display: grid; place-items: center; width: 16px; height: 16px; border-radius: 50%; background: var(--bookedz-primary); color: var(--bookedz-on-fill); font-size: 9px; font-style: normal; }
:deep(.street-pin--place) { background: var(--bookedz-forest); }
:deep(.street-marker--selected .street-pin) { transform: scale(1.25); box-shadow: 0 0 0 3px var(--bookedz-ink), 0 2px 8px #1f293740; animation: pin-bounce 420ms var(--bookedz-ease-stamp); }
@keyframes pin-bounce { 0% { transform: scale(1) translateY(0); } 40% { transform: scale(1.3) translateY(-6px); } 100% { transform: scale(1.25) translateY(0); } }
:deep(.street-pin) { cursor: pointer; }
@media (hover: hover) { :deep(.street-marker:hover .street-pin) { transform: scale(1.15); } }
@media (prefers-reduced-motion: reduce) { :deep(.street-marker--selected .street-pin) { animation: none; } }
:deep(.leaflet-control-attribution) { background: var(--bookedz-surface); color: var(--bookedz-muted); font-size: 10px; }:deep(.leaflet-control-attribution a) { color: var(--bookedz-primary-dark); }
/* Phones (Map pane): fit between the toolbar and the bottom tab bar */
@media(max-width:767px) { .street-map-canvas { height: max(320px,calc(100svh - 330px - var(--bottom-nav-h, 0px))); } }
@media(pointer:coarse) { .preview-close { width: 44px; height: 44px; }.street-zoom button { width: 44px; height: 44px; } }
</style>
