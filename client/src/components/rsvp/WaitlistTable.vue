<script setup>
import { formatTimeLeft } from '../../utils/helpers.js'
import { WEIGHTS } from '../../utils/waitlistScore.js'

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
  <h2 class="h6 mt-3">Offers waiting for a reply</h2>
  <p v-if="offers.length === 0" class="text-secondary small">No open offers.</p>
  <ul v-else class="list-group mb-4">
    <li
      v-for="rsvp in offers"
      :key="rsvp.id"
      class="list-group-item offer-item d-flex justify-content-between align-items-center"
    >
      <div>
        <div class="fw-semibold">{{ rsvp.user.name }}</div>
        <div class="small text-secondary">{{ rsvp.user.email }}</div>
      </div>
      <!-- Styled by .offer-item .badge (theme tokens); text-bg-info forced black text in dark mode -->
      <span class="badge">
        Expires in {{ formatTimeLeft(rsvp.offerExpiresAt, now) }}
      </span>
    </li>
  </ul>

  <!-- The ranked waitlist -->
  <h2 class="h6">Waitlist (highest score gets the next spot)</h2>
  <p class="small text-secondary mb-2">
    Score = {{ WEIGHTS.member }} × member + {{ WEIGHTS.interest }} × interest match +
    {{ WEIGHTS.showUp }} × show-up rate. Recent events count more; late cancellations lower the
    show-up rate.
  </p>

  <p v-if="waitlist.length === 0" class="text-secondary my-3">Nobody is waiting.</p>

  <div v-else class="table-responsive">
    <table class="table align-middle">
      <thead class="table-light">
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
          <td data-label="Rank" class="fw-bold">{{ rsvp.rank }}</td>
          <td data-label="Name">
            <div class="fw-semibold">{{ rsvp.user.name }}</div>
            <div class="small text-secondary">{{ rsvp.user.email }}</div>
          </td>
          <td data-label="Score">
            <div class="small fw-semibold">{{ rsvp.score.total.toFixed(2) }}</div>
            <div class="progress" style="height: 6px">
              <div class="progress-bar" aria-hidden="true" :style="{ width: percent(rsvp.score.total) }"></div>
            </div>
          </td>
          <td data-label="Why" class="small">
            <div>Member: {{ rsvp.score.parts.member === 1 ? 'yes' : 'no' }}</div>
            <div>Interest match: {{ percent(rsvp.score.parts.interest) }}</div>
            <div>Show-up rate: {{ percent(rsvp.score.parts.showUp) }}</div>
          </td>
          <td data-label="Member">
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

<style scoped>
h2 { color: var(--bookedz-ink); font-weight: 700; letter-spacing: -.025em; }
.list-group-item { padding: .9rem 1rem; border-color: var(--bookedz-border); background: var(--bookedz-surface); }
.offer-item { gap: .8rem; }
.offer-item > div { min-width: 0; }
.offer-item .badge { flex: 0 0 auto; max-width: 100%; padding: .5rem .7rem; color: var(--bookedz-ink); background: var(--bookedz-yellow) !important; white-space: normal; text-align: center; }
.table { --bs-table-bg: transparent; --bs-table-striped-bg: var(--bookedz-glass-solid); margin-bottom: 0; }
.table thead th { color: var(--bookedz-muted); font-size: .82rem; font-weight: 700; white-space: nowrap; }
.table-responsive { border: 1px solid var(--bookedz-border); border-radius: 12px; }
.progress { min-width: 4rem; border-radius: 99px; background: var(--bookedz-hover); }
.progress-bar { background: var(--bookedz-primary-dark); }
@media (max-width: 767.98px) {
  .offer-item { align-items: flex-start !important; flex-direction: column; }
  .offer-item .badge { align-self: flex-start; }
  .table-responsive { overflow: visible; border: 0; border-radius: 0; }
  .table,.table tbody { display: block; width: 100%; }
  .table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; clip-path: inset(50%); }
  .table tbody { display: grid; gap: .75rem; }
  .table tr { display: grid; gap: 0; padding: .6rem .85rem; border: 1px solid var(--bookedz-border); border-radius: 15px; background: var(--bookedz-surface); box-shadow: var(--bookedz-card-shadow); }
  .table td { display: grid; grid-template-columns: minmax(76px, 28%) minmax(0,1fr); align-items: center; gap: .6rem; padding: .55rem 0; border-bottom: 1px solid var(--bookedz-border); white-space: normal; }
  .table td:last-child { border-bottom: 0; }
  .table td::before { content: attr(data-label); color: var(--bookedz-muted); font-size: .74rem; font-weight: 700; }
  .table td[data-label="Rank"] { grid-template-columns: 1fr; display: block; padding: .2rem 0 .5rem; border: 0; color: var(--bookedz-primary-dark); }
  .table td[data-label="Rank"]::before { content: 'Waitlist position'; display: block; color: var(--bookedz-muted); }
  .table td[data-label="Name"] { display: block; padding-top: .2rem; }
  .table td[data-label="Name"]::before { content: none; }
  .table td[data-label="Name"] .fw-semibold { color: var(--bookedz-ink); font-size: 1rem; }
  .table td[data-label="Name"] .small { overflow-wrap: anywhere; }
  .table td[data-label="Score"] .progress { max-width: 10rem; }
}
</style>
