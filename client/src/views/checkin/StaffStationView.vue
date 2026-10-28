<script setup>
// Feature 3: staff check-in station. Scan a participant's personal QR or ticket
// barcode (from their My Ticket page), type the code, or find them by name/email.
import { onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import QrScanner from '@/components/checkin/QrScanner.vue'
import AttendeeSearch from '@/components/checkin/AttendeeSearch.vue'
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
async function onScan(code, method = 'personal_qr') {
  if (busy.value) return
  busy.value = true
  try {
    const sentAt = Date.now()
    const row = await staffCheckIn(eventId, code.trim(), method)

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
  return last.value.kind !== 'error' // lets the name search mark the person as in
}

// Camera: QR codes are personal tickets; CODE128 is the ticket barcode
function onCameraScan(code, format) {
  onScan(code, format === 'CODE_128' ? 'barcode' : 'personal_qr')
}

// Typed ticket code (the number under the barcode) or a pasted qr_token
function submitTyped() {
  if (typedCode.value.trim()) onScan(typedCode.value, 'manual')
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
  <div class="container py-4 staff-page">
    <RouterLink :to="`/organiser/events/${eventId}/manage`" class="small d-block mb-3">&larr; Manage event</RouterLink>
    <header class="staff-heading d-flex justify-content-between align-items-start gap-2 mb-4">
      <div>
        <h1 class="h4 mb-1">Check-in station</h1>
        <p class="text-body-secondary small mb-0">{{ event?.title ?? '' }}</p>
      </div>
      <RouterLink :to="`/organiser/events/${eventId}/attendance`" class="btn btn-sm btn-outline-primary text-nowrap">
        Attendance
      </RouterLink>
    </header>

    <section class="scanner-card mb-3" aria-label="Scan ticket"><h2 class="h5 mb-1">Scan a ticket</h2><p class="small text-body-secondary mb-3">Hold the QR code or barcode in the camera frame.</p><QrScanner :formats="['QR_CODE', 'CODE_128']" @decoded="onCameraScan" /></section>

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

    <section class="manual-card mt-3">
      <h2 class="h6 mb-3">Manual check-in</h2>
      <AttendeeSearch :event-id="eventId" :busy="busy" @pick="async (id, done) => done(await onScan(id, 'manual'))" />
      <form class="mt-3" @submit.prevent="submitTyped">
        <label for="typed-code" class="form-label small text-body-secondary">Or type the ticket code under the barcode</label>
        <div class="input-group">
          <input id="typed-code" v-model="typedCode" class="form-control" placeholder="e.g. 2C3980B894" autocomplete="off" />
          <button class="btn btn-outline-primary" :disabled="busy">Check in</button>
        </div>
      </form>
    </section>

    <h2 class="h5 attendance-section-title mt-4">Recent scans</h2>
    <p v-if="!recent.length" class="small text-body-secondary">Nothing scanned yet.</p>
    <ul class="list-group attendance-list">
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
  </div>
</template>

<style scoped>
.staff-page{max-width:780px}.scanner-card,.manual-card{padding:1.25rem;border:1px solid var(--bookedz-border,#e5ded2);border-radius:22px;background:#fffdfa}.scanner-card{background:var(--bookedz-cream,#fff9ef)}.manual-card{margin-top:1.25rem!important}.staff-page .form-control,.staff-page .form-select{border-color:var(--bookedz-border,#e5ded2);border-radius:12px;min-height:44px}.staff-page .btn{min-height:42px;border-radius:12px}.staff-page .btn-primary{--bs-btn-bg:var(--bookedz-coral-dark,#aa3e2c);--bs-btn-border-color:var(--bookedz-coral-dark,#aa3e2c);--bs-btn-color:#fff;--bs-btn-hover-bg:#8f3022;--bs-btn-hover-border-color:#8f3022;--bs-btn-hover-color:#fff}.staff-page .btn-outline-primary{--bs-btn-color:var(--bookedz-coral-dark,#aa3e2c);--bs-btn-border-color:var(--bookedz-coral-dark,#aa3e2c);--bs-btn-hover-bg:var(--bookedz-coral-dark,#aa3e2c);--bs-btn-hover-border-color:var(--bookedz-coral-dark,#aa3e2c)}.staff-page .alert{border-radius:14px}.staff-page :deep(.qr-scanner){border:5px solid #292d32;border-radius:16px!important;min-height:240px}.staff-page :deep(.qr-scanner video){object-fit:cover}.staff-page :deep(.qr-scanner canvas){max-width:100%}
@media(max-width:575.98px){.scanner-card,.manual-card{padding:1rem;border-radius:18px}.staff-heading{align-items:flex-start}.staff-heading>.btn{font-size:.8rem;padding:.45rem .65rem}}
</style>
