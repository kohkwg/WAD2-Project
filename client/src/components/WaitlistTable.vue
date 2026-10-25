<script setup>
import { formatTimeLeft } from '../utils/helpers.js'
import { WEIGHTS } from '../utils/waitlistScore.js'

// Organiser view of who is waiting, in score order, plus anyone currently holding an offer.
defineProps({
  offers: Array, // RSVPs with status 'offered'
  waitlist: Array, // RSVPs with status 'waitlisted', already sorted by rank
  now: Number,
  busyId: String,
})
const emit = defineEmits(['toggle-member'])

function percent(value) {
  return Math.round(value * 100) + '%'
}
</script>

<template>
  <!-- People who have been offered a spot and are deciding -->
  <h6 class="mt-3">Offers waiting for a reply</h6>
  <p v-if="offers.length === 0" class="text-secondary small">No open offers.</p>
  <ul v-else class="list-group mb-4">
    <li
      v-for="rsvp in offers"
      :key="rsvp.id"
      class="list-group-item d-flex justify-content-between align-items-center"
    >
      <div>
        <div class="fw-semibold">{{ rsvp.user.name }}</div>
        <div class="small text-secondary">{{ rsvp.user.email }}</div>
      </div>
      <span class="badge text-bg-info">
        Expires in {{ formatTimeLeft(rsvp.offerExpiresAt, now) }}
      </span>
    </li>
  </ul>

  <!-- The ranked waitlist -->
  <h6>Waitlist (highest score gets the next spot)</h6>
  <p class="small text-secondary mb-2">
    Score = {{ WEIGHTS.member }} × member + {{ WEIGHTS.interest }} × interest match +
    {{ WEIGHTS.showUp }} × show-up rate. Recent events count more; late cancellations lower the
    show-up rate.
  </p>

  <p v-if="waitlist.length === 0" class="text-secondary my-3">Nobody is waiting.</p>

  <div v-else class="table-responsive">
    <table class="table align-middle">
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Name</th>
          <th scope="col" style="min-width: 160px">Score</th>
          <th scope="col">Why</th>
          <th scope="col">Member</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="rsvp in waitlist" :key="rsvp.id">
          <td class="fw-bold">{{ rsvp.rank }}</td>
          <td>
            <div class="fw-semibold">{{ rsvp.user.name }}</div>
            <div class="small text-secondary">{{ rsvp.user.email }}</div>
          </td>
          <td>
            <div class="small fw-semibold">{{ rsvp.score.total.toFixed(2) }}</div>
            <div class="progress" style="height: 6px">
              <div class="progress-bar" :style="{ width: percent(rsvp.score.total) }"></div>
            </div>
          </td>
          <td class="small">
            <div>Member: {{ rsvp.score.parts.member === 1 ? 'yes' : 'no' }}</div>
            <div>Interest match: {{ percent(rsvp.score.parts.interest) }}</div>
            <div>Show-up rate: {{ percent(rsvp.score.parts.showUp) }}</div>
          </td>
          <td>
            <div class="form-check form-switch">
              <input
                class="form-check-input"
                type="checkbox"
                role="switch"
                :id="'wl-member-' + rsvp.id"
                :checked="rsvp.isMember"
                :disabled="busyId === rsvp.id"
                @change="emit('toggle-member', rsvp.userId, $event.target.checked)"
              />
              <label class="form-check-label small" :for="'wl-member-' + rsvp.id">
                {{ rsvp.isMember ? 'Member' : 'No' }}
              </label>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
