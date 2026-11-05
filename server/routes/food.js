const express = require("express");
const { createFoodDeals, createPipelineRunner } = require("../services/foodDeals");
const { createOneMapRouting } = require("../services/onemapRoute");

// Food near an event for Go together's before/after planner.
// GET  /api/food/nearby?lat=&lng=&at=ISO&radius=metres  -> { deals, places, status }
// GET  /api/food/status                                  -> pipeline and places status
// POST /api/food/ingest/run                              -> refresh deals (local requests only)
const BOUNDS = { south: 1.144, west: 103.535, north: 1.494, east: 104.131 };
const isLocal = req => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.ip || req.socket?.remoteAddress);

function createFoodRouter({ food = createFoodDeals({ routing: createOneMapRouting() }), pipeline = createPipelineRunner() } = {}) {
  const router = express.Router();
  pipeline.schedule();

  router.get("/nearby", async (req, res) => {
    const lat = Number(req.query.lat), lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < BOUNDS.south || lat > BOUNDS.north || lng < BOUNDS.west || lng > BOUNDS.east) {
      return res.status(400).json({ error: "invalid", message: "Give a Singapore location as lat and lng." });
    }
    const radius = Math.min(1500, Math.max(200, Number(req.query.radius) || 800));
    const atMs = req.query.at ? Date.parse(req.query.at) : Date.now();
    try {
      res.json(await food.nearby({ lat, lng, radius, atMs }));
    } catch (error) {
      res.status(502).json({ error: "unavailable", message: "Food suggestions are unavailable right now." });
    }
  });

  router.get("/status", (req, res) => {
    res.json({ places: food.placesConfigured() ? "configured" : "unconfigured", quota: food.quota(), pipeline: pipeline.status() });
  });

  router.post("/ingest/run", async (req, res) => {
    const token = process.env.FOOD_INGEST_TOKEN;
    if (!(isLocal(req) || (token && req.get("x-food-ingest-token") === token))) return res.status(403).json({ error: "forbidden", message: "Run the pipeline from the server machine." });
    pipeline.run();
    res.status(202).json({ started: true, status: pipeline.status() });
  });

  return router;
}

module.exports = createFoodRouter;
module.exports.createFoodRouter = createFoodRouter;
