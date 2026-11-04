<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import EventArtwork from '../EventArtwork.vue'

const props = defineProps({
  events: { type: Array, default: () => [] },
  loading: Boolean,
  error: { type: String, default: '' },
  personalized: Boolean,
  preferencePending: Boolean,
})
const emit = defineEmits(['preference', 'retry'])
const router = useRouter()

const index = ref(0)
const history = ref([])
const showInfo = ref(true)
const dragX = ref(0)
const dragging = ref(false)
let startX = 0
const SWIPE_DISTANCE = 90

watch(() => props.events.map(event => event.id).join(','), () => { index.value = 0; history.value = [] })

const current = computed(() => props.events[index.value] || null)
const left = computed(() => Math.max(0, props.events.length - index.value))
const failedCover = ref('')
const cover = computed(() => current.value?.image_url || current.value?.coverImageUrl || '')
const category = computed(() => current.value?.category || current.value?.tags?.[0] || 'Event')
const score = computed(() => {
  const event = current.value
  return event && event.source !== 'general_discovery' && Number.isFinite(event.compatibilityScore) ? `${Math.round(event.compatibilityScore)}% match` : 'Upcoming'
})
const when = computed(() => current.value
  ? new Date(current.value.start_time).toLocaleDateString('en-SG', { timeZone: 'Asia/Singapore', weekday: 'short', day: 'numeric', month: 'short' }) : '')
const venue = computed(() => current.value?.venue_name || current.value?.venue?.name || 'Venue to be announced')
const reason = computed(() => current.value?.reason || 'Upcoming event')
const spots = computed(() => {
  const value = Number(current.value?.spots_left)
  if (current.value?.spots_left == null || !Number.isFinite(value)) return ''
  return value <= 0 ? 'Full' : `${value} ${value === 1 ? 'spot' : 'spots'} left`
})
const distance = computed(() => {
  const km = current.value?.distance_km
  return Number.isFinite(km) && km >= 0 ? (km < 5 ? 'Close to your area' : `${km.toFixed(1)} km away`) : ''
})
const details = computed(() => [spots.value, distance.value].filter(Boolean).join(' · '))
const saved = computed(() => Boolean(current.value?.saved))

function advance(action) {
  const event = current.value
  if (!event) return
  history.value.push(index.value)
  index.value += 1
  dragX.value = 0
  if (action === 'save' && props.personalized && !event.saved) emit('preference', { event, action: 'save' })
}
function skip() { advance('skip') }
function interested() { advance('save') }
function undo() {
  const previous = history.value.pop()
  if (previous !== undefined) index.value = previous
}
function toggleSave() {
  const event = current.value
  if (!event || !props.personalized) return
  emit('preference', { event, action: event.saved ? 'unsave' : 'save' })
}
function open() {
  if (current.value && Math.abs(dragX.value) < 6) router.push(`/events/${current.value.id}/rsvp`)
}

function down(event) {
  dragging.value = true
  startX = event.clientX
  event.currentTarget.setPointerCapture?.(event.pointerId)
}
function move(event) { if (dragging.value) dragX.value = event.clientX - startX }
function up() {
  if (!dragging.value) return
  dragging.value = false
  if (dragX.value > SWIPE_DISTANCE) interested()
  else if (dragX.value < -SWIPE_DISTANCE) skip()
  else window.setTimeout(() => { dragX.value = 0 }, 0)
}
function key(event) {
  if (event.key === 'ArrowRight') { event.preventDefault(); interested() }
  else if (event.key === 'ArrowLeft') { event.preventDefault(); skip() }
}
</script>

<template>
  <section class="picked-deck" aria-labelledby="picked-for-you-title" :aria-busy="loading">
    <div class="deck-intro">
      <h2 id="picked-for-you-title" tabindex="-1">Picked for you</h2>
      <p v-if="current" class="deck-left" aria-live="polite">{{ left }} of {{ events.length }} left</p>
      <div class="deck-tools">
        <button type="button" class="deck-tool" aria-label="Undo last swipe" :disabled="!history.length" @click="undo">↺</button>
        <button type="button" class="deck-tool" :aria-label="saved ? 'Remove this event from saved' : 'Save this event'" :aria-pressed="saved" :disabled="!current || !personalized || preferencePending" @click="toggleSave">{{ saved ? '★' : '☆' }}</button>
        <button type="button" class="deck-tool" aria-label="Why this pick" :aria-pressed="showInfo" :disabled="!current" @click="showInfo = !showInfo">ⓘ</button>
      </div>
    </div>

    <div v-if="loading" class="deck-message" role="status">Finding your picks…</div>
    <div v-else-if="error" class="deck-message" role="status">{{ error }} <button type="button" class="deck-link" @click="emit('retry')">Try again</button></div>
    <div v-else-if="!events.length" class="deck-message">
      No picks yet. <RouterLink v-if="personalized" to="/profile">Add your interests</RouterLink><template v-else>Check back for upcoming events</template>.
    </div>
    <div v-else-if="!current" class="deck-message" role="status">You’ve seen all your picks. <button type="button" class="deck-link" @click="index = 0; history = []">Review again</button></div>

    <div v-else class="deck-stage" tabindex="0" aria-label="Recommended event. Press right arrow if interested, left arrow to skip." @keydown="key">
      <button type="button" class="deck-round deck-round--skip" aria-label="Skip this event" @click="skip">✕</button>
      <article class="deck-card" :class="{ 'is-dragging': dragging }" :style="{ transform: `translateX(${dragX}px) rotate(${dragX / 30}deg)` }"
        @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @click="open">
        <div class="deck-cover">
          <img v-if="cover && failedCover !== cover" :src="cover" alt="" draggable="false" @error="failedCover = cover" />
          <EventArtwork v-else :category="category" />
          <span class="deck-badge">{{ score }}</span>
        </div>
        <div class="deck-body">
          <h3>{{ current.title }}</h3>
          <p>{{ when }} · {{ venue }}</p>
        </div>
      </article>
      <button type="button" class="deck-round deck-round--yes" aria-label="Interested" @click="interested">✓</button>
      <div v-if="showInfo" class="deck-why">
        <strong>{{ reason }}</strong>
        <span v-if="details">{{ details }}</span>
        <em>Swipe right if interested, left to skip.</em>
      </div>
    </div>
  </section>
</template>

<style scoped>
.picked-deck { display: grid; grid-template-columns: 190px minmax(0,1fr); align-items: center; gap: 12px 18px; margin-bottom: 18px; padding: 20px 24px; border: 1px solid var(--bookedz-border); border-radius: 16px; background: var(--bookedz-glass-active); min-height: 205px; }
.deck-intro h2 { margin: 0; font-size: 24px; }
.deck-left { margin: 4px 0 12px; color: var(--bookedz-muted); font-size: 12px; }
.deck-tools { display: flex; gap: 8px; }
.deck-tool { width: 44px; height: 44px; border: 1px solid var(--bookedz-border); border-radius: 50%; background: var(--bookedz-surface); color: var(--bookedz-primary-dark); font-size: 17px; cursor: pointer; box-shadow: 0 2px 6px #0000000d; }
.deck-tool:disabled { opacity: .45; cursor: default; }
.deck-tool[aria-pressed=true] { background: var(--bookedz-hover); }
.deck-stage { position: relative; display: flex; align-items: center; justify-content: center; gap: 26px; min-width: 0; outline: none; }
.deck-stage:focus-visible { outline: 2px solid var(--bookedz-primary-dark); outline-offset: 6px; border-radius: 12px; }
.deck-round { flex: none; width: 52px; height: 52px; border-radius: 50%; font-size: 22px; line-height: 1; cursor: pointer; }
.deck-round--skip { border: 2px solid var(--bookedz-primary-dark); background: transparent; color: var(--bookedz-primary-dark); }
.deck-round--yes { border: 0; background: var(--bookedz-success); color: #fff; box-shadow: 0 4px 10px #14b8a640; }
.deck-card { flex: none; width: 262px; overflow: hidden; border-radius: 14px; background: var(--bookedz-surface); box-shadow: 0 10px 28px #3c32231f; cursor: grab; touch-action: pan-y; user-select: none; transition: transform .22s ease; }
.deck-card.is-dragging { cursor: grabbing; transition: none; }
.deck-cover { position: relative; height: 72px; background: var(--bookedz-yellow); overflow: hidden; }
.deck-cover img,.deck-cover :deep(svg) { width: 100%; height: 100%; object-fit: cover; }
.deck-badge { position: absolute; top: 10px; left: 10px; padding: 2px 9px; border-radius: 99px; background: var(--bookedz-primary-dark); color: #fff; font-size: 11px; font-weight: 700; }
.deck-body { padding: 14px 16px 16px; }
.deck-body h3 { margin: 0 0 4px; font-family: var(--bookedz-body); font-size: 16px; font-weight: 700; overflow-wrap: anywhere; }
.deck-body p { margin: 0; color: var(--bookedz-muted); font-size: 12px; }
.deck-why { display: grid; gap: 3px; flex: none; width: 205px; padding: 11px 13px; border: 1px solid var(--bookedz-border); border-radius: 10px; background: var(--bookedz-surface); box-shadow: 0 4px 14px #3c32230f; font-size: 11px; }
.deck-why strong { color: var(--bookedz-primary-dark); font-size: 12px; }
.deck-why em { color: var(--bookedz-muted); font-style: normal; }
.deck-message { grid-column: 2; color: var(--bookedz-muted); font-size: 13px; }
.deck-link { border: 0; background: transparent; color: var(--bookedz-primary-dark); text-decoration: underline; }
@media (max-width: 991px) { .deck-why { display: none; } }
@media (max-width: 767px) { .picked-deck { grid-template-columns: minmax(0,1fr); padding: 16px; }.deck-message { grid-column: 1; }.deck-stage { gap: 12px; }.deck-card { width: min(240px, 100%); }.deck-round { width: 44px; height: 44px; } }
@media (prefers-reduced-motion: reduce) { .deck-card { transition: none; } }
</style>
