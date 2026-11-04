<script setup>
import { computed, ref } from 'vue'
import { joinHangout, ACTIVE_STATUSES } from '../../utils/api.js'
import { JOIN_MODE_LABELS } from '../../utils/hangouts.js'

// Join a hangout under its organiser's join mode. Open joins are instant and refuse when
// full; RSVP modes reuse the existing confirm/waitlist/approval rules.
const props = defineProps({ event: { type: Object, required: true }, myRsvp: { type: Object, default: null }, inviteToken: { type: String, default: '' } })
const emit = defineEmits(['joined'])
const joining = ref(false)
const errorMessage = ref('')
const status = ref('')

const joinMode = computed(() => props.event.joinMode || (props.event.requiresApproval ? 'approval' : 'auto'))
const current = computed(() => status.value || (props.myRsvp && ACTIVE_STATUSES.includes(props.myRsvp.status) ? props.myRsvp.status : ''))
const full = computed(() => joinMode.value === 'open' && props.event.spotsLeft <= 0)
const STATUS_TEXT = { confirmed: 'You’re in.', pending: 'Request sent. The host approves each RSVP.', waitlisted: 'You’re on the waitlist. You’ll get an offer if a spot opens.', offered: 'A spot opened up for you. Confirm it in My RSVPs.' }
const actionLabel = computed(() => joinMode.value === 'open' ? 'Join hangout' : joinMode.value === 'approval' ? 'Request a spot' : 'RSVP')

async function join() {
  if (joining.value) return
  joining.value = true
  errorMessage.value = ''
  try {
    const rsvp = await joinHangout({ eventId: props.event.id, token: props.inviteToken || undefined })
    status.value = rsvp.status
    emit('joined', rsvp)
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    joining.value = false
  }
}
</script>

<template>
  <div class="hangout-join" aria-live="polite">
    <p class="join-mode"><strong>{{ JOIN_MODE_LABELS[joinMode].title }}</strong> · {{ JOIN_MODE_LABELS[joinMode].detail }}</p>
    <p v-if="current" class="join-status" :class="`join-status--${current}`" role="status">{{ STATUS_TEXT[current] || current }}</p>
    <template v-else>
      <p v-if="full" class="join-full" role="status">This hangout is full, so it isn’t taking new joins.</p>
      <button v-else type="button" class="btn btn-primary" :disabled="joining" @click="join">
        <span v-if="joining" class="spinner-border spinner-border-sm" aria-hidden="true"></span>{{ joining ? 'Joining…' : actionLabel }}
      </button>
      <p v-if="errorMessage" class="text-danger small mt-2 mb-0" role="alert">{{ errorMessage }} You can try again.</p>
    </template>
  </div>
</template>

<style scoped>
.join-mode { font-size: .85rem; color: var(--bookedz-muted); }
.join-mode strong { color: var(--bookedz-ink); }
.join-status { margin: 0; padding: 12px 14px; border-radius: var(--bookedz-radius-control); font-weight: 700; background: var(--bookedz-glass-solid); }
.join-status--confirmed { background: var(--bookedz-teal-soft); color: var(--bookedz-teal-ink); }
.join-status--pending,.join-status--waitlisted,.join-status--offered { background: var(--bookedz-mango-soft); color: var(--bookedz-ink); }
.join-full { margin: 0; padding: 12px 14px; border-radius: var(--bookedz-radius-control); background: var(--bookedz-disabled-bg); color: var(--bookedz-ink); }
</style>
