<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import RecommendationCard from './RecommendationCard.vue'

const props = defineProps({
  events: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  personalized: { type: Boolean, default: false },
  fallback: { type: Boolean, default: false },
  collapsedCount: { type: Number, default: 3 },
  preferencePending: { type: Boolean, default: false },
  actionError: { type: String, default: '' },
  undoEvent: { type: Object, default: null },
  compact: { type: Boolean, default: false },
  filtered: { type: Boolean, default: false },
  otherPicks: { type: Boolean, default: false },
})
const emit = defineEmits(['retry', 'rsvp', 'waitlist', 'preference', 'other-picks'])
const router = useRouter()
const showAll = ref(false)
const featured = computed(() => {
  // V1 responses already carry the intended diversity order.
  if (props.events.some(event => event.source)) return props.events[0] || null
  const open = props.events.filter(event => !event.is_full && (event.spots_left == null || Number(event.spots_left) > 0))
  return open.find(event => event.reason_type === 'interest' || (!event.reason_type && /^Matches your interests/i.test(event.reason || '')))
    || open[0] || props.events[0] || null
})
const collapsedLimit = computed(() => Math.max(1, Math.floor(props.collapsedCount) || 3))
const rest = computed(() => props.events.filter(event => event.id !== featured.value?.id))
const others = computed(() => showAll.value ? rest.value : rest.value.slice(0, collapsedLimit.value - 1))
const slides = computed(() => featured.value ? [featured.value, ...others.value] : [])
const active = ref(0)
const goTo = index => { active.value = Math.min(Math.max(index, 0), slides.value.length - 1) }
const onKeydown = e => {
  if (e.target.closest?.('input, textarea, select')) return
  const key = { ArrowLeft: active.value - 1, ArrowRight: active.value + 1, Home: 0, End: slides.value.length - 1 }[e.key]
  if (key === undefined || slides.value.length < 2) return
  e.preventDefault()
  goTo(key)
}
watch(() => slides.value.length, () => goTo(active.value))
watch(() => slides.value[0]?.id, () => { active.value = 0 })
const canToggle = computed(() => props.events.length > collapsedLimit.value)
const view = event => router.push(`/events/${event.id}/rsvp`)
</script>

<template>
  <section class="picked-for-you" :class="{ 'picked-for-you--compact': compact }" aria-labelledby="picked-for-you-title" :aria-busy="loading">
    <header class="picks-header">
      <h2 id="picked-for-you-title">Picked for you</h2>
      <div class="picks-header-actions">
        <button v-if="!loading && !error && canToggle" type="button" class="see-all" :aria-expanded="showAll" aria-controls="picked-for-you-cards" @click="showAll = !showAll">{{ showAll ? 'Show less' : 'See all' }}</button>
        <template v-if="!loading && !error && slides.length > 1">
          <button type="button" class="picks-arrow" :aria-disabled="active === 0" aria-label="Previous pick" @click="goTo(active - 1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></button>
          <button type="button" class="picks-arrow" :aria-disabled="active === slides.length - 1" aria-label="Next pick" @click="goTo(active + 1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg></button>
        </template>
      </div>
    </header>
    <p v-if="actionError" class="alert alert-danger" role="alert">{{ actionError }}</p>
    <div v-if="undoEvent" class="alert alert-info" role="status">
      Hidden {{ undoEvent.title }}.
      <button id="undo-recommendation-dismiss" type="button" class="btn btn-outline-secondary btn-sm" :disabled="preferencePending"
        @click="emit('preference', { event: undoEvent, action: 'undo_dismiss' })">Undo</button>
    </div>
    <p v-if="fallback" class="picks-note" role="status">Personalised picks couldn’t load. Here are upcoming events to explore instead.</p>
    <p v-else-if="!personalized" class="picks-note">Explore upcoming events. Personalised picks are available when you’re signed in.</p>
    <div v-if="filtered && !loading && !error" class="picks-context">
      <p>{{ otherPicks ? 'Your other picks — these may be outside your current filters.' : events.length ? 'Picks matching your current filters.' : 'No picks match your current filters. You can still explore your other picks.' }}</p>
      <button type="button" class="see-all" :aria-pressed="otherPicks" @click="emit('other-picks')">{{ otherPicks ? 'Show matching picks' : 'View all picks' }}</button>
    </div>
    <div v-if="loading" class="picks-loading" role="status">
      <span class="visually-hidden">Finding recommendations</span>
      <div v-for="i in 3" :key="i" class="pick-skeleton" aria-hidden="true"></div>
    </div>
    <div v-else-if="error" class="picks-message" role="status">
      <p class="mb-2">{{ error }}</p>
      <button type="button" class="btn btn-outline-secondary btn-sm" @click="$emit('retry')">Try again</button>
    </div>
    <p v-else-if="!events.length && (!filtered || otherPicks)" class="picks-message">No picks yet. <RouterLink v-if="personalized" to="/profile">Add your interests</RouterLink><template v-else>Check back for upcoming events</template> to find your next event.</p>
    <div v-else-if="slides.length" id="picked-for-you-cards" class="picks-carousel" :class="{ 'picks-carousel--single': slides.length === 1 }" role="group" aria-roledescription="carousel" aria-label="Picked for you" @keydown="onKeydown">
      <div class="picks-stage">
        <div class="picks-track" :style="{ '--i': active }">
          <div v-for="(event, i) in slides" :key="event.id" class="picks-slide" :class="{ 'is-active': i === active, 'is-adjacent': Math.abs(i - active) === 1 }"
            role="group" aria-roledescription="slide" :aria-label="`${i + 1} of ${slides.length}`" :aria-hidden="i !== active">
            <RecommendationCard :inert="i !== active" :event="event" featured :preference-pending="preferencePending" @preference="emit('preference', $event)" @view="view" @rsvp="emit('rsvp', $event)" @waitlist="emit('waitlist', $event)" />
            <button v-if="Math.abs(i - active) === 1" type="button" class="slide-hit" tabindex="-1" :aria-label="`Show ${i < active ? 'previous' : 'next'} pick: ${event.title}`" @click="goTo(i)"></button>
          </div>
        </div>
      </div>
      <div v-if="slides.length > 1" class="picks-nav">
        <div class="picks-dots">
          <button v-for="(event, i) in slides" :key="event.id" type="button" class="picks-dot" :class="{ 'is-active': i === active }" :aria-label="`Show pick ${i + 1} of ${slides.length}`" :aria-current="i === active ? 'true' : null" @click="goTo(i)"></button>
        </div>
      </div>
      <p class="visually-hidden" aria-live="polite">Pick {{ active + 1 }} of {{ slides.length }}: {{ slides[active]?.title }}</p>
    </div>
  </section>
</template>

<style scoped>
.picked-for-you { margin: 30px 0 42px; }
.picked-for-you--compact { margin: 0 0 28px; padding: 20px; border: 1px solid var(--bookedz-border); border-radius: 20px; background: var(--bookedz-surface); }
.picked-for-you--compact .picks-header h2 { font-size: 1.35rem; }
.picks-context { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 16px; margin-bottom: 14px; }
.picks-context p { flex: 1; min-width: 160px; margin: 0; font-size: .875rem; color: var(--bookedz-muted); }
.picked-for-you--compact :deep(.pick-cover) { flex-basis: 90px; width: 90px; height: 120px; align-self: flex-start; }
.picked-for-you--compact :deep(.pick-title a) { min-height: 28px; }
.picked-for-you--compact :deep(.pick-description) { display: none; }
.picks-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
.picks-header h2 { margin: 0; font-family: var(--bookedz-heading); font-size: clamp(1.5rem, 2.5vw, 2rem); font-weight: 650; letter-spacing: -.035em; }
.see-all { min-height: 44px; padding: 4px 16px; border: 1px solid var(--bookedz-border, #e5ded2); border-radius: 999px; background: var(--bookedz-surface, #fffdfa); color: var(--bookedz-ink, #292d32); font-size: .85rem; font-weight: 600; }
.see-all:hover { border-color: var(--bookedz-primary-dark, #aa3e2c); color: var(--bookedz-primary-dark, #aa3e2c); text-decoration: underline; }
.picks-note { margin: -4px 0 16px; color: var(--bookedz-muted, #63665e); font-size: .88rem; }
.picks-message { border: 1px solid var(--bookedz-border, #e5ded2); border-radius: 18px; background: var(--bookedz-surface, #fffdfa); padding: 22px; color: var(--bookedz-muted, #63665e); font-size: .9rem; }
.pick-skeleton { border-radius: 20px; background: linear-gradient(100deg, #eee9dd 30%, #f9f4e9 50%, #eee9dd 70%); background-size: 200% 100%; animation: shimmer 1.2s ease-in-out infinite; }
@keyframes shimmer { to { background-position: -200% 0; } }
.picks-loading { display: grid; grid-template-columns: .5fr 1fr .5fr; height: 260px; gap: 16px; }
.picks-carousel { --gap: 16px; --sw: 72%; }
.picks-stage { overflow: hidden; padding: 8px 0; }
.picks-track { display: flex; gap: var(--gap); width: 100%; transform: translateX(calc((100% - var(--sw)) / 2 - var(--i) * (var(--sw) + var(--gap)))); transition: transform .5s cubic-bezier(.22, .8, .3, 1); }
.picks-slide { position: relative; display: flex; flex: 0 0 var(--sw); min-width: 0; opacity: .5; transform: scale(.93); transition: opacity .5s ease, transform .5s cubic-bezier(.22, .8, .3, 1); }
.picks-slide.is-active { opacity: 1; transform: none; }
.picks-slide:not(.is-active):not(.is-adjacent) { opacity: 0; pointer-events: none; }
.picks-slide > :deep(.recommendation-card) { flex: 1; width: 100%; }
.picks-slide:not(.is-active) :deep(.recommendation-card) { pointer-events: none; }
.picks-carousel--single .picks-track { transform: none; }
.picks-carousel--single .picks-slide { flex-basis: 100%; }
.slide-hit { position: absolute; inset: 0; z-index: 2; border: 0; border-radius: 20px; background: transparent; cursor: pointer; }
.picks-slide :deep(.recommendation-card--featured .pick-details) { padding: .9rem 1.25rem; }
.picks-slide :deep(.recommendation-card--featured .pick-title) { font-size: clamp(1.2rem, 1.7vw, 1.5rem); margin-bottom: .2rem; }
.picks-slide :deep(.pick-title a) { min-height: 32px; }
.picks-slide :deep(.pick-explanation) { margin-bottom: .25rem; }
.picks-slide :deep(.pick-explanation summary) { padding: .3rem 0; }
.picks-slide :deep(.pick-source) { margin-bottom: .2rem; }
.picks-slide :deep(.pick-description) { -webkit-line-clamp: 1; margin-top: .35rem; }
.picks-slide :deep(.pick-details) { display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: 12px; align-content: center; }
.picks-slide :deep(.pick-details > *) { grid-column: 1 / -1; }
.picks-slide :deep(.pick-details > .pick-actions) { grid-column: 1; margin-top: 12px; }
.picks-slide :deep(.pick-details > .pick-preferences) { grid-column: 2; margin-top: 12px; align-self: end; flex-wrap: nowrap; gap: .4rem; }
.picks-slide :deep(.pick-preferences .btn) { padding-inline: .6rem; white-space: nowrap; }
.picks-slide :deep(.pick-details > .pick-waitlist-note) { order: 1; }
.picks-slide :deep(.pick-details > .pick-actions .btn) { padding-right: 44px; }
.picks-header-actions { display: flex; align-items: center; gap: 8px; }
.picks-nav { display: flex; align-items: center; justify-content: center; margin-top: 6px; }
.picks-arrow { display: grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 1px solid var(--bookedz-border, #e5ded2); border-radius: 50%; background: var(--bookedz-surface, #fffdfa); color: var(--bookedz-ink, #292d32); transition: border-color 150ms ease, color 150ms ease; }
.picks-arrow svg { width: 20px; height: 20px; }
.picks-arrow:hover:not([aria-disabled='true']) { border-color: var(--bookedz-primary-dark, #aa3e2c); color: var(--bookedz-primary-dark, #aa3e2c); }
.picks-arrow[aria-disabled='true'] { opacity: .4; }
.picks-dots { display: flex; align-items: center; }
.picks-dot { position: relative; width: 28px; height: 44px; padding: 0; border: 0; background: transparent; }
.picks-dot::before { content: ''; position: absolute; top: 50%; left: 50%; width: 9px; height: 9px; border-radius: 99px; background: var(--bookedz-border, #d7c8b6); transform: translate(-50%, -50%); transition: width .3s ease, background-color .3s ease; }
.picks-dot.is-active::before { width: 24px; background: var(--bookedz-primary-dark, #aa3e2c); }
@media (min-width: 768px) { .picks-slide :deep(.recommendation-card--featured .pick-cover) { flex-basis: 38%; width: 38%; min-height: 240px; } }
@media (min-width: 768px) and (max-width: 991px) { .picks-carousel { --sw: 80%; } }
@media (max-width: 767px) {
  .picked-for-you--compact { padding: 14px; }
  .picks-carousel { --sw: 100%; }
  .picks-slide :deep(.pick-details) { display: block; }
  .picks-slide:not(.is-active) { opacity: 0; transform: none; }
  .slide-hit { display: none; }
  .picks-loading { grid-template-columns: 1fr; height: 300px; }
  .pick-skeleton:not(:first-of-type) { display: none; }
}
@media (prefers-reduced-motion: reduce) { .pick-skeleton { animation: none; } .picks-track, .picks-slide, .picks-dot::before { transition: none; } }
.picked-for-you :deep(:focus-visible) { outline: 3px solid var(--bookedz-primary-dark, #aa3e2c); outline-offset: 3px; }
</style>
