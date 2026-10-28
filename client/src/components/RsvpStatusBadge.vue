<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: String,
})

//  To decides the label + colour of every RSVP status
const STATUS_INFO = {
  pending: { label: 'Awaiting approval', css: 'status-pending' },
  confirmed: { label: 'Confirmed', css: 'status-confirmed' },
  waitlisted: { label: 'Waitlisted', css: 'status-waitlisted' },
  offered: { label: 'Spot offered', css: 'status-offered' },
  // rejected = organiser said no while pending, OR removed someone they'd accepted
  rejected: { label: 'Declined by organiser', css: 'status-rejected' },
  cancelled: { label: 'Cancelled', css: 'status-closed' },
  declined: { label: 'Offer declined', css: 'status-closed' },
  expired: { label: 'Offer expired', css: 'status-closed' },
}

// Looks up the status in STATUS_INFO; an unknown/ambiguous status falls back to the text-bg-secondary badge
const info = computed(
  () => STATUS_INFO[props.status] || { label: props.status, css: 'status-pending' },
)
const symbol = computed(() => {
  if (props.status === 'confirmed') return 'M5 12l4 4 10-10'
  if (props.status === 'pending') return 'M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm0 3v4l3 2'
  if (props.status === 'offered') return 'M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4ZM15 6v12'
  if (props.status === 'waitlisted') return 'M5 7h14M5 12h10M5 17h6'
  return 'M6 6l12 12M18 6 6 18'
})
</script>

<template>
  <span class="badge rsvp-status" :class="info.css"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="symbol"/></svg>{{ info.label }}</span>
</template>

<style scoped>
.rsvp-status { --status-tone: var(--bookedz-muted); display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: .4rem .75rem; border: 1px solid color-mix(in srgb,var(--status-tone) 35%,var(--bookedz-border)); border-radius: 12px; color: var(--bookedz-ink); background: color-mix(in srgb,var(--status-tone) 12%,var(--bookedz-surface)); font-size: .8rem; font-weight: 650; line-height: 1.35; }
.rsvp-status svg { flex-shrink: 0; width: 17px; height: 17px; color: var(--status-tone); }
.status-confirmed { --status-tone: var(--bookedz-success); }
.status-pending,.status-waitlisted { --status-tone: var(--bookedz-primary-dark); }
.status-offered { --status-tone: var(--bookedz-forest); }
.status-rejected { --status-tone: var(--bookedz-danger); }
</style>
