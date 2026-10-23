<script setup>
import IslandArtwork from './IslandArtwork.vue'
import EventFilters from '@/components/EventFilters.vue'
import { ref } from 'vue'

defineProps({ modelValue: { type: Object, required: true }, total: { type: Number, default: 0 } })
const emit = defineEmits(['update:modelValue', 'mode'])
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
      <h1 data-hero-reveal class="hero-context visually-hidden">Discover events</h1>
      <h2 data-hero-reveal class="hero-headline"><span>Singapore’s</span> <span>got plans</span> <span>for you.</span></h2>
      <p data-hero-reveal class="hero-support">Big nights. Small discoveries. Your next “glad I went” is somewhere on this little island.</p>
      <div class="hero-search" data-hero-reveal><p class="hero-search-label">What are you in the mood for?</p><EventFilters ref="searchControl" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" /></div>
      <div data-hero-reveal class="hero-invitation"><button type="button" class="hero-map-link" @click="changeMode('map')">Explore the event map</button><span v-if="total > 0" class="hero-event-count">{{ total }} experiences to explore</span></div>
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
.discovery-hero { position: relative; isolation: isolate; display: grid; grid-template-columns: minmax(0, .95fr) minmax(0, 1.35fr); align-items: center; max-width: 1600px; min-height: min(780px, calc(100svh - 88px)); margin: 0 auto; padding: 64px clamp(24px,4vw,64px) 64px; gap: 16px; overflow: clip; background: var(--bookedz-canvas); }
.hero-copy { position: relative; z-index: 2; min-width: 0; }
.hero-context { font-family: var(--bookedz-body); font-size: .9rem; font-weight: 600; letter-spacing: 0; color: var(--bookedz-muted); margin: 0 0 20px; }
.hero-headline { max-width: 10ch; min-width: 0; overflow-wrap: break-word; font-size: clamp(3.3rem,5.7vw,5.75rem); font-weight: 650; line-height: 1.02; letter-spacing: -.05em; margin: 0 0 24px; color: var(--bookedz-ink); text-wrap: balance; }
.hero-headline span { display: block; }
.hero-support { max-width: 38ch; color: var(--bookedz-muted); font-size: 1rem; line-height: 1.65; margin: 0 0 28px; text-wrap: pretty; }
.hero-search { position: relative; z-index: 5; max-width: 560px; margin: 0 0 16px; }
.hero-search-label { display: block; margin-bottom: 10px; font-size: .875rem; font-weight: 600; color: var(--bookedz-ink); }
.hero-search :deep(.search-toolbar) { gap: 8px; padding: 6px; border: 1px solid var(--bookedz-control-border); border-radius: 20px; background: var(--bookedz-surface); box-shadow: var(--bookedz-search-shadow); }
.hero-search :deep(.search-field input) { border: 0; box-shadow: none; background: transparent; padding-left: 42px; font-size: 1rem; }
.hero-search :deep(.search-field svg) { left: 12px; }
.hero-search :deep(.filter-toggle) { padding: 0 13px; border: 0; border-radius: 13px; background: var(--bookedz-glass-active); color: var(--bookedz-ink); }
.hero-search :deep(.category-options) { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: thin; gap: 6px; margin-top: 12px; padding: 4px 2px; }
.hero-search :deep(.category-option) { padding: 7px 13px; font-size: .8rem; background: var(--bookedz-glass-solid); }
.hero-search :deep(.category-option.is-selected) { background: var(--bookedz-primary-dark); }
.hero-search :deep(.filter-panel) { max-height: 320px; overflow-y: auto; overscroll-behavior: contain; }
.hero-invitation { display: flex; flex-wrap: wrap; gap: 4px 18px; align-items: center; }
.hero-map-link { min-height: 44px; padding: 8px 0; border: 0; background: transparent; color: var(--bookedz-primary-dark); font-weight: 650; font-size: .875rem; text-decoration: underline; text-underline-offset: 5px; }
.hero-map-link:hover { color: var(--bookedz-ink); }
.hero-event-count { font-variant-numeric: tabular-nums; color: var(--bookedz-muted); font-size: .8rem; }
.illustrated-island { position: relative; min-width: 0; width: calc(100% + 100px); margin-left: -60px; aspect-ratio: 4 / 3; pointer-events: none; }
.hero-illustration { display: block; width: 100%; height: 100%; will-change: transform; }
.island-edge-mist { position: absolute; inset: 0; background: radial-gradient(ellipse at 0 0,var(--bookedz-canvas),transparent 22%),radial-gradient(ellipse at 100% 100%,var(--bookedz-canvas),transparent 20%); }
.hero-art-fallback { position: absolute; inset: 20%; display: flex; flex-direction: column; justify-content: center; gap: 16px; pointer-events: auto; }
.hero-view-switch { position: absolute; top: 18px; right: clamp(24px,4vw,64px); display: flex; gap: 4px; padding: 4px; border-radius: 99px; background: var(--bookedz-glass-solid); border: 1px solid var(--bookedz-border); z-index: 3; }
.hero-view-switch button { min-height: 44px; padding: 8px 18px; border: 0; border-radius: 99px; background: transparent; color: var(--bookedz-muted); font-size: .875rem; font-weight: 600; }
.hero-view-switch button:hover { background: var(--bookedz-glass-active); color: var(--bookedz-ink); }
.hero-view-switch .is-active { background: var(--bookedz-ink); color: var(--bookedz-surface); }
.hero-motion-toggle { position: absolute; right: clamp(24px,4vw,64px); bottom: 30px; min-height: 44px; padding: 8px 14px; border: 1px solid var(--bookedz-border); border-radius: 99px; background: var(--bookedz-glass-solid); color: var(--bookedz-muted); font-size: .8rem; z-index: 3; }
.hero-motion-toggle:hover { background: var(--bookedz-surface); color: var(--bookedz-ink); }
.hero-scroll-cue { display: none; }
@media(max-width:1100px) and (min-width:768px) { .discovery-hero { grid-template-columns: minmax(0,1fr) minmax(0,1fr); padding-inline: 32px; }.hero-headline { font-size: clamp(3rem,6.2vw,4.5rem); }.illustrated-island { width: calc(100% + 80px); margin-left: -30px; } }
@media(max-width:991.98px) {
 .discovery-hero { display: flex; flex-direction: column; align-items: stretch; padding: 82px 24px 26px; gap: 0; min-height: auto; }
 .hero-context { font-size: .875rem; margin-bottom: 14px; }
 .hero-headline { max-width: 12ch; font-size: clamp(3rem,10.5vw,4.6rem); line-height: 1.04; margin-bottom: 18px; }
 .hero-headline span { display: inline; }
 .hero-support { margin-bottom: 24px; }
 .hero-search { max-width: none; }
 .hero-search :deep(.category-options) { flex-wrap: nowrap; }
 .illustrated-island { width: calc(100% + 48px); margin: 10px -24px -8px; }
 .hero-view-switch { top: 15px; right: 24px; }
 .hero-view-switch button { padding-inline: 16px; }
 .hero-motion-toggle { position: relative; inset: auto; align-self: center; margin-top: 8px; }
}
@media(prefers-reduced-motion:reduce) { .hero-illustration { will-change: auto; } }
</style>
