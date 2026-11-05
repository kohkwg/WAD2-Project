<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { AnimatePresence, motion } from 'motion-v'
import EventArtwork from '@/components/EventArtwork.vue'
import { getEvents } from '@/utils/api'
import { isOfficialEvent } from '@/utils/groups.js'
import { dinoById } from '@/lib/dinos.js'

// The landing hero card. It opens on Dino, then shuffles through a few real upcoming public
// events like a deck of cards. If events can't load it simply stays on Dino.
// Motion for Vue (MIT): https://motion.dev/docs/vue.
const ROTATE_MS = 4500
const MAX_EVENTS = 4
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)')
const reduced = ref(reducedQuery.matches)
const events = ref([])
const index = ref(0)
const userPaused = ref(reduced.value) // reduced motion starts paused; the controls still work
const held = ref(false) // pointer over or focus inside the card
const onScreen = ref(true)
const pageVisible = ref(!document.hidden)
const card = ref(null)

const slides = computed(() => [{ id: 'intro' }, ...events.value])
const slide = computed(() => slides.value[index.value % slides.value.length])
const canRotate = computed(() => slides.value.length > 1)
const playing = computed(() => canRotate.value && !userPaused.value && !held.value && onScreen.value && pageVisible.value)
const dayTime = new Intl.DateTimeFormat('en-SG', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const when = event => dayTime.format(new Date(event.startTime))

const enter = computed(() => reduced.value ? false : { opacity: 0, x: 36, rotate: 5 })
const exit = computed(() => reduced.value ? { opacity: 0 } : { opacity: 0, x: -36, rotate: -5 })
const transition = computed(() => reduced.value ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 30 })

function next() { index.value = (index.value + 1) % slides.value.length }
function toggle() { userPaused.value = !userPaused.value }
function focusOut(event) { if (!card.value?.contains(event.relatedTarget)) held.value = false }

let timer = 0
watch(playing, value => {
  clearInterval(timer)
  if (value) timer = setInterval(next, ROTATE_MS)
}, { immediate: true })

let alive = true
let observer
const onVisibility = () => { pageVisible.value = !document.hidden }
const onReduced = () => { reduced.value = reducedQuery.matches; if (reduced.value) userPaused.value = true }
onMounted(async () => {
  document.addEventListener('visibilitychange', onVisibility)
  reducedQuery.addEventListener('change', onReduced)
  observer = new IntersectionObserver(([entry]) => { onScreen.value = entry.isIntersecting })
  if (card.value) observer.observe(card.value)
  try {
    const now = Date.now()
    const list = await getEvents()
    if (alive) events.value = list.filter(event => isOfficialEvent(event) && new Date(event.startTime) > now).slice(0, MAX_EVENTS)
  } catch {
    // Decorative extra: Discover reports load problems; here the card keeps showing Dino.
  }
})
onBeforeUnmount(() => {
  alive = false
  clearInterval(timer)
  observer?.disconnect()
  document.removeEventListener('visibilitychange', onVisibility)
  reducedQuery.removeEventListener('change', onReduced)
})
</script>

<template>
  <div class="next-up">
    <div ref="card" class="scene-card" @pointerenter="held = true" @pointerleave="held = false" @focusin="held = true" @focusout="focusOut">
      <div class="scene-card-head">
        <p class="scene-card-label">YOUR NEXT GOOD DAY</p>
        <div v-if="canRotate" class="scene-card-controls">
          <span class="scene-card-count" aria-hidden="true">{{ index + 1 }}/{{ slides.length }}</span>
          <button type="button" class="scene-card-button" :aria-label="userPaused ? 'Play featured events' : 'Pause featured events'" @click="toggle">
            <svg v-if="userPaused" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M5 3.5v9l7-4.5z" /></svg>
            <svg v-else viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4.5 3.5h2.5v9H4.5zM9 3.5h2.5v9H9z" /></svg>
          </button>
          <button type="button" class="scene-card-button" aria-label="Show next featured card" @click="next">
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </button>
        </div>
      </div>
      <div class="scene-card-stage" :aria-live="userPaused ? 'polite' : 'off'">
        <AnimatePresence mode="wait" :initial="false">
          <motion.div :key="slide.id" class="scene-slide" :initial="enter" :animate="{ opacity: 1, x: 0, rotate: 0 }" :exit="exit" :transition="transition">
            <template v-if="slide.id === 'intro'">
              <div class="scene-card-art art-yellow"><img :src="dinoById('cheer').src" alt="A cheerful dino ready for a day out"><span class="scene-spark" aria-hidden="true">✳</span></div>
              <div class="scene-card-bottom"><strong>A little something new.</strong><span>New places. Familiar faces.</span></div>
            </template>
            <RouterLink v-else :to="`/events/${slide.id}/rsvp`" class="scene-slide-link">
              <div class="scene-card-art">
                <img v-if="slide.coverImageUrl" class="scene-cover" :src="slide.coverImageUrl" alt="">
                <EventArtwork v-else :category="slide.tags?.[0]" />
                <span class="scene-tag">Coming up</span>
              </div>
              <div class="scene-card-bottom"><strong class="scene-title">{{ slide.title }}</strong><span>{{ when(slide) }} · {{ slide.venue?.name || 'Venue to be confirmed' }}</span></div>
            </RouterLink>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scene-card { rotate: -4deg; border: 2px solid var(--bookedz-ink); border-radius: 24px; background: var(--bookedz-surface); box-shadow: 8px 8px 0 var(--bookedz-ink); overflow: hidden; transform-style: preserve-3d; }
.scene-card-head { display: flex; align-items: center; justify-content: space-between; gap: .5rem; padding: .55rem .6rem .55rem 1rem; min-height: 3.1rem; }
.scene-card-label { margin: 0; text-align: left; font-size: .65rem; letter-spacing: .14em; font-weight: 750; }
.scene-card-controls { display: flex; align-items: center; gap: .25rem; }
.scene-card-count { margin-right: .2rem; color: var(--bookedz-muted); font-size: .7rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.scene-card-button { display: grid; place-items: center; width: 32px; height: 32px; padding: 0; border: 1.5px solid var(--bookedz-border); border-radius: 50%; background: var(--bookedz-surface); color: var(--bookedz-ink); cursor: pointer; transition: background-color var(--bookedz-motion-fast) var(--bookedz-ease), scale var(--bookedz-motion-fast) var(--bookedz-ease-stamp); }
.scene-card-button:hover { background: var(--bookedz-orange-soft); scale: 1.08; }
.scene-card-button svg { width: 14px; height: 14px; fill: currentColor; }
.scene-card-button:focus-visible, .scene-slide-link:focus-visible { outline: 3px solid var(--bookedz-primary-dark); outline-offset: 2px; }
.scene-card-stage { position: relative; }
.scene-slide, .scene-slide-link { display: block; color: inherit; text-decoration: none; }
.scene-slide-link:hover { color: inherit; }
.scene-card-art { position: relative; height: 200px; overflow: hidden; background: var(--bookedz-surface-muted, var(--bookedz-yellow)); }
.art-yellow { background: var(--bookedz-yellow); }
.scene-card-art img { height: 100%; width: 100%; object-fit: contain; padding: 10px; }
.scene-card-art .scene-cover { object-fit: cover; padding: 0; }
.scene-card-art :deep(.event-artwork) { display: block; width: 100%; height: 100%; }
.scene-spark { position: absolute; right: 18px; top: 15px; font-size: 2.8rem; color: var(--bookedz-primary-dark); }
.scene-tag { position: absolute; left: 12px; bottom: 12px; padding: .25rem .6rem; border: 1.5px solid var(--bookedz-ink); border-radius: 99px; background: var(--bookedz-surface); color: var(--bookedz-ink); font-size: .7rem; font-weight: 750; }
.scene-card-bottom { display: grid; gap: .3rem; align-content: start; min-height: 5.6rem; padding: 1rem; text-align: left; }
.scene-card-bottom strong { font-size: 1.1rem; line-height: 1.25; }
.scene-title { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.scene-card-bottom > span { color: var(--bookedz-muted); font-size: .8rem; display: -webkit-box; -webkit-line-clamp: 1; line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
@media (max-width: 767px) { .scene-card-head { padding: .45rem .45rem .45rem .85rem; min-height: 2.8rem; } .scene-card-label { white-space: nowrap; font-size: .6rem; letter-spacing: .1em; } .scene-card-count { display: none; } .scene-card-button { width: 28px; height: 28px; } .scene-card-art { height: 155px; } .scene-card-bottom { min-height: 5rem; padding: .8rem 1rem; } .scene-card-bottom strong { font-size: 1rem; } }
@media (prefers-reduced-motion: reduce) { .scene-card-button { transition: none; } .scene-card-button:hover { scale: none; } }
</style>
