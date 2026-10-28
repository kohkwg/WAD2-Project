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
  <div class="container py-4 attendance-page">
    <RouterLink :to="`/organiser/events/${eventId}/manage`" class="small d-block mb-3">&larr; Manage event</RouterLink>

    <header class="attendance-header d-flex justify-content-between align-items-start gap-2 mb-4">
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
    </header>

    <div v-if="loading" class="py-5 text-center">
      <div class="spinner-border" role="status"><span class="visually-hidden">Loading…</span></div>
    </div>

    <div v-else-if="error" class="alert alert-danger" role="alert">{{ error }}</div>

    <template v-else>
      <section class="attendance-stat mb-4">
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
      </section>

      <div class="d-flex flex-wrap gap-2 mb-4">
        <RouterLink :to="`/organiser/events/${eventId}/check-in`" class="btn btn-sm btn-primary">
          Open check-in station
        </RouterLink>
        <RouterLink :to="`/organiser/events/${eventId}/venue-qr`" class="btn btn-sm btn-outline-primary">
          Show venue QR
        </RouterLink>
      </div>

      <h2 class="h5 attendance-section-title">Arrivals</h2>
      <p v-if="!arrivals.length" class="small text-body-secondary">No one has checked in yet.</p>
      <ul class="list-group attendance-list mb-4" aria-live="polite">
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
  </div>
</template>

<style scoped>
.attendance-page,.staff-page,.ticket-page,.self-checkin-page,.venue-qr-page{--checkin-ink:var(--bookedz-ink,#292d32);--checkin-paper:var(--bookedz-cream,#fff9ef);--checkin-coral:var(--bookedz-coral-dark,#aa3e2c);--checkin-mint:var(--bookedz-mint,#dceee3);--checkin-line:var(--bookedz-border,#e5ded2);max-width:820px;color:var(--checkin-ink)}
.attendance-header,.staff-heading{padding:1.25rem 0 1.15rem;border-bottom:1px solid var(--checkin-line)}
.attendance-header h1,.staff-heading h1,.ticket-heading h1,.checkin-heading h1,.venue-qr-page h1{font-family:var(--bookedz-heading);font-size:clamp(1.8rem,4vw,2.5rem);letter-spacing:-.035em}
.attendance-header p,.staff-heading p{font-size:.95rem}
.attendance-page a:not(.btn),.staff-page a:not(.btn),.ticket-page a:not(.btn),.self-checkin-page a:not(.btn),.venue-qr-page a:not(.btn){color:var(--checkin-coral);font-weight:600}
.attendance-stat{padding:1.4rem 1.5rem;border:1px solid var(--checkin-line);border-radius:22px;background:var(--checkin-mint)}
.attendance-stat .display-6{font-family:var(--bookedz-heading);font-size:3.6rem;color:var(--checkin-ink);line-height:1}
.attendance-stat .progress{height:.7rem;border-radius:2rem;background:#c8d9cd}.attendance-stat .progress-bar{background:#397456!important;border-radius:2rem}
.attendance-page .btn-primary,.staff-page .btn-primary,.ticket-page .btn-primary,.self-checkin-page .btn-primary,.venue-qr-page .btn-primary{--bs-btn-bg:var(--checkin-coral);--bs-btn-border-color:var(--checkin-coral);--bs-btn-hover-bg:#8f3022;--bs-btn-hover-border-color:#8f3022;--bs-btn-color:#fff;--bs-btn-hover-color:#fff}
.attendance-page .btn-outline-primary,.staff-page .btn-outline-primary,.ticket-page .btn-outline-primary,.self-checkin-page .btn-outline-primary,.venue-qr-page .btn-outline-primary{--bs-btn-color:var(--checkin-coral);--bs-btn-border-color:var(--checkin-coral);--bs-btn-hover-bg:var(--checkin-coral);--bs-btn-hover-border-color:var(--checkin-coral)}
.attendance-section-title{font-family:var(--bookedz-heading);font-weight:700;letter-spacing:-.02em}
.attendance-list{border:1px solid var(--checkin-line);border-radius:16px;overflow:hidden}.attendance-list .list-group-item{padding:.9rem 1rem;border-color:var(--checkin-line);background:#fffdfa;gap:.75rem}.attendance-list .list-group-item>span:last-child{text-align:right;white-space:normal!important}
@media(max-width:575.98px){.attendance-page,.staff-page,.ticket-page,.self-checkin-page,.venue-qr-page{padding-inline:1rem}.attendance-stat{padding:1rem;border-radius:18px}.attendance-stat .display-6{font-size:2.8rem}.attendance-list .list-group-item{align-items:flex-start!important;flex-direction:column}.attendance-list .list-group-item>span:last-child{text-align:left}}
</style>
