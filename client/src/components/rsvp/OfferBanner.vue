<script setup>
import { computed } from 'vue'
import { formatEventTime, formatTimeLeft } from '../../utils/helpers.js'

// Shown on My RSVPs when a waitlist spot has been offered to you.
// The parent passes `now` (updated every 30s) so the countdown moves.
const props = defineProps({
  rsvp: Object, // includes rsvp.event
  now: Number,
  busy: Boolean,
})
const emit = defineEmits(['confirm', 'decline'])

const timeLeft = computed(() => formatTimeLeft(props.rsvp.offerExpiresAt, props.now))
const isExpired = computed(() => !(Date.parse(props.rsvp.offerExpiresAt) > props.now))
</script>

<template>
  <div
    class="offer-banner d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3 attention-once"
    :class="isExpired ? 'offer-expired' : 'offer-active'"
  >
    <div>
      <p class="offer-eyebrow">Waitlist offer</p>
      <h2 class="event-title mb-0">A spot opened up for {{ rsvp.event.title }}</h2>
      <div class="small">{{ formatEventTime(rsvp.event) }}</div>
      <div v-if="!isExpired" class="small mt-1">
        Time left to confirm: <strong>{{ timeLeft }}</strong>
      </div>
      <div v-if="!isExpired" class="small">
        If you don't confirm in time, it goes to the next person on the waitlist.
      </div>
      <div v-else class="small mt-1">This offer has expired.</div>
    </div>

    <div v-if="!isExpired" class="offer-actions d-flex gap-2 flex-shrink-0">
      <button
        type="button"
        class="btn event-cta"
        :disabled="busy"
        @click="emit('confirm', rsvp.id)"
      >
        <span v-if="busy" class="spinner-border spinner-border-sm me-1"></span>
        Confirm my spot
      </button>
      <button
        type="button"
        class="btn event-cta event-cta--secondary"
        :disabled="busy"
        @click="emit('decline', rsvp.id)"
      >
        Decline
      </button>
    </div>
  </div>
</template>

<style scoped>
.offer-banner { margin-bottom: 1rem; padding: 1.3rem 1.5rem; border: 1px solid color-mix(in srgb,var(--bookedz-primary-dark) 30%,var(--bookedz-border)); border-radius: 18px; color: var(--bookedz-ink); background: var(--bookedz-mango); }
.offer-eyebrow { font-size:var(--text-caption); font-weight: 700; margin: 0 0 8px; color: var(--bookedz-primary-dark); }

.offer-expired { border-color: var(--bookedz-border, #e9ded3); color: var(--bookedz-muted); background: var(--bookedz-glass-solid); }
.offer-banner button { min-height: 44px; }
/* Phones: full-width stacked actions instead of two squeezed buttons with wrapping labels */
@media (max-width: 575.98px) { .offer-actions { flex-direction: column; } }
:deep(:focus-visible) { outline: 3px solid var(--bookedz-primary-dark); outline-offset: 3px; }
</style>
