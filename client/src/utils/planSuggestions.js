// Automatic event planner, browser side: event-title suggestions straight from the
// database (row-level security decides which events are visible) and the call to the
// Express plan-suggestion route. Live Supabase mode only.

import { supabase } from './supabase'
import { USING_SUPABASE, getCurrentUser, createTask } from './api'
import { saveProgrammeItem } from './floorPlan'
import { applyPlan, likePattern, rankTitleSuggestions } from './planSuggestModel'

export const PLANNER_AVAILABLE = Boolean(USING_SUPABASE && supabase)

// Event names matching what the organiser is typing: [{ title, kind: 'own' | 'community' }]
export async function searchEventTitles(query, signal) {
  if (!PLANNER_AVAILABLE) return []
  const user = await getCurrentUser().catch(() => null)
  let request = supabase
    .from('events')
    .select('title, organiser_id, starts_at')
    .in('status', ['published', 'completed'])
    .ilike('title', likePattern(query))
    .order('starts_at', { ascending: false })
    .limit(40)
  if (signal) request = request.abortSignal(signal)
  const { data, error } = await request
  if (error) throw new Error(error.message)
  return rankTitleSuggestions(data, query, user?.id)
}

const apiBase = () => import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000'

// Programme and task suggestions for a new event, built on the server from past events.
// input: { title, description, tags, capacity, startsAt, endsAt }
export async function fetchPlanSuggestion(input, signal) {
  if (!PLANNER_AVAILABLE) throw new Error('Plan suggestions need a live connection.')
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Sign in to generate a plan.')
  const response = await fetch(`${apiBase()}/api/plan-suggestions`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(input),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || 'Could not generate a plan. Please try again.')
  return {
    source: body?.source || 'none',
    basedOn: Array.isArray(body?.basedOn) ? body.basedOn : [],
    programme: Array.isArray(body?.programme) ? body.programme : [],
    tasks: Array.isArray(body?.tasks) ? body.tasks : [],
    confidence: Number(body?.confidence) || 0,
  }
}

// Adds an accepted plan to the event just created. Tasks carry their own request ids,
// so a retried task is recognised rather than duplicated.
export function addPlanToEvent(eventId, plan, dates, progress) {
  return applyPlan(plan, dates, progress, {
    addProgrammeItem: (item) => saveProgrammeItem(eventId, { ...item, floor_plan_id: null }),
    addTask: (task) => createTask(eventId, { title: task.title, notes: task.notes || '', requestId: task.requestId }),
  })
}
