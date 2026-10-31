<script setup>
import { ref, computed, nextTick, onBeforeUnmount, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import StepIndicator from '../components/rsvp/StepIndicator.vue'
import AddressSearch from '../components/rsvp/AddressSearch.vue'
import VenueMap from '../components/VenueMap.vue'
import EventSummary from '../components/rsvp/EventSummary.vue'
import AnnounceChangesDialog from '../components/rsvp/AnnounceChangesDialog.vue'
import { uploadCover } from '../lib/uploadCover.js'
import { createEvent, getEvent, getRsvpsForEvent, updateEvent, createAnnouncement, USING_SUPABASE } from '../utils/api.js'
import { TAG_OPTIONS, suggestTags, toDateTimeInputValue } from '../utils/helpers.js'
import { PLANNER_AVAILABLE, searchEventTitles, fetchPlanSuggestion, addPlanToEvent } from '../utils/planSuggestions.js'
import { normalizeTitle } from '../utils/planSuggestModel.js'
import { describeEventChanges, formatAnnouncement } from '../utils/eventChanges.js'

// Multi-step form (progressive disclosure): one small chunk at a time instead of one long page.
// The same wizard edits a published event at /organiser/events/:id/edit (edit mode).

const router = useRouter()
const route = useRoute()

const steps = ['Basics', 'Venue', 'RSVP questions', 'Review']
const step = ref(1)
const direction = ref(1)
const showErrors = ref(false) // only show errors after they press Next
const publishing = ref(false)
const errorMessage = ref('')
let createAttempt = null
let createdEventId = null
const uploadingCover = ref(false)
const coverError = ref('')
let active = true
onBeforeUnmount(() => { active = false; clearTimeout(suggestTimer); suggestController?.abort(); planController?.abort() })
async function chooseCover(event) {
  const file = event.target.files?.[0]
  if (!file || uploadingCover.value) return
  coverError.value = ''
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
    coverError.value = 'Choose a JPEG, PNG or WebP image up to 10 MiB.'
    event.target.value = ''
    return
  }
  uploadingCover.value = true
  try {
    const url = await uploadCover(file)
    if (active) form.value.coverImageUrl = url
  } catch (failure) {
    if (active) coverError.value = failure.message || 'Image upload failed. Please retry.'
  } finally {
    if (active) uploadingCover.value = false
    event.target.value = ''
  }
}

// Everything the organiser fills in, across all steps
function blankForm() {
  return {
    title: '',
    coverImageUrl: '',
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
  }
}
const form = ref(blankForm())

// ---------- Edit mode: change a published event ----------

const editId = computed(() => (route.params.id ? String(route.params.id) : ''))
const isEditing = computed(() => Boolean(editId.value))
const original = ref(null) // the event as loaded, in form shape, to compare against when saving
const editLoading = ref(false)
const editBlocked = ref('') // why this event can't be edited (not yours, already started, not found)
const minCapacity = ref(1) // can't go below the people already confirmed or offered a place
const hasRsvps = ref(false) // once anyone has RSVP'd, existing questions can't be removed
const venueLocked = ref(false) // the rain switch already moved the event to its backup venue

const venueCopy = (venue) => (venue ? { name: venue.name, address: venue.address || '', postal: venue.postal || '', lat: venue.lat ?? null, lng: venue.lng ?? null } : null)
function formFromEvent(event) {
  return {
    title: event.title || '',
    coverImageUrl: event.coverImageUrl || '',
    description: event.description || '',
    tags: [...(event.tags || [])],
    startTime: toDateTimeInputValue(new Date(event.startTime)),
    endTime: toDateTimeInputValue(new Date(event.endTime)),
    capacity: event.capacity ?? '', // '' = no capacity limit (older events only)
    venue: venueCopy(event.venue),
    isOutdoor: Boolean(event.isOutdoor),
    backupVenue: venueCopy(event.backupVenue),
    requiresApproval: Boolean(event.requiresApproval),
    questions: (event.questions || []).map(({ id, text, type, required }) => ({ id, text, type, required: Boolean(required) })),
  }
}

// Load (or reset) whenever the route changes between /new and /:id/edit; the page can be reused
let editRequest = 0
watch(editId, async (id) => {
  const request = ++editRequest
  step.value = 1
  showErrors.value = false
  errorMessage.value = ''
  editBlocked.value = ''
  original.value = null
  if (!id) {
    form.value = blankForm()
    return
  }
  editLoading.value = true
  try {
    const event = await getEvent(id)
    if (request !== editRequest) return
    if (!event.isMine) editBlocked.value = 'You can only edit events you organise.'
    else if (new Date(event.startTime).getTime() <= Date.now()) editBlocked.value = 'This event has already started, so it can no longer be edited.'
    else {
      const rsvps = await getRsvpsForEvent(id)
      if (request !== editRequest) return
      form.value = formFromEvent(event)
      original.value = formFromEvent(event)
      minCapacity.value = Math.max(1, (event.confirmedCount || 0) + (event.offeredCount || 0))
      hasRsvps.value = rsvps.length > 0
      venueLocked.value = Boolean(event.usingBackup)
    }
  } catch (error) {
    if (request === editRequest) editBlocked.value = 'Could not load this event: ' + error.message
  } finally {
    if (request === editRequest) editLoading.value = false
  }
}, { immediate: true })

const isExistingQuestion = (question) => Boolean(original.value?.questions.some((old) => old.id === question.id))
// Removing a question people already answered would delete their answers
const canRemoveQuestion = (question) => !(isEditing.value && hasRsvps.value && isExistingQuestion(question))

// The question currently being typed in step 3
const newQuestion = ref({ text: '', type: 'text', required: false })
// Shown on Review when a typed-but-not-added question was added for the organiser
const questionNotice = ref('')

// Stops people picking a date in the past
const nowForInput = toDateTimeInputValue(new Date())

// ---------- Step 1: tag suggestions (automation) ----------

const suggestedTags = computed(() =>
  suggestTags(form.value.title + ' ' + form.value.description).filter(
    (tag) => !form.value.tags.includes(tag),
  ),
)

const previewDate = computed(() => {
  if (!form.value.startTime) return 'Date and time to be set'
  const date = new Date(form.value.startTime)
  return Number.isNaN(date.getTime()) ? 'Date and time to be set' : new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
})

function addTag(tag) {
  form.value.tags.push(tag)
}

// ---------- Event title suggestions (search as you type) ----------

const titleSuggestions = ref([]) // [{ title, kind: 'own' | 'community' }]
const titleListOpen = ref(false)
const activeSuggestion = ref(-1)
let suggestTimer
let suggestToken = 0
let suggestController

function closeSuggestions() {
  suggestToken++
  titleSuggestions.value = []
  titleListOpen.value = false
  activeSuggestion.value = -1
}

function onTitleInput(event) {
  clearTimeout(suggestTimer)
  suggestController?.abort()
  const query = event.target.value.trim()
  if (!PLANNER_AVAILABLE || query.length < 2) { closeSuggestions(); return }
  const token = ++suggestToken
  suggestTimer = setTimeout(async () => {
    suggestController = new AbortController()
    try {
      const rows = await searchEventTitles(query, suggestController.signal)
      if (!active || token !== suggestToken) return // a newer search or a closed list wins
      titleSuggestions.value = rows
      activeSuggestion.value = -1
      titleListOpen.value = rows.length > 0
    } catch {
      if (token === suggestToken) closeSuggestions() // suggestions are optional; typing still works
    }
  }, 200)
}

function chooseSuggestion(suggestion) {
  form.value.title = suggestion.title
  closeSuggestions()
}

function onTitleKeydown(event) {
  const count = titleSuggestions.value.length
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (!count) return
    event.preventDefault()
    titleListOpen.value = true
    const step = event.key === 'ArrowDown' ? 1 : -1
    activeSuggestion.value = (activeSuggestion.value + step + count) % count
  } else if (event.key === 'Enter' && titleListOpen.value && activeSuggestion.value >= 0) {
    event.preventDefault()
    chooseSuggestion(titleSuggestions.value[activeSuggestion.value])
  } else if (event.key === 'Escape' && titleListOpen.value) {
    event.preventDefault()
    titleListOpen.value = false
    activeSuggestion.value = -1
  }
}

// ---------- Automatic plan: programme + tasks from similar past events ----------

const planBusy = ref(false)
const planError = ref('')
const planOffer = ref(null) // the server's suggestion, shown for review
const planTicks = ref({ programme: [], tasks: [] }) // which suggested items stay ticked
const acceptedPlan = ref(null) // { programme, tasks, basedOn } the organiser chose; added after publishing
const planForTitle = ref('') // normalised title the suggestion was generated for
const planPanel = ref(null)
const eventCreated = ref(false)
let planController
let planToken = 0
let planProgress = { programme: 0, tasks: 0 }
let createdDates = null

const canGenerate = computed(() => PLANNER_AVAILABLE && form.value.title.trim().length > 0 && !planBusy.value && !publishing.value && !eventCreated.value)
const planHint = computed(() => {
  if (!PLANNER_AVAILABLE) return 'Plan suggestions need a live connection.'
  return form.value.title.trim() ? '' : 'Enter an event title to generate a plan.'
})
const planStale = computed(() => Boolean(planOffer.value || acceptedPlan.value) && normalizeTitle(form.value.title) !== planForTitle.value)

async function generatePlan() {
  if (!canGenerate.value) return
  planController?.abort()
  planController = new AbortController()
  const token = ++planToken
  planBusy.value = true
  planError.value = ''
  planOffer.value = null
  planForTitle.value = normalizeTitle(form.value.title)
  const f = form.value
  const iso = (value) => (value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null)
  try {
    const result = await fetchPlanSuggestion({
      title: f.title.trim(),
      description: f.description.trim(),
      tags: f.tags,
      capacity: Number.isInteger(f.capacity) ? f.capacity : null,
      startsAt: iso(f.startTime),
      endsAt: iso(f.endTime),
    }, planController.signal)
    if (!active || token !== planToken) return // dismissed or replaced while waiting
    planOffer.value = result
    planTicks.value = { programme: result.programme.map(() => true), tasks: result.tasks.map(() => true) }
  } catch (error) {
    if (active && token === planToken && error.name !== 'AbortError') planError.value = error.message
  } finally {
    if (active && token === planToken) planBusy.value = false
  }
  if (active && token === planToken) {
    await nextTick()
    planPanel.value?.focus()
  }
}

function usePlan() {
  const offer = planOffer.value
  if (!offer || eventCreated.value) return
  const programme = offer.programme.filter((_, index) => planTicks.value.programme[index])
  const tasks = offer.tasks.filter((_, index) => planTicks.value.tasks[index]).map((task) => ({ ...task, requestId: crypto.randomUUID() }))
  acceptedPlan.value = programme.length || tasks.length ? { programme, tasks, basedOn: offer.basedOn } : null
  planProgress = { programme: 0, tasks: 0 }
  planOffer.value = null
}

function dismissPlan() {
  planController?.abort()
  planToken++
  planBusy.value = false
  planOffer.value = null
  planError.value = ''
}

function removePlan() {
  if (eventCreated.value) return
  acceptedPlan.value = null
  planProgress = { programme: 0, tasks: 0 }
}

function planSource(offer) {
  const named = offer.basedOn.map((item) => `${item.title} (${item.kind === 'own' ? 'your event' : 'community'})`)
  if (offer.source === 'exact') return `Copied from ${named.join(' and ')}.`
  return `Based on ${offer.basedOn.length} similar past event${offer.basedOn.length === 1 ? '' : 's'}: ${named.slice(0, 3).join(', ')}${named.length > 3 ? '…' : ''}.`
}

function offsetLabel(item) {
  const total = (Date.parse(form.value.endTime) - Date.parse(form.value.startTime)) / 60000
  if (!Number.isFinite(total) || total <= 0) return `about ${Math.round(item.startFraction * 100)}% through`
  const minutes = Math.round((item.startFraction * total) / 5) * 5
  if (minutes === 0) return 'at the start'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return `${hours ? `${hours}h` : ''}${hours && rest ? ' ' : ''}${rest ? `${rest}m` : ''} in`
}

// Adds the accepted plan to the event just created. false = stop and let the organiser retry.
async function finishPlan(eventId) {
  const plan = acceptedPlan.value
  if (!plan) return true
  try {
    await addPlanToEvent(eventId, plan, createdDates, planProgress)
    acceptedPlan.value = null
    return true
  } catch (error) {
    const total = plan.programme.length + plan.tasks.length
    errorMessage.value = `The event was created, but only ${planProgress.programme + planProgress.tasks} of ${total} plan items were added (${error.message}). Press Publish to retry.`
    return false
  }
}

// ---------- Checking each step before moving on ----------

const stepErrors = computed(() => {
  return errorsForStep(form.value, step.value)
})

function errorsForStep(f, stepNumber, now = new Date()) {
  const errors = []
  const hasCoordinates = (place) => Number.isFinite(place?.lat) && Number.isFinite(place?.lng)

  if (stepNumber === 1) {
    if (f.title.trim() === '') errors.push('Give your event a title.')
    if (f.startTime === '' || f.endTime === '') {
      errors.push('Set a start and end time.')
    } else if (new Date(f.endTime) <= new Date(f.startTime)) {
      errors.push('The end time must be after the start time.')
    } else if (new Date(f.startTime) < now) {
      errors.push('The start time cannot be in the past.')
    }
    const keepsNoLimit = isEditing.value && original.value?.capacity === '' && f.capacity === ''
    if (!keepsNoLimit && (!Number.isInteger(f.capacity) || f.capacity < 1)) {
      errors.push('Capacity must be a whole number, at least 1.')
    } else if (isEditing.value && !keepsNoLimit && f.capacity < minCapacity.value) {
      errors.push(`Capacity can't be lower than ${minCapacity.value}: that many people are already confirmed or offered a place.`)
    }
    if (f.tags.length === 0) {
      errors.push('Pick at least one tag (used for recommendations and waitlist scoring).')
    }
  }

  if (stepNumber === 2) {
    if (!f.venue) errors.push('Choose the venue from the address search.')
    if (USING_SUPABASE && f.venue && !hasCoordinates(f.venue)) {
      errors.push('Choose a venue result with map coordinates for live events.')
    }
    if (f.isOutdoor && !f.backupVenue) {
      errors.push('Outdoor events need a backup venue in case of rain.')
    }
    if (USING_SUPABASE && f.backupVenue && !hasCoordinates(f.backupVenue)) {
      errors.push('Choose a backup venue result with map coordinates for live events.')
    }
  }

  if (stepNumber === 3 && f.questions.some((question) => question.text.trim() === '')) {
    errors.push('Every RSVP question needs some wording.')
  }

  return errors
}

async function focusStep() {
  await nextTick()
  let targetId = 'step-content-heading'
  if (step.value === 1) {
    const f = form.value
    if (!f.title.trim()) targetId = 'title'
    else if (!f.startTime) targetId = 'start'
    else if (!f.endTime || new Date(f.endTime) <= new Date(f.startTime)) targetId = 'end'
    else if (new Date(f.startTime) < new Date()) targetId = 'start'
    else if (!Number.isInteger(f.capacity) || f.capacity < 1) targetId = 'capacity'
    else if (f.tags.length === 0) targetId = 'tag-music'
  } else if (step.value === 2) {
    targetId = form.value.venue ? 'step-content-heading' : 'venue-search'
    if (form.value.isOutdoor && !form.value.backupVenue) targetId = 'backup-search'
  }
  document.getElementById(targetId)?.focus()
}

function nextStep() {
  // A question typed but never added would otherwise be left out of the event without warning
  if (step.value === 3 && newQuestion.value.text.trim() !== '') {
    addQuestion()
    questionNotice.value = 'The question you typed was added to your RSVP questions.'
  }
  if (stepErrors.value.length > 0) {
    showErrors.value = true
    focusStep()
    return
  }
  showErrors.value = false
  direction.value = 1
  step.value++
  focusStep()
}

function previousStep() {
  showErrors.value = false
  questionNotice.value = ''
  direction.value = -1
  step.value--
  focusStep()
}

// ---------- Step 2: venue ----------

// The search box disappears once a place is chosen (and returns on "Change"), so move
// keyboard focus to whatever replaced it instead of losing it to the page.
async function focusById(id) {
  await nextTick()
  document.getElementById(id)?.focus()
}

function setVenue(place) {
  form.value.venue = place
  focusById('venue-chosen')
}

function changeVenue() {
  form.value.venue = null
  focusById('venue-search')
}

function moveVenuePin(position) {
  form.value.venue.lat = position.lat
  form.value.venue.lng = position.lng
}

function setBackupVenue(place) {
  form.value.backupVenue = place
  focusById('backup-chosen')
}

function changeBackupVenue() {
  form.value.backupVenue = null
  focusById('backup-search')
}

// ---------- Step 3: custom RSVP questions ----------

function addQuestion() {
  if (newQuestion.value.text.trim() === '') return
  form.value.questions.push({
    id: crypto.randomUUID(), // a real id up front, so a retried live save can't add it twice
    text: newQuestion.value.text.trim(),
    type: newQuestion.value.type,
    required: newQuestion.value.required,
  })
  newQuestion.value = { text: '', type: 'text', required: false } // clear the inputs
}

function removeQuestion(index) {
  form.value.questions.splice(index, 1)
  focusById('q-text') // its Remove button is gone; continue where the next question is typed
}

// ---------- Step 4: publish (or save changes in edit mode) ----------

// The form, cleaned up for saving (shared by Publish and Save changes)
function eventDataFromForm() {
  const f = form.value
  return {
    ...f,
    title: f.title.trim(),
    description: f.description.trim(),
    startTime: new Date(f.startTime).toISOString(), // store one standard date format
    endTime: new Date(f.endTime).toISOString(),
    capacity: f.capacity === '' ? null : f.capacity,
    backupVenue: f.isOutdoor ? f.backupVenue : null,
    questions: f.questions.map((question) => ({ ...question, text: question.text.trim() })),
  }
}

const pendingChanges = ref([]) // what changed, shown in the pop-up and used for the announcement
const showAnnounceDialog = ref(false)
const savingChanges = ref(false)
const saveError = ref('')
const changesSaved = ref(false) // already saved; only the announcement is left (retry)
let announceAttempt = null

async function reviewChanges() {
  if (savingChanges.value || uploadingCover.value) return
  const invalidStep = [1, 2, 3].find((stepNumber) => errorsForStep(form.value, stepNumber).length > 0)
  if (invalidStep) {
    direction.value = invalidStep < step.value ? -1 : 1
    step.value = invalidStep
    showErrors.value = true
    await focusStep()
    return
  }
  pendingChanges.value = describeEventChanges(original.value, form.value)
  if (pendingChanges.value.length === 0) {
    errorMessage.value = 'Nothing has changed yet, so there is nothing to save.'
    return
  }
  errorMessage.value = ''
  saveError.value = ''
  changesSaved.value = false
  showAnnounceDialog.value = true
}

async function saveChanges({ announce, title, message }) {
  if (savingChanges.value) return
  savingChanges.value = true
  saveError.value = ''
  try {
    if (!changesSaved.value) {
      await updateEvent(editId.value, eventDataFromForm())
      changesSaved.value = true
    }
    if (announce) {
      const body = formatAnnouncement(title, message)
      // A retried post reuses its id, so the same announcement can't appear twice
      if (!announceAttempt || announceAttempt.body !== body) announceAttempt = { body, requestId: crypto.randomUUID() }
      await createAnnouncement(editId.value, body, announceAttempt.requestId)
    }
    showAnnounceDialog.value = false
    await router.push({ path: '/organiser/events', query: { updated: editId.value, ...(announce ? { announced: '1' } : {}) } })
  } catch (error) {
    saveError.value = changesSaved.value
      ? `Your changes are saved, but the announcement couldn't be posted: ${error.message}`
      : `Your changes couldn't be saved: ${error.message}`
  } finally {
    savingChanges.value = false
  }
}

function closeAnnounceDialog() {
  showAnnounceDialog.value = false
  // Saved already and the organiser skipped the failed announcement: carry on to My events
  if (changesSaved.value) router.push({ path: '/organiser/events', query: { updated: editId.value } })
}

async function publish() {
  if (publishing.value || uploadingCover.value) return
  const invalidStep = [1, 2].find((stepNumber) => errorsForStep(form.value, stepNumber).length > 0)
  if (invalidStep) {
    direction.value = invalidStep < step.value ? -1 : 1
    step.value = invalidStep
    showErrors.value = true
    await focusStep()
    return
  }
  if (createdEventId) {
    publishing.value = true
    errorMessage.value = ''
    try {
      if (!(await finishPlan(createdEventId))) return
    } finally {
      publishing.value = false
    }
    await router.push('/organiser/events?created=' + createdEventId)
    return
  }
  publishing.value = true
  errorMessage.value = ''
  try {
    const eventData = eventDataFromForm()
    if (USING_SUPABASE) {
      const fingerprint = JSON.stringify(eventData)
      if (!createAttempt || createAttempt.fingerprint !== fingerprint) {
        createAttempt = { fingerprint, requestId: crypto.randomUUID() }
      }
      eventData.requestId = createAttempt.requestId
    }
    const created = await createEvent(eventData)
    createdEventId = created.id
    createdDates = { startsAt: eventData.startTime, endsAt: eventData.endTime }
    eventCreated.value = true
    createAttempt = null
    if (!(await finishPlan(created.id))) return
    const navigationFailure = await router.push('/organiser/events?created=' + created.id)
    if (navigationFailure) errorMessage.value = 'Event was created, but could not open its organiser page. Press Publish to continue.'
  } catch (error) {
    errorMessage.value = createdEventId
      ? 'Event was created, but could not open its organiser page: ' + error.message
      : 'Could not publish the event: ' + error.message
  } finally {
    publishing.value = false
  }
}
</script>

<template>
  <div class="create-event-page col-12 col-xl-11 mx-auto">
    <header class="create-heading">
      <h1>{{ isEditing ? 'Edit event' : 'Create an event' }}</h1>
      <p>{{ isEditing ? 'Update the details below. Saving changes the live event straight away.' : 'Start with the essentials. You can review everything before it goes live.' }}</p>
    </header>

    <!-- Edit mode: still loading the event, or the reason it can't be edited -->
    <div v-if="isEditing && editLoading" class="text-center my-5" role="status">
      <div class="spinner-border text-primary" aria-hidden="true"></div>
      <span class="visually-hidden">Loading the event…</span>
    </div>
    <div v-else-if="isEditing && editBlocked" class="alert alert-warning" role="alert">
      {{ editBlocked }} <RouterLink to="/organiser/events">Back to My events</RouterLink>
    </div>

    <template v-else>
    <StepIndicator :steps="steps" :current="step" />

    <div class="creation-layout">
    <div class="card shadow-sm creation-form-card">
      <div class="card-body p-4">
        <Transition :name="direction > 0 ? 'step-forward' : 'step-back'" mode="out-in" @after-enter="focusStep">
        <div :key="step" class="step-panel">
        <!-- ================= STEP 1: BASICS ================= -->
        <div v-if="step === 1" aria-labelledby="step-content-heading">
          <h2 id="step-content-heading" class="visually-hidden" tabindex="-1">Basics</h2>
          <div class="mb-3">
            <label for="title" class="form-label">Event title</label>
            <div class="title-combobox">
              <input
                id="title"
                class="form-control"
                role="combobox"
                aria-autocomplete="list"
                autocomplete="off"
                aria-controls="title-suggestions"
                :aria-expanded="titleListOpen"
                :aria-activedescendant="activeSuggestion >= 0 ? `title-option-${activeSuggestion}` : undefined"
                :aria-describedby="showErrors && stepErrors.length ? 'validation-error-list' : undefined"
                :aria-invalid="showErrors && stepErrors.some((error) => error.includes('title')) || undefined"
                v-model="form.title"
                placeholder="e.g. Acoustic Night at the Campus Green"
                @input="onTitleInput"
                @keydown="onTitleKeydown"
                @focus="titleListOpen = titleSuggestions.length > 0"
                @blur="titleListOpen = false"
              />
              <ul v-show="titleListOpen" id="title-suggestions" class="title-suggestions" role="listbox" aria-label="Event name suggestions">
                <li
                  v-for="(suggestion, index) in titleSuggestions"
                  :id="`title-option-${index}`"
                  :key="suggestion.title"
                  role="option"
                  :aria-selected="index === activeSuggestion"
                  :class="{ active: index === activeSuggestion }"
                  @mousedown.prevent="chooseSuggestion(suggestion)"
                >
                  <span class="title-suggestion-text">{{ suggestion.title }}</span>
                  <span class="title-suggestion-kind">{{ suggestion.kind === 'own' ? 'Your event' : 'Community' }}</span>
                </li>
              </ul>
              <p class="visually-hidden" role="status">{{ titleListOpen ? `${titleSuggestions.length} event name suggestions available` : '' }}</p>
            </div>
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

          <div v-if="USING_SUPABASE" class="mb-3">
            <label for="event-cover" class="form-label">Cover image (optional)</label>
            <input id="event-cover" type="file" class="form-control" accept="image/jpeg,image/png,image/webp" :disabled="uploadingCover || publishing" aria-describedby="cover-help" @change="chooseCover" />
            <p id="cover-help" class="form-text">Public event image. JPEG, PNG or WebP, up to 10 MiB.</p>
            <p v-if="uploadingCover" role="status"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span> Uploading image…</p>
            <p v-if="coverError" class="text-danger" role="alert">{{ coverError }}</p>
            <figure v-if="form.coverImageUrl" class="cover-preview">
              <img :src="form.coverImageUrl" alt="Event cover preview" />
              <figcaption>How your cover is cropped on event cards</figcaption>
              <button type="button" class="btn btn-outline-secondary btn-sm" @click="form.coverImageUrl = ''">Remove cover</button>
            </figure>
          </div>
          <div class="row">
            <div class="col-md-6 mb-3">
              <label for="start" class="form-label">Starts</label>
              <input
                id="start"
                type="datetime-local"
                class="form-control"
                :aria-describedby="showErrors && stepErrors.length ? 'validation-error-list' : undefined"
                :aria-invalid="showErrors && stepErrors.some((error) => error.includes('time')) || undefined"
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
                :aria-describedby="showErrors && stepErrors.length ? 'validation-error-list' : undefined"
                v-model="form.endTime"
                :min="form.startTime || nowForInput"
              />
            </div>
          </div>

          <div class="row">
            <div class="col-md-4 mb-3">
              <label for="capacity" class="form-label">Capacity</label>
              <input
                id="capacity"
                type="number"
                min="1"
                class="form-control"
                :aria-describedby="showErrors && stepErrors.length ? 'validation-error-list' : undefined"
                v-model.number="form.capacity"
              />
              <div class="form-text">When it's full, new RSVPs join the waitlist.</div>
            </div>
          </div>

          <div class="mb-2">
            <label class="form-label d-block">Tags</label>
            <!-- Bootstrap "btn-check": a checkbox that looks like a toggle button -->
            <div class="d-flex flex-wrap gap-2">
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
        <div v-else-if="step === 2" aria-labelledby="step-content-heading">
          <h2 id="step-content-heading" class="visually-hidden" tabindex="-1">Venue</h2>
          <p v-if="venueLocked" class="alert alert-info small">
            This event has already switched to its rain backup venue, so its venues can't be changed here.
          </p>
          <h3 class="h5 step-subheading">Main venue</h3>
          <!-- Theme-aware chosen-venue card; it receives focus after a search result is picked -->
          <div v-if="form.venue" class="venue-choice">
            <p id="venue-chosen" class="venue-choice-name" tabindex="-1">
              <span class="visually-hidden">Chosen venue: </span>{{ form.venue.name }}
            </p>
            <p class="venue-choice-meta">{{ form.venue.address }}</p>
            <p v-if="form.venue.lat" class="venue-choice-meta">
              Map position: {{ form.venue.lat.toFixed(4) }}, {{ form.venue.lng.toFixed(4) }}
            </p>
            <template v-if="form.venue.lat">
              <VenueMap :lat="form.venue.lat" :lng="form.venue.lng" :draggable="!venueLocked" class="my-2" @move="moveVenuePin" />
              <p v-if="!venueLocked" class="form-text mb-2">Drag the pin or click the map to mark the exact spot.</p>
            </template>
            <button v-if="!venueLocked" type="button" class="btn btn-link btn-sm p-0" @click="changeVenue">
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
              :disabled="venueLocked"
            />
            <label class="form-check-label" for="outdoor">This is an outdoor event</label>
            <div class="form-text">
              Before the event we check the 2-hour weather forecast. If rain is expected, you can
              switch to the backup venue in one click.
            </div>
          </div>

          <template v-if="form.isOutdoor">
            <h3 class="h5 step-subheading">Backup venue (if it rains)</h3>
            <div v-if="form.backupVenue" class="venue-choice">
              <p id="backup-chosen" class="venue-choice-name" tabindex="-1">
                <span class="visually-hidden">Chosen backup venue: </span>{{ form.backupVenue.name }}
              </p>
              <p class="venue-choice-meta">{{ form.backupVenue.address }}</p>
              <button v-if="!venueLocked" type="button" class="btn btn-link btn-sm p-0" @click="changeBackupVenue">
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
        <div v-else-if="step === 3" aria-labelledby="step-content-heading">
          <h2 id="step-content-heading" class="visually-hidden" tabindex="-1">RSVP questions</h2>
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

          <h3 class="h5 step-subheading">Questions for people who RSVP</h3>
          <p class="form-text mt-0">
            Optional. Use these to screen sign-ups, e.g. "Which year are you in?"
          </p>
          <p v-if="isEditing && hasRsvps && original?.questions.length" class="form-text mt-0">
            People have already RSVP'd, so existing questions can be reworded but not removed.
          </p>

          <ul v-if="form.questions.length > 0" class="list-group mb-3">
            <li
              v-for="(question, index) in form.questions"
              :key="question.id"
              class="list-group-item d-flex justify-content-between align-items-center gap-2"
            >
              <div class="question-summary">
                <!-- Edit mode: questions that are already saved can be reworded in place -->
                <template v-if="isEditing && isExistingQuestion(question)">
                  <label class="visually-hidden" :for="'q-edit-' + question.id">Wording of question {{ index + 1 }}</label>
                  <input :id="'q-edit-' + question.id" v-model="question.text" class="form-control form-control-sm question-reword" />
                </template>
                <span v-else class="question-text">{{ question.text }}</span>
                <span class="question-chip">{{ question.type === 'yesno' ? 'Yes / No' : 'Short answer' }}</span>
                <span v-if="question.required" class="question-chip question-chip--required">Required</span>
              </div>
              <button
                v-if="canRemoveQuestion(question)"
                type="button"
                class="btn btn-outline-danger btn-sm"
                @click="removeQuestion(index)"
              >
                Remove<span class="visually-hidden"> question: {{ question.text }}</span>
              </button>
              <span v-else class="question-locked">Kept: people have RSVP'd</span>
            </li>
          </ul>
          <p v-else class="text-secondary small">No questions yet.</p>

          <div class="question-composer">
            <div class="row g-2 align-items-end">
              <div class="col-md-6">
                <label for="q-text" class="form-label small">Question</label>
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
        <div v-else aria-labelledby="step-content-heading">
          <h2 id="step-content-heading" class="visually-hidden" tabindex="-1">Review</h2>
          <p class="text-secondary">
            {{ isEditing
              ? 'Check your changes. Saving updates the live event straight away; use Back to change anything.'
              : 'Check everything before publishing. Use Back to change anything; nothing is lost.' }}
          </p>
          <p v-if="questionNotice" class="question-notice" role="status">{{ questionNotice }}</p>
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

        </div>
        </Transition>
        <!-- Suggested plan (programme + tasks from similar past events) -->
        <section v-if="planBusy || planOffer || planError || acceptedPlan" ref="planPanel" class="plan-panel" tabindex="-1" aria-labelledby="plan-panel-heading">
          <div class="plan-panel-head">
            <h3 id="plan-panel-heading" class="h6 mb-0">Suggested plan</h3>
            <button v-if="planOffer || planError || planBusy" type="button" class="btn-close" aria-label="Dismiss suggested plan" @click="dismissPlan"></button>
          </div>
          <p v-if="planBusy" class="mb-0 mt-2" role="status">Looking at similar past events…</p>
          <div v-else-if="planError" class="alert alert-danger mt-2 mb-0" role="alert">
            {{ planError }} <button type="button" class="btn btn-sm btn-outline-danger ms-1" :disabled="!canGenerate" @click="generatePlan">Try again</button>
          </div>
          <template v-else-if="planOffer">
            <p v-if="!planOffer.programme.length && !planOffer.tasks.length" class="mb-0 mt-2" role="status">
              No similar past events with a programme or tasks yet. You can still add them after publishing.
            </p>
            <template v-else>
              <p class="small text-secondary mt-2" role="status">{{ planSource(planOffer) }}</p>
              <p v-if="planStale" class="small text-danger">The title changed since this was generated. Generate again to refresh it.</p>
              <fieldset v-if="planOffer.programme.length" class="plan-group">
                <legend class="h6">Programme</legend>
                <label v-for="(item, index) in planOffer.programme" :key="`programme-${index}`" class="plan-item">
                  <input v-model="planTicks.programme[index]" type="checkbox" class="form-check-input" />
                  <span><strong>{{ item.title }}</strong> <span class="text-secondary">· {{ offsetLabel(item) }}</span></span>
                </label>
              </fieldset>
              <fieldset v-if="planOffer.tasks.length" class="plan-group">
                <legend class="h6">Tasks</legend>
                <label v-for="(task, index) in planOffer.tasks" :key="`task-${index}`" class="plan-item">
                  <input v-model="planTicks.tasks[index]" type="checkbox" class="form-check-input" />
                  <span><strong>{{ task.title }}</strong><span v-if="task.notes" class="d-block small text-secondary">{{ task.notes }}</span></span>
                </label>
              </fieldset>
              <div class="d-flex flex-wrap gap-2 mt-3">
                <button type="button" class="btn btn-primary btn-sm" @click="usePlan">Use these</button>
                <button type="button" class="btn btn-outline-secondary btn-sm" @click="dismissPlan">Dismiss</button>
              </div>
            </template>
          </template>
          <div v-else-if="acceptedPlan" class="plan-summary">
            <p class="mb-0">
              {{ acceptedPlan.programme.length }} programme item{{ acceptedPlan.programme.length === 1 ? '' : 's' }} and
              {{ acceptedPlan.tasks.length }} task{{ acceptedPlan.tasks.length === 1 ? '' : 's' }} will be added when you publish.
              <span v-if="planStale" class="text-danger">The title changed since this was generated.</span>
            </p>
            <button v-if="!eventCreated" type="button" class="btn btn-sm btn-outline-secondary" @click="removePlan">Remove</button>
          </div>
        </section>

        <!-- Errors for the current step -->
        <div v-if="showErrors && stepErrors.length > 0" class="alert alert-danger mt-4 mb-0" role="alert" aria-labelledby="validation-summary-heading">
          <h3 id="validation-summary-heading" class="h6">Fix these items before continuing</h3>
          <ul id="validation-error-list" class="mb-0">
            <li v-for="error in stepErrors" :key="error">{{ error }}</li>
          </ul>
        </div>
        <div v-if="errorMessage" class="alert alert-danger mt-4 mb-0" role="alert">{{ errorMessage }}</div>
      </div>

      <!-- Back / Next / Publish -->
      <div class="card-footer d-flex justify-content-between creation-actions">
        <button
          type="button"
          class="btn btn-outline-secondary"
          :disabled="step === 1"
          @click="previousStep"
        >
          Back
        </button>
        <div class="d-flex gap-2 creation-actions-end">
          <!-- Plans are only added by publish(), so editing an event doesn't offer one -->
          <template v-if="!isEditing">
            <span :title="planHint || undefined">
              <button type="button" class="btn btn-outline-primary" :disabled="!canGenerate" :aria-describedby="planHint ? 'plan-hint' : undefined" @click="generatePlan">
                <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" class="me-1" aria-hidden="true"><path d="M10 1.5l1.7 4.8 4.8 1.7-4.8 1.7L10 14.5l-1.7-4.8-4.8-1.7 4.8-1.7zM16 12l.8 2.2L19 15l-2.2.8L16 18l-.8-2.2L13 15l2.2-.8z"/></svg>Generate plan
              </button>
            </span>
            <span v-if="planHint" id="plan-hint" class="visually-hidden">{{ planHint }}</span>
          </template>
          <button v-if="step < steps.length" type="button" class="btn btn-primary" @click="nextStep">
            Next
          </button>
          <button
            v-else-if="isEditing"
            type="button"
            class="btn btn-success"
            :disabled="savingChanges"
            @click="reviewChanges"
          >
            Save changes
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
    <aside class="event-preview" aria-label="Live event preview">
      <div class="preview-heading"><span>Live preview</span><span class="preview-pulse" aria-hidden="true"></span></div>
      <article class="preview-card">
        <div class="preview-art" :class="{ 'has-cover': form.coverImageUrl }" :style="form.coverImageUrl ? { backgroundImage: `linear-gradient(180deg, transparent 35%, color-mix(in srgb, var(--bookedz-ink) 78%, transparent)), url('${form.coverImageUrl}')` } : undefined">
          <span v-if="!form.coverImageUrl" class="preview-art-mark" aria-hidden="true"><svg viewBox="0 0 80 60" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 12h56v12a6 6 0 0 0 0 12v12H12V36a6 6 0 0 0 0-12Z"/><path d="M50 12v36" stroke-dasharray="3 4"/><path d="m23 29 6 6 11-12"/></svg></span>
          <span class="preview-tag">{{ form.tags[0] || 'Your event' }}</span>
        </div>
        <div class="preview-copy">
          <p class="preview-date">{{ previewDate }}</p>
          <h2>{{ form.title.trim() || 'Your event title' }}</h2>
          <p class="preview-description">{{ form.description.trim() || 'Your description will appear here as you write it.' }}</p>
          <div class="preview-meta"><span aria-hidden="true">⌖</span><span>{{ form.venue?.name || 'Venue to be chosen' }}</span></div>
          <div class="preview-meta"><span aria-hidden="true">◎</span><span>{{ Number.isInteger(form.capacity) && form.capacity > 0 ? `${form.capacity} spots` : 'Capacity to be set' }}</span></div>
        </div>
      </article>
      <p class="preview-note">This is a guide to how your event details come together.</p>
    </aside>
    </div>
    </template>

    <!-- Edit mode: what changed + optional announcement, shown before saving -->
    <AnnounceChangesDialog
      v-if="showAnnounceDialog"
      :event-title="form.title.trim()"
      :changes="pendingChanges"
      :pending="savingChanges"
      :error="saveError"
      :saved="changesSaved"
      @confirm="saveChanges"
      @cancel="closeAnnounceDialog"
    />
  </div>
</template>

<style scoped>
.create-heading { margin: 1rem 0 1.5rem; padding: 1.5rem clamp(1rem, 3vw, 2rem); border-left: 5px solid var(--bookedz-primary-dark); border-radius: 0 20px 20px 0; background: var(--bookedz-glass-active); }
.create-heading h1 { margin: 0 0 .4rem; color: var(--bookedz-ink); font-size: clamp(1.7rem, 3vw, 2.3rem); font-weight: 700; letter-spacing: -.035em; }
.create-heading p:last-child { margin: 0; color: var(--bookedz-muted); }
.create-kicker { margin: 0 0 .35rem; color: var(--bookedz-primary-dark); font-size: .875rem; font-weight: 650; }
.creation-layout { display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(15rem, .85fr); align-items: start; gap: 1.25rem; }
.plan-panel { margin-top: 1.5rem; padding: 1rem; border: 1px solid var(--bookedz-border); border-radius: 14px; background: var(--bookedz-surface); }
.plan-panel:focus-visible { outline: 3px solid var(--bookedz-primary-dark); outline-offset: 2px; }
.plan-panel-head { display: flex; align-items: center; justify-content: space-between; gap: .75rem; }
.plan-group { margin: .75rem 0 0; padding: 0; border: 0; }
.plan-group legend { float: none; width: auto; margin-bottom: .35rem; padding: 0; }
.plan-item { display: flex; align-items: flex-start; gap: .65rem; min-height: 44px; padding: .4rem 0; cursor: pointer; }
.plan-item .form-check-input { flex: none; margin-top: .3rem; }
.plan-summary { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .75rem; margin-top: .5rem; }
.creation-actions { align-items: flex-end; }
.creation-actions-end { flex-wrap: wrap; justify-content: flex-end; }
.title-combobox { position: relative; }
.title-suggestions { position: absolute; z-index: 5; inset-inline: 0; top: calc(100% + 4px); max-height: 16rem; margin: 0; padding: .25rem; overflow-y: auto; list-style: none; border: 1px solid var(--bookedz-border); border-radius: 12px; background: var(--bookedz-surface); box-shadow: var(--bookedz-card-shadow); }
.title-suggestions li { display: flex; align-items: center; justify-content: space-between; gap: .75rem; min-height: 44px; padding: .45rem .75rem; border-radius: 8px; cursor: pointer; }
.title-suggestions li:hover, .title-suggestions li.active { background: var(--bookedz-border); }
.title-suggestion-text { min-width: 0; overflow-wrap: anywhere; }
.title-suggestion-kind { flex: none; color: var(--bookedz-muted); font-size: .78rem; font-weight: 700; }
.create-event-page :deep(.card) { border: 1px solid var(--bookedz-border); border-radius: 20px; box-shadow: var(--bookedz-card-shadow) !important; }
.create-event-page :deep(.card-body) { padding: clamp(1rem, 3vw, 2rem) !important; }
.create-event-page :deep(.card-footer) { position: sticky; bottom: 0; z-index: 2; padding: .85rem clamp(1rem, 3vw, 2rem); border-color: var(--bookedz-border); background: var(--bookedz-glass-solid) !important; backdrop-filter: blur(14px); }
.create-event-page :deep(.card-footer .btn) { min-width: 6.5rem; min-height: 44px; }
.create-event-page :deep(.form-control), .create-event-page :deep(.form-select) { border-radius: 10px; transition: border-color .18s ease, box-shadow .18s ease, background-color .18s ease; }
.create-event-page :deep(.form-control:focus), .create-event-page :deep(.form-select:focus) { border-color: var(--bookedz-primary-dark); box-shadow: var(--bookedz-focus-glow); }
.create-event-page :deep(.btn-primary), .create-event-page :deep(.btn-success) { background: var(--bookedz-primary-dark); border-color: var(--bookedz-primary-dark); color: var(--bookedz-surface); }
.create-event-page :deep(.btn-primary:hover), .create-event-page :deep(.btn-success:hover) { background: var(--bookedz-primary-hover); border-color: var(--bookedz-primary-hover); }
.event-preview { position: sticky; top: 1rem; padding: 1rem; border: 1px solid var(--bookedz-border); border-radius: 1.25rem; background: var(--bookedz-glass-solid); box-shadow: var(--bookedz-card-shadow); }
.preview-heading { display: flex; align-items: center; gap: .55rem; margin: 0 0 .85rem; color: var(--bookedz-muted); font-size: .78rem; font-weight: 650; }
.preview-pulse { width: .5rem; height: .5rem; border-radius: 50%; background: var(--bookedz-success); box-shadow: 0 0 0 .25rem var(--bookedz-glass-active); }
.preview-card { overflow: hidden; border: 1px solid var(--bookedz-border); border-radius: 1rem; background: var(--bookedz-surface); }
/* Same 16:9 crop as the event cards, so the preview shows what participants will see */
.preview-art { position: relative; display: grid; aspect-ratio: 16 / 9; place-items: center; overflow: hidden; background: var(--bookedz-glass-active); background-position: center; background-size: cover; }
.preview-art-mark svg { width: 80px; height: 60px; }
.preview-art-mark { color: var(--bookedz-primary-dark); font-size: 3.3rem; line-height: 1; }
.preview-tag { position: absolute; bottom: .65rem; left: .7rem; max-width: calc(100% - 1.4rem); overflow: hidden; padding: .25rem .55rem; border-radius: 99px; background: var(--bookedz-surface); color: var(--bookedz-ink); font-size: .72rem; text-overflow: ellipsis; white-space: nowrap; }
.preview-art.has-cover .preview-tag { background: var(--bookedz-glass-solid); }
.preview-copy { padding: .9rem; }
.preview-date { margin: 0 0 .35rem; color: var(--bookedz-primary-dark); font-size: .76rem; font-weight: 650; }
.preview-copy h2 { margin: 0 0 .45rem; color: var(--bookedz-ink); font-size: 1.1rem; line-height: 1.2; overflow-wrap: anywhere; }
.preview-description { display: -webkit-box; overflow: hidden; margin: 0 0 .8rem; color: var(--bookedz-muted); font-size: .82rem; line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
.preview-meta { display: flex; gap: .5rem; align-items: baseline; margin-top: .4rem; color: var(--bookedz-ink); font-size: .78rem; }
.preview-meta span:first-child { color: var(--bookedz-primary-dark); font-size: 1rem; }
.preview-note { margin: .75rem 0 0; color: var(--bookedz-muted); font-size: .75rem; line-height: 1.4; }
.step-panel { min-width: 0; }
.step-forward-enter-active, .step-forward-leave-active, .step-back-enter-active, .step-back-leave-active { transition: opacity .2s ease, transform .24s cubic-bezier(.2,.7,.2,1); }
.step-forward-enter-from { opacity: 0; transform: translateX(1.1rem); }
.step-forward-leave-to { opacity: 0; transform: translateX(-.65rem); }
.step-back-enter-from { opacity: 0; transform: translateX(-1.1rem); }
.step-back-leave-to { opacity: 0; transform: translateX(.65rem); }
/* Phones: the form comes first so the current step's fields are visible without scrolling; the preview follows it */
@media (max-width: 767.98px) { .creation-layout { grid-template-columns: minmax(0, 1fr); } .event-preview { position: static; } }
@media (max-width: 575.98px) { .create-heading { margin-top: .5rem; } }
.cover-preview { display: grid; justify-items: start; gap: .5rem; margin: 1rem 0 0; }
.cover-preview img { display: block; width: min(100%, 32rem); aspect-ratio: 16 / 9; object-fit: cover; border: 1px solid var(--bookedz-border); border-radius: 14px; }
.cover-preview figcaption { color: var(--bookedz-muted); font-size: .85rem; }
/* Venue and question boxes use theme tokens (Bootstrap's bg-light stays white in dark mode) */
.step-subheading { margin: 0 0 .75rem; color: var(--bookedz-ink); font-weight: 650; }
.venue-choice { margin-bottom: 1rem; padding: 1rem; border: 1px solid var(--bookedz-border); border-radius: 14px; background: color-mix(in srgb, var(--bookedz-mint) 22%, var(--bookedz-surface)); }
.venue-choice-name { margin: 0; color: var(--bookedz-ink); font-weight: 700; overflow-wrap: anywhere; }
.venue-choice-meta { margin: .15rem 0 0; color: var(--bookedz-muted); font-size: .875rem; overflow-wrap: anywhere; }
.question-composer { padding: 1rem; border: 1px solid var(--bookedz-border); border-radius: 14px; background: var(--bookedz-glass-solid); }
.question-summary { display: flex; flex-wrap: wrap; align-items: center; gap: .35rem .5rem; min-width: 0; }
.question-text { color: var(--bookedz-ink); overflow-wrap: anywhere; }
.question-chip { display: inline-flex; align-items: center; padding: .2rem .6rem; border: 1px solid var(--bookedz-border); border-radius: 999px; color: var(--bookedz-ink); background: var(--bookedz-hover); font-size: .75rem; font-weight: 650; }
.question-chip--required { color: var(--bookedz-primary-dark); }
.question-reword { flex: 1 1 14rem; min-width: 0; }
.question-locked { flex: 0 0 auto; color: var(--bookedz-muted); font-size: .8rem; }
.question-notice { margin: 0 0 1rem; padding: .7rem .9rem; border-radius: 12px; color: var(--bookedz-ink); background: color-mix(in srgb, var(--bookedz-mint) 30%, var(--bookedz-surface)); font-size: .9rem; }
/* Disabled outline buttons (Back on step 1, an empty "Add question") use the theme's disabled
   colours instead of Bootstrap's default grey/blue, matching disabled .event-cta buttons */
.create-event-page :deep(.btn-outline-primary), .create-event-page :deep(.btn-outline-secondary) { --bs-btn-disabled-color: var(--bookedz-disabled-ink); --bs-btn-disabled-bg: var(--bookedz-disabled-bg); --bs-btn-disabled-border-color: var(--bookedz-border); --bs-btn-disabled-opacity: 1; }
@media (prefers-reduced-motion: reduce) { .step-forward-enter-active, .step-forward-leave-active, .step-back-enter-active, .step-back-leave-active, .create-event-page :deep(.form-control), .create-event-page :deep(.form-select) { transition: none; } }
</style>
