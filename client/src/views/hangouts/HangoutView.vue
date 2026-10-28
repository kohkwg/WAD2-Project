<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import {
  getHangout, lockSlot, setArrival, voteOnStop,
  suggestSlots, generateItineraryFor, applyVotes, lookUpArrival,
} from '../../utils/api.js'
import PlaceholderPanel from '../../components/planning/PlaceholderPanel.vue'

// One hangout (group or solo): people, availability, time, itinerary and late join.
// Sections backed by unbuilt algorithms show a placeholder note instead of failing.

const CURRENT_USER_ID = 'u1' // demo user; live mode will read it from the session

const route = useRoute()
const hangout = ref(null)
const loading = ref(true)
const errorMessage = ref('')
const notices = ref({}) // section → placeholder or error text

const isGroup = computed(() => hangout.value?.mode === 'group')
const isHost = computed(() => hangout.value?.hostId === CURRENT_USER_ID)
const inviteLink = computed(() => hangout.value ? `${window.location.origin}/join/${hangout.value.inviteCode}` : '')
const stops = computed(() => hangout.value?.itinerary?.stops || [])

const slots = ref([])
const manualSlot = ref({ start: '', end: '' })
const arrivalTime = ref('')
const arrivalResult = ref(null)
const busy = ref('')

const SOURCE_LABELS = { gcal: 'Google Calendar', grid: 'Manual grid' }
const KIND_LABELS = { activity: 'Activity', meal: 'Meal', transit: 'Travel' }

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit' })
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

function voteTotal(stop, value) {
  return stop.votes.filter((v) => v.value === value).length
}

function myVote(stop) {
  return stop.votes.find((v) => v.userId === CURRENT_USER_ID)?.value || 0
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    hangout.value = await getHangout(route.params.id)
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    loading.value = false
  }
}
onMounted(load)

// Runs one action for a section; a NOT_IMPLEMENTED stub becomes a placeholder note.
async function run(section, action) {
  if (busy.value) return
  busy.value = section
  notices.value = { ...notices.value, [section]: '' }
  try {
    return await action()
  } catch (error) {
    const text = error.code === 'NOT_IMPLEMENTED'
      ? `Placeholder: ${error.message}. The rest of this flow works with demo data.`
      : error.message
    notices.value = { ...notices.value, [section]: text }
  } finally {
    busy.value = ''
  }
}

const findTimes = () => run('slots', async () => { slots.value = await suggestSlots(hangout.value.id) })

const lockManualSlot = () => run('slots', async () => {
  if (!manualSlot.value.start || !manualSlot.value.end) throw new Error('Choose a start and end time')
  hangout.value = await lockSlot(hangout.value.id, new Date(manualSlot.value.start).toISOString(), new Date(manualSlot.value.end).toISOString())
})

const autoGenerate = () => run('itinerary', async () => {
  await generateItineraryFor(hangout.value.id)
  await load()
})

const vote = (stop, value) => run('itinerary', async () => {
  const updated = await voteOnStop(hangout.value.id, stop.id, myVote(stop) === value ? -value : value)
  stop.votes = updated.votes
})

const resolve = () => run('itinerary', async () => {
  await applyVotes(hangout.value.id)
  await load()
})

const findGroup = () => run('late', async () => {
  if (!arrivalTime.value) throw new Error('Choose when you will arrive')
  const arrivalAt = new Date(arrivalTime.value).toISOString()
  await setArrival(hangout.value.id, arrivalAt)
  arrivalResult.value = await lookUpArrival(hangout.value.id, arrivalAt)
})
</script>

<template>
  <div v-if="loading" class="text-center my-5" role="status" aria-live="polite">
    <div class="spinner-border text-primary" aria-hidden="true"></div>
    <span class="visually-hidden">Loading hangout…</span>
  </div>

  <div v-else-if="errorMessage" class="alert alert-danger" role="alert">
    {{ errorMessage }}
    <button type="button" class="btn btn-sm btn-outline-danger ms-2" @click="load">Retry</button>
  </div>

  <template v-else>
    <header class="mb-4">
      <span class="badge mb-2" :class="isGroup ? 'text-bg-primary' : 'text-bg-secondary'">{{ isGroup ? 'Group hangout' : 'Solo plan' }}</span>
      <h1 class="mb-1">{{ hangout.title }}</h1>
      <p class="text-secondary mb-0">
        {{ hangout.dateFrom === hangout.dateTo ? hangout.dateFrom : `${hangout.dateFrom} to ${hangout.dateTo}` }}
        <template v-if="hangout.areaName"> · {{ hangout.areaName }}</template>
        <template v-if="hangout.vibe.length"> · {{ hangout.vibe.join(', ') }}</template>
      </p>
    </header>

    <div class="row g-4">
      <div class="col-12 col-lg-4">
        <!-- People (group only) -->
        <section v-if="isGroup" class="card mb-4" aria-labelledby="people-title">
          <div class="card-body">
            <h2 id="people-title" class="h5">People</h2>
            <ul class="list-unstyled mb-3">
              <li v-for="member in hangout.members" :key="member.userId" class="d-flex justify-content-between gap-2 py-1">
                <span>{{ member.name }}<span v-if="member.role === 'host'" class="badge text-bg-light ms-1">Host</span></span>
                <span class="small text-secondary">{{ SOURCE_LABELS[member.availabilitySource] || 'Not shared yet' }}</span>
              </li>
            </ul>
            <label class="form-label small" for="invite-link">Invite link</label>
            <input id="invite-link" class="form-control form-control-sm" type="text" :value="inviteLink" readonly @focus="$event.target.select()" />
          </div>
        </section>

        <!-- Availability -->
        <section id="availability" class="mb-4" aria-labelledby="availability-title">
          <h2 id="availability-title" class="h5">Your availability</h2>
          <PlaceholderPanel
            title="Google Calendar sync"
            description="Connect Google Calendar to share busy times for these dates only."
            waiting-on="Google Calendar freeBusy integration"
          >
            <button type="button" class="btn btn-sm btn-outline-secondary" disabled>Connect Google Calendar</button>
          </PlaceholderPanel>
          <div class="mt-3">
            <PlaceholderPanel
              title="Availability grid"
              description="A 30-minute grid for each day in the range. Tap or drag to mark when you are free."
              waiting-on="AvailabilityGrid component + saveAvailability()"
            />
          </div>
        </section>
      </div>

      <div class="col-12 col-lg-8">
        <!-- Time -->
        <section class="card mb-4" aria-labelledby="time-title">
          <div class="card-body">
            <h2 id="time-title" class="h5">When</h2>
            <p v-if="hangout.lockedSlotStart" class="mb-0" data-testid="locked-slot">
              Locked: <strong>{{ formatDateTime(hangout.lockedSlotStart) }} – {{ formatTime(hangout.lockedSlotEnd) }}</strong>
            </p>
            <template v-else>
              <button v-if="isGroup" type="button" class="btn btn-outline-primary btn-sm mb-3" :disabled="busy === 'slots'" @click="findTimes">Find the best times</button>
              <ul v-if="slots.length" class="list-group mb-3">
                <li v-for="slot in slots" :key="slot.startsAt" class="list-group-item">{{ formatDateTime(slot.startsAt) }} – {{ formatTime(slot.endsAt) }} · {{ slot.freeUserIds.length }} free</li>
              </ul>
              <div v-if="isHost" class="row g-2 align-items-end">
                <div class="col-sm-5"><label class="form-label small" for="slot-start">Start</label><input id="slot-start" v-model="manualSlot.start" class="form-control form-control-sm" type="datetime-local" /></div>
                <div class="col-sm-5"><label class="form-label small" for="slot-end">End</label><input id="slot-end" v-model="manualSlot.end" class="form-control form-control-sm" type="datetime-local" /></div>
                <div class="col-sm-2"><button type="button" class="btn btn-primary btn-sm w-100" :disabled="busy === 'slots'" @click="lockManualSlot">Lock</button></div>
              </div>
            </template>
            <p v-if="notices.slots" class="alert alert-warning small mt-3 mb-0" role="status">{{ notices.slots }}</p>
          </div>
        </section>

        <!-- Itinerary -->
        <section class="card mb-4" aria-labelledby="itinerary-title">
          <div class="card-body">
            <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
              <h2 id="itinerary-title" class="h5 mb-0">Itinerary</h2>
              <div v-if="isHost" class="d-flex flex-wrap gap-2">
                <button type="button" class="btn btn-sm btn-primary" :disabled="busy === 'itinerary' || !hangout.lockedSlotStart" @click="autoGenerate">Auto-generate</button>
                <button v-if="isGroup && stops.length" type="button" class="btn btn-sm btn-outline-primary" :disabled="busy === 'itinerary'" @click="resolve">Apply votes</button>
              </div>
            </div>
            <p v-if="!hangout.lockedSlotStart" class="small text-secondary">Lock a time first, then generate or build the plan.</p>

            <ol v-if="stops.length" class="list-unstyled itinerary-timeline mb-3">
              <li v-for="stop in stops" :key="stop.id" class="itinerary-stop" :class="'itinerary-stop--' + stop.kind" :data-testid="'stop-' + stop.id">
                <div class="d-flex flex-wrap justify-content-between gap-2">
                  <div>
                    <span class="small text-secondary">{{ formatTime(stop.startsAt) }} – {{ formatTime(stop.endsAt) }} · {{ KIND_LABELS[stop.kind] }}</span>
                    <p class="mb-0 fw-semibold">{{ stop.title }}</p>
                  </div>
                  <div v-if="isGroup && stop.kind !== 'transit'" class="btn-group btn-group-sm" role="group" :aria-label="'Vote on ' + stop.title">
                    <button type="button" class="btn" :class="myVote(stop) === 1 ? 'btn-success' : 'btn-outline-success'" :aria-pressed="myVote(stop) === 1" @click="vote(stop, 1)">Keep {{ voteTotal(stop, 1) }}</button>
                    <button type="button" class="btn" :class="myVote(stop) === -1 ? 'btn-danger' : 'btn-outline-danger'" :aria-pressed="myVote(stop) === -1" @click="vote(stop, -1)">Swap {{ voteTotal(stop, -1) }}</button>
                  </div>
                </div>
              </li>
            </ol>
            <p v-if="notices.itinerary" class="alert alert-warning small mb-3" role="status">{{ notices.itinerary }}</p>

            <div class="row g-3">
              <div class="col-md-6">
                <PlaceholderPanel title="Build by hand" description="Add stops from deals, events and places, with suggestions from the group's preferences." waiting-on="manual itinerary builder" />
              </div>
              <div class="col-md-6">
                <PlaceholderPanel title="Map view" description="Stops and travel legs on a OneMap map." waiting-on="itinerary map (Leaflet + OneMap routing)" />
              </div>
            </div>
          </div>
        </section>

        <!-- Late join (group only) -->
        <section v-if="isGroup" class="card mb-4" aria-labelledby="late-title">
          <div class="card-body">
            <h2 id="late-title" class="h5">Joining later?</h2>
            <div class="row g-2 align-items-end">
              <div class="col-sm-8"><label class="form-label small" for="arrival-time">I'll arrive at</label><input id="arrival-time" v-model="arrivalTime" class="form-control form-control-sm" type="datetime-local" /></div>
              <div class="col-sm-4"><button type="button" class="btn btn-outline-primary btn-sm w-100" :disabled="busy === 'late' || !stops.length" @click="findGroup">Where's the group?</button></div>
            </div>
            <p v-if="arrivalResult" class="mt-3 mb-0">{{ arrivalResult.stop ? arrivalResult.stop.title : 'No stop found' }}</p>
            <p v-if="notices.late" class="alert alert-warning small mt-3 mb-0" role="status">{{ notices.late }}</p>
            <div class="mt-3">
              <PlaceholderPanel title="Route to the group" description="Public transport route and travel time from your location." waiting-on="OneMap routing" />
            </div>
          </div>
        </section>
      </div>
    </div>
  </template>
</template>

<style scoped>
.itinerary-stop { padding: .75rem 0 .75rem 1rem; border-left: 3px solid var(--bookedz-border, #e5ded2); }
.itinerary-stop--meal { border-left-color: var(--bookedz-yellow, #f6cf77); }
.itinerary-stop--activity { border-left-color: var(--bookedz-primary-dark, #aa3e2c); }
.itinerary-stop--transit { padding-top: .25rem; padding-bottom: .25rem; }
</style>
