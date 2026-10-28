// ALL data calls go through this one file. Pages import from here and nowhere else.
//
// The event/RSVP/auth calls select one of two backends:
//   mockApi.js      placeholder data in localStorage (works with no setup at all)
//   supabaseApi.js  the real Supabase database
// If client/.env has the Supabase keys we use Supabase; otherwise the mock
// (or set VITE_USE_MOCK=true to use the mock anyway).
// Feature 4 uses its own live adapter; venue switching is authorized by the
// deployed server-side NEA verifier and fails closed when eligibility is unknown.


import * as mockApi from './mockApi.js'
import * as supabaseApi from './supabaseApi.js'
import * as supabaseFeature4Api from './supabaseFeature4Api.js'
import * as supabaseFeature4Weather from './supabaseFeature4Weather.js'
import * as planningMockApi from './planningMockApi.js'
import * as supabasePlanningApi from './supabasePlanningApi.js'
import { isSupabaseConfigured } from './supabase.js'

// VITE_USE_MOCK=true in client/.env forces the mock even when the keys are there (handy for demos)
export const USING_SUPABASE = isSupabaseConfigured && import.meta.env?.VITE_USE_MOCK !== 'true'
export const CURRENT_USER_ID = 'u1'
export const CURRENT_ORGANISER_ID = 'org1'

const backend = USING_SUPABASE ? supabaseApi : mockApi
const operationsBackend = USING_SUPABASE ? supabaseFeature4Api : mockApi
const weatherBackend = USING_SUPABASE ? supabaseFeature4Weather : mockApi
const planningBackend = USING_SUPABASE ? supabasePlanningApi : planningMockApi

// The RSVP rules live in helpers.js; re-exported so pages can keep importing them from here
export { OFFER_HOURS, ACTIVE_STATUSES, JOINED_STATUSES, CLOSED_STATUSES } from './helpers.js'

// ---------- Sign-in ----------
export const getCurrentUser = () => backend.getCurrentUser() // { id, email } or null
export const signIn = (email, password) => backend.signIn(email, password)
export const signUp = (name, email, password) => backend.signUp(name, email, password) // true → check email
export const signOut = () => backend.signOut()
export const onAuthChange = (callback) => backend.onAuthChange(callback) // returns "stop listening"

// ---------- Events ----------
export const getEvents = () => backend.getEvents()
export const getEvent = (eventId) => backend.getEvent(eventId)
export const getOrganiserEvents = () => backend.getOrganiserEvents() // the signed-in organiser's
export const createEvent = (eventData) => backend.createEvent(eventData)
export const deleteEvent = (eventId) => backend.deleteEvent(eventId)


// ---------- Users ----------
export const getUser = () => backend.getUser() // the signed-in user's profile

// ---------- RSVPs: participant ----------
export const getMyRsvps = () => backend.getMyRsvps()
export const createRsvp = (rsvpData) => backend.createRsvp(rsvpData) // { eventId, name, email, answers }
export const cancelRsvp = (rsvpId) => backend.cancelRsvp(rsvpId)
export const respondToOffer = (rsvpId, accept) => backend.respondToOffer(rsvpId, accept)

// ---------- RSVPs: organiser ----------
export const getRsvpsForEvent = (eventId) => backend.getRsvpsForEvent(eventId)
export const approveRsvp = (rsvpId) => backend.approveRsvp(rsvpId)
export const rejectRsvp = (rsvpId) => backend.rejectRsvp(rsvpId)
export const removeRsvp = (rsvpId) => backend.removeRsvp(rsvpId) // take an accepted person off
export const setMember = (organiserId, userId, makeMember) =>
  backend.setMember(organiserId, userId, makeMember)
export const expireOffersNow = (eventId) => backend.expireOffersNow(eventId) // demo button

// ---------- Mock only ----------
export const resetDemoData = () => { backend.resetDemoData(); planningBackend.resetPlanningDemoData() }

export const getEventOperations = (eventId) => operationsBackend.getEventOperations(eventId)
export const createTask = (eventId, input) => operationsBackend.createTask(eventId, input)
export const updateTask = (eventId, id, input) => operationsBackend.updateTask(eventId, id, input)
export const deleteTask = (eventId, id) => operationsBackend.deleteTask(eventId, id)
export const saveTaskBoard = (eventId, columns) => operationsBackend.saveTaskBoard(eventId, columns)
export const getAnnouncements = (eventId) => operationsBackend.getAnnouncements(eventId)
export const createAnnouncement = (eventId, body, requestId) => operationsBackend.createAnnouncement(eventId, body, requestId)
export const updateAnnouncement = (eventId, id, body) => operationsBackend.updateAnnouncement(eventId, id, body)
export const deleteAnnouncement = (eventId, id) => operationsBackend.deleteAnnouncement(eventId, id)
export const saveBudgetLimit = (eventId, cents) => operationsBackend.saveBudgetLimit(eventId, cents)
export const saveBudgetItem = (eventId, input) => operationsBackend.saveBudgetItem(eventId, input)
export const deleteBudgetItem = (eventId, id) => operationsBackend.deleteBudgetItem(eventId, id)
export const getForecastAreas = () => weatherBackend.getForecastAreas()
export const getEventWeather = (eventId) => weatherBackend.getEventWeather(eventId)
export const setForecastArea = (eventId, name) => operationsBackend.setForecastArea(eventId, name)
export const getEventForecast = (eventId) => weatherBackend.getEventForecast(eventId)
export const confirmBackupVenueSwitch = (eventId) => weatherBackend.confirmBackupVenueSwitch(eventId)

// ---------- OpenJio planning: deals, outside events, hangouts, itineraries ----------
// suggestSlots, generateItineraryFor, applyVotes and lookUpArrival call the algorithm
// stubs in utils/planning/. They reject with error.code === 'NOT_IMPLEMENTED' until built.
export const getDeals = () => planningBackend.getDeals()
export const getExternalEvents = () => planningBackend.getExternalEvents()
export const getPlaces = () => planningBackend.getPlaces()
export const getHangouts = () => planningBackend.getHangouts() // hangouts the signed-in user is in
export const getHangout = (hangoutId) => planningBackend.getHangout(hangoutId)
export const createHangout = (input) => planningBackend.createHangout(input) // { title, mode, dateFrom, dateTo, minDurationMins, areaName, vibe }
export const joinHangout = (inviteCode, availabilitySource) => planningBackend.joinHangout(inviteCode, availabilitySource) // 'gcal' | 'grid'
export const saveAvailability = (hangoutId, blocks) => planningBackend.saveAvailability(hangoutId, blocks)
export const lockSlot = (hangoutId, startsAt, endsAt) => planningBackend.lockSlot(hangoutId, startsAt, endsAt)
export const setArrival = (hangoutId, arrivalAt) => planningBackend.setArrival(hangoutId, arrivalAt)
export const voteOnStop = (hangoutId, stopId, value) => planningBackend.voteOnStop(hangoutId, stopId, value) // 1 | -1
export const suggestSlots = (hangoutId) => planningBackend.suggestSlots(hangoutId)
export const generateItineraryFor = (hangoutId) => planningBackend.generateItineraryFor(hangoutId)
export const applyVotes = (hangoutId) => planningBackend.applyVotes(hangoutId)
export const lookUpArrival = (hangoutId, arrivalAt) => planningBackend.lookUpArrival(hangoutId, arrivalAt)
