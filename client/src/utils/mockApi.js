// MOCK BACKEND: every function works on placeholder data saved in localStorage,
// so the pages can be clicked through with no database at all.
//
// supabaseApi.js has the SAME functions returning the SAME shapes, backed by the real
// database. api.js picks one of the two — pages never import this file directly.
// If you change what a function returns here, change supabaseApi.js to match.

import { createSeedData } from './mockData.js'
import { calculateWaitlistScore } from './waitlistScore.js'
import { OFFER_HOURS, ACTIVE_STATUSES } from './helpers.js'
import { joinOutcome } from './hangouts.js'
import { rankSlots, heatmap, previewSlot, rescueSuggestions, normaliseIntervals, rangeBounds } from './hangoutSlots.js'
import { retime, generatePlan, swapAlternatives, eventListing, placeListing, memberWeights, MAX_STOPS } from './itinerary.js'
import { buildPlanView, resolveRefs } from './hangoutPlan.js'
import { TASK_STATUSES, FALLBACK_BUDGET_CATEGORY, budgetCategoryOptions, validateCategoryName, validateCents, validateExpenseAmounts, summariseBudget } from './feature4.js'
import { fetchForecastData, forecastAreas, eventForecast } from './feature4Weather.js'

// Who is "logged in" for the demo. In Supabase mode this comes from the login session instead.
// Alex (u1) is the participant and the Demo Club (org1) is the organiser, so one person can
// click through both sides without switching accounts.
const CURRENT_USER_ID = 'u1'
const CURRENT_ORGANISER_ID = 'org1'

// ---------------------------------------------------------------------------
// Placeholder "database" kept in localStorage
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'bookedz-feature2-demo'

function emptyOperations() {
  return { version: 1, tasks: [], announcements: [], budgets: {}, forecastAreas: {} }
}

function loadDb() {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    const db = JSON.parse(saved)
    if (!db.feature4) {
      db.feature4 = emptyOperations()
      saveDb(db)
    }
    return db
  }

  const fresh = createSeedData()
  fresh.feature4 = emptyOperations()
  saveDb(fresh)
  return fresh
}

function saveDb(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
}

export function resetDemoData() {
  localStorage.removeItem(STORAGE_KEY)
}

// Pretend the server takes a moment, so the loading spinners are visible in the demo
function fakeDelay() {
  return new Promise((resolve) => setTimeout(resolve, 250))
}

function newId(prefix) {
  return prefix + Date.now() + Math.floor(Math.random() * 1000)
}

function findEvent(db, eventId) {
  const event = db.events.find((e) => e.id === eventId)
  if (!event) throw new Error('Event not found')
  return event
}

function findUser(db, userId) {
  const user = db.users.find((u) => u.id === userId)
  if (!user) throw new Error('User not found')
  return user
}

function findRsvp(db, rsvpId) {
  const rsvp = db.rsvps.find((r) => r.id === rsvpId)
  if (!rsvp) throw new Error('RSVP not found')
  return rsvp
}

// ---------------------------------------------------------------------------
// Rules for spots, the waitlist and offers
// ---------------------------------------------------------------------------

// A spot is "taken" by someone confirmed OR someone who has been offered it (they have 24h)
function spotsTaken(db, eventId) {
  const held = db.rsvps.filter(
    (r) => r.eventId === eventId && (r.status === 'confirmed' || r.status === 'offered'),
  ).length
  // A hangout's capacity includes its host, who holds a place without an RSVP
  return held + (db.events.find((e) => e.id === eventId)?.kind === 'hangout' ? 1 : 0)
}

// Adds live numbers to an event: how many confirmed, waiting, spots left, etc.
function withCounts(db, event) {
  const rsvps = db.rsvps.filter((r) => r.eventId === event.id)
  const count = (status) => rsvps.filter((r) => r.status === status).length
  return {
    ...event,
    isOnTeam: event.organiserId === CURRENT_USER_ID || (db.eventMembers || []).some(member => member.eventId === event.id && member.userId === CURRENT_USER_ID),
    isMine: event.organiserId === CURRENT_ORGANISER_ID, // can the logged-in person manage it?
    confirmedCount: count('confirmed'),
    offeredCount: count('offered'),
    pendingCount: count('pending'),
    waitlistCount: count('waitlisted'),
    spotsLeft: Math.max(0, event.capacity - spotsTaken(db, event.id)),
  }
}

function isMember(db, organiserId, userId) {
  return db.members.some((m) => m.organiserId === organiserId && m.userId === userId)
}

function scoreFor(db, rsvp) {
  const event = findEvent(db, rsvp.eventId)
  const user = findUser(db, rsvp.userId)
  return calculateWaitlistScore({
    isMember: isMember(db, event.organiserId, user.id),
    userInterests: user.interests,
    eventTags: event.tags,
    history: db.attendanceHistory.filter((h) => h.userId === user.id),
  })
}

// Everyone waiting for this event, best score first.
// If two people have the same score, whoever RSVP'd earlier goes first.
function rankedWaitlist(db, eventId) {
  return db.rsvps
    .filter((r) => r.eventId === eventId && r.status === 'waitlisted')
    .map((r) => ({ rsvp: r, score: scoreFor(db, r).total }))
    .sort((a, b) => b.score - a.score || new Date(a.rsvp.createdAt) - new Date(b.rsvp.createdAt))
    .map((item) => item.rsvp)
}

// Waitlist promotion: while there are free spots, offer one to the top-ranked person.
// They get OFFER_HOURS to confirm before it passes to the next person.
function fillFreeSpots(db, eventId) {
  const event = findEvent(db, eventId)
  if (new Date(event.startTime).getTime() <= Date.now()) return
  let freeSpots = event.capacity - spotsTaken(db, eventId)
  const queue = rankedWaitlist(db, eventId)

  while (freeSpots > 0 && queue.length > 0) {
    const next = queue.shift() // take the first person out of the queue
    next.status = 'offered'
    next.offerExpiresAt = new Date(Math.min(Date.now() + OFFER_HOURS * 60 * 60 * 1000, new Date(event.startTime).getTime())).toISOString()
    freeSpots--
  }
}

// Offer expiry: any offer past its deadline expires, and the spot goes to the next person.
// In the real app a scheduled job runs this (Timothy sets up the scheduler).
// Here we run it every time data is read, which has the same effect for the demo.
function expireOldOffers(db) {
  const now = new Date()
  const eventsToRefill = []

  for (const rsvp of db.rsvps) {
    if (rsvp.status === 'offered' && new Date(rsvp.offerExpiresAt) <= now) {
      rsvp.status = 'expired'
      if (!eventsToRefill.includes(rsvp.eventId)) eventsToRefill.push(rsvp.eventId)
    }
  }

  for (const eventId of eventsToRefill) fillFreeSpots(db, eventId)
}

// Every read goes through this so expired offers are always cleaned up first
function loadFreshDb() {
  const db = loadDb()
  expireOldOffers(db)
  saveDb(db)
  return db
}

// ---------------------------------------------------------------------------
// Sign-in (pretend): in mock mode Alex is always logged in
// ---------------------------------------------------------------------------

export async function getCurrentUser() {
  const db = loadDb()
  const user = findUser(db, CURRENT_USER_ID)
  return { id: user.id, email: user.email }
}

export async function signIn() {
  throw new Error('Sign-in needs Supabase. Add your keys to client/.env (see .env.example).')
}

export async function signUp() {
  throw new Error('Sign-up needs Supabase. Add your keys to client/.env (see .env.example).')
}

export async function signOut() {}

// Nothing ever changes who is logged in, so there is nothing to listen for
export function onAuthChange() {
  return () => {}
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export async function getEvents() {
  await fakeDelay()
  const db = loadFreshDb()
  return db.events
    .filter((e) => e.status !== 'draft') // unpublished events are hidden from the public list
    .map((e) => withCounts(db, e))
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
}

export async function getEvent(eventId) {
  await fakeDelay()
  const db = loadFreshDb()
  return withCounts(db, findEvent(db, eventId))
}

export async function setEventPublished(eventId, published) {
  await fakeDelay()
  const db = loadFreshDb()
  const event = findEvent(db, eventId)
  if (event.organiserId !== CURRENT_ORGANISER_ID) throw new Error('You can only publish or unpublish events you organise.')
  if (event.status && !['draft', 'published'].includes(event.status)) throw new Error(`A ${event.status} event can't be published or unpublished.`)
  event.status = published ? 'published' : 'draft'
  saveDb(db)
  return withCounts(db, event)
}

export async function deleteEvent(eventId) {
  await fakeDelay()
  const db = loadFreshDb()
  const event = findEvent(db, eventId)
  if (event.organiserId !== CURRENT_ORGANISER_ID) throw new Error('You can only delete events you organise.')
  db.events = db.events.filter((e) => e.id !== eventId)
  db.rsvps = db.rsvps.filter((r) => r.eventId !== eventId) // its RSVPs go too
  db.feature4.tasks = db.feature4.tasks.filter((task) => task.eventId !== eventId)
  db.feature4.announcements = db.feature4.announcements.filter((post) => post.eventId !== eventId)
  delete db.feature4.budgets[eventId]
  if (db.feature4.budgetCategories) delete db.feature4.budgetCategories[eventId]
  delete db.feature4.forecastAreas[eventId]
  saveDb(db)
}


// A private hangout's invite preview, found by its random token (no joining happens here).
export async function getHangoutInvite(token) {
  await fakeDelay()
  const db = loadFreshDb()
  const event = db.events.find((e) => e.kind === 'hangout' && token && e.hangout?.inviteToken === token)
  if (!event) throw new Error('This invite link isn’t valid any more. Ask the host for a new one.')
  return withCounts(db, event)
}

// ---------------------------------------------------------------------------
// Hangout time: availability, ranked slots and locking (group hangouts)
// Raw free times go only to their owner; the group sees aggregate counts.
// ---------------------------------------------------------------------------

function hangoutEvent(db, eventId) {
  const event = findEvent(db, eventId)
  if (event.kind !== 'hangout') throw new Error('This isn’t a hangout.')
  return event
}
// Demo has one browser identity: it acts as the host on its own hangouts.
const hangoutActor = (event) => (event.organiserId === CURRENT_ORGANISER_ID ? event.organiserId : CURRENT_USER_ID)
function hangoutMembers(db, event) {
  const ids = [...new Set([event.organiserId, ...db.rsvps.filter((r) => r.eventId === event.id && r.status === 'confirmed').map((r) => r.userId)])]
  const availability = db.hangoutAvailability || []
  return ids.map((id) => {
    const saved = availability.find((a) => a.eventId === event.id && a.userId === id)
    return {
      id,
      name: db.users.find((u) => u.id === id)?.name || 'Member',
      role: id === event.organiserId ? 'host' : 'member',
      required: id === event.organiserId || Boolean(event.hangout.required?.[id]),
      responded: Boolean(saved),
      intervals: saved?.intervals || [],
    }
  })
}
function requireMember(db, event) {
  const actor = hangoutActor(event)
  const members = hangoutMembers(db, event)
  if (!members.some((m) => m.id === actor)) throw new Error('Join this hangout to see and share times.')
  return { actor, members, isHost: actor === event.organiserId }
}
const publicMember = ({ intervals, ...member }) => member
const publicPeople = (result) => ({ ...result, available: result.available.map(publicMember), cannot: result.cannot.map(publicMember), noReply: result.noReply.map(publicMember) })

export async function getHangoutTime(eventId, options = {}) {
  await fakeDelay()
  const db = loadFreshDb()
  const event = hangoutEvent(db, eventId)
  if (!event.hangout.dateRange) throw new Error('This hangout already has a fixed time.')
  const { actor, members, isHost } = requireMember(db, event)
  const me = members.find((m) => m.id === actor)
  const ranking = rankSlots(members, event.hangout.dateRange, options.minMinutes ? { minMinutes: options.minMinutes } : {})
  return {
    isHost,
    me: publicMember(me),
    myIntervals: me.intervals,
    members: members.map(publicMember),
    heatmap: heatmap(members, event.hangout.dateRange),
    options: ranking.options.map(publicPeople),
    pendingRequired: ranking.pendingRequired.map(publicMember),
    rescue: isHost ? rescueSuggestions(members, event.hangout.dateRange, event.organiserId) : [],
    dateRange: event.hangout.dateRange,
    lockedSlot: event.hangout.lockedSlot,
    stage: event.hangout.stage,
  }
}

export async function saveHangoutAvailability(eventId, intervals) {
  await fakeDelay()
  const db = loadFreshDb()
  const event = hangoutEvent(db, eventId)
  if (event.hangout.stage !== 'collecting') throw new Error('The time is locked, so free times can’t change. Ask the host to unlock it.')
  const { actor } = requireMember(db, event)
  if (!Array.isArray(intervals) || intervals.some((i) => !Number.isFinite(i?.start) || !Number.isFinite(i?.end) || i.end <= i.start)) throw new Error('Those free times aren’t valid.')
  const clean = normaliseIntervals(intervals, rangeBounds(event.hangout.dateRange))
  db.hangoutAvailability = (db.hangoutAvailability || []).filter((a) => !(a.eventId === eventId && a.userId === actor))
  db.hangoutAvailability.push({ eventId, userId: actor, intervals: clean, respondedAt: new Date().toISOString() })
  saveDb(db)
  return clean
}

export async function clearHangoutAvailability(eventId) {
  await fakeDelay()
  const db = loadFreshDb()
  const event = hangoutEvent(db, eventId)
  if (event.hangout.stage !== 'collecting') throw new Error('The time is locked, so free times can’t change.')
  const { actor } = requireMember(db, event)
  db.hangoutAvailability = (db.hangoutAvailability || []).filter((a) => !(a.eventId === eventId && a.userId === actor))
  saveDb(db)
}

function hostHangout(db, eventId) {
  const event = hangoutEvent(db, eventId)
  if (hangoutActor(event) !== event.organiserId) throw new Error('Only the host can do that.')
  return event
}

export async function setHangoutRequired(eventId, userId, required) {
  await fakeDelay()
  const db = loadFreshDb()
  const event = hostHangout(db, eventId)
  if (userId === event.organiserId) throw new Error('The host is always required.')
  if (!hangoutMembers(db, event).some((m) => m.id === userId)) throw new Error('That person isn’t in this hangout.')
  event.hangout.required = { ...(event.hangout.required || {}), [userId]: Boolean(required) }
  saveDb(db)
}

export async function previewHangoutSlot(eventId, slot) {
  await fakeDelay()
  const db = loadFreshDb()
  const event = hangoutEvent(db, eventId)
  const { members } = requireMember(db, event)
  return publicPeople(previewSlot(members, event.hangout.dateRange, slot))
}

export async function lockHangoutSlot(eventId, slot) {
  await fakeDelay()
  const db = loadFreshDb()
  const event = hostHangout(db, eventId)
  if (event.hangout.stage !== 'collecting') throw new Error('A time is already locked.')
  // Revalidated here, not just in the browser.
  const preview = previewSlot(hangoutMembers(db, event), event.hangout.dateRange, slot)
  if (!preview.ok) throw new Error(preview.blockers.join(' '))
  const startTime = new Date(slot.start).toISOString()
  const endTime = new Date(slot.end).toISOString()
  event.hangout = { ...event.hangout, lockedSlot: { startTime, endTime }, stage: 'voting' }
  event.startTime = startTime
  event.endTime = endTime
  saveDb(db)
  return withCounts(db, event)
}

export async function unlockHangoutSlot(eventId) {
  await fakeDelay()
  const db = loadFreshDb()
  const event = hostHangout(db, eventId)
  if (!event.hangout.dateRange || !event.hangout.lockedSlot) throw new Error('There’s no locked time to release.')
  const { start, end } = rangeBounds(event.hangout.dateRange)
  event.hangout = { ...event.hangout, lockedSlot: null, stage: 'collecting' }
  event.startTime = new Date(start).toISOString()
  event.endTime = new Date(end - 60000).toISOString()
  saveDb(db)
  return withCounts(db, event)
}

// ---------------------------------------------------------------------------
// Hangout plan: itinerary from real Official events plus host-entered places,
// versioned Keep/Swap votes and explicit host confirmation (never a booking).
// ---------------------------------------------------------------------------

function planContext(db, event) {
  const locked = event.hangout.lockedSlot
  if (!locked) throw new Error('Lock a time first; the plan is built inside it.')
  const plan = event.hangout.plan || { stops: [], places: [] }
  const members = hangoutMembers(db, event).map((m) => ({ ...m, weights: memberWeights(db.users.find((u) => u.id === m.id)?.interests, event.tags) }))
  const events = db.events.filter((e) => e.kind !== 'hangout').map((e) => eventListing(withCounts(db, e)))
  const places = plan.places.map(placeListing)
  const byRef = new Map([...events, ...places].map((l) => [l.id, l]))
  return {
    plan, members, events, byRef,
    input: { slot: { start: Date.parse(locked.startTime), end: Date.parse(locked.endTime) }, origin: event.venue, members },
  }
}
function planView(db, event, actor) {
  const ctx = planContext(db, event)
  const votes = (db.hangoutVotes || []).filter((v) => v.eventId === event.id)
  return buildPlanView({
    stage: event.hangout.stage, plan: ctx.plan, events: ctx.events, places: ctx.plan.places.map(placeListing), input: ctx.input, memberCount: ctx.members.length,
    voteCounts: (stop) => {
      const current = votes.filter((v) => v.stopId === stop.id && v.version === stop.version)
      return { keep: current.filter((v) => v.value === 1).length, swap: current.filter((v) => v.value === -1).length, mine: current.find((v) => v.userId === actor)?.value || 0 }
    },
  })
}

function planAccess(db, eventId, { host = false } = {}) {
  const event = hangoutEvent(db, eventId)
  const access = requireMember(db, event)
  if (host && !access.isHost) throw new Error('Only the host can change the plan.')
  if (['ended', 'cancelled'].includes(event.hangout.stage)) throw new Error('This hangout has ended.')
  return { event, ...access }
}

// Save a new order. Stops keep their id; a stop whose position changes gets a new
// version, which makes earlier Keep/Swap votes on it stale. A final plan reopens to voting.
function saveStops(event, refs, method) {
  const plan = event.hangout.plan || { stops: [], places: [] }
  const old = plan.stops
  const stops = refs.map((ref, index) => {
    const previous = old.find((s) => s.ref === ref)
    if (!previous) return { id: newId('s'), ref, version: 1 }
    return old.indexOf(previous) === index ? previous : { ...previous, version: previous.version + 1 }
  })
  const changed = stops.length !== old.length || stops.some((s, i) => s !== old[i])
  const now = new Date().toISOString()
  event.hangout.plan = { ...plan, stops, method: method || plan.method || 'manual', createdAt: plan.createdAt || now, changedAt: changed ? now : plan.changedAt, finalizedAt: changed ? null : plan.finalizedAt }
  if (changed && event.hangout.stage === 'final') event.hangout.stage = 'voting'
}

export async function getHangoutPlan(eventId) {
  await fakeDelay()
  const db = loadFreshDb()
  const { event, actor, isHost } = planAccess(db, eventId)
  return { isHost, ...planView(db, event, actor) }
}

export async function generateHangoutPlan(eventId, options = {}) {
  await fakeDelay()
  const db = loadFreshDb()
  const { event, actor } = planAccess(db, eventId, { host: true })
  const ctx = planContext(db, event)
  const outcome = generatePlan(ctx.events, ctx.input, options)
  if (!outcome.ok) return { ok: false, reason: outcome.reason, suggestions: outcome.suggestions }
  const keepPlaces = ctx.plan.stops.filter((s) => s.ref.startsWith('place:')).map((s) => s.ref)
  saveStops(event, [...outcome.listings.map((l) => l.id), ...keepPlaces].slice(0, MAX_STOPS), 'beam')
  // A chosen relaxation stays with the plan so later edits are timed the same way.
  event.hangout.plan.options = { flexibleStart: Boolean(options.flexibleStart) }
  saveDb(db)
  return { ok: true, plan: planView(db, event, actor) }
}

export async function previewHangoutStops(eventId, refs) {
  await fakeDelay()
  const db = loadFreshDb()
  const { event } = planAccess(db, eventId, { host: true })
  const ctx = planContext(db, event)
  const result = retime(resolveRefs(ctx.byRef, refs), ctx.input, ctx.plan.options)
  return { issues: result.issues, times: result.stops.map((s) => ({ start: s.start, end: s.end })), travelMinutes: result.travelMinutes }
}

export async function setHangoutStops(eventId, refs) {
  await fakeDelay()
  const db = loadFreshDb()
  const { event, actor } = planAccess(db, eventId, { host: true })
  const ctx = planContext(db, event)
  if (!Array.isArray(refs) || refs.length > MAX_STOPS || new Set(refs).size !== refs.length) throw new Error(`A plan has up to ${MAX_STOPS} different stops.`)
  if (refs.some((ref) => !ctx.byRef.has(ref))) throw new Error('One of those stops isn’t available any more. Refresh and try again.')
  saveStops(event, refs)
  saveDb(db)
  return planView(db, event, actor)
}

export async function addHangoutPlace(eventId, place) {
  await fakeDelay()
  const db = loadFreshDb()
  const { event, actor } = planAccess(db, eventId, { host: true })
  planContext(db, event)
  const name = String(place?.name || '').trim()
  const minutes = Number(place?.minutes)
  if (!name || name.length > 80) throw new Error('Give the place a name (up to 80 characters).')
  if (!Number.isFinite(place?.lat) || !Number.isFinite(place?.lng)) throw new Error('Choose the place from the OneMap suggestions so it has a map location.')
  if (!Number.isInteger(minutes) || minutes < 15 || minutes > 360) throw new Error('Choose a stay between 15 minutes and 6 hours.')
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/
  const hours = place.hours?.open && place.hours?.close ? place.hours : null
  if (hours && (!hhmm.test(hours.open) || !hhmm.test(hours.close) || hours.close <= hours.open)) throw new Error('Opening hours need a closing time after the opening time.')
  const plan = event.hangout.plan || { stops: [], places: [] }
  if (plan.stops.length >= MAX_STOPS) throw new Error(`A plan has up to ${MAX_STOPS} stops.`)
  const saved = { id: newId('p'), name, address: String(place.address || '').slice(0, 200), lat: place.lat, lng: place.lng, minutes, kind: place.kind === 'meal' ? 'meal' : 'activity', hours }
  event.hangout.plan = { ...plan, places: [...plan.places, saved] }
  saveStops(event, [...plan.stops.map((s) => s.ref), `place:${saved.id}`])
  saveDb(db)
  return planView(db, event, actor)
}

export async function getHangoutAlternatives(eventId, stopId) {
  await fakeDelay()
  const db = loadFreshDb()
  const { event } = planAccess(db, eventId, { host: true })
  const ctx = planContext(db, event)
  const index = ctx.plan.stops.findIndex((s) => s.id === stopId)
  if (index < 0) throw new Error('That stop isn’t in the plan any more.')
  const sequence = resolveRefs(ctx.byRef, ctx.plan.stops.map((s) => s.ref))
  return swapAlternatives(ctx.events, index, sequence, ctx.input, ctx.plan.options)
    .map((a) => ({ ref: a.listing.id, title: a.listing.title, venueName: a.listing.venueName, start: a.listing.fixed?.start, end: a.listing.fixed?.end, reasons: a.reasons, better: a.better }))
}

export async function voteHangoutStop(eventId, stopId, value) {
  await fakeDelay()
  const db = loadFreshDb()
  const { event, actor } = planAccess(db, eventId)
  if (event.hangout.stage !== 'voting') throw new Error('Voting is closed right now.')
  if (![1, 0, -1].includes(value)) throw new Error('Vote Keep, Swap or clear.')
  const stop = (event.hangout.plan?.stops || []).find((s) => s.id === stopId)
  if (!stop) throw new Error('That stop isn’t in the plan any more.')
  db.hangoutVotes = (db.hangoutVotes || []).filter((v) => !(v.eventId === eventId && v.stopId === stopId && v.userId === actor))
  if (value) db.hangoutVotes.push({ eventId, stopId, userId: actor, version: stop.version, value, at: new Date().toISOString() })
  saveDb(db)
  return planView(db, event, actor)
}

export async function finalizeHangoutPlan(eventId, { acceptSoft = false } = {}) {
  await fakeDelay()
  const db = loadFreshDb()
  const { event, actor } = planAccess(db, eventId, { host: true })
  const view = planView(db, event, actor)
  if (!view.stops.length) throw new Error('Add at least one stop before confirming.')
  const all = [...view.planIssues, ...view.stops.flatMap((s) => s.issues)]
  const blocking = all.filter((i) => i.blocking)
  if (blocking.length) throw new Error(`Fix these first: ${blocking.map((i) => i.message).join(' ')}`)
  if (all.length && !acceptSoft) throw new Error('Accept the remaining concerns to confirm.')
  const now = new Date().toISOString()
  event.hangout.plan = { ...event.hangout.plan, finalizedAt: now, everFinal: true, timings: view.stops.map((s) => ({ stopId: s.id, start: s.start, end: s.end })) }
  event.hangout.stage = 'final'
  saveDb(db)
  return planView(db, event, actor)
}

// On the day: the host's exact meeting point, shown to members with the plan.
export async function setHangoutMeetingPoint(eventId, text) {
  await fakeDelay()
  const db = loadFreshDb()
  const { event } = planAccess(db, eventId, { host: true })
  const value = String(text || '').trim()
  if (value.length > 120) throw new Error('Keep the meeting point to 120 characters or fewer.')
  event.hangout.meetingPoint = value
  saveDb(db)
  return value
}

export async function reopenHangoutPlan(eventId) {
  await fakeDelay()
  const db = loadFreshDb()
  const { event, actor } = planAccess(db, eventId, { host: true })
  if (event.hangout.stage !== 'final') throw new Error('The plan isn’t confirmed.')
  event.hangout.stage = 'voting'
  event.hangout.plan = { ...event.hangout.plan, finalizedAt: null, changedAt: new Date().toISOString() }
  saveDb(db)
  return planView(db, event, actor)
}

// Joining a hangout. The demo has no invite enforcement; live checks the token.
export async function joinHangout({ eventId }) {
  const user = await getUser()
  return createRsvp({ eventId, name: user.name, email: user.email, answers: {} })
}

// Events the logged-in organiser runs
export async function getOrganiserEvents() {
  await fakeDelay()
  const db = loadFreshDb()
  return db.events
    .filter((e) => e.organiserId === CURRENT_ORGANISER_ID)
    .map((e) => withCounts(db, e))
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
}

export async function createEvent(eventData) {
  await fakeDelay()
  const db = loadFreshDb()
  const event = {
    ...eventData,
    id: newId('e'),
    organiserId: CURRENT_ORGANISER_ID,
    status: 'published',
    createdAt: new Date().toISOString(),
  }
  db.events.push(event)
  saveDb(db)
  return event
}

// The organiser edits a published event (Create Event in edit mode).
// Same rules as supabaseApi.updateEvent; raising capacity offers the new places to the waitlist.
export async function updateEvent(eventId, changes) {
  await fakeDelay()
  const db = loadFreshDb()
  const event = findEvent(db, eventId)
  if (event.organiserId !== CURRENT_ORGANISER_ID) throw new Error('You can only edit events you organise.')
  if (new Date(event.startTime).getTime() <= Date.now()) {
    throw new Error('This event has already started, so it can no longer be edited.')
  }
  if (new Date(changes.endTime) <= new Date(changes.startTime)) throw new Error('The end time must be after the start time.')
  if (new Date(changes.startTime).getTime() <= Date.now()) throw new Error('The start time cannot be in the past.')

  const taken = spotsTaken(db, eventId)
  if (changes.capacity != null && changes.capacity < taken) {
    throw new Error(`Capacity can't be lower than ${taken}: that many people are already confirmed or offered a place.`)
  }
  const venueKey = (venue) => JSON.stringify(venue ? [venue.name, venue.address || '', venue.lat ?? null, venue.lng ?? null] : null)
  const venuesChanged = venueKey(event.venue) !== venueKey(changes.venue)
    || Boolean(event.isOutdoor) !== Boolean(changes.isOutdoor)
    || venueKey(event.backupVenue) !== venueKey(changes.backupVenue)
  if (event.usingBackup && venuesChanged) {
    throw new Error('This event has switched to its backup venue, so its venues can no longer be changed.')
  }
  // Removing a question (or changing its answer type) would lose answers people already gave
  if (db.rsvps.some((rsvp) => rsvp.eventId === eventId)) {
    for (const old of event.questions || []) {
      const kept = changes.questions.find((question) => question.id === old.id)
      if (!kept) throw new Error('Questions can’t be removed after people have RSVP’d, because their answers would be lost.')
      if (kept.type !== old.type) throw new Error('A question’s answer type can’t change after people have RSVP’d.')
    }
  }

  const raisedCapacity = changes.capacity != null && changes.capacity > event.capacity
  Object.assign(event, {
    title: changes.title,
    description: changes.description,
    coverImageUrl: changes.coverImageUrl || '',
    tags: [...changes.tags],
    startTime: changes.startTime,
    endTime: changes.endTime,
    capacity: changes.capacity,
    requiresApproval: changes.requiresApproval,
    isOutdoor: changes.isOutdoor,
    venue: changes.venue,
    backupVenue: changes.isOutdoor ? changes.backupVenue : null,
    questions: changes.questions.map(({ id, text, type, required }) => ({ id, text, type, required })),
    updatedAt: new Date().toISOString(),
  })
  if (raisedCapacity) fillFreeSpots(db, eventId) // new places go to the waitlist first, like the database trigger
  saveDb(db)
  return withCounts(db, event)
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

// The logged-in participant's profile: { id, name, email, interests }
export async function getUser() {
  await fakeDelay()
  const db = loadDb()
  return findUser(db, CURRENT_USER_ID)
}

// ---------------------------------------------------------------------------
// RSVPs — participant side
// ---------------------------------------------------------------------------

// The logged-in participant's RSVPs, each with its event attached
export async function getMyRsvps() {
  await fakeDelay()
  const db = loadFreshDb()
  return db.rsvps
    .filter((r) => r.userId === CURRENT_USER_ID)
    .map((r) => ({ ...r, event: withCounts(db, findEvent(db, r.eventId)) }))
    .sort((a, b) => new Date(a.event.startTime) - new Date(b.event.startTime))
}

export async function createRsvp({ eventId, name, email, answers }) {
  await fakeDelay()
  const db = loadFreshDb()
  const event = findEvent(db, eventId)
  const userId = CURRENT_USER_ID
  if (withCounts(db, event).isOnTeam) throw new Error("Organisers and helpers can't RSVP to their own event")

  const alreadyIn = db.rsvps.some(
    (r) => r.eventId === eventId && r.userId === userId && ACTIVE_STATUSES.includes(r.status),
  )
  if (alreadyIn) throw new Error('You already have an RSVP for this event.')

  // Approval → pending. Open joins are confirmed while places last and refused when full;
  // auto-confirm RSVPs fall back to the waitlist.
  const status = joinOutcome(event, spotsTaken(db, eventId))
  if (status === 'full') throw new Error('This event is full, so it isn’t taking new joins.')

  const rsvp = {
    id: newId('r'),
    eventId,
    userId,
    name,
    email,
    answers,
    status,
    createdAt: new Date().toISOString(),
    offerExpiresAt: null,
  }
  db.rsvps.push(rsvp)
  saveDb(db)
  return rsvp
}

export async function cancelRsvp(rsvpId) {
  await fakeDelay()
  const db = loadFreshDb()
  const rsvp = findRsvp(db, rsvpId)
  if (rsvp.userId !== CURRENT_USER_ID) throw new Error('You can only cancel your own RSVP.')
  if (rsvp.checkedInAt || (db.checkIns || []).some(row => row.registrationId === rsvp.id)) throw new Error("You have already checked in, so this RSVP can't be cancelled")
  if (!ACTIVE_STATUSES.includes(rsvp.status)) throw new Error('This RSVP is already closed.')

  const wasHoldingSpot = rsvp.status === 'confirmed' || rsvp.status === 'offered'
  rsvp.status = 'cancelled'
  rsvp.offerExpiresAt = null
  // TODO: if this is close to the event start, record a late cancellation in attendanceHistory

  if (wasHoldingSpot) fillFreeSpots(db, rsvp.eventId) // a spot opened up → offer it to the waitlist
  saveDb(db)
  return rsvp
}

// accept = true → take the spot; accept = false → pass it to the next person
export async function respondToOffer(rsvpId, accept) {
  await fakeDelay()
  const db = loadFreshDb() // expires old offers first, so a late "yes" is refused
  const rsvp = findRsvp(db, rsvpId)
  if (rsvp.status !== 'offered') throw new Error('This offer has expired or was already answered.')

  rsvp.offerExpiresAt = null
  if (accept) {
    rsvp.status = 'confirmed'
  } else {
    rsvp.status = 'declined'
    fillFreeSpots(db, rsvp.eventId)
  }
  saveDb(db)
  return rsvp
}

// ---------------------------------------------------------------------------
// RSVPs — organiser side
// ---------------------------------------------------------------------------

// Every RSVP for one event, with the person's details, member flag, score and waitlist rank
export async function getRsvpsForEvent(eventId) {
  await fakeDelay()
  const db = loadFreshDb()
  const event = findEvent(db, eventId)
  const ranked = rankedWaitlist(db, eventId)

  return db.rsvps
    .filter((r) => r.eventId === eventId)
    .map((r) => {
      const user = findUser(db, r.userId)
      return {
        ...r,
        user: { id: user.id, name: r.name || user.name, email: r.email || user.email },
        isMember: isMember(db, event.organiserId, r.userId),
        score: scoreFor(db, r),
        rank: r.status === 'waitlisted' ? ranked.indexOf(r) + 1 : null,
      }
    })
}

export async function approveRsvp(rsvpId) {
  await fakeDelay()
  const db = loadFreshDb()
  const rsvp = findRsvp(db, rsvpId)
  if (rsvp.status !== 'pending') throw new Error('Only pending RSVPs can be approved.')

  const event = findEvent(db, rsvp.eventId)
  rsvp.status = spotsTaken(db, event.id) < event.capacity ? 'confirmed' : 'waitlisted'
  saveDb(db)
  return rsvp
}

export async function rejectRsvp(rsvpId) {
  await fakeDelay()
  const db = loadFreshDb()
  const rsvp = findRsvp(db, rsvpId)
  if (rsvp.status !== 'pending') throw new Error('Only pending RSVPs can be rejected.')

  rsvp.status = 'rejected'
  saveDb(db)
  return rsvp
}

// Organiser takes someone off the event after accepting them (or off the waitlist / an offer).
// Status 'rejected', not 'cancelled': cancelling counts as a late cancel against the person,
// but here it was the organiser's decision, so their show-up rate shouldn't suffer.
export async function removeRsvp(rsvpId) {
  await fakeDelay()
  const db = loadFreshDb()
  const rsvp = findRsvp(db, rsvpId)
  if (findEvent(db, rsvp.eventId).organiserId !== CURRENT_ORGANISER_ID) {
    throw new Error('You can only remove attendees from your own event.')
  }
  if (!['confirmed', 'offered', 'waitlisted'].includes(rsvp.status)) {
    throw new Error('Only confirmed, offered or waitlisted RSVPs can be removed.')
  }

  const wasHoldingSpot = rsvp.status === 'confirmed' || rsvp.status === 'offered'
  rsvp.status = 'rejected'
  rsvp.offerExpiresAt = null

  if (wasHoldingSpot) fillFreeSpots(db, rsvp.eventId) // the freed spot goes to the waitlist
  saveDb(db)
  return rsvp
}

export async function setMember(organiserId, userId, makeMember) {
  await fakeDelay()
  const db = loadDb()
  db.members = db.members.filter((m) => !(m.organiserId === organiserId && m.userId === userId))
  if (makeMember) db.members.push({ organiserId, userId })
  saveDb(db)
}

// DEMO ONLY: pretend 24 hours have passed for this event's offers, to show expiry + promotion
export async function expireOffersNow(eventId) {
  await fakeDelay()
  const db = loadDb()
  for (const rsvp of db.rsvps) {
    if (rsvp.eventId === eventId && rsvp.status === 'offered') {
      rsvp.offerExpiresAt = new Date(Date.now() - 1000).toISOString()
    }
  }
  expireOldOffers(db)
  saveDb(db)
}


// Feature 4 demo operations retained for offline review.
// Feature 4 — DEMO ONLY asynchronous organiser operations.
// Local ownership checks model the intended interface; localStorage is not auth.
// Supabase is intentionally not activated until shared auth/RLS contracts exist.
// ---------------------------------------------------------------------------

/** @typedef {{id:string,eventId:string,title:string,notes:string,status:string,position:number}} Task */
/** @typedef {{id:string,eventId:string,body:string,kind:'manual'|'venue-switch',createdAt:string,updatedAt:string|null}} Announcement */
/** plannedCents/actualCents are line totals (unit cost × quantity). */
/** @typedef {{id:string,eventId:string,name:string,category:string,quantity:number,plannedCents:number,actualCents:number}} BudgetItem */

function ownedEvent(db, eventId) {
  const event = findEvent(db, eventId)
  if (event.organiserId !== CURRENT_ORGANISER_ID) throw new Error('Only the event owner can manage these organiser tools.')
  return event
}

function text(value, label, { optional = false } = {}) {
  if (optional && value == null) return ''
  if (typeof value !== 'string' || (!optional && !value.trim())) throw new Error(`${label} is required.`)
  return value.trim()
}

function operationId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`
}

function eventRecord(records, eventId, id, label) {
  const record = records.find((entry) => entry.eventId === eventId && entry.id === id)
  if (!record) throw new Error(`${label} not found for this event.`)
  return record
}

function orderedTasks(db, eventId) {
  return db.feature4.tasks.filter((task) => task.eventId === eventId).sort((a, b) =>
    TASK_STATUSES.indexOf(a.status) - TASK_STATUSES.indexOf(b.status) || a.position - b.position)
}

function reindexTasks(db, eventId) {
  for (const status of TASK_STATUSES) {
    orderedTasks(db, eventId).filter((task) => task.status === status).forEach((task, index) => { task.position = index })
  }
}

function announcementDto({ id, eventId, body, kind, createdAt, updatedAt }) {
  return { id, eventId, body, kind, createdAt, updatedAt }
}

function publicAnnouncements(db, eventId) {
  return db.feature4.announcements.filter((post) => post.eventId === eventId)
    .map(announcementDto).reverse().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

function eventBudget(db, eventId) {
  return Object.hasOwn(db.feature4.budgets, eventId) ? db.feature4.budgets[eventId] : { limitCents: null, items: [] }
}

// Older saved demo data has no budgetCategories key or expense quantities.
function customCategories(db, eventId) {
  return db.feature4.budgetCategories?.[eventId] ?? []
}

function budgetDto(budget) {
  return { ...budget, items: budget.items.map((item) => ({ ...item, quantity: item.quantity ?? 1 })) }
}

/** Private event workspace: { event, tasks, announcements, budget, budgetCategories, forecastAreaOverride }. */
export async function getEventOperations(eventId) {
  const db = loadDb()
  const event = ownedEvent(db, eventId)
  return {
    event: withCounts(db, event), tasks: orderedTasks(db, eventId), announcements: publicAnnouncements(db, eventId),
    budget: budgetDto(eventBudget(db, eventId)), budgetCategories: [...customCategories(db, eventId)], forecastAreaOverride: db.feature4.forecastAreas[eventId] || null,
  }
}

/** @returns {Promise<Task>} */
export async function createTask(eventId, input) {
  const db = loadDb()
  ownedEvent(db, eventId)
  const task = {
    id: operationId('task'), eventId, title: text(input?.title, 'Task title'), notes: text(input?.notes, 'Notes', { optional: true }),
    status: 'todo', position: orderedTasks(db, eventId).filter((task) => task.status === 'todo').length,
  }
  db.feature4.tasks.push(task)
  saveDb(db)
  return task
}

export async function updateTask(eventId, taskId, input) {
  const db = loadDb()
  ownedEvent(db, eventId)
  const task = eventRecord(db.feature4.tasks, eventId, taskId, 'Task')
  const title = text(input?.title, 'Task title')
  const notes = text(input?.notes, 'Notes', { optional: true })
  Object.assign(task, { title, notes })
  saveDb(db)
  return task
}

export async function deleteTask(eventId, taskId) {
  const db = loadDb()
  ownedEvent(db, eventId)
  const task = eventRecord(db.feature4.tasks, eventId, taskId, 'Task')
  db.feature4.tasks.splice(db.feature4.tasks.indexOf(task), 1)
  reindexTasks(db, eventId)
  saveDb(db)
}

/** Validate and persist every task's status/order together in a single write. */
export async function saveTaskBoard(eventId, columns) {
  const db = loadDb()
  ownedEvent(db, eventId)
  if (!columns || Object.keys(columns).length !== TASK_STATUSES.length || !TASK_STATUSES.every((status) => Array.isArray(columns[status]))) {
    throw new Error('The board must contain exactly the three task columns.')
  }
  const tasks = orderedTasks(db, eventId)
  const ids = TASK_STATUSES.flatMap((status) => columns[status])
  if (ids.length !== tasks.length || new Set(ids).size !== tasks.length || ids.some((id) => !tasks.some((task) => task.id === id))) {
    throw new Error('The board must contain every event task exactly once.')
  }
  for (const status of TASK_STATUSES) {
    columns[status].forEach((id, position) => Object.assign(tasks.find((task) => task.id === id), { status, position }))
  }
  saveDb(db)
  return orderedTasks(db, eventId)
}

/** Public DTOs deliberately exclude all private workspace fields. */
export async function getAnnouncements(eventId) {
  const db = loadDb()
  findEvent(db, eventId)
  return publicAnnouncements(db, eventId)
}

export async function createAnnouncement(eventId, body) {
  const db = loadDb()
  ownedEvent(db, eventId)
  const post = { id: operationId('post'), eventId, body: text(body, 'Announcement content'), kind: 'manual', createdAt: new Date(Date.now()).toISOString(), updatedAt: null }
  db.feature4.announcements.push(post)
  saveDb(db)
  return announcementDto(post)
}

function editableAnnouncement(db, eventId, id) {
  const post = eventRecord(db.feature4.announcements, eventId, id, 'Announcement')
  if (post.kind !== 'manual') throw new Error('Automatic venue-switch history is immutable.')
  return post
}

export async function updateAnnouncement(eventId, id, body) {
  const db = loadDb()
  ownedEvent(db, eventId)
  const post = editableAnnouncement(db, eventId, id)
  post.body = text(body, 'Announcement content')
  post.updatedAt = new Date(Date.now()).toISOString()
  saveDb(db)
  return announcementDto(post)
}

export async function deleteAnnouncement(eventId, id) {
  const db = loadDb()
  ownedEvent(db, eventId)
  const post = editableAnnouncement(db, eventId, id)
  db.feature4.announcements.splice(db.feature4.announcements.indexOf(post), 1)
  saveDb(db)
}

export async function saveBudgetLimit(eventId, limitCents) {
  const db = loadDb()
  ownedEvent(db, eventId)
  if (limitCents !== null) validateCents(limitCents, { positive: true })
  const budget = eventBudget(db, eventId)
  budget.limitCents = limitCents
  db.feature4.budgets[eventId] = budget
  saveDb(db)
  return budget
}

/** @returns {Promise<BudgetItem>} */
export async function saveBudgetItem(eventId, input) {
  const db = loadDb()
  ownedEvent(db, eventId)
  const budget = eventBudget(db, eventId)
  const existing = input?.id ? eventRecord(budget.items, eventId, input.id, 'Budget item') : null
  const item = {
    id: existing?.id || operationId('expense'), eventId, name: text(input?.name, 'Item name'),
    category: input?.category, quantity: input?.quantity ?? 1, plannedCents: validateCents(input?.plannedCents), actualCents: validateCents(input?.actualCents),
  }
  validateExpenseAmounts(item)
  if (!budgetCategoryOptions(customCategories(db, eventId)).includes(item.category)) throw new Error('Choose a valid budget category.')
  const items = [...budget.items.filter((entry) => entry.id !== item.id), item]
  // Reject totals that cannot be represented as exact integer cents.
  summariseBudget({ ...budget, items })
  budget.items = existing ? budget.items.map((entry) => entry.id === item.id ? item : entry) : items
  db.feature4.budgets[eventId] = budget
  saveDb(db)
  return item
}

export async function deleteBudgetItem(eventId, id) {
  const db = loadDb()
  ownedEvent(db, eventId)
  const budget = eventBudget(db, eventId)
  const item = eventRecord(budget.items, eventId, id, 'Budget item')
  budget.items.splice(budget.items.indexOf(item), 1)
  db.feature4.budgets[eventId] = budget
  saveDb(db)
}

/** @returns {Promise<string[]>} the event's custom categories after adding one. */
export async function createBudgetCategory(eventId, name) {
  const db = loadDb()
  ownedEvent(db, eventId)
  const categories = [...customCategories(db, eventId), validateCategoryName(name, customCategories(db, eventId))]
  db.feature4.budgetCategories = { ...db.feature4.budgetCategories, [eventId]: categories }
  saveDb(db)
  return [...categories]
}

/** Remove a custom category and move its expenses to the fallback category in the same write. */
export async function deleteBudgetCategory(eventId, name) {
  const db = loadDb()
  ownedEvent(db, eventId)
  const existing = customCategories(db, eventId)
  if (!existing.includes(name)) throw new Error('Only custom categories can be deleted.')
  const categories = existing.filter((entry) => entry !== name)
  const budget = eventBudget(db, eventId)
  budget.items = budget.items.map((item) => item.category === name ? { ...item, category: FALLBACK_BUDGET_CATEGORY } : item)
  db.feature4.budgets[eventId] = budget
  db.feature4.budgetCategories = { ...db.feature4.budgetCategories, [eventId]: categories }
  saveDb(db)
  return { categories: [...categories], items: budgetDto(budget).items }
}

export async function getForecastAreas() {
  const areas = forecastAreas(await fetchForecastData())
  if (!areas.length) throw new Error('Weather forecast areas are unavailable. Refresh to retry.')
  return areas
}

/** One guarded weather response snapshot for the organiser weather view. */
export async function getEventWeather(eventId) {
  ownedEvent(loadDb(), eventId)
  const data = await fetchForecastData()
  const db = loadDb()
  const event = ownedEvent(db, eventId)
  const areas = forecastAreas(data)
  return {
    forecast: eventForecast(data, event, db.feature4.forecastAreas[eventId] || null),
    areas,
  }
}

export async function setForecastArea(eventId, name) {
  ownedEvent(loadDb(), eventId)
  const areas = await getForecastAreas()
  if (!areas.some((area) => area.name === name)) throw new Error('Choose an available forecast area.')
  // Reload after HTTP to preserve any operations saved while it was in flight.
  const db = loadDb()
  ownedEvent(db, eventId)
  db.feature4.forecastAreas[eventId] = name
  saveDb(db)
  return name
}

export async function getEventForecast(eventId) {
  ownedEvent(loadDb(), eventId)
  const data = await fetchForecastData()
  const db = loadDb()
  return eventForecast(data, ownedEvent(db, eventId), db.feature4.forecastAreas[eventId] || null)
}

function persistedSwitch(db, event) {
  if (!event.usingBackup) return null
  const post = db.feature4.announcements.find((entry) => entry.eventId === event.id
    && entry.kind === 'venue-switch' && entry.id === event.venueSwitchAnnouncementId)
  if (!post) throw new Error('The backup venue is active, but its announcement could not be reconciled. Refresh the event.')
  return { event: withCounts(db, event), announcement: announcementDto(post) }
}

/** One-way demo transaction: effective venue + exactly one automatic public post. */
export async function confirmBackupVenueSwitch(eventId) {
  const before = loadDb()
  const previous = persistedSwitch(before, ownedEvent(before, eventId))
  // Repeated requests reconcile persisted success even if weather is now offline.
  if (previous) return previous
  const data = await fetchForecastData()
  // Nothing asynchronous may occur between this reload and the single save below.
  const db = loadDb()
  const event = ownedEvent(db, eventId)
  const concurrent = persistedSwitch(db, event)
  if (concurrent) return concurrent
  const forecast = eventForecast(data, event, db.feature4.forecastAreas[eventId] || null)
  if (!forecast.canSwitch) throw new Error(forecast.reason)
  const at = new Date(Date.now()).toISOString()
  const originalVenue = { ...event.venue }
  const post = {
    id: operationId('venue-switch'), eventId, kind: 'venue-switch', createdAt: at, updatedAt: null,
    body: `Venue changed from ${originalVenue.name} to ${event.backupVenue.name}, ${event.backupVenue.address}. Confirmed at ${at} because ${forecast.forecast} is forecast for ${forecast.area}.`,
  }
  Object.assign(event, {
    originalVenue, venue: { ...event.backupVenue }, usingBackup: true,
    venueSwitchedAt: at, venueSwitchAnnouncementId: post.id,
  })
  db.feature4.announcements.push(post)
  saveDb(db)
  return { event: withCounts(db, event), announcement: announcementDto(post) }
}
