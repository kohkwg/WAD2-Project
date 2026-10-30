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

function check({ data, error }) {
  if (error) throw new Error(error.message)
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
  return { id: data.session.user.id, email: data.session.user.email }
}

async function requireUserId() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Please sign in first.')
  return user.id
}

export async function signIn(email, password) {
  check(await supabase.auth.signInWithPassword({ email, password }))
}

// The database makes a profile for every new account (trigger handle_new_user);
// `full_name` is what it uses as their display name.
// Returns true if they must click a link in their email before they can sign in.
export async function signUp(name, email, password) {
  const data = check(
    await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } }),
  )
  return data.session === null
}

export async function signOut() {
  check(await supabase.auth.signOut())
}

// Runs callback(user or null) whenever someone signs in or out. Returns a function to stop.
export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(session ? { id: session.user.id, email: session.user.email } : null)
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
    // The database stores indoor/outdoor on the venue, not the event
    isOutdoor: row.venue ? !row.venue.is_indoor : false,
    // If the venue was deleted, show a placeholder instead of breaking every page
    venue: toVenue(row.using_backup ? row.backup_venue : row.venue) || { name: 'Venue to be confirmed', address: '' },
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
async function toEventsWithCounts(rows) {
  if (rows.length === 0) return []
  const myId = (await getCurrentUser())?.id
  const counts = check(
    await supabase.rpc('event_availability', { p_event_ids: rows.map((row) => row.id) }),
  )
  return rows.map((row) =>
    toEvent(
      row,
      counts.find((c) => c.event_id === row.id),
      myId,
    ),
  )
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
  const [event] = await toEventsWithCounts([row])
  const user = await getCurrentUser()
  event.isOnTeam = user ? Boolean(check(await supabase.rpc('is_event_staff', { p_event_id: eventId }))) : false
  return event
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
  const rows = check(
    await supabase
      .from('events')
      .select(EVENT_COLUMNS)
      .eq('organiser_id', myId)
      .order('starts_at'),
  )
  return toEventsWithCounts(rows)
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
  const payload = {
    title: eventData.title,
    description: eventData.description,
    startTime: eventData.startTime,
    endTime: eventData.endTime,
    capacity: eventData.capacity,
    requiresApproval: eventData.requiresApproval,
    isOutdoor: eventData.isOutdoor,
    venue: venuePayload(eventData.venue),
    backupVenue: venuePayload(eventData.backupVenue),
    tags: eventData.tags,
    questions: eventData.questions.map(({ text, type, required }) => ({ text, type, required })),
  }
  if (eventData.coverImageUrl) payload.coverImageUrl = eventData.coverImageUrl
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
  return createEventWith(supabase, eventData)
}

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
  if (current.organiserId !== myId) throw new Error('You can only edit events you organise.')
  if (new Date(current.startTime).getTime() <= Date.now()) {
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
  }
  // isOutdoor is stored on the venue row, so changing it also needs a new venue row
  const outdoorChanged = Boolean(current.isOutdoor) !== Boolean(changes.isOutdoor)
  const mainChanged = !sameVenue(current.venue, changes.venue) || outdoorChanged
  const backupChanged = changes.isOutdoor ? !sameVenue(current.backupVenue, changes.backupVenue) : Boolean(current.backupVenue)
  if (current.usingBackup && (mainChanged || backupChanged)) {
    throw new Error('This event has switched to its backup venue, so its venues can no longer be changed.')
  }
  if (mainChanged) update.venue_id = await insertVenueWith(client, changes.venue, !changes.isOutdoor)
  if (backupChanged) update.backup_venue_id = changes.isOutdoor ? await insertVenueWith(client, changes.backupVenue, true) : null

  const rows = check(await client.from('events').update(update).eq('id', eventId).select('id'))
  if (!rows?.length) throw new Error('You can only edit events you organise.')

  try {
    await saveEventTagsWith(client, eventId, current.tags || [], changes.tags)
    await saveEventQuestionsWith(client, eventId, current.questions || [], changes.questions)
  } catch (error) {
    throw new Error(`The main event details were saved, but not everything: ${error.message} Press Save again to retry.`)
  }
}

export async function updateEvent(eventId, changes) {
  const myId = await requireUserId()
  const current = await getEvent(eventId)
  const rsvps = current.organiserId === myId ? await getRsvpsForEvent(eventId) : []
  await updateEventWith(supabase, { current, myId, rsvpCount: rsvps.length }, changes)
  return getEvent(eventId)
}

// Deleting the event also deletes its RSVPs, questions and tags (on delete cascade in the database)
export async function deleteEvent(eventId) {
  const rows = check(await supabase.from('events').delete().eq('id', eventId).select('id'))
  // The database hides events you don't organise, so "nothing deleted" means you weren't allowed
  if (rows.length === 0) throw new Error('You can only delete events you organise.')
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
      .select(`*, registration_answers(question_id, answer), check_ins(checked_in_at), event:events(${EVENT_COLUMNS})`)
      .eq('user_id', myId),
  )
  const withEvent = rows.filter((row) => row.event) // skip events we can no longer see
  const events = await toEventsWithCounts(withEvent.map((row) => row.event))

  return withEvent
    .map((row, i) => ({ ...toRsvp(row), checkedInAt: (Array.isArray(row.check_ins) ? row.check_ins[0] : row.check_ins)?.checked_in_at || null, event: events[i] }))
    .sort((a, b) => new Date(a.event.startTime) - new Date(b.event.startTime))
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
