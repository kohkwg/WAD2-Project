<script setup>
import { computed } from 'vue'

// Hangout facts shared by the hangout page and the invite preview.
const props = defineProps({ event: { type: Object, required: true }, headingLevel: { type: Number, default: 1 } })
const MODE = { group: 'Group hangout', public: 'Open Jio', solo: 'Solo plan' }
const STAGE = { collecting: 'Collecting free times', voting: 'Shaping the plan', final: 'Plan confirmed', ended: 'Ended', cancelled: 'Cancelled' }
const h = computed(() => props.event.hangout || {})
const when = computed(() => {
  const opts = { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' }
  if (h.value.dateRange && !h.value.lockedSlot) {
    const d = v => new Date(`${v}T12:00:00+08:00`).toLocaleDateString('en-SG', opts)
    return `${d(h.value.dateRange.start)} – ${d(h.value.dateRange.end)} · time not chosen yet`
  }
  const start = new Date(props.event.startTime), end = new Date(props.event.endTime)
  const t = x => x.toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Singapore' })
  return `${start.toLocaleDateString('en-SG', opts)} · ${t(start)} – ${t(end)}`
})
const people = computed(() => h.value.mode === 'solo' ? 'Just you' : `${(props.event.confirmedCount || 0) + 1} of ${props.event.capacity} going, including the host`)
</script>

<template>
  <header class="hangout-summary">
    <div class="summary-badges">
      <span class="badge-chip badge-chip--mode">{{ MODE[h.mode] || 'Hangout' }}</span>
      <span class="badge-chip">{{ STAGE[h.stage] || 'Planning' }}</span>
      <span v-if="h.visibility === 'public'" class="badge-chip badge-chip--public">Public</span>
    </div>
    <component :is="`h${headingLevel}`" class="summary-title">{{ event.title }}</component>
    <ul class="summary-facts">
      <li><span class="fact-label">When</span>{{ when }}</li>
      <li><span class="fact-label">Starts from</span>{{ event.venue?.name }}<template v-if="event.venue?.address && event.venue.address !== event.venue.name"> · {{ event.venue.address }}</template></li>
      <li><span class="fact-label">People</span>{{ people }}</li>
    </ul>
    <p v-if="event.description" class="summary-description keep-line-breaks">{{ event.description }}</p>
    <ul v-if="event.tags?.length" class="summary-tags" aria-label="Interests"><li v-for="tag in event.tags" :key="tag">{{ tag }}</li></ul>
  </header>
</template>

<style scoped>
.summary-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.badge-chip { padding: 4px 10px; border-radius: 99px; border: 1px solid var(--bookedz-border); background: var(--bookedz-glass-solid); font-size: .75rem; font-weight: 700; }
.badge-chip--mode { background: var(--bookedz-teal-soft); border-color: transparent; color: var(--bookedz-teal-ink); }
.badge-chip--public { background: var(--bookedz-orange-soft); border-color: transparent; color: var(--bookedz-primary-dark); }
.summary-title { margin-bottom: 12px; overflow-wrap: anywhere; }
.summary-facts { list-style: none; margin: 0 0 12px; padding: 0; display: grid; gap: 6px; }
.summary-facts li { display: flex; flex-wrap: wrap; gap: 4px 10px; font-variant-numeric: tabular-nums; }
.fact-label { min-width: 6.5rem; color: var(--bookedz-muted); font-size: .85rem; font-weight: 600; }
.summary-description { color: var(--bookedz-muted); max-width: 65ch; }
.summary-tags { display: flex; flex-wrap: wrap; gap: 6px; list-style: none; padding: 0; margin: 0; }
.summary-tags li { padding: 4px 10px; border-radius: 99px; background: var(--bookedz-mango-soft); font-size: .78rem; font-weight: 600; text-transform: capitalize; }
</style>
