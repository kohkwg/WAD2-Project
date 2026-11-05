<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import L from 'leaflet';
import { createVNode, render } from 'vue';
import EventArtwork from '../EventArtwork.vue';
import { groupOfCategory } from '@/lib/eventGroups';
import 'leaflet/dist/leaflet.css';
import { searchPlace } from '../../lib/onemap';
import { addOneMapTiles, SINGAPORE_MAX_BOUNDS } from '../../lib/onemapTiles';

const props = defineProps({
  events: {
    type: Array,
    default: () => []
  },
  prominentIds: {
    type: Array,
    default: () => []
  },
  focusedEventId: {
    type: String,
    default: null
  },
  searchText: {
    type: String,
    default: ''
  },
  loading: Boolean,
  error: String,
  large: Boolean
});

const emit = defineEmits(['select', 'retry', 'toggle-size']);

const container = ref(null);

const selectedId = ref(null);

const tileError = ref(false);

const place = ref(null);

const zoomed = ref(false);

const zoomLevel = ref(11);

const points = computed(() => props.events.flatMap(event => {
  const lat = event.lat ?? event.venue?.lat;
  const lng = event.lng ?? event.venue?.lng;
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 1.15 && lat <= 1.49 && lng >= 103.59 && lng <= 104.1 ? [{
    event,
    lat,
    lng
  }] : [];
}));

const selected = computed(() => props.events.find(event => event.id === selectedId.value));

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// pins reuse the group's artwork. each group is rendered once and cached as markup.

const artCache = new Map();

function artMarkup(category) {
  const key = groupOfCategory(category)?.id || 'other';
  if (!artCache.has(key)) {
    const holder = document.createElement('div');
    render(createVNode(EventArtwork, {
      category
    }), holder);
    artCache.set(key, holder.innerHTML);
    render(null, holder);
  }
  return artCache.get(key);
}

let fittedSignature = '';

let map, tiles, stopTiles, markers, placeLayer, observer, opener, placeTimer, placeAbort;

let renderFrame;

// the map only shows where an event is: choosing one highlights its pin and zooms to its area.
// its details and actions live on the event's card in the list.

function choose(event) {
  opener = document.activeElement;
  selectedId.value = event.id;
  emit('select', event.id);
  showPoint(event.id);
}
// centre on the event at street level (zoom 15 shows the surrounding neighbourhood); a closer
// zoom the person already chose is kept.

const AREA_ZOOM = 15;

function showPoint(id) {
  const point = points.value.find(point => point.event.id === id);
  if (!map || !point) return;
  map.setView([point.lat, point.lng], Math.max(map.getZoom(), AREA_ZOOM), {
    animate: !reduced()
  });
  scheduleMarkers();
}

function dismiss() {
  if (!selectedId.value) return;
  selectedId.value = null;
  emit('select', null);
  scheduleMarkers();
  if (opener?.isConnected && opener.getClientRects().length) opener.focus();else container.value?.parentElement.querySelector('.street-chip--action, .street-zoom-plus')?.focus();
}
// the whole island, tuas to changi, fills the frame; zooming out stops there so no empty margin shows.

const SINGAPORE = L.latLngBounds([1.21, 103.6], [1.48, 104.09]);
// zoom that shows the island without going past where the tiles end. clamped, so a box that is
// briefly tiny (mid-layout, hidden pane) can never ask for a zoom with no tiles, which looked
// like the map vanishing.

function frameZoom() {
  const size = map.getSize();
  if (!size.x || !size.y) return null;
  const zoom = Math.max(map.getBoundsZoom(SINGAPORE), map.getBoundsZoom(SINGAPORE_MAX_BOUNDS, true));
  return Number.isFinite(zoom) ? Math.min(13, Math.max(9, zoom)) : null;
}

function frameSingapore() {
  const zoom = map && frameZoom();
  if (!zoom) return;
  map.setMinZoom(zoom);
  map.setView(SINGAPORE.getCenter(), zoom, {
    animate: false
  });
  map.panInsideBounds(SINGAPORE_MAX_BOUNDS, {
    animate: false
  });
}

function fitEvents() {
  if (!map) return;
  if (place.value) {
    map.setView([place.value.lat, place.value.lng], 16, {
      animate: !reduced()
    });
    return;
  }
  frameSingapore();
}

// Draw the pins one time per animation frame, because many events can ask for a redraw.
function scheduleMarkers() {
  cancelAnimationFrame(renderFrame);
  renderFrame = requestAnimationFrame(renderMarkers);
}

/**
 * Draw the event pins for the current zoom.
 * Near events join one cluster. A featured event keeps its own pin unless it shares a location.
 */
function renderMarkers() {
  if (!map || !markers) return;
  markers.clearLayers();
  if (props.loading || props.error) return;
  const prominent = new Set(props.prominentIds.slice(0, 3));
  const groups = [];
  for (const point of points.value) {
    const pixel = map.latLngToLayerPoint([point.lat, point.lng]);
    const featured = prominent.has(point.event.id);
    const nearby = !featured && groups.find(group => !group.featured && pixel.distanceTo(group.pixel) < 38);
    if (nearby) nearby.events.push(point.event);else groups.push({
      ...point,
      pixel,
      featured,
      events: [point.event]
    });
  }
  // prominent co-located events share an honest count rather than hiding a pin.
  const located = [];
  for (const group of groups) {
    const same = located.find(other => Math.abs(other.lat - group.lat) < .000001 && Math.abs(other.lng - group.lng) < .000001);
    if (same) {
      same.events.push(...group.events);
      same.featured ||= group.featured;
    } else located.push(group);
  }
  for (const group of located) {
    const active = group.events.some(event => event.id === selectedId.value);
    const count = group.events.length;
    // single pins use their category colour (same as the chips); picks are orange stars;
    // clusters are neutral with a count, and a small star when they contain a pick.
    const category = String(group.events[0].category || group.events[0].tags?.[0] || '').toLowerCase();
    const names = group.events.slice(0, 3).map(event => event.title).join(', ') + (count > 3 ? ` and ${count - 3} more` : '');
    const label = count > 1 ? `${count} events near ${group.events[0].venue_name || 'this venue'}: ${names}` : `${group.events[0].title}${category ? `, ${category}` : ''}`;
    const icon = L.divIcon({
      className: `street-marker${count > 1 ? ' street-marker--cluster' : ` cat-${category}`}${group.featured ? ' street-marker--featured' : ''}${active ? ' street-marker--selected' : ''}`,
      html: `<span class="street-pin street-pin--art"><span class="street-art">${artMarkup(category)}</span>${count > 1 ? `<b class="street-pin-count">${count}</b>` : ''}${group.featured ? '<i class="street-pin-star" aria-hidden="true">★</i>' : ''}</span>`,
      iconSize: [44, 44],
      iconAnchor: [22, 22]
    });
    const marker = L.marker([group.lat, group.lng], {
      icon,
      keyboard: true,
      title: label,
      alt: label,
      zIndexOffset: active ? 1000 : 0
    }).addTo(markers);
    const el = marker.getElement();
    el?.setAttribute('data-marker', '');
    el?.setAttribute('aria-label', label);
    el?.setAttribute('aria-pressed', String(active));
    // a cluster zooms in until its pins separate; events at the very same venue never separate,
    // so those (or a cluster already at the closest zoom) choose the first and the list shows it
    const sameVenue = group.events.every(event => {
      const point = points.value.find(p => p.event.id === event.id);
      return point && Math.abs(point.lat - group.lat) < .000001 && Math.abs(point.lng - group.lng) < .000001;
    });
    const open = () => {
      if (count === 1 || sameVenue || map.getZoom() >= 19) choose(group.events[0]);else map.setView([group.lat, group.lng], Math.min(19, map.getZoom() + 2), {
        animate: !reduced()
      });
    };
    marker.on('click', open);
    el?.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        open();
      }
    });
  }
}
function clearPlace() {
  place.value = null;
  placeLayer?.clearLayers();
}

/**
 * Use the search text as a place name when no event matches it.
 * Then show a marker at that place and centre the map on the marker.
 */
function lookupPlace() {
  clearTimeout(placeTimer);
  placeAbort?.abort();
  const text = props.searchText.trim();
  if (text.length < 3 || props.loading || props.error || props.events.length) {
    if (place.value) {
      clearPlace();
      fitEvents();
    }
    return;
  }
  placeTimer = setTimeout(async () => {
    placeAbort = new AbortController();
    try {
      const found = await searchPlace(text, placeAbort.signal);
      if (!found || !map) {
        clearPlace();
        return;
      }
      place.value = found;
      placeLayer.clearLayers();
      L.marker([found.lat, found.lng], {
        interactive: false,
        icon: L.divIcon({
          className: 'street-marker street-place',
          html: '<span class="street-pin street-pin--place"><span>●</span></span>',
          iconSize: [44, 44],
          iconAnchor: [22, 22]
        })
      }).bindTooltip(found.name, {
        permanent: true,
        direction: 'top',
        offset: [0, -18],
        className: 'street-tip'
      }).addTo(placeLayer);
      map.setView([found.lat, found.lng], 16, {
        animate: !reduced()
      });
    } catch (failure) {
      if (failure.name !== 'AbortError') clearPlace();
    }
  }, 400);
}

function zoomOutAll() {
  clearPlace();
  fitEvents();
}

function retryTiles() {
  tileError.value = false;
  tiles?.redraw();
}

function zoomIn() {
  map?.zoomIn();
}

function zoomOut() {
  map?.zoomOut();
}

onMounted(() => {
  // Quarter-step zoom lets the map fit the island closely. A full step leaves large margins.
  // The component supplies its own zoom buttons, so the Leaflet zoom control is off.
  map = L.map(container.value, {
    scrollWheelZoom: false,
    zoomControl: false,
    zoomSnap: 0.25,
    minZoom: 9,
    maxZoom: 19,
    maxBounds: SINGAPORE_MAX_BOUNDS,
    maxBoundsViscosity: 1
  }).setView([1.3521, 103.8198], 11);
  // night tiles in dark mode, so the map does not glare inside the dark interface.
  stopTiles = addOneMapTiles(map);
  tiles = stopTiles.layer;
  // edge tiles over the sea or johor are missing from onemap; only warn when nothing loaded.
  let loadedTiles = 0,
    failedTiles = 0;
  tiles.on('loading', () => {
    loadedTiles = 0;
    failedTiles = 0;
  });
  tiles.on('tileload', () => {
    loadedTiles++;
    tileError.value = false;
  });
  tiles.on('tileerror', () => {
    failedTiles++;
  });
  tiles.on('load', () => {
    tileError.value = failedTiles > 0 && loadedTiles === 0;
  });
  markers = L.layerGroup().addTo(map);
  placeLayer = L.layerGroup().addTo(map);
  map.on('zoomend', () => {
    zoomLevel.value = map.getZoom();
    zoomed.value = map.getZoom() >= 14;
    scheduleMarkers();
  });
  // wheel zoom only after clicking the map, so scrolling the page never gets trapped.
  map.on('click', () => map.scrollWheelZoom.enable());
  map.on('mouseout', () => map.scrollWheelZoom.disable());
  // a map hidden by the phone list | map toggle has no size; when it's shown again, re-frame the
  // selected event (or all events) instead of keeping a view worked out at zero size
  let wasHidden = false;
  observer = new ResizeObserver(([entry]) => {
    if (!entry.contentRect.width || !entry.contentRect.height) {
      wasHidden = true;
      return;
    }
    map?.invalidateSize({
      pan: false
    });
    if (map) {
      const atFrame = map.getZoom() <= map.getMinZoom() + 0.01;
      const zoom = frameZoom();
      if (zoom) map.setMinZoom(zoom);
      if (zoom && atFrame && !selectedId.value && !place.value) frameSingapore();
    }
    if (wasHidden) {
      wasHidden = false;
      if (selectedId.value) showPoint(selectedId.value);else fitEvents();
    }
    scheduleMarkers();
  });
  observer.observe(container.value);
  fitEvents();
  scheduleMarkers();
  if (props.focusedEventId) {
    selectedId.value = props.focusedEventId;
    showPoint(props.focusedEventId);
  }
});

watch([() => props.events, () => props.prominentIds, () => props.loading, () => props.error], () => {
  if (!props.events.some(event => event.id === selectedId.value)) selectedId.value = null;
  // re-fit only when the set of events changed, so panning and zooming survive a refresh.
  const signature = props.events.map(event => event.id).join(',');
  if (signature !== fittedSignature) {
    fittedSignature = signature;
    fitEvents();
  }
  if (props.focusedEventId) showPoint(props.focusedEventId);
  scheduleMarkers();
});

watch([() => props.searchText, () => props.events, () => props.loading, () => props.error], lookupPlace);

watch(() => props.focusedEventId, id => {
  if (!id) {
    if (selectedId.value) {
      selectedId.value = null;
      scheduleMarkers();
    }
    return;
  }
  opener = document.activeElement;
  selectedId.value = id;
  showPoint(id);
});

onBeforeUnmount(() => {
  stopTiles?.();
  clearTimeout(placeTimer);
  placeAbort?.abort();
  observer?.disconnect();
  cancelAnimationFrame(renderFrame);
  map?.remove();
  map = null;
});
</script>

<template>
  <section
  class="discovery-street-map"
  :class="{ 'has-selection': selected }"
  aria-label="Explore events on the Singapore map"
  :aria-busy="loading"
  @keydown.esc="dismiss">
    <div
    ref="container"
    class="street-map-canvas"
    aria-label="Singapore street map. Use event pins or zoom controls to explore."></div>
    <!-- one chip: how many events are on the map, or the way back to all of them once zoomed in -->
    <button
    v-if="zoomed"
    type="button"
    class="street-chip street-chip--action"
    @click="zoomOutAll">{{ points.length ? `← Show all ${points.length} ${points.length === 1 ? 'event' : 'events'}` : '← Zoom out' }}</button>
    <span v-else class="street-chip">{{ points.length }} {{ points.length === 1 ? 'event' : 'events' }} on the map</span>
    <button
    type="button"
    class="street-expand"
    :aria-label="large ? 'Shrink map' : 'Enlarge map'"
    :aria-pressed="large"
    @click="emit('toggle-size')">
      <svg viewBox="0 0 24 24" aria-hidden="true">
      <path :d="large ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5' : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'" /></svg>
    </button>
    <div class="street-zoom" role="group" aria-label="Map zoom">
      <button
      type="button"
      class="street-zoom-plus"
      aria-label="Zoom in"
      :disabled="zoomLevel >= 19"
      @click="zoomIn">+</button>
      <button
      type="button"
      class="street-zoom-minus"
      aria-label="Zoom out"
      :disabled="zoomLevel <= 11"
      @click="zoomOut">−</button>
    </div>
    <div v-if="loading" class="street-map-message" role="status">Finding events…</div>
    <div
    v-dismissible
    v-else-if="error"
    class="street-map-message"
    role="alert">{{ error }} <button type="button" @click="emit('retry')">Try again</button></div>
    <div
    v-else-if="!points.length && !place"
    class="street-map-message"
    role="status">{{ events.length ? 'These events have no map coordinates yet. Their details are available in the list.' : 'No events match your search.' }}</div>
    <div
    v-dismissible
    v-if="tileError"
    class="street-tile-error"
    role="status">Map background couldn’t load. <button type="button" @click="retryTiles">Retry map</button></div>
    <p class="visually-hidden" aria-live="polite">{{ selected ? `Showing ${selected.title} on the map` : '' }}</p>
  </section>
</template>

<style scoped>
/* framed like the app's cards: an 8px surface border, 20px corners and a soft shadow */

.discovery-street-map {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  padding: 0;
  border: 1px solid var(--dino-border);
  border-radius: 20px;
  background: var(--dino-surface);
  box-shadow: var(--dino-card-shadow);
}

/* desktop: the pinned card ends 48px above the screen bottom (84px = 18px above + 48px below +
   the frame; --topbar-h is the top bar when it shows) */

.street-map-canvas {
  position: relative;
  z-index: 0;
  width: 100%;
  aspect-ratio: 1.7 / 1;
  overflow: hidden;
  border-radius: 0;
  background: var(--dino-hover);
}

.street-chip {
  position: absolute;
  z-index: 450;
  top: 20px;
  left: 20px;
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  max-width: calc(100% - 40px);
  padding: 6px 14px;
  border: 1px solid var(--dino-border);
  border-radius: 99px;
  background: var(--dino-surface);
  color: var(--dino-ink);
  font-size: 12px;
  font-weight: 600;
  box-shadow: var(--dino-card-shadow);
}

.street-chip--action {
  min-height: 44px;
  color: var(--dino-primary-dark);
  font-weight: 700;
  cursor: pointer;
}

.street-chip--action:hover {
  background: var(--dino-hover);
}

/* + and − in one stack at the bottom right, above the map credits */

.street-zoom {
  position: absolute;
  z-index: 450;
  right: 20px;
  bottom: 36px;
  display: grid;
  overflow: hidden;
  border: 1px solid var(--dino-border);
  border-radius: 12px;
  background: var(--dino-surface);
  box-shadow: var(--dino-card-shadow);
}

.street-zoom button {
  width: 40px;
  height: 40px;
  border: 0;
  background: transparent;
  color: var(--dino-ink);
  font-size: 20px;
  line-height: 1;
}

.street-zoom button + button {
  border-top: 1px solid var(--dino-border);
}

.street-zoom button:hover:not(:disabled) {
  background: var(--dino-hover);
}

.street-zoom button:disabled {
  color: var(--dino-disabled-ink);
  cursor: not-allowed;
}

.street-zoom button:focus-visible {
  outline-offset: -3px;
}

.street-map-message,.street-tile-error {
  position: absolute;
  z-index: 480;
  left: 20px;
  right: 76px;
  bottom: 20px;
  padding: 10px;
  border: 1px solid var(--dino-border);
  border-radius: 12px;
  background: var(--dino-surface);
  color: var(--dino-ink);
  font-size: 12px;
  box-shadow: var(--dino-card-shadow);
}

.street-tile-error {
  bottom: 72px;
}

.street-map-message button,.street-tile-error button {
  min-height: 36px;
  border: 0;
  background: transparent;
  color: var(--dino-primary-dark);
  text-decoration: underline;
}

:deep(.street-tip) {
  padding: 6px 10px;
  border: 0;
  border-radius: 8px;
  background: var(--dino-ink);
  color: var(--dino-surface);
  font-size: 12px;
  line-height: 1.35;
}

:deep(.street-tip::before) {
  border-top-color: var(--dino-ink);
}

:deep(.street-marker) {
  background: transparent;
  border: 0;
  display: grid;
  place-items: center;
}

:deep(.street-pin) {
  position: relative;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 2.5px solid var(--dino-surface);
  border-radius: 50%;
  background: var(--cat-hue, var(--dino-pink));
  color: var(--dino-on-fill);
  font-size: 13px;
  font-weight: 700;
  box-shadow: 0 2px 8px #1f293740;
  transition: transform var(--dino-motion-fast) var(--dino-ease);
}

:deep(.street-marker--cluster .street-pin) {
  width: 34px;
  height: 34px;
  background: var(--dino-ink);
  color: var(--dino-surface);
}

:deep(.street-marker--featured:not(.street-marker--cluster) .street-pin) {
  width: 32px;
  height: 32px;
  background: var(--dino-primary);
  font-size: 15px;
}

:deep(.street-pin-star) {
  position: absolute;
  top: -6px;
  right: -6px;
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--dino-primary);
  color: var(--dino-on-fill);
  font-size: 9px;
  font-style: normal;
}

:deep(.street-pin--art) {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--dino-surface);
  box-shadow: 0 2px 8px #1f293740;
}

:deep(.street-art) {
  display: block;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 9px;
}

:deep(.street-art svg) {
  display: block;
  width: 100%;
  height: 100%;
}

:deep(.street-marker--featured:not(.street-marker--cluster) .street-pin--art) {
  width: 40px;
  height: 40px;
  background: var(--dino-surface);
}

:deep(.street-marker--cluster .street-pin--art) {
  width: 40px;
  height: 40px;
  background: var(--dino-surface);
  color: inherit;
}

:deep(.street-pin-count) {
  position: absolute;
  bottom: -7px;
  right: -7px;
  display: grid;
  place-items: center;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border: 2px solid var(--dino-surface);
  border-radius: 99px;
  background: var(--dino-ink);
  color: var(--dino-surface);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

:deep(.street-pin--place) {
  background: var(--dino-forest);
}

:deep(.street-marker--selected .street-pin) {
  transform: scale(1.25);
  box-shadow: 0 0 0 3px var(--dino-primary), 0 0 0 10px color-mix(in srgb, var(--dino-primary) 28%, transparent), 0 2px 8px #1f293740;
  animation: pin-bounce 420ms var(--dino-ease-stamp);
}

/* with an event chosen, the other pins step back so its pin stands out */

.has-selection :deep(.street-marker:not(.street-marker--selected)) {
  opacity: .55;
  transition: opacity var(--dino-motion-normal) var(--dino-ease);
}

.has-selection :deep(.street-marker:not(.street-marker--selected):hover) {
  opacity: 1;
}

@keyframes pin-bounce {
  0% {
    transform: scale(1) translateY(0);
  }
  40% {
    transform: scale(1.3) translateY(-6px);
  }
  100% {
    transform: scale(1.25) translateY(0);
  }
}

:deep(.street-pin) {
  cursor: pointer;
}

@media (hover: hover) {
  :deep(.street-marker:hover .street-pin) {
    transform: scale(1.15);
  }
}

@media (prefers-reduced-motion: reduce) {
  :deep(.street-marker--selected .street-pin) {
    animation: none;
  }
}

:deep(.leaflet-control-attribution) {
  background: var(--dino-surface);
  color: var(--dino-muted);
  font-size: 10px;
}

:deep(.leaflet-control-attribution a) {
  color: var(--dino-primary-dark);
}

.street-expand {
  position: absolute;
  z-index: 450;
  top: 20px;
  right: 20px;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1px solid var(--dino-border);
  border-radius: 12px;
  background: var(--dino-surface);
  color: var(--dino-ink);
  box-shadow: var(--dino-card-shadow);
}

.street-expand:hover {
  background: var(--dino-hover);
}

.street-expand svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* phones (map pane): fit between the toolbar and the bottom tab bar */

@media(max-width:991px) {
  .street-map-canvas {
    max-height: 480px;
  }
  .street-expand {
    display: none;
  }
}

@media(max-width:767px) {
  .street-map-canvas {
    aspect-ratio: 1.45 / 1;
  }
}

@media(pointer:coarse) {
  .street-zoom button, .street-expand {
    width: 44px;
    height: 44px;
  }
}
</style>
