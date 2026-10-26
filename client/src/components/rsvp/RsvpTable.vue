<script setup>
import { ref, nextTick } from 'vue'
import { formatShortDateTime } from '../../utils/helpers.js'

// Table of RSVPs for the organiser. Used for both "Pending approval" and "Confirmed".
// It doesn't change any data itself — it emits events and the parent page does the work.
defineProps({
  rsvps: Array,
  questions: Array, // the event's custom questions, so we can show each answer
  showActions: Boolean, // true → show Approve / Reject buttons
  showRemove: Boolean, // true → show a Remove button (for people already accepted)
  busyId: String, // the RSVP currently being saved (its buttons are disabled)
  emptyText: String,
})
const emit = defineEmits(['approve', 'reject', 'remove', 'toggle-member'])

// Which row is showing "Remove them? Yes / Keep" (a second click, so one slip can't remove someone)
const confirmRemoveId = ref(null)

function confirmRemove(rsvpId) {
  emit('remove', rsvpId)
  confirmRemoveId.value = null
}

// The pressed button is replaced by the confirm step (and back), so move focus with it
async function askRemove(rsvpId) {
  confirmRemoveId.value = rsvpId
  await nextTick()
  document.getElementById(`keep-attendee-${rsvpId}`)?.focus() // the safe choice is focused first
}

async function keepAttendee(rsvpId) {
  confirmRemoveId.value = null
  await nextTick()
  document.getElementById(`remove-attendee-${rsvpId}`)?.focus()
}

function formatAnswer(question, answer) {
  if (answer === undefined || answer === '') return '—'
  if (question.type === 'yesno') return answer === 'yes' ? 'Yes' : 'No'
  return answer
}
</script>

<template>
  <p v-if="rsvps.length === 0" class="text-secondary my-4">{{ emptyText }}</p>

  <div v-else class="table-responsive">
    <table class="table align-middle">
        <caption class="visually-hidden">RSVPs</caption>
      <thead class="table-light">
        <tr>
          <th scope="col">Name</th>
          <th scope="col" v-if="questions.length > 0">Answers</th>
          <th scope="col">Member</th>
          <th scope="col">RSVP'd</th>
          <th scope="col" v-if="showActions" class="text-end">Decision</th>
          <th scope="col" v-if="showRemove" class="text-end">Remove</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="rsvp in rsvps" :key="rsvp.id">
          <td data-label="Name">
            <div class="fw-semibold">{{ rsvp.user.name }}</div>
            <div class="small text-secondary">{{ rsvp.user.email }}</div>
          </td>

          <td v-if="questions.length > 0" data-label="Answers" class="small">
            <div v-for="question in questions" :key="question.id">
              <span class="text-secondary">{{ question.text }}</span>
              {{ formatAnswer(question, rsvp.answers[question.id]) }}
            </div>
          </td>

          <td data-label="Member">
            <!-- form-switch = Bootstrap's on/off toggle look for a checkbox -->
            <div class="form-check form-switch">
              <input
                class="form-check-input"
                type="checkbox"
                role="switch"
                :id="'member-' + rsvp.id"
                :checked="rsvp.isMember"
                :disabled="busyId === rsvp.id"
                @change="emit('toggle-member', rsvp.userId, $event.target.checked)"
              />
              <label class="form-check-label small" :for="'member-' + rsvp.id">
                {{ rsvp.isMember ? 'Member' : 'No' }}
              </label>
            </div>
          </td>

          <td data-label="RSVP'd" class="small text-secondary">{{ formatShortDateTime(rsvp.createdAt) }}</td>

          <td v-if="showActions" data-label="Decision" class="text-end text-nowrap">
            <button
              type="button"
              class="btn event-cta btn-sm me-2"
              :disabled="busyId === rsvp.id"
              @click="emit('approve', rsvp.id)"
            >
              Approve <span class="visually-hidden">{{ rsvp.user.name }}</span>
            </button>
            <button
              type="button"
              class="btn btn-outline-danger btn-sm"
              :disabled="busyId === rsvp.id"
              @click="emit('reject', rsvp.id)"
            >
              Reject <span class="visually-hidden">{{ rsvp.user.name }}</span>
            </button>
          </td>

          <td v-if="showRemove" data-label="Remove" class="text-end text-nowrap">
            <template v-if="confirmRemoveId === rsvp.id">
              <span class="small me-2">Remove them?</span>
              <button
                type="button"
                class="btn btn-danger btn-sm me-1"
                :disabled="busyId === rsvp.id"
                @click="confirmRemove(rsvp.id)"
              >
                Yes, remove <span class="visually-hidden">{{ rsvp.user.name }}</span>
              </button>
              <button
                :id="`keep-attendee-${rsvp.id}`"
                type="button"
                class="btn btn-outline-secondary btn-sm"
                @click="keepAttendee(rsvp.id)"
              >
                Keep
              </button>
            </template>
            <button
              v-else
              :id="`remove-attendee-${rsvp.id}`"
              type="button"
              class="btn btn-outline-danger btn-sm"
              :disabled="busyId === rsvp.id"
              @click="askRemove(rsvp.id)"
            >
              Remove <span class="visually-hidden">{{ rsvp.user.name }}</span>
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.table { --bs-table-bg: transparent; --bs-table-striped-bg: var(--bookedz-glass-solid); margin-bottom: 0; }
.table thead th { padding-top: .8rem; padding-bottom: .8rem; color: var(--bookedz-muted); font-size: .82rem; font-weight: 700; white-space: nowrap; }
.table td { padding-top: .8rem; padding-bottom: .8rem; }
.table-responsive { border: 1px solid var(--bookedz-border); border-radius: 12px; }
.table .btn { white-space: nowrap; }
@media (max-width: 767.98px) {
  .table-responsive { overflow: visible; border: 0; border-radius: 0; }
  .table,.table tbody { display: block; width: 100%; }
  .table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; clip-path: inset(50%); }
  .table tbody { display: grid; gap: .75rem; }
  .table tr { display: grid; gap: 0; padding: .6rem .85rem; border: 1px solid var(--bookedz-border); border-radius: 15px; background: var(--bookedz-surface); box-shadow: var(--bookedz-card-shadow); }
  .table td { display: grid; grid-template-columns: minmax(85px, 30%) minmax(0, 1fr); align-items: center; gap: .6rem; padding: .55rem 0; border-bottom: 1px solid var(--bookedz-border); text-align: left !important; white-space: normal; }
  .table td:last-child { border-bottom: 0; }
  .table td::before { content: attr(data-label); color: var(--bookedz-muted); font-size: .74rem; font-weight: 700; }
  .table td[data-label="Name"] { display: block; padding-top: .25rem; }
  .table td[data-label="Name"]::before { content: none; }
  .table td[data-label="Name"] .fw-semibold { font-size: 1rem; color: var(--bookedz-ink); }
  .table td[data-label="Name"] .small { overflow-wrap: anywhere; }
  .table td[data-label="Answers"] > div + div { margin-top: .35rem; }
  .table td[data-label="Decision"],.table td[data-label="Remove"] { display: block; padding-top: .7rem; }
  .table td[data-label="Decision"]::before,.table td[data-label="Remove"]::before { display: block; margin-bottom: .5rem; }
  .table td[data-label="Decision"] .btn + .btn { margin-left: .4rem; }
  .table td[data-label="Remove"] .btn { margin: .2rem .25rem .2rem 0; }
}
</style>
