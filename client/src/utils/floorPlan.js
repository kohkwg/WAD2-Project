// Feature 6 (floor plan): Supabase calls for the editor and the read-only viewer.
//
// One floor plan per event, stored in public.floor_plans. The drawing lives in
// `layout` (jsonb): { version, objects: [boxes], people: [labelled markers] }, the
// same shapes editor.vue draws. RLS decides access: organisers edit, anyone who can
// see the event can read it (migration 20261023051511_floor_plan_public_view).

import { supabase } from './supabase'

async function call(request) {
  const { data, error } = await request
  if (error) throw new Error(error.message)
  return data
}

export const LAYOUT_VERSION = 1

// The event's floor plan, or null if none has been saved yet
export const getFloorPlan = (eventId) =>
  call(
    supabase
      .from('floor_plans')
      .select('id, name, width, height, layout, updated_at')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  )

// Only organisers may edit (the database enforces this too)
export const canEditFloorPlan = (eventId) =>
  call(supabase.rpc('is_event_organiser', { p_event_id: eventId }))

// Creates the plan on first save, then updates it in place
export function saveFloorPlan(eventId, { id, width, height, objects, people }) {
  const row = {
    width,
    height,
    layout: { version: LAYOUT_VERSION, objects, people },
  }
  if (id) {
    return call(supabase.from('floor_plans').update(row).eq('event_id', eventId).eq('id', id).select('id, updated_at').single())
  }
  return call(
    supabase
      .from('floor_plans')
      .insert({ ...row, event_id: eventId, name: 'Main floor plan' })
      .select('id, updated_at')
      .single(),
  )
}

export const getProgramme = (eventId) => call(supabase.from('programme_items').select('*').eq('event_id', eventId).order('starts_at').order('position'))
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
export const getFloorImages = (eventId) => call(supabase.from('floor_plan_assets').select('*').eq('event_id', eventId).eq('kind', 'finished').eq('is_public', true))
export const saveFloorImage = (eventId, floorPlanId, asset) => call(supabase.from('floor_plan_assets').upsert({ event_id: eventId, floor_plan_id: floorPlanId, kind: 'finished', is_public: true, ...asset }, { onConflict: 'id' }).select().single())
export async function floorImageRequest(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000'}/api/uploads/floor-plan${path}`, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}), ...options.headers } })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Image request failed.')
  return result
}
