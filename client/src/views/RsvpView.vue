<script setup>
import { ref, computed, watch, onBeforeUnmount, nextTick } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useDiscoveryMotion } from '../composables/useDiscoveryMotion'
import EventSummary from '../components/EventSummary.vue'
import AnnouncementFeed from '../components/event-operations/AnnouncementFeed.vue'
import ClashWarning from '../components/ClashWarning.vue'
import VenueMap from '../components/VenueMap.vue'
import RsvpStatusBadge from '../components/RsvpStatusBadge.vue'
import {
  getEvent,
  getUser,
  getMyRsvps,
  createRsvp,
  getCurrentUser,
  CURRENT_USER_ID,
  ACTIVE_STATUSES,
  JOINED_STATUSES,
  USING_SUPABASE,
} from '../utils/api.js'
import { eventsOverlap } from '../utils/helpers.js'

const pageMotion = ref(null)
useDiscoveryMotion(pageMotion)
const route = useRoute()
const eventId = computed(() => String(route.params.id))

const event = ref(null)
const myRsvps = ref([])
const name = ref('')
const email = ref('')
const answers = ref({}) // { questionId: answer }

const loading = ref(true)
const submitting = ref(false)
const triedSubmit = ref(false) // only show form errors after the first try
const errorMessage = ref('')
const result = ref(null) // the RSVP we get back after submitting
const signedIn = ref(false)
const validationSummary = ref(null)

let loadRequest = 0
watch(eventId, async (id) => {
  const ticket = ++loadRequest
  loading.value = true
  event.value = null
  result.value = null
  errorMessage.value = ''
  myRsvps.value = []
  answers.value = {}
  name.value = ''
  email.value = ''
  triedSubmit.value = false
  submitting.value = false
  try {
    const loadedEvent = await getEvent(id)
    if (ticket !== loadRequest) return
    event.value = loadedEvent
    for (const question of loadedEvent.questions) answers.value[question.id] = ''
    const sessionUser = await getCurrentUser()
    if (ticket !== loadRequest) return
    signedIn.value = Boolean(sessionUser)
    if (sessionUser) {
      const [user, rsvps] = await Promise.all([getUser(CURRENT_USER_ID), getMyRsvps(CURRENT_USER_ID)])
      if (ticket !== loadRequest) return
      myRsvps.value = rsvps
      name.value = user.name
      email.value = user.email
    }
  } catch (error) {
    if (ticket === loadRequest) errorMessage.value = 'Could not load this event: ' + error.message
  } finally {
    if (ticket === loadRequest) loading.value = false
  }
}, { immediate: true })
onBeforeUnmount(() => { loadRequest++ })

// Public-feed refresh updates shared event details without resetting RSVP drafts.
function applyPublicEvent(latest) {
  if (latest.id !== eventId.value || event.value?.id !== latest.id) return
  event.value = latest
  for (const question of latest.questions) {
    if (!(question.id in answers.value)) answers.value[question.id] = ''
  }
}

// If they already RSVP'd to this event, show that instead of the form
const existingRsvp = computed(() =>
  myRsvps.value.find((r) => r.eventId === eventId.value && ACTIVE_STATUSES.includes(r.status)),
)

// Events they've joined that overlap this one
const clashes = computed(() => {
  if (!event.value) return []
  return myRsvps.value
    .filter((r) => r.eventId !== eventId.value && JOINED_STATUSES.includes(r.status))
    .filter((r) => eventsOverlap(r.event, event.value))
    .map((r) => r.event)
})

const formErrors = computed(() => {
  const errors = []
  if (name.value.trim() === '') errors.push('Please enter your name.')
  if (!email.value.includes('@')) errors.push('Please enter a valid email.')
  for (const question of event.value.questions) {
    if (question.required && String(answers.value[question.id]).trim() === '') {
      errors.push('Please answer: ' + question.text)
    }
  }
  return errors
})

// Tell them what will happen BEFORE they press the button
const whatHappensNext = computed(() => {
  if (event.value.requiresApproval)
    return 'The organiser reviews each RSVP. You will see the result in My RSVPs.'
  if (event.value.spotsLeft > 0) {
    return `${event.value.spotsLeft} spot${event.value.spotsLeft === 1 ? '' : 's'} left, so you will be confirmed straight away.`
  }
  return 'This event is full, so you will join the waitlist. If a spot opens up, you get 24 hours to take it.'
})

async function submitRsvp() {
  if (submitting.value || !signedIn.value || event.value?.isOnTeam) return
  triedSubmit.value = true
  if (formErrors.value.length > 0) {
    await nextTick()
    validationSummary.value?.focus()
    return
  }

  const ticket = loadRequest
  submitting.value = true
  errorMessage.value = ''
  try {
    const savedRsvp = await createRsvp({
      eventId: eventId.value,
      userId: CURRENT_USER_ID,
      name: name.value.trim(),
      email: email.value.trim(),
      answers: answers.value,
    })
    if (ticket === loadRequest) result.value = savedRsvp
    // Refresh "spots left" / waitlist count; a failed refresh must not hide the saved RSVP
    try {
      const refreshed = await getEvent(eventId.value)
      if (ticket === loadRequest) event.value = refreshed
    } catch { /* keep the old counts */ }
  } catch (error) {
    if (ticket === loadRequest) errorMessage.value = error.message
  } finally {
    if (ticket === loadRequest) submitting.value = false
  }
}
</script>

<template>
  <div ref="pageMotion" class="public-event-page">
  <div class="rsvp-intro">
    <RouterLink to="/events" class="rsvp-back">&larr; All events</RouterLink>
  </div>

  <div class="row g-4 mt-1 participant-rsvp">
    <!-- Public context and updates come first in both DOM and mobile reading order. -->
    <div class="col-lg-8 order-1 event-public-details">
      <EventSummary v-if="event" :event="event" heading-tag="h1">
        <VenueMap v-if="event.venue?.lat" :lat="event.venue.lat" :lng="event.venue.lng" class="my-3" />
        <hr />
        <p v-if="event.spotsLeft > 0" class="mb-0 text-success fw-semibold">
          {{ event.spotsLeft }} of {{ event.capacity }} spots left
        </p>
        <p v-else class="mb-0 text-warning-emphasis fw-semibold">
          Full · {{ event.waitlistCount }} on the waitlist
        </p>
      </EventSummary>
      <AnnouncementFeed :event-id="eventId" :load-event="getEvent" @refreshed="applyPublicEvent" />
    </div>

    <!-- RSVP actions and private-data states follow the public context. -->
    <div id="rsvp" data-scroll-reveal class="col-lg-4 order-2 rsvp-action-panel">
      <div v-if="loading" class="text-center my-5" role="status" aria-live="polite">
        <div class="spinner-border text-primary" aria-hidden="true"></div>
        <span class="visually-hidden">Loading event and RSVP information…</span>
      </div>
      <div v-else-if="!event" class="alert alert-danger mt-3" role="alert">{{ errorMessage }}</div>
      <template v-else>
      <div v-if="!signedIn" class="card card-body shadow-sm rsvp-state rsvp-state--signin">
        <span class="state-mark" aria-hidden="true">↗</span>
        <h2 class="h4">Save your place</h2>
        <p>Sign in to RSVP. Event details and announcements are available beside this form.</p>
        <RouterLink :to="{ path: '/login', query: { redirect: route.fullPath } }" class="btn event-cta align-self-start">Sign in to RSVP</RouterLink>
      </div>
      <!-- After submitting -->
      <div v-else-if="result" class="card card-body shadow-sm rsvp-state rsvp-state--success" role="status" aria-live="polite">
        <span class="state-mark" aria-hidden="true">✓</span>
        <h2 class="h4">RSVP sent</h2>
        <p class="mb-2">Status: <RsvpStatusBadge :status="result.status" /></p>
        <p v-if="result.status === 'confirmed'">See you there. We've saved your spot.</p>
        <p v-else-if="result.status === 'pending'">The organiser will review your RSVP soon.</p>
        <p v-else>
          You're on the waitlist. If a spot opens up you'll see a banner on My RSVPs and have 24
          hours to confirm.
        </p>
        <div class="d-flex gap-2">
          <RouterLink to="/my-rsvps" class="btn event-cta">Go to My RSVPs</RouterLink>
          <RouterLink to="/events" class="btn event-cta event-cta--secondary">Back to events</RouterLink>
        </div>
      </div>

      <!-- Already RSVP'd before -->
      <div v-else-if="existingRsvp" class="card card-body shadow-sm rsvp-state">
        <span class="state-mark" aria-hidden="true">✓</span>
        <h2 class="h4">You already RSVP'd</h2>
        <p>Status: <RsvpStatusBadge :status="existingRsvp.status" /></p>
        <RouterLink to="/my-rsvps" class="btn event-cta align-self-start"
          >Manage in My RSVPs</RouterLink
        >
      </div>

      <!-- The RSVP form -->
      <div v-else-if="event.isOnTeam" class="alert alert-info" role="status">Organisers and helpers can't RSVP to their own event.</div>
      <form v-else class="card card-body shadow-sm rsvp-form" @submit.prevent="submitRsvp" novalidate>
        <div class="form-heading">
          <div>
            <h2 class="h4 mb-1">Count me in</h2>
            <p class="form-text mt-0 mb-0">Your profile details are ready. Edit anything that’s changed.</p>
          </div>
          <span class="form-spark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4Z"/><path d="m9 12 2 2 4-4"/></svg></span>
        </div>

        <div class="row">
          <div class="col-md-6 mb-3">
            <label for="name" class="form-label">Name</label>
            <input id="name" class="form-control" v-model="name" :aria-invalid="triedSubmit && !name.trim() ? 'true' : undefined" :aria-describedby="triedSubmit && !name.trim() ? 'name-error' : undefined" />
            <div v-if="triedSubmit && !name.trim()" id="name-error" class="invalid-feedback d-block">Please enter your name.</div>
          </div>
          <div class="col-md-6 mb-3">
            <label for="email" class="form-label">Email</label>
            <input id="email" type="email" class="form-control" v-model="email" :aria-invalid="triedSubmit && !email.includes('@') ? 'true' : undefined" :aria-describedby="triedSubmit && !email.includes('@') ? 'email-error' : undefined" />
            <div v-if="triedSubmit && !email.includes('@')" id="email-error" class="invalid-feedback d-block">Please enter a valid email.</div>
          </div>
        </div>

        <template v-if="event.questions.length > 0">
          <h3 class="h6 mt-2">Questions from the organiser</h3>
          <div v-for="question in event.questions" :key="question.id" class="mb-3">
            <template v-if="question.type === 'yesno'">
              <fieldset class="border-0 p-0 m-0">
                <legend class="form-label fs-6 mb-2">
                  {{ question.text }}
                  <span v-if="question.required" class="text-danger">(required)</span>
                </legend>
                <div class="form-check form-check-inline">
                  <input class="form-check-input" type="radio" :name="question.id" :id="question.id + '-yes'" value="yes" v-model="answers[question.id]" :required="question.required" :aria-invalid="triedSubmit && question.required && !String(answers[question.id] || '').trim() ? 'true' : undefined" :aria-describedby="triedSubmit && question.required && !String(answers[question.id] || '').trim() ? question.id + '-error' : undefined" />
                  <label class="form-check-label" :for="question.id + '-yes'">Yes</label>
                </div>
                <div class="form-check form-check-inline">
                  <input class="form-check-input" type="radio" :name="question.id" :id="question.id + '-no'" value="no" v-model="answers[question.id]" :required="question.required" :aria-invalid="triedSubmit && question.required && !String(answers[question.id] || '').trim() ? 'true' : undefined" :aria-describedby="triedSubmit && question.required && !String(answers[question.id] || '').trim() ? question.id + '-error' : undefined" />
                  <label class="form-check-label" :for="question.id + '-no'">No</label>
                </div>
                <div v-if="triedSubmit && question.required && !String(answers[question.id] || '').trim()" :id="question.id + '-error'" class="invalid-feedback d-block">Please answer: {{ question.text }}</div>
              </fieldset>
            </template>
            <template v-else>
              <label class="form-label" :for="question.id">
                {{ question.text }}
                <span v-if="question.required" class="text-danger">*</span>
              </label>

              <input
                v-if="question.type === 'text'"
                :id="question.id"
                class="form-control"
                v-model="answers[question.id]"
                :required="question.required"
                :aria-invalid="triedSubmit && question.required && !String(answers[question.id] || '').trim() ? 'true' : undefined"
                :aria-describedby="triedSubmit && question.required && !String(answers[question.id] || '').trim() ? question.id + '-error' : undefined"
              />
              <div v-if="triedSubmit && question.required && !String(answers[question.id] || '').trim()" :id="question.id + '-error'" class="invalid-feedback d-block">Please answer: {{ question.text }}</div>
            </template>
          </div>
        </template>

        <ClashWarning :clashes="clashes" />

        <div class="rsvp-next"><span class="next-icon" aria-hidden="true">i</span><p>{{ whatHappensNext }}</p></div>

        <div v-if="triedSubmit && formErrors.length > 0" ref="validationSummary" class="alert alert-danger" role="alert" aria-live="assertive" tabindex="-1">
          <ul class="mb-0">
            <li v-for="error in formErrors" :key="error">{{ error }}</li>
          </ul>
        </div>
        <div v-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>

        <button type="submit" class="btn event-cta rsvp-submit" :disabled="submitting">
          <span v-if="submitting" class="spinner-border spinner-border-sm me-2"></span>
          {{ submitting ? 'Sending…' : 'RSVP' }}
        </button>
      </form>
      </template>
    </div>
  </div>
  </div>
</template>

<style scoped>
.form-spark svg { width: 24px; height: 24px; }
.rsvp-action-panel { scroll-margin-top: 110px; }
@media(min-width:992px) { .rsvp-action-panel :deep(.col-md-6) { width: 100%; }.rsvp-action-panel .event-cta { width: 100%; }.rsvp-action-panel .d-flex { flex-wrap: wrap; }.rsvp-action-panel { position: sticky; top: 110px; } }
.rsvp-intro { display: grid; grid-template-columns: 1fr; gap: .15rem; margin-bottom: .8rem; }
.rsvp-back { display: inline-flex; align-items: center; min-height: 40px; width: fit-content; color: var(--bookedz-ink); font-weight: 650; text-decoration-color: var(--bookedz-border); text-underline-offset: 4px; transition: transform var(--bookedz-motion-fast) ease; }
.rsvp-back:hover { transform: translateX(-3px); }
.rsvp-kicker { margin: .8rem 0 0; color: var(--bookedz-primary-dark); font-size: .82rem; font-weight: 700; }
.rsvp-lede { margin: 0; font: 600 clamp(1.45rem, 2.5vw, 2rem)/1.15 var(--bookedz-heading); letter-spacing: -.035em; color: var(--bookedz-ink); }
.participant-rsvp { --rsvp-panel: var(--bookedz-surface); align-items: start; }
.participant-rsvp > [class*="col-"] { min-width: 0; }
.participant-rsvp :deep(.card) { overflow: hidden; border: 1px solid var(--bookedz-border); border-radius: var(--bookedz-radius-card, 24px); background: var(--rsvp-panel); box-shadow: var(--bookedz-card-shadow); }
.participant-rsvp :deep(.card-body) { padding: clamp(1.1rem, 3vw, 1.8rem); }
.rsvp-form { position: relative; }
.form-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; padding-bottom: 1.15rem; margin-bottom: 1.25rem; border-bottom: 1px solid var(--bookedz-border); }
.form-spark { display: grid; place-items: center; flex: 0 0 42px; width: 42px; height: 42px; border-radius: 14px; color: var(--bookedz-ink); background: var(--bookedz-yellow); font-size: 1.4rem; }
.rsvp-state { position: relative; padding-top: 2rem !important; }
.rsvp-state--signin { background: linear-gradient(145deg, var(--bookedz-surface), var(--bookedz-mint)); }
.rsvp-state--success { border-color: var(--bookedz-success) !important; background: linear-gradient(145deg, var(--bookedz-surface), var(--bookedz-mint)); animation: confirmation-arrive 520ms cubic-bezier(.2,.8,.2,1) both; }
.state-mark { display: grid; place-items: center; width: 46px; height: 46px; margin-bottom: 1rem; border-radius: 15px; color: var(--bookedz-ink); background: var(--bookedz-yellow); font-size: 1.4rem; font-weight: 800; }
.rsvp-state--success .state-mark { color: var(--bookedz-on-action); background: var(--bookedz-success); }
.rsvp-next { display: flex; align-items: flex-start; gap: .7rem; margin: .4rem 0 1rem; padding: .9rem 1rem; border-radius: 14px; color: var(--bookedz-ink); background: color-mix(in srgb, var(--bookedz-mint) 32%, var(--bookedz-surface)); }
.rsvp-next p { margin: 0; font-size: .9rem; }
.next-icon { display: grid; flex: 0 0 22px; place-items: center; width: 22px; height: 22px; border-radius: 50%; color: var(--bookedz-surface); background: var(--bookedz-forest); font-size: .75rem; font-weight: 800; }
.rsvp-submit { min-width: 155px; }
.participant-rsvp :deep(.form-control) { min-height: 45px; border-color: var(--bookedz-border); border-radius: 11px; }
.participant-rsvp :deep(.form-control:focus) { border-color: var(--bookedz-primary-dark); box-shadow: var(--bookedz-focus-glow); }
.participant-rsvp :deep(:focus-visible) { outline: 3px solid var(--bookedz-primary-dark); outline-offset: 3px; }
@keyframes confirmation-arrive { from { opacity: 0; transform: translateY(10px) scale(.99); } to { opacity: 1; transform: translateY(0) scale(1); } }
@media (max-width: 991.98px) { .rsvp-intro { margin-bottom: .25rem; } }
@media (max-width: 575px) { .participant-rsvp { --bs-gutter-x: 1rem; } .rsvp-lede { max-width: 18ch; } .rsvp-state .d-flex { flex-direction: column; align-items: stretch; } .rsvp-state .btn { width: 100%; } }
@media (prefers-reduced-motion: reduce) { .rsvp-back, .rsvp-state--success { animation: none; transition: none; } }
</style>
