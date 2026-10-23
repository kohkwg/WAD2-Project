<script setup>
// Feature 3: participant self check-in by scanning the venue QR.
// Two ways in:
//   1. In-app: open this page, the camera scans the venue QR.
//   2. Phone camera: the venue QR is a URL to this page with ?s=<secret>, so it
//      opens here and checks in straight away.
import { onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import QrScanner from '@/components/checkin/QrScanner.vue'
import {
  formatTime,
  getDeviceId,
  getEvent,
  getLocation,
  selfCheckIn,
  wasAlreadyCheckedIn,
} from '@/utils/checkin'

const route = useRoute()
const router = useRouter()
const eventId = route.params.eventId

const event = ref(null)
const step = ref('scan') // 'scan' | 'working' | 'done' | 'error'
const message = ref('')
const result = ref(null) // { row, already }

// ===== HUXLEY: core logic ===================================================
// secretFromScan(text)
// The venue QR holds a URL like https://<site>/events/<eventId>/check-in?s=<secret>.
// Pull out the secret, and reject it if it's for a DIFFERENT event than the page
// we're on (e.g. someone scanned the QR for the hall next door).
// Returns the secret string, or throws an Error with a friendly message.
// ============================================================================
function secretFromScan(text) {
  let url
  try {
    url = new URL(text)
  } catch {
    throw new Error("That isn't a Bookedz venue QR code.")
  }
  const match = url.pathname.match(/^\/events\/([^/]+)\/check-in$/)
  const secret = url.searchParams.get('s')
  if (!match || !secret) throw new Error("That isn't a Bookedz venue QR code.")
  if (match[1] !== eventId) throw new Error('That QR code is for a different event.')
  return secret
}

// ===== HUXLEY: core logic ===================================================
// checkIn(secret)
// The whole self check-in flow, in order:
//   1. device id: same random id every time on this phone (fraud: shared phone)
//   2. location: ask the browser; null if refused (fraud: far from venue)
//   3. call self_check_in. The DATABASE does the real checks: is the secret the
//      current one, does this user have a CONFIRMED registration. It also stops
//      duplicates (one row per registration).
//   4. show the result: "checked in", "already checked in at …", or the error.
// Note `sentAt` is taken BEFORE the request so wasAlreadyCheckedIn can compare.
// Common errors from the DB, shown as-is:
//   "Invalid or expired check-in code"  -> the screen rotated; scan again
//   "You do not have a confirmed registration for this event"
// ============================================================================
async function checkIn(secret) {
  step.value = 'working'
  message.value = 'Getting your location…'
  try {
    const deviceId = getDeviceId()
    const loc = await getLocation()

    message.value = 'Checking you in…'
    const sentAt = Date.now()
    const row = await selfCheckIn(eventId, secret, deviceId, loc?.lat ?? null, loc?.lng ?? null)

    result.value = { row, already: wasAlreadyCheckedIn(row, sentAt), noLocation: !loc }
    step.value = 'done'
  } catch (e) {
    message.value = e.message
    step.value = 'error'
  } finally {
    // drop ?s= from the address bar so a refresh or shared link doesn't reuse it
    if (route.query.s) router.replace({ query: {} })
  }
}

function onDecoded(text) {
  try {
    checkIn(secretFromScan(text))
  } catch (e) {
    message.value = e.message
    step.value = 'error'
  }
}

function scanAgain() {
  message.value = ''
  result.value = null
  step.value = 'scan'
}

onMounted(async () => {
  getEvent(eventId)
    .then((e) => (event.value = e))
    .catch(() => {})
  // opened from the phone camera: the secret is already in the URL
  if (route.query.s) checkIn(String(route.query.s))
})
</script>

<template>
  <div class="container py-4 self-checkin-page">
    <RouterLink to="/my-rsvps" class="small d-block mb-3">&larr; My RSVPs</RouterLink>
    <header class="checkin-heading"><span class="ticket-kicker">At the venue</span><h1 class="h3 mb-1">Check in</h1>
    <p class="text-body-secondary small mb-4">{{ event?.title ?? '' }}</p></header>

    <section v-if="step === 'scan'" class="checkin-card">
      <p>Point your camera at the QR code on the screen at the entrance.</p>
      <QrScanner @decoded="onDecoded" />
      <p class="small text-body-secondary mt-3">
        We'll ask for your location to confirm you're at the venue.
      </p>
    </section>

    <div v-else-if="step === 'working'" class="text-center py-5">
      <div class="spinner-border mb-3" role="status" aria-hidden="true"></div>
      <p>{{ message }}</p>
    </div>

    <template v-else-if="step === 'done'">
      <div class="alert" :class="result.already ? 'alert-info' : 'alert-success'" role="status">
        <h2 class="h5 mb-1">{{ result.already ? "You're already checked in" : "You're checked in!" }}</h2>
        <p class="mb-0">at {{ formatTime(result.row.checked_in_at) }}</p>
      </div>
      <p v-if="result.noLocation" class="small text-body-secondary">
        Location wasn't shared, so staff may ask to see your ticket.
      </p>
      <RouterLink :to="`/events/${eventId}/ticket`" class="btn btn-outline-primary w-100">View my ticket</RouterLink>
    </template>

    <template v-else>
      <div class="alert alert-danger" role="alert">{{ message }}</div>
      <button class="btn btn-primary w-100" @click="scanAgain">Scan again</button>
    </template>
  </div>
</template>

<style scoped>
.self-checkin-page{max-width:600px}.checkin-heading{display:block;padding:1.15rem 1.25rem;margin-bottom:1rem;border-radius:22px;background:var(--bookedz-cream,#fff9ef)}.checkin-card{padding:1.25rem;border:1px solid var(--bookedz-border,#e5ded2);border-radius:22px;background:#fffdfa}.self-checkin-page :deep(.qr-scanner){border:5px solid #292d32;border-radius:16px!important}.self-checkin-page .alert{border-radius:14px}.self-checkin-page .btn{min-height:46px;border-radius:12px}.self-checkin-page .btn-primary{--bs-btn-bg:var(--bookedz-coral-dark,#aa3e2c);--bs-btn-border-color:var(--bookedz-coral-dark,#aa3e2c);--bs-btn-color:#fff;--bs-btn-hover-bg:#8f3022;--bs-btn-hover-border-color:#8f3022;--bs-btn-hover-color:#fff}.self-checkin-page .btn-outline-primary{--bs-btn-color:var(--bookedz-coral-dark,#aa3e2c);--bs-btn-border-color:var(--bookedz-coral-dark,#aa3e2c);--bs-btn-hover-bg:var(--bookedz-coral-dark,#aa3e2c);--bs-btn-hover-border-color:var(--bookedz-coral-dark,#aa3e2c)}
</style>
