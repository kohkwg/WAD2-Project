<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import RecommendationCard from './RecommendationCard.vue'

const props = defineProps({
  events: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  personalized: { type: Boolean, default: false },
  collapsedCount: { type: Number, default: 3 },
})
const emit = defineEmits(['retry', 'rsvp', 'waitlist'])
const router = useRouter()
const showAll = ref(false)
const featured = computed(() => {
  const open = props.events.filter(event => !event.is_full && (event.spots_left == null || Number(event.spots_left) > 0))
  return open.find(event => event.reason_type === 'interest' || (!event.reason_type && /^Matches your interests/i.test(event.reason || '')))
    || open[0] || props.events[0] || null
})
const collapsedLimit = computed(() => Math.max(1, Math.floor(props.collapsedCount) || 3))
const rest = computed(() => props.events.filter(event => event.id !== featured.value?.id))
const others = computed(() => showAll.value ? rest.value : rest.value.slice(0, collapsedLimit.value - 1))
const sidePicks = computed(() => others.value.slice(0, 2))
const morePicks = computed(() => others.value.slice(2))
const canToggle = computed(() => props.events.length > collapsedLimit.value)
const view = event => router.push(`/events/${event.id}`)
</script>

<template>
  <section class="picked-for-you" aria-labelledby="picked-for-you-title" :aria-busy="loading">
    <header class="picks-header">
      <h2 id="picked-for-you-title">Picked for you</h2>
      <button v-if="!loading && !error && canToggle" type="button" class="see-all" :aria-expanded="showAll" aria-controls="picked-for-you-cards" @click="showAll = !showAll">{{ showAll ? 'Show less' : 'See all' }}</button>
    </header>
    <p v-if="!personalized" class="picks-note">Explore upcoming events. Personalised picks are available when you’re signed in.</p>
    <div v-if="loading" class="picks-loading" role="status">
      <span class="visually-hidden">Finding recommendations</span>
      <div v-for="i in 3" :key="i" class="pick-skeleton" aria-hidden="true"></div>
    </div>
    <div v-else-if="error" class="picks-message" role="status">
      <p class="mb-2">{{ error }}</p>
      <button type="button" class="btn btn-outline-secondary btn-sm" @click="$emit('retry')">Try again</button>
    </div>
    <p v-else-if="!events.length" class="picks-message">No picks yet. <RouterLink v-if="personalized" to="/profile">Add your interests</RouterLink><template v-else>Check back for upcoming events</template> to find your next event.</p>
    <div v-else id="picked-for-you-cards">
      <div class="picks-layout" :class="{ 'picks-layout--single': !sidePicks.length }">
        <RecommendationCard :event="featured" featured @view="view" @rsvp="emit('rsvp', $event)" @waitlist="emit('waitlist', $event)" />
        <div v-if="sidePicks.length" class="picks-secondary">
          <RecommendationCard v-for="event in sidePicks" :key="event.id" :event="event" @view="view" @rsvp="emit('rsvp', $event)" @waitlist="emit('waitlist', $event)" />
        </div>
      </div>
      <div v-if="morePicks.length" class="more-picks">
        <RecommendationCard v-for="event in morePicks" :key="event.id" :event="event" @view="view" @rsvp="emit('rsvp', $event)" @waitlist="emit('waitlist', $event)" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.picked-for-you { margin: 28px 0 36px; }
.picks-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
.picks-header h2 { margin: 0; font-size: 1.2rem; font-weight: 650; letter-spacing: -.025em; }
.see-all { min-height: 44px; padding: 4px 16px; border: 1px solid #cfd4da; border-radius: 999px; background: white; color: #566275; font-size: .85rem; font-weight: 550; }
.see-all:hover { color: #205aa7; text-decoration: underline; }
.picks-note { margin: -4px 0 16px; color: #737b88; font-size: .85rem; }
.picks-layout { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 16px; }
.picks-layout--single { grid-template-columns: minmax(0, 1fr); }
.picks-secondary { display: grid; gap: 12px; min-width: 0; }
.more-picks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 16px; }
.picks-message { border: 1px solid #e1e5eb; border-radius: 16px; background: white; padding: 22px; color: #737b88; font-size: .9rem; }
.picks-loading { display: grid; grid-template-columns: 3fr 2fr; grid-template-rows: 108px 108px; gap: 16px; }
.pick-skeleton { border-radius: 18px; background: linear-gradient(100deg, #e9edf3 30%, #f5f7fa 50%, #e9edf3 70%); background-size: 200% 100%; animation: shimmer 1.2s ease-in-out infinite; }
.pick-skeleton:first-of-type { grid-row: span 2; }
@keyframes shimmer { to { background-position: -200% 0; } }
@media (min-width: 768px) and (max-width: 991px) { .picks-layout { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } .more-picks { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 767px) {
  .picks-layout, .more-picks { display: flex; gap: 12px; overflow-x: auto; scroll-snap-type: x mandatory; padding: 3px 3px 12px; }
  .picks-secondary { display: contents; }
  .picks-layout :deep(.recommendation-card), .more-picks :deep(.recommendation-card) { flex: 0 0 84%; scroll-snap-align: start; }
  .picks-layout--single :deep(.recommendation-card) { flex-basis: 100%; }
  .picks-loading { grid-template-columns: 1fr; grid-template-rows: 230px; }
  .pick-skeleton:first-of-type { grid-row: auto; }
  .pick-skeleton:not(:first-of-type) { display: none; }
}
@media (prefers-reduced-motion: reduce) { .pick-skeleton { animation: none; } }
</style>
