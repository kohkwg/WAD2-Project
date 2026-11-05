import { supabase } from './supabase.js'
import { USING_SUPABASE } from './api.js'
import { watchSocialUpdates } from './socialUpdates.js'
export const subscribeSocialUpdates = (onChange, isActive) =>
  USING_SUPABASE && supabase ? watchSocialUpdates(supabase, onChange, isActive) : () => {}
