const { createClient } = require("@supabase/supabase-js");

// A client that acts as the signed-in user, so RLS and auth.uid() apply to every
// query (Project Info H2). The service-role client in ./supabase is only used to
// verify the token in requireAuth.
function supabaseForUser(accessToken) {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

module.exports = supabaseForUser;
