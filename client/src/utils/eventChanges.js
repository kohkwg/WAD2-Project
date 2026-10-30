// Editing a published event: works out what changed, in words attendees understand,
// and builds the optional announcement posted to the event's public feed.
// `before` and `after` are both in the Create Event form shape (see CreateEventView.vue).

import { formatEventTime } from './helpers.js'

const sameText = (a, b) => (a || '').trim() === (b || '').trim()
const sameTime = (a, b) => new Date(a).getTime() === new Date(b).getTime()
const venueKey = (venue) => (venue ? [venue.name, venue.address || '', venue.lat ?? '', venue.lng ?? ''].join('|') : '')
const venueName = (venue) => venue?.name || 'no venue'
const capacityText = (capacity) => (capacity === '' || capacity == null ? 'no limit' : `${capacity} places`)
const tagList = (tags) => [...(tags || [])].sort().join(', ') || 'none'

// Returns [{ field, text }] in the order attendees care about most (time and place first)
export function describeEventChanges(before, after) {
  const changes = []
  const add = (field, text) => changes.push({ field, text })

  if (!sameTime(before.startTime, after.startTime) || !sameTime(before.endTime, after.endTime)) {
    add('time', `Time: ${formatEventTime(before)} → ${formatEventTime(after)}`)
  }
  if (venueKey(before.venue) !== venueKey(after.venue)) {
    const samePlace = before.venue?.name === after.venue?.name && (before.venue?.address || '') === (after.venue?.address || '')
    add('venue', samePlace
      ? `Venue location adjusted on the map (${venueName(after.venue)})`
      : `Venue: ${venueName(before.venue)} → ${venueName(after.venue)}`)
  }
  if (Boolean(before.isOutdoor) !== Boolean(after.isOutdoor)
    || (after.isOutdoor && venueKey(before.backupVenue) !== venueKey(after.backupVenue))) {
    add('backup', after.isOutdoor
      ? `Outdoor event; if it rains it moves to ${venueName(after.backupVenue)}`
      : 'No longer an outdoor event (no rain backup venue)')
  }
  if (!sameText(before.title, after.title)) add('title', `New name: “${after.title.trim()}”`)
  if (String(before.capacity ?? '') !== String(after.capacity ?? '')) {
    add('capacity', `Capacity: ${capacityText(before.capacity)} → ${capacityText(after.capacity)}`)
  }
  if (Boolean(before.requiresApproval) !== Boolean(after.requiresApproval)) {
    add('approval', after.requiresApproval
      ? 'New RSVPs now need the organiser’s approval'
      : 'New RSVPs are now confirmed automatically while places last')
  }

  const beforeQuestions = new Map((before.questions || []).map((question) => [question.id, question]))
  for (const question of after.questions || []) {
    const old = beforeQuestions.get(question.id)
    if (!old) add('questions', `New RSVP question: “${question.text.trim()}”`)
    else if (!sameText(old.text, question.text)) add('questions', `RSVP question reworded: “${old.text}” → “${question.text.trim()}”`)
    else if (old.required !== question.required || old.type !== question.type) add('questions', `RSVP question updated: “${question.text.trim()}”`)
  }
  const afterIds = new Set((after.questions || []).map((question) => question.id))
  for (const old of before.questions || []) {
    if (!afterIds.has(old.id)) add('questions', `RSVP question removed: “${old.text}”`)
  }

  if (!sameText(before.description, after.description)) add('description', 'Description updated')
  if (tagList(before.tags) !== tagList(after.tags)) add('tags', `Tags: ${tagList(before.tags)} → ${tagList(after.tags)}`)
  if ((before.coverImageUrl || '') !== (after.coverImageUrl || '')) {
    add('cover', after.coverImageUrl ? 'New cover image' : 'Cover image removed')
  }
  return changes
}

const FIELD_WORDS = {
  time: 'time', venue: 'venue', backup: 'rain plan', title: 'name', capacity: 'capacity',
  approval: 'RSVP rules', questions: 'RSVP questions', description: 'details', tags: 'tags', cover: 'cover image',
}

// e.g. "Update: time, venue and capacity"
export function defaultAnnouncementTitle(changes) {
  const words = [...new Set(changes.map((change) => FIELD_WORDS[change.field]))]
  if (words.length === 0) return 'Event update'
  const list = words.length === 1 ? words[0] : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`
  return `Update: ${list}`
}

export function defaultAnnouncementMessage(changes) {
  return changes.map((change) => `• ${change.text}`).join('\n')
}

// The feed shows announcements as plain text, so the title is the first line
export function formatAnnouncement(title, message) {
  return `${title.trim()}\n\n${message.trim()}`
}
