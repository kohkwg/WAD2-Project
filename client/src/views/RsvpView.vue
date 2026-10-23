<script setup>
import { ref, computed, watch, onBeforeUnmount, nextTick } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
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
import FloorPlan from '../editor.vue'
import { eventsOverlap } from '../utils/helpers.js'

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
  <RouterLink to="/events" class="small">&larr; All events</RouterLink>

  <div class="row g-4 mt-1">
    <!-- Public context and updates come first in both DOM and mobile reading order. -->
    <div class="col-lg-5 order-1 order-lg-2">
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
      <!-- Feature 6: read-only floor plan; renders nothing when the event has none -->
      <FloorPlan v-if="USING_SUPABASE" :key="eventId" :event-id="eventId" read-only />
    </div>

    <!-- RSVP actions and private-data states follow the public context. -->
    <div class="col-lg-7 order-2 order-lg-1">
      <div v-if="loading" class="text-center my-5" role="status" aria-live="polite">
        <div class="spinner-border text-primary" aria-hidden="true"></div>
        <span class="visually-hidden">Loading event and RSVP information…</span>
      </div>
      <div v-else-if="!event" class="alert alert-danger mt-3" role="alert">{{ errorMessage }}</div>
      <template v-else>
      <div v-if="!signedIn" class="card card-body shadow-sm">
        <h2 class="h4">Ready to RSVP?</h2>
        <p>Sign in to reserve a place. Event details and announcements are available above.</p>
        <RouterLink :to="{ path: '/login', query: { redirect: route.fullPath } }" class="btn btn-primary align-self-start">Sign in</RouterLink>
      </div>
      <!-- After submitting -->
      <div v-else-if="result" class="card card-body shadow-sm">
        <h2 class="h4">RSVP sent</h2>
        <p class="mb-2">Status: <RsvpStatusBadge :status="result.status" /></p>
        <p v-if="result.status === 'confirmed'">See you there. We've saved your spot.</p>
        <p v-else-if="result.status === 'pending'">The organiser will review your RSVP soon.</p>
        <p v-else>
          You're on the waitlist. If a spot opens up you'll see a banner on My RSVPs and have 24
          hours to confirm.
        </p>
        <div class="d-flex gap-2">
          <RouterLink to="/my-rsvps" class="btn btn-primary">Go to My RSVPs</RouterLink>
          <RouterLink to="/events" class="btn btn-outline-secondary">Back to events</RouterLink>
        </div>
      </div>

      <!-- Already RSVP'd before -->
      <div v-else-if="existingRsvp" class="card card-body shadow-sm">
        <h2 class="h4">You already RSVP'd</h2>
        <p>Status: <RsvpStatusBadge :status="existingRsvp.status" /></p>
        <RouterLink to="/my-rsvps" class="btn btn-primary align-self-start"
          >Manage in My RSVPs</RouterLink
        >
      </div>

      <!-- The RSVP form -->
      <form v-else class="card card-body shadow-sm" @submit.prevent="submitRsvp" novalidate>
        <h2 class="h4 mb-1">RSVP</h2>
        <p class="form-text mt-0">
          Your details are filled in from your profile. Change them if needed.
        </p>

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

        <div class="alert alert-light border small">{{ whatHappensNext }}</div>

        <div v-if="triedSubmit && formErrors.length > 0" ref="validationSummary" class="alert alert-danger" role="alert" aria-live="assertive" tabindex="-1">
          <ul class="mb-0">
            <li v-for="error in formErrors" :key="error">{{ error }}</li>
          </ul>
        </div>
        <div v-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>

        <button type="submit" class="btn btn-primary align-self-start" :disabled="submitting">
          <span v-if="submitting" class="spinner-border spinner-border-sm me-2"></span>
          {{ submitting ? 'Sending…' : 'RSVP' }}
        </button>
      </form>
      </template>
    </div>
  </div>
</template>
