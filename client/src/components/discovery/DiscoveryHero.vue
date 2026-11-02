<script setup>
import MapPreview from './MapPreview.vue'
import EventFilters from '@/components/EventFilters.vue'
import { ref } from 'vue'

defineProps({
  modelValue: { type: Object, required: true }, search: { type: String, default: '' }, total: { type: Number, default: null }, loading: Boolean, error: { type: String, default: '' },
  mapEvents: { type: Array, default: () => [] }, mapLoading: Boolean, mapError: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'update:search', 'mode', 'retry', 'pick-dates'])
const searchControl = ref(null)
function changeMode(mode) {
  searchControl.value?.flushSearch()
  emit('mode', mode)
}
</script>

<template>
  <section class="discovery-hero" aria-label="Discover your next Singapore experience">
    <div class="hero-copy">
      <p data-hero-reveal class="hero-washi">Singapore, this week</p>
      <h1 data-hero-reveal class="hero-headline"><span>Singapore’s</span> <span>got plans</span> <span>for you.</span></h1>
      <p data-hero-reveal class="hero-support">Big nights. Small discoveries. Your next “glad I went” is somewhere on this little island.</p>
      <div class="hero-search" data-hero-reveal><p class="hero-search-label">What are you in the mood for?</p>
        <EventFilters ref="searchControl" :model-value="modelValue" :search="search" :total="total" :loading="loading" :error="error"
          @update:model-value="emit('update:modelValue', $event)" @update:search="emit('update:search', $event)"
          @show="changeMode('list')" @retry="emit('retry')" @pick-dates="emit('pick-dates')" />
      </div>
      <button type="button" class="btn event-cta hero-browse" @click="changeMode('list')">Explore events</button>
    </div>
    <div class="hero-visual">
      <MapPreview :events="mapEvents" :loading="mapLoading" :error="mapError" @explore="changeMode('map')" />
    </div>
  </section>
</template>

<style scoped>
.discovery-hero { position: relative; isolation: isolate; display: grid; grid-template-columns: minmax(0, .46fr) minmax(0, .54fr); align-items: center; min-height: min(560px, calc(100svh - 160px)); margin: 0 auto; padding: 8px max(var(--discover-gutter, 12px), calc((100% - 1280px) / 2 + var(--discover-gutter, 12px))); gap: 24px 48px; background: var(--bookedz-canvas); }
.hero-copy { position: relative; z-index: 4; min-width: 0; }
.hero-washi { display: inline-block; margin: 0 0 18px; padding: 5px 14px; background: var(--bookedz-mango-soft); color: var(--bookedz-ink); font-size: .78rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; transform: rotate(-1.5deg); clip-path: polygon(2% 0, 100% 4%, 98% 100%, 0 96%); }
.hero-browse { min-height: 44px; margin-top: 4px; }
.hero-headline { max-width: 14ch; min-width: 0; overflow-wrap: break-word; font-size: clamp(2.8rem,4.6vw,4.5rem); font-weight: 900; line-height: 1.02; letter-spacing: -.03em; margin: 0 0 24px; color: var(--bookedz-ink); text-wrap: balance; }
.hero-headline span:first-child { display: block; }
.hero-support { max-width: 38ch; color: var(--bookedz-muted); font-size: 1rem; line-height: 1.65; margin: 0 0 28px; text-wrap: pretty; }
.hero-search { position: relative; z-index: 5; max-width: 560px; margin: 0 0 16px; }
.hero-search-label { display: block; margin-bottom: 12px; font-size: 1rem; font-weight: 700; color: var(--bookedz-ink); }
.hero-visual { position: relative; min-width: 0; }
@media(max-width:1100px) and (min-width:992px) { .discovery-hero { column-gap: 28px; }.hero-headline { font-size: clamp(2.6rem,4.6vw,3.4rem); } }
@media(max-width:991.98px) {
 .discovery-hero { display: flex; flex-direction: column; align-items: stretch; padding: 40px 12px 26px; gap: 24px; min-height: auto; }
 .hero-headline { max-width: 12ch; font-size: clamp(3rem,10.5vw,4.6rem); line-height: 1.04; margin-bottom: 18px; }
 .hero-headline span { display: inline; }
 .hero-support { margin-bottom: 24px; }
 .hero-search { max-width: none; }
}
@media(prefers-reduced-motion:reduce) { .hero-washi { transform: none; } }
</style>
