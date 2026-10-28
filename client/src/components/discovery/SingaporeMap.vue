<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { motion, useReducedMotion } from 'motion-v'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import IslandArtwork from './IslandArtwork.vue'
import { projectIllustratedVenue, groupMarkers } from '@/utils/discoveryMap'

// Supplied island illustration, cleaned of baked event UI.
// Regional calibration is approximate; real venue coordinates remain unchanged.
// GSAP https://gsap.com/; Motion for Vue (MIT) https://motion.dev/docs/vue.
const props = defineProps({ events: { type: Array, default: () => [] }, prominentIds: { type: Array, default: () => [] }, loading: Boolean, error: String, region: { type: Object, default: null } })
gsap.registerPlugin(ScrollTrigger)
const emit = defineEmits(['retry', 'list'])
const reduced = useReducedMotion()
const scene = ref(null)
const svg = ref(null)
const paused = ref(false)
const zoom = ref(1)
const viewport = ref({ width: 1200, height: 900 })
// Keep hit areas at CSS-pixel size, rather than shrinking them with the island.
const markerScale = computed(() => 1 / (Math.min(viewport.value.width / 1200, viewport.value.height / 900) * zoom.value))
const center = ref({ x: 600, y: 450 })
const selection = ref([])
const selectedId = ref(null)
const preview = ref(null)
const previewTitle = ref(null)
let markerOpener
const points = computed(() => props.events.flatMap(e => {
  const point = projectIllustratedVenue(e)
  return point ? [{ ...e, ...point }] : []
}))
const missingCount = computed(() => props.events.length - points.value.length)
const groups = computed(() => {
  if (props.loading || props.error) return []
  const placed = []
  for (const group of groupMarkers(points.value, zoom.value, props.prominentIds.slice(0, 3))) {
    let x = group.x, y = group.y
    // Keep co-located prominent markers usable. A connector preserves the
    // actual venue anchor when the visible button needs room around it.
    for (let step = 0; step < 18 && placed.some(p => Math.hypot(p.displayX - x, p.displayY - y) < 50 * markerScale.value); step++) {
      const angle = step * 2.4
      const radius = (50 + step * 7) * markerScale.value
      x = group.x + Math.cos(angle) * radius
      y = group.y + Math.sin(angle) * radius
    }
    placed.push({ ...group, displayX: x, displayY: y })
  }
  return placed
})
const selected = computed(() => props.events.find(e => e.id === selectedId.value))
const viewBox = computed(() => `${center.value.x - 600 / zoom.value} ${center.value.y - 450 / zoom.value} ${1200 / zoom.value} ${900 / zoom.value}`)
let gesture
let context
let resizeObserver
function setZoom(value, point = center.value) {
  zoom.value = Math.max(1, Math.min(3.5, value))
  center.value = zoom.value === 1 ? { x: 600, y: 450 } : {
    x: Math.max(200, Math.min(1000, point.x)), y: Math.max(120, Math.min(800, point.y)),
  }
}
function home() { setZoom(1); selection.value = []; selectedId.value = null }
function pan(dx, dy) { center.value = { x: Math.max(150, Math.min(1050, center.value.x + dx / zoom.value)), y: Math.max(100, Math.min(800, center.value.y + dy / zoom.value)) } }
function choose(group) {
  markerOpener = document.activeElement
  selection.value = group.events
  selectedId.value = group.events.length === 1 ? group.events[0].id : null
  if (group.events.length > 1) setZoom(Math.max(zoom.value, 2.2), group)
}
async function openClusterEvent(id) {
  selectedId.value = id
  await nextTick()
  previewTitle.value?.focus({ preventScroll: true })
}
const selectionAnnouncement = computed(() => selected.value ? `Selected event: ${selected.value.title}. Event preview is available after the map controls.` : selection.value.length ? `${selection.value.length} events selected. Choose an event from the preview.` : '')
function startDrag(event) {
  if (event.pointerType === 'touch' || event.target.closest('[data-marker]')) return
  const bounds = svg.value.getBoundingClientRect()
  gesture = { x: event.clientX, y: event.clientY, center: { ...center.value }, scale: Math.min(bounds.width / 1200, bounds.height / 900) * zoom.value, moved: false }
  svg.value.setPointerCapture(event.pointerId)
}
function drag(event) {
  if (!gesture || !svg.value.hasPointerCapture(event.pointerId)) return
  const dx = (event.clientX - gesture.x) / gesture.scale
  const dy = (event.clientY - gesture.y) / gesture.scale
  if (Math.abs(dx) + Math.abs(dy) > 5) gesture.moved = true
  center.value = { x: Math.max(150, Math.min(1050, gesture.center.x - dx)), y: Math.max(100, Math.min(800, gesture.center.y - dy)) }
}
function endDrag(event) {
  if (svg.value.hasPointerCapture(event.pointerId)) svg.value.releasePointerCapture(event.pointerId)
}
function keyMarker(event, group) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(group) } }
function dateLabel(event) { return new Date(event.start_time).toLocaleDateString('en-SG', { weekday: 'short', month: 'short', day: 'numeric' }) }
watch(() => props.region, region => {
  const point = region && projectIllustratedVenue(region)
  if (point) setZoom(2.2, point)
}, { immediate: true })
watch(() => props.events, () => {
  selection.value = []
  selectedId.value = null
})
function dismiss() {
  selection.value = []
  selectedId.value = null
  if (markerOpener?.isConnected) markerOpener.focus({ preventScroll: true })
}
onMounted(() => {
  resizeObserver = new ResizeObserver(([entry]) => {
    viewport.value = { width: Math.max(1, entry.contentRect.width), height: Math.max(1, entry.contentRect.height) }
  })
  resizeObserver.observe(svg.value)
  context = gsap.matchMedia()
  context.add('(prefers-reduced-motion: no-preference)', () => {
    gsap.fromTo(scene.value, { opacity: .3, y: 14 }, { opacity: 1, y: 0, duration: .7, ease: 'power2.out', clearProps: 'opacity,transform', scrollTrigger: { trigger: scene.value, start: 'top 95%', once: true } })
  })
})
onBeforeUnmount(() => { context?.revert(); resizeObserver?.disconnect() })
</script>

<template>
  <section class="island-explorer" aria-label="Explore events on the Singapore map" :aria-busy="loading" data-lenis-prevent @keydown.esc="dismiss">
    <p class="visually-hidden" role="status" aria-live="polite">{{ selectionAnnouncement }}</p>
    <div class="map-surface" ref="scene">
      <div class="map-caption">Your island, your next adventure <span class="map-caption-line"></span></div>
      <svg ref="svg" class="island-svg" :viewBox="viewBox" role="group" aria-label="Illustrated Singapore event map. Use markers or the pan and zoom buttons to explore." @pointerdown="startDrag" @pointermove="drag" @pointerup="endDrag" @pointercancel="endDrag">
        <IslandArtwork :paused="paused" />
        <path v-for="group in groups" :key="`connector-${group.key}`" :d="`M${group.x},${group.y}L${group.displayX},${group.displayY}`" stroke="#66816c" stroke-width="1.5" stroke-dasharray="3 3" aria-hidden="true" />
        <g v-for="(group, index) in groups" :key="group.key" :transform="`translate(${group.displayX} ${group.displayY}) scale(${markerScale})`" :style="{ '--marker-index': index % 6 }" data-marker role="button" tabindex="0" :aria-label="group.events.length > 1 ? `${group.events.length} events near ${group.events[0].venue_name || 'this location'}` : `Preview ${group.events[0].title}`" :aria-pressed="selection.some(e => group.events.some(g => g.id === e.id))" class="map-marker" :class="{ 'map-marker--featured': group.prominent }" @click.stop="choose(group)" @keydown="keyMarker($event, group)">
          <title>{{ group.events.length > 1 ? `${group.events.length} events` : group.events[0].title }}</title>
          <circle r="26" fill="transparent" />
          <ellipse cy="15" rx="17" ry="5" fill="#426b591c" />
          <g class="marker-icon">
          <path d="M-19-12a19 19 0 1 1 38 0c0 12-19 28-19 28s-19-16-19-28" :fill="group.prominent ? '#e9725c' : group.events.length > 1 ? '#344f43' : '#fffdfa'" :stroke="group.prominent ? '#fff9ef' : '#56785e'" stroke-width="2" />
          <text v-if="group.events.length > 1" y="-5" text-anchor="middle" fill="#fffdfa" class="marker-count">{{ group.events.length }}</text>
          <path v-else d="m-6-12 4 4 8-9" fill="none" :stroke="group.prominent ? '#292d32' : '#9b482e'" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          </g>
          <g v-if="group.prominent && zoom === 1" class="marker-tag-group"><rect x="-68" y="-63" width="136" height="27" rx="13" fill="#fffdfa" stroke="#e4ddce"/><text y="-45" text-anchor="middle" class="marker-tag">{{ (group.events[0].category || group.events[0].tags?.[0] || 'For you').replace(/[_-]/g, ' ') }}</text></g>
        </g>
      </svg>
      <div v-if="loading" class="map-message" role="status"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span> Finding events around Singapore…</div>
      <div v-else-if="error" class="map-message" role="alert">The map couldn’t load. <button class="btn btn-link btn-sm" @click="emit('retry')">Try again</button></div>
      <div v-else-if="!points.length" class="map-message" role="status">{{ events.length ? 'These events don’t have a map location yet. Explore them in the list.' : 'No events match your search. Try another category or date.' }}</div>
      <div class="map-controls" role="group" aria-label="Map controls">
        <button type="button" aria-label="Zoom in" :disabled="zoom >= 3.5" @click="setZoom(zoom + .5)">+</button>
        <button type="button" aria-label="Zoom out" :disabled="zoom <= 1" @click="setZoom(zoom - .5)">−</button>
        <button type="button" aria-label="Return to island view" @click="home"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m3 10 9-7 9 7M6 9v11h12V9M10 20v-7h4v7"/></svg></button>
        <details class="pan-controls"><summary aria-label="Pan map">↔</summary><div><button aria-label="Pan north" @click="pan(0,-80)">↑</button><button aria-label="Pan west" @click="pan(-100,0)">←</button><button aria-label="Pan east" @click="pan(100,0)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6"/></svg></button><button aria-label="Pan south" @click="pan(0,80)">↓</button></div></details>
      </div>
      <button class="map-motion-toggle" type="button" :aria-pressed="paused" @click="paused = !paused">{{ paused ? 'Play island animations' : 'Pause island animations' }}</button>
      <div class="map-key"><span><i class="legend-featured"></i> Picked for you</span><span><i class="legend-cluster"></i> Local events</span></div>
      <p class="map-credit">Illustrated locations are approximate · See event details for the exact venue</p>
    </div>
    <motion.div v-if="selection.length" :key="selectedId ?? selection.map(event => event.id).join(',')" ref="preview" class="map-preview" :initial="reduced ? false : { opacity: 0, y: 24, scale: .88 }" :animate="{ opacity: 1, y: 0, scale: 1 }" :transition="reduced ? { duration: 0 } : { type: 'spring', stiffness: 360, damping: 24 }" role="region" aria-label="Selected map events">
      <button class="preview-close" type="button" aria-label="Close event preview" @click="dismiss">×</button>
      <template v-if="selected">
        <p class="preview-kicker">{{ selected.category || selected.tags?.[0] || 'Discover something new' }}</p>
        <h2 ref="previewTitle" tabindex="-1">{{ selected.title }}</h2>
        <p class="preview-date">{{ dateLabel(selected) }} · {{ new Date(selected.start_time).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit' }) }}</p>
        <p class="preview-venue">{{ selected.venue_name || 'Venue to be announced' }}</p>
        <p v-if="selected.registration_status" class="preview-status">{{ selected.registration_status === 'confirmed' ? 'You’re going' : selected.registration_status === 'pending' ? 'Pending approval' : selected.registration_status }}</p>
        <div class="d-flex gap-2 flex-wrap"><RouterLink :to="`/events/${selected.id}/rsvp`" class="btn event-cta">View event</RouterLink><RouterLink :to="{ path: `/events/${selected.id}/rsvp`, hash: '#rsvp' }" class="btn event-cta event-cta--secondary">RSVP</RouterLink></div>
      </template>
      <template v-else><p class="preview-kicker">A little closer</p><h2>{{ selection.length }} events in this spot</h2><ul class="cluster-events"><li v-for="event in selection" :key="event.id"><button @click="openClusterEvent(event.id)">{{ event.title }}<span>{{ dateLabel(event) }}</span></button></li></ul></template>
    </motion.div>
    <div class="map-bottomline"><span>{{ points.length }} {{ points.length === 1 ? 'event' : 'events' }} on the map<template v-if="missingCount"> · {{ missingCount }} more in the list</template></span><button type="button" @click="emit('list')">Explore the event list</button></div>
  </section>
</template>

<style scoped>
.island-explorer { position: relative; }
.map-surface { position: relative; background: var(--bookedz-canvas); overflow: hidden; min-height: 480px; border-radius: 0 0 28px 28px; }
.island-svg { display: block; width: 100%; height: clamp(580px,65vw,900px); cursor: grab; touch-action: pan-y; }
.island-svg:active { cursor: grabbing; }
.map-caption { position: absolute; top: 25px; left: 32px; display: flex; align-items: center; gap: 9px; color: var(--bookedz-muted); font-size: .75rem; z-index: 1; pointer-events: none; padding: 7px 12px; border-radius: 99px; background: var(--bookedz-map-overlay); }
.map-caption-dot { width: 7px; height: 7px; background: var(--bookedz-success); border-radius: 50%; }.map-caption-line { width: 50px; height: 1px; background: var(--bookedz-mint); }
.map-marker { cursor: pointer; outline: none; }.map-marker:focus-visible .marker-icon > path,.map-marker[aria-pressed=true] .marker-icon > path { stroke: var(--bookedz-primary-dark); stroke-width: 5px; }.map-marker:hover .marker-icon > path { stroke: var(--bookedz-primary-dark); }
.marker-icon { transform-origin: 0 -10px; transition: transform .22s cubic-bezier(.2,1.6,.4,1); }
.map-marker:is(:hover,:focus-visible) .marker-icon { transform: translateY(-4px) scale(1.12); }
.map-marker[aria-pressed=true] .marker-icon { transform: translateY(-6px) scale(1.2); }
.map-motion-toggle { position: absolute; left: 32px; top: 70px; min-height: 44px; padding: 7px 12px; border: 1px solid var(--bookedz-muted-border); border-radius: 99px; background: var(--bookedz-map-overlay); color: var(--bookedz-ink); font-size: .7rem; }
@media(prefers-reduced-motion:reduce) { .marker-icon { transition: none; } }
.marker-tag-group { pointer-events: none; opacity: 0; transition: opacity .16s ease; }.map-marker:hover .marker-tag-group,.map-marker:focus-visible .marker-tag-group { opacity: 1; }
@keyframes marker-arrive { from { opacity: 0; } to { opacity: 1; } }
@media(prefers-reduced-motion:no-preference) { .map-marker { animation: marker-arrive .35s ease both; animation-delay: calc(var(--marker-index) * 45ms); } }
.marker-count { font: 700 14px var(--bookedz-heading); }.marker-tag { font: 600 11px var(--bookedz-heading); fill: var(--bookedz-ink); text-transform: capitalize; }
.map-controls { position: absolute; right: 24px; bottom: 50px; display: flex; flex-direction: column; gap: 5px; border-radius: 15px; padding: 5px; background: var(--bookedz-surface); border: 1px solid var(--bookedz-muted-border); box-shadow: var(--bookedz-map-shadow); }
.map-controls button,.pan-controls summary { display: grid; place-content: center; width: 44px; height: 44px; border: 0; background: transparent; font-size: 1.4rem; color: var(--bookedz-ink); border-radius: 10px; }.map-controls button:hover,.pan-controls summary:hover { background: var(--bookedz-hover); }.map-controls button:disabled { opacity: 1; cursor: not-allowed; background: var(--bookedz-disabled-bg); color: var(--bookedz-disabled-ink); }.map-controls svg { width: 20px; height: 20px; }.pan-controls summary { cursor: pointer; list-style: none; }.pan-controls div { position: absolute; right: 60px; bottom: 0; background: var(--bookedz-surface); border: 1px solid var(--bookedz-muted-border); border-radius: 12px; display: grid; grid-template-columns: repeat(2,44px); }
.map-key { padding: 6px 9px; border-radius: 99px; background: var(--bookedz-map-overlay); position: absolute; bottom: 26px; left: 32px; display: flex; flex-wrap: wrap; gap: 16px; font-size: .7rem; color: var(--bookedz-muted); }.map-key span { display: flex; align-items: center; gap: 7px; }.map-key i { width: 9px; height: 9px; border-radius: 50%; }.legend-featured { background: var(--bookedz-primary); }.legend-cluster { background: var(--bookedz-forest); }
.map-credit { padding: 2px 5px; border-radius: 5px; background: var(--bookedz-map-overlay); position: absolute; right: 28px; bottom: 11px; font-size: .75rem; margin: 0; color: var(--bookedz-muted); }.map-credit a { color: inherit; }
.map-message { position: absolute; bottom: 75px; left: 50%; transform: translateX(-50%); max-width: calc(100% - 150px); background: var(--bookedz-surface); border: 1px solid var(--bookedz-muted-border); border-radius: 15px; padding: 12px 20px; font-size: .85rem; display: flex; align-items: center; gap: 10px; box-shadow: var(--bookedz-shadow); }
.map-bottomline { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 15px 32px; font-size: .75rem; color: var(--bookedz-muted); }.map-bottomline button { border: 0; background: none; color: var(--bookedz-primary-dark); font-weight: 600; min-height: 44px; }
.map-preview { position: absolute; top: 35px; right: 95px; width: 300px; max-height: calc(100% - 120px); overflow-y: auto; padding: 26px; border: 1px solid var(--bookedz-muted-border); border-radius: 22px; background: var(--bookedz-surface); box-shadow: var(--bookedz-preview-shadow); z-index: 3; }.map-preview h2 { text-wrap: balance; font-size: 1.5rem; margin-bottom: 12px; padding-right: 12px; }.preview-close { position: absolute; top: 8px; right: 8px; width: 40px; height: 40px; border: 0; border-radius: 50%; background: transparent; font-size: 1.4rem; color: var(--bookedz-muted); }.preview-kicker { margin: 0 0 12px; font-size: .75rem; color: var(--bookedz-primary-dark); font-weight: 600; text-transform: capitalize; }.preview-date,.preview-venue { font-size: .85rem; color: var(--bookedz-muted); margin-bottom: 10px; }.preview-venue { margin-bottom: 22px; }.preview-status { color: var(--bookedz-success); font-size: .8rem; }
.cluster-events { list-style: none; margin: 0; padding: 0; }.cluster-events button { text-align: left; border: 0; border-top: 1px solid var(--bookedz-border); background: none; padding: 14px 0; width: 100%; font-size: .85rem; font-weight: 600; color: var(--bookedz-ink); }.cluster-events span { display: block; font-size: .75rem; color: var(--bookedz-muted); margin-top: 4px; }
@media(min-width:1500px) { .island-svg { height: 900px; } }
@media(max-width:767px) { .marker-tag-group { display: none; } .map-surface { min-height: 350px; border-radius: 0 0 22px 22px; }.island-svg { height: 350px; }.map-caption { left: 18px; top: 18px; font-size: .65rem; }.map-caption-line { display: none; }.map-controls { right: 12px; bottom: 52px; }.map-key { left: 18px; bottom: 22px; gap: 10px; font-size: .65rem; }.map-credit { font-size: .7rem; right: 18px; bottom: 4px; }.map-preview { position: relative; top: auto; right: auto; width: auto; max-height: 360px; margin: 12px; padding: 22px; box-shadow: var(--bookedz-map-shadow); }.map-bottomline { padding: 4px 18px 14px; font-size: .7rem; gap: 4px; }.map-message { bottom: 60px; left: 14px; transform: none; max-width: calc(100% - 90px); padding: 10px 12px; font-size: .75rem; } }
@media(max-width:767px) {
  .map-motion-toggle { position: static; display: block; margin: 6px auto; }
  .map-controls { position: relative; right: auto; bottom: auto; flex-direction: row; width: max-content; margin: 8px auto; }
  .pan-controls div { right: 0; bottom: 60px; }
  .map-key { position: static; width: max-content; max-width: 100%; justify-content: center; margin: 6px auto; }
  .map-credit { position: static; text-align: center; margin: 6px 12px 12px; }
}
</style>
