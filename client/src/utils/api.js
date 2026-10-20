// ALL data calls for Feature 2 live in this one file.
//
// Right now every function works on placeholder data saved in localStorage (Week 6),
// so the pages can be clicked through before the backend exists. Each function is
// `async`, so pages already call it the WAD2 way:
//
//     try {
//       event.value = await getEvent(id)
//     } catch (error) {
//       errorMessage.value = error.message
//     }
//
// When Timothy's backend (Supabase + Express) is ready, ONLY this file changes: swap each
// function's body for the axios call in its comment. The pages stay the same.

import { createSeedData } from './mockData.js'
import { calculateWaitlistScore } from './waitlistScore.js'
import { TASK_STATUSES, BUDGET_CATEGORIES, validateCents, summariseBudget } from './feature4.js'
import { fetchForecastData, forecastAreas, eventForecast } from './feature4Weather.js'
// import axios from 'axios'
// const BASE_URL = 'http://localhost:3000/api'   // TODO: Timothy's Express server

// Who is "logged in" for the demo. TODO: replace with the Supabase Auth user.
export const CURRENT_USER_ID = 'u1'
export const CURRENT_ORGANISER_ID = 'org1'

export const OFFER_HOURS = 24

// RSVPs that still hold or want a place at the event
export const ACTIVE_STATUSES = ['pending', 'confirmed', 'waitlisted', 'offered']
// RSVPs that count as "you've joined" for the clash warning
export const JOINED_STATUSES = ['pending', 'confirmed', 'offered']
// RSVPs that are over
export const CLOSED_STATUSES = ['rejected', 'cancelled', 'declined', 'expired']

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
    // Additive demo migration: preserve existing events, RSVPs, and unknown fields.
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
// Events
// ---------------------------------------------------------------------------

export async function getEvents() {
  // Later: const response = await axios.get(BASE_URL + '/events'); return response.data
  await fakeDelay()
  const db = loadFreshDb()
  return db.events
    .map((e) => withCounts(db, e))
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
}

export async function getEvent(eventId) {
  // Later: const response = await axios.get(BASE_URL + '/events/' + eventId); return response.data
  await fakeDelay()
  const db = loadFreshDb()
  return withCounts(db, findEvent(db, eventId))
}

export async function getOrganiserEvents(organiserId) {
  // Later: axios.get(BASE_URL + '/events', { params: { organiserId: organiserId } })
  await fakeDelay()
  const db = loadFreshDb()
  return db.events
    .filter((e) => e.organiserId === organiserId)
    .map((e) => withCounts(db, e))
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
}

export async function createEvent(eventData) {
  // Later: const response = await axios.post(BASE_URL + '/events', eventData); return response.data
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

export async function getUser(userId) {
  // Later: Supabase profile of the signed-in user
  await fakeDelay()
  const db = loadDb()
  return findUser(db, userId)
}

// ---------------------------------------------------------------------------
// RSVPs — participant side
// ---------------------------------------------------------------------------

export async function getMyRsvps(userId) {
  // Later: axios.get(BASE_URL + '/rsvps', { params: { userId: userId } })
  await fakeDelay()
  const db = loadFreshDb()
  return db.rsvps
    .filter((r) => r.userId === userId)
    .map((r) => ({ ...r, event: withCounts(db, findEvent(db, r.eventId)) }))
    .sort((a, b) => new Date(a.event.startTime) - new Date(b.event.startTime))
}

export async function createRsvp({ eventId, userId, name, email, answers }) {
  // Later: axios.post(BASE_URL + '/rsvps', { eventId, userId, name, email, answers })
  await fakeDelay()
  const db = loadFreshDb()
  const event = findEvent(db, eventId)

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
  // Later: axios.put(BASE_URL + '/rsvps/' + rsvpId, { status: 'cancelled' })
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
  // Later: axios.post(BASE_URL + '/rsvps/' + rsvpId + '/offer', { accept: accept })
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
  // Later: axios.get(BASE_URL + '/events/' + eventId + '/rsvps')
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
  // Later: axios.post(BASE_URL + '/rsvps/' + rsvpId + '/approve')
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
  // Later: axios.post(BASE_URL + '/rsvps/' + rsvpId + '/reject')
  await fakeDelay()
  const db = loadFreshDb()
  const rsvp = findRsvp(db, rsvpId)
  if (rsvp.status !== 'pending') throw new Error('Only pending RSVPs can be rejected.')

  rsvp.status = 'rejected'
  saveDb(db)
  return rsvp
}

export async function setMember(organiserId, userId, makeMember) {
  // Later: makeMember ? axios.post(BASE_URL + '/members', {...}) : axios.delete(BASE_URL + '/members', { data: {...} })
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

// ---------------------------------------------------------------------------
// Feature 4 — DEMO ONLY asynchronous organiser operations.
// Local ownership checks model the intended interface; localStorage is not auth.
// Supabase is intentionally not activated until shared auth/RLS contracts exist.
// ---------------------------------------------------------------------------

/** @typedef {{id:string,eventId:string,title:string,notes:string,status:string,position:number}} Task */
/** @typedef {{id:string,eventId:string,body:string,kind:'manual'|'venue-switch',createdAt:string,updatedAt:string|null}} Announcement */
/** @typedef {{id:string,eventId:string,name:string,category:string,plannedCents:number,actualCents:number}} BudgetItem */

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

/** Private event workspace: { event, tasks, announcements, budget, forecastAreaOverride }. */
export async function getEventOperations(eventId) {
  const db = loadDb()
  const event = ownedEvent(db, eventId)
  return {
    event: withCounts(db, event), tasks: orderedTasks(db, eventId), announcements: publicAnnouncements(db, eventId),
    budget: eventBudget(db, eventId), forecastAreaOverride: db.feature4.forecastAreas[eventId] || null,
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
    category: input?.category, plannedCents: validateCents(input?.plannedCents), actualCents: validateCents(input?.actualCents),
  }
  if (!BUDGET_CATEGORIES.includes(item.category)) throw new Error('Choose a valid budget category.')
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
