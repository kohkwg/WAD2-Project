<script setup>
import IslandArtwork from './IslandArtwork.vue'
import EventFilters from '@/components/EventFilters.vue'
import { ref } from 'vue'

defineProps({ modelValue: { type: Object, required: true }, search: { type: String, default: '' }, total: { type: Number, default: null }, loading: Boolean, error: { type: String, default: '' } })
const emit = defineEmits(['update:modelValue', 'update:search', 'mode', 'retry', 'pick-dates'])
const artFailed = ref(false)
const artLoaded = ref(false)
const paused = ref(false)
const searchControl = ref(null)
function changeMode(mode) {
  searchControl.value?.flushSearch()
  emit('mode', mode)
}
</script>

<template>
  <section class="discovery-hero" aria-label="Discover your next Singapore experience">
    <div class="hero-copy">
      <h1 data-hero-reveal class="hero-headline"><span>Singapore’s</span> <span>got plans</span> <span>for you.</span></h1>
      <p data-hero-reveal class="hero-support">Big nights. Small discoveries. Your next “glad I went” is somewhere on this little island.</p>
      <div class="hero-search" data-hero-reveal><p class="hero-search-label">What are you in the mood for?</p>
        <EventFilters ref="searchControl" :model-value="modelValue" :search="search" :total="total" :loading="loading" :error="error"
          @update:model-value="emit('update:modelValue', $event)" @update:search="emit('update:search', $event)"
          @show="changeMode('list')" @retry="emit('retry')" @pick-dates="emit('pick-dates')" />
      </div>
      <button type="button" class="btn event-cta hero-browse" @click="changeMode('list')">Explore events</button>
    </div>
    <div class="illustrated-island">
      <svg v-if="!artFailed" class="hero-illustration" viewBox="0 0 1200 900" role="img" aria-label="A whimsical miniature Singapore, from leafy neighbourhoods to Marina Bay and Sentosa" :data-loaded="artLoaded"><IslandArtwork :paused="paused" @load="artLoaded = true" @error="artFailed = true" /></svg>
      <div v-else class="hero-art-fallback" role="status">The island illustration couldn’t load.<button type="button" class="btn btn-outline-primary" @click="changeMode('map')">Explore the live map</button></div>
      <div class="island-edge-mist" aria-hidden="true"></div>
    </div>
    <button type="button" class="hero-motion-toggle" :aria-pressed="paused" @click="paused = !paused">{{ paused ? 'Play island animations' : 'Pause island animations' }}</button>
    <div class="hero-view-switch" data-hero-reveal role="group" aria-label="Discovery view">
      <button type="button" aria-pressed="true" class="is-active">Island</button><button type="button" aria-pressed="false" @click="changeMode('map')">Map</button><button type="button" aria-pressed="false" @click="changeMode('list')">List</button>
    </div>
    <button type="button" class="hero-scroll-cue" @click="changeMode('list')"><span aria-hidden="true">↓</span> Follow your curiosity</button>
  </section>
</template>

<style scoped>
.discovery-hero { position: relative; isolation: isolate; display: grid; grid-template-columns: minmax(0, .45fr) minmax(0, .55fr); grid-template-rows: auto 1fr auto; align-items: center; min-height: min(560px, calc(100svh - 160px)); margin: 0 auto; padding: 8px max(var(--discover-gutter, 12px), calc((100% - 1280px) / 2 + var(--discover-gutter, 12px))); gap: 16px 40px; overflow: visible; background: var(--bookedz-canvas); }
.hero-copy { position: relative; z-index: 4; min-width: 0; grid-column: 1; grid-row: 1 / span 3; }
.hero-browse { min-height: 44px; margin-top: 4px; }
.hero-context { font-family: var(--bookedz-body); font-size: .9rem; font-weight: 600; letter-spacing: 0; color: var(--bookedz-muted); margin: 0 0 20px; }
.hero-headline { max-width: 14ch; min-width: 0; overflow-wrap: break-word; font-size: clamp(2.8rem,4.6vw,4.5rem); font-weight: 650; line-height: 1.02; letter-spacing: -.05em; margin: 0 0 24px; color: var(--bookedz-ink); text-wrap: balance; }
.hero-headline span:first-child { display: block; }
.hero-support { max-width: 38ch; color: var(--bookedz-muted); font-size: 1rem; line-height: 1.65; margin: 0 0 28px; text-wrap: pretty; }
.hero-search { position: relative; z-index: 5; max-width: 560px; margin: 0 0 16px; }
.hero-search-label { display: block; margin-bottom: 12px; font-size: 1rem; font-weight: 700; color: var(--bookedz-ink); }
.illustrated-island { position: relative; min-width: 0; grid-column: 2; grid-row: 2; width: 100%; aspect-ratio: 4 / 3; pointer-events: none; }
.hero-illustration { display: block; width: 100%; height: 100%; will-change: transform; }
.island-edge-mist { position: absolute; inset: 0; background: radial-gradient(ellipse at 0 0,var(--bookedz-canvas),transparent 22%),radial-gradient(ellipse at 100% 100%,var(--bookedz-canvas),transparent 20%); }
.hero-art-fallback { position: absolute; inset: 20%; display: flex; flex-direction: column; justify-content: center; gap: 16px; pointer-events: auto; }
.hero-view-switch { grid-column: 2; grid-row: 1; justify-self: end; display: flex; gap: 4px; padding: 4px; border-radius: 99px; background: var(--bookedz-glass-solid); border: 1px solid var(--bookedz-border); z-index: 3; }
.hero-view-switch button { min-height: 44px; padding: 8px 18px; border: 0; border-radius: 99px; background: transparent; color: var(--bookedz-muted); font-size: .875rem; font-weight: 600; }
.hero-view-switch button:hover { background: var(--bookedz-glass-active); color: var(--bookedz-ink); }
.hero-view-switch .is-active { background: var(--bookedz-ink); color: var(--bookedz-surface); }
.hero-motion-toggle { grid-column: 2; grid-row: 3; justify-self: end; min-height: 44px; padding: 8px 14px; border: 1px solid var(--bookedz-border); border-radius: 99px; background: var(--bookedz-glass-solid); color: var(--bookedz-muted); font-size: .8rem; z-index: 3; }
.hero-motion-toggle:hover { background: var(--bookedz-surface); color: var(--bookedz-ink); }
.hero-scroll-cue { display: none; }
@media(max-width:1100px) and (min-width:992px) { .discovery-hero { column-gap: 28px; }.hero-headline { font-size: clamp(2.6rem,4.6vw,3.4rem); } }
@media(max-width:991.98px) {
 .discovery-hero { display: flex; flex-direction: column; align-items: stretch; padding: 82px 12px 26px; gap: 0; min-height: auto; }
 .hero-context { font-size: .875rem; margin-bottom: 14px; }
 .hero-headline { max-width: 12ch; font-size: clamp(3rem,10.5vw,4.6rem); line-height: 1.04; margin-bottom: 18px; }
 .hero-headline span { display: inline; }
 .hero-support { margin-bottom: 24px; }
 .hero-search { max-width: none; }
 .illustrated-island { grid-column: auto; grid-row: auto; width: calc(100% + 24px); margin: 10px -12px -8px; }
 .hero-copy { grid-column: auto; grid-row: auto; }
 .hero-view-switch { position: absolute; top: 15px; right: 12px; }
 .hero-view-switch button { padding-inline: 16px; }
 .hero-motion-toggle { grid-column: auto; grid-row: auto; justify-self: auto; align-self: center; margin-top: 8px; }
}
@media(prefers-reduced-motion:reduce) { .hero-illustration { will-change: auto; } }
</style>
