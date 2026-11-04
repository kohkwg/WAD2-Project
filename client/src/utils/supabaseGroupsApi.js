// Go together groups in live mode. Same functions and shapes as the group section of
// mockApi.js; the rules are enforced by the SECURITY DEFINER functions in
// supabase/migrations/20261104142907_go_together_groups.sql.
import { supabase } from './supabase.js'
import { getCurrentUser, getEventsByIds } from './supabaseApi.js'
import { livePlanView, suggestionFrom } from './groups.js'

// Shown when the group functions aren't in the database yet (migration not pushed)
const NOT_READY = 'Go together isn’t set up in the live app yet. Try it in demo mode.'

async function rpc(name, params) {
  const { data, error } = await supabase.rpc(name, params)
  if (error) {
    if (['PGRST202', '42883', '42P01'].includes(error.code)) throw new Error(NOT_READY)
    throw new Error(error.message || 'Something went wrong. Please try again.')
  }
  return data
}

async function requireUser() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Sign in to use Go together.')
  return user
}

// The group pages show the official event too (time, venue, spots), like the demo
async function withEvents(views) {
  const events = await getEventsByIds(views.map((v) => v.eventId))
  const byId = new Map(events.map((e) => [e.id, { ...e, category: e.tags?.[0] || '' }]))
  return views.map((v) => ({ ...v, event: byId.get(v.eventId) || null }))
}

async function getPlan(groupId) {
  const user = await requireUser()
  return livePlanView(await rpc('group_plan', { p_group_id: groupId }), user.id)
}

// Public upcoming groups, plus private groups you host or belong to; soonest first.
// Signed-out visitors see none (member names are only shown to signed-in people).
export async function getGroups() {
  if (!(await getCurrentUser())) return []
  return withEvents(await rpc('group_list'))
}

// One group with its plan. A private group needs its invite token unless you're already in it.
export async function getGroup({ id, token } = {}) {
  await requireUser()
  const view = await rpc('group_view', { p_group_id: token ? null : id, p_token: token || null })
  const [withEvent] = await withEvents([view])
  const member = view.myStatus === 'host' || view.myStatus === 'confirmed'
  return { ...withEvent, plan: member ? await getPlan(view.id) : null }
}

export async function createGroup({ eventId, note = '', capacity = 4, joinMode = 'open', visibility = 'public' }) {
  await requireUser()
  const id = await rpc('create_group', {
    p_event_id: eventId, p_note: note, p_capacity: Number(capacity), p_join_mode: joinMode, p_visibility: visibility,
  })
  const [view] = await withEvents([await rpc('group_view', { p_group_id: id, p_token: null })])
  return view
}

// Join a group. Private groups need the invite token. Returns the new RSVP.
export async function joinGroup({ id, token }) {
  await requireUser()
  const row = await rpc('join_group', { p_group_id: id, p_token: token || null })
  return { id: row.id, eventId: row.event_id, userId: row.user_id, status: row.status, createdAt: row.created_at }
}

export async function getGroupComments(groupId) {
  await requireUser()
  const rows = await rpc('group_messages_list', { p_group_id: groupId })
  return rows.map((r) => ({ id: r.id, groupId: r.group_id, userId: r.user_id, text: r.body, createdAt: r.created_at, name: r.name, mine: r.mine }))
}

export async function addGroupComment(groupId, text) {
  const user = await requireUser()
  const id = await rpc('add_group_message', { p_group_id: groupId, p_body: String(text || '') })
  return { id, groupId, userId: user.id, text: String(text || '').trim(), createdAt: new Date().toISOString() }
}

export async function deleteGroupComment(commentId) {
  await requireUser()
  await rpc('delete_group_message', { p_message_id: commentId })
}

// Suggest a place or deal for before or after the event (members only)
export async function suggestGroupStop(groupId, slot, item) {
  await requireUser()
  await rpc('suggest_group_idea', { p_group_id: groupId, p_slot: slot, p: suggestionFrom(item) })
  return getPlan(groupId)
}

// Save the 15-minute cells you're free for one side of the event ([] means none of them)
export async function setGroupAvailability(groupId, slot, cells) {
  await requireUser()
  await rpc('set_group_availability', { p_group_id: groupId, p_slot: slot, p_cells: cells })
  return getPlan(groupId)
}

// Mark or unmark a suggestion as one you're keen on
export async function voteGroupStop(groupId, slot, suggestionId, keen) {
  await requireUser()
  await rpc('vote_group_idea', { p_idea_id: suggestionId, p_keen: Boolean(keen) })
  return getPlan(groupId)
}

// The host picks one suggestion for a slot (or clears it with null)
export async function chooseGroupStop(groupId, slot, suggestionId) {
  await requireUser()
  await rpc('choose_group_idea', { p_group_id: groupId, p_slot: slot, p_idea_id: suggestionId || null })
  return getPlan(groupId)
}

// Remove your own suggestion (the host can remove any)
export async function removeGroupStop(groupId, slot, suggestionId) {
  await requireUser()
  await rpc('remove_group_idea', { p_idea_id: suggestionId })
  return getPlan(groupId)
}
