<script setup>
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import EventArtwork from './EventArtwork.vue'
import EventBookmark from './EventBookmark.vue'
import EventCardActions from './EventCardActions.vue'

const optionsOpen = ref(false)

const props = defineProps({
  event: { type: Object, required: true },
  featured: { type: Boolean, default: false },
  strip: { type: Boolean, default: false },
  preferencePending: { type: Boolean, default: false },
})
const failedCover = ref('')
const description = computed(() => typeof props.event.description === 'string' ? props.event.description.trim() : '')
const coverSource = computed(() => props.event?.image_url || props.event?.coverImageUrl || '')
const emit = defineEmits(['view', 'rsvp', 'waitlist', 'preference'])
const matchScore = computed(() => typeof props.event.compatibilityScore === 'number'
  && Number.isFinite(props.event.compatibilityScore) ? Math.round(props.event.compatibilityScore) : null)
const primaryCategory = computed(() => props.event.category || props.event.tags?.[0] || '')
const category = computed(() => (primaryCategory.value || 'Event').replace(/[_-]/g, ' '))
const venueFull = computed(() => [...new Set([
  props.event.venue_name || props.event.venue?.name,
  props.event.venue_address || props.event.venue?.address,
].filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()))].join(' · '))
const venueVisible = computed(() => [props.event.venue_name || props.event.venue?.name, props.event.venue_address || props.event.venue?.address]
  .find(value => typeof value === 'string' && value.trim())?.trim() || 'Venue to be announced')
const venueShort = computed(() => venueVisible.value.length > 36 ? `${venueVisible.value.slice(0, 33).trimEnd()}…` : venueVisible.value)
const dateLabel = computed(() => {
  const date = new Date(props.event.start_time)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const day = date.toDateString() === today.toDateString() ? 'Today'
    : date.toDateString() === tomorrow.toDateString() ? 'Tomorrow'
      : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  return `${day}, ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
})
const distanceLabel = computed(() => typeof props.event.distance_km === 'number' && Number.isFinite(props.event.distance_km) && props.event.distance_km >= 0
  ? `${props.event.distance_km.toFixed(1)} km from you` : '')
const spotsLabel = computed(() => {
  if (props.event.spots_left == null || !Number.isFinite(Number(props.event.spots_left))) return ''
  const count = Number(props.event.spots_left)
  return count <= 0 ? 'Full' : `${count} ${count === 1 ? 'spot' : 'spots'} left`
})
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
  <article class="recommendation-card" :class="{ 'recommendation-card--featured': featured, 'recommendation-card--strip': strip }">
    <div v-if="!strip" class="pick-cover">
      <img v-if="coverSource && failedCover !== coverSource" :src="coverSource" @error="failedCover = coverSource" :alt="`Cover for ${event.title}`" loading="lazy" />
      <EventArtwork v-else :category="primaryCategory" />
      <EventBookmark v-if="event.recommendation_actions" :saved="Boolean(event.saved)"
        :pending="preferencePending" :event-title="event.title"
        @toggle="emit('preference', { event, action: event.saved ? 'unsave' : 'save' })" />
      <span class="pick-category text-caption" aria-hidden="true">{{ category }}</span>
    </div>
    <div class="pick-details">
      <EventBookmark v-if="strip && event.recommendation_actions" class="strip-bookmark" :saved="Boolean(event.saved)" :pending="preferencePending" :event-title="event.title" @toggle="emit('preference', {event, action: event.saved ? 'unsave' : 'save'})" />
      <div v-if="strip" class="strip-meta">
        <span v-if="event.source === 'general_discovery'" class="strip-score">Something to explore</span>
        <span v-else-if="matchScore !== null" class="strip-score" :aria-label="`Match score ${matchScore} out of 100`">{{ matchScore }}% match</span>
        <time :datetime="event.start_time">{{ dateLabel }}</time>
      </div>
      <h3 class="pick-title event-title" :class="{ 'event-title--featured': featured }"><RouterLink :to="`/events/${event.id}/rsvp`">{{ event.title }}</RouterLink></h3>
      <p v-if="!strip" class="pick-date text-meta"><time :datetime="event.start_time">{{ dateLabel }}</time><template v-if="featured && distanceLabel"> · {{ distanceLabel }}</template></p>
      <p class="pick-venue text-meta" :title="venueFull ? `Venue: ${venueFull}` : 'Venue to be announced'" :aria-label="venueFull ? `Venue: ${venueFull}` : 'Venue to be announced'">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M12 22 5.5 12a7.5 7.5 0 1 1 13 0L12 22Z"/><circle cx="12" cy="8.25" r="3.5"/></svg>
        <span aria-hidden="true">{{ venueShort }}<template v-if="strip && spotsLabel"> · {{ spotsLabel }}</template></span>
      </p>

      <p v-if="!strip && event.source === 'general_discovery'" class="pick-source">Something to explore</p>
      <p v-else-if="!strip && matchScore !== null" class="pick-source" :aria-label="`Match score ${matchScore} out of 100`">{{ matchScore }}% match</p>
      <p class="pick-reason text-meta">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path v-if="reasonType === 'interest'" d="m12 21-8-8a5 5 0 0 1 8-6 5 5 0 0 1 8 6Z" />
          <template v-else-if="reasonType === 'distance'"><path d="M20 9c0 6-8 13-8 13S4 15 4 9a8 8 0 1 1 16 0Z" /><circle cx="12" cy="9" r="3" /></template>
          <path v-else-if="reasonType === 'popularity'" d="M12 2c2 5-4 6-2 10 1-2 3-2 4-4 6 5 6 13-2 14C3 21 3 13 7 9c-1 5 2 5 2 5-1-6 5-6 3-12Z" />
          <template v-else><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></template>
        </svg>
        {{ event.reason || 'Suggested for you' }}
      </p>

      <details v-if="event.source || (strip && event.recommendation_actions)" class="pick-explanation">
        <summary>Why this?</summary>
        <p>{{ event.reason }}. <template v-if="event.source === 'personalised'">The match score measures topic fit, not your chance of attending.</template><template v-else>This is an eligible upcoming event, not a personalised match.</template></p>
        <button v-if="strip && event.recommendation_actions" type="button" class="strip-dismiss" :disabled="preferencePending" :aria-label="`Not interested in ${event.title}`" @click="emit('preference', {event, action: 'dismiss'})">Not interested</button>
      </details>
      <p v-if="description" class="pick-description">{{ description }}</p>
      <p v-if="!strip && (isFull || spotsLabel)" class="pick-spots" :class="{ 'pick-spots--full': isFull }">{{ isFull ? (spotsLabel || 'Full') : spotsLabel }}</p>
      <EventCardActions v-if="!strip" class="pick-actions" :event="event" />
      <p v-if="waitlistNote" class="pick-waitlist-note">{{ waitlistNote }}</p>
      <details v-if="!strip && event.recommendation_actions" class="pick-preferences" :aria-busy="preferencePending">
        <summary>More options</summary>

        <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="preferencePending" :aria-label="`Not interested in ${event.title}`"
          @click="emit('preference', { event, action: 'dismiss' })">Not interested</button>
      </details>
    </div>
  </article>
</template>

<style scoped>
.pick-source { margin: 0 0 .4rem; font-weight: 700; color: var(--bookedz-primary-dark); }
.pick-explanation { margin-bottom: .5rem; font-size:var(--text-small); color: var(--bookedz-muted); }
.pick-explanation summary { cursor: pointer; padding: .5rem 0; }
.pick-explanation p { margin: .4rem 0; overflow-wrap: anywhere; }
.pick-preferences { margin-top:10px; color:var(--bookedz-muted); font-size:var(--text-small); }
.pick-preferences summary { cursor:pointer; }
.pick-preferences button { margin-top:8px; }
.pick-preferences button { min-height: 44px; }
.recommendation-card { display: flex; align-items: stretch; gap: 1rem; min-width: 0; height: 100%; padding: 1rem; border: 1px solid var(--bookedz-border, #e9ded3); border-radius: 20px; background: var(--bookedz-surface, #ffffff); box-shadow: 0 8px 22px rgb(41 45 50 / 4%); transition: transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease; }
.pick-cover { position: relative; display: flex; align-items: flex-end; flex: 0 0 96px; width: 96px; min-height: 104px; overflow: hidden; border-radius: 14px; background: var(--bookedz-mint, #ffe4d6); }
.pick-cover > img, .pick-cover :deep(.event-artwork) { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.pick-cover > img { object-fit: cover; }
.pick-category { position: relative; z-index: 1; max-width: calc(100% - 14px); margin: 7px; padding: .25rem .45rem !important; overflow: hidden; border-radius: 999px; background: rgb(255 249 239 / 93%); color: var(--bookedz-ink, #1f2937); font-size:var(--text-caption); font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.pick-details { flex: 1; min-width: 0; }
.pick-reason { display: flex; align-items: flex-start; gap: 7px; margin: 0 0 5px; font-size:var(--text-small); color: var(--bookedz-muted, #596b58); font-weight: 650; overflow-wrap: anywhere; }
.pick-reason svg { flex: 0 0 18px; width: 18px; height: 18px; margin-top: 1px; }
.pick-title { margin: 0 0 .4rem; overflow-wrap: anywhere; }
.pick-title a { display: inline-flex; align-items: center; min-height: 44px; color: inherit; text-decoration: none; }
.pick-title a:hover { text-decoration: underline; }
.pick-description { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; font-size:var(--text-body); line-height: 1.5; color: var(--bookedz-muted); margin: .5rem 0 0; }
.pick-date, .pick-spots, .pick-venue { margin: 0; font-size:var(--text-small); color: var(--bookedz-muted, #636975); }
.pick-venue { display: flex; align-items: flex-start; gap: 6px; margin-top: .45rem; overflow-wrap: anywhere; }
.pick-venue svg { flex: 0 0 16px; width: 16px; height: 16px; margin-top: 2px; }
.pick-spots { display: inline-flex; margin-top: .45rem; padding: .2rem .55rem; border: 1px solid #ffe4d6; border-radius: 999px; background: #ffe4d6; color: #315c3e; font-size:var(--text-caption); font-weight: 650; }
.pick-spots--full { border-color: #e4c7a5; background: #ffe4d6; color: #714a2d; }
.recommendation-card--featured { gap: 0; padding: 0; overflow: hidden; }
.recommendation-card--featured .pick-cover { flex-basis: 44%; width: 44%; min-height: 310px; border-radius: 0; }
.recommendation-card--featured .pick-category { margin: 14px; padding: .4rem .65rem !important; font-size:var(--text-caption); }
.recommendation-card--featured .pick-details { align-self: center; padding: clamp(1.1rem, 2.4vw, 1.75rem); }
.pick-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.pick-actions .btn { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; border-radius: 14px 24px 24px 14px; padding: 12px 54px 12px 18px; }
.pick-waitlist, .pick-waitlist:disabled { border: 1px solid #d8ad42; background: #f6cf77; color: #513c14; opacity: 1; }
.pick-waitlist:hover { background: #edc05d; border-color: #c49b39; }
.pick-waitlist-note { margin: 4px 0 0; color: #875800; font-size:var(--text-small); }
@media (hover: hover) { .recommendation-card:hover { transform: translateY(-2px); border-color: #d7c8b6; box-shadow: 0 12px 28px rgb(41 45 50 / 8%); } }
@media (max-width: 767px) {
  .recommendation-card { flex-direction: column; padding: 0; gap: 0; overflow: hidden; }
  .pick-cover, .recommendation-card--featured .pick-cover { flex-basis: auto; width: 100%; height: 160px; min-height: 160px; border-radius: 0; }
  .pick-category, .recommendation-card--featured .pick-category { display: block; position: absolute; left: 10px; bottom: 10px; margin: 0; font-size:var(--text-caption); }
  .pick-details, .recommendation-card--featured .pick-details { align-self: stretch; padding: 1rem; }
}
@media (prefers-reduced-motion: reduce) { .recommendation-card { transition: none; } .recommendation-card:hover { transform: none; } }
.strip-meta { order: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; padding-right: 26px; color: var(--bookedz-muted); font-size: 10px; }
.strip-score { padding: 1px 6px; border-radius: 99px; background: var(--bookedz-primary-dark); color: var(--bookedz-on-action); font-size: 10px; font-weight: 600; }
.strip-dismiss { display: block; min-height: 44px; padding: 6px 10px; border: 1px solid var(--bookedz-control-border); border-radius: 6px; background: var(--bookedz-surface); color: var(--bookedz-ink); font: inherit; }
.recommendation-card--strip { position: relative; box-shadow: none; }
.recommendation-card--strip .pick-details { display: flex; flex-direction: column; gap: 3px; }
.recommendation-card--strip .pick-title { order: 2; margin: 0; font-family: var(--bookedz-body); font-size: 15px; line-height: 1.3; padding-right: 30px; }
.recommendation-card--strip .pick-title a { min-height: 0; }
.recommendation-card--strip .pick-date { order: 1; padding-right: 30px; font-size: 11px; }
.recommendation-card--strip .pick-source { order: 0; align-self: flex-start; margin: 0 30px 2px 0; padding: 2px 7px; border-radius: 99px; background: var(--bookedz-primary-dark); color: var(--bookedz-on-action); font-size: 10px; }
.recommendation-card--strip .pick-venue { order: 3; margin: 0; font-size: 11px; }
.recommendation-card--strip .pick-venue svg,.recommendation-card--strip .pick-reason svg { display: none; }
.recommendation-card--strip .pick-spots { order: 4; margin: 0; padding: 0; border: 0; border-radius: 0; background: transparent; color: var(--bookedz-muted); font-size: 11px; }
.recommendation-card--strip .pick-reason { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; order: 5; margin: 0; color: var(--bookedz-primary-dark); font-size: 11px; line-height: 1.4; }
.recommendation-card--strip .pick-explanation { order: 6; margin: 0; font-size: 11px; }
.recommendation-card--strip .pick-explanation summary { min-height: 30px; padding: 6px 0; }
.recommendation-card--strip .pick-preferences { order: 7; margin: 0; font-size: 11px; }
.recommendation-card--strip .pick-preferences summary { min-height: 30px; padding: 6px 0; }
.recommendation-card--strip .pick-description { display: none; }
.recommendation-card--strip .strip-bookmark { top: 5px; right: 5px; width: 44px; height: 44px; padding: 11px; border: 0; background: transparent; }
.recommendation-card--strip .pick-waitlist-note { order: 8; font-size: 11px; }
@media(pointer:coarse) { .recommendation-card--strip .pick-title a,.recommendation-card--strip .pick-explanation summary,.recommendation-card--strip .pick-preferences summary { min-height: 44px; } }
</style>
