// ALL data calls go through this one file. Pages import from here and nowhere else.
//
// The event/RSVP/auth calls select one of two backends:
//   mockApi.js      placeholder data in localStorage (works with no setup at all)
//   supabaseApi.js  the real Supabase database
// If client/.env has the Supabase keys we use Supabase; otherwise the mock
// (or set VITE_USE_MOCK=true to use the mock anyway).
// Feature 4 live writes remain disabled until the shared database contract is approved.


import * as mockApi from './mockApi.js'
import * as supabaseApi from './supabaseApi.js'
import { isSupabaseConfigured } from './supabase.js'

// VITE_USE_MOCK=true in client/.env forces the mock even when the keys are there (handy for demos)
export const USING_SUPABASE = isSupabaseConfigured && import.meta.env?.VITE_USE_MOCK !== 'true'
export const CURRENT_USER_ID = 'u1'
export const CURRENT_ORGANISER_ID = 'org1'

const backend = USING_SUPABASE ? supabaseApi : mockApi

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
export const resetDemoData = () => backend.resetDemoData()

// Feature 4 retains its offline contract while the live schema is reconciled with it.
async function feature4(method, ...args) {
  if (USING_SUPABASE) throw new Error('Live organiser operations are awaiting the agreed Supabase contract.')
  return mockApi[method](...args)
}
export const getEventOperations = (eventId) => feature4('getEventOperations', eventId)
export const createTask = (eventId, input) => feature4('createTask', eventId, input)
export const updateTask = (eventId, id, input) => feature4('updateTask', eventId, id, input)
export const deleteTask = (eventId, id) => feature4('deleteTask', eventId, id)
export const saveTaskBoard = (eventId, columns) => feature4('saveTaskBoard', eventId, columns)
export const getAnnouncements = (eventId) => backend.getAnnouncements(eventId)
export const createAnnouncement = (eventId, body) => feature4('createAnnouncement', eventId, body)
export const updateAnnouncement = (eventId, id, body) => feature4('updateAnnouncement', eventId, id, body)
export const deleteAnnouncement = (eventId, id) => feature4('deleteAnnouncement', eventId, id)
export const saveBudgetLimit = (eventId, cents) => feature4('saveBudgetLimit', eventId, cents)
export const saveBudgetItem = (eventId, input) => feature4('saveBudgetItem', eventId, input)
export const deleteBudgetItem = (eventId, id) => feature4('deleteBudgetItem', eventId, id)
export const getForecastAreas = () => feature4('getForecastAreas')
export const getEventWeather = (eventId) => feature4('getEventWeather', eventId)
export const setForecastArea = (eventId, name) => feature4('setForecastArea', eventId, name)
export const getEventForecast = (eventId) => feature4('getEventForecast', eventId)
export const confirmBackupVenueSwitch = (eventId) => feature4('confirmBackupVenueSwitch', eventId)
