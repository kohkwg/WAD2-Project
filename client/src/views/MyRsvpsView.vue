<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import OfferBanner from '../components/rsvp/OfferBanner.vue'
import NextEventCard from '../components/rsvp/NextEventCard.vue'
import ParticipantRsvpRow from '../components/rsvp/ParticipantRsvpRow.vue'
import SavedEventCard from '../components/rsvp/SavedEventCard.vue'
import RsvpEmptyState from '../components/rsvp/RsvpEmptyState.vue'
import { groupRsvps, eventCalendar } from '../utils/rsvpOverview.js'
import {
  getMyRsvps,
  cancelRsvp,
  respondToOffer,
  getSavedEvents,
  unsaveEvent,
  USING_SUPABASE,
} from '../utils/api.js'

const rsvps = ref([])
const loading = ref(true)
const errorMessage = ref('')
const statusMessage = ref('')
const busyId = ref(null) // which RSVP is being saved
const confirmCancelId = ref(null) // which RSVP is showing "Are you sure?"
const activeTab = ref('upcoming')
const savedEvents = ref([])
const savedError = ref('')
const savedReady = ref(false)
const groups = computed(() => groupRsvps(rsvps.value, now.value))
const tabs = computed(() => [
  { id: 'upcoming', label: 'Upcoming', count: groups.value.upcoming.length },
  { id: 'saved', label: 'Saved', count: savedReady.value ? savedEvents.value.length : '—' },
  { id: 'past', label: 'Past', count: groups.value.past.length },
  { id: 'cancelled', label: 'Cancelled', count: groups.value.cancelled.length },
])
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
  { label: 'Upcoming plans', value: groups.value.upcoming.length },
  { label: 'Saved for later', value: savedReady.value ? savedEvents.value.length : '—' },
  { label: 'Past events', value: groups.value.past.length },
])
function addCalendar(event) {
  const calendar = eventCalendar(event)
  if (!calendar) return
  const url = URL.createObjectURL(new Blob([calendar], { type: 'text/calendar;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'bookedz-event.ics'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
async function removeSaved(eventId) {
  if (busyId.value) return
  busyId.value = `saved-${eventId}`
  savedError.value = ''
  statusMessage.value = ''
  try {
    if (pendingLoad) await pendingLoad
    await unsaveEvent(eventId)
    if (!mounted) return
    savedEvents.value = savedEvents.value.filter(event => event.id !== eventId)
    statusMessage.value = 'Event removed from saved events.'
    await focusMessage(statusAlert)
  } catch (error) {
    if (mounted) savedError.value = 'Could not remove saved event: ' + error.message
  } finally {
    if (mounted) busyId.value = null
  }
}
async function moveTab(event, index) {
  let target
  if (event.key === 'ArrowRight') target = (index + 1) % tabs.value.length
  else if (event.key === 'ArrowLeft') target = (index + tabs.value.length - 1) % tabs.value.length
  else if (event.key === 'Home') target = 0
  else if (event.key === 'End') target = tabs.value.length - 1
  else return
  event.preventDefault()
  activeTab.value = tabs.value[target].id
  await nextTick()
  document.getElementById(`tab-${activeTab.value}`)?.focus()
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
    pendingLoad = Promise.allSettled([getMyRsvps(), getSavedEvents()])
    const [registrations, saves] = await pendingLoad
    if (mounted && request === loadRequest) {
      if (saves.status === 'fulfilled') {
        savedEvents.value = saves.value
        savedReady.value = true
        savedError.value = ''
      } else {
        savedError.value = 'Could not load saved events: ' + saves.reason.message
      }
      if (registrations.status === 'fulfilled') rsvps.value = registrations.value
      else throw registrations.reason
    }
  } finally {
    if (request === loadRequest) {
      refreshing = false
      pendingLoad = null
    }
  }
}

async function refreshRsvps() {
  if (refreshing || busyId.value) return
  now.value = Date.now()
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

const offers = computed(() => rsvps.value.filter(r => r.status === 'offered'
  && Date.parse(r.offerExpiresAt) > now.value
  && !(Date.parse(r.event.endTime) <= now.value)))

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
      <div><h1 class="page-title">My RSVPs</h1><p>Your plans, saved favourites and good times to come.</p></div>
      <span class="header-star" aria-hidden="true">✳</span>
    </header>
    <div v-if="loading" class="text-center my-5" role="status"><span class="spinner-border text-primary" aria-hidden="true"></span><span class="visually-hidden">Loading your RSVPs…</span></div>
    <template v-else>
      <div v-if="statusMessage" ref="statusAlert" tabindex="-1" class="alert alert-success mt-3" role="status" aria-live="polite">{{ statusMessage }}</div>
      <div v-if="errorMessage" ref="errorAlert" tabindex="-1" class="alert alert-danger mt-3" role="alert">{{ errorMessage }}</div>
      <!-- Waitlist offers expire, so they come before everything else. -->
      <div v-if="offers.length" class="offers-first">
        <OfferBanner v-for="rsvp in offers" :key="rsvp.id" :rsvp="rsvp" :now="now" :busy="busyId !== null" @confirm="confirmOffer" @decline="declineOffer" />
      </div>
      <dl class="plans-summary"><div v-for="count in planCounts" :key="count.label"><dt>{{ count.label }}</dt><dd>{{ count.value }}</dd></div></dl>
      <div class="rsvps-toolbar"><p>Updates on its own every 30 seconds.</p><button type="button" class="btn btn-outline-secondary btn-sm" :disabled="busyId !== null" @click="refreshRsvps">Refresh RSVPs</button></div>
      <div class="rsvp-tabs" role="tablist" aria-label="Your events">
        <button v-for="(tab, index) in tabs" :id="`tab-${tab.id}`" :key="tab.id" role="tab" type="button" :aria-selected="activeTab === tab.id" :aria-controls="`panel-${tab.id}`" :tabindex="activeTab === tab.id ? 0 : -1" @click="activeTab = tab.id" @keydown="moveTab($event, index)">{{ tab.label }} <span>{{ tab.count }}</span></button>
      </div>
      <section v-for="tab in tabs" v-show="activeTab === tab.id" :id="`panel-${tab.id}`" :key="tab.id" role="tabpanel" :aria-labelledby="`tab-${tab.id}`" tabindex="0" class="rsvp-panel">
        <template v-if="tab.id === 'saved'">
          <div v-if="savedError" class="alert alert-danger" role="alert">{{ savedError }} <button type="button" class="btn btn-outline-secondary" :disabled="busyId !== null" @click="refreshRsvps">Retry saved events</button></div>
          <div v-if="savedEvents.length" class="saved-grid"><SavedEventCard v-for="event in savedEvents" :key="event.id" :event="event" :busy="busyId === `saved-${event.id}`" :disabled="busyId !== null" @unsave="removeSaved" /></div>
          <RsvpEmptyState v-else-if="!savedError" section="saved" />
        </template>
        <template v-else>
          <NextEventCard v-if="tab.id === 'upcoming' && groups.next" :rsvp="groups.next" :tickets-enabled="USING_SUPABASE" @calendar="addCalendar" />
          <h2 class="section-title">{{ tab.id === 'upcoming' ? 'All upcoming plans' : tab.id === 'past' ? 'Past events' : 'Cancelled & closed' }}</h2>
          <ParticipantRsvpRow v-for="rsvp in groups[tab.id]" :key="rsvp.id" :rsvp="rsvp" :past="tab.id === 'past'" :closed="tab.id === 'cancelled'" :confirming="confirmCancelId === rsvp.id" :busy="busyId === rsvp.id" :disabled="busyId !== null" :tickets-enabled="USING_SUPABASE" @ask-cancel="askCancel" @keep="keepRsvp" @cancel="cancel" />
          <RsvpEmptyState v-if="!groups[tab.id].length && !errorMessage" :section="tab.id" />
        </template>
      </section>
    </template>
  </div>
</template>
<style scoped>
.my-rsvps-page{max-width:1060px;margin:0 auto;padding:12px 0 48px;color:var(--bookedz-ink)}.rsvps-heading{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:22px 28px;border-radius:22px;background:var(--bookedz-peach);border:1px solid var(--bookedz-border)}.rsvps-heading h1{ margin:10px 0; }.rsvps-heading p{margin:8px 0 0;color:var(--bookedz-muted);font-size:var(--text-body)}.rsvps-heading .rsvps-eyebrow{font-size:var(--text-caption);letter-spacing:.13em;font-weight:700}.header-star{font-size:3.5rem;line-height:1;color:var(--bookedz-primary);transform:rotate(15deg)}.offers-first{margin-top:20px}.plans-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:20px 0}.plans-summary>div{display:grid;grid-template-rows:auto 1fr;gap:4px;padding:14px 18px;border:1px solid var(--bookedz-border);border-radius:18px;background:var(--bookedz-surface)}.plans-summary dt{grid-row:2;font-size:var(--text-small);color:var(--bookedz-muted);font-weight:500}.plans-summary dd{grid-row:1;margin:0;font:600 1.5rem var(--bookedz-heading);font-variant-numeric:tabular-nums}.rsvps-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:20px}.rsvps-toolbar p{font-size:var(--text-small);color:var(--bookedz-muted);margin:0}.rsvps-toolbar button{ min-height:44px; }.rsvp-tabs{display:flex;gap:8px;border-bottom:1px solid var(--bookedz-border);overflow-x:auto}.rsvp-tabs button{border:0;border-bottom:3px solid transparent;background:transparent;color:var(--bookedz-muted);padding:14px 12px;font-size:var(--text-button);white-space:nowrap;min-height:48px}.rsvp-tabs button[aria-selected=true]{color:var(--bookedz-primary-dark);border-bottom-color:var(--bookedz-primary-dark);font-weight:650}.rsvp-tabs span{font-size:var(--text-caption);padding:3px 6px;border-radius:7px;background:var(--bookedz-hover);margin-left:4px}.rsvp-panel{padding-top:24px}.saved-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.section-title{ margin:0 0 18px; }.rsvp-panel .next-event{margin-top:0}.alert{overflow-wrap:anywhere}.alert button{min-height:44px;margin-left:8px}:deep(:focus-visible){outline:3px solid var(--bookedz-primary-dark);outline-offset:3px}
@media(max-width:767px){.saved-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.plans-summary{gap:8px}.plans-summary>div{padding:16px 12px}}
@media(max-width:575px){.rsvps-heading{padding:24px 20px}.header-star{font-size:3rem}.rsvps-heading .rsvps-eyebrow{max-width:210px;line-height:1.7}.plans-summary dt{grid-row:2;font-size:var(--text-small)}.plans-summary dd{font-size:1.65rem}.saved-grid{grid-template-columns:1fr}.rsvps-toolbar p{max-width:150px}.rsvp-tabs{gap:0}.rsvp-tabs button{padding:13px 8px;font-size:.8rem}.rsvp-tabs span{margin-left:2px}.my-rsvps-page{padding-top:0}}
</style>
