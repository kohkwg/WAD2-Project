// Food places near an event, for Go together's before/after planner.
// Restaurants, cafes, fast food and food courts near a point from Geoapify Places (OpenStreetMap
// data), cached per ~100 m cell for a week, with a daily request cap. Each request checks the
// places' listed opening hours against the meal time: closed ones are left out, the rest are
// labelled "open" or "unknown" and listed nearest first.
// Nothing here writes to Supabase; everything is a read-only suggestion for the planner.
const { readFile, writeFile, mkdir, rename } = require("node:fs/promises");
const path = require("node:path");
const { openState } = require("./openingHours");

const CACHE_DIR = path.resolve(__dirname, "../.cache");
const PLACES_URL = "https://api.geoapify.com/v2/places";
const FOOD_CATEGORIES = "catering.restaurant,catering.cafe,catering.fast_food,catering.food_court";
const PLACE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const metres = (a, b) => {
  const rad = x => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371000 * 2 * Math.asin(Math.sqrt(h)));
};
// Singapore local date (YYYY-MM-DD) for the daily quota
const sgDate = ms => new Date(ms + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, "utf8")); } catch { return fallback; }
}
async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value));
  await rename(tmp, file);
}

function createFoodPlaces({ fetchImpl = globalThis.fetch, env = process.env, now = Date.now, cacheDir = CACHE_DIR } = {}) {
  const PLACES_FILE = path.join(cacheDir, "food-places.json");
  let places = null; // cell key -> { at, items }
  const quota = { day: "", used: 0 };
  const dailyLimit = Math.max(1, Number(env.GEOAPIFY_DAILY_LIMIT) || 1000);
  const placesConfigured = () => Boolean(env.GEOAPIFY_API_KEY);

  async function fetchPlaces(point, radius) {
    if (!placesConfigured()) return { status: "unconfigured", items: [] };
    if (!places) places = await readJson(PLACES_FILE, {});
    const cell = `${point.lat.toFixed(3)},${point.lng.toFixed(3)},${radius}`;
    const hit = places[cell];
    if (hit && now() - hit.at < PLACE_TTL_MS) return { status: "ok", items: hit.items };
    const today = sgDate(now());
    if (quota.day !== today) { quota.day = today; quota.used = 0; }
    if (quota.used >= dailyLimit) return { status: "quota", items: hit?.items || [] };
    quota.used++;
    const params = new URLSearchParams({ categories: FOOD_CATEGORIES, filter: `circle:${point.lng},${point.lat},${radius}`, bias: `proximity:${point.lng},${point.lat}`, limit: "20", apiKey: env.GEOAPIFY_API_KEY });
    const response = await fetchImpl(`${PLACES_URL}?${params}`);
    if (!response.ok) return { status: "unavailable", items: hit?.items || [] };
    const body = await response.json().catch(() => null);
    // A name can come back as a number (a cafe called "1988"), so names are made text here
    const items = (body?.features || []).map(f => f.properties || {}).filter(p => p.name != null && String(p.name).trim() && Number.isFinite(p.lat) && Number.isFinite(p.lon)).map(p => ({
      id: `place:${p.place_id || `${p.lat},${p.lon}`}`, kind: "place", name: String(p.name).trim(),
      address: p.address_line2 || p.formatted || null, lat: p.lat, lng: p.lon,
      distanceM: Number.isFinite(p.distance) ? Math.round(p.distance) : metres(point, { lat: p.lat, lng: p.lon }),
      openingHours: p.opening_hours || null,
      category: (p.categories || []).find(c => c.startsWith("catering."))?.split(".")[1]?.replace(/_/g, " ") || "food",
      source: { name: "OpenStreetMap via Geoapify" },
    }));
    places[cell] = { at: now(), items };
    writeJson(PLACES_FILE, places).catch(() => {});
    return { status: "ok", items };
  }

  // { places, status: { places } } — closed places at atMs left out, nearest first. Worked out per
  // request because the cache is per area, not per time.
  async function nearby({ lat, lng, radius = 800, atMs }) {
    const result = await fetchPlaces({ lat, lng }, radius).catch(() => ({ status: "unavailable", items: [] }));
    const list = result.items
      .map(p => ({ ...p, openAt: openState(p.openingHours, atMs) }))
      .filter(p => p.openAt !== "closed")
      .sort((a, b) => a.distanceM - b.distanceM);
    return { places: list, status: { places: result.status } };
  }

  return { nearby, placesConfigured, quota: () => ({ ...quota, limit: dailyLimit }) };
}

module.exports = { createFoodPlaces, metres };
