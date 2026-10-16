import { createClient } from '@supabase/supabase-js'

// The two values come from client/.env (copy .env.example and fill it in).
// Vite only exposes variables starting with VITE_ to browser code.
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// No keys → the app runs on mock data instead (see api.js), rather than crashing on start-up
export const isSupabaseConfigured = Boolean(url && key)

// The publishable key is safe in the browser: Row Level Security in the database decides
// what each signed-in user may read and change. NEVER put the secret key in client code.
export const supabase = isSupabaseConfigured ? createClient(url, key) : null
