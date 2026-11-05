const supabase = require("./supabase");

// verifies the supabase access token sent by the vue client:
//   authorization: bearer <access_token>

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
  req.accessToken = token; // routes query as this user (see usersupabase.js)
  next();
}
module.exports = requireAuth;
