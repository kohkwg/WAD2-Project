const express = require("express");
const { createOneMapRouting, parsePoint } = require("../services/onemapRoute");

// GET /api/route?from=lat,lng&to=lat,lng&mode=pt|walk&depart=ISO
// Hangout late-join travel. Public like the map itself, but rate limited and limited to
// Singapore coordinates; the OneMap credentials never leave the server. When OneMap
// is unconfigured or fails, the client shows its own clearly labelled estimate.
const RATE_LIMIT = 120;
const WINDOW_MS = 60 * 1000;

function createRouteRouter({ routing = createOneMapRouting(), now = Date.now } = {}) {
  const router = express.Router();
  const hits = new Map();

  router.get("/", async (req, res) => {
    const ip = req.ip || "unknown";
    const recent = (hits.get(ip) || []).filter(at => now() - at < WINDOW_MS);
    if (recent.length >= RATE_LIMIT) return res.status(429).json({ error: "rate_limited", message: "Too many route requests. Try again in a minute." });
    recent.push(now());
    hits.set(ip, recent);
    if (hits.size > 10000) hits.delete(hits.keys().next().value);

    const from = parsePoint(req.query.from);
    const to = parsePoint(req.query.to);
    const mode = req.query.mode === "walk" ? "walk" : req.query.mode === "pt" || req.query.mode === undefined ? "pt" : null;
    const departMs = req.query.depart === undefined ? now() : Date.parse(req.query.depart);
    if (!from || !to || !mode) return res.status(400).json({ error: "invalid", message: "Give Singapore coordinates as lat,lng and mode pt or walk." });
    if (!Number.isFinite(departMs) || departMs < now() - 24 * 60 * 60 * 1000 || departMs > now() + 30 * 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: "invalid", message: "The departure time must be within the next 30 days." });
    }
    try {
      res.json(await routing.route({ from, to, mode, departMs }));
    } catch (error) {
      if (error.code === "configuration") return res.status(503).json({ error: "configuration", message: "Live routing is not set up on this server." });
      res.status(503).json({ error: "unavailable", message: "Live routing is unavailable right now." });
    }
  });

  return router;
}

module.exports = createRouteRouter();
module.exports.createRouteRouter = createRouteRouter;
