<script setup>
import '../../assets/design-baseline.css'
import { computed, nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import StepIndicator from '../rsvp/StepIndicator.vue'
import AddressSearch from '../rsvp/AddressSearch.vue'
import InviteSlip from './InviteSlip.vue'
import { createEvent } from '../../utils/api.js'
import { CATEGORIES } from '../../lib/constants.js'
import { blankHangout, hangoutStepErrors, hangoutEventData, sgToday, inclusiveDays, JOIN_MODE_LABELS, MAX_INTERESTS, MAX_GROUP_DAYS, CAPACITY_RANGE } from '../../utils/hangouts.js'

// The OpenJio-style Hangout template: four short steps, then an invite slip.
const router = useRouter()
const emit = defineEmits(['created'])
const steps = ['Basics', 'When', 'Where', 'Review']
const step = ref(1)
const form = ref(blankHangout())
const showErrors = ref(false)
const publishing = ref(false)
const errorMessage = ref('')
const created = ref(null)
const stepHeading = ref(null)
const today = sgToday()

const MODES = [
  { value: 'group', title: 'Group hangout', detail: 'Private invite link. Friends mark when they’re free, then you lock a time.' },
  { value: 'public', title: 'Open Jio', detail: 'Listed on Discover for anyone to join. You set the time now.' },
  { value: 'solo', title: 'Solo plan', detail: 'Just you, at a fixed time. No invites.' },
]
const errors = computed(() => (showErrors.value ? hangoutStepErrors(form.value, step.value) : []))
const errorFor = field => errors.value.find(e => e.field === field)?.message
const modeLabel = computed(() => MODES.find(m => m.value === form.value.mode)?.title)
const rangeDays = computed(() => form.value.startDate && form.value.endDate && form.value.endDate >= form.value.startDate ? inclusiveDays(form.value.startDate, form.value.endDate) : 0)
const prettyDate = value => value ? new Date(`${value}T12:00:00+08:00`).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' }) : ''
const whenSummary = computed(() => form.value.mode === 'group'
  ? `${prettyDate(form.value.startDate)} – ${prettyDate(form.value.endDate)} (${rangeDays.value} ${rangeDays.value === 1 ? 'day' : 'days'}); everyone marks free times`
  : `${prettyDate(form.value.date)}, ${form.value.startTime}–${form.value.endTime}`)

function toggleInterest(tag) {
  const list = form.value.interests
  if (list.includes(tag)) form.value.interests = list.filter(t => t !== tag)
  else if (list.length < MAX_INTERESTS) form.value.interests = [...list, tag]
}
function setArea(place) { form.value.startArea = place }

async function focusAfterChange() {
  await nextTick()
  const firstError = errors.value[0]
  const target = firstError ? document.getElementById(`hangout-${firstError.field}`) : stepHeading.value
  target?.focus({ preventScroll: false })
}
async function next() {
  showErrors.value = true
  if (hangoutStepErrors(form.value, step.value).length) return focusAfterChange()
  showErrors.value = false
  step.value++
  await focusAfterChange()
}
async function back() {
  showErrors.value = false
  step.value--
  await focusAfterChange()
}
async function publish() {
  if (publishing.value) return
  const invalid = [1, 2, 3, 4].find(n => hangoutStepErrors(form.value, n).length)
  if (invalid) { step.value = invalid; showErrors.value = true; return focusAfterChange() }
  publishing.value = true
  errorMessage.value = ''
  try {
    created.value = await createEvent(hangoutEventData(form.value))
    emit('created', created.value)
  } catch (error) {
    // The draft stays exactly as typed so the organiser can retry.
    errorMessage.value = `Your hangout couldn’t be created: ${error.message}`
  } finally {
    publishing.value = false
  }
}
</script>

<template>
  <div class="design-baseline hangout-wizard col-12 col-xl-11 mx-auto">
    <InviteSlip v-if="created" :event="created" @open="router.push(`/events/${created.id}/rsvp`)" />
    <template v-else>
      <header class="hangout-head">
        <p class="hangout-washi">Hangout template</p>
        <h1>Start a hangout</h1>
        <p>From “free this weekend?” to “see you there.” One link collects free times, votes and the final plan.</p>
      </header>
      <StepIndicator :steps="steps" :current="step" />
      <div class="workspace-panel hangout-panel">
        <h2 ref="stepHeading" tabindex="-1" class="step-heading">{{ ['Who and what', 'When', 'Where you’ll start', 'Review and create'][step - 1] }}</h2>

        <div v-if="errors.length" class="alert alert-danger" role="alert">
          <p class="mb-1 fw-semibold">Please fix {{ errors.length === 1 ? 'this' : 'these' }} first:</p>
          <ul class="mb-0"><li v-for="e in errors" :key="e.field"><a :href="`#hangout-${e.field}`">{{ e.message }}</a></li></ul>
        </div>

        <template v-if="step === 1">
          <fieldset class="mb-4">
            <legend class="form-label">Who is it for?</legend>
            <div id="hangout-mode" class="mode-grid" tabindex="-1">
              <label v-for="m in MODES" :key="m.value" class="mode-card" :class="{ 'is-selected': form.mode === m.value }">
                <input v-model="form.mode" class="visually-hidden-focusable-input" type="radio" name="hangout-mode" :value="m.value">
                <span class="mode-title">{{ m.title }}</span>
                <span class="mode-detail">{{ m.detail }}</span>
              </label>
            </div>
          </fieldset>
          <div class="mb-3">
            <label class="form-label" for="hangout-title">Title</label>
            <input id="hangout-title" v-model="form.title" class="form-control" maxlength="60" :aria-invalid="Boolean(errorFor('title'))" aria-describedby="hangout-title-help" placeholder="e.g. Jio makan + arcade this weekend?">
            <div id="hangout-title-help" class="form-text">{{ form.title.trim().length }}/60</div>
          </div>
          <div class="mb-4">
            <label class="form-label" for="hangout-description">Description <span class="text-body-secondary fw-normal">(optional)</span></label>
            <textarea id="hangout-description" v-model="form.description" class="form-control" rows="3" maxlength="200" :aria-invalid="Boolean(errorFor('description'))" aria-describedby="hangout-description-help"></textarea>
            <div id="hangout-description-help" class="form-text">{{ form.description.trim().length }}/200</div>
          </div>
          <fieldset>
            <legend class="form-label">Interests <span class="text-body-secondary fw-normal">(pick 1–{{ MAX_INTERESTS }})</span></legend>
            <div id="hangout-interests" class="interest-chips" tabindex="-1">
              <button v-for="tag in CATEGORIES" :key="tag" type="button" class="interest-chip" :aria-pressed="form.interests.includes(tag)" :disabled="!form.interests.includes(tag) && form.interests.length >= MAX_INTERESTS" @click="toggleInterest(tag)">{{ tag }}</button>
            </div>
            <p class="form-text" aria-live="polite">{{ form.interests.length }} of {{ MAX_INTERESTS }} chosen</p>
          </fieldset>
        </template>

        <template v-else-if="step === 2">
          <div v-if="form.mode === 'group'" class="row g-3">
            <p class="text-body-secondary mb-0">Choose up to {{ MAX_GROUP_DAYS }} days. Everyone marks when they’re free, and you lock the best time later.</p>
            <div class="col-sm-6"><label class="form-label" for="hangout-startDate">First possible day</label><input id="hangout-startDate" v-model="form.startDate" type="date" class="form-control" :min="today" :aria-invalid="Boolean(errorFor('startDate'))"></div>
            <div class="col-sm-6"><label class="form-label" for="hangout-endDate">Last possible day</label><input id="hangout-endDate" v-model="form.endDate" type="date" class="form-control" :min="form.startDate || today" :aria-invalid="Boolean(errorFor('endDate'))"></div>
            <p v-if="rangeDays" class="form-text mt-1" aria-live="polite">{{ rangeDays }} {{ rangeDays === 1 ? 'day' : 'days' }} in Singapore time</p>
          </div>
          <div v-else class="row g-3">
            <div class="col-sm-4"><label class="form-label" for="hangout-date">Date</label><input id="hangout-date" v-model="form.date" type="date" class="form-control" :min="today" :aria-invalid="Boolean(errorFor('date'))"></div>
            <div class="col-6 col-sm-4"><label class="form-label" for="hangout-startTime">Starts</label><input id="hangout-startTime" v-model="form.startTime" type="time" step="1800" class="form-control" :aria-invalid="Boolean(errorFor('startTime'))"></div>
            <div class="col-6 col-sm-4"><label class="form-label" for="hangout-endTime">Ends</label><input id="hangout-endTime" v-model="form.endTime" type="time" step="1800" class="form-control" :aria-invalid="Boolean(errorFor('endTime'))"></div>
            <p class="form-text mt-1">Between 1 and 12 hours, Singapore time.</p>
          </div>
          <div v-if="form.mode !== 'solo'" class="mt-4" style="max-width: 16rem">
            <label class="form-label" for="hangout-capacity">How many people, including you?</label>
            <input id="hangout-capacity" v-model.number="form.capacity" type="number" class="form-control" :min="CAPACITY_RANGE.min" :max="CAPACITY_RANGE.max" :aria-invalid="Boolean(errorFor('capacity'))" aria-describedby="hangout-capacity-help">
            <div id="hangout-capacity-help" class="form-text">{{ CAPACITY_RANGE.min }}–{{ CAPACITY_RANGE.max }} people</div>
          </div>
        </template>

        <template v-else-if="step === 3">
          <p class="text-body-secondary">Where does the outing start? This anchors travel times for the plan.</p>
          <div v-if="form.startArea" id="hangout-startArea" class="area-confirmed" tabindex="-1">
            <span class="area-pin" aria-hidden="true"></span>
            <span><strong>{{ form.startArea.name }}</strong><br><span class="text-body-secondary small">{{ form.startArea.address }}</span><span v-if="!Number.isFinite(form.startArea.lat)" class="d-block small text-danger">No map location. Choose a OneMap suggestion instead.</span></span>
            <button type="button" class="btn btn-outline-secondary btn-sm ms-auto" @click="form.startArea = null">Change</button>
          </div>
          <div v-else id="hangout-startArea" tabindex="-1">
            <AddressSearch label="Start area" input-id="hangout-area-search" @select="setArea" />
          </div>
        </template>

        <template v-else>
          <dl class="review-slip">
            <div><dt>Type</dt><dd>{{ modeLabel }}</dd></div>
            <div><dt>Title</dt><dd>{{ form.title.trim() }}</dd></div>
            <div v-if="form.description.trim()"><dt>About</dt><dd class="keep-line-breaks">{{ form.description.trim() }}</dd></div>
            <div><dt>Interests</dt><dd class="text-capitalize">{{ form.interests.join(', ') }}</dd></div>
            <div><dt>When</dt><dd>{{ whenSummary }}</dd></div>
            <div><dt>Starts from</dt><dd>{{ form.startArea?.name }}</dd></div>
            <div v-if="form.mode !== 'solo'"><dt>Group size</dt><dd>Up to {{ form.capacity }} people, including you</dd></div>
          </dl>
          <fieldset v-if="form.mode !== 'solo'" class="mt-4">
            <legend class="form-label">How do people join?</legend>
            <div id="hangout-joinMode" class="join-options" tabindex="-1">
              <label v-for="(label, value) in JOIN_MODE_LABELS" :key="value" class="join-option" :class="{ 'is-selected': form.joinMode === value }">
                <input v-model="form.joinMode" type="radio" name="hangout-join" :value="value" class="form-check-input mt-1">
                <span><strong>{{ label.title }}</strong><span class="d-block small text-body-secondary">{{ label.detail }}</span></span>
              </label>
            </div>
          </fieldset>
          <p class="form-text mt-3">Creating a hangout doesn’t book or reserve anything.</p>
          <div v-if="errorMessage" class="alert alert-danger mt-3" role="alert">{{ errorMessage }}</div>
        </template>

        <div class="wizard-actions">
          <button v-if="step > 1" type="button" class="btn btn-outline-secondary" :disabled="publishing" @click="back">Back</button>
          <button v-if="step < 4" type="button" class="btn btn-primary ms-auto" @click="next">Next</button>
          <button v-else type="button" class="btn btn-primary ms-auto" :disabled="publishing" @click="publish">
            <span v-if="publishing" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
            {{ publishing ? 'Creating…' : 'Create hangout' }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.hangout-head { margin-bottom: 1.25rem; }
.hangout-head p:last-child { color: var(--bookedz-muted); max-width: 60ch; margin: 0; }
.hangout-washi { display: inline-block; margin: 0 0 12px; padding: 4px 12px; background: var(--bookedz-teal-soft); color: var(--bookedz-teal-ink); font-size: .75rem; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; transform: rotate(-1.5deg); }
.hangout-panel { max-width: 48rem; }
.step-heading { font-size: 1.35rem; margin-bottom: 1rem; }
.step-heading:focus { outline: none; }
.mode-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.mode-card { position: relative; display: flex; flex-direction: column; gap: 4px; min-height: 44px; padding: 14px; border: 1px solid var(--bookedz-control-border); border-radius: var(--bookedz-radius-control); background: var(--bookedz-surface); cursor: pointer; transition: border-color var(--bookedz-motion-fast) var(--bookedz-ease), box-shadow var(--bookedz-motion-normal) var(--bookedz-ease); }
.mode-card:hover { box-shadow: var(--bookedz-neutral-shadow); }
.mode-card.is-selected { border: 2px solid var(--bookedz-fill); background: var(--bookedz-orange-soft); padding: 13px; }
.mode-card:has(input:focus-visible) { outline: 3px solid var(--bookedz-focus); outline-offset: 2px; }
.visually-hidden-focusable-input { position: absolute; opacity: 0; pointer-events: none; }
.mode-title { font-family: var(--bookedz-heading); font-weight: 800; }
.mode-detail { font-size: .8rem; color: var(--bookedz-muted); line-height: 1.4; }
.interest-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.interest-chip { min-height: 44px; padding: 8px 16px; border: 1px solid var(--bookedz-control-border); border-radius: 99px; background: var(--bookedz-surface); color: var(--bookedz-ink); font-weight: 600; text-transform: capitalize; transition: background-color var(--bookedz-motion-fast) var(--bookedz-ease); }
.interest-chip[aria-pressed=true] { background: var(--bookedz-teal-soft); border-color: var(--bookedz-teal); color: var(--bookedz-teal-ink); }
.interest-chip[aria-pressed=true]::before { content: '✓ '; }
.interest-chip:disabled { color: var(--bookedz-disabled-ink); background: var(--bookedz-disabled-bg); cursor: not-allowed; }
.area-confirmed { display: flex; align-items: center; gap: 12px; padding: 14px; border: 1px solid var(--bookedz-border); border-radius: var(--bookedz-radius-control); background: var(--bookedz-glass-solid); }
.area-pin { flex: none; width: 18px; height: 18px; border-radius: 50% 50% 50% 3px; transform: rotate(-45deg); background: var(--bookedz-fill); }
.review-slip { margin: 0; padding: 18px 20px; border: 1px dashed var(--bookedz-control-border); border-radius: var(--bookedz-radius-control); background: var(--bookedz-glass-solid); }
.review-slip div { display: grid; grid-template-columns: 8rem 1fr; gap: 12px; padding: 8px 0; }
.review-slip div + div { border-top: 1px dashed var(--bookedz-border); }
.review-slip dt { color: var(--bookedz-muted); font-weight: 600; font-size: .85rem; }
.review-slip dd { margin: 0; overflow-wrap: anywhere; }
.join-options { display: grid; gap: 8px; }
.join-option { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border: 1px solid var(--bookedz-control-border); border-radius: var(--bookedz-radius-control); cursor: pointer; }
.join-option.is-selected { border: 2px solid var(--bookedz-fill); background: var(--bookedz-orange-soft); padding: 11px 13px; }
.wizard-actions { display: flex; gap: 10px; margin-top: 1.75rem; padding-top: 1.25rem; border-top: 1px dashed var(--bookedz-border); }
@media (max-width: 767.98px) { .mode-grid { grid-template-columns: 1fr; } .review-slip div { grid-template-columns: 1fr; gap: 2px; } }
@media (prefers-reduced-motion: reduce) { .hangout-washi { transform: none; } }
</style>
