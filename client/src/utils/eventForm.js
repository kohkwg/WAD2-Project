// Create Event form (Feature 2): the blank form and each step's checks, shared by the wizard
// (CreateEventView) and its unit tests. Pure functions, no Vue.

// Everything the organiser fills in, across all steps
export function blankEventForm() {
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

// The error messages for one step (1 basics, 2 venue, 3 RSVP questions); [] means it's valid.
// Edit mode can't go below the people already confirmed or offered a place (minCapacity), and an
// older event may keep "no limit" ('' capacity). Live events need venues with map coordinates.
export function errorsForStep(f, stepNumber, { now = new Date(), editing = false, originalCapacity, minCapacity = 1, live = false } = {}) {
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
    const keepsNoLimit = editing && originalCapacity === '' && f.capacity === ''
    if (!keepsNoLimit && (!Number.isInteger(f.capacity) || f.capacity < 1)) {
      errors.push('Capacity must be a whole number, at least 1.')
    } else if (editing && !keepsNoLimit && f.capacity < minCapacity) {
      errors.push(`Capacity can't be lower than ${minCapacity}: that many people are already confirmed or offered a place.`)
    }
    if (f.tags.length === 0) {
      errors.push('Pick at least one tag (used for recommendations and waitlist scoring).')
    }
  }

  if (stepNumber === 2) {
    if (!f.venue) errors.push('Choose the venue from the address search.')
    if (live && f.venue && !hasCoordinates(f.venue)) {
      errors.push('Choose a venue result with map coordinates for live events.')
    }
    if (f.isOutdoor && !f.backupVenue) {
      errors.push('Outdoor events need a backup venue in case of rain.')
    }
    if (live && f.backupVenue && !hasCoordinates(f.backupVenue)) {
      errors.push('Choose a backup venue result with map coordinates for live events.')
    }
  }

  if (stepNumber === 3 && f.questions.some((question) => question.text.trim() === '')) {
    errors.push('Every RSVP question needs some wording.')
  }

  return errors
}
