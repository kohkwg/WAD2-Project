<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import HangoutSummary from './HangoutSummary.vue'
import HangoutJoin from './HangoutJoin.vue'
import VenueMap from '../VenueMap.vue'
import TimePanel from './TimePanel.vue'
import PlanPanel from './PlanPanel.vue'
import GoPanel from './GoPanel.vue'
import { getEvent, getRsvpsForEvent, ACTIVE_STATUSES } from '../../utils/api.js'

// What /events/:id/rsvp shows for hangout-type events. Group hangouts get the Time
// tools; Plan and On the day are added in the following integration steps.
const props = defineProps({ event: { type: Object, required: true }, myRsvps: { type: Array, default: () => [] } })
const current = ref(props.event)
const members = ref([])
const copyState = ref('')
watch(() => props.event, value => { current.value = value })

const isHost = computed(() => Boolean(current.value.isMine))
const myRsvp = computed(() => props.myRsvps.find(r => r.eventId === current.value.id && ACTIVE_STATUSES.includes(r.status)) || null)
const inviteLink = computed(() => current.value.hangout?.inviteToken ? `${location.origin}/j/${current.value.hangout.inviteToken}` : '')
const pendingCount = computed(() => (current.value.pendingCount || 0) + (current.value.waitlistCount || 0))
const joinedStatus = ref('')
// Only confirmed members share and see free times; pending or waitlisted people wait.
const isMember = computed(() => (joinedStatus.value || myRsvp.value?.status) === 'confirmed')

async function loadMembers() {
  if (!isHost.value) return
  try {
    members.value = (await getRsvpsForEvent(current.value.id)).filter(r => r.status === 'confirmed')
  } catch { members.value = [] }
}
async function refresh() {
  current.value = await getEvent(current.value.id)
  await loadMembers()
}
loadMembers()

async function copyInvite() {
  try { await navigator.clipboard.writeText(inviteLink.value); copyState.value = 'Invite link copied.' }
  catch { copyState.value = 'Couldn’t copy automatically. Select the link and copy it.' }
}
</script>

<template>
  <div class="hangout-page">
    <RouterLink to="/discover" class="hangout-back">← Discover</RouterLink>
    <div class="hangout-grid">
      <div class="workspace-panel">
        <HangoutSummary :event="current" />
        <div v-if="current.venue?.lat" class="mt-3"><VenueMap :lat="current.venue.lat" :lng="current.venue.lng" /></div>
      </div>
      <aside class="hangout-side">
        <section v-if="isHost" class="workspace-panel" aria-labelledby="host-tools-title">
          <h2 id="host-tools-title" class="section-heading">You’re hosting</h2>
          <template v-if="inviteLink">
            <label class="form-label" for="hangout-invite-link">Private invite link</label>
            <div class="d-flex gap-2"><input id="hangout-invite-link" class="form-control" :value="inviteLink" readonly @focus="$event.target.select()"><button type="button" class="btn btn-outline-secondary" @click="copyInvite">Copy</button></div>
            <p class="form-text" role="status">{{ copyState }}</p>
          </template>
          <h3 class="people-heading">Going ({{ members.length + 1 }})</h3>
          <ul class="people-list">
            <li><span class="avatar" aria-hidden="true">★</span> You (host)</li>
            <li v-for="m in members" :key="m.id"><span class="avatar" aria-hidden="true">{{ (m.name || '?').charAt(0) }}</span> {{ m.name }}</li>
          </ul>
          <p v-if="pendingCount" class="small text-body-secondary mb-0">{{ pendingCount }} waiting for a place or your approval. <RouterLink :to="`/organiser/events/${current.id}/rsvps`">Manage RSVPs</RouterLink></p>
        </section>
        <section v-else-if="current.hangout?.mode !== 'solo'" class="workspace-panel" aria-labelledby="join-title">
          <h2 id="join-title" class="section-heading">Join this hangout</h2>
          <HangoutJoin :event="current" :my-rsvp="myRsvp" @joined="rsvp => { joinedStatus = rsvp.status; refresh() }" />
        </section>
        <section class="workspace-panel next-steps" aria-labelledby="next-title">
          <h2 id="next-title" class="section-heading">What happens next</h2>
          <ol>
            <li :class="{ done: current.hangout?.stage !== 'collecting' }">{{ current.hangout?.mode === 'group' ? 'Everyone marks when they’re free; the host locks a time.' : 'Time is set.' }}</li>
            <li>The host shapes a plan from real Bookedz events and places.</li>
            <li>Members vote Keep or Swap, then the host confirms.</li>
          </ol>
          <p class="small text-body-secondary mb-0">Nothing here is booked or reserved.</p>
        </section>
      </aside>
    </div>
    <section v-if="current.hangout?.mode === 'group'" class="hangout-time" aria-labelledby="hangout-time-heading">
      <h2 id="hangout-time-heading" class="hangout-section-title">Find a time</h2>
      <TimePanel v-if="isHost || isMember" :key="current.id" :event-id="current.id" @changed="refresh" />
      <p v-else class="workspace-panel mb-0">Join this hangout to mark when you’re free and see the group’s overlap.</p>
    </section>
    <section class="hangout-time" aria-labelledby="hangout-plan-heading">
      <h2 id="hangout-plan-heading" class="hangout-section-title">Shape the plan</h2>
      <p v-if="!(isHost || isMember)" class="workspace-panel mb-0">Join this hangout to see the plan and vote on stops.</p>
      <p v-else-if="!current.hangout?.lockedSlot" class="workspace-panel mb-0">The plan opens once the host locks a time.</p>
      <PlanPanel v-else :key="`${current.id}-${current.hangout.lockedSlot.startTime}`" :event-id="current.id" @changed="refresh" />
    </section>
    <section v-if="(isHost || isMember) && current.hangout?.lockedSlot" class="hangout-time" aria-labelledby="hangout-go-heading">
      <h2 id="hangout-go-heading" class="hangout-section-title">On the day</h2>
      <GoPanel :key="`${current.hangout.stage}-${current.hangout.plan?.changedAt}-${current.hangout.plan?.finalizedAt}`" :event="current" @changed="refresh" />
    </section>
  </div>
</template>

<style scoped>
.hangout-back { display: inline-flex; align-items: center; min-height: 44px; margin-bottom: 8px; font-weight: 700; color: var(--bookedz-primary-dark); text-decoration: none; }
.hangout-grid { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 20px; align-items: start; }
.hangout-side { display: grid; gap: 20px; }
.people-heading { font-size: 1rem; margin: 1rem 0 .5rem; }
.people-list { list-style: none; padding: 0; margin: 0 0 .75rem; display: grid; gap: 6px; }
.people-list li { display: flex; align-items: center; gap: 10px; }
.avatar { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: var(--bookedz-teal-soft); color: var(--bookedz-teal-ink); font-weight: 800; text-transform: uppercase; }
.next-steps ol { padding-left: 1.2rem; display: grid; gap: 6px; }
.hangout-time { margin-top: 28px; }
.hangout-section-title { margin-bottom: 14px; }
.next-steps li.done { color: var(--bookedz-muted); text-decoration: line-through; }
@media (max-width: 991.98px) { .hangout-grid { grid-template-columns: 1fr; } }
</style>
