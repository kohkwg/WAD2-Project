const supabase = require("./supabase");

/**
 * Express middleware. Checks the Supabase access token from the Vue client.
 * Header format: "Authorization: Bearer <access_token>".
 * Sends 401 if the token is missing or not valid.
 * Sets req.user and req.accessToken for the next handler.
 */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({
    error: "Missing token"
  });
  const {
    data,
    error
  } = await supabase.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({
    error: "Invalid token"
  });
  req.user = data.user;
  req.accessToken = token; // Routes use this token to query as this user (see userSupabase.js).
  next();
}
module.exports = requireAuth;
