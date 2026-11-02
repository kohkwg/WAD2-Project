<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AddressSearch from '../rsvp/AddressSearch.vue'
import { getHangoutPlan, generateHangoutPlan, previewHangoutStops, setHangoutStops, addHangoutPlace, getHangoutAlternatives, voteHangoutStop, finalizeHangoutPlan, reopenHangoutPlan } from '../../utils/api.js'
import { MAX_STOPS } from '../../utils/itinerary.js'

// Plan tab: a timeline of real Official events and host-entered places with
// estimated travel, issues, Keep/Swap votes and explicit confirmation (not a booking).
const props = defineProps({ eventId: { type: String, required: true } })
const emit = defineEmits(['changed'])

const plan = ref(null)
const loading = ref(true)
const loadError = ref('')
const busy = ref(false)
const actionError = ref('')
const notice = ref('')
const relax = ref({ minStops: 2, mealWanted: true })
const generateResult = ref(null)
const draft = ref(null) // refs in a proposed order, previewed before saving
const draftPreview = ref(null)
const alternatives = ref({ stopId: null, list: [], loading: false })
const addMode = ref('')
const pickedEvent = ref('')
const place = ref(blankPlace())
const confirming = ref(false)
const acceptSoft = ref(false)
const timelineHeading = ref(null)

function blankPlace() { return { name: '', address: '', lat: null, lng: null, minutes: 60, kind: 'activity', open: '', close: '' } }
const time = ms => new Date(ms).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Singapore' })
const day = ms => new Date(ms).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' })
const legText = leg => !leg || leg.mode === 'none' ? 'Same place, no travel' : `About ${leg.minutes} min ${leg.mode === 'walk' ? 'walk' : 'by public transport'} · ${leg.km.toFixed(1)} km (estimated travel)`
const stage = computed(() => plan.value?.stage)
const voting = computed(() => stage.value === 'voting')
const isFinal = computed(() => stage.value === 'final')
const savedRefs = computed(() => (plan.value?.stops || []).map(s => s.ref))
const shownStops = computed(() => {
  if (!draft.value) return plan.value?.stops || []
  return draft.value.map((ref, i) => {
    const added = plan.value.addable.find(e => e.ref === ref)
    const stop = plan.value.stops.find(s => s.ref === ref)
      || { ref, type: 'event', refId: ref.replace('event:', ''), title: added?.title || 'New stop', venueName: added?.venueName || '', kind: added?.tags?.includes('food') ? 'meal' : 'activity', issues: [], votes: { keep: 0, swap: 0, mine: 0 } }
    const t = draftPreview.value?.times[i]
    return { ...stop, start: t?.start, end: t?.end, issues: (draftPreview.value?.issues || []).filter(x => x.index === i), draft: true }
  })
})
const allIssues = computed(() => [...(plan.value?.planIssues || []), ...(plan.value?.stops || []).flatMap(s => s.issues)])
const blocking = computed(() => allIssues.value.filter(i => i.blocking))
const soft = computed(() => allIssues.value.filter(i => !i.blocking))

async function load() {
  loadError.value = ''
  try { plan.value = await getHangoutPlan(props.eventId) }
  catch (error) { loadError.value = error.message }
  finally { loading.value = false }
}
onMounted(load)

async function act(fn, { success = '' } = {}) {
  if (busy.value) return
  busy.value = true
  actionError.value = ''
  notice.value = ''
  try {
    const next = await fn()
    if (next && next.stops) plan.value = { ...plan.value, ...next }
    notice.value = success
    emit('changed')
  } catch (error) {
    actionError.value = error.message
  } finally { busy.value = false }
}

async function generate(overrides = {}) {
  relax.value = { ...relax.value, ...overrides }
  await act(async () => {
    const outcome = await generateHangoutPlan(props.eventId, relax.value)
    generateResult.value = outcome.ok ? null : outcome
    if (!outcome.ok) return null
    draft.value = null
    return outcome.plan
  }, { success: '' })
  if (!generateResult.value && !actionError.value) { notice.value = 'Plan generated from real Bookedz events. Review it before members vote.'; await nextTick(); timelineHeading.value?.focus() }
}

async function propose(refs) {
  draft.value = refs
  draftPreview.value = null
  try { draftPreview.value = await previewHangoutStops(props.eventId, refs) }
  catch (error) { actionError.value = error.message }
}
const currentOrder = () => draft.value ? [...draft.value] : [...savedRefs.value]
function moveTo(index, target) {
  const order = currentOrder()
  if (target < 0 || target >= order.length || target === index) return
  const [item] = order.splice(index, 1)
  order.splice(target, 0, item)
  propose(order)
}
function remove(index) { const order = currentOrder(); order.splice(index, 1); propose(order) }
function discardDraft() { draft.value = null; draftPreview.value = null }
const saveDraft = () => act(async () => { const next = await setHangoutStops(props.eventId, draft.value); draft.value = null; draftPreview.value = null; return next }, { success: 'Plan order saved. Stops that moved have fresh votes.' })

async function showAlternatives(stop) {
  if (alternatives.value.stopId === stop.id) { alternatives.value = { stopId: null, list: [], loading: false }; return }
  alternatives.value = { stopId: stop.id, list: [], loading: true }
  try { alternatives.value = { stopId: stop.id, list: await getHangoutAlternatives(props.eventId, stop.id), loading: false } }
  catch (error) { alternatives.value = { stopId: null, list: [], loading: false }; actionError.value = error.message }
}
function useAlternative(index, ref) {
  const order = currentOrder()
  order[index] = ref
  alternatives.value = { stopId: null, list: [], loading: false }
  propose(order)
}

function addEvent() {
  if (!pickedEvent.value) return
  propose([...currentOrder(), pickedEvent.value])
  pickedEvent.value = ''
  addMode.value = ''
}
function choosePlace(found) { place.value = { ...place.value, name: place.value.name || found.name, address: found.address, lat: found.lat, lng: found.lng } }
const savePlace = () => act(async () => {
  const p = place.value
  const next = await addHangoutPlace(props.eventId, { name: p.name, address: p.address, lat: p.lat, lng: p.lng, minutes: Number(p.minutes), kind: p.kind, hours: p.open && p.close ? { open: p.open, close: p.close } : null })
  place.value = blankPlace()
  addMode.value = ''
  return next
}, { success: 'Place added to the end of the plan.' })

const vote = (stop, value) => act(() => voteHangoutStop(props.eventId, stop.id, stop.votes.mine === value ? 0 : value))
const finalize = () => act(async () => { const next = await finalizeHangoutPlan(props.eventId, { acceptSoft: acceptSoft.value }); confirming.value = false; return next }, { success: 'Plan confirmed. Nothing has been booked; RSVP to each event separately.' })
const reopen = () => act(() => reopenHangoutPlan(props.eventId), { success: 'Voting reopened.' })
</script>

<template>
  <section class="plan-panel" aria-labelledby="plan-panel-title">
    <h2 id="plan-panel-title" class="visually-hidden">Plan</h2>
    <div v-if="loading" role="status" class="text-body-secondary"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span> Loading the plan…</div>
    <div v-else-if="loadError" class="workspace-panel mb-0" role="status">{{ loadError }}</div>
    <template v-else-if="plan">
      <div class="plan-head">
        <p class="mb-0"><span class="stage-chip" :class="`stage-chip--${stage}`">{{ isFinal ? 'Confirmed' : voting ? 'Voting open' : stage }}</span> {{ day(plan.slot.start) }}, {{ time(plan.slot.start) }} – {{ time(plan.slot.end) }} · {{ plan.stops.length }}/{{ MAX_STOPS }} stops</p>
        <div v-if="plan.isHost && !draft" class="d-flex flex-wrap gap-2">
          <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="busy" @click="generate()">{{ plan.stops.length ? 'Regenerate' : 'Generate a plan' }}</button>
          <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="busy || plan.stops.length >= MAX_STOPS" :aria-expanded="Boolean(addMode)" @click="addMode = addMode ? '' : 'event'">Add a stop</button>
        </div>
      </div>
      <p v-if="plan.options?.flexibleStart && plan.stops[0]?.type === 'event'" class="small mb-0">You chose to meet later: the plan starts just before the first event, not at the hangout’s start time.</p>
      <p v-if="voting && plan.changedAt && plan.stops.length" class="small text-body-secondary mb-0">The plan changed {{ new Date(plan.changedAt).toLocaleString('en-SG', { timeZone: 'Asia/Singapore', dateStyle: 'medium', timeStyle: 'short' }) }}; votes on moved or new stops start fresh.</p>

      <div v-if="generateResult" class="workspace-panel rescue" role="status">
        <p class="fw-semibold mb-2">{{ generateResult.reason }}</p>
        <p class="small mb-2">Choose how to continue (nothing is relaxed until you choose):</p>
        <div class="d-flex flex-wrap gap-2">
          <template v-for="s in generateResult.suggestions" :key="s.kind">
            <button v-if="s.kind === 'later-start'" type="button" class="btn btn-outline-secondary btn-sm" @click="generate({ flexibleStart: true })">{{ s.label }}</button>
            <button v-else-if="s.kind === 'one-stop'" type="button" class="btn btn-outline-secondary btn-sm" @click="generate({ minStops: 1 })">{{ s.label }}</button>
            <button v-else-if="s.kind === 'no-meal'" type="button" class="btn btn-outline-secondary btn-sm" @click="generate({ mealWanted: false })">{{ s.label }}</button>
            <button v-else type="button" class="btn btn-outline-secondary btn-sm" @click="addMode = 'place'; generateResult = null">{{ s.label }}</button>
          </template>
        </div>
        <p v-if="relax.minStops === 1 || !relax.mealWanted || relax.flexibleStart" class="small text-body-secondary mt-2 mb-0">Using: {{ [relax.flexibleStart && 'meeting later', relax.minStops === 1 && 'one stop allowed', !relax.mealWanted && 'no meal required'].filter(Boolean).join(', ') }}.</p>
      </div>

      <div v-if="addMode" class="workspace-panel add-panel">
        <div class="segmented mb-3" role="group" aria-label="Kind of stop">
          <button type="button" :aria-pressed="addMode === 'event'" @click="addMode = 'event'">Bookedz event</button>
          <button type="button" :aria-pressed="addMode === 'place'" @click="addMode = 'place'">Your own place</button>
        </div>
        <div v-if="addMode === 'event'">
          <p v-if="!plan.addable.length" class="mb-0 text-body-secondary">No other Official Bookedz events happen during this time.</p>
          <div v-else class="d-flex flex-wrap gap-2 align-items-end">
            <div class="flex-grow-1"><label class="form-label" for="plan-add-event">Event during this hangout</label>
              <select id="plan-add-event" v-model="pickedEvent" class="form-select"><option value="" disabled>Choose…</option><option v-for="e in plan.addable" :key="e.ref" :value="e.ref">{{ e.title }} · {{ time(e.start) }}–{{ time(e.end) }} · {{ e.venueName }}</option></select></div>
            <button type="button" class="btn btn-primary" :disabled="!pickedEvent" @click="addEvent">Preview with this stop</button>
          </div>
        </div>
        <div v-else class="row g-2">
          <p class="small text-body-secondary mb-1">Your own places stay private to this plan; they don’t appear on Discover.</p>
          <div class="col-12"><AddressSearch label="Find the place on OneMap" input-id="plan-place-search" @select="choosePlace" /></div>
          <p v-if="place.address" class="small mb-1">Location: {{ place.address }}<span v-if="!Number.isFinite(place.lat)" class="text-danger"> (no map location; choose a suggestion)</span></p>
          <div class="col-sm-6"><label class="form-label" for="plan-place-name">Name</label><input id="plan-place-name" v-model="place.name" class="form-control" maxlength="80"></div>
          <div class="col-6 col-sm-3"><label class="form-label" for="plan-place-minutes">Stay</label><select id="plan-place-minutes" v-model.number="place.minutes" class="form-select"><option v-for="m in [30, 45, 60, 90, 120, 180]" :key="m" :value="m">{{ m < 60 ? `${m} min` : `${m / 60} h` }}</option></select></div>
          <div class="col-6 col-sm-3"><label class="form-label" for="plan-place-kind">Kind</label><select id="plan-place-kind" v-model="place.kind" class="form-select"><option value="activity">Activity</option><option value="meal">Meal</option></select></div>
          <fieldset class="col-12"><legend class="form-label">Opening hours <span class="fw-normal text-body-secondary">(optional; unknown hours are flagged)</span></legend>
            <div class="d-flex gap-2"><input v-model="place.open" type="time" class="form-control" aria-label="Opens"><input v-model="place.close" type="time" class="form-control" aria-label="Closes"></div></fieldset>
          <div class="col-12 d-flex gap-2 mt-2"><button type="button" class="btn btn-primary" :disabled="busy || !place.name.trim() || !Number.isFinite(place.lat)" @click="savePlace">Add place</button><button type="button" class="btn btn-outline-secondary" @click="addMode = ''; place = blankPlace()">Cancel</button></div>
        </div>
      </div>

      <div class="workspace-panel">
        <h3 ref="timelineHeading" tabindex="-1" class="section-heading">{{ draft ? 'Proposed order (not saved yet)' : 'Timeline' }}</h3>
        <p v-if="!shownStops.length" class="text-body-secondary mb-0">{{ plan.isHost ? 'No stops yet. Generate a plan from real Bookedz events, or add stops yourself.' : 'The host hasn’t added any stops yet.' }}</p>
        <ol v-else class="timeline">
          <li v-for="(stop, index) in shownStops" :key="stop.ref" class="timeline-stop">
            <p v-if="stop.leg || draft" class="timeline-leg">{{ stop.leg && !draft ? legText(stop.leg) : 'Travel recalculated in the preview (estimated)' }}</p>
            <div class="stop-card" :class="{ 'stop-card--meal': stop.kind === 'meal' }">
              <span class="stop-number" aria-hidden="true">{{ index + 1 }}</span>
              <div class="stop-body">
                <p class="stop-time">{{ stop.start ? `${time(stop.start)} – ${time(stop.end)}` : 'Timing…' }}<span v-if="stop.wait" class="text-body-secondary"> · {{ Math.round(stop.wait) }} min wait first</span></p>
                <h4 class="stop-title"><RouterLink v-if="stop.type === 'event'" :to="`/events/${stop.refId}/rsvp`">{{ stop.title }}</RouterLink><template v-else>{{ stop.title }}</template></h4>
                <p class="stop-meta">{{ stop.venueName }} · <span class="text-capitalize">{{ stop.kind }}</span> · {{ stop.type === 'event' ? 'Official Bookedz event, not booked: RSVP separately' : 'Your own place' }}</p>
                <ul v-if="stop.issues.length" class="stop-issues">
                  <li v-for="issue in stop.issues" :key="issue.type" :class="issue.blocking ? 'issue--block' : 'issue--soft'"><span aria-hidden="true">{{ issue.blocking ? '✕' : '!' }}</span> {{ issue.message }}<span class="visually-hidden">{{ issue.blocking ? ' (must fix)' : ' (concern)' }}</span></li>
                </ul>
                <div v-if="!stop.draft && plan.stops.length" class="vote-row" role="group" :aria-label="`Vote on ${stop.title}`">
                  <button type="button" class="vote-stamp vote-stamp--keep" :aria-pressed="stop.votes.mine === 1" :disabled="!voting || busy" @click="vote(stop, 1)">Keep <span class="vote-count">{{ stop.votes.keep }}</span></button>
                  <button type="button" class="vote-stamp vote-stamp--swap" :aria-pressed="stop.votes.mine === -1" :disabled="!voting || busy" @click="vote(stop, -1)">Swap <span class="vote-count">{{ stop.votes.swap }}</span></button>
                </div>
                <div v-if="plan.isHost && !isFinal" class="host-row">
                  <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="index === 0" :aria-label="`Move ${stop.title} earlier`" @click="moveTo(index, index - 1)">↑ Earlier</button>
                  <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="index === shownStops.length - 1" :aria-label="`Move ${stop.title} later`" @click="moveTo(index, index + 1)">↓ Later</button>
                  <label class="visually-hidden" :for="`pos-${stop.ref}`">Position of {{ stop.title }}</label>
                  <select :id="`pos-${stop.ref}`" class="form-select form-select-sm position-select" :value="index" @change="moveTo(index, Number($event.target.value))"><option v-for="(s, i) in shownStops" :key="i" :value="i">Position {{ i + 1 }}</option></select>
                  <button v-if="stop.type === 'event' && !draft" type="button" class="btn btn-outline-secondary btn-sm" :aria-expanded="alternatives.stopId === stop.id" @click="showAlternatives(stop)">Swap stop</button>
                  <button type="button" class="btn btn-outline-danger btn-sm" @click="remove(index)">Remove</button>
                </div>
                <div v-if="alternatives.stopId === stop.id" class="alternatives" role="region" :aria-label="`Alternatives for ${stop.title}`">
                  <p v-if="alternatives.loading" class="small mb-0" role="status">Finding alternatives…</p>
                  <p v-else-if="!alternatives.list.length" class="small mb-0">No other {{ stop.kind }} event fits without new problems.</p>
                  <ul v-else><li v-for="alt in alternatives.list" :key="alt.ref"><strong>{{ alt.title }}</strong> · {{ time(alt.start) }}–{{ time(alt.end) }} · {{ alt.venueName }}<span v-if="alt.reasons.length" class="d-block small text-body-secondary">{{ alt.reasons.join(' · ') }}</span><button type="button" class="btn btn-link btn-sm p-0" @click="useAlternative(index, alt.ref)">Preview with this instead</button></li></ul>
                </div>
              </div>
            </div>
          </li>
        </ol>
        <p v-for="issue in (draft ? (draftPreview?.issues || []).filter(i => i.index === null) : plan.planIssues)" :key="issue.type + issue.message" class="small issue--soft mb-1"><span aria-hidden="true">!</span> {{ issue.message }}</p>
        <div v-if="draft" class="draft-row">
          <span class="small" role="status">{{ draftPreview ? `${(draftPreview.issues || []).filter(i => i.blocking).length} must-fix problem(s) in this order` : 'Checking timings…' }}</span>
          <button type="button" class="btn btn-outline-secondary" @click="discardDraft">Discard changes</button>
          <button type="button" class="btn btn-primary" :disabled="busy || !draftPreview" @click="saveDraft">Save order</button>
        </div>
      </div>

      <div v-if="plan.isHost && plan.stops.length && !draft" class="workspace-panel confirm-panel">
        <template v-if="isFinal">
          <p class="fw-semibold mb-1">Plan confirmed</p>
          <p class="small mb-2">This isn’t a booking or reservation. Members RSVP to each Bookedz event themselves.</p>
          <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="busy" @click="reopen">Reopen voting</button>
        </template>
        <template v-else-if="!confirming"><button type="button" class="btn btn-primary" @click="confirming = true; acceptSoft = false">Review and confirm plan</button></template>
        <template v-else>
          <h3 class="section-heading">Confirm the plan</h3>
          <div v-if="blocking.length"><p class="fw-semibold text-danger mb-1">Must fix before confirming</p><ul class="small"><li v-for="i in blocking" :key="i.type + i.index">{{ i.message }}</li></ul></div>
          <div v-if="soft.length"><p class="fw-semibold mb-1">Concerns you can accept</p><ul class="small"><li v-for="i in soft" :key="i.type + i.index">{{ i.message }}</li></ul>
            <div class="form-check"><input id="accept-soft" v-model="acceptSoft" class="form-check-input" type="checkbox"><label class="form-check-label" for="accept-soft">I accept these concerns</label></div></div>
          <p v-if="!blocking.length && !soft.length" class="small">No problems found.</p>
          <p class="small text-body-secondary">Confirming isn’t a booking. Members still RSVP to each event themselves.</p>
          <div class="d-flex gap-2"><button type="button" class="btn btn-outline-secondary" @click="confirming = false">Back</button><button type="button" class="btn btn-primary" :disabled="busy || blocking.length > 0 || (soft.length > 0 && !acceptSoft)" @click="finalize">Confirm plan</button></div>
        </template>
      </div>
      <p v-if="notice" class="alert alert-success mb-0" role="status">{{ notice }}</p>
      <p v-if="actionError" class="alert alert-danger mb-0" role="alert">{{ actionError }}</p>
    </template>
  </section>
</template>

<style scoped>
.plan-panel { display: grid; gap: 16px; }
.plan-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; font-variant-numeric: tabular-nums; }
.stage-chip { display: inline-block; margin-right: 6px; padding: 3px 10px; border-radius: 99px; background: var(--bookedz-glass-solid); border: 1px solid var(--bookedz-border); font-size: .75rem; font-weight: 800; text-transform: capitalize; }
.stage-chip--voting { background: var(--bookedz-mango-soft); border-color: transparent; }
.stage-chip--final { background: var(--bookedz-teal-soft); border-color: transparent; color: var(--bookedz-teal-ink); }
.segmented { display: inline-flex; gap: 4px; padding: 4px; border-radius: 99px; background: var(--bookedz-glass-solid); border: 1px solid var(--bookedz-border); }
.segmented button { min-height: 40px; padding: 6px 14px; border: 0; border-radius: 99px; background: transparent; color: var(--bookedz-muted); font-size: .82rem; font-weight: 700; }
.segmented button[aria-pressed=true] { background: var(--bookedz-ink); color: var(--bookedz-surface); }
.section-heading:focus { outline: none; }
.timeline { list-style: none; margin: 0; padding: 0; }
.timeline-leg { margin: 0 0 0 17px; padding: 8px 0 8px 26px; border-left: 2px dashed var(--bookedz-control-border); font-size: .78rem; color: var(--bookedz-muted); }
.stop-card { display: flex; gap: 14px; padding: 16px; border: 1px solid var(--bookedz-border); border-radius: var(--bookedz-radius-control); background: var(--bookedz-surface); }
.stop-card--meal { border-left: 4px solid var(--bookedz-mango); }
.stop-number { flex: none; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; background: var(--bookedz-fill); color: var(--bookedz-on-fill); font: 900 1rem var(--bookedz-heading); }
.stop-body { min-width: 0; flex: 1; }
.stop-time { margin: 0 0 2px; font-weight: 700; font-variant-numeric: tabular-nums; }
.stop-title { margin: 0 0 4px; font-size: 1.1rem; overflow-wrap: anywhere; }
.stop-meta { margin: 0 0 8px; font-size: .8rem; color: var(--bookedz-muted); }
.stop-issues { list-style: none; padding: 0; margin: 0 0 8px; display: grid; gap: 4px; font-size: .82rem; }
.issue--block { color: var(--bookedz-danger); }
.issue--soft { color: var(--bookedz-ink); }
.issue--soft > span { display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: var(--bookedz-mango-soft); font-weight: 900; font-size: .7rem; }
.vote-row { display: flex; gap: 8px; margin-bottom: 8px; }
.vote-stamp { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 6px 16px; border: 2px dashed var(--bookedz-control-border); border-radius: 12px; background: var(--bookedz-surface); color: var(--bookedz-ink); font: 800 .9rem var(--bookedz-heading); letter-spacing: .02em; text-transform: uppercase; transition: transform var(--bookedz-motion-normal) var(--bookedz-ease-stamp), background-color var(--bookedz-motion-fast) var(--bookedz-ease); }
.vote-stamp:disabled { opacity: .6; cursor: not-allowed; }
.vote-stamp--keep[aria-pressed=true] { border-style: solid; border-color: var(--bookedz-teal); background: var(--bookedz-teal-soft); color: var(--bookedz-teal-ink); transform: rotate(-3deg); }
.vote-stamp--swap[aria-pressed=true] { border-style: solid; border-color: var(--bookedz-pink); background: var(--bookedz-pink-soft); color: var(--bookedz-pink-ink); transform: rotate(3deg); }
.vote-count { font-family: var(--bookedz-body); font-variant-numeric: tabular-nums; }
.host-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.position-select { width: auto; min-height: 38px; }
.alternatives { margin-top: 10px; padding: 12px; border-radius: var(--bookedz-radius-control); background: var(--bookedz-glass-solid); border: 1px dashed var(--bookedz-control-border); }
.alternatives ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
.draft-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--bookedz-border); }
.draft-row > span { margin-right: auto; }
@media (prefers-reduced-motion: reduce) { .vote-stamp { transition: none; } .vote-stamp[aria-pressed=true] { transform: none; } }
</style>
