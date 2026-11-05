// SUPABASE BACKEND: the same functions as mockApi.js, returning the same shapes,
// but reading and writing the real database (supabase/migrations/..._init.sql).
//
// Two ways we talk to the database:
//   supabase.from('table').select / insert / update / delete   → plain table access
//   supabase.rpc('function_name', { args })                    → runs a SQL function
// The RSVP rules (capacity, waitlist, 24h offers, scoring) live in the SQL functions,
// so every page and every user goes through the same rules and nobody can skip them.
//
// Who is allowed to do what is decided by Row Level Security (RLS) in the database,
// using the signed-in user's login. That's why there are no user ids passed in here.
//
// Every Supabase call returns { data, error } instead of throwing, so we pass each
// result through check(): it throws on error, which the pages' try/catch then shows.

import { supabase } from './supabase.js'
import { api as recommendationApi } from '../lib/api.js'
import * as hangouts from './supabaseHangoutsApi.js'
import { onlineVenue, hideCapacityNumbers } from './onlineEvents.js'
import { pendingVenue } from './venueReveal.js'

// Network trouble gets a plain message, so people know the action did not go through.
export function friendlyMessage(error) {
  // Only real connection failures get this message; a server error keeps the server's own wording.
  const text = error?.message || ''
  return /failed to fetch|networkerror|load failed|network request failed/i.test(text)
    ? 'Could not reach the server. Check your connection and try again; nothing was changed.'
    : error?.message || 'Something went wrong. Please try again.'
}

function check({ data, error }) {
  if (error) throw new Error(friendlyMessage(error))
  return data
}

// ---------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------

// { id, email } of whoever is signed in, or null.
// getSession() reads the saved login from the browser, so it doesn't need the network.
export async function getCurrentUser() {
  const { data } = await supabase.auth.getSession()
  if (!data.session) return null
  return { id: data.session.user.id, email: data.session.user.email, user_metadata: { dino: data.session.user.user_metadata?.dino } }
}

async function requireUserId() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Please sign in first.')
  return user.id
}

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
  if (!error) return
  // One message for an unknown email and a wrong password, so the form never reveals which
  // emails have accounts. `kind` lets the sign-in form count wrong attempts.
  if (/invalid login credentials/i.test(error.message)) throw Object.assign(new Error('Invalid email or password.'), { kind: 'credentials' })
  throw new Error(friendlyMessage(error))
}

// The database makes a profile for every new account (trigger handle_new_user);
// `full_name` is what it uses as their display name. The trigger does not know about
// usernames, so when a session starts straight away we save the chosen username on the
// new profile ourselves. The username is also kept in the account's metadata.
// Returns { mustConfirmEmail, usernameTaken }: with mustConfirmEmail they must click a link in
// their email before they can sign in (and choose a username later in their profile).
export async function signUp(name, email, password, username = '') {
  const handle = username.trim().replace(/^@/, '').toLowerCase()
  const data = check(
    await supabase.auth.signUp({ email: email.trim().toLowerCase(), password, options: { data: { full_name: name, username: handle } } }),
  )
  // When "Confirm email" is on, Supabase does not report an existing address as an error (that
  // would reveal who is registered). It returns a user with an empty `identities` list instead.
  if (Array.isArray(data.user?.identities) && data.user.identities.length === 0) throw new Error('User already registered')
  if (data.session === null) return { mustConfirmEmail: true, usernameTaken: false }
  let usernameTaken = false
  if (handle) {
    const { error } = await supabase.from('profiles').update({ username: handle }).eq('id', data.user.id)
    // 23505 = the unique constraint: someone already has that username.
    if (error?.code === '23505') usernameTaken = true
  }
  return { mustConfirmEmail: false, usernameTaken }
}

// Emails a reset link that opens /reset-password. Resolves the same way whether or not the
// address has an account, so the form cannot be used to find out who is registered.
export async function requestPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })
  // Anything except a rate limit is hidden on purpose (see above).
  if (error?.status === 429 || /rate limit/i.test(error?.message || '')) throw new Error('Too many reset emails were requested. Please wait a few minutes and try again.')
}

// Saves a new password for whoever is signed in (the reset link signs them in temporarily).
export async function updatePassword(password) {
  check(await supabase.auth.updateUser({ password }))
}

// ---- Account settings (Profile page) ----

// Changes the signed-in user's username. Returns { taken: true } if someone already has it.
export async function changeUsername(handle) {
  const userId = await requireUserId()
  const { error } = await supabase.from('profiles').update({ username: handle }).eq('id', userId)
  if (error?.code === '23505') return { taken: true }
  if (error) throw new Error(error.message)
  return { taken: false }
}

// Supabase emails a confirmation link; the address only changes once it is clicked.
export async function changeEmail(newEmail) {
  check(await supabase.auth.updateUser({ email: newEmail }))
}

// Proves they know the current password (signing in again with it) before setting the new one.
export async function changePassword(currentPassword, newPassword) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Please sign in first.')
  const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword })
  if (error) throw new Error('Your current password is incorrect.')
  check(await supabase.auth.updateUser({ password: newPassword }))
}

// Permanently deletes the signed-in account. Needs the password again (checked by signing in
// with it), then asks the server to delete it, because only the server holds the key that can.
export async function deleteAccount(password) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Please sign in first.')
  const { error } = await supabase.auth.signInWithPassword({ email: user.email, password })
  if (error) throw new Error('Your password is incorrect.')
  try {
    await recommendationApi.delete('/api/account')
  } catch (failure) {
    throw new Error(failure.response?.data?.error || 'Could not delete your account. Please try again.')
  }
  await supabase.auth.signOut()
}

export async function signOut() {
  check(await supabase.auth.signOut())
}

// Runs callback(user or null) whenever someone signs in or out. Returns a function to stop.
export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(session ? { id: session.user.id, email: session.user.email, user_metadata: { dino: session.user.user_metadata?.dino } } : null)
  })
  return () => data.subscription.unsubscribe()
}

// ---------------------------------------------------------------------------
// Turning database rows into the shapes the pages use
// ---------------------------------------------------------------------------

// What to fetch for an event. The extra lines pull in linked rows in the same request:
//   venue / backup_venue → two links to the venues table, so we name which foreign key
//   event_interests      → the event's tags, e.g. [{ interests: { slug: 'music' } }]
//   event_questions      → the organiser's RSVP questions
const EVENT_COLUMNS = `
  *,
  venue:venues!events_venue_id_fkey(*),
  backup_venue:venues!events_backup_venue_id_fkey(*),
  event_interests(interests(slug)),
  event_questions(*)
`

function toVenue(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    postal: row.postal_code,
    lat: row.latitude,
    lng: row.longitude,
  }
}

// Database question types → the two types our pages know
function toQuestion(row) {
  return {
    id: row.id,
    text: row.prompt,
    type: row.type === 'yes_no' ? 'yesno' : 'text',
    required: row.required,
  }
}

// counts = this event's row from the event_availability function
function toEvent(row, counts, myId) {
  return {
    id: row.id,
    organiserId: row.organiser_id,
    isMine: row.organiser_id === myId,
    title: row.title,
    description: row.description,
    coverImageUrl: row.cover_image_url || '',
    tags: row.event_interests.map((link) => link.interests.slug),
    startTime: row.starts_at,
    endTime: row.ends_at,
    capacity: row.capacity,
    requiresApproval: row.requires_approval,
    // Present once migration 20261103120000_hangouts is applied; older rows are Official
    kind: row.kind || 'official',
    joinMode: row.join_mode || null,
    // Present once migration 20261105120000 is applied; older rows are physical with capacity shown
    isOnline: Boolean(row.is_online),
    hideCapacity: Boolean(row.hide_capacity),
    // The database stores indoor/outdoor on the venue, not the event
    isOutdoor: row.venue ? !row.venue.is_indoor : false,
    // Online events have no venue row. A physical event without one (to be announced, hidden until
    // venue_reveal_at, or a deleted venue) shows "Venue to be announced" instead of breaking pages
    venue: row.is_online ? onlineVenue() : toVenue(row.using_backup ? row.backup_venue : row.venue) || pendingVenue(),
    venuePending: !row.is_online && !(row.using_backup ? row.backup_venue : row.venue),
    // Present once migration 20261105150000 is applied; set while a chosen venue is still hidden
    venueRevealAt: row.venue_reveal_at || null,
    hiddenVenue: null, // the hidden venue itself, for the event's organisers (getEvent)
    backupVenue: toVenue(row.backup_venue),
    usingBackup: row.using_backup,
    questions: [...row.event_questions]
      .sort((a, b) => a.position - b.position)
      .map(toQuestion),
    status: row.status,
    createdAt: row.created_at,
    confirmedCount: counts ? counts.confirmed : 0,
    offeredCount: counts ? counts.offered : 0,
    pendingCount: counts ? counts.pending : 0,
    waitlistCount: counts ? counts.waitlisted : 0,
    spotsLeft: counts ? counts.spots_left : row.capacity,
  }
}

// Participants can't read other people's RSVPs (RLS), so they can't count them.
// event_availability is a SQL function that returns just the numbers, for many events at once.
// Hidden capacity: only the organiser gets the numbers here (getEvent also keeps them for the team).
async function toEventsWithCounts(rows, { keepTeamNumbers = false } = {}) {
  if (rows.length === 0) return []
  const myId = (await getCurrentUser())?.id
  const counts = check(
    await supabase.rpc('event_availability', { p_event_ids: rows.map((row) => row.id) }),
  )
  const memberships = myId ? check(await supabase.from('event_members')
    .select('event_id,member_role').eq('user_id', myId).in('event_id', rows.map(row => row.id))) : []
  const roleByEvent = new Map((memberships || []).map(row => [row.event_id, row.member_role]))
  return rows.map(row => ({
    ...toEvent(row, counts.find(c => c.event_id === row.id), myId),
    canManage: row.organiser_id === myId || roleByEvent.get(row.id) === 'organiser',
    isOnTeam: row.organiser_id === myId || roleByEvent.has(row.id),
  }))
}

// answers from the database: [{ question_id, answer }] → the pages use { questionId: answer }
function toRsvp(row) {
  const answers = {}
  for (const a of row.registration_answers || []) answers[a.question_id] = a.answer
  return {
    id: row.id,
    eventId: row.event_id,
    userId: row.user_id,
    status: row.status,
    createdAt: row.created_at,
    offerExpiresAt: row.offer_expires_at,
    answers,
  }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export async function getEvents() {
  const rows = check(
    await supabase
      .from('events')
      .select(EVENT_COLUMNS)
      .eq('status', 'published')
      .order('starts_at'),
  )
  return toEventsWithCounts(rows)
}

export async function getEvent(eventId) {
  const row = check(await supabase.from('events').select(EVENT_COLUMNS).eq('id', eventId).maybeSingle())
  if (!row) throw new Error('Event not found')
  const [counted] = await toEventsWithCounts([row], { keepTeamNumbers: true })
  const user = await getCurrentUser()
  counted.isOnTeam = user ? Boolean(check(await supabase.rpc('is_event_staff', { p_event_id: eventId }))) : false
  const event = counted.isMine || counted.isOnTeam ? counted : hideCapacityNumbers(counted)
  // A hidden venue is readable only by the event's organisers (RLS on event_hidden_venues)
  if (event.venueRevealAt && (event.isMine || event.canManage)) event.hiddenVenue = await hiddenVenueOf(eventId)
  if (event.kind === 'hangout') event.hangout = await hangouts.hangoutDetails(eventId, event.isMine)
  return event
}

// { venue, backupVenue, isOutdoor } from event_hidden_venues, or null when nothing is hidden or
// this user isn't one of the event's organisers
async function hiddenVenueOf(eventId) {
  const row = check(await supabase.from('event_hidden_venues').select('venue,backup_venue').eq('event_id', eventId).maybeSingle())
  if (!row) return null
  const place = (json) => json && { name: json.name, address: json.address || '', postal: json.postal || '', lat: json.lat ?? null, lng: json.lng ?? null }
  return { venue: place(row.venue), backupVenue: place(row.backup_venue), isOutdoor: Boolean(row.backup_venue) }
}

// Hidden venues whose time has come become ordinary venues. A job does this every minute; the
// event page also asks at the reveal time so nobody waits for it. Returns how many were released.
export async function releaseDueEventVenues() {
  return check(await supabase.rpc('release_due_event_venues')) || 0
}

// The online link is in its own table that only the organiser can read; everyone else asks
// event_online_access, which hands the link to confirmed attendees once its time has come.
export async function getEventOnlineAccess(eventId) {
  const access = check(await supabase.rpc('event_online_access', { p_event_id: eventId }))
  if (!access) return null
  return { hasLink: Boolean(access.hasLink), revealAt: access.revealAt || null, url: access.url || null }
}

// Several events at once (the official events Go together groups are for); missing or
// hidden ones are left out
export async function getEventsByIds(eventIds) {
  const ids = [...new Set(eventIds.filter(Boolean))]
  if (!ids.length) return []
  return toEventsWithCounts(check(await supabase.from('events').select(EVENT_COLUMNS).in('id', ids)))
}

export async function getAnnouncements(eventId) {
  const rows = check(await supabase.from('announcements')
    .select('id,event_id,body,is_automatic,created_at')
    .eq('event_id', eventId)
    .eq('audience', 'everyone')
    .order('created_at', { ascending: false }))
  return rows.map((row) => ({
    id: row.id,
    eventId: row.event_id,
    body: row.body,
    kind: row.is_automatic ? 'venue-switch' : 'manual',
    createdAt: row.created_at,
    updatedAt: null,
  }))
}

// Events the signed-in organiser runs
export async function getOrganiserEvents() {
  const myId = await requireUserId()
  const memberships = check(await supabase.from('event_members').select('event_id').eq('user_id', myId).eq('member_role', 'organiser'))
  const ids = [...new Set((memberships || []).map(row => row.event_id))]
  const rows = check(await supabase.from('events').select(`${EVENT_COLUMNS},creator:profiles!events_organiser_id_fkey(display_name,username)`)
    .or(`organiser_id.eq.${myId}${ids.length ? `,id.in.(${ids.join(',')})` : ''}`).order('starts_at'))
  const creators = await supabase.rpc('event_team_creators', { p_event_ids: rows.map(row => row.id) })
  // Older databases can still list events with initials until the avatar RPC is applied.
  if (creators.error && !['PGRST202', '42883'].includes(creators.error.code)) throw new Error(creators.error.message)
  const creatorByEvent = new Map((creators.data || []).map(row => [row.eventId, row]))
  const events = await toEventsWithCounts(rows)
  return events.map((event, index) => ({ ...event, creator: creatorByEvent.get(event.id) || {
    username: rows[index].creator?.username, displayName: rows[index].creator?.display_name,
  } }))
}

// eventData is the Create Event form plus a requestId kept stable for retries.
// The RPC commits venue rows, event, tags, questions, and its idempotency record together.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function createEventWith(client, eventData) {
  if (!UUID_PATTERN.test(eventData.requestId || '')) {
    throw new Error('A valid request ID is required to publish this event.')
  }

  const venuePayload = (venue) => venue && ({
    name: venue.name,
    address: venue.address,
    postal: venue.postal || null,
    lat: venue.lat,
    lng: venue.lng,
  })
  const isOnline = Boolean(eventData.isOnline)
  const payload = {
    title: eventData.title,
    description: eventData.description,
    startTime: eventData.startTime,
    endTime: eventData.endTime,
    capacity: eventData.capacity,
    hideCapacity: Boolean(eventData.hideCapacity),
    requiresApproval: eventData.requiresApproval,
    isOnline,
    // Online events have no venue or rain plan, and a venue to be announced has no rain plan yet;
    // the RPC refuses either.
    isOutdoor: isOnline || !eventData.venue ? false : eventData.isOutdoor,
    venue: isOnline ? null : venuePayload(eventData.venue) || null,
    backupVenue: isOnline || !eventData.venue || !eventData.isOutdoor ? null : venuePayload(eventData.backupVenue) || null,
    onlineLink: isOnline && eventData.onlineLink ? { url: eventData.onlineLink.url, revealAt: eventData.onlineLink.revealAt } : null,
    tags: eventData.tags,
    questions: eventData.questions.map(({ text, type, required }) => ({ text, type, required })),
  }
  if (eventData.coverImageUrl) payload.coverImageUrl = eventData.coverImageUrl
  // Only sent when a chosen venue is hidden, so ordinary events also work with an RPC from before
  // migration 20261105150000 (it refuses keys it doesn't know)
  if (!isOnline && eventData.venue && eventData.venueRevealAt) payload.venueRevealAt = eventData.venueRevealAt
  const id = check(
    await client.rpc('create_event_with_details', {
      p_request_id: eventData.requestId,
      p_event: payload,
    }),
  )
  if (typeof id !== 'string' || !id) throw new Error('Event creation returned no event ID.')
  return { id }
}

export async function createEvent(eventData) {
  await requireUserId()
  if (eventData.kind === 'hangout') return hangouts.createHangout(eventData, getEvent)
  // The Official wizard doesn't offer Open yet; refuse rather than silently auto-confirm.
  if (eventData.joinMode === 'open') throw new Error('The Open join mode is only available for hangouts so far.')
  return createEventWith(supabase, eventData)
}

// ---------------------------------------------------------------------------
// Hangouts (supabaseHangoutsApi.js; needs migration 20261103120000_hangouts)
export const getHangoutInvite = hangouts.getHangoutInvite
export const joinHangout = (target) => hangouts.joinHangout(target, createRsvp)
export const getHangoutTime = hangouts.getHangoutTime
export const saveHangoutAvailability = hangouts.saveHangoutAvailability
export const clearHangoutAvailability = hangouts.clearHangoutAvailability
export const setHangoutRequired = hangouts.setHangoutRequired
export const previewHangoutSlot = hangouts.previewHangoutSlot
export const lockHangoutSlot = (eventId, slot) => hangouts.lockHangoutSlot(eventId, slot, getEvent)
export const unlockHangoutSlot = (eventId) => hangouts.unlockHangoutSlot(eventId, getEvent)
export const getHangoutPlan = hangouts.getHangoutPlan
export const generateHangoutPlan = hangouts.generateHangoutPlan
export const previewHangoutStops = hangouts.previewHangoutStops
export const setHangoutStops = hangouts.setHangoutStops
export const addHangoutPlace = hangouts.addHangoutPlace
export const getHangoutAlternatives = hangouts.getHangoutAlternatives
export const voteHangoutStop = hangouts.voteHangoutStop
export const finalizeHangoutPlan = hangouts.finalizeHangoutPlan
export const reopenHangoutPlan = hangouts.reopenHangoutPlan
export const setHangoutMeetingPoint = hangouts.setHangoutMeetingPoint

// ---------------------------------------------------------------------------
// Editing a published event (Create Event in edit mode)
// ---------------------------------------------------------------------------
// No new SQL: Row Level Security already lets an event's organiser update the event, add
// venues and manage its tags and questions. Writes happen in an order where an early failure
// changes nothing (new venue rows first, then the event row in ONE update, then tags, then
// questions). Every step is safe to repeat, so the page simply calls this again to retry:
// new questions carry their own ids and tags/questions are compared with what is saved.
// The database itself offers newly added capacity to the waitlist (events_after_update trigger).

const sameVenue = (a, b) => Boolean(a && b) && a.name === b.name && (a.address || '') === (b.address || '')
  && (a.lat ?? null) === (b.lat ?? null) && (a.lng ?? null) === (b.lng ?? null)
const sameVenueOrNone = (a, b) => (!a && !b) || sameVenue(a, b)
// The jsonb shape event_hidden_venues accepts (the create_event_with_details venue shape)
const venueJson = (venue) => venue && ({ name: venue.name, address: venue.address || '', postal: venue.postal || null, lat: venue.lat ?? null, lng: venue.lng ?? null })
const toQuestionType = (type) => (type === 'yesno' ? 'yes_no' : 'short_text')

async function insertVenueWith(client, venue, isIndoor) {
  const row = check(await client.from('venues').insert({
    name: venue.name,
    address: venue.address || null,
    postal_code: venue.postal || null,
    latitude: venue.lat ?? null,
    longitude: venue.lng ?? null,
    is_indoor: isIndoor,
  }).select('id').single())
  return row.id
}

// Only the organiser can write event_online_links (RLS). Saving the same link again is harmless.
async function saveOnlineLinkWith(client, eventId, link) {
  if (!link) {
    check(await client.from('event_online_links').delete().eq('event_id', eventId))
    return
  }
  check(await client.from('event_online_links').upsert(
    { event_id: eventId, url: link.url, reveal_at: link.revealAt },
    { onConflict: 'event_id' },
  ))
}

async function saveEventTagsWith(client, eventId, before, after) {
  const added = after.filter((slug) => !before.includes(slug))
  const removed = before.filter((slug) => !after.includes(slug))
  if (added.length === 0 && removed.length === 0) return
  const interests = check(await client.from('interests').select('id,slug').in('slug', [...added, ...removed]))
  const idOf = (slug) => interests.find((interest) => interest.slug === slug)?.id
  if (added.some((slug) => idOf(slug) == null)) throw new Error('One of the chosen tags is unknown.')
  if (added.length) {
    check(await client.from('event_interests').upsert(
      added.map((slug) => ({ event_id: eventId, interest_id: idOf(slug) })),
      { onConflict: 'event_id,interest_id', ignoreDuplicates: true },
    ))
  }
  const removedIds = removed.map(idOf).filter((id) => id != null)
  if (removedIds.length) check(await client.from('event_interests').delete().eq('event_id', eventId).in('interest_id', removedIds))
}

async function saveEventQuestionsWith(client, eventId, before, after) {
  const beforeById = new Map(before.map((question) => [question.id, question]))
  // Only send what changed: the database has more question types than the pages show
  for (const question of after) {
    const old = beforeById.get(question.id)
    if (!old) continue
    const patch = {}
    if (old.text !== question.text) patch.prompt = question.text
    if (old.required !== question.required) patch.required = question.required
    if (old.type !== question.type) patch.type = toQuestionType(question.type)
    if (Object.keys(patch).length) check(await client.from('event_questions').update(patch).eq('event_id', eventId).eq('id', question.id))
  }
  const added = after.map((question, position) => ({ question, position })).filter(({ question }) => !beforeById.has(question.id))
  if (added.length) {
    check(await client.from('event_questions').upsert(
      added.map(({ question, position }) => ({
        id: question.id, event_id: eventId, prompt: question.text,
        type: toQuestionType(question.type), required: question.required, position,
      })),
      { onConflict: 'id', ignoreDuplicates: true },
    ))
  }
  const afterIds = new Set(after.map((question) => question.id))
  const removedIds = before.filter((question) => !afterIds.has(question.id)).map((question) => question.id)
  if (removedIds.length) check(await client.from('event_questions').delete().eq('event_id', eventId).in('id', removedIds))
}

// current = getEvent(eventId) as loaded just before saving; rsvpCount = how many RSVPs it has
export async function updateEventWith(client, { current, myId, rsvpCount }, changes) {
  const eventId = current.id
  if (current.organiserId !== myId && !current.canManage) throw new Error('You can only edit events you organise.')
  if (current.status !== 'draft' && new Date(current.startTime).getTime() <= Date.now()) {
    throw new Error('This event has already started, so it can no longer be edited.')
  }
  if (new Date(changes.endTime) <= new Date(changes.startTime)) throw new Error('The end time must be after the start time.')
  if (new Date(changes.startTime).getTime() <= Date.now()) throw new Error('The start time cannot be in the past.')
  const taken = (current.confirmedCount || 0) + (current.offeredCount || 0)
  if (changes.capacity != null && changes.capacity < taken) {
    throw new Error(`Capacity can't be lower than ${taken}: that many people are already confirmed or offered a place.`)
  }
  if (rsvpCount > 0) {
    for (const old of current.questions) {
      const kept = changes.questions.find((question) => question.id === old.id)
      if (!kept) throw new Error('Questions can’t be removed after people have RSVP’d, because their answers would be lost.')
      if (kept.type !== old.type) throw new Error('A question’s answer type can’t change after people have RSVP’d.')
    }
  }

  const update = {
    title: changes.title,
    description: changes.description,
    starts_at: changes.startTime,
    ends_at: changes.endTime,
    capacity: changes.capacity,
    requires_approval: changes.requiresApproval,
    cover_image_url: changes.coverImageUrl || null,
    hide_capacity: Boolean(changes.hideCapacity),
    is_online: Boolean(changes.isOnline),
  }
  // A hidden venue waits in event_hidden_venues (organisers only) until its reveal time; while it
  // exists the event has no public venue (events_hidden_venue_not_public), so it is removed before
  // a venue goes back on or the event becomes online.
  const wasHidden = Boolean(current.venueRevealAt)
  let hiddenToSave = null
  if (changes.isOnline) {
    // Online events keep no venue rows (events_online_has_no_venue); the old rows stay for history
    if (current.usingBackup) throw new Error('This event has switched to its backup venue, so its venues can no longer be changed.')
    if (wasHidden) check(await client.from('event_hidden_venues').delete().eq('event_id', eventId))
    update.venue_id = null
    update.backup_venue_id = null
  } else {
    // The venue as the organiser knows it: the hidden one, none yet, or the public one
    const known = current.hiddenVenue
      || { venue: current.venuePending || current.isOnline ? null : current.venue, backupVenue: current.backupVenue, isOutdoor: current.isOutdoor }
    const venue = changes.venue || null
    const isOutdoor = Boolean(venue) && Boolean(changes.isOutdoor)
    const backupVenue = isOutdoor ? changes.backupVenue : null
    const hideUntil = venue ? changes.venueRevealAt || null : null
    // isOutdoor is stored on the venue row, so changing it also needs a new venue row
    const outdoorChanged = Boolean(known.isOutdoor) !== isOutdoor
    const mainChanged = current.isOnline || wasHidden || !sameVenueOrNone(known.venue, venue) || outdoorChanged
    const backupChanged = wasHidden || (isOutdoor ? !sameVenue(known.backupVenue, backupVenue) : Boolean(known.backupVenue))
    if (current.usingBackup && (mainChanged || backupChanged || hideUntil)) {
      throw new Error('This event has switched to its backup venue, so its venues can no longer be changed.')
    }
    if (hideUntil) {
      // Saved after the event row; its trigger takes any public venue off the event
      hiddenToSave = { event_id: eventId, venue: venueJson(venue), backup_venue: venueJson(backupVenue), reveal_at: hideUntil }
    } else {
      if (wasHidden) check(await client.from('event_hidden_venues').delete().eq('event_id', eventId))
      if (mainChanged) update.venue_id = venue ? await insertVenueWith(client, venue, !isOutdoor) : null
      if (backupChanged || (mainChanged && !venue)) update.backup_venue_id = isOutdoor ? await insertVenueWith(client, backupVenue, true) : null
    }
  }

  // Becoming physical removes the saved link in the database (events_after_online_change)
  const rows = check(await client.from('events').update(update).eq('id', eventId).select('id'))
  if (!rows?.length) throw new Error('You can only edit events you organise.')

  try {
    if (hiddenToSave) check(await client.from('event_hidden_venues').upsert(hiddenToSave, { onConflict: 'event_id' }))
    if (changes.isOnline) await saveOnlineLinkWith(client, eventId, changes.onlineLink)
    await saveEventTagsWith(client, eventId, current.tags || [], changes.tags)
    await saveEventQuestionsWith(client, eventId, current.questions || [], changes.questions)
  } catch (error) {
    throw new Error(`The main event details were saved, but not everything: ${error.message} Press Save again to retry.`)
  }
}

export async function updateEvent(eventId, changes) {
  const myId = await requireUserId()
  const current = await getEvent(eventId)
  const rsvps = current.organiserId === myId || current.canManage ? await getRsvpsForEvent(eventId) : []
  await updateEventWith(supabase, { current, myId, rsvpCount: rsvps.length }, changes)
  return getEvent(eventId)
}

// Organiser toggles an event between public (published) and hidden (draft). Cancelled/completed are left alone.
export async function setEventPublished(eventId, published) {
  const myId = await requireUserId()
  const current = await getEvent(eventId)
  if (current.organiserId !== myId && !current.canManage) throw new Error('You can only publish or unpublish events you organise.')
  if (!['draft', 'published'].includes(current.status)) throw new Error(`A ${current.status} event can't be published or unpublished.`)
  const rows = check(await supabase.from('events').update({ status: published ? 'published' : 'draft' }).eq('id', eventId).select('id'))
  if (!rows?.length) throw new Error('You can only publish or unpublish events you organise.')
  return getEvent(eventId)
}

// Deleting the event also deletes its RSVPs, questions and tags (on delete cascade in the database)
export async function deleteEvent(eventId) {
  const event = await getEvent(eventId)
  if (!event.isMine && !event.canManage) throw new Error('Only event organisers can delete this event.')
  const rows = check(await supabase.from('events').delete().eq('id', eventId).select('id'))
  // RLS enforces organiser access for direct SDK requests too.
  if (rows.length === 0) throw new Error('Only event organisers can delete this event.')
}


// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

// The signed-in participant's profile: { id, name, email, interests }
export async function getUser() {
  const me = await getCurrentUser()
  if (!me) throw new Error('Please sign in first.')
  const profile = check(
    await supabase
      .from('profiles')
      .select('id, display_name, profile_interests(interests(slug))')
      .eq('id', me.id)
      .single(),
  )
  return {
    id: profile.id,
    name: profile.display_name,
    email: me.email, // emails live in Supabase Auth, not in profiles
    interests: profile.profile_interests.map((link) => link.interests.slug),
  }
}

// ---------------------------------------------------------------------------
// RSVPs — participant side (the database calls them "registrations")
// ---------------------------------------------------------------------------

// The signed-in participant's RSVPs, each with its event attached
export async function getMyRsvps() {
  const myId = await requireUserId()
  const rows = check(
    await supabase
      .from('registrations')
      .select(`*, registration_answers(question_id, answer), check_ins(checked_in_at,fraud_flag), event:events(${EVENT_COLUMNS})`)
      .eq('user_id', myId),
  )
  const withEvent = rows.filter((row) => row.event) // skip events we can no longer see
  const events = await toEventsWithCounts(withEvent.map((row) => row.event))

  return withEvent
    .map((row, i) => {
      const attendance = Array.isArray(row.check_ins) ? row.check_ins[0] : row.check_ins
      return { ...toRsvp(row), checkedInAt: attendance?.checked_in_at || null,
        attendanceVerified: !!attendance?.checked_in_at && attendance.fraud_flag === false, event: events[i] }
    })
    .sort((a, b) => new Date(a.event.startTime) - new Date(b.event.startTime))
}

// Caller-scoped bookmarks, including past events and events excluded from picks.
export async function getSavedEvents() {
  const myId = await requireUserId()
  const rows = []
  for (let offset = 0; ; ) {
    const page = check(await supabase.from('user_event_preferences')
      .select(`event_id,saved_at,event:events(${EVENT_COLUMNS})`)
      .eq('user_id', myId).eq('save_active', true).order('event_id')
      .range(offset, offset + 199))
    if (!Array.isArray(page)) throw new Error('Could not read saved events.')
    if (!page.length) break
    rows.push(...page)
    offset += page.length
  }
  const visible = rows.filter(row => row.event)
  const events = await toEventsWithCounts(visible.map(row => row.event))
  return events.map((event, index) => ({ ...event, saved: true, savedAt: visible[index].saved_at }))
    .sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt) || a.id.localeCompare(b.id))
}

export async function unsaveEvent(eventId) {
  await requireUserId()
  await recommendationApi.post(`/api/recommendations/${encodeURIComponent(eventId)}/preferences`, { action: 'unsave' })
}

// The SQL function register_for_event decides confirmed / pending / waitlisted,
// checks required questions, and refuses a second RSVP to the same event.
export async function createRsvpWith(client, myId, { eventId, name, answers }) {
  // { q1: 'yes', q2: '' } → [{ question_id: 'q1', answer: 'yes' }], leaving out blanks
  const answerList = Object.entries(answers)
    .filter(([, answer]) => String(answer).trim() !== '')
    .map(([questionId, answer]) => ({ question_id: questionId, answer }))

  let registration
  try {
    registration = check(
      await client.rpc('register_for_event', { p_event_id: eventId, p_answers: answerList }),
    )
  } catch (error) {
    // register_for_event rejects a duplicate active RSVP. If the original call committed but
    // its response was lost, return that row so a user retry observes success.
    if (!error.message?.includes('You already have an RSVP for this event')) throw error
    const existing = check(
      await client
        .from('registrations')
        .select('*, registration_answers(question_id, answer)')
        .eq('event_id', eventId)
        .eq('user_id', myId)
        .in('status', ['pending', 'confirmed', 'waitlisted', 'offered'])
        .maybeSingle(),
    )
    if (!existing) throw error
    const persistedAnswers = new Map(
      (existing.registration_answers || []).map((answer) => [answer.question_id, answer.answer]),
    )
    const answersMatch =
      persistedAnswers.size === answerList.length &&
      answerList.every(
        ({ question_id, answer }) =>
          persistedAnswers.has(question_id) &&
          JSON.stringify(persistedAnswers.get(question_id)) === JSON.stringify(answer),
      )
    if (!answersMatch) throw error
    registration = existing
  }

  // The organiser sees the name on the profile, so save it there if they typed a new one.
  // (Email can't be changed here: it's their login.)
  if (name) {
    check(await client.from('profiles').update({ display_name: name }).eq('id', myId))
  }

  return toRsvp(registration)
}

export async function createRsvp(rsvpData) {
  return createRsvpWith(supabase, await requireUserId(), rsvpData)
}

export async function cancelRsvp(rsvpId) {
  // cancel_registration works by event id, so look that up first
  const row = check(await supabase.from('registrations').select('event_id').eq('id', rsvpId).single())
  return toRsvp(check(await supabase.rpc('cancel_registration', { p_event_id: row.event_id })))
}

// accept = true → take the spot; accept = false → pass it to the next person
export async function respondToOffer(rsvpId, accept) {
  return toRsvp(
    check(
      await supabase.rpc('respond_to_offer', { p_registration_id: rsvpId, p_accept: accept }),
    ),
  )
}

// ---------------------------------------------------------------------------
// RSVPs — organiser side
// ---------------------------------------------------------------------------

// Every RSVP for one event, with name, email, answers, member flag, score and waitlist rank.
// event_registrations does this in one call, and returns nothing unless you organise the event.
export async function getRsvpsForEvent(eventId) {
  const rows = check(await supabase.rpc('event_registrations', { p_event_id: eventId }))
  return rows.map((row) => ({
    id: row.registration_id,
    eventId,
    userId: row.user_id,
    status: row.status,
    createdAt: row.created_at,
    offerExpiresAt: row.offer_expires_at,
    answers: row.answers,
    user: { id: row.user_id, name: row.display_name, email: row.email },
    isMember: row.is_member,
    score: {
      total: Number(row.score),
      parts: {
        member: row.is_member ? 1 : 0,
        interest: Number(row.interest_match),
        showUp: Number(row.show_up_rate),
      },
    },
    rank: row.waitlist_rank,
  }))
}

export async function approveRsvp(rsvpId) {
  return toRsvp(check(await supabase.rpc('approve_registration', { p_registration_id: rsvpId })))
}

export async function rejectRsvp(rsvpId) {
  return toRsvp(check(await supabase.rpc('reject_registration', { p_registration_id: rsvpId })))
}

// Organiser takes someone off the event after accepting them (or off the waitlist / an offer).
// Status 'rejected', not 'cancelled': the database counts a 'cancelled' close to the start as
// the PERSON's late cancel (lowers their score), but this was the organiser's decision.
// When a held spot is freed, a database trigger offers it to the top of the waitlist.
// RLS only lets the event's organisers change a registration's status.
export async function removeRsvp(rsvpId) {
  const rows = check(
    await supabase
      .from('registrations')
      .update({ status: 'rejected' })
      .eq('id', rsvpId)
      .in('status', ['confirmed', 'offered', 'waitlisted'])
      .select(),
  )
  // No row changed → not found, already closed, or not your event
  if (rows.length === 0) throw new Error('This RSVP could not be removed. It may already be closed.')
  return toRsvp(rows[0])
}

// Members get a higher waitlist score. RLS only lets you mark members of your OWN club.
export async function setMember(organiserId, userId, makeMember) {
  if (makeMember) {
    // ignoreDuplicates: marking someone who is already a member is not an error
    check(
      await supabase
        .from('organiser_members')
        .upsert({ organiser_id: organiserId, user_id: userId }, { ignoreDuplicates: true }),
    )
  } else {
    check(
      await supabase
        .from('organiser_members')
        .delete()
        .match({ organiser_id: organiserId, user_id: userId }),
    )
  }
}

// This simulation is available only through mockApi. Never turn it into a live write.
export async function expireOffersNow() {
  throw new Error('Offer expiry simulation is only available in demo mode.')
}

// Only the mock has demo data to reset
export function resetDemoData() {}
