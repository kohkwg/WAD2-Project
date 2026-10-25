<script setup>
import { ref, computed, onMounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import EventSummary from '../components/EventSummary.vue'
import ClashWarning from '../components/ClashWarning.vue'
import VenueMap from '../components/VenueMap.vue'
import RsvpStatusBadge from '../components/RsvpStatusBadge.vue'
import {
  getEvent,
  getUser,
  getMyRsvps,
  createRsvp,
  ACTIVE_STATUSES,
  JOINED_STATUSES,
} from '../utils/api.js'
import { eventsOverlap } from '../utils/helpers.js'

const route = useRoute()
const eventId = route.params.id // e.g. "e1" from /events/e1/rsvp

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

onMounted(async () => {
  try {
    event.value = await getEvent(eventId)
    const user = await getUser() // whoever is signed in
    myRsvps.value = await getMyRsvps()

    // Automation: fill in details from the participant's profile
    name.value = user.name
    email.value = user.email

    // Start every question with an empty answer
    for (const question of event.value.questions) {
      answers.value[question.id] = ''
    }
  } catch (error) {
    errorMessage.value = 'Could not load this event: ' + error.message
  } finally {
    loading.value = false
  }
})

// If they already RSVP'd to this event, show that instead of the form
const existingRsvp = computed(() =>
  myRsvps.value.find((r) => r.eventId === eventId && ACTIVE_STATUSES.includes(r.status)),
)

// Events they've joined that overlap this one
const clashes = computed(() => {
  if (!event.value) return []
  return myRsvps.value
    .filter((r) => r.eventId !== eventId && JOINED_STATUSES.includes(r.status))
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
  if (formErrors.value.length > 0) return

  submitting.value = true
  errorMessage.value = ''
  try {
    result.value = await createRsvp({
      eventId: eventId,
      name: name.value.trim(),
      email: email.value.trim(),
      answers: answers.value,
    })
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <RouterLink to="/events" class="small">&larr; All events</RouterLink>

  <!-- Only ONE of these shows: loading spinner → event not found → the RSVP page -->
  <div v-if="loading" class="text-center my-5">
    <div class="spinner-border text-primary" role="status"></div>
  </div>

  <!-- Loading finished but no event came back (e.g. a bad id in the URL) -->
  <div v-else-if="!event" class="alert alert-danger mt-3">{{ errorMessage }}</div>

  <div v-else class="row g-4 mt-1">
    <!-- Left: the form (or the result) -->
    <div class="col-lg-7 order-2 order-lg-1">
      <!-- After submitting -->
      <!-- Left column shows ONE of: result (just submitted) → already RSVP'd → the form -->
      <!-- h-100 = fill the column's full height, so this card matches the event card beside it -->
      <div v-if="result" class="card card-body shadow-sm h-100">
        <h2 class="h4">RSVP sent</h2>
        <p class="mb-2">Status: <RsvpStatusBadge :status="result.status" /></p>
        <!-- Message depends on the status we got back; v-else covers waitlisted -->
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
      <div v-else-if="existingRsvp" class="card card-body shadow-sm h-100">
        <h2 class="h4">You already RSVP'd</h2>
        <p>Status: <RsvpStatusBadge :status="existingRsvp.status" /></p>
        <RouterLink to="/my-rsvps" class="btn btn-primary align-self-start"
          >Manage in My RSVPs</RouterLink
        >
      </div>

      <!-- The RSVP form -->
      <!-- .prevent stops the page reloading; novalidate turns off browser pop-ups so our formErrors show instead -->
      <form
        v-else
        class="card card-body shadow-sm h-100"
        @submit.prevent="submitRsvp"
        novalidate
      >
        <h2 class="h4 mb-1">RSVP</h2>
        <p class="form-text mt-0">
          Your details are filled in from your profile. Change them if needed.
        </p>

        <div class="row">
          <div class="col-md-6 mb-3">
            <label for="name" class="form-label">Name</label>
            <input id="name" class="form-control" v-model="name" />
          </div>
          <div class="col-md-6 mb-3">
            <label for="email" class="form-label">Email</label>
            <input id="email" type="email" class="form-control" v-model="email" />
          </div>
        </div>

        <!-- Only show this section if the organiser added questions -->
        <template v-if="event.questions.length > 0">
          <h3 class="h6 mt-2 mb-3">Questions from the organiser</h3>
          <div v-for="question in event.questions" :key="question.id" class="mb-3">
            <label class="form-label" :for="question.id">
              {{ question.text }}
              <span v-if="question.required" class="text-danger">*</span>
            </label>

            <!-- 'text' question → text box; otherwise (v-else) it's yes/no → two radios. Answers are saved under answers[question.id] -->
            <input
              v-if="question.type === 'text'"
              :id="question.id"
              class="form-control"
              v-model="answers[question.id]"
            />

            <div v-else>
              <div class="form-check form-check-inline">
                <input
                  class="form-check-input"
                  type="radio"
                  :name="question.id"
                  :id="question.id + '-yes'"
                  value="yes"
                  v-model="answers[question.id]"
                />
                <label class="form-check-label" :for="question.id + '-yes'">Yes</label>
              </div>
              <div class="form-check form-check-inline">
                <input
                  class="form-check-input"
                  type="radio"
                  :name="question.id"
                  :id="question.id + '-no'"
                  value="no"
                  v-model="answers[question.id]"
                />
                <label class="form-check-label" :for="question.id + '-no'">No</label>
              </div>
            </div>
          </div>
        </template>

        <!-- Footer of the card: mt-auto pushes it to the bottom, so the button lines up with
             the "spots left" line in the event card instead of floating in the middle -->
        <div class="mt-auto pt-3 border-top">
          <!-- Warns if this event overlaps another event you've already joined (shows nothing if no clash) -->
          <ClashWarning :clashes="clashes" />

          <!-- Tells the user what happens next: needs approval / confirmed now / goes to waitlist -->
          <div class="alert alert-light border small">{{ whatHappensNext }}</div>

          <!-- Validation errors only appear after the first submit attempt (triedSubmit) -->
          <div v-if="triedSubmit && formErrors.length > 0" class="alert alert-danger">
            <ul class="mb-0">
              <li v-for="error in formErrors" :key="error">{{ error }}</li>
            </ul>
          </div>
          <!-- Error from the API/server, separate from form validation -->
          <div v-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>

          <!-- Disabled while sending so it can't be submitted twice -->
          <button type="submit" class="btn btn-primary px-4" :disabled="submitting">
            <span v-if="submitting" class="spinner-border spinner-border-sm me-2"></span>
            {{ submitting ? 'Sending…' : 'RSVP' }}
          </button>
        </div>
      </form>
    </div>

    <!-- Right: event details (shown first on phones) -->
    <div class="col-lg-5 order-1 order-lg-2">
      <!-- class="h-100" passes through to EventSummary's outer card, so both cards stretch equally -->
      <EventSummary :event="event" class="h-100">
        <!-- Read-only map (no draggable) so participants can see where the event is -->
        <VenueMap
          v-if="event.venue.lat"
          :lat="event.venue.lat"
          :lng="event.venue.lng"
          class="my-3"
        />
        <!-- Everything inside <EventSummary> goes into its <slot> at the bottom of the card -->
        <hr />
        <p v-if="event.spotsLeft > 0" class="mb-0 text-success fw-semibold">
          {{ event.spotsLeft }} of {{ event.capacity }} spots left
        </p>
        <p v-else class="mb-0 text-warning-emphasis fw-semibold">
          Full · {{ event.waitlistCount }} on the waitlist
        </p>
      </EventSummary>
    </div>
  </div>
</template>
