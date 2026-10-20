<script setup>
import { formatShortDateTime } from '../utils/helpers.js'

// Table of RSVPs for the organiser. Used for both "Pending approval" and "Confirmed".
// It doesn't change any data itself — it emits events and the parent page does the work.
defineProps({
  rsvps: Array,
  questions: Array, // the event's custom questions, so we can show each answer
  showActions: Boolean, // true → show Approve / Reject buttons
  busyId: String, // the RSVP currently being saved (its buttons are disabled)
  emptyText: String,
})
const emit = defineEmits(['approve', 'reject', 'toggle-member'])

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
        </tr>
      </thead>
      <tbody>
        <tr v-for="rsvp in rsvps" :key="rsvp.id">
          <td>
            <div class="fw-semibold">{{ rsvp.user.name }}</div>
            <div class="small text-secondary">{{ rsvp.user.email }}</div>
          </td>

          <td v-if="questions.length > 0" class="small">
            <div v-for="question in questions" :key="question.id">
              <span class="text-secondary">{{ question.text }}</span>
              {{ formatAnswer(question, rsvp.answers[question.id]) }}
            </div>
          </td>

          <td>
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

          <td class="small text-secondary">{{ formatShortDateTime(rsvp.createdAt) }}</td>

          <td v-if="showActions" class="text-end text-nowrap">
            <button
              type="button"
              class="btn btn-success btn-sm me-2"
              :disabled="busyId === rsvp.id"
              @click="emit('approve', rsvp.id)"
            >
              Approve
            </button>
            <button
              type="button"
              class="btn btn-outline-danger btn-sm"
              :disabled="busyId === rsvp.id"
              @click="emit('reject', rsvp.id)"
            >
              Reject
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
