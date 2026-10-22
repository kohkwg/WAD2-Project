<script setup>
import { computed } from 'vue'

const props = defineProps({
  event: { type: Object, required: true },
  featured: { type: Boolean, default: false },
})
const emit = defineEmits(['view', 'rsvp', 'waitlist'])
const category = computed(() => (props.event.category || 'Event').replace(/[_-]/g, ' '))
const coverStyle = computed(() => {
  const tiles = {
    sports: ['#fadea3', '#754600'], tech: ['#cce0ff', '#205aa7'], music: ['#c9e9c5', '#28612e'],
    food: ['#f8d4d4', '#a12d2d'], arts: ['#fadea3', '#754600'], career: ['#d6dcf5', '#3d4980'],
    networking: ['#d0e8e3', '#285d51'], social: ['#f0d6dc', '#7a2f45'],
  }
  const tile = tiles[(props.event.category || '').toLowerCase()]
  if (tile) return { background: tile[0], color: tile[1] }
  let hash = 0
  for (const character of props.event.category || 'event') hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  const hue = hash % 360
  return { background: `hsl(${hue} 70% 85%)`, color: `hsl(${hue} 40% 25%)` }
})
const dateLabel = computed(() => {
  const date = new Date(props.event.start_time)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const day = date.toDateString() === today.toDateString() ? 'Today'
    : date.toDateString() === tomorrow.toDateString() ? 'Tomorrow'
      : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  return `${day}, ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
})
const distanceLabel = computed(() => typeof props.event.distance_km === 'number' && Number.isFinite(props.event.distance_km) && props.event.distance_km >= 0
  ? `${props.event.distance_km.toFixed(1)} km from you` : '')
const spotsLabel = computed(() => props.event.spots_left == null ? ''
  : Number(props.event.spots_left) === 0 ? 'Full' : `${props.event.spots_left} spots left`)
// Optional fields belong to the event/registration feature. Display supplied
// values only; these buttons emit intents and never modify a registration.
const isFull = computed(() => !!props.event.is_full || (props.event.spots_left != null && Number(props.event.spots_left) <= 0))
const rsvpStatus = computed(() => props.event.my_rsvp_status || props.event.registration_status)
const action = computed(() => {
  if (rsvpStatus.value === 'confirmed') return { label: 'Going', kind: 'rsvp', disabled: true }
  if (rsvpStatus.value === 'offered') return { label: 'Confirm spot', kind: 'rsvp' }
  if (rsvpStatus.value === 'waitlisted') return { label: 'On waitlist', kind: 'waitlist', disabled: true }
  if (rsvpStatus.value === 'pending') return { label: 'Pending approval', kind: 'rsvp', disabled: true }
  if (isFull.value) return { label: 'Join waitlist', kind: 'waitlist' }
  return { label: 'RSVP', kind: 'rsvp' }
})
const waitlistNote = computed(() => {
  if (rsvpStatus.value === 'waitlisted' && props.event.my_waitlist_priority) return `Your priority: ${props.event.my_waitlist_priority}`
  if (isFull.value && Number.isInteger(props.event.waitlist_count) && props.event.waitlist_count >= 0) return `${props.event.waitlist_count} on the waitlist`
  return ''
})
const reasonType = computed(() => props.event.reason_type || (
  /^Matches your interests/i.test(props.event.reason || '') ? 'interest'
    : /near you/i.test(props.event.reason || '') ? 'distance'
      : /popular/i.test(props.event.reason || '') ? 'popularity' : 'recency'
))
function onAction() {
  if (!action.value.disabled) emit(action.value.kind, props.event)
}
</script>

<template>
  <article class="recommendation-card" :class="{ 'recommendation-card--featured': featured }">
    <div class="pick-cover" :style="coverStyle">
      <img v-if="event.image_url" :src="event.image_url" :alt="`Cover for ${event.title}`" loading="lazy" />
      <template v-else>
        <span>{{ category }}</span>
      </template>
    </div>
    <div class="pick-details">
      <p class="pick-reason">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path v-if="reasonType === 'interest'" d="m12 21-8-8a5 5 0 0 1 8-6 5 5 0 0 1 8 6Z" />
          <template v-else-if="reasonType === 'distance'"><path d="M20 9c0 6-8 13-8 13S4 15 4 9a8 8 0 1 1 16 0Z" /><circle cx="12" cy="9" r="3" /></template>
          <path v-else-if="reasonType === 'popularity'" d="M12 2c2 5-4 6-2 10 1-2 3-2 4-4 6 5 6 13-2 14C3 21 3 13 7 9c-1 5 2 5 2 5-1-6 5-6 3-12Z" />
          <template v-else><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></template>
        </svg>
        {{ event.reason || 'Suggested for you' }}
      </p>
      <h3 class="pick-title">{{ event.title }}</h3>
      <p class="pick-date"><time :datetime="event.start_time">{{ dateLabel }}</time><template v-if="!featured && isFull"> · Full</template><template v-if="featured && distanceLabel"> · {{ distanceLabel }}</template></p>
      <p v-if="featured && event.venue_name" class="pick-venue">{{ event.venue_name }}</p>
      <p v-if="featured && (isFull || spotsLabel)" class="pick-spots">{{ isFull ? 'Full' : spotsLabel }}</p>
      <div class="pick-actions">
        <button type="button" class="btn btn-outline-secondary btn-sm" :aria-label="`View ${event.title}`" @click="emit('view', event)">{{ featured ? 'View event' : 'View' }}</button>
        <button type="button" class="btn btn-sm" :class="action.kind === 'waitlist' ? 'pick-waitlist' : 'btn-primary'" :disabled="action.disabled" :aria-label="`${action.label}: ${event.title}`" @click="onAction">{{ action.label }}</button>
      </div>
      <p v-if="waitlistNote" class="pick-waitlist-note">{{ waitlistNote }}</p>
    </div>
  </article>
</template>

<style scoped>
.recommendation-card { display: flex; align-items: flex-start; gap: 14px; min-width: 0; height: 100%; padding: 16px; border: 1px solid #e1e5eb; border-radius: 18px; background: white; transition: transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease; }
.pick-cover { position: relative; display: flex; align-items: flex-end; flex: 0 0 82px; width: 82px; height: 82px; overflow: hidden; border-radius: 12px; }
.pick-cover img { width: 100%; height: 100%; object-fit: cover; }
.pick-cover svg { width: 36px; height: 36px; opacity: .35; }
.pick-cover span { padding: 8px; text-transform: capitalize; font-size: .8rem; font-weight: 600; }
.pick-details { flex: 1; min-width: 0; }
.pick-reason { display: flex; align-items: flex-start; gap: 7px; margin: 0 0 5px; font-size: .85rem; color: #205aa7; font-weight: 600; overflow-wrap: anywhere; }
.pick-reason svg { flex: 0 0 18px; width: 18px; height: 18px; margin-top: 1px; }
.pick-title { margin: 0 0 4px; font-size: 1rem; font-weight: 650; line-height: 1.3; overflow-wrap: anywhere; }
.pick-title a { display: inline-flex; align-items: center; min-height: 44px; color: inherit; text-decoration: none; }
.pick-title a:hover { text-decoration: underline; }
.pick-date, .pick-spots, .pick-venue { margin: 0; font-size: .85rem; color: #737b88; }
.recommendation-card--featured { align-items: stretch; gap: 0; padding: 0; overflow: hidden; }
.recommendation-card--featured .pick-cover { flex-basis: 42%; width: 42%; height: auto; min-height: 280px; border-radius: 0; }
.recommendation-card--featured .pick-cover svg { width: 68px; height: 68px; }
.recommendation-card--featured .pick-cover span { display: block; position: absolute; left: 16px; bottom: 16px; padding: 0; font-size: .95rem; font-weight: 650; }
.recommendation-card--featured .pick-details { align-self: flex-start; padding: 22px; }
.recommendation-card--featured .pick-title { font-size: 1.2rem; }
.pick-venue, .pick-spots { margin-top: 4px; }
.pick-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.pick-actions .btn { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; border-radius: 12px; padding: 6px 14px; }
.pick-waitlist, .pick-waitlist:disabled { border: 1px solid #e6b547; background: #ffe1a8; color: #754600; opacity: 1; }
.pick-waitlist:hover { background: #ffd58a; border-color: #d5a032; }
.pick-waitlist-note { margin: 4px 0 0; color: #875800; font-size: .8rem; }
@media (hover: hover) { .recommendation-card:hover { transform: translateY(-2px); border-color: #cbd2dc; box-shadow: 0 8px 24px #23304712; } }
@media (max-width: 767px) {
  .recommendation-card { flex-direction: column; padding: 0; gap: 0; overflow: hidden; }
  .pick-cover, .recommendation-card--featured .pick-cover { flex-basis: auto; width: 100%; height: 120px; min-height: 120px; border-radius: 0; }
  .pick-cover span { display: block; position: absolute; left: 16px; bottom: 12px; font-weight: 650; }
  .pick-details, .recommendation-card--featured .pick-details { align-self: stretch; padding: 16px; }
  .recommendation-card--featured .pick-title { font-size: 1rem; }
}
@media (prefers-reduced-motion: reduce) { .recommendation-card { transition: none; } .recommendation-card:hover { transform: none; } }
</style>
