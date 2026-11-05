<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { motion, useReducedMotion } from 'motion-v'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { addOneMapTiles, SINGAPORE_MAX_BOUNDS } from '@/lib/onemapTiles'
import { eventLatLng, inBounds, categoryStyle, groupMarkers, mergeOverlapping, SINGAPORE_BOUNDS, SINGAPORE_CENTER } from '@/utils/discoveryMap'

// Discover's live map: OneMap tiles (Leaflet, BSD-2-Clause) with real venue
// coordinates. Motion for Vue (MIT) https://motion.dev/docs/vue animates previews.
const props = defineProps({ events: { type: Array, default: () => [] }, prominentIds: { type: Array, default: () => [] }, loading: Boolean, error: String, region: { type: Object, default: null } })
const emit = defineEmits(['retry', 'list'])
const reduced = useReducedMotion()
const mapEl = ref(null)
const selection = ref([])
const selectedId = ref(null)
const previewTitle = ref(null)
const searchArea = ref(null)
const movedSinceSearch = ref(false)
const locating = ref(false)
const locateMessage = ref('')
let map, markerLayer, hereMarker, cleanupTiles, resizeObserver, markerOpener, openerEventId
let markerEntries = []
let programmaticMove = false
let fittedOnce = false

const points = computed(() => props.events.flatMap(event => {
  const position = eventLatLng(event)
  return position ? [{ ...event, ...position }] : []
}))
const missingCount = computed(() => props.events.length - points.value.length)
const areaEvents = computed(() => (searchArea.value ? points.value.filter(p => inBounds(p, searchArea.value)) : points.value)
  .slice().sort((a, b) => new Date(a.start_time) - new Date(b.start_time)))
const selected = computed(() => props.events.find(e => e.id === selectedId.value))
const selectionAnnouncement = computed(() => selected.value ? `Selected event: ${selected.value.title}. Event preview is available beside the map.` : selection.value.length ? `${selection.value.length} events selected. Choose an event from the preview.` : '')

function dateLabel(event) { return new Date(event.start_time).toLocaleDateString('en-SG', { weekday: 'short', month: 'short', day: 'numeric' }) }
function timeLabel(event) { return new Date(event.start_time).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit' }) }
function categoryLabel(event) { return (categoryStyle(event).category || 'Event').replace(/[_-]/g, ' ') }

function move(callback) {
  programmaticMove = true
  callback()
}
function boundsObject(bounds) { return { south: bounds.getSouth(), west: bounds.getWest(), north: bounds.getNorth(), east: bounds.getEast() } }
function fitAll() {
  if (!map) return
  const latLngs = points.value.map(p => [p.lat, p.lng])
  move(() => latLngs.length
    ? map.fitBounds(L.latLngBounds(latLngs), { padding: [48, 48], maxZoom: 15, animate: !reduced.value })
    : map.setView([SINGAPORE_CENTER.lat, SINGAPORE_CENTER.lng], 12, { animate: !reduced.value }))
}
function showAll() {
  searchArea.value = null
  movedSinceSearch.value = false
  selection.value = []
  selectedId.value = null
  fitAll()
}

function pinHtml(group) {
  if (group.events.length > 1) return `<span class="pin-cluster"><span>${group.events.length}</span>${group.prominent ? '<span class="pin-cluster-star">★</span>' : ''}</span>`
  const style = categoryStyle(group.events[0])
  return `<span class="pin pin--${style.tone}${group.prominent ? ' pin--featured' : ''}"><span class="pin-glyph">${group.prominent ? '★' : style.glyph}</span></span>`
}
function renderMarkers() {
  if (!map) return
  markerLayer.clearLayers()
  markerEntries = []
  if (props.loading || props.error) return
  const screen = points.value.map(p => ({ ...p, ...map.latLngToLayerPoint([p.lat, p.lng]) }))
  const groups = mergeOverlapping(groupMarkers(screen, 1, props.prominentIds.slice(0, 3)))
  groups.forEach((group, index) => {
    const first = group.events[0]
    const cluster = group.events.length > 1
    const icon = L.divIcon({ className: 'event-pin-icon', html: pinHtml(group), iconSize: cluster ? [48, 48] : [44, 48], iconAnchor: cluster ? [24, 24] : [22, 46] })
    const marker = L.marker([first.lat, first.lng], { icon, keyboard: true, riseOnHover: true, title: cluster ? `${group.events.length} events` : first.title }).addTo(markerLayer)
    const element = marker.getElement()
    element.dataset.marker = ''
    element.style.setProperty('--marker-index', index % 6)
    element.setAttribute('aria-label', cluster ? `${group.events.length} events near ${first.venue_name || 'this location'}${group.prominent ? ', including picks for you' : ''}` : `Preview ${first.title}, ${categoryLabel(first)}`)
    marker.on('click', () => choose(group, element))
    element.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(group, element) }
    })
    markerEntries.push({ element, group })
  })
  updatePressed()
}
function updatePressed() {
  for (const { element, group } of markerEntries) {
    element.setAttribute('aria-pressed', String(selection.value.some(e => group.events.some(g => g.id === e.id))))
  }
}

function choose(group, element) {
  markerOpener = element
  openerEventId = group.events[0].id
  selection.value = group.events
  selectedId.value = group.events.length === 1 ? group.events[0].id : null
  const bounds = L.latLngBounds(group.events.map(e => [e.lat, e.lng]))
  // Spread a cluster out where it can split; co-located events stay a list.
  if (group.events.length > 1 && map.getZoom() < 17 && bounds.getNorthEast().distanceTo(bounds.getSouthWest()) > 5) {
    move(() => map.fitBounds(bounds, { padding: [70, 70], maxZoom: 17, animate: !reduced.value }))
  }
}
async function openEvent(event, { focusPreview = true } = {}) {
  markerOpener = document.activeElement
  openerEventId = null
  selection.value = [event]
  selectedId.value = event.id
  if (map) move(() => map.setView([event.lat, event.lng], Math.max(map.getZoom(), 15), { animate: !reduced.value }))
  if (!focusPreview) return
  await nextTick()
  previewTitle.value?.focus({ preventScroll: true })
}
async function openClusterEvent(id) {
  selectedId.value = id
  await nextTick()
  previewTitle.value?.focus({ preventScroll: true })
}
function dismiss() {
  selection.value = []
  selectedId.value = null
  // A zoom may have rebuilt the pins; return focus to the pin now holding the event.
  if (!markerOpener?.isConnected && openerEventId) markerOpener = markerEntries.find(entry => entry.group.events.some(e => e.id === openerEventId))?.element
  if (markerOpener?.isConnected) markerOpener.focus({ preventScroll: true })
}
function searchThisArea() {
  if (!map) return
  searchArea.value = boundsObject(map.getBounds())
  movedSinceSearch.value = false
}

// Location is requested once per press, used only to recentre, and never stored or sent.
function locate() {
  locateMessage.value = ''
  if (!('geolocation' in navigator)) { locateMessage.value = 'Location isn’t available in this browser. You can still pan the map.'; return }
  locating.value = true
  navigator.geolocation.getCurrentPosition(position => {
    locating.value = false
    if (!map) return
    const here = { lat: position.coords.latitude, lng: position.coords.longitude }
    if (!inBounds(here, SINGAPORE_BOUNDS)) { locateMessage.value = 'You seem to be outside Singapore, so the map stays where it is.'; return }
    hereMarker?.remove()
    hereMarker = L.circleMarker([here.lat, here.lng], { radius: 9, weight: 3, color: '#ffffff', fillColor: '#0f766e', fillOpacity: 1, interactive: false }).addTo(map)
    move(() => map.setView([here.lat, here.lng], 15, { animate: !reduced.value }))
    searchArea.value = null
    movedSinceSearch.value = true
    locateMessage.value = 'Showing the area around you. Your location stays on this device.'
  }, failure => {
    locating.value = false
    locateMessage.value = failure.code === 1 ? 'Location permission was declined. You can still pan the map.' : 'We couldn’t find your location. Try again or pan the map.'
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 })
}

watch(() => props.region, region => {
  if (!map || !region || !eventLatLng(region)) return
  searchArea.value = null
  move(() => map.setView([region.lat, region.lng], 14, { animate: !reduced.value }))
})
watch(() => [props.events, props.loading, props.error], () => {
  selection.value = []
  selectedId.value = null
  renderMarkers()
  if (!fittedOnce && !props.loading && points.value.length && !props.region) { fittedOnce = true; fitAll() }
})
watch(() => props.prominentIds, renderMarkers)
watch(selection, updatePressed)

onMounted(() => {
  const start = eventLatLng(props.region)
  map = L.map(mapEl.value, {
    center: start ? [start.lat, start.lng] : [SINGAPORE_CENTER.lat, SINGAPORE_CENTER.lng], zoom: start ? 14 : 12,
    minZoom: 11, maxZoom: 19, maxBounds: SINGAPORE_MAX_BOUNDS, maxBoundsViscosity: 1,
    zoomControl: false, scrollWheelZoom: false,
    zoomAnimation: !reduced.value, fadeAnimation: !reduced.value, markerZoomAnimation: !reduced.value,
  })
  cleanupTiles = addOneMapTiles(map)
  L.control.zoom({ position: 'bottomright' }).addTo(map)
  markerLayer = L.layerGroup().addTo(map)
  // Wheel zoom only after the visitor engages the map, so page scrolling never zooms by accident.
  map.on('click focus', () => map.scrollWheelZoom.enable())
  map.on('blur mouseout', () => map.scrollWheelZoom.disable())
  map.on('zoomend', renderMarkers)
  map.on('moveend', () => {
    if (programmaticMove) programmaticMove = false
    else movedSinceSearch.value = true
  })
  resizeObserver = new ResizeObserver(() => map?.invalidateSize())
  resizeObserver.observe(mapEl.value)
  if (start) fittedOnce = true
  renderMarkers()
  if (!fittedOnce && !props.loading && points.value.length) { fittedOnce = true; fitAll() }
})
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  cleanupTiles?.()
  // Stop pan/zoom animations first: removing a map mid-animation makes Leaflet read a detached pane.
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
  <section class="event-map" aria-label="Explore events on the Singapore map" :aria-busy="loading" data-lenis-prevent @keydown.esc="dismiss">
    <p class="visually-hidden" role="status" aria-live="polite">{{ selectionAnnouncement }}</p>
    <div class="map-layout">
      <div class="map-surface">
        <div ref="mapEl" class="map-canvas" role="region" aria-label="OneMap of Singapore with event pins. Use the arrow keys to pan, or tab to the pins."></div>
        <div class="map-toolbar">
          <button type="button" class="map-chip" :disabled="locating" @click="locate">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></svg>
            {{ locating ? 'Finding you…' : 'Near me' }}
          </button>
          <button type="button" class="map-chip" @click="showAll">Show all of Singapore</button>
        </div>
        <button v-if="movedSinceSearch && !loading && !error" type="button" class="btn btn-primary btn-sm map-search-area" @click="searchThisArea">Search this area</button>
        <div v-if="loading" class="map-message" role="status"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span> Finding events around Singapore…</div>
        <div v-dismissible v-else-if="error" class="map-message" role="alert">The map couldn’t load events. <button class="btn btn-link btn-sm" @click="emit('retry')">Try again</button></div>
        <div v-else-if="!points.length" class="map-message" role="status">{{ events.length ? 'These events don’t have a map location yet. Explore them in the list.' : 'No events match your search. Try another category or date.' }}</div>
        <motion.div v-if="selection.length" :key="selectedId ?? selection.map(event => event.id).join(',')" class="map-preview" :initial="reduced ? false : { opacity: 0, y: 18, scale: .94 }" :animate="{ opacity: 1, y: 0, scale: 1 }" :transition="reduced ? { duration: 0 } : { type: 'spring', stiffness: 360, damping: 28 }" role="region" aria-label="Selected map events">
          <button class="preview-close" type="button" aria-label="Close event preview" @click="dismiss">×</button>
          <template v-if="selected">
            <p class="preview-kicker">{{ categoryLabel(selected) }}</p>
            <h2 ref="previewTitle" tabindex="-1">{{ selected.title }}</h2>
            <p class="preview-date">{{ dateLabel(selected) }} · {{ timeLabel(selected) }}</p>
            <p class="preview-venue">{{ selected.venue_name || 'Venue to be announced' }}</p>
            <p v-if="selected.registration_status" class="preview-status">{{ selected.registration_status === 'confirmed' ? 'You’re going' : selected.registration_status === 'pending' ? 'Pending approval' : selected.registration_status }}</p>
            <div class="d-flex gap-2 flex-wrap"><RouterLink :to="`/events/${selected.id}/rsvp`" class="btn event-cta">View event</RouterLink><RouterLink :to="{ path: `/events/${selected.id}/rsvp`, hash: '#rsvp' }" class="btn event-cta event-cta--secondary">RSVP</RouterLink></div>
          </template>
          <template v-else><p class="preview-kicker">A little closer</p><h2>{{ selection.length }} events in this spot</h2><ul class="cluster-events"><li v-for="event in selection" :key="event.id"><button type="button" @click="openClusterEvent(event.id)">{{ event.title }}<span>{{ dateLabel(event) }}</span></button></li></ul></template>
        </motion.div>
      </div>
      <aside class="map-rail" aria-labelledby="map-rail-title">
        <div class="rail-head">
          <h2 id="map-rail-title">{{ searchArea ? 'In this area' : 'On the map' }}</h2>
          <span class="rail-count">{{ areaEvents.length }} {{ areaEvents.length === 1 ? 'event' : 'events' }}</span>
        </div>
        <button v-if="searchArea" type="button" class="rail-clear" @click="showAll">Clear area <span aria-hidden="true">×</span></button>
        <p v-dismissible v-if="locateMessage" class="rail-note" role="status">{{ locateMessage }}</p>
        <ul v-if="areaEvents.length" class="rail-list">
          <li v-for="event in areaEvents" :key="event.id">
            <button type="button" class="rail-item" :aria-current="selectedId === event.id ? 'true' : undefined" @click="openEvent(event)">
              <span class="rail-pin" :class="`pin--${categoryStyle(event).tone}`" aria-hidden="true">{{ categoryStyle(event).glyph }}</span>
              <span class="rail-copy"><strong>{{ event.title }}</strong><span>{{ dateLabel(event) }} · {{ timeLabel(event) }}</span><span>{{ event.venue_name || 'Venue to be announced' }}</span></span>
            </button>
          </li>
        </ul>
        <p v-else-if="!loading && !error" class="rail-note">{{ searchArea ? 'Nothing here yet. Pan around and search again, or clear the area.' : 'No mapped events to show.' }}</p>
      </aside>
    </div>
    <div class="map-bottomline">
      <div class="map-key" aria-label="Map key"><span><i class="pin pin--featured pin--mini" aria-hidden="true"><span class="pin-glyph">★</span></i> Picked for you</span><span><i class="pin-cluster pin-cluster--mini" aria-hidden="true"><span>3</span></i> Several events</span><span>Letters show the category</span></div>
      <span>{{ points.length }} {{ points.length === 1 ? 'event' : 'events' }} on the map<template v-if="missingCount"> · {{ missingCount }} more in the list</template></span>
      <button type="button" @click="emit('list')">Explore the event list</button>
    </div>
  </section>
</template>

<style scoped>
.event-map { position: relative; padding: 0 max(var(--discover-gutter, 12px), calc((100% - 1280px) / 2 + var(--discover-gutter, 12px))); }
.map-layout { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 16px; }
.map-surface { position: relative; min-height: 480px; border: 1px solid var(--bookedz-border); border-radius: var(--bookedz-radius-card); overflow: hidden; background: var(--bookedz-glass-solid); box-shadow: var(--bookedz-map-shadow); animation: map-arrive var(--bookedz-motion-reveal) var(--bookedz-ease) both; }
@keyframes map-arrive { from { opacity: .4; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.map-canvas { height: clamp(520px, 62vh, 760px); width: 100%; isolation: isolate; z-index: 0; font-family: var(--bookedz-body); background: var(--bookedz-glass-solid); }
.map-toolbar { position: absolute; z-index: 500; top: 14px; left: 14px; display: flex; flex-wrap: wrap; gap: 8px; }
.map-chip { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 8px 14px; border: 1px solid var(--bookedz-border); border-radius: 99px; background: var(--bookedz-surface); color: var(--bookedz-ink); font-size: .85rem; font-weight: 600; box-shadow: var(--bookedz-neutral-shadow); transition: box-shadow var(--bookedz-motion-normal) var(--bookedz-ease), transform var(--bookedz-motion-normal) var(--bookedz-ease); }
.map-chip:hover:not(:disabled) { box-shadow: var(--bookedz-neutral-shadow-hover); transform: translateY(-1px); }
.map-chip:disabled { color: var(--bookedz-disabled-ink); cursor: progress; }
.map-chip svg { width: 18px; height: 18px; }
.map-search-area { position: absolute; z-index: 500; top: 14px; left: 50%; transform: translateX(-50%); border-radius: 99px; animation: slip-in var(--bookedz-motion-slip) var(--bookedz-ease) both; }
.map-search-area:hover:not(:disabled) { transform: translateX(-50%) translateY(-1px); }
@keyframes slip-in { from { opacity: 0; translate: 0 -8px; } to { opacity: 1; translate: 0 0; } }
.map-message { position: absolute; z-index: 500; bottom: 24px; left: 50%; transform: translateX(-50%); max-width: calc(100% - 120px); background: var(--bookedz-surface); border: 1px solid var(--bookedz-border); border-radius: 14px; padding: 12px 18px; font-size: .85rem; display: flex; align-items: center; gap: 10px; box-shadow: var(--bookedz-shadow); }
.map-preview { position: absolute; z-index: 600; top: 72px; right: 14px; width: 300px; max-height: calc(100% - 130px); overflow-y: auto; padding: 24px; border: 1px solid var(--bookedz-border); border-radius: var(--bookedz-radius-card); background: var(--bookedz-surface); box-shadow: var(--bookedz-preview-shadow); }
.map-preview h2 { text-wrap: balance; font-size: 1.4rem; margin-bottom: 10px; padding-right: 14px; }
.preview-close { position: absolute; top: 6px; right: 6px; width: 44px; height: 44px; border: 0; border-radius: 50%; background: transparent; font-size: 1.4rem; color: var(--bookedz-muted); }
.preview-close:hover { background: var(--bookedz-hover); color: var(--bookedz-ink); }
.preview-kicker { margin: 0 0 10px; font-size: .75rem; color: var(--bookedz-primary-dark); font-weight: 700; text-transform: capitalize; letter-spacing: .02em; }
.preview-date,.preview-venue { font-size: .85rem; color: var(--bookedz-muted); margin-bottom: 8px; font-variant-numeric: tabular-nums; }
.preview-venue { margin-bottom: 20px; }
.preview-status { color: var(--bookedz-success); font-size: .8rem; }
.cluster-events { list-style: none; margin: 0; padding: 0; }
.cluster-events button { text-align: left; border: 0; border-top: 1px dashed var(--bookedz-border); background: none; padding: 14px 0; width: 100%; min-height: 44px; font-size: .9rem; font-weight: 600; color: var(--bookedz-ink); }
.cluster-events button:hover { color: var(--bookedz-primary-dark); }
.cluster-events span { display: block; font-size: .75rem; color: var(--bookedz-muted); margin-top: 4px; font-weight: 500; }

.map-rail { display: flex; flex-direction: column; min-height: 0; max-height: clamp(520px, 62vh, 760px); border: 1px solid var(--bookedz-border); border-radius: var(--bookedz-radius-card); background: var(--bookedz-surface); padding: 18px 8px 8px 18px; box-shadow: var(--bookedz-card-shadow); }
.rail-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding-right: 10px; }
.rail-head h2 { font-size: 1.15rem; margin: 0; }
.rail-count { color: var(--bookedz-muted); font-size: .8rem; font-variant-numeric: tabular-nums; }
.rail-clear { align-self: flex-start; min-height: 36px; margin-top: 8px; padding: 4px 12px; border: 1px solid var(--bookedz-border); border-radius: 99px; background: var(--bookedz-orange-soft); color: var(--bookedz-primary-dark); font-size: .8rem; font-weight: 700; }
.rail-note { margin: 10px 10px 0 0; font-size: .8rem; color: var(--bookedz-muted); }
.rail-list { list-style: none; margin: 12px 0 0; padding: 0 10px 0 0; overflow-y: auto; overscroll-behavior: contain; }
.rail-list li + li { border-top: 1px dashed var(--bookedz-border); }
.rail-item { display: flex; gap: 12px; align-items: flex-start; width: 100%; min-height: 44px; padding: 12px 8px; border: 0; border-radius: 14px; background: transparent; text-align: left; color: var(--bookedz-ink); transition: background-color var(--bookedz-motion-fast) var(--bookedz-ease); }
.rail-item:hover { background: var(--bookedz-hover); }
.rail-item[aria-current=true] { background: var(--bookedz-orange-soft); }
.rail-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rail-copy strong { font-family: var(--bookedz-heading); font-weight: 800; font-size: .95rem; line-height: 1.25; overflow-wrap: anywhere; }
.rail-copy span { font-size: .78rem; color: var(--bookedz-muted); font-variant-numeric: tabular-nums; }
.rail-pin { flex: none; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; font: 800 .8rem var(--bookedz-heading); }

.map-bottomline { display: flex; align-items: center; justify-content: space-between; gap: 8px 16px; flex-wrap: wrap; padding: 12px 4px; font-size: .78rem; color: var(--bookedz-muted); }
.map-bottomline > button { border: 0; background: none; color: var(--bookedz-primary-dark); font-weight: 700; min-height: 44px; }
.map-key { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 16px; }
.map-key > span { display: inline-flex; align-items: center; gap: 7px; }

/* Pins are Leaflet divIcons inside the map, so they need :deep(). */
/* The divIcon box is the 44px+ hit area; the visible pin sits centred inside it. */
.event-map :deep(.event-pin-icon) { display: grid; place-items: center; background: none; border: 0; outline: none; }
.event-map :deep(.event-pin-icon:focus-visible) { outline: 3px solid var(--bookedz-focus); outline-offset: 2px; border-radius: 50%; }
.event-map :deep(.leaflet-marker-icon) { animation: pin-arrive .3s var(--bookedz-ease) both; animation-delay: calc(var(--marker-index, 0) * 40ms); }
@keyframes pin-arrive { from { opacity: 0; } to { opacity: 1; } }
.event-map :deep(.pin),.pin { position: relative; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50% 50% 50% 4px; transform: rotate(-45deg); border: 2px solid var(--bookedz-surface); box-shadow: 0 4px 10px rgb(31 41 55 / 22%); transition: transform var(--bookedz-motion-normal) var(--bookedz-ease-stamp); }
.event-map :deep(.pin-glyph),.pin-glyph { transform: rotate(45deg); font: 900 .85rem var(--bookedz-heading); line-height: 1; }
.event-map :deep(.event-pin-icon:hover .pin),.event-map :deep(.event-pin-icon:focus-visible .pin),.event-map :deep(.event-pin-icon[aria-pressed=true] .pin) { transform: rotate(-45deg) scale(1.15); }
.event-map :deep(.event-pin-icon[aria-pressed=true] .pin),.event-map :deep(.event-pin-icon[aria-pressed=true] .pin-cluster) { box-shadow: 0 0 0 4px var(--bookedz-fill), 0 6px 14px rgb(31 41 55 / 28%); }
.event-map :deep(.pin--teal),.pin--teal { background: var(--bookedz-teal); color: #0b2e2b; }
.event-map :deep(.pin--pink),.pin--pink { background: var(--bookedz-pink); color: #3b0a23; }
.event-map :deep(.pin--mango),.pin--mango { background: var(--bookedz-mango); color: #3a2503; }
.event-map :deep(.pin--ink),.pin--ink { background: var(--bookedz-ink); color: var(--bookedz-surface); }
.event-map :deep(.pin--featured),.pin--featured { background: var(--bookedz-fill); color: var(--bookedz-on-fill); }
.map-key .pin--mini { width: 20px; height: 20px; border-width: 1px; box-shadow: none; }
.map-key .pin--mini .pin-glyph { font-size: .6rem; }
.event-map :deep(.pin-cluster),.pin-cluster { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; background: var(--bookedz-ink); color: var(--bookedz-surface); border: 3px solid var(--bookedz-surface); box-shadow: 0 0 0 6px rgb(255 107 53 / 25%), 0 4px 10px rgb(31 41 55 / 22%); font: 900 .95rem var(--bookedz-heading); font-variant-numeric: tabular-nums; transition: transform var(--bookedz-motion-normal) var(--bookedz-ease-stamp); }
.event-map :deep(.event-pin-icon:hover .pin-cluster),.event-map :deep(.event-pin-icon:focus-visible .pin-cluster) { transform: scale(1.1); }
.event-map :deep(.pin-cluster) { position: relative; }
.event-map :deep(.pin-cluster-star) { position: absolute; top: -8px; right: -8px; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--bookedz-fill); color: var(--bookedz-on-fill); border: 2px solid var(--bookedz-surface); font-size: .65rem; }
.map-key .pin-cluster--mini { width: 22px; height: 22px; border-width: 1px; box-shadow: none; font-size: .65rem; }
.event-map :deep(.leaflet-control-zoom) { border: 1px solid var(--bookedz-border); border-radius: 14px; overflow: hidden; box-shadow: var(--bookedz-neutral-shadow); }
.event-map :deep(.leaflet-control-zoom a) { width: 44px; height: 44px; line-height: 44px; background: var(--bookedz-surface); color: var(--bookedz-ink); border-color: var(--bookedz-border); font-size: 1.3rem; }
.event-map :deep(.leaflet-control-zoom a:hover) { background: var(--bookedz-hover); }
.event-map :deep(.leaflet-control-zoom a.leaflet-disabled) { background: var(--bookedz-disabled-bg); color: var(--bookedz-disabled-ink); }
.event-map :deep(.leaflet-control-attribution) { background: var(--bookedz-map-overlay); color: var(--bookedz-muted); font-size: .7rem; }
.event-map :deep(.leaflet-control-attribution a) { color: var(--bookedz-primary-dark); }
.event-map :deep(.leaflet-container:focus-visible) { outline: 3px solid var(--bookedz-focus); outline-offset: -3px; }
@media(prefers-reduced-motion:reduce) {
  .map-surface,.map-search-area,.event-map :deep(.leaflet-marker-icon) { animation: none; }
  .event-map :deep(.pin),.event-map :deep(.pin-cluster),.map-chip { transition: none; }
}
@media(max-width:991.98px) {
  .map-layout { grid-template-columns: 1fr; }
  .map-rail { max-height: 360px; }
}
@media(max-width:767px) {
  .map-surface { min-height: 0; }
  .map-canvas { height: 380px; }
  .map-toolbar { top: 10px; left: 10px; right: 10px; }
  .map-chip { min-height: 40px; padding: 6px 12px; font-size: .8rem; }
  .map-search-area { top: auto; bottom: 14px; }
  .map-preview { position: relative; top: auto; right: auto; width: auto; max-height: none; margin: 12px; box-shadow: var(--bookedz-map-shadow); }
  .map-message { bottom: 64px; left: 12px; right: 12px; transform: none; max-width: none; }
}
</style>
