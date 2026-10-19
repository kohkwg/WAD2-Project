const express = require("express");
const supabase = require("../lib/supabase");
const requireAuth = require("../lib/requireAuth");
const { recommend, bumpInterestWeights } = require("../services/recommendation");

const router = express.Router();

// GET /api/recommendations?limit=8
router.get("/", requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 8, 24);

    const [{ data: profile }, { data: events, error: evErr }, { data: rsvps }] =
      await Promise.all([
        supabase.from("profiles").select("*").eq("id", req.user.id).maybeSingle(),
        supabase
          .from("events_with_counts")
          .select("*")
          .gt("start_time", new Date().toISOString()),
        supabase
          .from("rsvps")
          .select("event_id")
          .eq("user_id", req.user.id)
          .not("status", "in", "(cancelled,rejected)"),
      ]);

    if (evErr) throw evErr;

    const excludeEventIds = new Set((rsvps || []).map((r) => r.event_id));
    const results = recommend(events || [], profile || {}, { limit, excludeEventIds });

    res.json({ events: results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to build recommendations" });
  }
});

// POST /api/recommendations/interactions   { eventId, type: "rsvp" | "attend" }
// Gregory (RSVP) / Huxley (check-in) should call this after a successful RSVP / check-in.
router.post("/interactions", requireAuth, async (req, res) => {
  try {
    const { eventId, type } = req.body;
    if (!eventId || !["rsvp", "attend"].includes(type)) {
      return res.status(400).json({ error: "eventId and type (rsvp|attend) required" });
    }

    const { data: event } = await supabase
      .from("events").select("tags").eq("id", eventId).single();
    const { data: profile } = await supabase
      .from("profiles").select("interest_weights").eq("id", req.user.id).maybeSingle();

    const next = bumpInterestWeights(profile?.interest_weights, event?.tags, type);

    const { error } = await supabase
      .from("profiles")
      .upsert({ id: req.user.id, interest_weights: next });
    if (error) throw error;

    res.json({ interest_weights: next });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update interests" });
  }
});

module.exports = router;
