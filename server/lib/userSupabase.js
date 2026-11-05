const {
  createClient
} = require("@supabase/supabase-js");

// a client that acts as the signed-in user, so rls and auth.uid() apply to every
// query (project info h2). the service-role client in ./supabase is only used to
// verify the token in requireauth.

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
