<script setup>
// Feature 3: live attendance dashboard for organisers/helpers.
// Checked-in vs confirmed, plus an arrivals feed that updates as people arrive
// (from the staff station, self check-in, or a CSV import). Fraud flags come later.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import AttendanceCsv from '@/components/checkin/AttendanceCsv.vue'
import { supabase } from '@/utils/supabase'
import { formatTime, getEvent } from '@/utils/checkin'

const route = useRoute()
const eventId = route.params.eventId

const loading = ref(true)
const error = ref('')
const event = ref(null)
const confirmedCount = ref(0)
const arrivals = ref([]) // check_ins rows, newest first, each with .name added
const live = ref('connecting') // 'connecting' | 'live' | 'offline'

const METHOD_LABELS = { personal_qr: 'Staff scan', scan_in_qr: 'Self scan', barcode: 'Barcode', manual: 'Manual', csv_import: 'CSV import' }

// ===== HUXLEY: core logic ===================================================
// How the live dashboard works: "load once, then listen"
//
// loadInitial()
//   1. confirmed registrations: gives the denominator ("42 / 60") AND a lookup
//      table registration_id -> display name. Realtime events only carry the raw
//      check_ins row (no joined name), so we keep this map to name new arrivals.
//   2. existing check_ins for this event, newest first.
//   RLS lets staff read every row for their event; participants only see their own.
//
// subscribe()
//   Supabase Realtime pushes every INSERT on check_ins for this event over a
//   WebSocket (the migration adds check_ins to the supabase_realtime publication).
//   Realtime applies RLS too, so only staff receive other people's check-ins.
//   Subscribe BEFORE loading, so an arrival that happens during the load isn't missed.
//   We wait for status SUBSCRIBED (plus a short pause, because Supabase starts
//   delivering changes slightly after it reports SUBSCRIBED) before loading.
//
// addArrival(row)
//   - dedupe with `seenIds`: a check-in that arrives over Realtime AND in the
//     initial load (the race above) must only be counted once
//   - attach the name from the map, put it at the top of the feed
//
// onUnmounted: removeChannel, otherwise the WebSocket subscription leaks and you
// get double events after navigating away and back.
// Not handled yet (say so if asked): undo/delete of a check-in, and a
// registration being confirmed while the page is open (confirmed count is
// loaded once). Both could be added with more Realtime listeners.
//
// Fix (22 Oct, found in the signed-in test): a check-in row stays when the
// person later cancels. So names are loaded for EVERY registration, but the
// headline count only includes check-ins whose registration is still confirmed.
// Others stay in the feed with a "no longer confirmed" note.
// ============================================================================
const namesByRegistration = new Map()
const confirmedIds = new Set()
const seenIds = new Set()
let channel = null

function addArrival(row) {
  if (seenIds.has(row.id)) return
  seenIds.add(row.id)
  arrivals.value.unshift({ ...row, name: namesByRegistration.get(row.registration_id) ?? 'Participant' })
}

const isConfirmed = (a) => confirmedIds.has(a.registration_id)

// Resolves once the subscription is live (or after 10 s, so a Realtime outage
// doesn't stop the page loading; the badge then shows Offline/Connecting).
function subscribe() {
  return new Promise((resolve) => {
    const giveUp = setTimeout(resolve, 10_000)
    channel = supabase
      .channel(`attendance-${eventId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'check_ins', filter: `event_id=eq.${eventId}` },
        (payload) => addArrival(payload.new),
      )
      .subscribe((status) => {
        live.value = status === 'SUBSCRIBED' ? 'live' : status === 'CLOSED' || status === 'CHANNEL_ERROR' ? 'offline' : 'connecting'
        if (status === 'SUBSCRIBED') {
          clearTimeout(giveUp)
          setTimeout(resolve, 500)
        }
      })
  })
}

async function loadInitial() {
  const [regs, checkIns] = await Promise.all([
    supabase
      .from('registrations')
      // registrations links to profiles twice (user_id and decided_by), so name the one we want
      .select('id, status, profiles!registrations_user_id_fkey(display_name)')
      .eq('event_id', eventId),
    supabase
      .from('check_ins')
      .select('*')
      .eq('event_id', eventId)
      .order('checked_in_at', { ascending: true }), // oldest first, so unshift leaves newest on top
  ])
  if (regs.error) throw regs.error
  if (checkIns.error) throw checkIns.error

  for (const r of regs.data) {
    namesByRegistration.set(r.id, r.profiles?.display_name || 'Participant')
    if (r.status === 'confirmed') confirmedIds.add(r.id)
  }
  confirmedCount.value = confirmedIds.size
  for (const row of checkIns.data) addArrival(row)
}

const checkedInCount = computed(() => arrivals.value.filter(isConfirmed).length)
const percent = computed(() =>
  confirmedCount.value ? Math.round((checkedInCount.value / confirmedCount.value) * 100) : 0,
)

onMounted(async () => {
  try {
    event.value = await getEvent(eventId)
    await subscribe()
    await loadInitial()
  } catch (e) {
    error.value = e.message ?? 'Could not load attendance.'
  } finally {
    loading.value = false
  }
})

onUnmounted(() => channel && supabase.removeChannel(channel))
</script>

<template>
  <main class="container py-4" style="max-width: 720px">
    <RouterLink :to="`/organiser/events/${eventId}/manage`" class="small d-block mb-3">&larr; Manage event</RouterLink>

    <div class="d-flex justify-content-between align-items-start gap-2 mb-3">
      <div>
        <h1 class="h4 mb-1">Attendance</h1>
        <p class="text-body-secondary small mb-0">{{ event?.title ?? '' }}</p>
      </div>
      <span
        class="badge"
        :class="{ 'text-bg-success': live === 'live', 'text-bg-secondary': live === 'connecting', 'text-bg-danger': live === 'offline' }"
        role="status"
      >
        {{ live === 'live' ? '● Live' : live === 'connecting' ? 'Connecting…' : 'Offline' }}
      </span>
    </div>

    <div v-if="loading" class="py-5 text-center">
      <div class="spinner-border" role="status"><span class="visually-hidden">Loading…</span></div>
    </div>

    <div v-else-if="error" class="alert alert-danger" role="alert">{{ error }}</div>

    <template v-else>
      <div class="card card-body mb-3">
        <div class="d-flex align-items-baseline gap-2">
          <span class="display-6 fw-semibold">{{ checkedInCount }}</span>
          <span class="text-body-secondary">/ {{ confirmedCount }} confirmed checked in</span>
          <span class="ms-auto fw-semibold">{{ percent }}%</span>
        </div>
        <div
          class="progress mt-2"
          role="progressbar"
          aria-label="Checked in"
          :aria-valuenow="percent"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div class="progress-bar bg-success" :style="{ width: `${percent}%` }"></div>
        </div>
      </div>

      <div class="d-flex flex-wrap gap-2 mb-3">
        <RouterLink :to="`/organiser/events/${eventId}/check-in`" class="btn btn-sm btn-primary">
          Open check-in station
        </RouterLink>
        <RouterLink :to="`/organiser/events/${eventId}/venue-qr`" class="btn btn-sm btn-outline-primary">
          Show venue QR
        </RouterLink>
      </div>

      <h2 class="h6 text-uppercase text-body-secondary">Arrivals</h2>
      <p v-if="!arrivals.length" class="small text-body-secondary">No one has checked in yet.</p>
      <ul class="list-group mb-4" aria-live="polite">
        <li v-for="a in arrivals" :key="a.id" class="list-group-item d-flex justify-content-between align-items-center">
          <span>
            {{ a.name }}
            <span v-if="!isConfirmed(a)" class="small text-body-secondary">(no longer confirmed)</span>
          </span>
          <span class="small text-body-secondary text-nowrap">
            {{ METHOD_LABELS[a.method] ?? a.method }} · {{ formatTime(a.checked_in_at) }}
          </span>
        </li>
      </ul>

      <AttendanceCsv :event-id="eventId" :event-title="event?.title ?? 'event'" />
    </template>
  </main>
</template>
