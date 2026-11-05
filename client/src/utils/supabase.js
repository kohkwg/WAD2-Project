import { createClient } from '@supabase/supabase-js';

//keys

const url = import.meta.env?.VITE_SUPABASE_URL;

const key = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY;

// no keys → the app runs on mock data instead (see api.js), rather than crashing on start-up

export const isSupabaseConfigured = Boolean(url && key);

// the publishable key is safe in the browser: row level security in the database decides
// what each signed-in user may read and change. never put the secret key in client code.

export const supabase = isSupabaseConfigured ? createClient(url, key) : null;
