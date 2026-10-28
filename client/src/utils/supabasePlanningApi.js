// LIVE BACKEND for OpenJio planning. Not built yet: the planning migration
// (supabase/migrations/20261028000000_openjio_planning.sql) has not been applied to the
// hosted project. Every call fails clearly instead of silently falling back to demo data.
// Use VITE_USE_MOCK=true to click through the planning pages in the meantime.

function notBuilt() {
  return Promise.reject(new Error('Hangouts are not available in live mode yet. Run the app with VITE_USE_MOCK=true to try the demo.'))
}

export const getDeals = notBuilt
export const getExternalEvents = notBuilt
export const getPlaces = notBuilt
export const getHangouts = notBuilt
export const getHangout = notBuilt
export const createHangout = notBuilt
export const joinHangout = notBuilt
export const saveAvailability = notBuilt
export const lockSlot = notBuilt
export const setArrival = notBuilt
export const voteOnStop = notBuilt
export const suggestSlots = notBuilt
export const generateItineraryFor = notBuilt
export const applyVotes = notBuilt
export const lookUpArrival = notBuilt
export function resetPlanningDemoData() {}
