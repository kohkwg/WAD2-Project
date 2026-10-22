<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
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
  USING_SUPABASE,
  CURRENT_ORGANISER_ID,
  CLOSED_STATUSES,
} from '../utils/api.js'
import { formatEventTime, formatShortDateTime } from '../utils/helpers.js'

const route = useRoute()
const eventId = computed(() => String(route.params.id || ''))

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
let mounted = false
let loadRequest = 0
let actionEventId = null
let actionRequest = 0
let routeVersion = 0

async function loadData(id = eventId.value) {
  if (id !== eventId.value) return
  const request = ++loadRequest
  const version = routeVersion
  try {
    const [nextEvent, nextRsvps] = await Promise.all([getEvent(id), getRsvpsForEvent(id)])
    if (mounted && request === loadRequest && version === routeVersion && id === eventId.value) {
      event.value = nextEvent
      rsvps.value = nextRsvps
      if (nextEvent.requiresApproval) activeTab.value = 'pending'
      loading.value = false
      return true
    }
    return false
  } catch (error) {
    if (mounted && request === loadRequest && version === routeVersion && id === eventId.value) {
      errorMessage.value = 'Could not load this event: ' + error.message
      loading.value = false
    }
    return false
  }
}

watch(eventId, (id) => {
  routeVersion++
  loadRequest++
  loading.value = true
  event.value = null
  rsvps.value = []
  errorMessage.value = ''
  statusMessage.value = ''
  busyId.value = null
  actionEventId = null
  actionRequest++
  activeTab.value = 'confirmed'
  loadData(id)
})

onMounted(() => {
  mounted = true
  loadData()
  timer = setInterval(() => {
    now.value = Date.now()
  }, 30000)
})

onUnmounted(() => {
  mounted = false
  loadRequest++
  clearInterval(timer) // stop the timer when we leave the page
})

// TODO (Timothy - row-level security): the database should also block other organisers
const isMyEvent = computed(() => event.value && (event.value.isMine || event.value.organiserId === CURRENT_ORGANISER_ID))

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
  { key: 'closed', label: 'Rejected / cancelled', count: closed.value.length },
])

const spotsTaken = computed(() => event.value ? event.value.confirmedCount + event.value.offeredCount : 0)
const fillPercent = computed(() => event.value?.capacity ? Math.round((spotsTaken.value / event.value.capacity) * 100) : 0)

function isCurrentEvent(id, version = routeVersion) {
  return mounted && id === eventId.value && routeVersion === version
}

// ---------- Actions ----------
// Each one: save → reload the list → THEN show the message, so the message and the list agree.

async function approve(rsvpId) {
  if (busyId.value) return
  const id = eventId.value
  const version = routeVersion
  const action = ++actionRequest
  busyId.value = rsvpId
  actionEventId = id
  errorMessage.value = ''
  statusMessage.value = ''
  try {
    const updated = await approveRsvp(rsvpId)
    if (!isCurrentEvent(id, version)) return
    if (!(await loadData(id)) || !isCurrentEvent(id, version)) return
    statusMessage.value =
      updated.status === 'confirmed'
        ? 'Approved. They are confirmed.'
        : 'Approved, but the event is full, so they joined the waitlist.'
  } catch (error) {
    if (isCurrentEvent(id, version)) errorMessage.value = error.message
  } finally {
    if (actionRequest === action && actionEventId === id && routeVersion === version) {
      busyId.value = null
      actionEventId = null
    }
  }
}

async function reject(rsvpId) {
  if (busyId.value) return
  const id = eventId.value
  const version = routeVersion
  const action = ++actionRequest
  busyId.value = rsvpId
  actionEventId = id
  errorMessage.value = ''
  statusMessage.value = ''
  try {
    await rejectRsvp(rsvpId)
    if (!isCurrentEvent(id, version)) return
    if (!(await loadData(id)) || !isCurrentEvent(id, version)) return
    statusMessage.value = 'RSVP rejected.'
  } catch (error) {
    if (isCurrentEvent(id, version)) errorMessage.value = error.message
  } finally {
    if (actionRequest === action && actionEventId === id && routeVersion === version) {
      busyId.value = null
      actionEventId = null
    }
  }
}

async function remove(rsvpId) {
  if (busyId.value) return
  const id = eventId.value
  const version = routeVersion
  const action = ++actionRequest
  busyId.value = rsvpId
  actionEventId = id
  errorMessage.value = ''
  statusMessage.value = ''
  try {
    await removeRsvp(rsvpId)
    if (!isCurrentEvent(id, version)) return
    if (!(await loadData(id)) || !isCurrentEvent(id, version)) return
    statusMessage.value = 'Attendee removed. The next person on the waitlist has been offered the spot.'
  } catch (error) {
    if (isCurrentEvent(id, version)) errorMessage.value = error.message
  } finally {
    if (actionRequest === action && actionEventId === id && routeVersion === version) {
      busyId.value = null
      actionEventId = null
    }
  }
}

async function toggleMember(userId, makeMember) {
  if (busyId.value || !event.value) return
  const id = eventId.value
  const version = routeVersion
  const action = ++actionRequest
  busyId.value = `member:${userId}`
  actionEventId = id
  errorMessage.value = ''
  statusMessage.value = ''
  try {
    await setMember(event.value.organiserId, userId, makeMember)
    if (!isCurrentEvent(id, version)) return
    if (!(await loadData(id)) || !isCurrentEvent(id, version)) return
    statusMessage.value = makeMember
      ? 'Marked as a member. The waitlist order has been updated.'
      : 'No longer marked as a member. The waitlist order has been updated.'
  } catch (error) {
    if (isCurrentEvent(id, version)) errorMessage.value = error.message
  } finally {
    if (actionRequest === action && actionEventId === id && routeVersion === version) {
      busyId.value = null
      actionEventId = null
    }
  }
}

// DEMO ONLY: skip ahead 24 hours so the class can see expiry + promotion happen
async function demoExpireOffers() {
  if (busyId.value) return
  const id = eventId.value
  const version = routeVersion
  const action = ++actionRequest
  busyId.value = 'expiry'
  actionEventId = id
  errorMessage.value = ''
  statusMessage.value = ''
  try {
    await expireOffersNow(id)
    if (!isCurrentEvent(id, version)) return
    if (!(await loadData(id)) || !isCurrentEvent(id, version)) return
    statusMessage.value = 'Offers expired. Spots were offered to the next people on the waitlist.'
  } catch (error) {
    if (isCurrentEvent(id, version)) errorMessage.value = error.message
  } finally {
    if (actionRequest === action && actionEventId === id && routeVersion === version) {
      busyId.value = null
      actionEventId = null
    }
  }
}
</script>

<template>
  <RouterLink to="/organiser/events" class="small">&larr; My events</RouterLink>

  <div v-if="loading" class="text-center my-5">
    <div class="spinner-border text-primary" role="status">
      <span class="visually-hidden">Loading RSVP details…</span>
    </div>
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

    <div class="progress mb-4" style="height: 10px" role="progressbar" :aria-label="'Occupancy: ' + spotsTaken + ' of ' + event.capacity + ' spots'" :aria-valuenow="Math.min(spotsTaken, event.capacity)" :aria-valuemin="0" :aria-valuemax="event.capacity" :title="fillPercent + '% of spots taken'">
      <div class="progress-bar bg-success" :style="{ width: fillPercent + '%' }"></div>
    </div>

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
    <div class="nav nav-tabs" role="group" aria-label="Filter RSVPs by status">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          class="nav-link"
          :class="{ active: activeTab === tab.key }"
          :aria-pressed="activeTab === tab.key"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
          <span class="badge rounded-pill text-bg-secondary ms-1">{{ tab.count }}</span>
        </button>
    </div>

    <div class="bg-white border border-top-0 rounded-bottom p-3">
      <template v-if="activeTab === 'pending'">
        <p v-if="!event.requiresApproval" class="small text-secondary">
          This event confirms RSVPs automatically, so nothing waits here.
        </p>
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
        <div v-if="offers.length > 0 && !USING_SUPABASE" class="border-top pt-3 mt-2">
          <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="busyId !== null" @click="demoExpireOffers">
            Demo: pretend 24 hours have passed
          </button>
          <span class="small text-secondary ms-2"
            >Expires the open offers so you can see promotion happen.</span
          >
        </div>
      </template>

      <template v-else>
        <p v-if="closed.length === 0" class="text-secondary my-4">Nothing here yet.</p>
        <div v-else class="table-responsive">
          <table class="table align-middle">
            <thead class="table-light">
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
