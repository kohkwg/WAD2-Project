<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import RsvpTable from '../components/RsvpTable.vue'
import WaitlistTable from '../components/WaitlistTable.vue'
import RsvpStatusBadge from '../components/RsvpStatusBadge.vue'
import {
  getEvent,
  getRsvpsForEvent,
  approveRsvp,
  rejectRsvp,
  removeRsvp,
  setMember,
  expireOffersNow,
  CLOSED_STATUSES,
} from '../utils/api.js'
import { formatEventTime, formatShortDateTime, fillColour } from '../utils/helpers.js'

const route = useRoute()
const eventId = route.params.id // e.g. "e1" from /organiser/events/e1/rsvps

const event = ref(null)
const rsvps = ref([])
const loading = ref(true)
const errorMessage = ref('')
const statusMessage = ref('')
const busyId = ref(null)
const activeTab = ref('confirmed')

// `now` ticks every 30 seconds so offer countdowns stay current
const now = ref(Date.now())
let timer = null

async function loadData() {
  event.value = await getEvent(eventId)
  rsvps.value = await getRsvpsForEvent(eventId)
}

onMounted(async () => {
  try {
    await loadData()
    if (event.value.requiresApproval) activeTab.value = 'pending'
  } catch (error) {
    errorMessage.value = 'Could not load this event: ' + error.message
  } finally {
    loading.value = false
  }
  timer = setInterval(() => {
    now.value = Date.now()
  }, 30000)
})

onUnmounted(() => {
  clearInterval(timer) // stop the timer when we leave the page
})

// Only hides the page. The real protection is in the database: with Supabase, RLS and the
// SQL functions refuse other people's events even if someone skips this check.
const isMyEvent = computed(() => event.value && event.value.isMine)

// ---------- Split RSVPs into the tabs ----------

const pending = computed(() => rsvps.value.filter((r) => r.status === 'pending'))
const confirmed = computed(() => rsvps.value.filter((r) => r.status === 'confirmed'))
const offers = computed(() => rsvps.value.filter((r) => r.status === 'offered'))
const waitlist = computed(() =>
  rsvps.value.filter((r) => r.status === 'waitlisted').sort((a, b) => a.rank - b.rank),
)
const closed = computed(() => rsvps.value.filter((r) => CLOSED_STATUSES.includes(r.status)))

const tabs = computed(() => [
  { key: 'pending', label: 'Pending approval', count: pending.value.length },
  { key: 'confirmed', label: 'Confirmed', count: confirmed.value.length },
  {
    key: 'waitlist',
    label: 'Waitlist & offers',
    count: waitlist.value.length + offers.value.length,
  },
  { key: 'closed', label: 'Removed / cancelled', count: closed.value.length },
])

const spotsTaken = computed(() => event.value.confirmedCount + event.value.offeredCount)
const fillPercent = computed(() => Math.round((spotsTaken.value / event.value.capacity) * 100))

// ---------- Actions ----------
// Each one: save → reload the list → THEN show the message, so the message and the list agree.

async function approve(rsvpId) {
  busyId.value = rsvpId
  errorMessage.value = ''
  statusMessage.value = ''
  try {
    const updated = await approveRsvp(rsvpId)
    await loadData()
    statusMessage.value =
      updated.status === 'confirmed'
        ? 'Approved. They are confirmed.'
        : 'Approved, but the event is full, so they joined the waitlist.'
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    busyId.value = null
  }
}

async function reject(rsvpId) {
  busyId.value = rsvpId
  errorMessage.value = ''
  statusMessage.value = ''
  try {
    await rejectRsvp(rsvpId)
    await loadData()
    statusMessage.value = 'RSVP rejected.'
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    busyId.value = null
  }
}

// Take someone off after accepting them. If anyone is waiting, the spot is offered to them.
async function remove(rsvpId) {
  busyId.value = rsvpId
  errorMessage.value = ''
  statusMessage.value = ''
  try {
    const hadWaitlist = waitlist.value.length > 0 // check BEFORE reloading
    await removeRsvp(rsvpId)
    await loadData()
    statusMessage.value = hadWaitlist
      ? 'Removed. Their spot was offered to the next person on the waitlist.'
      : 'Removed. Their spot is open again.'
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    busyId.value = null
  }
}

async function toggleMember(userId, makeMember) {
  errorMessage.value = ''
  statusMessage.value = ''
  try {
    await setMember(event.value.organiserId, userId, makeMember)
    await loadData()
    statusMessage.value = makeMember
      ? 'Marked as a member. The waitlist order has been updated.'
      : 'No longer marked as a member. The waitlist order has been updated.'
  } catch (error) {
    errorMessage.value = error.message
  }
}

// DEMO ONLY: skip ahead 24 hours so the class can see expiry + promotion happen
async function demoExpireOffers() {
  errorMessage.value = ''
  statusMessage.value = ''
  try {
    await expireOffersNow(eventId)
    await loadData()
    statusMessage.value = 'Offers expired. Spots were offered to the next people on the waitlist.'
  } catch (error) {
    errorMessage.value = error.message
  }
}
</script>

<template>
  <RouterLink to="/organiser/events" class="small">&larr; My events</RouterLink>

  <!-- Only ONE of these shows: loading → event not found → not your event → the dashboard -->
  <div v-if="loading" class="text-center my-5">
    <div class="spinner-border text-primary" role="status"></div>
  </div>

  <div v-else-if="!event" class="alert alert-danger mt-3">{{ errorMessage }}</div>

  <div v-else-if="!isMyEvent" class="alert alert-warning mt-3">
    You can only manage RSVPs for events you organise.
  </div>

  <template v-else>
    <h1 class="h3 mt-2 mb-1">{{ event.title }}</h1>
    <p class="text-secondary">{{ formatEventTime(event) }} · {{ event.venue.name }}</p>

    <!-- Summary numbers -->
    <div class="row g-3 mb-3">
      <div class="col-6 col-md-3">
        <div class="card card-body text-center">
          <div class="fs-4 fw-bold">{{ event.confirmedCount }} / {{ event.capacity }}</div>
          <div class="small text-secondary">Confirmed</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card card-body text-center">
          <div class="fs-4 fw-bold">{{ event.offeredCount }}</div>
          <div class="small text-secondary">Offers out</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card card-body text-center">
          <div class="fs-4 fw-bold">{{ event.pendingCount }}</div>
          <div class="small text-secondary">Awaiting approval</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card card-body text-center">
          <div class="fs-4 fw-bold">{{ event.waitlistCount }}</div>
          <div class="small text-secondary">On waitlist</div>
        </div>
      </div>
    </div>

    <!-- Bar width = % of spots taken; :title shows the number on hover -->
    <div class="progress mb-4" style="height: 10px" :title="fillPercent + '% of spots taken'">
      <div
        class="progress-bar"
        :class="fillColour(fillPercent)"
        :style="{ width: fillPercent + '%' }"
      ></div>
    </div>

    <!-- Success message; the × button clears it -->
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

    <!-- Tabs: Vue decides which one is showing (activeTab), so no Bootstrap JS needed -->
    <ul class="nav nav-tabs">
      <li class="nav-item" v-for="tab in tabs" :key="tab.key">
        <button
          type="button"
          class="nav-link"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
          <span class="badge rounded-pill text-bg-secondary ms-1">{{ tab.count }}</span>
        </button>
      </li>
    </ul>

    <div class="bg-body border border-top-0 rounded-bottom p-3">
      <!-- Tab content: only the block matching activeTab renders (pending → confirmed → waitlist → else = closed) -->
      <template v-if="activeTab === 'pending'">
        <!-- Note for auto-confirm events, since nothing will ever be pending -->
        <p v-if="!event.requiresApproval" class="small text-secondary">
          This event confirms RSVPs automatically, so nothing waits here.
        </p>
        <!-- Same RsvpTable as the Confirmed tab, but with Approve/Reject buttons -->
        <RsvpTable
          :rsvps="pending"
          :questions="event.questions"
          :show-actions="true"
          :busy-id="busyId"
          empty-text="No RSVPs waiting for approval."
          @approve="approve"
          @reject="reject"
          @toggle-member="toggleMember"
        />
      </template>

      <!-- Same RsvpTable, but with a Remove button instead of Approve/Reject -->
      <RsvpTable
        v-else-if="activeTab === 'confirmed'"
        :rsvps="confirmed"
        :questions="event.questions"
        :show-actions="false"
        :show-remove="true"
        :busy-id="busyId"
        empty-text="Nobody is confirmed yet."
        @remove="remove"
        @toggle-member="toggleMember"
      />

      <template v-else-if="activeTab === 'waitlist'">
        <WaitlistTable
          :offers="offers"
          :waitlist="waitlist"
          :now="now"
          :busy-id="busyId"
          @toggle-member="toggleMember"
        />
        <!-- Demo button only shows when there are open offers to expire -->
        <div v-if="offers.length > 0" class="border-top pt-3 mt-2">
          <button type="button" class="btn btn-outline-secondary btn-sm" @click="demoExpireOffers">
            Demo: pretend 24 hours have passed
          </button>
          <span class="small text-secondary ms-2"
            >Expires the open offers so you can see promotion happen.</span
          >
        </div>
      </template>

      <!-- v-else = the last tab: cancelled / rejected / declined / expired RSVPs (read-only) -->
      <template v-else>
        <p v-if="closed.length === 0" class="text-secondary my-4">Nothing here yet.</p>
        <div v-else class="table-responsive">
          <table class="table align-middle">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Status</th>
                <th scope="col">RSVP'd</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="rsvp in closed" :key="rsvp.id">
                <td>{{ rsvp.user.name }}</td>
                <td><RsvpStatusBadge :status="rsvp.status" /></td>
                <td class="small text-secondary">{{ formatShortDateTime(rsvp.createdAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </template>
</template>
