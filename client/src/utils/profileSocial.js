import { supabase } from './supabase.js';
import { USING_SUPABASE } from './api.js';
import { watchSocialUpdates } from './socialUpdates.js';

/** Starts live social updates in live mode. In demo mode, it returns a stop function that does nothing. */
export const subscribeSocialUpdates = (onChange, isActive) => USING_SUPABASE && supabase ? watchSocialUpdates(supabase, onChange, isActive) : () => {};
