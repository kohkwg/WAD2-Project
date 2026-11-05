import { supabase } from './supabase'

// Asks the database whether a username is free (docs/sql/username-available-draft.sql).
// Returns true (free), false (taken) or null (could not tell, e.g. the function is not installed
// yet or the network failed). Callers treat null as "say nothing"; saving still catches duplicates.
export async function usernameAvailable(handle) {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('username_available', { p_username: handle })
  if (error || typeof data !== 'boolean') return null
  return data
}
