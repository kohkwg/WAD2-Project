<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: String,
})

//  To decides the label + colour of every RSVP status
const STATUS_INFO = {
  pending: { label: 'Awaiting approval', css: 'text-bg-secondary' },
  confirmed: { label: 'Confirmed', css: 'text-bg-success' },
  waitlisted: { label: 'Waitlisted', css: 'text-bg-warning' },
  offered: { label: 'Spot offered', css: 'text-bg-info' },
  // rejected = organiser said no while pending, OR removed someone they'd accepted
  rejected: { label: 'Declined by organiser', css: 'text-bg-danger' },
  cancelled: { label: 'Cancelled', css: 'text-bg-light border' },
  declined: { label: 'Offer declined', css: 'text-bg-light border' },
  expired: { label: 'Offer expired', css: 'text-bg-dark' },
}

// Looks up the status in STATUS_INFO; an unknown/ambiguous status falls back to the text-bg-secondary badge
const info = computed(
  () => STATUS_INFO[props.status] || { label: props.status, css: 'text-bg-secondary' },
)
</script>

<template>
  <span class="badge" :class="info.css">{{ info.label }}</span>
</template>
