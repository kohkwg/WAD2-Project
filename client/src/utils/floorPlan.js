// Feature 6 (floor plan): Supabase calls for the editor and the read-only viewer.
//
// Floor plans are stored in public.floor_plans. The drawing lives in `layout`
// (jsonb): { version, objects: [boxes], people: [labelled markers] }, the same
// shapes editor.vue draws. RLS decides access: organisers edit, anyone who can see
// the event can read it (migration 20261023051511_floor_plan_public_view).

import { supabase } from './supabase'

async function call(request) {
  const { data, error } = await request
  if (error) throw new Error(error.message)
  return data
}

export const LAYOUT_VERSION = 1

// All floor plans for the event, oldest first for stable Plan 1 / Plan 2 tabs.
export const getFloorPlans = (eventId) =>
  call(
    supabase
      .from('floor_plans')
      .select('id, name, width, height, layout, updated_at')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true }),
  )

// The event's first floor plan, or null if none has been saved yet.
export const getFloorPlan = async (eventId) => (await getFloorPlans(eventId))[0] || null

// Only organisers may edit (the database enforces this too)
export const canEditFloorPlan = (eventId) =>
  call(supabase.rpc('is_event_organiser', { p_event_id: eventId }))

// Creates the plan on first save, then updates it in place
export function saveFloorPlan(eventId, { id, name, width, height, objects, people, venue, locked, background }) {
  const row = {
    name: String(name || 'Floor plan').trim(),
    width,
    height,
    layout: {
      version: LAYOUT_VERSION,
      objects,
      people,
      locked: Boolean(locked),
      background: background ? { assetId: background.assetId, key: background.key, name: String(background.name || ''), opacity: background.opacity, rotation: background.rotation || 0, scale: background.scale || 1 } : null,
      venue: venue ? { name: String(venue.name || '').trim(), address: String(venue.address || '').trim() } : null,
    },
  }
  if (id) {
    return call(supabase.from('floor_plans').update(row).eq('event_id', eventId).eq('id', id).select('id, name, width, height, layout, updated_at').single())
  }
  return call(
    supabase
      .from('floor_plans')
      .insert({ ...row, event_id: eventId })
      .select('id, name, width, height, layout, updated_at')
      .single(),
  )
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// A plan's programme: its own items plus event-level items (no plan), which come from
// the event planner, events created before plans, or items added before the first save.
export const getProgramme = (eventId, floorPlanId) => {
  const query = supabase.from('programme_items').select('*').eq('event_id', eventId)
  const scoped = UUID.test(floorPlanId || '') ? query.or(`floor_plan_id.is.null,floor_plan_id.eq.${floorPlanId}`) : query.is('floor_plan_id', null)
  return call(scoped.order('starts_at').order('position'))
}
export const saveProgrammeItem = (eventId, input) => {
  const { id, ...row } = input
  const query = id ? supabase.from('programme_items').update(row).eq('event_id', eventId).eq('id', id) : supabase.from('programme_items').insert({ ...row, event_id: eventId })
  return call(query.select().single())
}
export const deleteProgrammeItem = (eventId, id) => call(supabase.from('programme_items').delete().eq('event_id', eventId).eq('id', id).select('id').single())
export const getPlanMembers = (eventId) => call(supabase.from('event_members').select('user_id, member_role, profiles!event_members_user_id_fkey(display_name)').eq('event_id', eventId))
export const getHelperPlacements = (eventId) => call(supabase.from('helper_placements').select('*').eq('event_id', eventId))
export const saveHelperPlacement = (eventId, input) => {
  const { id, ...row } = input
  const query = id ? supabase.from('helper_placements').update(row).eq('event_id', eventId).eq('id', id) : supabase.from('helper_placements').insert({ ...row, event_id: eventId })
  return call(query.select().single())
}
export const deleteHelperPlacement = (eventId, id) => call(supabase.from('helper_placements').delete().eq('event_id', eventId).eq('id', id).select('id').single())
export const getFloorImages = (eventId, floorPlanId) => {
  if (!floorPlanId) return Promise.resolve([])
  return call(supabase.from('floor_plan_assets').select('*').eq('event_id', eventId).eq('floor_plan_id', floorPlanId).eq('kind', 'finished').eq('is_public', true))
}
export const saveFloorImage = (eventId, floorPlanId, asset) => call(supabase.from('floor_plan_assets').upsert({ event_id: eventId, floor_plan_id: floorPlanId, kind: 'finished', is_public: true, ...asset }, { onConflict: 'id' }).select().single())
export async function floorImageRequest(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000'}/api/uploads/floor-plan${path}`, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}), ...options.headers } })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Image request failed.')
  return result
}

// Plan background: an editor image (kind 'object') uploaded to R2. The asset row lets
// deleting it queue the file for cleanup; participants read the key from the layout.
export async function uploadPlanBackground(eventId, floorPlanId, file, signal) {
  const ticket = await floorImageRequest('', { method: 'POST', body: JSON.stringify({ eventId, floorPlanId, kind: 'background', filename: file.name, contentType: file.type, size: file.size }) })
  const response = await fetch(ticket.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file, signal })
  if (!response.ok) throw new Error('Image upload failed. Choose the image again to retry.')
  const row = await call(supabase.from('floor_plan_assets').insert({ event_id: eventId, floor_plan_id: floorPlanId, kind: 'object', is_public: false, name: file.name, r2_key: ticket.key }).select('id, name, r2_key').single())
  return { assetId: row.id, key: row.r2_key, name: row.name }
}
export const deleteFloorAsset = (eventId, id) => call(supabase.from('floor_plan_assets').delete().eq('event_id', eventId).eq('id', id).eq('kind', 'object').select('id').maybeSingle())
