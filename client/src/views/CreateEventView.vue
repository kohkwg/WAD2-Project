<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import StepIndicator from '../components/StepIndicator.vue'
import AddressSearch from '../components/AddressSearch.vue'
import VenueMap from '../components/VenueMap.vue'
import EventSummary from '../components/EventSummary.vue'
import { createEvent } from '../utils/api.js'
import { TAG_OPTIONS, suggestTags, toDateTimeInputValue } from '../utils/helpers.js'

// Multi-step form (progressive disclosure): one small chunk at a time instead of one long page.

const router = useRouter()

const steps = ['Basics', 'Venue', 'RSVP questions', 'Review']
const step = ref(1)
const showErrors = ref(false) // only show errors after they press Next
const publishing = ref(false)
const errorMessage = ref('')

// Everything the organiser fills in, across all steps
const form = ref({
  title: '',
  description: '',
  tags: [],
  startTime: '', // from <input type="datetime-local">, e.g. "2026-10-20T19:00"
  endTime: '',
  capacity: 30,
  venue: null, // { name, address, postal, lat, lng } from OneMap
  isOutdoor: false,
  backupVenue: null, // used by Denzel's rain check
  requiresApproval: false,
  questions: [], // [{ id, text, type: 'text' | 'yesno', required }]
})

// The question currently being typed in step 3
const newQuestion = ref({ text: '', type: 'text', required: false })

// Stops people picking a date in the past
const nowForInput = toDateTimeInputValue(new Date())

// ---------- Step 1: tag suggestions (automation) ----------

const suggestedTags = computed(() =>
  suggestTags(form.value.title + ' ' + form.value.description).filter(
    (tag) => !form.value.tags.includes(tag),
  ),
)

function addTag(tag) {
  form.value.tags.push(tag)
}

// ---------- Checking each step before moving on ----------

const stepErrors = computed(() => {
  const f = form.value
  const errors = []

  if (step.value === 1) {
    if (f.title.trim() === '') errors.push('Give your event a title.')
    if (f.startTime === '' || f.endTime === '') {
      errors.push('Set a start and end time.')
    } else if (new Date(f.endTime) <= new Date(f.startTime)) {
      errors.push('The end time must be after the start time.')
    } else if (new Date(f.startTime) < new Date()) {
      errors.push('The start time cannot be in the past.')
    }
    if (!Number.isInteger(f.capacity) || f.capacity < 1) {
      errors.push('Capacity must be a whole number, at least 1.')
    }
    if (f.tags.length === 0) {
      errors.push('Pick at least one tag (used for recommendations and waitlist scoring).')
    }
  }

  if (step.value === 2) {
    if (!f.venue) errors.push('Choose the venue from the address search.')
    if (f.isOutdoor && !f.backupVenue) {
      errors.push('Outdoor events need a backup venue in case of rain.')
    }
  }

  return errors
})

function nextStep() {
  if (stepErrors.value.length > 0) {
    showErrors.value = true
    return
  }
  showErrors.value = false
  step.value++
}

function previousStep() {
  showErrors.value = false
  step.value--
}

// ---------- Step 2: venue ----------

function setVenue(place) {
  form.value.venue = place
}

// The pin was dragged or the map was clicked: only the coordinates change, the address stays
function moveVenuePin(position) {
  form.value.venue.lat = position.lat
  form.value.venue.lng = position.lng
}

function setBackupVenue(place) {
  form.value.backupVenue = place
}

// ---------- Step 3: custom RSVP questions ----------

function addQuestion() {
  if (newQuestion.value.text.trim() === '') return
  form.value.questions.push({
    id: 'q' + Date.now(),
    text: newQuestion.value.text.trim(),
    type: newQuestion.value.type,
    required: newQuestion.value.required,
  })
  newQuestion.value = { text: '', type: 'text', required: false } // clear the inputs
}

function removeQuestion(index) {
  form.value.questions.splice(index, 1)
}

// ---------- Step 4: publish ----------

async function publish() {
  publishing.value = true
  errorMessage.value = ''
  try {
    const f = form.value
    const created = await createEvent({
      ...f,
      title: f.title.trim(),
      description: f.description.trim(),
      startTime: new Date(f.startTime).toISOString(), // store one standard date format
      endTime: new Date(f.endTime).toISOString(),
      backupVenue: f.isOutdoor ? f.backupVenue : null,
    })
    router.push('/organiser/events?created=' + created.id)
  } catch (error) {
    errorMessage.value = 'Could not publish the event: ' + error.message
  } finally {
    publishing.value = false
  }
}
</script>

<template>
  <div class="col-lg-9 mx-auto">
    <h1 class="h3 mb-3">Create an event</h1>
    <!-- Step progress at the top; highlights the current step -->
    <StepIndicator :steps="steps" :current="step" />

    <div class="card shadow-sm">
      <div class="card-body p-4">
        <!-- ================= STEP 1: BASICS ================= -->
        <!-- Wizard: only ONE step block shows at a time (1 → 2 → 3 → v-else = 4 Review) -->
        <div v-if="step === 1">
          <div class="mb-3">
            <label for="title" class="form-label">Event title</label>
            <input
              id="title"
              class="form-control"
              v-model="form.title"
              placeholder="e.g. Acoustic Night at the Campus Green"
            />
          </div>

          <div class="mb-3">
            <label for="description" class="form-label">Description</label>
            <textarea
              id="description"
              class="form-control"
              rows="4"
              v-model="form.description"
              placeholder="What will happen? What should people bring?"
            ></textarea>
          </div>

          <div class="row">
            <div class="col-md-6 mb-3">
              <label for="start" class="form-label">Starts</label>
              <!-- :min stops picking a past time; the end time can't be before the start -->
              <input
                id="start"
                type="datetime-local"
                class="form-control"
                v-model="form.startTime"
                :min="nowForInput"
              />
            </div>
            <div class="col-md-6 mb-3">
              <label for="end" class="form-label">Ends</label>
              <input
                id="end"
                type="datetime-local"
                class="form-control"
                v-model="form.endTime"
                :min="form.startTime || nowForInput"
              />
            </div>
          </div>

          <div class="row">
            <div class="col-md-4 mb-3">
              <label for="capacity" class="form-label">Capacity</label>
              <!-- v-model.number saves it as a number, not a string -->
              <input
                id="capacity"
                type="number"
                min="1"
                class="form-control"
                v-model.number="form.capacity"
              />
              <div class="form-text">When it's full, new RSVPs join the waitlist.</div>
            </div>
          </div>

          <div class="mb-2">
            <label class="form-label d-block">Tags</label>
            <!-- Bootstrap "btn-check": a checkbox that looks like a toggle button -->
            <div class="d-flex flex-wrap gap-2">
              <!-- <template v-for> repeats each input + label pair without a wrapper div; v-model on an array adds/removes the tag -->
              <template v-for="tag in TAG_OPTIONS" :key="tag">
                <input
                  type="checkbox"
                  class="btn-check"
                  :id="'tag-' + tag"
                  :value="tag"
                  v-model="form.tags"
                  autocomplete="off"
                />
                <label class="btn btn-sm btn-outline-primary" :for="'tag-' + tag">{{ tag }}</label>
              </template>
            </div>
            <!-- Suggested tags from the title/description that aren't picked yet -->
            <div v-if="suggestedTags.length > 0" class="small mt-2">
              <span class="text-secondary">Suggested from your title and description:</span>
              <button
                v-for="tag in suggestedTags"
                :key="tag"
                type="button"
                class="btn btn-link btn-sm py-0"
                @click="addTag(tag)"
              >
                + {{ tag }}
              </button>
            </div>
          </div>
        </div>

        <!-- ================= STEP 2: VENUE ================= -->
        <div v-else-if="step === 2">
          <h5>Main venue</h5>
          <!-- Venue picked → show it with a "Change" link; otherwise (v-else) show the search box -->
          <div v-if="form.venue" class="border rounded p-3 mb-3 bg-body-tertiary">
            <div class="fw-semibold">{{ form.venue.name }}</div>
            <div class="small text-secondary">{{ form.venue.address }}</div>
            <div v-if="form.venue.lat" class="small text-secondary">
              Map position: {{ form.venue.lat.toFixed(4) }}, {{ form.venue.lng.toFixed(4) }}
            </div>
            <!-- Drag the pin (or click the map) to the exact spot; only lat/lng change -->
            <template v-if="form.venue.lat">
              <VenueMap
                :lat="form.venue.lat"
                :lng="form.venue.lng"
                draggable
                class="my-2"
                @move="moveVenuePin"
              />
              <div class="form-text mb-2">
                Drag the pin or click the map to mark the exact spot, e.g. the entrance.
              </div>
            </template>
            <button type="button" class="btn btn-link btn-sm p-0" @click="form.venue = null">
              Change venue
            </button>
          </div>
          <AddressSearch
            v-else
            label="Search for the venue (OneMap)"
            input-id="venue-search"
            @select="setVenue"
          />

          <div class="form-check form-switch my-3">
            <input
              class="form-check-input"
              type="checkbox"
              role="switch"
              id="outdoor"
              v-model="form.isOutdoor"
            />
            <label class="form-check-label" for="outdoor">This is an outdoor event</label>
            <div class="form-text">
              Before the event we check the 2-hour weather forecast. If rain is expected, you can
              switch to the backup venue in one click.
            </div>
          </div>

          <!-- Backup venue is only asked for outdoor events -->
          <template v-if="form.isOutdoor">
            <h5>Backup venue (if it rains)</h5>
            <div v-if="form.backupVenue" class="border rounded p-3 mb-3 bg-body-tertiary">
              <div class="fw-semibold">{{ form.backupVenue.name }}</div>
              <div class="small text-secondary">{{ form.backupVenue.address }}</div>
              <button
                type="button"
                class="btn btn-link btn-sm p-0"
                @click="form.backupVenue = null"
              >
                Change backup venue
              </button>
            </div>
            <AddressSearch
              v-else
              label="Search for the backup venue"
              input-id="backup-search"
              @select="setBackupVenue"
            />
          </template>
        </div>

        <!-- ================= STEP 3: RSVP QUESTIONS ================= -->
        <div v-else-if="step === 3">
          <div class="form-check form-switch mb-4">
            <input
              class="form-check-input"
              type="checkbox"
              role="switch"
              id="approval"
              v-model="form.requiresApproval"
            />
            <label class="form-check-label" for="approval"
              >I want to approve each RSVP myself</label
            >
            <div class="form-text">
              Off: people are confirmed straight away while spots last, then join the waitlist.
            </div>
          </div>

          <h5>Questions for people who RSVP</h5>
          <p class="form-text mt-0">
            Optional. Use these to screen sign-ups, e.g. "Which year are you in?"
          </p>

          <!-- List of added questions, or "No questions yet" -->
          <ul v-if="form.questions.length > 0" class="list-group mb-3">
            <li
              v-for="(question, index) in form.questions"
              :key="question.id"
              class="list-group-item d-flex justify-content-between align-items-center gap-2"
            >
              <div>
                {{ question.text }}
                <span class="badge bg-body-secondary text-body border ms-1">
                  {{ question.type === 'yesno' ? 'Yes / No' : 'Short answer' }}
                </span>
                <span v-if="question.required" class="badge text-bg-secondary ms-1">Required</span>
              </div>
              <button
                type="button"
                class="btn btn-outline-danger btn-sm"
                @click="removeQuestion(index)"
              >
                Remove
              </button>
            </li>
          </ul>
          <p v-else class="text-secondary small">No questions yet.</p>

          <div class="bg-body-tertiary border rounded p-3">
            <div class="row g-2 align-items-end">
              <div class="col-md-6">
                <label for="q-text" class="form-label small">Question</label>
                <!-- Pressing Enter also adds the question -->
                <input
                  id="q-text"
                  class="form-control"
                  v-model="newQuestion.text"
                  placeholder="Type a question"
                  @keyup.enter="addQuestion"
                />
              </div>
              <div class="col-md-3">
                <label for="q-type" class="form-label small">Answer type</label>
                <select id="q-type" class="form-select" v-model="newQuestion.type">
                  <option value="text">Short answer</option>
                  <option value="yesno">Yes / No</option>
                </select>
              </div>
              <div class="col-md-3">
                <div class="form-check mb-2">
                  <input
                    class="form-check-input"
                    type="checkbox"
                    id="q-required"
                    v-model="newQuestion.required"
                  />
                  <label class="form-check-label small" for="q-required">Required</label>
                </div>
              </div>
            </div>
            <!-- Disabled until a question is typed -->
            <button
              type="button"
              class="btn btn-outline-primary btn-sm mt-3"
              :disabled="newQuestion.text.trim() === ''"
              @click="addQuestion"
            >
              Add question
            </button>
          </div>
        </div>

        <!-- ================= STEP 4: REVIEW ================= -->
        <div v-else>
          <p class="text-secondary">
            Check everything before publishing. Use Back to change anything; nothing is lost.
          </p>
          <!-- Preview using the same card participants see; extra lines go into its <slot> -->
          <EventSummary :event="form">
            <hr />
            <p class="mb-1">
              <strong>RSVPs:</strong>
              {{
                form.requiresApproval
                  ? 'You approve each one'
                  : 'Confirmed automatically while spots last'
              }}
            </p>
            <p class="mb-1">
              <strong>Questions:</strong> <span v-if="form.questions.length === 0">none</span>
            </p>
            <ol v-if="form.questions.length > 0" class="mb-0">
              <li v-for="question in form.questions" :key="question.id">
                {{ question.text
                }}<span v-if="question.required" class="text-secondary"> (required)</span>
              </li>
            </ol>
          </EventSummary>
        </div>

        <!-- Errors for the current step -->
        <!-- Errors only show after pressing Next (showErrors) -->
        <div v-if="showErrors && stepErrors.length > 0" class="alert alert-danger mt-4 mb-0">
          <ul class="mb-0">
            <li v-for="error in stepErrors" :key="error">{{ error }}</li>
          </ul>
        </div>
        <div v-if="errorMessage" class="alert alert-danger mt-4 mb-0">{{ errorMessage }}</div>
      </div>

      <!-- Back / Next / Publish -->
      <div class="card-footer bg-body d-flex justify-content-between">
        <!-- Back is disabled on step 1; Next shows until the last step, then becomes Publish -->
        <button
          type="button"
          class="btn btn-outline-secondary"
          :disabled="step === 1"
          @click="previousStep"
        >
          Back
        </button>
        <button v-if="step < steps.length" type="button" class="btn btn-primary" @click="nextStep">
          Next
        </button>
        <button
          v-else
          type="button"
          class="btn btn-success"
          :disabled="publishing"
          @click="publish"
        >
          <span v-if="publishing" class="spinner-border spinner-border-sm me-2"></span>
          {{ publishing ? 'Publishing…' : 'Publish event' }}
        </button>
      </div>
    </div>
  </div>
</template>
