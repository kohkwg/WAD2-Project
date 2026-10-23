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
const fillPercent = computed(() => event.value?.capacity ? Math.min(100, Math.round((spotsTaken.value / event.value.capacity) * 100)) : 0)
const capacityParts = computed(() => {
  const capacity = Math.max(0, Number(event.value?.capacity) || 0)
  const confirmed = Math.min(capacity, Math.max(0, Number(event.value?.confirmedCount) || 0))
  const offered = Math.min(capacity - confirmed, Math.max(0, Number(event.value?.offeredCount) || 0))
  const available = capacity - confirmed - offered
  return {
    confirmed: capacity ? confirmed / capacity * 100 : 0,
    offered: capacity ? offered / capacity * 100 : 0,
    available: capacity ? available / capacity * 100 : 0,
    availableCount: available,
  }
})

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
  <div class="d-flex justify-content-between flex-wrap gap-2"><RouterLink to="/organiser/events" class="rsvp-back">&larr; My events</RouterLink><RouterLink class="btn btn-outline-secondary" :to="`/organiser/events/${eventId}/manage`">Event tools</RouterLink></div>

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
    <header class="rsvp-heading mt-2 mb-4"><div><p class="rsvp-kicker mb-1">Guest list</p><h1 class="mb-1">{{ event.title }}</h1>
    <p class="rsvp-event-meta mb-0"><span>{{ formatEventTime(event) }}</span><span>{{ event.venue.name }}</span></p></div><span class="guestlist-stamp" aria-hidden="true">✳</span></header>

    <section class="guest-summary mb-4" aria-label="RSVP status summary">
      <div class="capacity-overview">
        <div class="capacity-title"><div><h2>Places</h2><p>{{ spotsTaken }} of {{ event.capacity }} taken or offered</p></div><strong>{{ fillPercent }}<span>%</span></strong></div>
        <div class="capacity-track" role="img" :aria-label="`Capacity: ${event.confirmedCount} confirmed, ${event.offeredCount} offers out, ${capacityParts.availableCount} available of ${event.capacity}`">
          <span class="capacity-segment capacity-segment--confirmed" :style="{ transform: `scaleX(${capacityParts.confirmed / 100})` }"></span>
          <span class="capacity-segment capacity-segment--offered" :style="{ transform: `scaleX(${(capacityParts.confirmed + capacityParts.offered) / 100})` }"></span>
          <span class="capacity-segment capacity-segment--available" :style="{ transform: `scaleX(${(capacityParts.confirmed + capacityParts.offered + capacityParts.available) / 100})` }"></span>
        </div>
        <ul class="capacity-legend" aria-label="Capacity breakdown">
          <li><i class="legend-dot legend-dot--confirmed" aria-hidden="true"></i><span>Confirmed</span><strong>{{ event.confirmedCount }}</strong></li>
          <li><i class="legend-dot legend-dot--offered" aria-hidden="true"></i><span>Offers out</span><strong>{{ event.offeredCount }}</strong></li>
          <li><i class="legend-dot legend-dot--available" aria-hidden="true"></i><span>Available</span><strong>{{ capacityParts.availableCount }}</strong></li>
        </ul>
      </div>
      <div class="status-chips" aria-label="Other RSVP statuses">
        <div class="status-chip status-chip--pending"><span>Awaiting approval</span><strong>{{ event.pendingCount }}</strong></div>
        <div class="status-chip status-chip--waitlist"><span>On waitlist</span><strong>{{ event.waitlistCount }}</strong></div>
        <div class="status-chip status-chip--closed"><span>Rejected or cancelled</span><strong>{{ closed.length }}</strong></div>
      </div>
    </section>

    <div
      v-if="statusMessage"
      class="alert alert-success d-flex justify-content-between align-items-center"
      role="status"
      aria-live="polite"
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
    <div class="nav nav-tabs status-tabs" role="group" aria-label="Filter RSVPs by status">
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

    <div class="rsvp-list-panel">
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
          <button type="button" class="btn event-cta event-cta--secondary btn-sm" :disabled="busyId !== null" @click="demoExpireOffers">
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

<style scoped>
.rsvp-back { display: inline-flex; align-items: center; min-height: 40px; color: var(--bookedz-ink); font-weight: 650; text-decoration-color: var(--bookedz-border); text-underline-offset: 4px; }
.rsvp-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1.35rem clamp(1rem, 3vw, 1.8rem); border: 1px solid var(--bookedz-border); border-left: 5px solid var(--bookedz-primary); border-radius: 20px; background: var(--bookedz-surface); box-shadow: var(--bookedz-card-shadow); }
.rsvp-heading h1 { color: var(--bookedz-ink); font-size: clamp(1.55rem, 3vw, 2.25rem); font-weight: 700; letter-spacing: -.04em; overflow-wrap: anywhere; }
.rsvp-kicker { color: var(--bookedz-primary-dark); font-weight: 700; font-size: .85rem; }
.rsvp-event-meta { display: flex; flex-wrap: wrap; gap: .3rem .75rem; color: var(--bookedz-muted); font-size: .9rem; }
.rsvp-event-meta span + span::before { content: '·'; margin-right: .75rem; }
.guestlist-stamp { display: grid; flex: 0 0 48px; place-items: center; width: 48px; height: 48px; border-radius: 16px; color: var(--bookedz-ink); background: var(--bookedz-yellow); font-size: 1.5rem; }
.guest-summary { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(230px, .8fr); gap: 1rem; }
.capacity-overview,.status-chips { min-width: 0; padding: 1.1rem 1.25rem; border: 1px solid var(--bookedz-border); border-radius: 18px; background: var(--bookedz-surface); box-shadow: var(--bookedz-card-shadow); }
.capacity-title { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.capacity-title h2 { margin: 0; font-size: 1.1rem; font-weight: 700; }
.capacity-title p { margin: .1rem 0 0; color: var(--bookedz-muted); font-size: .84rem; }
.capacity-title > strong { flex: 0 0 auto; color: var(--bookedz-primary-dark); font: 700 2rem/1 var(--bookedz-heading); letter-spacing: -.05em; }
.capacity-title > strong span { font-size: 1rem; }
.capacity-track { position: relative; display: block; width: 100%; height: 13px; overflow: hidden; margin: 1rem 0 .9rem; border: 1px solid var(--bookedz-border); border-radius: 99px; background: var(--bookedz-hover); }
.capacity-segment { position: absolute; inset: 0; display: block; width: 100%; height: 100%; transform-origin: left; transition: transform 320ms cubic-bezier(.2,.8,.2,1); }
.capacity-segment--confirmed { z-index: 3; background: var(--bookedz-primary-dark); }
.capacity-segment--offered { z-index: 2; background: var(--bookedz-yellow); }
.capacity-segment--available { background: var(--bookedz-mint); }
.capacity-legend { display: flex; flex-wrap: wrap; gap: .45rem 1rem; padding: 0; margin: 0; list-style: none; }
.capacity-legend li { display: inline-flex; align-items: center; gap: .4rem; color: var(--bookedz-muted); font-size: .78rem; }
.capacity-legend strong { color: var(--bookedz-ink); font-variant-numeric: tabular-nums; }
.legend-dot { width: 9px; height: 9px; border-radius: 50%; }
.legend-dot--confirmed { background: var(--bookedz-primary-dark); }
.legend-dot--offered { background: var(--bookedz-yellow); }
.legend-dot--available { background: var(--bookedz-mint); border: 1px solid var(--bookedz-muted-border); }
.status-chips { display: grid; grid-template-columns: 1fr; align-content: center; gap: .6rem; }
.status-chip { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .65rem .8rem; border: 1px solid var(--bookedz-border); border-radius: 12px; color: var(--bookedz-muted); font-size: .84rem; }
.status-chip strong { color: var(--bookedz-ink); font-size: 1.15rem; font-variant-numeric: tabular-nums; }
.status-chip--pending { background: color-mix(in srgb, var(--bookedz-yellow) 20%, var(--bookedz-surface)); }
.status-chip--waitlist { background: color-mix(in srgb, var(--bookedz-mint) 24%, var(--bookedz-surface)); }
.status-chip--closed { background: var(--bookedz-glass-solid); }
.status-tabs { display: flex; flex-wrap: wrap; gap: .35rem; padding: .45rem; border: 1px solid var(--bookedz-border); border-radius: 16px 16px 0 0; background: var(--bookedz-glass-solid); }
:deep(.status-tabs .nav-link) { display: inline-flex; align-items: center; justify-content: center; gap: .35rem; min-height: 42px; border: 1px solid transparent; border-radius: 11px; color: var(--bookedz-muted); font-weight: 650; white-space: nowrap; }
:deep(.status-tabs .nav-link.active) { color: var(--bookedz-primary-dark); border-color: var(--bookedz-border); background: var(--bookedz-surface); box-shadow: var(--bookedz-tab-shadow); }
:deep(.status-tabs .badge) { color: var(--bookedz-ink); background: var(--bookedz-hover) !important; }
.rsvp-list-panel { min-height: 120px; padding: clamp(.8rem, 2vw, 1.3rem); border: 1px solid var(--bookedz-border); border-top: 0; border-radius: 0 0 16px 16px; background: var(--bookedz-surface); }
:deep(.table) { --bs-table-bg: transparent; --bs-table-striped-bg: var(--bookedz-glass-solid); }
:deep(.table thead th) { color: var(--bookedz-muted); font-size: .82rem; font-weight: 700; white-space: nowrap; }
:deep(.table td) { vertical-align: middle; }
:deep(.table-responsive) { border-radius: 12px; }
:deep(.alert) { border-color: var(--bookedz-border); }
@media (max-width: 767.98px) { .guest-summary { grid-template-columns: minmax(0, 1fr); } .status-chips { grid-template-columns: repeat(2,minmax(0,1fr)); } .status-tabs { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); } :deep(.status-tabs .nav-link) { min-width: 0; white-space: normal; } }
@media (max-width: 575.98px) { .rsvp-heading { align-items: flex-start; padding: 1.1rem 1rem; } .guestlist-stamp { flex-basis: 40px; width: 40px; height: 40px; border-radius: 13px; } .status-chips { grid-template-columns: 1fr; } .capacity-overview { padding: 1rem; } .capacity-legend { gap: .4rem .7rem; } .rsvp-event-meta { display: grid; gap: .15rem; } .rsvp-event-meta span + span::before { content: none; } }
@media (prefers-reduced-motion: reduce) { .capacity-segment { transition: none; } }
</style>
