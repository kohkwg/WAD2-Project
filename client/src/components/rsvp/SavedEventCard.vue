<script setup>
import { RouterLink } from 'vue-router'
import EventArtwork from '../EventArtwork.vue'
import { formatEventTime } from '../../utils/helpers.js'
defineProps({ event: { type: Object, required: true }, busy: Boolean, disabled: Boolean })
defineEmits(['unsave'])
</script>
<template>
  <article class="saved-event">
    <div class="saved-art" aria-hidden="true"><EventArtwork :category="event.tags?.[0]" /></div>
    <div class="saved-copy"><span class="saved-label text-caption">Saved for later</span><h3 class="event-title"><RouterLink :to="`/events/${event.id}/rsvp`">{{ event.title }}</RouterLink></h3><p class="text-meta">{{ formatEventTime(event) }}</p><p class="text-meta">{{ event.venue?.name || 'Venue to be confirmed' }}</p><div class="saved-actions"><RouterLink class="btn btn-outline-secondary" :to="`/events/${event.id}/rsvp`">View event</RouterLink><button type="button" class="btn btn-outline-secondary" :disabled="disabled" :aria-label="`Unsave ${event.title}`" @click="$emit('unsave', event.id)">{{ busy ? 'Removing…' : 'Unsave' }}</button></div></div>
  </article>
</template>
<style scoped>
.saved-event{overflow:hidden;border:1px solid var(--bookedz-border);border-radius:20px;background:var(--bookedz-surface)}.saved-art{height:140px;background:var(--bookedz-hover)}.saved-art :deep(svg){width:100%;height:100%}.saved-copy{padding:20px;min-width:0}.saved-label{font-size:var(--text-caption);color:var(--bookedz-muted)}h3{ margin:10px 0; }h3 a{color:var(--bookedz-ink);text-decoration:none;overflow-wrap:anywhere}p{font-size:var(--text-small);color:var(--bookedz-muted);margin:6px 0;overflow-wrap:anywhere}.saved-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.saved-actions>*{ min-height:44px; }
</style>
