<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AddressSearch from '../rsvp/AddressSearch.vue'
import { getHangoutPlan, setHangoutMeetingPoint } from '../../utils/api.js'
import { lateJoinOptions, etaMessage, MIN_OVERLAP_MINUTES } from '../../utils/lateJoin.js'
import { buildIcs, planText, directionsUrl } from '../../utils/calendar.js'
import { routeTravel } from '../../lib/routing.js'
import { fetchHangoutForecast } from '../../lib/hangoutWeather.js'
import { toDateTimeInputValue } from '../../utils/helpers.js'

// On the day: confirmed-plan handoff, late join and an NEA forecast. Nothing here books
// anything, and a late joiner's location is used only for their own request.
const props = defineProps({ event: { type: Object, required: true } })
const emit = defineEmits(['changed'])

const plan = ref(null)
const loadError = ref('')
const copyState = ref('')
const meeting = ref(props.event.hangout?.meetingPoint || '')
const meetingState = ref('')
const savingMeeting = ref(false)
const origin = ref(null)
const locating = ref(false)
const depart = ref(toDateTimeInputValue(new Date()))
const joinResult = ref(null)
const joinBusy = ref(false)
const joinError = ref('')
const forecast = ref(null)
const forecastLoading = ref(false)

const final = computed(() => plan.value?.stage === 'final')
const stops = computed(() => (plan.value?.stops || []).filter(s => Number.isFinite(s.start)))
const link = computed(() => `${location.origin}/events/${props.event.id}/rsvp`)
const time = ms => new Date(ms).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Singapore' })
const travelLabel = t => `${t.minutes} min ${t.mode === 'walk' ? 'walk' : 'by public transport'}${t.live ? ' (OneMap route)' : ' (estimated travel)'}`

async function load() {
  loadError.value = ''
  try { plan.value = await getHangoutPlan(props.event.id) }
  catch (error) { loadError.value = error.message }
}
async function loadForecast() {
  if (!stops.value.length) return
  forecastLoading.value = true
  const venue = props.event.venue
  forecast.value = await fetchHangoutForecast(stops.value[0].start, Number.isFinite(venue?.lat) ? venue : null)
  forecastLoading.value = false
}
onMounted(async () => { await load(); await loadForecast() })

async function copy(text, done) {
  try { await navigator.clipboard.writeText(text); copyState.value = done }
  catch { copyState.value = 'Couldn’t copy automatically. Select the text and copy it.' }
}
const details = () => ({ title: props.event.title, stops: stops.value, url: link.value, meetingPoint: meeting.value })
function downloadCalendar() {
  const blob = new Blob([buildIcs(details())], { type: 'text/calendar;charset=utf-8' })
  const href = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href, download: `${props.event.title.replace(/[^\w-]+/g, '-').slice(0, 40) || 'hangout'}.ics` })
  a.click()
  setTimeout(() => URL.revokeObjectURL(href), 1000)
  copyState.value = 'Calendar file downloaded.'
}
async function saveMeeting() {
  savingMeeting.value = true
  meetingState.value = ''
  try { meeting.value = await setHangoutMeetingPoint(props.event.id, meeting.value); meetingState.value = 'Meeting point saved.'; emit('changed') }
  catch (error) { meetingState.value = error.message }
  finally { savingMeeting.value = false }
}

function useMyLocation() {
  joinError.value = ''
  if (!('geolocation' in navigator)) { joinError.value = 'Location isn’t available in this browser. Search for a place instead.'; return }
  locating.value = true
  navigator.geolocation.getCurrentPosition(position => {
    locating.value = false
    origin.value = { name: 'Your current location', lat: position.coords.latitude, lng: position.coords.longitude }
  }, failure => {
    locating.value = false
    joinError.value = failure.code === 1 ? 'Location permission was declined. Search for a place instead.' : 'We couldn’t find your location. Search for a place instead.'
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 })
}
async function findStop() {
  joinError.value = ''
  joinResult.value = null
  if (!origin.value || !Number.isFinite(origin.value.lat)) { joinError.value = 'Choose where you’re starting from.'; return }
  const departMs = Date.parse(depart.value)
  if (!Number.isFinite(departMs)) { joinError.value = 'Choose when you’re leaving.'; return }
  joinBusy.value = true
  try {
    const travels = []
    for (const stop of stops.value) travels.push(Number.isFinite(stop.lat) ? await routeTravel(origin.value, stop, departMs) : null)
    joinResult.value = lateJoinOptions(stops.value, travels, departMs)
  } finally { joinBusy.value = false }
}
</script>

<template>
  <section class="go-panel" aria-labelledby="go-title">
    <h2 id="go-title" class="visually-hidden">On the day</h2>
    <p v-if="loadError" class="workspace-panel mb-0" role="status">{{ loadError }}</p>
    <template v-else-if="plan">
      <div class="go-status" :class="final ? 'go-status--final' : 'go-status--draft'" role="status">
        <strong>{{ final ? 'Plan confirmed' : 'Not confirmed yet' }}</strong>
        {{ final ? 'Nothing is booked: RSVP to each Bookedz event yourself.' : 'This is a preview; the host may still change it.' }}
      </div>

      <div class="go-grid">
        <div class="workspace-panel">
          <h3 class="section-heading">The plan</h3>
          <div class="meeting">
            <template v-if="plan.isHost">
              <label class="form-label" for="meeting-point">Exact meeting point</label>
              <div class="d-flex gap-2"><input id="meeting-point" v-model="meeting" class="form-control" maxlength="120" placeholder="e.g. Bugis MRT Exit C, beside the escalators" aria-describedby="meeting-help"><button type="button" class="btn btn-outline-secondary" :disabled="savingMeeting" @click="saveMeeting">Save</button></div>
              <p id="meeting-help" class="form-text" role="status">{{ meetingState || `${meeting.length}/120` }}</p>
            </template>
            <p v-else class="mb-3"><strong>Meet at:</strong> {{ meeting || 'The host hasn’t set a meeting point yet.' }}</p>
          </div>
          <p v-if="!stops.length" class="text-body-secondary mb-0">No stops yet.</p>
          <ol v-else class="go-stops">
            <li v-for="(stop, i) in stops" :key="stop.id">
              <span class="go-num" aria-hidden="true">{{ i + 1 }}</span>
              <div>
                <p class="go-time">{{ time(stop.start) }} – {{ time(stop.end) }}</p>
                <p class="go-title">{{ stop.title }}</p>
                <p class="go-venue">{{ stop.venueName }}</p>
                <p class="go-links">
                  <a v-if="Number.isFinite(stop.lat)" :href="directionsUrl(stop)" target="_blank" rel="noopener">Directions (Google Maps)<span class="visually-hidden"> to {{ stop.title }}, opens in a new tab</span></a>
                  <RouterLink v-if="stop.type === 'event'" :to="`/events/${stop.refId}/rsvp`">Event page and RSVP</RouterLink>
                </p>
              </div>
            </li>
          </ol>
          <div class="share-row">
            <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="!final" @click="copy(planText(details()), 'Plan copied.')">Copy plan</button>
            <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="!final" @click="downloadCalendar">Add to calendar (.ics)</button>
            <button type="button" class="btn btn-outline-secondary btn-sm" @click="copy(link, 'Hangout link copied.')">Copy hangout link</button>
          </div>
          <p class="form-text mb-0" role="status">{{ copyState || (final ? '' : 'Copy plan and calendar open once the host confirms.') }}</p>
        </div>

        <div class="go-side">
          <div class="workspace-panel">
            <h3 class="section-heading">Joining later?</h3>
            <p class="small text-body-secondary">Find the stop you can reach at least {{ MIN_OVERLAP_MINUTES }} minutes before the group leaves. Your location is sent only to calculate this route and isn’t saved or shared with the group.</p>
            <div v-if="origin" class="origin-chip"><span>From <strong>{{ origin.name }}</strong></span><button type="button" class="btn btn-link btn-sm p-0" @click="origin = null; joinResult = null">Change</button></div>
            <template v-else>
              <AddressSearch label="Where are you starting from?" input-id="late-origin" @select="origin = $event" />
              <button type="button" class="btn btn-outline-secondary btn-sm mb-3" :disabled="locating" @click="useMyLocation">{{ locating ? 'Finding you…' : 'Use my current location' }}</button>
            </template>
            <label class="form-label" for="late-depart">Leaving at</label>
            <input id="late-depart" v-model="depart" type="datetime-local" class="form-control mb-3">
            <button type="button" class="btn btn-primary w-100" :disabled="joinBusy || !stops.length" @click="findStop">{{ joinBusy ? 'Checking routes…' : 'Find where to meet them' }}</button>
            <p v-if="joinError" class="text-danger small mt-2 mb-0" role="alert">{{ joinError }}</p>
            <div v-if="joinResult" class="join-result" role="status">
              <template v-if="joinResult.best">
                <p class="result-kicker">Best stop to join</p>
                <p class="result-title">{{ joinResult.best.stop.title }}</p>
                <ul class="small">
                  <li>Travel: {{ travelLabel(joinResult.best.travel) }}</li>
                  <li>You arrive about {{ time(joinResult.best.arrival) }}; the group leaves at {{ time(joinResult.best.leaves) }}</li>
                  <li>About {{ joinResult.best.together }} minutes together there</li>
                </ul>
                <p v-if="joinResult.alternatives.length" class="small mb-2">Backup: {{ joinResult.alternatives[0].stop.title }} (arrive about {{ time(joinResult.alternatives[0].arrival) }})</p>
                <div class="d-flex flex-wrap gap-2">
                  <a v-if="Number.isFinite(joinResult.best.stop.lat)" class="btn btn-outline-secondary btn-sm" :href="directionsUrl(joinResult.best.stop)" target="_blank" rel="noopener">Directions</a>
                  <button type="button" class="btn btn-outline-secondary btn-sm" @click="copy(etaMessage(joinResult.best), 'ETA copied; paste it in your group chat.')">Copy my ETA</button>
                </div>
              </template>
              <p v-else class="mb-0">{{ joinResult.reason }}</p>
            </div>
          </div>

          <div class="workspace-panel">
            <h3 class="section-heading">Weather</h3>
            <p v-if="forecastLoading" class="small mb-0" role="status">Checking NEA’s forecast…</p>
            <template v-else-if="forecast?.available">
              <p class="forecast-text">{{ forecast.text }}</p>
              <p class="small mb-1">{{ forecast.label }} · {{ forecast.where }}</p>
              <p class="small text-body-secondary mb-0">NEA via data.gov.sg<template v-if="forecast.updatedAt"> · updated {{ new Date(forecast.updatedAt).toLocaleString('en-SG', { timeZone: 'Asia/Singapore', dateStyle: 'medium', timeStyle: 'short' }) }}</template></p>
            </template>
            <template v-else-if="forecast">
              <p class="small mb-2">{{ forecast.reason }}</p>
              <button type="button" class="btn btn-link btn-sm p-0" @click="loadForecast">Check again</button>
            </template>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.go-panel { display: grid; gap: 16px; }
.go-status { padding: 14px 18px; border-radius: var(--bookedz-radius-control); border: 1px dashed var(--bookedz-control-border); }
.go-status--final { border-color: var(--bookedz-teal); background: var(--bookedz-teal-soft); }
.go-status--draft { background: var(--bookedz-mango-soft); border-color: transparent; }
.go-grid { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 16px; align-items: start; }
.go-side { display: grid; gap: 16px; }
.go-stops { list-style: none; padding: 0; margin: 0 0 12px; display: grid; gap: 12px; }
.go-stops li { display: flex; gap: 12px; padding-bottom: 12px; border-bottom: 1px dashed var(--bookedz-border); }
.go-num { flex: none; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: var(--bookedz-fill); color: var(--bookedz-on-fill); font: 900 .9rem var(--bookedz-heading); }
.go-time { margin: 0; font-weight: 700; font-variant-numeric: tabular-nums; }
.go-title { margin: 0; font-family: var(--bookedz-heading); font-weight: 800; overflow-wrap: anywhere; }
.go-venue { margin: 0 0 4px; font-size: .82rem; color: var(--bookedz-muted); }
.go-links { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 0; font-size: .85rem; }
.go-links a { display: inline-flex; align-items: center; min-height: 32px; color: var(--bookedz-primary-dark); font-weight: 700; }
.share-row { display: flex; flex-wrap: wrap; gap: 8px; }
.origin-chip { display: flex; justify-content: space-between; gap: 10px; align-items: center; padding: 10px 12px; margin-bottom: 12px; border-radius: var(--bookedz-radius-control); background: var(--bookedz-glass-solid); }
.join-result { margin-top: 14px; padding: 14px; border-radius: var(--bookedz-radius-control); background: var(--bookedz-teal-soft); }
.join-result ul { padding-left: 1.1rem; margin-bottom: 8px; }
.result-kicker { margin: 0; font-size: .72rem; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; color: var(--bookedz-teal-ink); }
.result-title { margin: 2px 0 6px; font: 900 1.15rem var(--bookedz-heading); }
.forecast-text { margin: 0 0 4px; font: 900 1.3rem var(--bookedz-heading); }
@media (max-width: 991.98px) { .go-grid { grid-template-columns: 1fr; } }
</style>
