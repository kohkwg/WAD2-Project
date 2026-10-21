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

// Venues are their own table, so save the venue first and link the event to its id
async function insertVenue(venue, isIndoor) {
  const row = check(
    await supabase
      .from('venues')
      .insert({
        name: venue.name,
        address: venue.address,
        postal_code: venue.postal || null,
        latitude: venue.lat,
        longitude: venue.lng,
        is_indoor: isIndoor,
      })
      .select('id')
      .single(),
  )
  return row.id
}

// eventData is the Create Event form: { title, description, tags, startTime, endTime,
// capacity, venue, isOutdoor, backupVenue, requiresApproval, questions }
export async function createEvent(eventData) {
  const venueId = await insertVenue(eventData.venue, !eventData.isOutdoor)
  const backupVenueId = eventData.backupVenue ? await insertVenue(eventData.backupVenue, true) : null

  // organiser_id is filled in by the database with the signed-in user (auth.uid()),
  // and a trigger adds them to the event's team as its organiser.
  const event = check(
    await supabase
      .from('events')
      .insert({
        title: eventData.title,
        description: eventData.description,
        starts_at: eventData.startTime,
        ends_at: eventData.endTime,
        capacity: eventData.capacity,
        requires_approval: eventData.requiresApproval,
        venue_id: venueId,
        backup_venue_id: backupVenueId,
        status: 'published',
      })
      .select('id')
      .single(),
  )

  // Tags and questions are separate tables. If saving them fails, delete the half-made event
  // so the organiser can simply try again.
  try {
    if (eventData.tags.length > 0) {
      // Tags are stored as interest ids, so look the ids up from the slugs ('music' → 3)
      const interests = check(
        await supabase.from('interests').select('id').in('slug', eventData.tags),
      )
      check(
        await supabase
          .from('event_interests')
          .insert(interests.map((i) => ({ event_id: event.id, interest_id: i.id }))),
      )
    }

    if (eventData.questions.length > 0) {
      check(
        await supabase.from('event_questions').insert(
          eventData.questions.map((q, index) => ({
            event_id: event.id,
            prompt: q.text,
            type: q.type === 'yesno' ? 'yes_no' : 'short_text',
            required: q.required,
            position: index,
          })),
        ),
      )
    }
  } catch (error) {
    await supabase.from('events').delete().eq('id', event.id)
    throw error
  }

  return event
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
      .select(`*, registration_answers(question_id, answer), event:events(${EVENT_COLUMNS})`)
      .eq('user_id', myId),
  )
  const withEvent = rows.filter((row) => row.event) // skip events we can no longer see
  const events = await toEventsWithCounts(withEvent.map((row) => row.event))

  return withEvent
    .map((row, i) => ({ ...toRsvp(row), event: events[i] }))
    .sort((a, b) => new Date(a.event.startTime) - new Date(b.event.startTime))
}

// The SQL function register_for_event decides confirmed / pending / waitlisted,
// checks required questions, and refuses a second RSVP to the same event.
export async function createRsvp({ eventId, name, answers }) {
  const myId = await requireUserId()

  // { q1: 'yes', q2: '' } → [{ question_id: 'q1', answer: 'yes' }], leaving out blanks
  const answerList = Object.entries(answers)
    .filter(([, answer]) => String(answer).trim() !== '')
    .map(([questionId, answer]) => ({ question_id: questionId, answer }))

  const registration = check(
    await supabase.rpc('register_for_event', { p_event_id: eventId, p_answers: answerList }),
  )

  // The organiser sees the name on the profile, so save it there if they typed a new one.
  // (Email can't be changed here: it's their login.)
  if (name) {
    check(await supabase.from('profiles').update({ display_name: name }).eq('id', myId))
  }

  return toRsvp(registration)
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

// DEMO ONLY: expire this event's open offers now instead of waiting 24 hours.
// (In real use, a scheduled job in the database expires them every 5 minutes.)
// A database trigger then offers each freed spot to the next person on the waitlist.
export async function expireOffersNow(eventId) {
  check(
    await supabase
      .from('registrations')
      .update({ status: 'expired' })
      .eq('event_id', eventId)
      .eq('status', 'offered'),
  )
}

// Only the mock has demo data to reset
export function resetDemoData() {}
