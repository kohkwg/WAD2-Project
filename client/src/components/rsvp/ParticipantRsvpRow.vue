<script setup>
import { RouterLink } from 'vue-router';
import RsvpStatusBadge from '../RsvpStatusBadge.vue';
import { formatEventTime } from '../../utils/helpers.js';
// the plans page supplies the registration and available actions
defineProps({
  rsvp: {
    type: Object,
    required: true
  },
  past: Boolean,
  closed: Boolean,
  confirming: Boolean,
  busy: Boolean,
  disabled: Boolean,
  ticketsEnabled: Boolean
});
defineEmits(['ask-cancel', 'keep', 'cancel']);

// show the month or day in the date label

function datePart(event, part) {
  const date = new Date(event.startTime);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-SG', part === 'month' ? {
    month: 'short'
  } : {
    day: 'numeric'
  });
}
</script>

<template>
  <article class="rsvp-row rsvp-card card">
    <div class="row-date" aria-hidden="true">
    <span>{{ datePart(rsvp.event, 'month') }}</span>
    <strong>{{
      datePart(rsvp.event, 'day') }}</strong></div>
    <div class="row-copy">
      <h3 class="event-title">
        <RouterLink :to="`/events/${rsvp.event.id}/rsvp`">{{ rsvp.event.title }}</RouterLink>
      </h3>
      <p class="text-meta">{{ formatEventTime(rsvp.event) }} · {{ rsvp.event.venue?.name || 'Venue to be confirmed' }}
      </p>
      <div class="row-badges">
        <RsvpStatusBadge :status="rsvp.status" />
      <span v-if="rsvp.attendanceVerified" class="badge text-bg-success">{{
          past ? 'Attended' : 'Checked in' }}</span>
      </div>
      <p v-if="!past && !closed && rsvp.status === 'pending'" class="row-note">The organiser hasn't reviewed your RSVP
        yet.</p>
      <p v-if="!past && !closed && rsvp.status === 'waitlisted'" class="row-note">We'll show an offer here if a spot
        opens up.</p>
    </div>
    <div class="row-actions">
      <RouterLink v-if="ticketsEnabled && !past && !closed && rsvp.status === 'confirmed'"
        :to="`/events/${rsvp.event.id}/ticket`" class="btn btn-outline-secondary">View ticket</RouterLink>
      <template v-if="!past && !closed && rsvp.status !== 'offered'">
        <template v-if="rsvp.checkedInAt">
          <button type="button" class="btn btn-outline-secondary" disabled
            :aria-describedby="`cancel-blocked-${rsvp.id}`">Cancel RSVP</button>
          <p :id="`cancel-blocked-${rsvp.id}`" class="row-note">Cancellation unavailable: a check-in is recorded for
            this RSVP.</p>
        </template>
        <template v-else-if="confirming">
          <p>Cancel this RSVP?</p>
          <button type="button" class="btn btn-danger" :disabled="disabled" @click="$emit('cancel', rsvp.id)">{{ busy ?
            'Cancelling…' : 'Yes, cancel' }}</button>
          <button :id="`keep-${rsvp.id}`" type="button" class="btn btn-outline-secondary" :disabled="disabled"
            @click="$emit('keep', rsvp.id)">Keep it</button>
        </template>
        <button v-else :id="`cancel-${rsvp.id}`" type="button" class="btn btn-outline-secondary" :disabled="disabled"
          @click="$emit('ask-cancel', rsvp.id)">Cancel RSVP<span class="visually-hidden"> for {{ rsvp.event.title
            }}</span></button>
      </template>
    </div>
  </article>
</template>

<style scoped>
.rsvp-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 18px;
  padding: 20px;
  border: 1px solid var(--bookedz-border);
  border-radius: 18px;
  background: var(--bookedz-surface);
  margin-bottom: 12px;
}

.row-date {
  flex: 0 0 56px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 13px;
  background: var(--bookedz-hover);
  padding: 10px 5px;
}

.row-date span {
  font-size: .75rem;
}

.row-date strong {
  font-size: 1.6rem;
}

.row-copy {
  min-width: 0;
  flex: 1;
}

.row-copy h3 {
  margin: 0 0 6px;
}

.row-copy h3 a {
  color: var(--bookedz-ink);
  text-decoration: none;
  overflow-wrap: anywhere;
}

.row-copy p {
  font-size: var(--text-small);
  color: var(--bookedz-muted);
  margin: 0 0 8px;
  overflow-wrap: anywhere;
}

.row-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.row-note {
  margin-top: 8px !important;
}

.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  max-width: 250px;
}

.row-actions .btn {
  min-height: 44px;
}

.row-actions p {
  width: 100%;
  margin: 0;
  font-size: var(--text-small);
}

@media(max-width:767px) {
  .rsvp-row {
    flex-wrap: wrap;
    padding: 16px;
    gap: 12px;
  }
  .row-actions {
    width: 100%;
    max-width: none;
    margin-left: 68px;
    justify-content: flex-start;
  }
  .row-copy {
    flex-basis: calc(100% - 68px);
  }
}
</style>
