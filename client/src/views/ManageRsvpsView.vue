<script setup>
import '../assets/design-baseline.css'
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import RsvpTable from '../components/rsvp/RsvpTable.vue'
import WaitlistTable from '../components/rsvp/WaitlistTable.vue'
import RsvpStatusBadge from '../components/RsvpStatusBadge.vue'
import { toast } from '../composables/useToast'
import CountUp from '../components/ui/CountUp.vue'
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
const statusAlert = ref(null)
const errorAlert = ref(null)

// A row's buttons are disabled while it saves (which drops keyboard focus) and the row then
// moves to another tab, so focus continues from the message that reports the outcome.
async function focusMessage(target) {
  await nextTick()
  target.value?.focus()
}

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
      if (['pending', 'confirmed', 'waitlist', 'closed'].includes(route.query.status)) activeTab.value = route.query.status
      else if (nextEvent.requiresApproval) activeTab.value = 'pending'
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

watch(() => route.query.status, status => {
  if (['pending', 'confirmed', 'waitlist', 'closed'].includes(status)) activeTab.value = status
})

onMounted(() => {
  mounted = true
  loadData()
  timer = setInterval(() => {
    now.value = Date.now()
  }, 30000)
})

onUnmounted(() => {
  // Leaving the page ends any undo window: those rejections are saved now.
  for (const [rsvpId, handle] of rejectTimers) { clearTimeout(handle); rejectRsvp(rsvpId).catch(() => {}) }
  rejectTimers.clear()
  mounted = false
  loadRequest++
  clearInterval(timer) // stop the timer when we leave the page
})

// TODO (Timothy - row-level security): the database should also block other organisers
const isMyEvent = computed(() => event.value && (event.value.isMine || event.value.canManage || event.value.organiserId === CURRENT_ORGANISER_ID))

// ---------- Split RSVPs into the tabs ----------

// Rejections wait out a short undo window; those rows are hidden meanwhile.
const hiddenIds = ref(new Set())
const pending = computed(() => rsvps.value.filter((r) => r.status === 'pending' && !hiddenIds.value.has(r.id)))
const selectedPending = ref([])
watch(pending, rows => { selectedPending.value = selectedPending.value.filter(id => rows.some(r => r.id === id)) })
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
    focusMessage(statusAlert)
  } catch (error) {
    if (isCurrentEvent(id, version)) {
      errorMessage.value = error.message
      focusMessage(errorAlert)
    }
  } finally {
    if (actionRequest === action && actionEventId === id && routeVersion === version) {
      busyId.value = null
      actionEventId = null
    }
  }
}

// Reject hides the row at once and offers Undo for 5 seconds before saving.
const UNDO_MS = 5000
const rejectTimers = new Map()
function reject(rsvpId) {
  if (busyId.value || rejectTimers.has(rsvpId)) return
  const person = rsvps.value.find(r => r.id === rsvpId)?.user?.name || 'RSVP'
  hiddenIds.value = new Set([...hiddenIds.value, rsvpId])
  rejectTimers.set(rsvpId, setTimeout(() => {
    rejectTimers.delete(rsvpId)
    commitReject(rsvpId)
  }, UNDO_MS))
  toast(`Rejected ${person}`, { duration: UNDO_MS, action: { label: 'Undo', onClick: () => undoReject(rsvpId) } })
}
function undoReject(rsvpId) {
  clearTimeout(rejectTimers.get(rsvpId))
  rejectTimers.delete(rsvpId)
  const next = new Set(hiddenIds.value)
  next.delete(rsvpId)
  hiddenIds.value = next
}

async function commitReject(rsvpId) {
  if (busyId.value) { rejectTimers.set(rsvpId, setTimeout(() => { rejectTimers.delete(rsvpId); commitReject(rsvpId) }, 400)); return }
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
    undoReject(rsvpId)
    if (isCurrentEvent(id, version)) {
      errorMessage.value = error.message
      focusMessage(errorAlert)
    }
  } finally {
    if (actionRequest === action && actionEventId === id && routeVersion === version) {
      busyId.value = null
      actionEventId = null
    }
  }
}

// Approve every chosen pending RSVP, then reload once.
async function approveSelected() {
  if (busyId.value || !selectedPending.value.length) return
  const id = eventId.value
  const version = routeVersion
  const ids = [...selectedPending.value]
  busyId.value = 'bulk'
  errorMessage.value = ''
  statusMessage.value = ''
  let confirmed = 0, waitlisted = 0
  try {
    for (const rsvpId of ids) {
      const updated = await approveRsvp(rsvpId)
      updated.status === 'confirmed' ? confirmed++ : waitlisted++
      if (!isCurrentEvent(id, version)) return
    }
    selectedPending.value = []
    if (!(await loadData(id)) || !isCurrentEvent(id, version)) return
    statusMessage.value = `Approved ${ids.length}: ${confirmed} confirmed` + (waitlisted ? `, ${waitlisted} joined the waitlist because the event is full.` : '.')
    toast(`Approved ${ids.length}`)
    focusMessage(statusAlert)
  } catch (error) {
    if (isCurrentEvent(id, version)) {
      errorMessage.value = error.message
      await loadData(id)
      focusMessage(errorAlert)
    }
  } finally {
    if (isCurrentEvent(id, version)) busyId.value = null
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
    focusMessage(statusAlert)
  } catch (error) {
    if (isCurrentEvent(id, version)) {
      errorMessage.value = error.message
      focusMessage(errorAlert)
    }
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
<div class="design-baseline">
  <div class="d-flex justify-content-between flex-wrap gap-2"><RouterLink to="/organiser/events" class="rsvp-back">&larr; My Events</RouterLink><div class="d-flex flex-wrap gap-2"><RouterLink v-if="isMyEvent && new Date(event.startTime) > new Date()" class="btn btn-outline-secondary" :to="`/organiser/events/${eventId}/manage?tab=edit`">Edit event</RouterLink><RouterLink class="btn btn-outline-secondary" :to="`/organiser/events/${eventId}/manage`">Event tools</RouterLink></div></div>

  <div v-if="loading" class="text-center my-5">
    <div class="spinner-border text-primary" role="status">
      <span class="visually-hidden">Loading RSVP details…</span>
    </div>
  </div>

  <div v-dismissible v-else-if="!event" class="alert alert-danger mt-3">{{ errorMessage }}</div>

  <div v-dismissible v-else-if="!isMyEvent" class="alert alert-warning mt-3">
    You can only manage RSVPs for events you organise.
  </div>

  <template v-else>
    <header class="rsvp-heading mt-2 mb-4"><div><p class="rsvp-kicker mb-1">Guest list</p><h1 class="mb-1">{{ event.title }}</h1>
    <p class="rsvp-event-meta mb-0"><span>{{ formatEventTime(event) }}</span><span>{{ event.venue.name }}</span></p></div><span class="guestlist-stamp" aria-hidden="true">✳</span></header>

    <section class="guest-summary mb-4" aria-label="RSVP status summary">
      <div class="capacity-overview">
        <div class="capacity-title"><div><h2>Spots</h2><p>{{ spotsTaken }} of {{ event.capacity }} taken or offered</p></div><strong><CountUp :value="capacityParts.availableCount" /><span> left</span></strong></div>
        <div class="capacity-track" role="img" :aria-label="`Capacity: ${event.confirmedCount} confirmed, ${event.offeredCount} ${event.offeredCount === 1 ? 'offer' : 'offers'} out, ${capacityParts.availableCount} available of ${event.capacity}`">
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
    </section>

    <div v-dismissible
      v-if="statusMessage"
      ref="statusAlert"
      tabindex="-1"
      class="alert alert-success d-flex justify-content-between align-items-center"
      role="status"
      aria-live="polite"
    >
      <span>{{ statusMessage }}</span>
    </div>
    <div v-dismissible v-if="errorMessage" ref="errorAlert" tabindex="-1" class="alert alert-danger" role="alert">{{ errorMessage }}</div>

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
          <span class="badge rounded-pill tab-count ms-1">{{ tab.count }}</span>
        </button>
    </div>

    <div :key="activeTab" class="rsvp-list-panel reveal-down">
      <template v-if="activeTab === 'pending'">
        <p v-if="!event.requiresApproval" class="small text-secondary">
          This event confirms RSVPs automatically, so nothing waits here.
        </p>
        <div v-if="pending.length > 1" class="bulk-bar reveal-down">
          <span class="small text-secondary">{{ selectedPending.length ? `${selectedPending.length} selected` : 'Select people to approve several at once' }}</span>
          <button type="button" class="btn event-cta btn-sm" :disabled="!selectedPending.length || busyId !== null" @click="approveSelected">
            {{ busyId === 'bulk' ? 'Approving…' : `Approve selected${selectedPending.length ? ` (${selectedPending.length})` : ''}` }}
          </button>
        </div>
        <RsvpTable
          v-model:selected-ids="selectedPending"
          :selectable="pending.length > 1"
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
</div>
</template>

<style scoped>
.rsvp-back { display: inline-flex; align-items: center; min-height: 44px; color: var(--bookedz-ink); font-weight: 650; text-decoration-color: var(--bookedz-border); text-underline-offset: 4px; }
.rsvp-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1.35rem clamp(1rem, 3vw, 1.8rem); border: 1px solid var(--bookedz-border); border-left: 5px solid var(--bookedz-primary); border-radius: 20px; background: var(--bookedz-surface); box-shadow: var(--bookedz-card-shadow); }
.rsvp-heading h1 { color: var(--bookedz-ink); font-size: clamp(1.55rem, 3vw, 2.25rem); font-weight: 700; letter-spacing: -.04em; overflow-wrap: anywhere; }
.rsvp-kicker { color: var(--bookedz-primary-dark); font-weight: 700; font-size: .85rem; }
.rsvp-event-meta { display: flex; flex-wrap: wrap; gap: .3rem .75rem; color: var(--bookedz-muted); font-size: .9rem; }
.rsvp-event-meta span + span::before { content: '·'; margin-right: .75rem; }
/* Decorative only: no fill or box, so it never reads as a button */
.guestlist-stamp { flex: 0 0 auto; color: var(--bookedz-primary); font-size: 2.25rem; line-height: 1; transform: rotate(15deg); }
.guest-summary { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1rem; }
.capacity-overview,.capacity-title { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.capacity-title h2 { margin: 0; font-size: 1.1rem; font-weight: 700; }
.capacity-title p { margin: .1rem 0 0; color: var(--bookedz-muted); font-size: .84rem; }
.capacity-title > strong { flex: 0 0 auto; color: var(--bookedz-primary-dark); font: 700 2rem/1 var(--bookedz-heading); letter-spacing: -.05em; }
.capacity-title > strong span { font-size: 1rem; }
.capacity-track { position: relative; display: block; width: 100%; height: 13px; overflow: hidden; margin: 1rem 0 .9rem; border: 1px solid var(--bookedz-border); border-radius: 99px; background: var(--bookedz-hover); }
.capacity-segment { position: absolute; inset: 0; display: block; width: 100%; height: 100%; transform-origin: left; transition: transform 320ms cubic-bezier(.2,.8,.2,1); }
.capacity-segment--confirmed { z-index: 3; background: var(--bookedz-primary); }
.capacity-segment--offered { z-index: 2; background: var(--bookedz-yellow); }
.capacity-segment--available { background: var(--bookedz-mint); }
.capacity-legend { display: flex; flex-wrap: wrap; gap: .45rem 1rem; padding: 0; margin: 0; list-style: none; }
.capacity-legend li { display: inline-flex; align-items: center; gap: .4rem; color: var(--bookedz-muted); font-size: .78rem; }
.capacity-legend strong { color: var(--bookedz-ink); font-variant-numeric: tabular-nums; }
.legend-dot { width: 9px; height: 9px; border-radius: 50%; }
.legend-dot--confirmed { background: var(--bookedz-primary); }
.legend-dot--offered { background: var(--bookedz-yellow); }
.legend-dot--available { background: var(--bookedz-mint); border: 1px solid var(--bookedz-muted-border); }
.status-tabs { display: flex; flex-wrap: wrap; gap: .35rem; padding: .45rem; border: 1px solid var(--bookedz-border); border-radius: 16px 16px 0 0; background: var(--bookedz-glass-solid); }
/* Plain scoped selectors: the tab buttons belong to this template. (The earlier :deep() form
   needed an ancestor from this component and never matched, so inactive tabs showed as coral links.) */
.status-tabs .nav-link { display: inline-flex; align-items: center; justify-content: center; gap: .35rem; min-height: 44px; border: 1px solid transparent; border-radius: 11px; color: var(--bookedz-muted); font-weight: 650; white-space: nowrap; }
.status-tabs .nav-link { transition: color var(--bookedz-motion-fast) var(--bookedz-ease), background-color var(--bookedz-motion-fast) var(--bookedz-ease), box-shadow var(--bookedz-motion-normal) var(--bookedz-ease), border-color var(--bookedz-motion-fast) var(--bookedz-ease); }
.status-tabs .nav-link:hover { color: var(--bookedz-ink); background: var(--bookedz-glass-hover); }
.status-tabs .nav-link.active { color: var(--bookedz-primary-dark); border-color: var(--bookedz-border); background: var(--bookedz-surface); box-shadow: var(--bookedz-tab-shadow); }
.tab-count { color: var(--bookedz-ink); background: var(--bookedz-hover); }
.rsvp-list-panel { min-height: 120px; padding: clamp(.8rem, 2vw, 1.3rem); border: 1px solid var(--bookedz-border); border-top: 0; border-radius: 0 0 16px 16px; background: var(--bookedz-surface); }
:deep(.table) { --bs-table-bg: transparent; --bs-table-striped-bg: var(--bookedz-glass-solid); }
:deep(.table thead th) { color: var(--bookedz-muted); font-size: .82rem; font-weight: 700; white-space: nowrap; }
:deep(.table td) { vertical-align: middle; }
:deep(.table-responsive) { border-radius: 12px; }
:deep(.alert) { border-color: var(--bookedz-border); }
@media (max-width: 767.98px) { .guest-summary { grid-template-columns: minmax(0, 1fr); }  .status-tabs { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); } .status-tabs .nav-link { min-width: 0; white-space: normal; } }
@media (max-width: 575.98px) { .rsvp-heading { align-items: flex-start; padding: 1.1rem 1rem; } .guestlist-stamp { font-size: 1.75rem; }  .capacity-overview { padding: 1rem; } .capacity-legend { gap: .4rem .7rem; } .rsvp-event-meta { display: grid; gap: .15rem; } .rsvp-event-meta span + span::before { content: none; } }
@media (prefers-reduced-motion: reduce) { .capacity-segment { transition: none; } }
.bulk-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; padding: 10px 12px; border: 1px solid var(--bookedz-border); border-radius: 12px; background: var(--bookedz-surface); }
</style>
