<script setup>
// Feature 3: staff check-in station. Scan a participant's personal QR (from their
// My Ticket page) and check them in.
import { onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import QrScanner from '@/components/checkin/QrScanner.vue'
import { supabase } from '@/utils/supabase'
import { formatTime, getEvent, staffCheckIn, wasAlreadyCheckedIn } from '@/utils/checkin'

const route = useRoute()
const eventId = route.params.eventId

const event = ref(null)
const busy = ref(false)
const last = ref(null) // { kind: 'success' | 'already' | 'error', name, time, message }
const recent = ref([]) // this session's scans, newest first
const typedCode = ref('')

// ===== HUXLEY: core logic ===================================================
// onScan(code)
// Called with the text inside the participant's QR (their registrations.qr_token).
//   1. ignore scans while one is still being processed (no double submits)
//   2. call staff_check_in. The DATABASE checks: am I staff for this event, does
//      the code belong to a registration for THIS event, is it CONFIRMED. It
//      also makes repeat scans safe (returns the existing row, no duplicate).
//   3. classify the result for the big coloured banner:
//        success  -> green, new check-in
//        already  -> yellow, they were checked in earlier (shows when)
//        error    -> red, e.g. "Ticket not found for this event",
//                    "This registration is cancelled",
//                    "Only organisers and helpers can check people in"
//   4. look up their display name so staff can match the face to the ticket
//   5. add it to the "recent scans" list (kept to the last 20)
// ============================================================================
async function onScan(code) {
  if (busy.value) return
  busy.value = true
  try {
    const sentAt = Date.now()
    const row = await staffCheckIn(eventId, code.trim())

    const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', row.user_id).single()
    const name = profile?.display_name || 'Participant'

    last.value = {
      kind: wasAlreadyCheckedIn(row, sentAt) ? 'already' : 'success',
      name,
      time: formatTime(row.checked_in_at),
    }
  } catch (e) {
    last.value = { kind: 'error', message: e.message }
  } finally {
    recent.value = [{ ...last.value, at: Date.now() }, ...recent.value].slice(0, 20)
    busy.value = false
  }
}

// Dev/testing: paste a qr_token when you're on a laptop with no second phone
function submitTyped() {
  if (typedCode.value.trim()) onScan(typedCode.value)
  typedCode.value = ''
}

const bannerClass = { success: 'alert-success', already: 'alert-warning', error: 'alert-danger' }

onMounted(() =>
  getEvent(eventId)
    .then((e) => (event.value = e))
    .catch(() => {}),
)
</script>

<template>
  <main class="container py-4" style="max-width: 560px">
    <RouterLink to="/login" class="small d-block mb-3">&larr; Back</RouterLink>
    <div class="d-flex justify-content-between align-items-start gap-2 mb-3">
      <div>
        <h1 class="h4 mb-1">Check-in station</h1>
        <p class="text-body-secondary small mb-0">{{ event?.title ?? '' }}</p>
      </div>
      <RouterLink :to="`/organiser/events/${eventId}/attendance`" class="btn btn-sm btn-outline-primary text-nowrap">
        Attendance
      </RouterLink>
    </div>

    <QrScanner @decoded="onScan" />

    <div v-if="busy" class="alert alert-secondary mt-3 mb-0" role="status">
      <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Checking…
    </div>
    <div v-else-if="last" class="alert mt-3 mb-0" :class="bannerClass[last.kind]" role="status" aria-live="polite">
      <template v-if="last.kind === 'success'">
        <div class="h5 mb-0">✓ {{ last.name }}</div>
        <small>Checked in at {{ last.time }}</small>
      </template>
      <template v-else-if="last.kind === 'already'">
        <div class="h5 mb-0">{{ last.name }} is already checked in</div>
        <small>since {{ last.time }}</small>
      </template>
      <template v-else>
        <div class="h5 mb-0">✕ Not checked in</div>
        <small>{{ last.message }}</small>
      </template>
    </div>

    <details class="mt-3">
      <summary class="small text-body-secondary">No camera? Paste a ticket code (testing)</summary>
      <form class="input-group mt-2" @submit.prevent="submitTyped">
        <input v-model="typedCode" class="form-control" placeholder="qr_token" aria-label="Ticket code" />
        <button class="btn btn-outline-primary" :disabled="busy">Check in</button>
      </form>
    </details>

    <h2 class="h6 text-uppercase text-body-secondary mt-4">Recent scans</h2>
    <p v-if="!recent.length" class="small text-body-secondary">Nothing scanned yet.</p>
    <ul class="list-group">
      <li v-for="r in recent" :key="r.at" class="list-group-item d-flex justify-content-between small">
        <span>{{ r.kind === 'error' ? r.message : r.name }}</span>
        <span
          class="badge align-self-center"
          :class="{ 'text-bg-success': r.kind === 'success', 'text-bg-warning': r.kind === 'already', 'text-bg-danger': r.kind === 'error' }"
        >
          {{ r.kind === 'success' ? 'in' : r.kind === 'already' ? 'repeat' : 'error' }}
        </span>
      </li>
    </ul>
  </main>
</template>
