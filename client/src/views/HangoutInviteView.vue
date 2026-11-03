<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import HangoutSummary from '../components/hangout/HangoutSummary.vue'
import HangoutJoin from '../components/hangout/HangoutJoin.vue'
import { getHangoutInvite, getMyRsvps, ACTIVE_STATUSES } from '../utils/api.js'

// /j/:token: the private invite landing a friend opens from a chat. It previews the
// hangout without joining; joining is an explicit button press.
const route = useRoute()
const event = ref(null)
const myRsvps = ref([])
const loading = ref(true)
const errorMessage = ref('')
const joined = ref(false)
let request = 0

async function load(token) {
  const ticket = ++request
  loading.value = true
  errorMessage.value = ''
  try {
    const [invite, rsvps] = await Promise.all([getHangoutInvite(token), getMyRsvps().catch(() => [])])
    if (ticket !== request) return
    event.value = invite
    myRsvps.value = rsvps
  } catch (error) {
    if (ticket === request) errorMessage.value = error.message
  } finally {
    if (ticket === request) loading.value = false
  }
}
watch(() => route.params.token, token => load(String(token)), { immediate: true })
// Live previews report the viewer's own status; the demo looks it up in My RSVPs.
const myRsvp = computed(() => (event.value?.myStatus && ACTIVE_STATUSES.includes(event.value.myStatus) ? { status: event.value.myStatus }
  : myRsvps.value.find(r => r.eventId === event.value?.id && ACTIVE_STATUSES.includes(r.status)) || null))
</script>

<template>
  <div class="invite-page col-12 col-lg-8 col-xl-7 mx-auto">
    <div v-if="loading" class="text-center my-5" role="status"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span> Opening your invite…</div>
    <div v-else-if="errorMessage" class="workspace-panel" role="alert">
      <h1 class="h3">This invite can’t be opened</h1>
      <p class="mb-3">{{ errorMessage }}</p>
      <div class="d-flex gap-2 flex-wrap"><button type="button" class="btn btn-primary" @click="load(String(route.params.token))">Try again</button><RouterLink to="/discover" class="btn btn-outline-secondary">Go to Discover</RouterLink></div>
    </div>
    <template v-else-if="event">
      <p class="invite-kicker">You’re invited</p>
      <div class="workspace-panel">
        <HangoutSummary :event="event" />
        <hr class="invite-rule">
        <p v-if="event.isMine" class="mb-0">You’re the host of this hangout.</p>
        <HangoutJoin v-else :event="event" :my-rsvp="myRsvp" :invite-token="String(route.params.token)" @joined="joined = true" />
        <RouterLink v-if="joined || myRsvp || event.isMine" :to="`/events/${event.id}/rsvp`" class="btn event-cta mt-3">Open the hangout</RouterLink>
      </div>
    </template>
  </div>
</template>

<style scoped>
.invite-kicker { display: inline-block; margin: 0 0 12px; padding: 4px 12px; background: var(--bookedz-pink-soft); color: var(--bookedz-pink-ink); font-size: .75rem; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; transform: rotate(-1.5deg); }
.invite-rule { border-top: 1px dashed var(--bookedz-border); opacity: 1; margin: 1.25rem 0; }
@media (prefers-reduced-motion: reduce) { .invite-kicker { transform: none; } }
</style>
