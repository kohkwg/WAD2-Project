// MOCK BACKEND: every function works on placeholder data saved in localStorage,
// so the pages can be clicked through with no database at all.
//
// supabaseApi.js has the SAME functions returning the SAME shapes, backed by the real
// database. api.js picks one of the two — pages never import this file directly.
// If you change what a function returns here, change supabaseApi.js to match.

import { createSeedData } from './mockData.js'
import { calculateWaitlistScore } from './waitlistScore.js'
import { OFFER_HOURS, ACTIVE_STATUSES } from './helpers.js'

// Who is "logged in" for the demo. In Supabase mode this comes from the login session instead.
// Alex (u1) is the participant and the Demo Club (org1) is the organiser, so one person can
// click through both sides without switching accounts.
const CURRENT_USER_ID = 'u1'
const CURRENT_ORGANISER_ID = 'org1'

// ---------------------------------------------------------------------------
// Placeholder "database" kept in localStorage
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'bookedz-feature2-demo'

function loadDb() {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) return JSON.parse(saved)

  const fresh = createSeedData()
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
  return db.rsvps.filter(
    (r) => r.eventId === eventId && (r.status === 'confirmed' || r.status === 'offered'),
  ).length
}

// Adds live numbers to an event: how many confirmed, waiting, spots left, etc.
function withCounts(db, event) {
  const rsvps = db.rsvps.filter((r) => r.eventId === event.id)
  const count = (status) => rsvps.filter((r) => r.status === status).length
  return {
    ...event,
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
  let freeSpots = event.capacity - spotsTaken(db, eventId)
  const queue = rankedWaitlist(db, eventId)

  while (freeSpots > 0 && queue.length > 0) {
    const next = queue.shift() // take the first person out of the queue
    next.status = 'offered'
    next.offerExpiresAt = new Date(Date.now() + OFFER_HOURS * 60 * 60 * 1000).toISOString()
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
    .map((e) => withCounts(db, e))
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
}

export async function getEvent(eventId) {
  await fakeDelay()
  const db = loadFreshDb()
  return withCounts(db, findEvent(db, eventId))
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

  const alreadyIn = db.rsvps.some(
    (r) => r.eventId === eventId && r.userId === userId && ACTIVE_STATUSES.includes(r.status),
  )
  if (alreadyIn) throw new Error('You already have an RSVP for this event.')

  // Needs approval → pending. Otherwise confirmed if there's space, else waitlisted.
  let status
  if (event.requiresApproval) status = 'pending'
  else if (spotsTaken(db, eventId) < event.capacity) status = 'confirmed'
  else status = 'waitlisted'

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
