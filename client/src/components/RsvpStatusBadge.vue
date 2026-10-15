<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: String,
})

// One place that decides the wording + colour of every RSVP status
const STATUS_INFO = {
  pending: { label: 'Awaiting approval', css: 'text-bg-secondary' },
  confirmed: { label: 'Confirmed', css: 'text-bg-success' },
  waitlisted: { label: 'Waitlisted', css: 'text-bg-warning' },
  offered: { label: 'Spot offered', css: 'text-bg-info' },
  rejected: { label: 'Not approved', css: 'text-bg-danger' },
  cancelled: { label: 'Cancelled', css: 'text-bg-light border' },
  declined: { label: 'Offer declined', css: 'text-bg-light border' },
  expired: { label: 'Offer expired', css: 'text-bg-dark' },
}

const info = computed(
  () => STATUS_INFO[props.status] || { label: props.status, css: 'text-bg-secondary' },
)
</script>

<template>
  <span class="badge" :class="info.css">{{ info.label }}</span>
</template>
