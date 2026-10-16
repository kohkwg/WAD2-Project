// ALL data calls go through this one file. Pages import from here and nowhere else.
//
// There are two backends with exactly the same functions:
//   mockApi.js      placeholder data in localStorage (works with no setup at all)
//   supabaseApi.js  the real Supabase database
// If client/.env has the Supabase keys we use Supabase; otherwise the mock
// (or set VITE_USE_MOCK=true to use the mock anyway).
// The pages can't tell the difference: same function names, same data shapes.
//
// Every function is `async`, so pages call them the WAD2 way:
//
//     try {
//       event.value = await getEvent(id)
//     } catch (error) {
//       errorMessage.value = error.message
//     }

import * as mockApi from './mockApi.js'
import * as supabaseApi from './supabaseApi.js'
import { isSupabaseConfigured } from './supabase.js'

// VITE_USE_MOCK=true in client/.env forces the mock even when the keys are there (handy for demos)
export const USING_SUPABASE = isSupabaseConfigured && import.meta.env.VITE_USE_MOCK !== 'true'

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
export const setMember = (organiserId, userId, makeMember) =>
  backend.setMember(organiserId, userId, makeMember)
export const expireOffersNow = (eventId) => backend.expireOffersNow(eventId) // demo button

// ---------- Mock only ----------
export const resetDemoData = () => backend.resetDemoData()
