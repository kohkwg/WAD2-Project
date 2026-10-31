<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

const props = defineProps({
  event: { type: Object, required: true },
})

const status = computed(() =>
  props.event.my_rsvp_status || props.event.registration_status
)

const action = computed(() => {
  if (status.value === 'confirmed') {
    return { label: 'Confirmed', status: 'confirmed' }
  }

  if (status.value === 'pending') {
    return { label: 'Pending approval', status: 'pending' }
  }

  if (status.value === 'waitlisted') {
    return { label: 'On waitlist', status: 'waitlisted' }
  }

  if (status.value === 'offered') {
    return { label: 'Review offer', hash: '#rsvp' }
  }

  const full = props.event.is_full ||
    (props.event.spots_left != null &&
      Number(props.event.spots_left) <= 0)

  return full
    ? { label: 'Join waitlist', hash: '#waitlist' }
    : { label: 'RSVP', hash: '#rsvp' }
})
</script>

<template>
  <div class="card-actions">
    <RouterLink
      class="card-action card-action--view"
      :to="`/events/${event.id}/rsvp`"
      :aria-label="`View ${event.title}`"
    >
      View event
    </RouterLink>

    <span
      v-if="action.status"
      class="registration-status"
      :class="`registration-status--${action.status}`"
      :aria-label="`${action.label}: ${event.title}`"
    >
      {{ action.label }}
    </span>

    <RouterLink
      v-else
      class="card-action card-action--rsvp"
      :to="{
        path: `/events/${event.id}/rsvp`,
        hash: action.hash
      }"
      :aria-label="`${action.label}: ${event.title}`"
    >
      {{ action.label }}
    </RouterLink>
  </div>
</template>

<style scoped>
.card-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.card-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 9px 14px;
  border: 1px solid var(--bookedz-primary-dark);
  border-radius: 6px;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  text-align: center;
}

.card-action--view {
  color: var(--bookedz-primary-dark);
  background: var(--bookedz-surface);
}

.card-action--view:hover {
  background: var(--bookedz-glass-active);
  color: var(--bookedz-primary-dark);
}

.card-action--rsvp {
  background: var(--bookedz-primary-dark);
  color: #fff;
}

.card-action--rsvp:hover {
  filter: brightness(.94);
  color: #fff;
}

.registration-status {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border: 1px solid transparent;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}

.registration-status--confirmed {
  background: #e5f2e8;
  border-color: #c5ddcb;
  color: #285237;
}

.registration-status--pending {
  background: #fff2d6;
  border-color: #ead39c;
  color: #75500b;
}

.registration-status--waitlisted {
  background: #e8effb;
  border-color: #c9d7ef;
  color: #345787;
}

.card-action:focus-visible {
  outline: 2px solid var(--bookedz-primary-dark);
  outline-offset: 3px;
}

.card-action,
.registration-status {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 10px 14px;
  border-radius: 6px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  text-align: center;
}

</style>