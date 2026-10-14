<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import OfferBanner from '../components/OfferBanner.vue'
import RsvpStatusBadge from '../components/RsvpStatusBadge.vue'
import {
  getMyRsvps,
  cancelRsvp,
  respondToOffer,
  CURRENT_USER_ID,
  CLOSED_STATUSES,
} from '../utils/api.js'
import { formatEventTime } from '../utils/helpers.js'

const rsvps = ref([])
const loading = ref(true)
const errorMessage = ref('')
const statusMessage = ref('')
const busyId = ref(null) // which RSVP is being saved
const confirmCancelId = ref(null) // which RSVP is showing "Are you sure?"
const showClosed = ref(false)

// `now` ticks every 30 seconds so the offer countdown moves
const now = ref(Date.now())
let timer = null

async function loadRsvps() {
  rsvps.value = await getMyRsvps(CURRENT_USER_ID)
}

onMounted(async () => {
  try {
    await loadRsvps()
  } catch (error) {
    errorMessage.value = 'Could not load your RSVPs: ' + error.message
  } finally {
    loading.value = false
  }
  timer = setInterval(() => {
    now.value = Date.now()
  }, 30000)
})

onUnmounted(() => {
  clearInterval(timer)
})

const offers = computed(() => rsvps.value.filter((r) => r.status === 'offered'))
const activeRsvps = computed(() =>
  rsvps.value.filter((r) => ['confirmed', 'pending', 'waitlisted'].includes(r.status)),
)
const closedRsvps = computed(() => rsvps.value.filter((r) => CLOSED_STATUSES.includes(r.status)))

async function answerOffer(rsvpId, accept) {
  busyId.value = rsvpId
  errorMessage.value = ''
  statusMessage.value = ''
  try {
    await respondToOffer(rsvpId, accept)
    await loadRsvps() // reload first, then show the message, so both agree
    statusMessage.value = accept
      ? 'Spot confirmed. See you there!'
      : 'Offer declined. The spot goes to the next person on the waitlist.'
  } catch (error) {
    errorMessage.value = error.message
    await loadRsvps()
  } finally {
    busyId.value = null
  }
}

function confirmOffer(rsvpId) {
  answerOffer(rsvpId, true)
}

function declineOffer(rsvpId) {
  answerOffer(rsvpId, false)
}

async function cancel(rsvpId) {
  busyId.value = rsvpId
  errorMessage.value = ''
  statusMessage.value = ''
  try {
    await cancelRsvp(rsvpId)
    await loadRsvps()
    confirmCancelId.value = null
    statusMessage.value = 'RSVP cancelled.'
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <h1 class="h3 mb-3">My RSVPs</h1>

  <div v-if="loading" class="text-center my-5">
    <div class="spinner-border text-primary" role="status"></div>
  </div>

  <template v-else>
    <div
      v-if="statusMessage"
      class="alert alert-success d-flex justify-content-between align-items-center"
    >
      <span>{{ statusMessage }}</span>
      <button
        type="button"
        class="btn-close"
        aria-label="Close"
        @click="statusMessage = ''"
      ></button>
    </div>
    <div v-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>

    <!-- 24-hour offers go on top so they're not missed -->
    <OfferBanner
      v-for="rsvp in offers"
      :key="rsvp.id"
      :rsvp="rsvp"
      :now="now"
      :busy="busyId === rsvp.id"
      @confirm="confirmOffer"
      @decline="declineOffer"
    />

    <div v-if="activeRsvps.length === 0 && offers.length === 0" class="card card-body text-center">
      <p class="text-secondary mb-2">You haven't RSVP'd to anything yet.</p>
      <RouterLink to="/events" class="btn btn-primary align-self-center">Find events</RouterLink>
    </div>

    <div v-for="rsvp in activeRsvps" :key="rsvp.id" class="card shadow-sm mb-3">
      <div class="card-body d-flex flex-column flex-md-row justify-content-between gap-3">
        <div>
          <h2 class="h5 mb-1">{{ rsvp.event.title }}</h2>
          <p class="small text-secondary mb-2">
            {{ formatEventTime(rsvp.event) }} · {{ rsvp.event.venue.name }}
          </p>
          <RsvpStatusBadge :status="rsvp.status" />
          <p v-if="rsvp.status === 'waitlisted'" class="small mb-0 mt-2">
            If a spot opens up, you'll see a banner here and have 24 hours to confirm.
          </p>
          <p v-if="rsvp.status === 'pending'" class="small mb-0 mt-2">
            The organiser hasn't reviewed your RSVP yet.
          </p>
        </div>

        <!-- Cancel with a second "are you sure?" step instead of a browser pop-up -->
        <div class="text-md-end flex-shrink-0">
          <template v-if="confirmCancelId === rsvp.id">
            <p class="small mb-2">Cancel this RSVP?</p>
            <button
              type="button"
              class="btn btn-danger btn-sm me-2"
              :disabled="busyId === rsvp.id"
              @click="cancel(rsvp.id)"
            >
              <span v-if="busyId === rsvp.id" class="spinner-border spinner-border-sm me-1"></span>
              Yes, cancel
            </button>
            <button
              type="button"
              class="btn btn-outline-secondary btn-sm"
              @click="confirmCancelId = null"
            >
              Keep it
            </button>
          </template>
          <button
            v-else
            type="button"
            class="btn btn-outline-danger btn-sm"
            @click="confirmCancelId = rsvp.id"
          >
            Cancel RSVP
          </button>
        </div>
      </div>
    </div>

    <!-- Older / closed RSVPs hidden until asked for -->
    <div v-if="closedRsvps.length > 0" class="mt-4">
      <button type="button" class="btn btn-link p-0" @click="showClosed = !showClosed">
        {{ showClosed ? 'Hide' : 'Show' }} cancelled and closed RSVPs ({{ closedRsvps.length }})
      </button>
      <ul v-if="showClosed" class="list-group mt-2">
        <li
          v-for="rsvp in closedRsvps"
          :key="rsvp.id"
          class="list-group-item d-flex justify-content-between align-items-center"
        >
          <span>{{ rsvp.event.title }}</span>
          <RsvpStatusBadge :status="rsvp.status" />
        </li>
      </ul>
    </div>
  </template>
</template>
