// Feature 3 (check-in): Supabase calls + small helpers.
//
// HOW TO READ THIS FILE
//   BOILERPLATE   -> thin wrappers around Supabase; skim them.
//   ===== HUXLEY  -> your core logic; read it properly, you'll need to explain it in Q&A.
//
// All calls go straight from the browser to Supabase with the signed-in user's JWT
// (the supabase client attaches it automatically), so RLS and auth.uid() work.
// The real rules (who can check in, duplicates, expired codes) live in the database
// functions in supabase/migrations/20261015000000_init.sql.

import { supabase } from './supabase'

// ---------------------------------------------------------------------------
// BOILERPLATE: wrappers. Each throws an Error carrying the database's message,
// e.g. "Ticket not found for this event", so views can just try/catch.
// ---------------------------------------------------------------------------
async function call(request) {
  const { data, error } = await request
  if (error) throw new Error(error.message)
  return data
}

export const getEvent = (eventId) =>
  call(supabase.from('events').select('id, title, starts_at, ends_at').eq('id', eventId).single())

// Staff scans a participant's personal QR (the QR holds registrations.qr_token).
// Returns the check_ins row (new, or the existing one if they were already in).
export const staffCheckIn = (eventId, code) =>
  call(supabase.rpc('staff_check_in', { p_event_id: eventId, p_code: code, p_method: 'personal_qr' }))

// Participant scans the venue QR. Returns the check_ins row (new or existing).
export const selfCheckIn = (eventId, secret, deviceId, lat, lng) =>
  call(
    supabase.rpc('self_check_in', {
      p_event_id: eventId,
      p_secret: secret,
      p_device_id: deviceId,
      p_lat: lat,
      p_lng: lng,
    }),
  )

// Staff only (RLS). Participants can never read this table.
export const getCheckinSecret = (eventId) =>
  call(supabase.from('event_secrets').select('checkin_secret, rotated_at').eq('event_id', eventId).single())

// Staff only. Returns the new secret; the old one stops working immediately.
export const rotateCheckinSecret = (eventId) =>
  call(supabase.rpc('rotate_checkin_secret', { p_event_id: eventId }))

// Organisers only (has emails). Returns an array of rows.
export const exportAttendance = (eventId) =>
  call(supabase.rpc('export_attendance', { p_event_id: eventId }))

// Staff. rows = [{ email, ticket_code, checked_in_at }]. Returns { matched, unmatched }.
export async function importAttendance(eventId, rows) {
  const data = await call(supabase.rpc('import_attendance', { p_event_id: eventId, p_rows: rows }))
  return data[0] // "returns table" comes back as an array with one row
}

// The URL encoded in the venue QR. Using a real URL means a phone's normal camera
// app can open it too, not only our in-app scanner.
export function venueCheckInUrl(eventId, secret) {
  return `${window.location.origin}/events/${eventId}/check-in?s=${secret}`
}

// ===== HUXLEY: core logic ===================================================
// getDeviceId()
// A random id that stays the same on this phone/browser, saved in localStorage.
// self_check_in stores it so the fraud trigger can spot one phone checking in
// several different people ("shared_device").
// Q&A: it's not a real hardware id (browsers don't expose one); clearing site data
// or using incognito gives a new id. Good enough to catch casual sharing.
// crypto.randomUUID() needs a secure context (https or localhost), same as the camera.
// ============================================================================
const DEVICE_KEY = 'bookedz-device-id'

export function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch {
    return null // storage blocked (e.g. some private modes): check in without it
  }
}

// ===== HUXLEY: core logic ===================================================
// getLocation()
// Wraps the callback-style Geolocation API in a Promise so we can `await` it.
// Resolves { lat, lng }, or null if the user refuses, there's no GPS, or it times out.
// Design choice: we still let them check in without a location (the RPC accepts
// null), so a denied permission doesn't block entry. The trade-off is the
// "far_from_venue" fraud check can't run for that person. Revisit with fraud flags.
// ============================================================================
export function getLocation(timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    )
  })
}

// ===== HUXLEY: core logic ===================================================
// wasAlreadyCheckedIn(row, sentAt)
// Both check-in RPCs are idempotent: scanning someone twice doesn't error, it
// returns their EXISTING row. To tell "just checked in" from "already in", compare
// the row's checked_in_at with when we sent the request (sentAt = Date.now()).
// The 30 s slack covers the device clock being slightly off from the server's.
// ============================================================================
const CLOCK_SLACK_MS = 30_000

export function wasAlreadyCheckedIn(row, sentAt) {
  return new Date(row.checked_in_at).getTime() < sentAt - CLOCK_SLACK_MS
}

export function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
