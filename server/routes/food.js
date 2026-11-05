const express = require("express");

const {
  createFoodPlaces
} = require("../services/foodPlaces");

// food places near an event for go together's before/after planner.
// get /api/food/nearby?lat=&lng=&at=iso&radius=metres  -> { places, status }
// get /api/food/status                                  -> whether places are configured, quota

// Singapore limits for lat and lng.
const BOUNDS = {
  south: 1.144,
  west: 103.535,
  north: 1.494,
  east: 104.131
};

/**
 * Creates the food router.
 * @param {object} [options]
 * @param {object} [options.food] Replaces the default Geoapify food place service.
 */
function createFoodRouter({
  food = createFoodPlaces()
} = {}) {
  const router = express.Router();
  router.get("/nearby", async (req, res) => {
    const lat = Number(req.query.lat),
      lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < BOUNDS.south || lat > BOUNDS.north || lng < BOUNDS.west || lng > BOUNDS.east) {
      return res.status(400).json({
        error: "invalid",
        message: "Give a Singapore location as lat and lng."
      });
    }
    const radius = Math.min(1500, Math.max(200, Number(req.query.radius) || 800));
    const atMs = req.query.at ? Date.parse(req.query.at) : Date.now();
    try {
      res.json(await food.nearby({
        lat,
        lng,
        radius,
        atMs
      }));
    } catch {
      res.status(502).json({
        error: "unavailable",
        message: "Food suggestions are unavailable right now."
      });
    }
  });
  router.get("/status", (req, res) => {
    res.json({
      places: food.placesConfigured() ? "configured" : "unconfigured",
      quota: food.quota()
    });
  });
  return router;
}
module.exports = createFoodRouter;
