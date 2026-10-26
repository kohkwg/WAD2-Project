<script setup>
import { ref, computed, useId, watch } from 'vue'
import { formatEventTime } from '../../utils/helpers.js'
import EventArtwork from '../EventArtwork.vue'

// Read-only card with an event's key details.
// Used on the RSVP page and the "Review" step of Create Event.
// Anything placed between <EventSummary> ... </EventSummary> appears at the bottom (the <slot>).
const props = defineProps({
  event: Object,
  headingTag: { type: String, default: 'h2', validator: value => ['h1', 'h2', 'h3'].includes(value) },
})

const failedCover = ref('')
const coverSource = computed(() => props.event?.image_url || props.event?.coverImageUrl || '')
const showFullDescription = ref(false)
const descriptionId = useId()
watch(() => props.event?.id, () => { showFullDescription.value = false })
const SHORT_LENGTH = 160

const isLong = computed(() => (props.event.description || '').length > SHORT_LENGTH)
const descriptionToShow = computed(() => {
  const text = props.event.description || ''
  if (!isLong.value || showFullDescription.value) return text
  return text.slice(0, SHORT_LENGTH) + '…'
})
</script>

<template>
  <article class="card event-summary">
    <div class="card-body">
      <div class="event-heading">
        <component :is="headingTag" class="event-title">{{ event.title || 'Untitled event' }}</component>
      </div>
      <p class="event-time"><span class="detail-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg></span>{{ formatEventTime(event) }}</p>

      <div class="event-venue">
        <span class="venue-label">Where</span>
        <p class="venue-name"><span aria-hidden="true">⌖</span> {{ event.venue ? event.venue.name : 'not set yet' }}</p>
        <p v-if="event.venue" class="venue-address">{{ event.venue.address }}</p>
      </div>

      <p v-if="event.usingBackup" class="small mb-2 text-success">Backup venue is active.</p>

      <p v-else-if="event.isOutdoor && event.backupVenue" class="small mb-2">
        Outdoor event. Backup venue if rain is forecast:
        <strong>{{ event.backupVenue.name }}</strong>
      </p>

      <div class="event-facts" aria-label="Event details">
        <div class="event-fact"><span class="fact-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="3"/><path d="M5 20v-2a7 7 0 0 1 14 0v2"/></svg></span><span><strong>{{ event.capacity }}</strong><small>places</small></span></div>
        <div v-if="event.spotsLeft != null" class="event-fact"><span class="fact-icon fact-icon--coral" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4Z"/><path d="M15 6v12" stroke-dasharray="2 2"/></svg></span><span><strong>{{ event.spotsLeft }}</strong><small>spots left</small></span></div>
      </div>

    <div class="event-cover">
      <img v-if="coverSource && failedCover !== coverSource" :src="coverSource" @error="failedCover = coverSource" :alt="`Cover for ${event.title}`" width="1200" height="600" />
      <EventArtwork v-else :category="event.category || event.tags?.[0] || ''" />
      <span v-if="event.category || event.tags?.[0]" class="cover-category">{{ event.category || event.tags?.[0] }}</span>
    </div>
      <div class="mb-2">
        <span v-for="tag in event.tags" :key="tag" class="badge text-bg-light border me-1">
          {{ tag }}
        </span>
      </div>

      <!-- Progressive disclosure: long descriptions start short with a "Show more" toggle -->
      <template v-if="event.description">
        <p :id="descriptionId" class="keep-line-breaks mt-3 mb-1">{{ descriptionToShow }}</p>
        <button
          v-if="isLong"
          type="button"
          class="btn btn-link btn-sm p-0"
          :aria-expanded="showFullDescription"
          :aria-controls="descriptionId"
          @click="showFullDescription = !showFullDescription"
        >
          {{ showFullDescription ? 'Show less' : 'Show more' }}
        </button>
      </template>

      <slot></slot>
    </div>
  </article>
</template>

<style scoped>
.event-summary { overflow: hidden; border: 1px solid var(--bookedz-border); border-radius: var(--bookedz-radius-card, 24px); background: var(--bookedz-surface); box-shadow: var(--bookedz-card-shadow); }
.event-cover { position: relative; display: block; width: 100%; height: clamp(160px, 24vw, 260px); margin: 1.1rem 0; border-radius: 16px; overflow: hidden; background: var(--bookedz-mint); }
.event-cover img { display: block; width: 100%; height: 100%; object-fit: cover; animation: image-settle 650ms ease both; }
.event-cover > :deep(.event-artwork) { position: absolute; inset: 0; }
.cover-category { position: absolute; left: 1rem; bottom: 1rem; max-width: calc(100% - 2rem); padding: .35rem .75rem; border: 1px solid var(--bookedz-glass-border); border-radius: 999px; color: var(--bookedz-ink); background: var(--bookedz-glass); font-size: .8rem; font-weight: 700; }
.event-summary .card-body { padding: clamp(1.15rem, 3vw, 1.7rem); }
.event-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: .8rem; }
.event-title { margin: 0 0 .6rem; min-width: 0; color: var(--bookedz-ink); font: 600 clamp(1.65rem, 3vw, 2.25rem)/1.04 var(--bookedz-heading); letter-spacing: -.04em; }
.date-mark { display: grid; flex: 0 0 38px; place-items: center; width: 38px; height: 38px; border-radius: 13px; background: var(--bookedz-yellow); color: var(--bookedz-ink); font-size: 1.25rem; }
.event-time { display: flex; gap: .55rem; align-items: center; margin: 0 0 1rem; color: var(--bookedz-ink-soft); font-size: .95rem; font-weight: 600; }
.detail-icon svg,.fact-icon svg { width: 20px; height: 20px; }
.detail-icon { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 9px; background: var(--bookedz-glass-hover); color: var(--bookedz-forest); font-size: 1.2rem; }
.event-venue { margin-bottom: .9rem; padding: .85rem 1rem; border-radius: 15px; background: color-mix(in srgb, var(--bookedz-yellow) 20%, var(--bookedz-surface)); }
.venue-label { color: var(--bookedz-muted); font-size: .8rem; font-weight: 650; }
.venue-name { margin: .15rem 0 0; color: var(--bookedz-ink); font-weight: 750; }
.venue-name span { color: var(--bookedz-primary-dark); }
.venue-address { margin: .15rem 0 0; color: var(--bookedz-muted); font-size: .9rem; }
.event-facts { display: flex; flex-wrap: wrap; gap: .6rem; margin: 0 0 .9rem; }
.event-fact { display: flex; align-items: center; gap: .55rem; min-width: 112px; padding: .55rem .7rem; border: 1px solid var(--bookedz-border); border-radius: 13px; }
.fact-icon { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 10px; color: var(--bookedz-forest); background: var(--bookedz-mint); font-size: 1.15rem; }
.fact-icon--coral { color: var(--bookedz-on-action); background: var(--bookedz-primary-dark); }
.event-fact strong,.event-fact small { display: block; line-height: 1.2; }
.event-fact strong { font-size: .9rem; }
.event-fact small { color: var(--bookedz-muted); font-size: .72rem; }
.event-summary :deep(.badge) { margin-bottom: .35rem; color: var(--bookedz-ink); background: var(--bookedz-glass-hover) !important; border-color: var(--bookedz-border) !important; }
.event-summary :deep(.keep-line-breaks) { color: var(--bookedz-muted); font-size: .94rem; line-height: 1.55; }
:deep(.badge) { border-radius: 999px; padding: .45rem .7rem; font-weight: 600; }
@keyframes image-settle { from { opacity: .65; transform: scale(1.025); } to { opacity: 1; transform: scale(1); } }
@media(prefers-reduced-motion:reduce) { .event-cover img { animation: none; } }
</style>
