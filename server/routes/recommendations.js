const express = require("express");
const supabaseForUser = require("../lib/userSupabase");
const requireAuth = require("../lib/requireAuth");
const { rankEvents } = require("../services/rankEvents");
const { bumpInterestWeights } = require("../services/interestWeights");
const { haversineKm } = require("../services/recommendation");

const router = express.Router();

// GET /api/recommendations?limit=8
router.get("/", requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 8, 24);
    const supabase = supabaseForUser(req.accessToken);

    const [{ data: profile, error: profileErr }, { data: events, error: evErr }, { data: registrations, error: regErr }] =
      await Promise.all([
        supabase.from("profiles").select("*").eq("id", req.user.id).maybeSingle(),
        supabase
          .from("events_with_counts")
          .select("*")
          .gt("start_time", new Date().toISOString()),
        // Events the user already holds or is queued for are not recommended again
        supabase
          .from("registrations")
          .select("event_id")
          .eq("user_id", req.user.id)
          .in("status", ["pending", "confirmed", "waitlisted", "offered"]),
      ]);

    if (profileErr) throw profileErr;
    if (evErr) throw evErr;
    if (regErr) throw regErr;

    const excludeEventIds = new Set((registrations || []).map((r) => r.event_id));
    const results = rankEvents(events || [], profile || {}, { limit, excludeEventIds })
      .map(({ event, score, reason }) => {
        // Keep the flat card contract, including its optional distance label.
        const km = profile?.lat != null && profile?.lng != null && event.lat != null && event.lng != null
          ? haversineKm(profile.lat, profile.lng, event.lat, event.lng) : null;
        return { ...event, score, reason, distance_km: km != null ? Math.round(km * 10) / 10 : null };
      });

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

    const supabase = supabaseForUser(req.accessToken);
    // Event tags are interests.slug values, the same keys as interest_weights
    const { data: event, error: eventError } = await supabase
      .from("events_with_counts").select("tags").eq("id", eventId).single();
    if (eventError) throw eventError;
    const { data: profile, error: profileError } = await supabase
      .from("profiles").select("interest_weights").eq("id", req.user.id).maybeSingle();
    if (profileError) throw profileError;

    const next = bumpInterestWeights(
      profile?.interest_weights,
      event?.tags || [],
      type
    );

    // update, not upsert: profiles rows come from the sign-up trigger and RLS only
    // allows users to update their own row
    const { error } = await supabase
      .from("profiles")
      .update({ interest_weights: next })
      .eq("id", req.user.id);
    if (error) throw error;

    res.json({ interest_weights: next });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update interests" });
  }
});

module.exports = router;
