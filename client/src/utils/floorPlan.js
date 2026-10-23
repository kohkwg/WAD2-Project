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
    return call(supabase.from('floor_plans').update(row).eq('id', id).select('id, updated_at').single())
  }
  return call(
    supabase
      .from('floor_plans')
      .insert({ ...row, event_id: eventId, name: 'Main floor plan' })
      .select('id, updated_at')
      .single(),
  )
}
