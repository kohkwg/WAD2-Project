const {
  createClient
} = require("@supabase/supabase-js");

// service-role key: server only. never put this in the vue client.

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: {
    persistSession: false
  }
});
module.exports = supabase;
