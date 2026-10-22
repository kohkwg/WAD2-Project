<script setup>
// Feature 3: participant's ticket. Shows their personal QR for staff to scan.
// Mostly BOILERPLATE (loading + layout). The one interesting bit is the small
// live subscription so the page flips to "checked in" the moment staff scan it.
import { onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import QrCode from '@/components/checkin/QrCode.vue'
import { supabase } from '@/utils/supabase'
import { formatTime, getEvent } from '@/utils/checkin'

const route = useRoute()
const eventId = route.params.eventId

const loading = ref(true)
const error = ref('')
const event = ref(null)
const registration = ref(null) // { id, status, qr_token }
const checkIn = ref(null) // check_ins row once they're in
let channel = null

onMounted(async () => {
  try {
    const { data: auth } = await supabase.auth.getUser()
    event.value = await getEvent(eventId)

    // RLS only returns the signed-in user's own registration here
    const { data: reg, error: regErr } = await supabase
      .from('registrations')
      .select('id, status, qr_token')
      .eq('event_id', eventId)
      .eq('user_id', auth.user.id)
      .maybeSingle()
    if (regErr) throw regErr
    registration.value = reg
    if (!reg) return

    const { data: ci } = await supabase.from('check_ins').select('*').eq('registration_id', reg.id).maybeSingle()
    checkIn.value = ci

    // Live: when staff scan this ticket, show the confirmation without a refresh
    channel = supabase
      .channel(`ticket-${reg.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'check_ins', filter: `registration_id=eq.${reg.id}` },
        (payload) => (checkIn.value = payload.new),
      )
      .subscribe()
  } catch (e) {
    error.value = e.message ?? 'Could not load your ticket.'
  } finally {
    loading.value = false
  }
})

onUnmounted(() => channel && supabase.removeChannel(channel))
</script>

<template>
  <main class="container py-4 text-center" style="max-width: 480px">
    <RouterLink to="/login" class="small d-block text-start mb-3">&larr; Back</RouterLink>

    <div v-if="loading" class="py-5">
      <div class="spinner-border" role="status"><span class="visually-hidden">Loading…</span></div>
    </div>

    <div v-else-if="error" class="alert alert-danger" role="alert">{{ error }}</div>

    <template v-else>
      <h1 class="h4 mb-1">{{ event?.title }}</h1>
      <p class="text-body-secondary small mb-4">
        {{ event && new Date(event.starts_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) }}
      </p>

      <div v-if="!registration" class="alert alert-secondary">You haven't registered for this event.</div>

      <div v-else-if="registration.status !== 'confirmed'" class="alert alert-warning">
        Your registration is <strong>{{ registration.status }}</strong>. Your ticket appears once it's confirmed.
      </div>

      <template v-else>
        <div v-if="checkIn" class="alert alert-success" role="status">
          ✓ Checked in at {{ formatTime(checkIn.checked_in_at) }}
        </div>
        <div class="card card-body align-items-center" :class="{ 'opacity-50': checkIn }">
          <QrCode :value="registration.qr_token" :size="280" label="Your personal check-in QR code" />
          <p class="small text-body-secondary mt-3 mb-0">Show this to staff at the entrance.</p>
        </div>
        <RouterLink :to="`/events/${eventId}/check-in`" class="btn btn-link mt-3">
          Or scan the venue QR yourself
        </RouterLink>
      </template>
    </template>
  </main>
</template>
