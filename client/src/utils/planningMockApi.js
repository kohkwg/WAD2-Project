// MOCK BACKEND for OpenJio planning: hangouts, availability, itineraries, deals.
// Same idea as mockApi.js: placeholder data in localStorage so pages work with no database.
// supabasePlanningApi.js must keep the SAME function names and return shapes.
//
// The suggest/generate/lookup calls only gather inputs and hand them to the algorithm
// stubs in ./planning/. Until those are implemented they throw NotImplementedError.

import { createPlanningSeed } from './planningSeed.js'
import { findSlots } from './planning/slotFinder.js'
import { generateItinerary } from './planning/itineraryGenerator.js'
import { resolveVotes } from './planning/voteResolution.js'
import { whereIsGroup } from './planning/lateJoin.js'
import { getEvents } from './mockApi.js'

const CURRENT_USER_ID = 'u1'
const CURRENT_USER_NAME = 'Alex Tan'
const STORAGE_KEY = 'openjio-planning-demo'

function loadDb() {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) return JSON.parse(saved)
  const fresh = createPlanningSeed()
  saveDb(fresh)
  return fresh
}

function saveDb(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
}

export function resetPlanningDemoData() {
  localStorage.removeItem(STORAGE_KEY)
}

function fakeDelay() {
  return new Promise((resolve) => setTimeout(resolve, 200))
}

function newId(prefix) {
  return prefix + Date.now() + Math.floor(Math.random() * 1000)
}

function findHangout(db, hangoutId) {
  const hangout = db.hangouts.find((h) => h.id === hangoutId)
  if (!hangout) throw new Error('Hangout not found')
  return hangout
}

function findMember(hangout, userId) {
  const member = hangout.members.find((m) => m.userId === userId)
  if (!member) throw new Error('You are not in this hangout')
  return member
}

function copy(value) {
  return JSON.parse(JSON.stringify(value))
}

// ---------- Catalogue ----------

export async function getDeals() {
  await fakeDelay()
  return copy(loadDb().deals)
}

export async function getExternalEvents() {
  await fakeDelay()
  return copy(loadDb().externalEvents)
}

export async function getPlaces() {
  await fakeDelay()
  return copy(loadDb().places)
}

// ---------- Hangouts ----------

export async function getHangouts() {
  await fakeDelay()
  const db = loadDb()
  return copy(db.hangouts.filter((h) => h.members.some((m) => m.userId === CURRENT_USER_ID)))
}

export async function getHangout(hangoutId) {
  await fakeDelay()
  return copy(findHangout(loadDb(), hangoutId))
}

export async function createHangout(input) {
  await fakeDelay()
  const title = (input.title || '').trim()
  if (!title) throw new Error('Give your hangout a name')
  if (!input.dateFrom || !input.dateTo) throw new Error('Choose a date range')
  if (input.dateTo < input.dateFrom) throw new Error('The end date must be on or after the start date')

  const db = loadDb()
  const hangout = {
    id: newId('h'),
    hostId: CURRENT_USER_ID,
    title,
    mode: input.mode === 'solo' ? 'solo' : 'group',
    status: 'collecting',
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    minDurationMins: Number(input.minDurationMins) || 180,
    areaName: input.areaName || null,
    areaLat: input.areaLat ?? null,
    areaLng: input.areaLng ?? null,
    vibe: input.vibe || [],
    lockedSlotStart: null,
    lockedSlotEnd: null,
    inviteCode: newId('inv'),
    members: [
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME, role: 'host', required: true, availabilitySource: null, arrivalAt: null },
    ],
    availability: [],
    itinerary: null,
  }
  db.hangouts.push(hangout)
  saveDb(db)
  return copy(hangout)
}

export async function joinHangout(inviteCode, availabilitySource) {
  await fakeDelay()
  if (!['gcal', 'grid'].includes(availabilitySource)) throw new Error('Choose how to share your availability')
  const db = loadDb()
  const hangout = db.hangouts.find((h) => h.inviteCode === inviteCode)
  if (!hangout) throw new Error('This invite link is not valid')
  let member = hangout.members.find((m) => m.userId === CURRENT_USER_ID)
  if (!member) {
    member = { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME, role: 'member', required: false, availabilitySource: null, arrivalAt: null }
    hangout.members.push(member)
  }
  member.availabilitySource = availabilitySource
  saveDb(db)
  return copy(hangout)
}

// blocks: [{ kind: 'busy'|'free', startsAt, endsAt }] for the signed-in user; replaces earlier blocks
export async function saveAvailability(hangoutId, blocks) {
  await fakeDelay()
  const db = loadDb()
  const hangout = findHangout(db, hangoutId)
  findMember(hangout, CURRENT_USER_ID)
  hangout.availability = hangout.availability
    .filter((b) => b.userId !== CURRENT_USER_ID)
    .concat(blocks.map((b) => ({ id: newId('a'), userId: CURRENT_USER_ID, kind: b.kind, startsAt: b.startsAt, endsAt: b.endsAt })))
  saveDb(db)
  return copy(hangout)
}

export async function lockSlot(hangoutId, startsAt, endsAt) {
  await fakeDelay()
  const db = loadDb()
  const hangout = findHangout(db, hangoutId)
  if (hangout.hostId !== CURRENT_USER_ID) throw new Error('Only the host can lock the time')
  if (!(new Date(endsAt) > new Date(startsAt))) throw new Error('The slot must end after it starts')
  hangout.lockedSlotStart = startsAt
  hangout.lockedSlotEnd = endsAt
  hangout.status = 'slot_locked'
  saveDb(db)
  return copy(hangout)
}

export async function setArrival(hangoutId, arrivalAt) {
  await fakeDelay()
  const db = loadDb()
  const member = findMember(findHangout(db, hangoutId), CURRENT_USER_ID)
  member.arrivalAt = arrivalAt
  saveDb(db)
  return copy(member)
}

export async function voteOnStop(hangoutId, stopId, value) {
  await fakeDelay()
  if (value !== 1 && value !== -1) throw new Error('A vote is either 1 or -1')
  const db = loadDb()
  const hangout = findHangout(db, hangoutId)
  findMember(hangout, CURRENT_USER_ID)
  const stop = hangout.itinerary?.stops.find((s) => s.id === stopId)
  if (!stop) throw new Error('Stop not found')
  stop.votes = stop.votes.filter((v) => v.userId !== CURRENT_USER_ID).concat({ userId: CURRENT_USER_ID, value })
  saveDb(db)
  return copy(stop)
}

// ---------- Algorithm-backed calls (stubs until implemented) ----------

export async function suggestSlots(hangoutId) {
  await fakeDelay()
  const hangout = findHangout(loadDb(), hangoutId)
  return findSlots({
    dateFrom: hangout.dateFrom,
    dateTo: hangout.dateTo,
    minDurationMins: hangout.minDurationMins,
    members: hangout.members.map((m) => ({ userId: m.userId, required: m.required })),
    availability: hangout.availability,
  })
}

export async function generateItineraryFor(hangoutId) {
  await fakeDelay()
  const db = loadDb()
  const hangout = findHangout(db, hangoutId)
  if (!hangout.lockedSlotStart) throw new Error('Lock a time slot first')
  const result = generateItinerary({
    startsAt: hangout.lockedSlotStart,
    endsAt: hangout.lockedSlotEnd,
    area: { lat: hangout.areaLat, lng: hangout.areaLng },
    interests: Object.fromEntries(hangout.vibe.map((slug) => [slug, 1])),
    candidates: { events: await getEvents(), externalEvents: db.externalEvents, deals: db.deals, places: db.places },
  })
  hangout.itinerary = {
    id: newId('i'),
    version: (hangout.itinerary?.version || 0) + 1,
    generatedBy: 'auto',
    status: 'draft',
    stops: result.stops.map((s) => ({ ...s, id: newId('s'), votes: [] })),
  }
  saveDb(db)
  return copy(hangout.itinerary)
}

export async function applyVotes(hangoutId) {
  await fakeDelay()
  const db = loadDb()
  const hangout = findHangout(db, hangoutId)
  if (!hangout.itinerary) throw new Error('There is no itinerary yet')
  const result = resolveVotes(hangout.itinerary)
  hangout.itinerary.stops = result.stops
  saveDb(db)
  return copy(result)
}

export async function lookUpArrival(hangoutId, arrivalAt) {
  await fakeDelay()
  const hangout = findHangout(loadDb(), hangoutId)
  if (!hangout.itinerary) throw new Error('There is no itinerary yet')
  return whereIsGroup(hangout.itinerary.stops, arrivalAt)
}
