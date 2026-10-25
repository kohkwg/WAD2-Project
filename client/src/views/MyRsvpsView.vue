<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import OfferBanner from '../components/OfferBanner.vue'
import RsvpStatusBadge from '../components/RsvpStatusBadge.vue'
import {
  getMyRsvps,
  cancelRsvp,
  respondToOffer,
  CURRENT_USER_ID,
  CLOSED_STATUSES,
  USING_SUPABASE,
} from '../utils/api.js'
import { formatEventTime } from '../utils/helpers.js'

const rsvps = ref([])
const loading = ref(true)
const errorMessage = ref('')
const statusMessage = ref('')
const busyId = ref(null) // which RSVP is being saved
const confirmCancelId = ref(null) // which RSVP is showing "Are you sure?"
const showClosed = ref(false)
const statusAlert = ref(null)
const errorAlert = ref(null)

// The button that was pressed disappears (confirm step, cancelled card, answered offer),
// so keyboard focus moves to whatever replaced it instead of falling back to the page.
async function focusMessage(target) {
  await nextTick()
  target.value?.focus()
}

async function askCancel(rsvpId) {
  confirmCancelId.value = rsvpId
  await nextTick()
  document.getElementById(`keep-${rsvpId}`)?.focus() // the safe choice is focused first
}

async function keepRsvp(rsvpId) {
  confirmCancelId.value = null
  await nextTick()
  document.getElementById(`cancel-${rsvpId}`)?.focus()
}
const planCounts = computed(() => [
  { label: 'Confirmed', value: rsvps.value.filter(r => r.status === 'confirmed').length },
  { label: 'Awaiting approval', value: rsvps.value.filter(r => r.status === 'pending').length },
  { label: 'Waitlisted', value: rsvps.value.filter(r => r.status === 'waitlisted').length },
])
function datePart(event, part) {
  const date = new Date(event.startTime || event.start_time)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-SG', part === 'month' ? { month: 'short' } : { day: 'numeric' })
}

// `now` ticks every 30 seconds so the offer countdown moves
const now = ref(Date.now())
let timer = null
let mounted = false
let loadRequest = 0
let refreshing = false
let pendingLoad = null

async function loadRsvps(allowBusy = false) {
  if (!mounted || (busyId.value && !allowBusy)) return
  if (refreshing) {
    if (!allowBusy) return
    await pendingLoad
    if (!mounted) return
  }
  refreshing = true
  const request = ++loadRequest
  try {
    pendingLoad = getMyRsvps(CURRENT_USER_ID)
    const rows = await pendingLoad
    if (mounted && request === loadRequest) rsvps.value = rows
  } finally {
    if (request === loadRequest) {
      refreshing = false
      pendingLoad = null
    }
  }
}

async function refreshRsvps() {
  if (refreshing || busyId.value) return
  errorMessage.value = ''
  try {
    await loadRsvps()
  } catch (error) {
    if (mounted) errorMessage.value = 'Could not load your RSVPs: ' + error.message
  }
}

function onFocus() {
  refreshRsvps()
}

onMounted(async () => {
  mounted = true
  try {
    await refreshRsvps()
  } finally {
    if (!mounted) return
    loading.value = false
  }
  timer = setInterval(() => {
    now.value = Date.now()
    refreshRsvps()
  }, 30000)
  window.addEventListener('focus', onFocus)
})

onUnmounted(() => {
  mounted = false
  loadRequest++
  clearInterval(timer)
  window.removeEventListener('focus', onFocus)
})

const offers = computed(() => rsvps.value.filter((r) => r.status === 'offered'))
const activeRsvps = computed(() =>
  rsvps.value.filter((r) => ['confirmed', 'pending', 'waitlisted'].includes(r.status)),
)
const closedRsvps = computed(() => rsvps.value.filter((r) => CLOSED_STATUSES.includes(r.status)))

async function answerOffer(rsvpId, accept) {
  if (busyId.value) return
  busyId.value = rsvpId
  errorMessage.value = ''
  statusMessage.value = ''
  try {
    await respondToOffer(rsvpId, accept)
    if (!mounted) return
    await loadRsvps(true) // reload first, then show the message, so both agree
    if (!mounted) return
    statusMessage.value = accept
      ? 'Spot confirmed. See you there!'
      : 'Offer declined. The spot goes to the next person on the waitlist.'
    focusMessage(statusAlert)
  } catch (error) {
    if (!mounted) return
    errorMessage.value = error.message
    try {
      await loadRsvps(true)
    } catch (refreshError) {
      errorMessage.value = error.message + ' Could not refresh RSVPs: ' + refreshError.message
    }
    focusMessage(errorAlert)
  } finally {
    if (mounted) busyId.value = null
  }
}

function confirmOffer(rsvpId) {
  answerOffer(rsvpId, true)
}

function declineOffer(rsvpId) {
  answerOffer(rsvpId, false)
}

async function cancel(rsvpId) {
  if (busyId.value) return
  busyId.value = rsvpId
  errorMessage.value = ''
  statusMessage.value = ''
  try {
    await cancelRsvp(rsvpId)
    if (!mounted) return
    await loadRsvps(true)
    if (!mounted) return
    confirmCancelId.value = null
    statusMessage.value = 'RSVP cancelled.'
    focusMessage(statusAlert)
  } catch (error) {
    if (mounted) {
      errorMessage.value = error.message
      confirmCancelId.value = null
      try { await loadRsvps(true) } catch { /* retain the original cancellation error */ }
      focusMessage(errorAlert)
    }
  } finally {
    if (mounted) busyId.value = null
  }
}
</script>

<template>
  <div class="my-rsvps-page">
  <header class="rsvps-heading">
    <div>
      <h1 class="rsvps-title">My RSVPs</h1>
      <p class="rsvps-lede">Confirmed plans, requests waiting for a reply, and offers to claim.</p>
    </div>
  </header>

  <div v-if="loading" class="text-center my-5">
    <div class="spinner-border text-primary" role="status">
      <span class="visually-hidden">Loading your RSVPs…</span>
    </div>
  </div>

  <template v-else>
    <dl class="plans-summary"><div v-for="count in planCounts" :key="count.label"><dt>{{ count.label }}</dt><dd>{{ count.value }}</dd></div></dl>
    <div class="rsvps-toolbar">
      <button
        type="button"
        class="btn btn-outline-secondary btn-sm"
        :disabled="busyId !== null"
        @click="refreshRsvps"
      >
        Refresh RSVPs
      </button>
    </div>
    <div
      v-if="statusMessage"
      ref="statusAlert"
      tabindex="-1"
      class="alert alert-success d-flex justify-content-between align-items-center" role="status" aria-live="polite"
    >
      <span>{{ statusMessage }}</span>
      <button
        type="button"
        class="btn-close"
        aria-label="Close"
        @click="statusMessage = ''"
      ></button>
    </div>
    <div v-if="errorMessage" ref="errorAlert" tabindex="-1" class="alert alert-danger" role="alert">{{ errorMessage }}</div>

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

    <div v-if="activeRsvps.length === 0 && offers.length === 0" class="empty-rsvps">
      <p class="empty-title">You haven't RSVP'd to anything yet.</p>
      <p class="text-secondary mb-3">Your next plan is waiting to be found.</p>
      <RouterLink to="/events" class="btn event-cta">Find events</RouterLink>
    </div>

    <TransitionGroup name="rsvp-list" tag="div" class="rsvp-list">
    <article v-for="rsvp in activeRsvps" :key="rsvp.id" class="card rsvp-card">
      <div class="rsvp-card-main">
        <div class="date-ticket" aria-hidden="true"><span>{{ datePart(rsvp.event, 'month') }}</span><strong>{{ datePart(rsvp.event, 'day') }}</strong></div>
        <div class="rsvp-plan-copy">
          <h2 class="rsvp-event-title">{{ rsvp.event.title }}</h2>
          <p class="small text-secondary mb-2">
            {{ formatEventTime(rsvp.event) }} · {{ rsvp.event.venue.name }}
          </p>
          <RsvpStatusBadge :status="rsvp.status" />
          <span v-if="rsvp.checkedInAt" class="badge text-bg-success ms-2">Checked in</span>
          <!-- Feature 3: personal QR ticket for check-in (live Supabase only) -->
          <RouterLink
            v-if="USING_SUPABASE && rsvp.status === 'confirmed'"
            :to="`/events/${rsvp.event.id}/ticket`"
            class="btn event-cta ticket-action"
          >My ticket</RouterLink>
          <p v-if="rsvp.status === 'waitlisted'" class="small mb-0 mt-2">
            If a spot opens up, you'll see a banner here and have 24 hours to confirm.
          </p>
          <p v-if="rsvp.status === 'pending'" class="small mb-0 mt-2">
            The organiser hasn't reviewed your RSVP yet.
          </p>
        </div>

        <!-- Cancel with a second "are you sure?" step instead of a browser pop-up -->
        <div v-if="!rsvp.checkedInAt" class="text-md-end flex-shrink-0">
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
              :id="`keep-${rsvp.id}`"
              type="button"
              class="btn btn-outline-secondary btn-sm"
              @click="keepRsvp(rsvp.id)"
            >
              Keep it
            </button>
          </template>
          <button
            v-else
            :id="`cancel-${rsvp.id}`"
            type="button"
            class="btn btn-outline-danger btn-sm"
            @click="askCancel(rsvp.id)"
          >
            Cancel RSVP<span class="visually-hidden"> for {{ rsvp.event.title }}</span>
          </button>
        </div>
      </div>
    </article>

    </TransitionGroup>

    <!-- Older / closed RSVPs hidden until asked for -->
    <div v-if="closedRsvps.length > 0" class="mt-4">
      <button
        type="button"
        class="btn btn-link p-0"
        aria-controls="closed-rsvps"
        :aria-expanded="showClosed"
        @click="showClosed = !showClosed"
      >
        {{ showClosed ? 'Hide' : 'Show' }} cancelled and closed RSVPs ({{ closedRsvps.length }})
      </button>
      <ul v-if="showClosed" id="closed-rsvps" class="list-group mt-2">
        <li
          v-for="rsvp in closedRsvps"
          :key="rsvp.id"
          class="list-group-item closed-rsvp"
        >
          <span class="closed-title">{{ rsvp.event.title }}</span>
          <span class="closed-badges">
            <RsvpStatusBadge :status="rsvp.status" />
            <span v-if="rsvp.checkedInAt" class="badge text-bg-success">Checked in</span>
          </span>
        </li>
      </ul>
    </div>
  </template>
  </div>
</template>

<style scoped>
.plans-summary { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 12px; margin: 0 0 20px; }
.plans-summary > div { padding: 16px 20px; border: 1px solid var(--bookedz-border); border-radius: 18px; background: var(--bookedz-glass-solid); }
.plans-summary dt { color: var(--bookedz-muted); font-size: .8rem; font-weight: 500; }.plans-summary dd { margin: 4px 0 0; font: 650 1.8rem/1 var(--bookedz-heading); font-variant-numeric: tabular-nums; }
.date-ticket { display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0; width: 64px; min-height: 76px; border: 1px solid var(--bookedz-border); border-radius: 16px; background: var(--bookedz-glass-active); color: var(--bookedz-primary-dark); }
.date-ticket span { font-size: .8rem; }.date-ticket strong { font: 650 1.9rem/1.2 var(--bookedz-heading); }
.rsvp-plan-copy { min-width: 0; flex: 1; }.ticket-action { margin: 10px 0; }
.rsvp-list-enter-active,.rsvp-list-leave-active,.rsvp-list-move { transition: opacity .25s ease, transform .3s ease; }.rsvp-list-enter-from,.rsvp-list-leave-to { opacity: 0; transform: translateY(12px); }
@media(max-width:575px) { .plans-summary { gap: 8px; }.plans-summary > div { padding: 12px 10px; }.plans-summary dt { font-size: .75rem; }.date-ticket { width: 60px; min-height: 64px; flex-direction: row; gap: 6px; }.date-ticket strong { font-size: 1.3rem; } }
@media(prefers-reduced-motion:reduce) { .rsvp-list-enter-active,.rsvp-list-leave-active,.rsvp-list-move { transition: none; } }
.my-rsvps-page { max-width: 960px; margin: 0 auto; padding: 1.25rem 0 3rem; }
.rsvps-heading { display: flex; justify-content: space-between; align-items: end; margin-bottom: 1.75rem; }
.rsvps-kicker { margin: 0 0 .5rem; color: var(--bookedz-ink-soft, #62676b); font-size: .9rem; }
.rsvps-title { margin: 0; color: var(--bookedz-ink, #292d32); font: 500 clamp(2.2rem, 5vw, 3.25rem)/1.05 var(--bookedz-heading); letter-spacing: -.04em; }
.rsvps-lede { margin: .75rem 0 0; color: var(--bookedz-ink-soft, #62676b); }
.rsvps-toolbar { display: flex; justify-content: end; margin-bottom: 1rem; }
.rsvp-card { margin-bottom: .9rem; border: 1px solid var(--bookedz-border, #e5ded2); border-radius: 18px; background: var(--bookedz-surface); box-shadow: var(--bookedz-card-shadow); }
.rsvp-card-main { display: flex; flex-direction: column; justify-content: space-between; gap: 1.25rem; padding: 1.25rem; }
.rsvp-event-title { margin: 0 0 .4rem; color: var(--bookedz-ink, #292d32); font: 500 1.35rem/1.2 var(--bookedz-heading); }
.empty-rsvps { padding: clamp(1.5rem, 6vw, 3rem); border: 1px dashed var(--bookedz-border); border-radius: 22px; background: var(--bookedz-glass-solid); text-align: center; }
.empty-title { margin: 0 0 .5rem; color: var(--bookedz-ink, #292d32); font: 500 1.45rem var(--bookedz-heading); }
:deep(.btn-primary) { border-color: var(--bookedz-primary-dark, #aa3e2c); background: var(--bookedz-primary-dark, #aa3e2c); }
:deep(:focus-visible) { outline: 3px solid var(--bookedz-primary-dark); outline-offset: 3px; }
@media (min-width: 768px) { .rsvp-card-main { flex-direction: row; align-items: center; padding: 1.35rem 1.5rem; } }
.closed-rsvp { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5rem 1rem; }
.closed-title { min-width: 0; overflow-wrap: anywhere; }
.closed-badges { display: inline-flex; flex-wrap: wrap; gap: .5rem; }
@media (max-width: 575px) { .my-rsvps-page { padding-top: .5rem; } }
</style>
