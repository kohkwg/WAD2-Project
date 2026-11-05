<script setup>
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import EventArtwork from '../EventArtwork.vue'
import EventBookmark from '../EventBookmark.vue'
import EventCardActions from '../EventCardActions.vue'

const props = defineProps({
  event: { type: Object, required: true },
  recommendation: { type: Object, default: null },
  selected: Boolean, bookmarkEnabled: Boolean, preferencePending: Boolean,
})
const emit = defineEmits(['preference', 'select'])
const failedCover = ref('')
const cover = computed(() => props.event.image_url || props.event.coverImageUrl || '')
const category = computed(() => props.event.category || props.event.tags?.[0] || 'Event')
const time = computed(() => new Date(props.event.start_time).toLocaleTimeString('en-SG', { timeZone: 'Asia/Singapore', hour: 'numeric', minute: '2-digit' }))
const venue = computed(() => props.event.venue_name || 'Venue to be announced')
const places = computed(() => {
  const value = props.event.spots_left
  if (value == null || !Number.isFinite(Number(value))) return ''
  return Number(value) <= 0 ? 'Full' : `${value} ${Number(value) === 1 ? 'spot' : 'spots'} left`
})
const match = computed(() => {
  const pick = props.recommendation
  return pick?.source !== 'general_discovery' && Number.isFinite(pick?.compatibilityScore)
    ? `${Math.round(pick.compatibilityScore)}% match` : ''
})
const picked = computed(() => Boolean(props.recommendation) && props.recommendation.source !== 'general_discovery')
const reason = computed(() => props.recommendation?.reason === 'Upcoming event' ? '' : props.recommendation?.reason || '')
const status = computed(() => props.event.my_rsvp_status || props.event.registration_status)
const categoryLabel = computed(() => {
  const label = category.value.replace(/[_-]/g, ' ')
  return label.charAt(0).toUpperCase() + label.slice(1)
})
// Full facts line for the hover tooltip (the row shows it on one line, ending in "…" if long)
const factsText = computed(() => [time.value, places.value, venue.value].filter(Boolean).join(' · '))
// The clicked row's extra line: match, why it was picked and the category (general picks have
// no "why"). Nothing repeats the lines above it.
const selectedNote = computed(() => [match.value, picked.value ? reason.value : '', categoryLabel.value,
  props.event.friends_going ? `${props.event.friends_going} friends going` : ''].filter(Boolean).join(' · '))
// Your RSVP status as a short line, so rows need no status button until one is selected
const statusNote = computed(() => ({
  confirmed: 'You’re going',
  pending: 'Waiting for approval',
  waitlisted: 'You’re on the waitlist',
  offered: 'A spot opened up for you',
})[status.value] || '')
// Clicking anywhere else on the row selects it (its links and buttons keep their own action).
// Row clicks don't jump to the map on phones; the thumbnail's "Show on map" still does.
function selectFromRow(clickEvent) {
  if (clickEvent.target.closest('a, button, input, select, textarea, summary, label')) return
  emit('select', props.event, { scroll: false, toggle: true })
}
</script>

<template>
  <article class="discovery-event-row lift-on-hover" :class="{ 'is-selected': selected }" :data-event-id="event.id" @click="selectFromRow">
    <button type="button" class="row-cover" :aria-label="`Show ${event.title} on map`" :aria-pressed="selected" @click="emit('select', event)">
      <img v-if="cover && failedCover !== cover" :src="cover" alt="" loading="lazy" @error="failedCover = cover" />
      <EventArtwork v-else :category="category" />
    </button>
    <div class="row-details">
      <div class="row-title-line">
        <h3><RouterLink class="row-title" :to="`/events/${event.id}/rsvp`" :title="event.title">{{ event.title }}</RouterLink></h3>
        <span v-if="picked" class="row-picked">Picked for you</span>
      </div>
      <!-- Time and spots on one line; the venue, often long, gets its own line below -->
      <p class="row-facts" :title="factsText"><time :datetime="event.start_time">{{ time }}</time><template v-if="places"> · {{ places }}</template></p>
      <p class="row-facts row-venue" :title="venue">{{ venue }}</p>
      <p v-if="!selected && statusNote" class="row-going" :class="`row-going--${status}`">{{ statusNote }}</p>
      <p v-else-if="!selected && match" class="row-reason">{{ match }}</p>
    </div>
    <div class="row-actions">
      <EventBookmark v-if="bookmarkEnabled" :saved="Boolean(event.saved)" :pending="preferencePending" :event-title="event.title" @toggle="emit('preference', {event, action: event.saved ? 'unsave' : 'save'})" />
    </div>
    <!-- The clicked card opens up with its next steps; the map only shows where it is -->
    <div v-if="selected" class="row-selected reveal-down">
      <p v-if="selectedNote" class="row-selected-note">{{ selectedNote }}</p>
      <EventCardActions :event="event" />
    </div>
  </article>
</template>

<style scoped>
.discovery-event-row { position: relative; display: grid; grid-template-columns: 66px minmax(0,1fr) auto; align-items: center; gap: 12px; min-width: 0; padding: 10px; border: 1px solid var(--bookedz-border); border-radius: 13px; background: var(--bookedz-surface); cursor: pointer; }
.discovery-event-row.is-selected { border-color: var(--bookedz-primary-dark); box-shadow: 0 0 0 1px var(--bookedz-primary-dark); }
.row-cover { padding: 0; border: 0; cursor: pointer; position: relative; width: 66px; height: 66px; overflow: hidden; border-radius: 9px; background: var(--bookedz-mint); }
.row-cover img,.row-cover :deep(svg) { width: 100%; height: 100%; object-fit: cover; }
.row-details,.row-title-line,h3 { min-width: 0; }
/* Every unclicked row is the same height: the text always has room for three one-line rows */
.row-details { display: flex; flex-direction: column; justify-content: center; min-height: 66px; }
.row-title-line { display: flex; flex-wrap: nowrap; align-items: center; gap: 2px 7px; }
h3 { margin: 0; font-family: var(--bookedz-body); font-size: 15px; font-weight: 700; }
.row-title { display: block; text-decoration: none; padding: 3px 0; border: 0; background: transparent; color: var(--bookedz-ink); font: inherit; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row-title:hover { text-decoration: underline; text-underline-offset: 3px; }
.row-picked { flex: none; padding: 1px 7px; border-radius: 5px; background: var(--bookedz-primary); color: var(--bookedz-on-action); font-size: 10px; font-weight: 700; }
.row-facts,.row-reason,.row-going { margin: 3px 0 0; font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
.row-facts { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* The clicked row shows its full title and venue */
.is-selected .row-title-line { flex-wrap: wrap; }
.is-selected .row-title,.is-selected .row-facts { white-space: normal; overflow-wrap: anywhere; }
.row-selected { grid-column: 1 / -1; display: grid; gap: 8px; padding-top: 10px; border-top: 1px solid var(--bookedz-border); cursor: auto; }
.row-selected-note { margin: 0; color: var(--bookedz-primary-dark); font-size: 12px; font-weight: 600; overflow-wrap: anywhere; }
.row-selected :deep(.card-actions) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.row-selected :deep(.card-action),.row-selected :deep(.registration-status) { justify-content: center; min-height: 44px; border-radius: 10px; }
.row-facts { color: var(--bookedz-muted); }
.row-venue { margin-top: 1px; }
.row-reason { color: var(--bookedz-primary-dark); }
.row-going { color: var(--bookedz-success); font-weight: 600; }
.row-going--pending,.row-going--waitlisted { color: var(--bookedz-muted); }
.row-going--offered { color: var(--bookedz-primary-dark); }
.row-actions { display: flex; align-items: center; gap: 4px; }
.row-actions :deep(.card-action--view) { display: none; }
.row-actions :deep(.card-action--rsvp),.row-actions :deep(.registration-status) { max-width: 108px; padding: 8px 10px; min-height: 44px; font-size: 12px; }
.row-actions :deep(.event-bookmark) { position: relative; inset: auto; flex-shrink: 0; }
@media(max-width:1199px) and (min-width:992px) { .discovery-event-row { grid-template-columns: 48px minmax(0,1fr); gap: 8px; }.row-cover { width: 48px; height: 56px; }.row-actions { grid-column: 2; justify-content: flex-end; } }
@media(max-width:575px) { .discovery-event-row { grid-template-columns: 48px minmax(0,1fr); gap: 8px; }.row-cover { width: 48px; height: 56px; }.row-actions { grid-column: 2; justify-content: flex-end; } }
@media(pointer:coarse) { .row-title { min-height: 44px; } .row-details { min-height: 84px; } }
</style>
