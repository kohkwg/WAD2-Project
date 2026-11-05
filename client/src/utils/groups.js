// Go together: a host starts a group to go to one event with others. Groups are public
// (listed in Community and on the event page) or private (only reachable by invite link);
// both have a link to share. A group is stored alongside events (kind 'group') so it reuses
// joining, spots and RSVPs; group.eventId names the event it is for. Pure functions, no Vue.

export const CAPACITY_RANGE = { min: 2, max: 8 } // spots in a group, including the host
export const NOTE_LIMIT = 200
export const SUGGESTION_NAME_LIMIT = 80
export const VISIBILITIES = ['public', 'private']
export const JOIN_MODES = ['open', 'approval'] // anyone can join straight away, or the host approves
export const JOIN_MESSAGE_LIMIT = 200
// Labels shown as badges on every group
export const visibilityLabel = (v) => (v === 'private' ? 'Friends only' : 'Public')
export const joinModeLabel = (m) => (m === 'approval' ? 'Host approves' : 'Anyone can join')

// The host's settings form (visibility, who can join, spots, note); members counts the host
export function settingsErrors({ visibility, joinMode, capacity, note = '' }, members = 1) {
  const errors = []
  if (!VISIBILITIES.includes(visibility)) errors.push({ field: 'visibility', message: 'Choose who can see the group.' })
  if (!JOIN_MODES.includes(joinMode)) errors.push({ field: 'joinMode', message: 'Choose who can join.' })
  const spots = Number(capacity)
  if (!Number.isInteger(spots) || spots < CAPACITY_RANGE.min || spots > CAPACITY_RANGE.max) {
    errors.push({ field: 'capacity', message: `A group has ${CAPACITY_RANGE.min} to ${CAPACITY_RANGE.max} spots, including you.` })
  } else if (spots < members) errors.push({ field: 'capacity', message: `${members} people are already in, so keep at least ${members} spots.` })
  if (String(note).trim().length > NOTE_LIMIT) errors.push({ field: 'note', message: `Keep the note to ${NOTE_LIMIT} characters or fewer.` })
  return errors
}

// "Tonight", "Tomorrow", "In 3 days" for a group card
export function countdownLabel(startTime, now = new Date()) {
  const start = new Date(startTime)
  const sg = (d) => new Date(d.getTime() + 8 * 3600e3).toISOString().slice(0, 10)
  const days = Math.round((new Date(sg(start)) - new Date(sg(now))) / 864e5)
  if (start <= now) return 'Happening now'
  if (days === 0) return start - now < 3 * 3600e3 ? `In ${Math.max(1, Math.round((start - now) / 3600e3))}h` : 'Today'
  if (days === 1) return 'Tomorrow'
  if (days < 7) return `In ${days} days`
  return `In ${Math.round(days / 7)} wk`
}
// Live events carry only the kind; demo records also have the group field
export const isGroup = (event) => event?.kind === 'group'
// A real event people can RSVP to, as opposed to a group (or an older live-mode hangout row).
export const isOfficialEvent = (event) => !event?.kind || event.kind === 'official'
export const isPrivateGroup = (event) => isGroup(event) && event.group.visibility !== 'public'

// What a join request becomes. Open joins never queue: a full open event refuses.
export function joinOutcome(event, held) {
  const mode = event.joinMode || (event.requiresApproval ? 'approval' : 'auto')
  if (mode === 'approval') return 'pending'
  const full = event.capacity != null && held >= event.capacity
  if (mode === 'open') return full ? 'full' : 'confirmed'
  return full ? 'waitlisted' : 'confirmed'
}

// The errors for the Start a group form; [] means it can be posted.
export function groupErrors({ eventId, note = '', capacity, visibility = 'public' }, events = [], now = new Date()) {
  const errors = []
  const target = events.find((e) => e.id === eventId)
  if (!target) errors.push({ field: 'event', message: 'Choose the event you want company for.' })
  else if (new Date(target.startTime) <= now) errors.push({ field: 'event', message: 'That event has already started. Choose another one.' })
  if (note.trim().length > NOTE_LIMIT) errors.push({ field: 'note', message: `Keep the note to ${NOTE_LIMIT} characters or fewer.` })
  const spots = Number(capacity)
  if (!Number.isInteger(spots) || spots < CAPACITY_RANGE.min || spots > CAPACITY_RANGE.max) {
    errors.push({ field: 'capacity', message: `A group has ${CAPACITY_RANGE.min} to ${CAPACITY_RANGE.max} spots, including you.` })
  }
  if (!VISIBILITIES.includes(visibility)) errors.push({ field: 'visibility', message: 'Choose who can find the group.' })
  return errors
}

// An unguessable invite code for the share link (/g/<token>)
export function inviteToken() {
  const bytes = new Uint8Array(12)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 16)
}

// The stored record for a new group: time, place and tags come from the event itself.
export function groupEventData(target, { note = '', capacity = 4, joinMode = 'open', visibility = 'public', token = inviteToken() }) {
  return {
    kind: 'group',
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
    group: {
      visibility,
      inviteToken: token,
      eventId: target.id,
    },
    plan: emptyPlan(),
  }
}

// ---------- Before / after plan ----------
// Two optional slots around the event. Members suggest a place or deal for each,
// everyone can mark the ones they're keen on, and the host picks one.
export const SLOTS = ['before', 'after']
export const GAP_MINUTES = 15 // time to walk over
export const SLOT_MINUTES = 60
export const emptyPlan = () => ({ before: { suggestions: [], chosenId: null }, after: { suggestions: [], chosenId: null }, availability: {} })

// Availability, when2meet style: each side of the event is a column of 15-minute cells
// (3 hours, leaving 15 minutes to walk over). Members paint the cells they're free; the
// slot is the longest stretch with the most people free in all of it.
export const CELL_MINUTES = 15
export const WINDOW_CELLS = 12 // 3 hours each side
export const MIN_SLOT_CELLS = 3 // a meal needs at least 45 minutes

// The cell start times (ISO) for one side of the event, earliest first
export function slotCells(event, slot) {
  const minute = 60000
  const anchor = slot === 'before'
    ? new Date(event.startTime).getTime() - (GAP_MINUTES + WINDOW_CELLS * CELL_MINUTES) * minute
    : new Date(event.endTime || event.startTime).getTime() + GAP_MINUTES * minute
  return Array.from({ length: WINDOW_CELLS }, (_, i) => new Date(anchor + i * CELL_MINUTES * minute).toISOString())
}

export function availabilityError(event, slot, cells) {
  if (!SLOTS.includes(slot)) return 'Choose before or after the event.'
  if (!Array.isArray(cells)) return 'Mark the times you’re free.'
  const allowed = new Set(slotCells(event, slot))
  if (cells.some((c) => !allowed.has(c))) return 'Those times are outside the planner. Refresh and try again.'
  return ''
}

// For one side: the heat per cell and the best slot. availability is { userId: { before: [iso], after: [iso] } }.
export function fitSlots(event, availability = {}, memberIds = []) {
  const out = {}
  for (const slot of SLOTS) {
    const cells = slotCells(event, slot)
    const replied = memberIds.filter((id) => Array.isArray(availability[id]?.[slot]))
    const noReply = memberIds.filter((id) => !replied.includes(id))
    const free = cells.map((cell) => replied.filter((id) => availability[id][slot].includes(cell)))
    // Most people free for the whole stretch, then the longest, then nearest the event
    let best = null
    for (let length = WINDOW_CELLS; length >= MIN_SLOT_CELLS; length--) {
      for (let first = 0; first + length <= WINDOW_CELLS; first++) {
        const people = free.slice(first, first + length).reduce((common, ids) => common.filter((id) => ids.includes(id)), replied)
        if (!people.length) continue
        const nearness = slot === 'before' ? first + length : WINDOW_CELLS - first
        const score = people.length * 10000 + length * 100 + nearness
        if (!best || score > best.score) best = { first, length, people, score }
      }
    }
    const fallback = slotTimes(event)[slot]
    const end = (i) => new Date(new Date(cells[i]).getTime() + CELL_MINUTES * 60000).toISOString()
    out[slot] = {
      cells: cells.map((start, i) => ({ start, free: free[i] })),
      start: best ? cells[best.first] : fallback.start,
      end: best ? end(best.first + best.length - 1) : fallback.end,
      fitted: Boolean(best),
      coming: best ? best.people : [],
      cant: best ? replied.filter((id) => !best.people.includes(id)) : replied,
      noReply,
      replied,
    }
  }
  return out
}

// The default slot each side (an hour, with a walk gap), used until people mark times
export function slotTimes(event) {
  const start = new Date(event.startTime).getTime()
  const end = new Date(event.endTime || event.startTime).getTime()
  const minute = 60000
  return {
    before: { start: new Date(start - (GAP_MINUTES + SLOT_MINUTES) * minute).toISOString(), end: new Date(start - GAP_MINUTES * minute).toISOString() },
    after: { start: new Date(end + GAP_MINUTES * minute).toISOString(), end: new Date(end + (GAP_MINUTES + SLOT_MINUTES) * minute).toISOString() },
  }
}

// "Lunch", "Dinner"… from the Singapore hour a slot starts at
export function mealLabel(iso) {
  const hour = Number(new Intl.DateTimeFormat('en-SG', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Singapore' }).format(new Date(iso)))
  if (hour >= 6 && hour < 11) return 'Breakfast'
  if (hour >= 11 && hour < 15) return 'Lunch'
  if (hour >= 15 && hour < 17) return 'Coffee'
  if (hour >= 17 && hour < 22) return 'Dinner'
  return 'Supper'
}

// A suggestion from a nearby place, a deal, or a name someone typed
export function suggestionFrom(item = {}) {
  if (item.kind === 'place') {
    return { kind: 'place', refId: item.id, name: item.name, detail: item.category || null, priceText: null, address: item.address || null, lat: item.lat ?? null, lng: item.lng ?? null, sourceUrl: null }
  }
  // Typed by a member: just a name, or a place picked from OneMap search with its address and pin
  const lat = Number(item.lat), lng = Number(item.lng)
  const located = item.lat != null && item.lng != null && Number.isFinite(lat) && Number.isFinite(lng)
  const address = typeof item.address === 'string' && item.address.trim() ? item.address.trim().slice(0, 200) : null
  return { kind: 'custom', refId: null, name: String(item.name || '').trim(), detail: null, priceText: null, address, lat: located ? lat : null, lng: located ? lng : null, sourceUrl: null }
}

export function suggestionErrors(plan, slot, suggestion) {
  if (!SLOTS.includes(slot)) return 'Choose before or after the event.'
  if (!suggestion.name) return 'Name the place you have in mind.'
  if (suggestion.name.length > SUGGESTION_NAME_LIMIT) return `Keep the name to ${SUGGESTION_NAME_LIMIT} characters or fewer.`
  const list = plan?.[slot]?.suggestions || []
  if (list.length >= 8) return 'This slot already has 8 ideas. Remove one first.'
  const same = (s) => (suggestion.refId && s.refId === suggestion.refId) || s.name.toLowerCase() === suggestion.name.toLowerCase()
  if (list.some(same)) return 'That place is already suggested.'
  return ''
}

// Live mode: group_plan() in the database sends ideas, availability and members; this
// fits the slots with the same fitSlots() the demo uses, so both modes pick the same times.
export function livePlanView(raw, me) {
  const iso = (value) => new Date(value).toISOString()
  const names = new Map((raw.members || []).map((m) => [m.id, m.name]))
  const memberIds = [...names.keys()]
  const availability = {}
  for (const [userId, slots] of Object.entries(raw.availability || {})) {
    availability[userId] = Object.fromEntries(Object.entries(slots).map(([slot, cells]) => [slot, (cells || []).map(iso)]))
  }
  const fitted = fitSlots({ startTime: raw.startTime, endTime: raw.endTime }, availability, memberIds)
  const person = (id) => ({ id, name: names.get(id) || 'Member', me: id === me })
  const out = {}
  for (const slot of SLOTS) {
    const f = fitted[slot]
    const chosenId = raw.choices?.[slot] || null
    const mine = availability[me]?.[slot]
    out[slot] = {
      start: f.start,
      end: f.end,
      fitted: f.fitted,
      label: mealLabel(f.start),
      cells: f.cells.map((c) => ({ start: c.start, free: c.free.map(person) })),
      memberCount: memberIds.length,
      coming: f.coming.map(person),
      cant: f.cant.map(person),
      noReply: f.noReply.map(person),
      myCells: Array.isArray(mine) ? mine : null,
      chosenId,
      suggestions: (raw.ideas || [])
        .filter((i) => i.slot === slot)
        .map((i) => ({
          id: i.id, kind: i.kind, refId: i.refId, name: i.name, detail: i.detail, priceText: i.priceText,
          address: i.address, lat: i.lat, lng: i.lng, sourceUrl: i.sourceUrl, suggestedBy: i.suggestedBy,
          suggestedByName: i.suggestedByName, createdAt: i.createdAt, mine: i.suggestedBy === me,
          votes: i.votes, myVote: i.myVote,
        }))
        .sort((a, b) => (b.id === chosenId) - (a.id === chosenId) || b.votes - a.votes),
    }
  }
  return out
}
