<script setup>
import WheelDateTime from '../components/ui/WheelDateTime.vue'
import { QUESTION_TYPES, needsOptions, parseOptions, optionsError, questionTypeLabel } from '../utils/questionTypes.js'
import BackLink from '../components/ui/BackLink.vue'
import { ref, computed, nextTick, onBeforeUnmount, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import '../assets/design-baseline.css'
import StepIndicator from '../components/rsvp/StepIndicator.vue'
import AddressSearch from '../components/rsvp/AddressSearch.vue'
import VenueMap from '../components/VenueMap.vue'
import EventSummary from '../components/rsvp/EventSummary.vue'
import AnnounceChangesDialog from '../components/rsvp/AnnounceChangesDialog.vue'
import { uploadCover } from '../lib/uploadCover.js'
import { createEvent, setEventPublished, getEvent, getEventOnlineAccess, getRsvpsForEvent, updateEvent, createAnnouncement, USING_SUPABASE } from '../utils/api.js'
import { defaultRevealTime } from '../utils/onlineEvents.js'
import { defaultVenueRevealTime, venueRevealToSave } from '../utils/venueReveal.js'
import { TAG_OPTIONS, suggestTags, toDateTimeInputValue } from '../utils/helpers.js'
import { PLANNER_AVAILABLE, searchEventTitles, fetchPlanSuggestion, addPlanToEvent } from '../utils/planSuggestions.js'
import { normalizeTitle } from '../utils/planSuggestModel.js'
import { describeEventChanges, formatAnnouncement } from '../utils/eventChanges.js'
import { blankEventForm, errorsForStep } from '../utils/eventForm.js'
import { isOfficialEvent } from '../utils/groups.js'

// multi-step form (progressive disclosure): one small chunk at a time instead of one long page.
// the same wizard edits event details inside manage event (edit mode).

const props = defineProps({ embedded: { type: Boolean, default: false } })
const emit = defineEmits(['saved'])
const editSuccess = ref('')
const router = useRouter()
const route = useRoute()

const steps = ['Basics', 'Venue', 'RSVP questions', 'Review']
const step = ref(1)
const direction = ref(1)
const showErrors = ref(false) // only show errors after they press next
const publishing = ref(false)
const publishWhen = ref('now') // 'now' goes live straight away; 'later' saves it as a draft to publish from manage event
let visibilitySettled = false
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

// everything the organiser fills in, across all steps (its fields and checks: utils/eventForm.js)
// a new event starts at the next whole hour (at least 30 minutes away) and lasts two hours,
// so the dates are never blank and the end can't start out before the start.
function withDefaultTimes(f) {
  const start = new Date(Date.now() + 30 * 60000)
  start.setMinutes(0, 0, 0)
  start.setHours(start.getHours() + 1)
  const end = new Date(start.getTime() + 2 * 60 * 60000)
  return { ...f, startTime: toDateTimeInputValue(start), endTime: toDateTimeInputValue(end) }
}
const form = ref(withDefaultTimes(blankEventForm()))
// moving the start keeps the event's length; an end that falls before the start is moved after it.
// only for edits to the same form, not when a saved event is loaded into it.
watch(() => [form.value, form.value.startTime], ([currentForm, start], [previousForm, previous]) => {
  if (currentForm !== previousForm) return
  const s = Date.parse(start), p = Date.parse(previous), e = Date.parse(form.value.endTime)
  if (!Number.isFinite(s)) return
  const length = Number.isFinite(p) && Number.isFinite(e) && e > p ? e - p : 2 * 60 * 60000
  if (!Number.isFinite(e) || e <= s || Number.isFinite(p)) form.value.endTime = toDateTimeInputValue(new Date(s + length))
  // the online link and a hidden venue keep appearing the same time before the start
  const reveal = Date.parse(form.value.onlineLink.revealAt)
  if (Number.isFinite(p) && Number.isFinite(reveal)) form.value.onlineLink.revealAt = toDateTimeInputValue(new Date(reveal + s - p))
  const venueReveal = Date.parse(form.value.venueRevealAt)
  if (Number.isFinite(p) && Number.isFinite(venueReveal)) form.value.venueRevealAt = toDateTimeInputValue(new Date(venueReveal + s - p))
})
// "keep the venue hidden" suggests revealing it a day before the start
const hideVenue = computed({
  get: () => Boolean(form.value.venueRevealAt),
  set: (value) => { form.value.venueRevealAt = value ? defaultVenueRevealTime(form.value.startTime) : '' },
})
const venueRevealLabel = computed(() => {
  const reveal = new Date(form.value.venueRevealAt)
  return Number.isNaN(reveal.getTime()) ? '' : new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium', timeStyle: 'short' }).format(reveal)
})
// choosing online suggests a time for the link to appear (15 minutes before the start)
watch(() => form.value.isOnline, (isOnline) => {
  if (isOnline && !form.value.onlineLink.revealAt) form.value.onlineLink.revealAt = defaultRevealTime(form.value.startTime)
})
// the capacity switch reads "show", while the form stores whether it's hidden
const showCapacity = computed({
  get: () => !form.value.hideCapacity,
  set: (value) => { form.value.hideCapacity = !value },
})
const endBeforeStart = computed(() => {
  const s = Date.parse(form.value.startTime), e = Date.parse(form.value.endTime)
  return Number.isFinite(s) && Number.isFinite(e) && e <= s
})

// ---------- edit mode: change a published event ----------

const editId = computed(() => (route.params.id ? String(route.params.id) : ''))
const isEditing = computed(() => Boolean(editId.value))
const original = ref(null) // the event as loaded, in form shape, to compare against when saving
const editLoading = ref(false)
const editBlocked = ref('') // why this event can't be edited (not yours, already started, not found)
const minCapacity = ref(1) // can't go below the people already confirmed or offered a place
const hasRsvps = ref(false) // once anyone has RSVP'd, existing questions can't be removed
const venueLocked = ref(false) // the rain switch already moved the event to its backup venue

const venueCopy = (venue) => (venue ? { name: venue.name, address: venue.address || '', postal: venue.postal || '', lat: venue.lat ?? null, lng: venue.lng ?? null } : null)
// access = getEventOnlineAccess(id) for an online event (the organiser always gets the link)
// a hidden venue comes from event.hiddenVenue (organisers only); "to be announced" loads as no venue
function formFromEvent(event, access = null) {
  const reveal = Date.parse(access?.revealAt)
  const place = event.hiddenVenue
    || (event.isOnline || event.venuePending ? { venue: null, backupVenue: null, isOutdoor: false } : event)
  const venueReveal = event.hiddenVenue ? Date.parse(event.venueRevealAt) : NaN
  return {
    title: event.title || '',
    coverImageUrl: event.coverImageUrl || '',
    description: event.description || '',
    tags: [...(event.tags || [])],
    startTime: Number.isFinite(Date.parse(event.startTime)) ? toDateTimeInputValue(new Date(event.startTime)) : '',
    endTime: Number.isFinite(Date.parse(event.endTime)) ? toDateTimeInputValue(new Date(event.endTime)) : '',
    capacity: event.capacity ?? 30, // shown again if "no limit" is switched off
    noLimit: event.capacity == null,
    hideCapacity: Boolean(event.hideCapacity),
    isOnline: Boolean(event.isOnline),
    onlineLink: { url: access?.url || '', revealAt: Number.isFinite(reveal) ? toDateTimeInputValue(new Date(reveal)) : '' },
    // an online event's "online" label and "venue to be announced" aren't venues to edit
    venue: venueCopy(place.venue),
    venueRevealAt: Number.isFinite(venueReveal) ? toDateTimeInputValue(new Date(venueReveal)) : '',
    isOutdoor: Boolean(place.isOutdoor),
    backupVenue: venueCopy(place.backupVenue),
    requiresApproval: Boolean(event.requiresApproval),
    questions: (event.questions || []).map(({ id, text, type, required, options }) => ({ id, text, type, required: Boolean(required), ...(options?.length ? { options: [...options] } : {}) })),
  }
}

// load (or reset) when the event ID changes; creation and embedded editing share this wizard.
let editRequest = 0
watch(editId, async (id) => {
  const request = ++editRequest
  step.value = 1
  showErrors.value = false
  errorMessage.value = ''
  editBlocked.value = ''
  original.value = null
  if (!id) {
    form.value = withDefaultTimes(blankEventForm())
    return
  }
  editLoading.value = true
  try {
    const event = await getEvent(id)
    if (request !== editRequest) return
    if (!event.isMine && !event.canManage) editBlocked.value = 'You can only edit events you organise.'
    else if (event.status !== 'draft' && new Date(event.startTime).getTime() <= Date.now()) editBlocked.value = 'This event has already started, so it can no longer be edited.'
    else if (!isOfficialEvent(event)) editBlocked.value = 'Groups are managed from their page in Community.'
    else {
      const [rsvps, access] = await Promise.all([getRsvpsForEvent(id), event.isOnline ? getEventOnlineAccess(id) : null])
      if (request !== editRequest) return
      form.value = formFromEvent(event, access)
      original.value = formFromEvent(event, access)
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
// removing a question people already answered would delete their answers
const canRemoveQuestion = (question) => !(isEditing.value && hasRsvps.value && isExistingQuestion(question))

// the question currently being typed in step 3
const newQuestion = ref({ text: '', type: 'text', required: false, optionsText: '' })
// shown on review when a typed-but-not-added question was added for the organiser
const questionNotice = ref('')

// stops people picking a date in the past
const nowForInput = toDateTimeInputValue(new Date())

// ---------- step 1: tag suggestions (automation) ----------

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

// ---------- event title suggestions (search as you type) ----------

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

// ---------- automatic plan: programme + tasks from similar past events ----------

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
      capacity: !f.noLimit && Number.isInteger(f.capacity) ? f.capacity : null,
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

// adds the accepted plan to the event just created. false = stop and let the organiser retry.
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

// ---------- checking each step before moving on ----------

const stepErrors = computed(() => errorsForStep(form.value, step.value, ruleContext()))

// what the shared form checks need from this page: edit-mode capacity limits and live mode
function ruleContext() {
  return { editing: isEditing.value, originalCapacity: original.value?.capacity, minCapacity: minCapacity.value, live: USING_SUPABASE }
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
    else if (!f.noLimit && (!Number.isInteger(f.capacity) || f.capacity < 1)) targetId = 'capacity'
    else if (f.tags.length === 0) targetId = 'tag-music'
  } else if (step.value === 2 && form.value.isOnline) {
    const link = form.value.onlineLink
    if (link.url.trim() && stepErrors.value.some((error) => error.includes('https://'))) targetId = 'online-link'
    else if (link.url.trim() && stepErrors.value.length) targetId = 'online-reveal'
  } else if (step.value === 2) {
    targetId = form.value.venue ? 'step-content-heading' : 'venue-search'
    if (stepErrors.value.some((error) => error.includes('revealed'))) targetId = 'venue-reveal'
    else if (form.value.venue && form.value.isOutdoor && !form.value.backupVenue) targetId = 'backup-search'
  }
  document.getElementById(targetId)?.focus()
}

function nextStep() {
  // a question typed but never added would otherwise be left out of the event without warning
  if (step.value === 3 && newQuestion.value.text.trim() !== '') {
    if (!canAddQuestion.value) {
      questionNotice.value = `${newQuestionError.value} Add the options, or clear the question, to continue.`
      focusById('q-options')
      return
    }
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

// finished steps in the progress bar jump straight back (moving forward still goes through next's validation)
function jumpToStep(target) {
  if (target >= step.value) return
  showErrors.value = false
  questionNotice.value = ''
  direction.value = -1
  step.value = target
  focusStep()
}

function previousStep() {
  showErrors.value = false
  questionNotice.value = ''
  direction.value = -1
  step.value--
  focusStep()
}

// ---------- step 2: venue ----------

// the search box disappears once a place is chosen (and returns on "change"), so move
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

// ---------- step 3: custom RSVP questions ----------

const newOptions = computed(() => parseOptions(newQuestion.value.optionsText))
const newQuestionError = computed(() => (needsOptions(newQuestion.value.type) ? optionsError(newOptions.value) : ''))
const canAddQuestion = computed(() => newQuestion.value.text.trim() !== '' && !newQuestionError.value)
function addQuestion() {
  if (!canAddQuestion.value) return
  form.value.questions.push({
    id: crypto.randomUUID(), // a real id up front, so a retried live save can't add it twice
    text: newQuestion.value.text.trim(),
    type: newQuestion.value.type,
    required: newQuestion.value.required,
    ...(needsOptions(newQuestion.value.type) ? { options: newOptions.value } : {}),
  })
  newQuestion.value = { text: '', type: 'text', required: false, optionsText: '' } // clear the inputs
  focusById('q-text')
}

function removeQuestion(index) {
  form.value.questions.splice(index, 1)
  focusById('q-text') // its remove button is gone; continue where the next question is typed
}

// ---------- step 4: publish (or save changes in edit mode) ----------

// the form, cleaned up for saving (shared by publish and save changes)
function eventDataFromForm() {
  const f = form.value
  return {
    ...f,
    title: f.title.trim(),
    description: f.description.trim(),
    startTime: new Date(f.startTime).toISOString(), // store one standard date format
    endTime: new Date(f.endTime).toISOString(),
    capacity: f.noLimit || f.capacity === '' ? null : f.capacity,
    hideCapacity: Boolean(f.hideCapacity),
    isOnline: Boolean(f.isOnline),
    // online events keep no venue or rain plan; a typed venue stays in the form in case they switch
    // back. with no venue yet there is no rain plan, and only a time still to come hides a venue.
    isOutdoor: f.isOnline || !f.venue ? false : f.isOutdoor,
    venue: f.isOnline ? null : f.venue,
    backupVenue: !f.isOnline && f.venue && f.isOutdoor ? f.backupVenue : null,
    venueRevealAt: venueRevealToSave(f),
    onlineLink: f.isOnline && f.onlineLink.url.trim()
      ? { url: f.onlineLink.url.trim(), revealAt: new Date(f.onlineLink.revealAt).toISOString() }
      : null,
    questions: f.questions.map((question) => ({ ...question, text: question.text.trim() })),
  }
}

const revealLabel = computed(() => {
  const reveal = new Date(form.value.onlineLink.revealAt)
  return Number.isNaN(reveal.getTime()) ? '' : new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium', timeStyle: 'short' }).format(reveal)
})

const pendingChanges = ref([]) // what changed, shown in the pop-up and used for the announcement
const showAnnounceDialog = ref(false)
const savingChanges = ref(false)
const saveError = ref('')
const changesSaved = ref(false) // already saved; only the announcement is left (retry)
let announceAttempt = null

async function reviewChanges() {
  if (savingChanges.value || uploadingCover.value) return
  const invalidStep = [1, 2, 3].find((stepNumber) => errorsForStep(form.value, stepNumber, ruleContext()).length > 0)
  if (invalidStep) {
    direction.value = invalidStep < step.value ? -1 : 1
    step.value = invalidStep
    showErrors.value = true
    await focusStep()
    return
  }
  editSuccess.value = ''
  // settings left from a cleared venue aren't saved, so they aren't announced either
  const f = form.value
  pendingChanges.value = describeEventChanges(original.value, { ...f, isOutdoor: Boolean(f.venue) && f.isOutdoor, venueRevealAt: f.venue ? f.venueRevealAt : '' })
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
      // a retried post reuses its id, so the same announcement can't appear twice
      if (!announceAttempt || announceAttempt.body !== body) announceAttempt = { body, requestId: crypto.randomUUID() }
      await createAnnouncement(editId.value, body, announceAttempt.requestId)
    }
    showAnnounceDialog.value = false
    await finishEditing(announce)
  } catch (error) {
    saveError.value = changesSaved.value
      ? `Your changes are saved, but the announcement couldn't be posted: ${error.message}`
      : `Your changes couldn't be saved: ${error.message}`
  } finally {
    savingChanges.value = false
  }
}

async function finishEditing(announced = false) {
  if (props.embedded) {
    original.value = JSON.parse(JSON.stringify(form.value))
    changesSaved.value = false
    editSuccess.value = announced ? 'Event updated and announcement posted.' : 'Event updated.'
    emit('saved')
  } else {
    await router.push({ path: '/organiser/events', query: { updated: editId.value, ...(announced ? { announced: '1' } : {}) } })
  }
}

function closeAnnounceDialog() {
  showAnnounceDialog.value = false
  // keep saved changes when the organiser skips a failed announcement.
  if (changesSaved.value) finishEditing()
}

// new events are created live; "publish later" hides the new event again before anyone is sent there
async function settleVisibility(eventId) {
  if (publishWhen.value !== 'later' || visibilitySettled) return true
  try {
    await setEventPublished(eventId, false)
    visibilitySettled = true
    return true
  } catch (error) {
    errorMessage.value = 'The event was created, but could not be saved as a draft: ' + error.message + ' Press the button again to retry.'
    return false
  }
}
const afterCreateUrl = (eventId) => '/organiser/events?created=' + eventId + (publishWhen.value === 'later' ? '&draft=1' : '')

async function publish() {
  if (publishing.value || uploadingCover.value) return
  const invalidStep = [1, 2].find((stepNumber) => errorsForStep(form.value, stepNumber, ruleContext()).length > 0)
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
      if (!(await settleVisibility(createdEventId))) return
      if (!(await finishPlan(createdEventId))) return
    } finally {
      publishing.value = false
    }
    await router.push(afterCreateUrl(createdEventId))
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
    if (!(await settleVisibility(created.id))) return
    if (!(await finishPlan(created.id))) return
    const navigationFailure = await router.push(afterCreateUrl(created.id))
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
  <div class="design-baseline create-event-page col-12 mx-auto" :class="{ 'is-embedded': props.embedded }">
    <header class="create-heading">
      <component :is="props.embedded ? 'h2' : 'h1'">{{ isEditing ? 'Edit event' : 'Create an event' }}</component>
      <!-- the step tracker lives in the banner; it waits until the event has loaded when editing -->
      <StepIndicator v-if="!(isEditing && (editLoading || editBlocked))" :steps="steps" :current="step" @select="jumpToStep" />
    </header>

    <p v-dismissible v-if="editSuccess" class="alert alert-success" role="status">{{ editSuccess }}</p>

    <!-- edit mode: still loading the event, or the reason it can't be edited -->
    <div v-if="isEditing && editLoading" class="text-center my-5" role="status">
      <div class="spinner-border text-primary" aria-hidden="true"></div>
      <span class="visually-hidden">Loading the event…</span>
    </div>
    <div v-dismissible v-else-if="isEditing && editBlocked" class="alert alert-warning" role="alert">
      {{ editBlocked }} <BackLink to="/organiser/events">Go back</BackLink>
    </div>

    <template v-else>
    <div class="creation-layout">
    <div class="card shadow-sm creation-form-card">
      <div class="card-body p-4">
        <Transition :name="direction > 0 ? 'step-forward' : 'step-back'" mode="out-in" @after-enter="focusStep">
        <div :key="step" class="step-panel">
        <!-- ================= step 1: basics ================= -->
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

          <!-- description takes about 70% of the row, the cover image the rest; stacked on small screens -->
          <div class="description-row" :class="{ 'has-cover': USING_SUPABASE }">
          <div class="mb-3">
            <label for="description" class="form-label">Description</label>
            <textarea
              id="description"
              class="form-control"
              rows="5"
              v-model="form.description"
              placeholder="What will happen? What should people bring?"
            ></textarea>
          </div>

          <div v-if="USING_SUPABASE" class="mb-3">
            <label for="event-cover" class="form-label">Cover image (optional)</label>
            <input id="event-cover" type="file" class="form-control" accept="image/jpeg,image/png,image/webp" :disabled="uploadingCover || publishing" aria-describedby="cover-help" @change="chooseCover" />
            <p id="cover-help" class="form-text">JPEG, PNG or WebP, up to 10 MiB.</p>
            <p v-if="uploadingCover" role="status"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span> Uploading image…</p>
            <p v-dismissible v-if="coverError" class="text-danger" role="alert">{{ coverError }}</p>
            <figure v-if="form.coverImageUrl" class="cover-preview">
              <img :src="form.coverImageUrl" alt="Event cover preview" />
              <figcaption>How your cover is cropped on event cards</figcaption>
              <button type="button" class="btn btn-outline-secondary btn-sm" @click="form.coverImageUrl = ''">Remove cover</button>
            </figure>
          </div>
          </div>
          <div class="row">
            <div class="col-md-4 mb-3">
              <label for="start" class="form-label">Starts</label>
              <WheelDateTime
                id="start"
                :aria-describedby="showErrors && stepErrors.length ? 'validation-error-list' : undefined"
                :aria-invalid="showErrors && stepErrors.some((error) => error.includes('time')) || undefined"
                v-model="form.startTime"
                :min="nowForInput"
              />
            </div>
            <div class="col-md-4 mb-3">
              <label for="end" class="form-label">Ends</label>
              <WheelDateTime
                id="end"
                v-model="form.endTime"
                :min="form.startTime || nowForInput"
                :aria-invalid="endBeforeStart || undefined"
                :aria-describedby="endBeforeStart ? 'end-error' : (showErrors && stepErrors.length ? 'validation-error-list' : undefined)"
              />
              <p v-dismissible v-if="endBeforeStart" id="end-error" class="small text-danger mt-1 mb-0" role="alert">The event has to end after it starts.</p>
            </div>
            <div class="col-md-4 mb-3">
              <div class="capacity-head">
                <label for="capacity" class="form-label mb-0">Capacity</label>
                <div class="form-check form-switch m-0">
                  <input id="show-capacity" v-model="showCapacity" class="form-check-input" type="checkbox" role="switch" />
                  <label class="form-check-label" for="show-capacity">Show to participants</label>
                </div>
              </div>
              <input
                id="capacity"
                type="number"
                min="1"
                class="form-control"
                :disabled="form.noLimit"
                :placeholder="form.noLimit ? 'No limit' : undefined"
                :aria-describedby="showErrors && stepErrors.length ? 'validation-error-list' : undefined"
                :value="form.noLimit ? '' : form.capacity"
                @input="form.capacity = $event.target.value === '' ? '' : Number($event.target.value)"
              />
              <div class="form-check mt-2">
                <input id="no-limit" v-model="form.noLimit" class="form-check-input" type="checkbox" />
                <label class="form-check-label" for="no-limit">No limit (unlimited spots)</label>
              </div>
            </div>
          </div>

          <div class="mb-2">
            <label class="form-label d-block">Tags</label>
            <!-- bootstrap "btn-check": a checkbox that looks like a toggle button -->
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
                <label class="tag-chip cat-tint" :class="`cat-${tag}`" :for="'tag-' + tag">{{ tag.charAt(0).toUpperCase() + tag.slice(1) }}</label>
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

        <!-- ================= step 2: venue ================= -->
        <div v-else-if="step === 2" aria-labelledby="step-content-heading">
          <h2 id="step-content-heading" class="visually-hidden" tabindex="-1">Venue</h2>
          <p v-dismissible v-if="venueLocked" class="alert alert-info small">
            This event has already switched to its rain backup venue, so its venues can't be changed here.
          </p>
          <fieldset class="event-mode mb-4" :disabled="venueLocked">
            <legend class="h5 step-subheading">Where does it happen?</legend>
            <div class="event-mode-options">
              <input id="mode-physical" v-model="form.isOnline" class="btn-check" type="radio" name="event-mode" :value="false" />
              <label class="event-mode-option" for="mode-physical">
                <span class="event-mode-title">Physical</span>
                <span class="event-mode-hint">At a venue, with a map</span>
              </label>
              <input id="mode-online" v-model="form.isOnline" class="btn-check" type="radio" name="event-mode" :value="true" />
              <label class="event-mode-option" for="mode-online">
                <span class="event-mode-title">Online</span>
                <span class="event-mode-hint">A video call or stream link</span>
              </label>
            </div>
          </fieldset>

          <template v-if="form.isOnline">
            <h3 class="h5 step-subheading">Online link</h3>
            <div class="online-grid">
            <div class="mb-3">
              <label for="online-link" class="form-label">Meeting or stream link (optional for now)</label>
              <input
                id="online-link"
                v-model="form.onlineLink.url"
                type="url"
                inputmode="url"
                class="form-control"
                placeholder="https://zoom.us/j/123456"
                autocomplete="off"
                :maxlength="2048"
                :aria-invalid="showErrors && stepErrors.some((error) => error.includes('https://')) || undefined"
              />
            </div>
            <div class="mb-3">
              <label for="online-reveal" class="form-label">Show the link from</label>
              <WheelDateTime
                id="online-reveal"
                v-model="form.onlineLink.revealAt"
                class="online-reveal"
                clearable
                :aria-invalid="showErrors && stepErrors.some((error) => error.includes('appear')) || undefined"
              />
            </div>
            </div>
          </template>

          <template v-else>
          <h3 class="h5 step-subheading">Main venue <span class="step-subheading-note">(optional for now)</span></h3>
          <!-- theme-aware chosen-venue card; it receives focus after a search result is picked -->
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
          <template v-else>
            <AddressSearch
              label="Search for the venue"
              input-id="venue-search"
              @select="setVenue"
            >
              <template #note>Not decided yet? Leave it blank!</template>
            </AddressSearch>
          </template>

          <template v-if="form.venue">
          <div class="form-check form-switch my-3">
            <input
              class="form-check-input"
              type="checkbox"
              role="switch"
              id="venue-hide"
              v-model="hideVenue"
              :disabled="venueLocked"
              aria-describedby="venue-hide-help"
            />
            <label class="form-check-label" for="venue-hide">Keep the venue hidden until a set time</label>
            <div id="venue-hide-help" class="form-text">
              Until then, participants see only when it will be revealed. You and your co-organisers can still see it.
            </div>
          </div>
          <div v-if="hideVenue" class="mb-3">
            <label for="venue-reveal" class="form-label">Reveal the venue on</label>
            <WheelDateTime
              id="venue-reveal"
              v-model="form.venueRevealAt"
              class="online-reveal"
              clearable
              aria-describedby="venue-reveal-help"
              :aria-invalid="showErrors && stepErrors.some((error) => error.includes('revealed')) || undefined"
            />
            <div id="venue-reveal-help" class="form-text">
              Everyone sees the venue from this date and time, no later than the start. A time that has already passed shows it straight away.
            </div>
          </div>

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
          </template>
          </template>
        </div>

        <!-- ================= step 3: RSVP questions ================= -->
        <div v-else-if="step === 3" aria-labelledby="step-content-heading">
          <h2 id="step-content-heading" class="visually-hidden" tabindex="-1">RSVP questions</h2>
          <div class="questions-head">
            <h3 class="h5 step-subheading mb-0">Questions for people who RSVP</h3>
            <div class="form-check form-switch m-0">
              <input class="form-check-input" type="checkbox" role="switch" id="approval" v-model="form.requiresApproval" />
              <label class="form-check-label" for="approval">I want to approve each RSVP myself</label>
            </div>
          </div>
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
                <!-- edit mode: questions that are already saved can be reworded in place -->
                <template v-if="isEditing && isExistingQuestion(question)">
                  <label class="visually-hidden" :for="'q-edit-' + question.id">Wording of question {{ index + 1 }}</label>
                  <input :id="'q-edit-' + question.id" v-model="question.text" class="form-control form-control-sm question-reword" />
                </template>
                <span v-else class="question-text">{{ question.text }}</span>
                <span class="question-chip">{{ questionTypeLabel(question.type) }}</span>
                <span v-if="question.options?.length" class="question-options">{{ question.options.join(' · ') }}</span>
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
                <div class="question-add-row">
                  <button
                    type="button"
                    class="question-add"
                    :disabled="!canAddQuestion"
                    aria-label="Add question"
                    title="Add question"
                    @click="addQuestion"
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
                  </button>
                  <input
                    id="q-text"
                    class="form-control"
                    v-model="newQuestion.text"
                    placeholder="Type a question"
                    @keyup.enter="addQuestion"
                  />
                </div>
              </div>
              <div class="col-md-3">
                <label for="q-type" class="form-label small">Answer type</label>
                <select id="q-type" class="form-select" v-model="newQuestion.type">
                  <option v-for="type in QUESTION_TYPES" :key="type.value" :value="type.value">{{ type.label }}</option>
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
              <div v-if="needsOptions(newQuestion.type)" class="col-12">
                <label for="q-options" class="form-label small">Options (one per line, or separated by commas)</label>
                <textarea id="q-options" class="form-control" rows="3" v-model="newQuestion.optionsText" placeholder="Year 1&#10;Year 2&#10;Year 3" :aria-invalid="newQuestion.optionsText.trim() && newQuestionError ? 'true' : undefined" aria-describedby="q-options-help"></textarea>
                <div id="q-options-help" class="form-text" :class="{ 'text-danger': newQuestion.optionsText.trim() && newQuestionError }">{{ newQuestion.optionsText.trim() && newQuestionError ? newQuestionError : `${newOptions.length} ${newOptions.length === 1 ? 'option' : 'options'}` }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- ================= step 4: review ================= -->
        <div v-else aria-labelledby="step-content-heading">
          <h2 id="step-content-heading" class="visually-hidden" tabindex="-1">Review</h2>
          <p class="text-secondary">
            {{ isEditing
              ? 'Check your changes. Saving updates the live event straight away; use Back to change anything.'
              : 'Check everything before publishing. Use Back to change anything; nothing is lost.' }}
          </p>
          <p v-dismissible v-if="questionNotice" class="question-notice" role="status">{{ questionNotice }}</p>
          <fieldset v-if="!isEditing" class="publish-choice" :disabled="publishing || eventCreated">
            <legend class="form-label">When should it go live?</legend>
            <div class="choice-group">
              <div class="form-check choice-option">
                <input id="publish-now" v-model="publishWhen" class="form-check-input" type="radio" name="publish-when" value="now" />
                <label class="form-check-label" for="publish-now">Publish now</label>
              </div>
              <div class="form-check choice-option">
                <input id="publish-later" v-model="publishWhen" class="form-check-input" type="radio" name="publish-when" value="later" />
                <label class="form-check-label" for="publish-later">Save as a draft, publish later</label>
              </div>
            </div>
          </fieldset>
          <EventSummary :event="form">
            <hr />
            <p v-if="form.isOnline" class="mb-1">
              <strong>Online link:</strong>
              {{ form.onlineLink.url.trim() ? `confirmed attendees can open it from ${revealLabel}` : 'not added yet. Add it later in Manage event → Edit event.' }}
            </p>
            <p v-if="!form.isOnline" class="mb-1">
              <strong>Venue:</strong>
              {{ !form.venue ? 'to be announced. Add it later in Manage event → Edit event.'
                : venueRevealToSave(form) ? `hidden from participants until ${venueRevealLabel}` : 'shown to everyone' }}
            </p>
            <p v-if="form.hideCapacity" class="mb-1">
              <strong>Capacity:</strong> hidden from participants (they only see when it's full)
            </p>
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
          <!-- offered on review, when the title, tags, times and size are all known. plans are only
               added by publish(), so editing an event doesn't offer one -->
          <section v-if="!isEditing" class="plan-offer" aria-labelledby="plan-offer-heading">
            <h3 id="plan-offer-heading" class="h6 mb-1">Want a head start?</h3>
            <p class="plan-offer-copy">Suggest a programme and tasks from similar past events. You pick what to keep; they're added when you publish.</p>
            <button v-if="PLANNER_AVAILABLE" type="button" class="btn btn-outline-primary btn-sm" :disabled="!canGenerate" @click="generatePlan">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M10 1.5l1.7 4.8 4.8 1.7-4.8 1.7L10 14.5l-1.7-4.8-4.8-1.7 4.8-1.7zM16 12l.8 2.2L19 15l-2.2.8L16 18l-.8-2.2L13 15l2.2-.8z"/></svg>Suggest programme &amp; tasks
            </button>
            <p v-else class="plan-offer-copy mb-0">Available when you're signed in on the live site.</p>
          </section>
        </div>

        </div>
        </Transition>
        <!-- suggested plan (programme + tasks from similar past events) -->
        <section v-if="planBusy || planOffer || planError || acceptedPlan" ref="planPanel" class="plan-panel" tabindex="-1" aria-labelledby="plan-panel-heading">
          <div class="plan-panel-head">
            <h3 id="plan-panel-heading" class="h6 mb-0">Suggested plan</h3>
            <button v-if="planOffer || planError || planBusy" type="button" class="btn-close" aria-label="Dismiss suggested plan" @click="dismissPlan"></button>
          </div>
          <p v-if="planBusy" class="mb-0 mt-2" role="status">Looking at similar past events…</p>
          <div v-dismissible v-else-if="planError" class="alert alert-danger mt-2 mb-0" role="alert">
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

        <!-- errors for the current step -->
        <div v-dismissible v-if="showErrors && stepErrors.length > 0" class="alert alert-danger mt-4 mb-0" role="alert" aria-labelledby="validation-summary-heading">
          <h3 id="validation-summary-heading" class="h6">Fix these items before continuing</h3>
          <ul id="validation-error-list" class="mb-0">
            <li v-for="error in stepErrors" :key="error">{{ error }}</li>
          </ul>
        </div>
        <div v-dismissible v-if="errorMessage" class="alert alert-danger mt-4 mb-0" role="alert">{{ errorMessage }}</div>
      </div>

      <!-- back / next / publish -->
      <div class="card-footer d-flex justify-content-between creation-actions">
        <!-- hidden on the first step rather than greyed out; the spacer keeps next on the right -->
        <button
          v-if="step > 1"
          type="button"
          class="btn btn-outline-secondary"
          @click="previousStep"
        >
          Back
        </button>
        <span v-else aria-hidden="true"></span>
        <div class="d-flex gap-2 creation-actions-end">
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
            {{ publishWhen === 'later' ? (publishing ? 'Saving…' : 'Save as draft') : (publishing ? 'Publishing…' : 'Publish event') }}
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
          <div class="preview-meta"><span aria-hidden="true">⌖</span><span>{{ form.isOnline ? 'Online' : !form.venue ? 'Venue to be announced' : venueRevealToSave(form) ? `Venue revealed on ${venueRevealLabel}` : form.venue.name }}</span></div>
          <div class="preview-meta"><span aria-hidden="true">◎</span><span>{{ form.hideCapacity ? 'Capacity hidden from participants' : form.noLimit ? 'Unlimited spots' : Number.isInteger(form.capacity) && form.capacity > 0 ? `${form.capacity} spots` : 'Capacity to be set' }}</span></div>
        </div>
      </article>
      <p class="preview-note">This is a guide to how your event details come together.</p>
    </aside>
    </div>
    </template>

    <!-- edit mode: what changed + optional announcement, shown before saving -->
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
.create-heading { margin: 0 0 1rem; padding: 1.1rem clamp(1rem, 3vw, 1.75rem); border-left: 5px solid var(--bookedz-primary-dark); border-radius: 0 20px 20px 0; background: linear-gradient(120deg,var(--bookedz-peach),var(--bookedz-mango)); }
.create-heading :is(h1, h2) { margin: 0 0 .4rem; color: var(--bookedz-ink); font-size: clamp(1.7rem, 3vw, 2.3rem); font-weight: 700; letter-spacing: -.035em; }
.creation-layout { display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(15rem, .85fr); align-items: start; gap: 1.25rem; }
.plan-offer { margin-top: 1.25rem; padding: 1rem; border: 1px dashed var(--bookedz-control-border); border-radius: 14px; background: var(--bookedz-glass-solid); }
.plan-offer-copy { margin: 0 0 .75rem; color: var(--bookedz-muted); font-size: .875rem; }
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
/* sits above the phone tab bar when there is one (--bottom-nav-h, main.css) */
.create-event-page :deep(.card-footer) { padding: .85rem clamp(1rem, 3vw, 2rem); border-color: var(--bookedz-border); background: var(--bookedz-glass-solid) !important; backdrop-filter: blur(14px); }
.create-event-page :deep(.card-footer .btn) { min-width: 6.5rem; min-height: 44px; }
.create-event-page :deep(.form-control), .create-event-page :deep(.form-select) { border-radius: 10px; transition: border-color .18s ease, box-shadow .18s ease, background-color .18s ease; }
.create-event-page :deep(.form-control:focus), .create-event-page :deep(.form-select:focus) { border-color: var(--bookedz-primary-dark); box-shadow: var(--bookedz-focus-glow); }
.create-event-page :deep(.btn-primary), .create-event-page :deep(.btn-success) { background: var(--bookedz-primary); border-color: var(--bookedz-primary); color: var(--bookedz-on-action); }
.create-event-page :deep(.btn-primary:hover), .create-event-page :deep(.btn-success:hover) { background: var(--bookedz-primary-hover); border-color: var(--bookedz-primary-hover); }
.event-preview { position: sticky; top: 1rem; padding: 1rem; border: 1px solid var(--bookedz-border); border-radius: 1.25rem; background: var(--bookedz-glass-solid); box-shadow: var(--bookedz-card-shadow); }
.preview-heading { display: flex; align-items: center; gap: .55rem; margin: 0 0 .85rem; color: var(--bookedz-muted); font-size: .78rem; font-weight: 650; }
.preview-pulse { width: .5rem; height: .5rem; border-radius: 50%; background: var(--bookedz-success); box-shadow: 0 0 0 .25rem var(--bookedz-glass-active); }
.preview-card { overflow: hidden; border: 1px solid var(--bookedz-border); border-radius: 1rem; background: var(--bookedz-surface); }
/* same 16:9 crop as the event cards, so the preview shows what participants will see */
.preview-art { position: relative; display: grid; aspect-ratio: 16 / 9; place-items: center; overflow: hidden; background: var(--bookedz-mango); background-position: center; background-size: cover; }
.preview-art-mark svg { width: 80px; height: 60px; }
.preview-art-mark { color: var(--bookedz-primary-dark); font-size: 3.3rem; line-height: 1; }
.preview-tag { position: absolute; bottom: .65rem; left: .7rem; max-width: calc(100% - 1.4rem); overflow: hidden; padding: .25rem .55rem; border-radius: 99px; background: var(--bookedz-surface); color: var(--bookedz-ink); font-size: .72rem; text-overflow: ellipsis; white-space: nowrap; }
.preview-art.has-cover .preview-tag { background: var(--bookedz-glass-solid); }
.preview-copy { padding: .9rem; }
.preview-date { margin: 0 0 .35rem; color: var(--bookedz-primary-dark); font-size: .76rem; font-weight: 650; }
.preview-copy h2 { margin: 0 0 .45rem; color: var(--bookedz-ink); font-size: 1.1rem; line-height: 1.2; overflow-wrap: anywhere; }
.preview-description { display: -webkit-box; overflow: hidden; margin: 0 0 .8rem; color: var(--bookedz-muted); font-size: .82rem; line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 3; line-clamp: 3; }
.preview-meta { display: flex; gap: .5rem; align-items: baseline; margin-top: .4rem; color: var(--bookedz-ink); font-size: .78rem; }
.preview-meta span:first-child { color: var(--bookedz-primary-dark); font-size: 1rem; }
.preview-note { margin: .75rem 0 0; color: var(--bookedz-muted); font-size: .75rem; line-height: 1.4; }
.step-panel { min-width: 0; }
.step-forward-enter-active, .step-forward-leave-active, .step-back-enter-active, .step-back-leave-active { transition: opacity .2s ease, transform .24s cubic-bezier(.2,.7,.2,1); }
.step-forward-enter-from { opacity: 0; transform: translateX(1.1rem); }
.step-forward-leave-to { opacity: 0; transform: translateX(-.65rem); }
.step-back-enter-from { opacity: 0; transform: translateX(-1.1rem); }
.step-back-leave-to { opacity: 0; transform: translateX(.65rem); }
/* phones: the form comes first so the current step's fields are visible without scrolling; the preview follows it */
@media (max-width: 767.98px) { .creation-layout { grid-template-columns: minmax(0, 1fr); } .event-preview { position: static; } }
@media (max-width: 575.98px) { .create-heading { margin-top: .5rem; } }
.cover-preview { display: grid; justify-items: start; gap: .5rem; margin: 1rem 0 0; }
.cover-preview img { display: block; width: min(100%, 32rem); aspect-ratio: 16 / 9; object-fit: cover; border: 1px solid var(--bookedz-border); border-radius: 14px; }
.cover-preview figcaption { color: var(--bookedz-muted); font-size: .85rem; }
/* venue and question boxes use theme tokens (bootstrap's bg-light stays white in dark mode) */
.step-subheading { margin: 0 0 .75rem; color: var(--bookedz-ink); font-weight: 650; }
.venue-choice { margin-bottom: 1rem; padding: 1rem; border: 1px solid var(--bookedz-border); border-radius: 14px; background: color-mix(in srgb, var(--bookedz-mint) 22%, var(--bookedz-surface)); }
.venue-choice-name { margin: 0; color: var(--bookedz-ink); font-weight: 700; overflow-wrap: anywhere; }
.venue-choice-meta { margin: .15rem 0 0; color: var(--bookedz-muted); font-size: .875rem; overflow-wrap: anywhere; }
.question-add-row { display: flex; align-items: center; gap: .5rem; }
.question-add { flex: none; display: grid; place-items: center; width: 44px; height: 44px; border: 2px solid var(--bookedz-ink); border-radius: 50%; background: var(--bookedz-fill); color: var(--bookedz-on-fill); cursor: pointer; transition: transform var(--bookedz-motion-fast) var(--bookedz-ease-stamp); }
.question-add:disabled { border-color: var(--bookedz-control-border); background: var(--bookedz-glass-active); color: var(--bookedz-muted); cursor: not-allowed; }
.question-add:not(:disabled):hover { transform: rotate(90deg); }
.question-options { color: var(--bookedz-muted); font-size: .8rem; overflow-wrap: anywhere; }
@media (prefers-reduced-motion: reduce) { .question-add { transition: none; } .question-add:not(:disabled):hover { transform: none; } }
.question-composer { padding: 1rem; border: 1px solid var(--bookedz-border); border-radius: 14px; background: var(--bookedz-glass-solid); }
.question-summary { display: flex; flex-wrap: wrap; align-items: center; gap: .35rem .5rem; min-width: 0; }
.question-text { color: var(--bookedz-ink); overflow-wrap: anywhere; }
.question-chip { display: inline-flex; align-items: center; padding: .2rem .6rem; border: 1px solid var(--bookedz-border); border-radius: 999px; color: var(--bookedz-ink); background: var(--bookedz-hover); font-size: .75rem; font-weight: 650; }
.question-chip--required { color: var(--bookedz-primary-dark); }
.question-reword { flex: 1 1 14rem; min-width: 0; }
.question-locked { flex: 0 0 auto; color: var(--bookedz-muted); font-size: .8rem; }
.question-notice { margin: 0 0 1rem; padding: .7rem .9rem; border-radius: 12px; color: var(--bookedz-ink); background: color-mix(in srgb, var(--bookedz-mint) 30%, var(--bookedz-surface)); font-size: .9rem; }
/* disabled outline buttons (back on step 1, an empty "add question") use the theme's disabled
   colours instead of bootstrap's default grey/blue, matching disabled .event-cta buttons */
.create-event-page :deep(.btn-outline-primary), .create-event-page :deep(.btn-outline-secondary) { --bs-btn-disabled-color: var(--bookedz-disabled-ink); --bs-btn-disabled-bg: var(--bookedz-disabled-bg); --bs-btn-disabled-border-color: var(--bookedz-border); --bs-btn-disabled-opacity: 1; }
@media (prefers-reduced-motion: reduce) { .step-forward-enter-active, .step-forward-leave-active, .step-back-enter-active, .step-back-leave-active, .create-event-page :deep(.form-control), .create-event-page :deep(.form-select) { transition: none; } }
/* tags look exactly like discover's category chips, so the preview matches what visitors see */
.tag-chip { display: inline-flex; align-items: center; min-height: 44px; padding: 9px 15px; border: 1px solid transparent; border-radius: 99px; color: var(--bookedz-ink); font-size: 13px; cursor: pointer; transition: background-color var(--bookedz-motion-fast) var(--bookedz-ease), color var(--bookedz-motion-fast) var(--bookedz-ease); }
.tag-chip:hover { border-color: var(--bookedz-control-border); }
.btn-check:checked + .tag-chip { background: var(--bookedz-ink); color: var(--bookedz-surface); }
.btn-check:focus-visible + .tag-chip { outline: 3px solid var(--bookedz-primary-dark); outline-offset: 2px; }
/* physical / online: two large radio cards that reflow to one column on narrow phones */
.event-mode { min-width: 0; margin: 0; padding: 0; border: 0; }
.event-mode legend { float: none; width: auto; padding: 0; }
.event-mode-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem; }
.event-mode-option { display: grid; gap: .15rem; min-height: 44px; padding: .8rem 1rem; border: 1px solid var(--bookedz-border); border-radius: 14px; background: var(--bookedz-surface); color: var(--bookedz-ink); cursor: pointer; transition: border-color var(--bookedz-motion-fast) var(--bookedz-ease), background-color var(--bookedz-motion-fast) var(--bookedz-ease); }
.event-mode-option:hover { border-color: var(--bookedz-control-border); }
.event-mode-title { font-weight: 700; }
.event-mode-hint { color: var(--bookedz-muted); font-size: .82rem; }
.btn-check:checked + .event-mode-option { border-color: var(--bookedz-primary-dark); background: color-mix(in srgb, var(--bookedz-mint) 22%, var(--bookedz-surface)); box-shadow: inset 0 0 0 1px var(--bookedz-primary-dark); }
.btn-check:focus-visible + .event-mode-option { outline: 3px solid var(--bookedz-primary-dark); outline-offset: 2px; }
.btn-check:disabled + .event-mode-option { cursor: not-allowed; opacity: .7; }
.online-reveal { max-width: 20rem; }
/* the link takes about 70% of the row, the reveal time the rest; stacked on small screens */
.online-grid { display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 3fr); column-gap: 1rem; align-items: start; }
.online-grid .online-reveal { max-width: none; }
.online-grid :deep(.wheel-panel) { left: auto; right: 0; }
@media (max-width: 767.98px) { .online-grid { grid-template-columns: 1fr; } .online-grid :deep(.wheel-panel) { left: 0; right: auto; } }
.publish-choice { margin: 0 0 1rem; padding: 0; border: 0; }
.publish-choice legend { float: none; width: auto; padding: 0; margin-bottom: .5rem; font-size: 1rem; }
.publish-choice .choice-group { display: flex; flex-wrap: wrap; gap: .5rem; }
.publish-choice .choice-option { display: inline-flex; align-items: center; gap: .55rem; min-height: 44px; margin: 0; padding: 0 1.1rem 0 2.2rem; border: 2px solid var(--bookedz-control-border); border-radius: 12px; background: var(--bookedz-surface); }
.publish-choice .choice-option:has(.form-check-input:checked) { border-color: var(--bookedz-primary-dark); background: color-mix(in srgb, var(--bookedz-primary-dark) 12%, var(--bookedz-surface)); }
.publish-choice .choice-option .form-check-label { cursor: pointer; }
.questions-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5rem 1.5rem; margin-bottom: .5rem; }
.capacity-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .25rem .75rem; margin-bottom: .5rem; }
.capacity-head .form-check-label { font-size: .85rem; }
.description-row.has-cover { display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 3fr); column-gap: 1rem; align-items: start; }
@media (max-width: 767.98px) { .description-row.has-cover { grid-template-columns: 1fr; } }
.step-subheading-note { color: var(--bookedz-muted); font-size: .85rem; font-weight: 500; }
.venue-later-note { margin-top: .5rem; }
@media (max-width: 399.98px) { .event-mode-options { grid-template-columns: minmax(0, 1fr); } }
@media (prefers-reduced-motion: reduce) { .event-mode-option { transition: none; } }
</style>
