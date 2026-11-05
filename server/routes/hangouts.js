const express = require("express");
const supabaseForUser = require("../lib/userSupabase");
// Loaded on first request: requireAuth creates the server client from .env.
const requireAuth = (req, res, next) => require("../lib/requireAuth")(req, res, next);
const { hangoutTime, previewTime, readHangoutRows } = require("../services/hangoutTime");

// Live hangout time tools. The caller must be the host or a confirmed member; that is
// checked as the caller (RLS and auth.uid() apply) before any server-key read.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function createHangoutsRouter({ auth = requireAuth, userClient = supabaseForUser, adminClient = () => require("../lib/supabase"), readRows = readHangoutRows } = {}) {
  const router = express.Router();

  async function memberRows(req, res) {
    if (!UUID.test(req.params.id)) { res.status(400).json({ error: "invalid", message: "Unknown hangout." }); return null; }
    const { data: isMember, error } = await userClient(req.accessToken).rpc("is_hangout_member", { p_event_id: req.params.id });
    if (error) { res.status(503).json({ error: "unavailable", message: "Hangouts aren't set up on this database yet." }); return null; }
    if (!isMember) { res.status(403).json({ error: "forbidden", message: "Join this hangout to see and share times." }); return null; }
    return readRows(adminClient(), req.params.id);
  }
  const fail = (res, error) => res.status(error.status || 500).json({ error: error.status ? "invalid" : "internal", message: error.status ? error.message : "Couldn't load this hangout's times." });

  router.get("/:id/time", auth, async (req, res) => {
    try {
      const rows = await memberRows(req, res);
      if (!rows) return;
      const minMinutes = req.query.minMinutes === "60" ? 60 : undefined;
      res.json(await hangoutTime(rows, req.user.id, { minMinutes }));
    } catch (error) { fail(res, error); }
  });

  router.post("/:id/preview-slot", auth, async (req, res) => {
    const start = Number(req.body?.start), end = Number(req.body?.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return res.status(400).json({ error: "invalid", message: "Choose a start and an end." });
    try {
      const rows = await memberRows(req, res);
      if (!rows) return;
      res.json(await previewTime(rows, { start, end }));
    } catch (error) { fail(res, error); }
  });

  return router;
}

module.exports = createHangoutsRouter();
module.exports.createHangoutsRouter = createHangoutsRouter;
