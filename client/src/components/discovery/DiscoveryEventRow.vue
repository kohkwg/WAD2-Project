<script setup>
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import EventArtwork from '../EventArtwork.vue'
import EventCardActions from '../EventCardActions.vue'
import EventBookmark from '../EventBookmark.vue'

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
</script>

<template>
  <article class="discovery-event-row" :class="{ 'is-selected': selected }" :data-event-id="event.id">
    <button type="button" class="row-cover" :aria-label="`Show ${event.title} on map`" :aria-pressed="selected" @click="emit('select', event)">
      <img v-if="cover && failedCover !== cover" :src="cover" alt="" loading="lazy" @error="failedCover = cover" />
      <EventArtwork v-else :category="category" />
    </button>
    <div class="row-details">
      <div class="row-title-line">
        <h3><RouterLink class="row-title" :to="`/events/${event.id}/rsvp`">{{ event.title }}</RouterLink></h3>
        <span v-if="picked" class="row-picked">Picked for you</span>
        <span class="row-category">{{ category.replace(/[_-]/g, ' ') }}</span>
      </div>
      <p class="row-facts"><time :datetime="event.start_time">{{ time }}</time> · {{ venue }}<template v-if="places"> · {{ places }}</template></p>
      <p v-if="selected" class="row-selected-info"><template v-if="match">{{ match }} · </template><span class="row-cat-text">{{ category.replace(/[_-]/g, ' ') }}</span><template v-if="places"> · {{ places }}</template><template v-if="event.friends_going"> · {{ event.friends_going }} friends going</template><RouterLink :to="`/events/${event.id}/rsvp`" class="row-view">View event ›</RouterLink></p>
      <p v-else-if="status === 'confirmed'" class="row-going">You’re going</p>
      <p v-else-if="match || reason" class="row-reason"><template v-if="match">{{ match }}</template><template v-if="match && reason"> · </template>{{ reason }}</p>
    </div>
    <div class="row-actions">
      <EventBookmark v-if="bookmarkEnabled" :saved="Boolean(event.saved)" :pending="preferencePending" :event-title="event.title" @toggle="emit('preference', {event, action: event.saved ? 'unsave' : 'save'})" />
      <EventCardActions :event="event" />
    </div>
  </article>
</template>

<style scoped>
.discovery-event-row { display: grid; grid-template-columns: 66px minmax(0,1fr) auto; align-items: center; gap: 12px; min-width: 0; padding: 10px; border: 1px solid var(--bookedz-border); border-radius: 13px; background: var(--bookedz-surface); }
.discovery-event-row.is-selected { border-color: var(--bookedz-primary-dark); box-shadow: 0 0 0 1px var(--bookedz-primary-dark); }
.row-cover { padding: 0; border: 0; cursor: pointer; position: relative; width: 66px; height: 66px; overflow: hidden; border-radius: 9px; background: var(--bookedz-mint); }
.row-cover img,.row-cover :deep(svg) { width: 100%; height: 100%; object-fit: cover; }
.row-details,.row-title-line,h3 { min-width: 0; }
.row-title-line { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 7px; }
h3 { margin: 0; font-family: var(--bookedz-body); font-size: 15px; font-weight: 700; }
.row-title { display: block; text-decoration: none; padding: 3px 0; border: 0; background: transparent; color: var(--bookedz-ink); font: inherit; text-align: left; overflow-wrap: anywhere; }
.row-title:hover { text-decoration: underline; text-underline-offset: 3px; }
.row-picked { padding: 1px 7px; border-radius: 5px; background: var(--bookedz-primary); color: var(--bookedz-on-action); font-size: 10px; font-weight: 700; }
.row-category { padding: 1px 6px; border-radius: 5px; background: var(--bookedz-hover); color: var(--bookedz-muted); font-size: 10px; text-transform: capitalize; }
.row-facts,.row-reason,.row-going { margin: 3px 0 0; font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
.row-selected-info { display: flex; flex-wrap: wrap; gap: 0 4px; margin: 6px 0 0; font-size: 12px; color: var(--bookedz-primary-dark); }
.row-cat-text { text-transform: capitalize; color: var(--bookedz-muted); }
.row-view { margin-left: auto; font-weight: 700; color: var(--bookedz-primary-dark); text-decoration: none; }
.row-facts { color: var(--bookedz-muted); }
.row-reason { color: var(--bookedz-primary-dark); }
.row-going { color: var(--bookedz-success); font-weight: 600; }
.row-actions { display: flex; align-items: center; gap: 4px; }
.row-actions :deep(.card-action--view) { display: none; }
.row-actions :deep(.card-action--rsvp),.row-actions :deep(.registration-status) { max-width: 108px; padding: 8px 10px; min-height: 44px; font-size: 12px; }
.row-actions :deep(.event-bookmark) { position: static; flex-shrink: 0; }
@media(max-width:1199px) and (min-width:992px) { .discovery-event-row { grid-template-columns: 48px minmax(0,1fr); gap: 8px; }.row-cover { width: 48px; height: 56px; }.row-actions { grid-column: 2; justify-content: flex-end; } }
@media(max-width:575px) { .discovery-event-row { grid-template-columns: 48px minmax(0,1fr); gap: 8px; }.row-cover { width: 48px; height: 56px; }.row-actions { grid-column: 2; justify-content: flex-end; } }
@media(pointer:coarse) { .row-title { min-height: 44px; } }
</style>
