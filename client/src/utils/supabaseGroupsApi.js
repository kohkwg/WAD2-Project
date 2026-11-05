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
// The existing group RPCs return public previews for guests and personalised results after sign-in.
export async function getGroups() {
  return withEvents(await rpc('group_list'))
}

// One group with its plan. A private group needs its invite token unless you're already in it.
export async function getGroup({ id, token } = {}) {
  const view = await rpc('group_view', { p_group_id: token ? null : id, p_token: token || null })
  const [withEvent] = await withEvents([view])
  const member = view.myStatus === 'host' || view.myStatus === 'confirmed'
  return { ...withEvent, plan: member ? await getPlan(view.id) : null }
}

export async function createGroup({ eventId, note = '', capacity = 4, joinMode = 'open', visibility = 'public', inviteIds = [] }) {
  await requireUser()
  const id = await rpc('create_group', {
    p_event_id: eventId, p_note: note, p_capacity: Number(capacity), p_join_mode: joinMode, p_visibility: visibility, p_invite_ids: inviteIds,
  })
  const [view] = await withEvents([await rpc('group_view', { p_group_id: id, p_token: null })])
  return view
}

// Join a group, with an optional message for the host. Friends-only groups need the link,
// an invite or friendship with the host. Returns the new RSVP.
export async function joinGroup({ id, token, message = '' }) {
  await requireUser()
  const row = await rpc('join_group', { p_group_id: id, p_token: token || null, p_note: message || null })
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

// Invites from friends waiting for you (the invite id is the group id in live mode)
export async function getGroupInvites() {
  if (!(await getCurrentUser())) return []
  const rows = await rpc('group_invites_list')
  const groups = await withEvents(rows.map((r) => r.group))
  return rows.map((r, i) => ({ id: r.id, from: r.from, createdAt: r.createdAt, group: groups[i] }))
}

// Accept (join straight away, if there's a spot) or decline
export async function respondGroupInvite(inviteId, accept) {
  await requireUser()
  const row = await rpc('respond_group_invite', { p_group_id: inviteId, p_accept: Boolean(accept) })
  return row?.id ? { id: row.id, eventId: row.event_id, status: row.status } : null
}

// The host changes who can see or join the group, its spots or its note
export async function updateGroupSettings(groupId, { visibility, joinMode, capacity, note = '' }) {
  await requireUser()
  await rpc('update_group_settings', { p_group_id: groupId, p_visibility: visibility, p_join_mode: joinMode, p_capacity: Number(capacity), p_note: note })
  const [view] = await withEvents([await rpc('group_view', { p_group_id: groupId, p_token: null })])
  return view
}

// The host deletes the group; its people get a notice
export async function deleteGroup(groupId) {
  await requireUser()
  await rpc('delete_group', { p_group_id: groupId })
}

export async function getGroupNotices() {
  if (!(await getCurrentUser())) return []
  return rpc('group_notices_list')
}
export async function dismissGroupNotice(noticeId) {
  await requireUser()
  await rpc('dismiss_group_notice', { p_notice_id: noticeId })
}

// For an event's organiser: who among its RSVPs is going with a Go together group
export async function getEventGroupMembers(eventId) {
  await requireUser()
  const rows = await rpc('event_group_members', { p_event_id: eventId })
  return rows.map((r) => ({ userId: r.user_id, groupId: r.group_id, hostName: r.host_name, groupSize: r.group_size, isHost: r.is_host }))
}
