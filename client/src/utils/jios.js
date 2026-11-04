// Open jios: a host invites people to go to one specific event together.
// A jio is stored as a public hangout (kind 'hangout') whose hangout.eventId names the event,
// so it reuses hangout joining, spots and the optional plan. Pure functions, no Vue.
import { CAPACITY_RANGE } from './hangouts.js'

export const NOTE_LIMIT = 200
export const isJio = (event) => event?.kind === 'hangout' && Boolean(event.hangout?.eventId)

// The errors for the Start a jio form; [] means it can be posted.
export function jioErrors({ eventId, note = '', capacity }, events = [], now = new Date()) {
  const errors = []
  const target = events.find((e) => e.id === eventId)
  if (!target) errors.push({ field: 'event', message: 'Choose the event you want company for.' })
  else if (new Date(target.startTime) <= now) errors.push({ field: 'event', message: 'That event has already started. Choose another one.' })
  if (note.trim().length > NOTE_LIMIT) errors.push({ field: 'note', message: `Keep the note to ${NOTE_LIMIT} characters or fewer.` })
  const spots = Number(capacity)
  if (!Number.isInteger(spots) || spots < CAPACITY_RANGE.min || spots > CAPACITY_RANGE.max) {
    errors.push({ field: 'capacity', message: `A jio has ${CAPACITY_RANGE.min} to ${CAPACITY_RANGE.max} spots, including you.` })
  }
  return errors
}

// The hangout record for a new jio: time, place and tags come from the event itself.
export function jioEventData(target, { note = '', capacity = 4, joinMode = 'open' }) {
  return {
    kind: 'hangout',
    title: `Going to ${target.title}`,
    description: note.trim(),
    tags: [...(target.tags || [])],
    startTime: target.startTime,
    endTime: target.endTime,
    venue: target.venue ? { ...target.venue } : null,
    capacity: Number(capacity),
    isOutdoor: Boolean(target.isOutdoor),
    backupVenue: null,
    joinMode,
    requiresApproval: joinMode === 'approval',
    questions: [],
    hangout: {
      mode: 'public',
      visibility: 'public',
      stage: 'voting',
      dateRange: null,
      lockedSlot: { startTime: target.startTime, endTime: target.endTime },
      inviteToken: null,
      eventId: target.id,
    },
  }
}
