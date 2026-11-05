const {
  createClient
} = require("@supabase/supabase-js");

/**
 * Creates a client that acts as the signed-in user, so RLS and auth.uid() apply to every query.
 * Without a token, the client acts as the anonymous role.
 * Use ./supabase only for work that needs the service-role key.
 * @param {string} [accessToken] Supabase access token from requireAuth.
 */
function supabaseForUser(accessToken) {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
    ...(accessToken ? {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    } : {}),
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
module.exports = supabaseForUser;
