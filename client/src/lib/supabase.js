import { createClient } from '@supabase/supabase-js'

// Timothy (Feature 5) may already have this file - keep only one copy in the repo.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
)
