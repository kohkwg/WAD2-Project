<script setup>
// Feature 3: participant's ticket. Shows their personal QR for staff to scan.
// Mostly BOILERPLATE (loading + layout). The one interesting bit is the small
// live subscription so the page flips to "checked in" the moment staff scan it.
import { onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import QrCode from '@/components/checkin/QrCode.vue'
import Barcode from '@/components/checkin/Barcode.vue'
import { supabase } from '@/utils/supabase'
import { formatTime, getEvent } from '@/utils/checkin'

const route = useRoute()
const eventId = route.params.eventId

const loading = ref(true)
const error = ref('')
const event = ref(null)
const registration = ref(null) // { id, status, qr_token, ticket_code }
const checkIn = ref(null) // check_ins row once they're in
let channel = null
let poll = null

// Live: when staff scan this ticket, show the confirmation without a refresh.
// Subscribe BEFORE reading check_ins and wait for SUBSCRIBED (same pattern as the
// attendance dashboard), so a check-in during the load isn't missed. Gives up
// waiting after 10 s so a Realtime outage doesn't block the page.
function subscribe(regId) {
  return new Promise((resolve) => {
    const giveUp = setTimeout(resolve, 10_000)
    channel = supabase
      .channel(`ticket-${regId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'check_ins', filter: `registration_id=eq.${regId}` },
        (payload) => (checkIn.value = payload.new),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(giveUp)
          resolve()
        }
      })
  })
}

async function loadCheckIn(regId) {
  const { data } = await supabase.from('check_ins').select('*').eq('registration_id', regId).maybeSingle()
  if (data) checkIn.value = data
}

onMounted(async () => {
  try {
    const { data: auth } = await supabase.auth.getUser()
    event.value = await getEvent(eventId)

    // RLS only returns the signed-in user's own registration here
    const { data: reg, error: regErr } = await supabase
      .from('registrations')
      .select('id, status, qr_token, ticket_code')
      .eq('event_id', eventId)
      .eq('user_id', auth.user.id)
      .maybeSingle()
    if (regErr) throw regErr
    registration.value = reg
    if (!reg) return

    await subscribe(reg.id)
    await loadCheckIn(reg.id)
    // Fallback if Realtime is slow to start or drops: re-check every 5 s until checked in
    poll = setInterval(() => (checkIn.value ? clearInterval(poll) : loadCheckIn(reg.id)), 5_000)
  } catch (e) {
    error.value = e.message ?? 'Could not load your ticket.'
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  clearInterval(poll)
  if (channel) supabase.removeChannel(channel)
})
</script>

<template>
  <div class="container py-4 ticket-page text-center">
    <RouterLink to="/my-rsvps" class="small d-block text-start mb-3">&larr; My RSVPs</RouterLink>

    <div v-if="loading" class="py-5">
      <div class="spinner-border" role="status"><span class="visually-hidden">Loading…</span></div>
    </div>

    <div v-else-if="error" class="alert alert-danger" role="alert">{{ error }}</div>

    <template v-else>
      <div class="ticket-heading"><span class="ticket-kicker">Your ticket</span><h1 class="h3 mb-1">{{ event?.title }}</h1>
      <p class="text-body-secondary small mb-4">
        {{ event && new Date(event.starts_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) }}
      </p></div>

      <div v-if="!registration" class="alert alert-secondary">You haven't registered for this event.</div>

      <div v-else-if="registration.status !== 'confirmed'" class="alert alert-warning">
        Your registration is <strong>{{ registration.status }}</strong>. Your ticket appears once it's confirmed.
      </div>

      <template v-else>
        <div v-if="checkIn" class="alert alert-success" role="status">
          ✓ Checked in at {{ formatTime(checkIn.checked_in_at) }}
        </div>
        <div class="ticket-stock align-items-center" :class="{ 'opacity-50': checkIn }">
          <QrCode :value="registration.qr_token" :size="280" label="Your personal check-in QR code" />
          <Barcode
            v-if="registration.ticket_code"
            :value="registration.ticket_code"
            :label="`Your ticket barcode, code ${registration.ticket_code}`"
            class="mt-2"
          />
          <p class="small text-body-secondary mt-3 mb-0">Show this to staff at the entrance. They can scan the QR or the barcode, or type the code.</p>
        </div>
        <RouterLink :to="`/events/${eventId}/check-in`" class="btn btn-link mt-3">
          Or scan the venue QR yourself
        </RouterLink>
      </template>
    </template>
  </div>
</template>

<style scoped>
.ticket-page{max-width:600px}.ticket-heading{padding:1.2rem 1.25rem;margin-bottom:1rem;border-radius:22px 22px 8px 8px;background:var(--bookedz-cream,#fff9ef);text-align:left}.ticket-kicker{display:block;margin-bottom:.55rem;color:#6b6056;font-size:.78rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase}.ticket-stock{position:relative;display:flex;padding:1.5rem 1rem 1.25rem;border:1px solid var(--bookedz-border,#e5ded2);border-radius:8px 8px 22px 22px;background:#fff;flex-direction:column;box-shadow:0 10px 30px rgba(41,45,50,.07)}.ticket-stock:before,.ticket-stock:after{position:absolute;top:-11px;width:22px;height:22px;border-radius:50%;background:var(--bookedz-cream,#fff9ef);content:''}.ticket-stock:before{left:-12px;border-right:1px solid var(--bookedz-border,#e5ded2)}.ticket-stock:after{right:-12px;border-left:1px solid var(--bookedz-border,#e5ded2)}.ticket-page :deep(.qr-code){width:min(280px,100%);padding:10px;border:1px solid #eee7dc;border-radius:12px;background:#fff}.ticket-page :deep(.barcode){width:min(360px,100%);padding:6px 10px}.ticket-page .btn-outline-primary{--bs-btn-color:var(--bookedz-coral-dark,#aa3e2c);--bs-btn-border-color:var(--bookedz-coral-dark,#aa3e2c);--bs-btn-hover-bg:var(--bookedz-coral-dark,#aa3e2c);--bs-btn-hover-border-color:var(--bookedz-coral-dark,#aa3e2c)}.ticket-page .alert{border-radius:14px}
@media(max-width:575.98px){.ticket-heading{padding:1rem;border-radius:18px 18px 8px 8px}.ticket-stock{padding:1rem .5rem;border-radius:8px 8px 18px 18px}}
</style>
