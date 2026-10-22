const { createClient } = require("@supabase/supabase-js");

// Service-role key: SERVER ONLY. Never put this in the Vue client.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false } }
);

module.exports = supabase;
