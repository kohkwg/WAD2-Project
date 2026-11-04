<script setup>
import { RouterLink } from 'vue-router'
import EventArtwork from '../EventArtwork.vue'
import { formatEventTime } from '../../utils/helpers.js'
import { directionsUrl, eventCalendar } from '../../utils/rsvpOverview.js'
defineProps({ rsvp: { type: Object, required: true }, ticketsEnabled: Boolean })
defineEmits(['calendar'])
</script>
<template>
  <section class="next-event" aria-labelledby="next-event-title">
    <div class="next-art" aria-hidden="true"><EventArtwork :category="rsvp.event.tags?.[0]" /></div>
    <div class="next-copy">
      <p class="next-eyebrow text-caption">Your next plan <span>Confirmed</span></p>
      <h2 id="next-event-title" class="event-title event-title--featured">{{ rsvp.event.title }}</h2>
      <p class="text-meta">{{ formatEventTime(rsvp.event) }}</p>
      <p class="text-meta">{{ rsvp.event.venue?.name || 'Venue to be confirmed' }}</p>
      <div class="next-actions">
        <RouterLink v-if="ticketsEnabled" :to="`/events/${rsvp.event.id}/ticket`" class="btn event-cta">View ticket</RouterLink>
        <RouterLink v-else :to="`/events/${rsvp.event.id}/rsvp`" class="btn event-cta">View event</RouterLink>
        <a v-if="directionsUrl(rsvp.event)" :href="directionsUrl(rsvp.event)" target="_blank" rel="noopener noreferrer" class="btn btn-outline-secondary">Get directions ↗</a>
        <button v-if="eventCalendar(rsvp.event)" type="button" class="btn btn-outline-secondary" @click="$emit('calendar', rsvp.event)">Add to calendar</button>
      </div>
    </div>
  </section>
</template>
<style scoped>
.next-event{display:grid;grid-template-columns:190px 1fr;gap:28px;padding:24px;margin:24px 0;border:1px solid var(--bookedz-border);border-radius:24px;background:var(--bookedz-surface)}
.next-art{overflow:hidden;border-radius:18px;background:var(--bookedz-hover)}.next-art :deep(svg){width:100%;height:100%;min-height:180px}.next-copy{min-width:0;align-self:center}.next-copy h2{ overflow-wrap:anywhere; }.next-copy>p:not(.next-eyebrow){color:var(--bookedz-muted);margin:8px 0;font-size:var(--text-small)}.next-eyebrow{font-size:var(--text-caption);font-weight:700;display:flex;gap:14px;align-items:center;flex-wrap:wrap}.next-eyebrow span{letter-spacing:0;color:var(--bookedz-success);padding:5px 9px;border-radius:20px;background:color-mix(in srgb,var(--bookedz-success) 10%,var(--bookedz-surface))}.next-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}.next-actions>*{ min-height:44px; }
@media(max-width:575px){.next-event{grid-template-columns:1fr;gap:18px;padding:18px}.next-art{max-height:140px}.next-art :deep(svg){min-height:140px}.next-actions>*{ flex:1 1 auto; }}
</style>
