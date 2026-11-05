// Food near an event, for Go together's before/after planner (ported from OpenJio).
// - Deals: the Python pipeline (pipeline/run.py) reads public Telegram previews and
//   confirmgood.com, extracts deals with Gemini and writes pipeline/out/drafts.json.
//   Outlet addresses are located with OneMap search and cached.
// - Places: restaurants, cafes, hawker and fast food near a point from Geoapify Places,
//   cached per ~100 m cell for a week, with a daily request cap.
// Nothing here writes to Supabase; everything is a read-only suggestion for the planner.
const { readFile, writeFile, mkdir, rename } = require("node:fs/promises");
const { existsSync } = require("node:fs");
const { spawn } = require("node:child_process");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "../..");
const DRAFTS_FILE = path.join(REPO_ROOT, "pipeline", "out", "drafts.json");
const CACHE_DIR = path.resolve(__dirname, "../.cache");
const SEARCH_URL = "https://www.onemap.gov.sg/api/common/elastic/search";
const PLACES_URL = "https://api.geoapify.com/v2/places";
const FOOD_CATEGORIES = "catering.restaurant,catering.cafe,catering.fast_food,catering.food_court";
const PLACE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const metres = (a, b) => {
  const rad = x => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371000 * 2 * Math.asin(Math.sqrt(h)));
};
// Singapore local day and HH:MM for a time
function sgClock(ms) {
  const d = new Date(ms + 8 * 60 * 60 * 1000);
  const pad = n => String(n).padStart(2, "0");
  return { day: DAYS[d.getUTCDay()], date: d.toISOString().slice(0, 10), time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` };
}

// Whether a deal applies at a time: "valid", "not-valid", or "unknown" when the post didn't say.
function dealValidity(validity = {}, atMs) {
  if (!Number.isFinite(atMs)) return "unknown";
  const { day, date, time } = sgClock(atMs);
  if (validity.dateTo && date > validity.dateTo) return "not-valid";
  if (validity.dateFrom && date < validity.dateFrom) return "not-valid";
  if (Array.isArray(validity.daysOfWeek) && validity.daysOfWeek.length && !validity.daysOfWeek.includes(day)) return "not-valid";
  const windows = Array.isArray(validity.timeWindows) ? validity.timeWindows : [];
  if (windows.length && !windows.some(w => w.start && w.end && time >= w.start && time <= w.end)) return "not-valid";
  const known = validity.dateTo || validity.dateFrom || validity.daysOfWeek?.length || windows.length;
  return known ? "valid" : "unknown";
}

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, "utf8")); } catch { return fallback; }
}
async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value));
  await rename(tmp, file);
}
const postalOf = address => (String(address || "").match(/\b(\d{6})\b/) || [])[1] || null;
const isFoodDeal = draft => draft?.type === "deal" && draft.status !== "rejected" && (draft.category === "food" || !draft.category);

function createFoodDeals({ fetchImpl = globalThis.fetch, env = process.env, now = Date.now, routing = null, draftsFile = DRAFTS_FILE, cacheDir = CACHE_DIR } = {}) {
  const GEOCODE_FILE = path.join(cacheDir, "food-geocodes.json");
  const PLACES_FILE = path.join(cacheDir, "food-places.json");
  let geocodes = null; // address key -> { lat, lng } | null (not found)
  let places = null; // cell key -> { at, items }
  let geocoding = null;
  const quota = { day: "", used: 0 };
  const dailyLimit = Math.max(1, Number(env.GEOAPIFY_DAILY_LIMIT) || 1000);
  const placesConfigured = () => Boolean(env.GEOAPIFY_API_KEY);

  async function loadCaches() {
    if (!geocodes) geocodes = await readJson(GEOCODE_FILE, {});
    if (!places) places = await readJson(PLACES_FILE, {});
  }

  async function loadDeals() {
    const raw = await readJson(draftsFile, {});
    const list = Array.isArray(raw) ? raw : Object.values(raw || {});
    return list.filter(isFoodDeal);
  }

  async function searchAddress(text) {
    const params = new URLSearchParams({ searchVal: text, returnGeom: "Y", getAddrDetails: "Y", pageNum: "1" });
    const headers = {};
    if (routing?.configured?.()) { try { headers.Authorization = await routing.getToken(); } catch { /* search without a token */ } }
    const response = await fetchImpl(`${SEARCH_URL}?${params}`, { headers });
    if (!response.ok) return undefined;
    const body = await response.json().catch(() => null);
    const hit = body?.results?.[0];
    const lat = Number(hit?.LATITUDE), lng = Number(hit?.LONGITUDE);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }

  // Locate outlets that aren't cached yet, one request every 300 ms, in the background.
  function geocodeMissing(deals) {
    if (geocoding) return geocoding;
    const todo = [];
    for (const deal of deals) for (const outlet of deal.outlets || []) {
      const key = postalOf(outlet.address) || String(outlet.address || outlet.name || "").trim().toLowerCase();
      if (key && !(key in geocodes) && !todo.includes(key)) todo.push(key)
    }
    if (!todo.length) return null;
    geocoding = (async () => {
      for (const key of todo.slice(0, 40)) {
        try {
          const found = await searchAddress(key);
          if (found !== undefined) geocodes[key] = found;
        } catch { /* try again next time */ }
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      await writeJson(GEOCODE_FILE, geocodes);
    })().finally(() => { geocoding = null; });
    return geocoding;
  }

  async function nearbyDeals(point, radius, atMs) {
    const deals = await loadDeals();
    geocodeMissing(deals);
    const out = [];
    for (const deal of deals) {
      let best = null;
      for (const outlet of deal.outlets || []) {
        const key = postalOf(outlet.address) || String(outlet.address || outlet.name || "").trim().toLowerCase();
        const at = key && geocodes[key];
        if (!at) continue;
        const distance = metres(point, at);
        if (distance <= radius && (!best || distance < best.distanceM)) best = { ...outlet, lat: at.lat, lng: at.lng, distanceM: distance };
      }
      if (!best) continue;
      out.push({
        id: deal.id, kind: "deal", title: deal.title, merchant: deal.merchant || best.name || null,
        priceText: deal.priceText || null, summary: deal.summary || null, conditions: deal.conditions || [],
        validity: deal.validity || {}, validAt: dealValidity(deal.validity, atMs),
        outlet: best, distanceM: best.distanceM,
        source: { name: deal.source?.name || null, url: deal.source?.url || null, retrievedAt: deal.source?.retrievedAt || null },
      });
    }
    return out.filter(d => d.validAt !== "not-valid").sort((a, b) => a.distanceM - b.distanceM).slice(0, 12);
  }

  async function nearbyPlaces(point, radius) {
    if (!placesConfigured()) return { status: "unconfigured", items: [] };
    const cell = `${point.lat.toFixed(3)},${point.lng.toFixed(3)},${radius}`;
    const hit = places[cell];
    if (hit && now() - hit.at < PLACE_TTL_MS) return { status: "ok", items: hit.items };
    const today = sgClock(now()).date;
    if (quota.day !== today) { quota.day = today; quota.used = 0 }
    if (quota.used >= dailyLimit) return { status: "quota", items: hit?.items || [] };
    quota.used++;
    const params = new URLSearchParams({ categories: FOOD_CATEGORIES, filter: `circle:${point.lng},${point.lat},${radius}`, bias: `proximity:${point.lng},${point.lat}`, limit: "20", apiKey: env.GEOAPIFY_API_KEY });
    const response = await fetchImpl(`${PLACES_URL}?${params}`);
    if (!response.ok) return { status: "unavailable", items: hit?.items || [] };
    const body = await response.json().catch(() => null);
    const items = (body?.features || []).map(f => f.properties || {}).filter(p => p.name && Number.isFinite(p.lat) && Number.isFinite(p.lon)).map(p => ({
      id: `place:${p.place_id || `${p.lat},${p.lon}`}`, kind: "place", name: p.name,
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

  async function nearby({ lat, lng, radius = 800, atMs }) {
    await loadCaches();
    const point = { lat, lng };
    const [deals, placeResult] = await Promise.all([
      nearbyDeals(point, Math.min(radius * 2, 2000), atMs),
      nearbyPlaces(point, radius).catch(() => ({ status: "unavailable", items: [] })),
    ]);
    return {
      deals,
      places: placeResult.items,
      status: { places: placeResult.status, deals: existsSync(draftsFile) ? "ok" : "no-pipeline-output" },
    };
  }

  return { nearby, loadDeals, placesConfigured, quota: () => ({ ...quota, limit: dailyLimit }) };
}

// Runs the Python pipeline. Python comes from PIPELINE_PYTHON, then pipeline/.venv, then python3.
function resolvePython(env = process.env) {
  if (env.PIPELINE_PYTHON) return env.PIPELINE_PYTHON;
  const venv = path.join(REPO_ROOT, "pipeline", ".venv", "bin", "python");
  return existsSync(venv) ? venv : "python3";
}
function createPipelineRunner({ env = process.env, now = Date.now } = {}) {
  const state = { running: false, lastStartedAt: null, lastFinishedAt: null, lastError: null, lastExitCode: null };
  function run() {
    if (state.running) return Promise.resolve({ started: false, reason: "already running" });
    state.running = true;
    state.lastStartedAt = new Date(now()).toISOString();
    state.lastError = null;
    const limit = String(Math.max(1, Math.floor(Number(env.FOOD_INGEST_LIMIT)) || 15));
    return new Promise(resolve => {
      const child = spawn(resolvePython(env), [path.join(REPO_ROOT, "pipeline", "run.py"), "--limit", limit], { cwd: REPO_ROOT, env, stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-2000); });
      child.on("error", error => { state.lastError = error.message; });
      child.on("close", code => {
        state.running = false;
        state.lastExitCode = code;
        state.lastFinishedAt = new Date(now()).toISOString();
        if (code !== 0 && !state.lastError) state.lastError = stderr.split("\n").filter(Boolean).pop() || `exited with ${code}`;
        resolve({ started: true, exitCode: code });
      });
    });
  }
  let timer = null;
  function schedule() {
    if (env.FOOD_INGEST_ENABLED !== "true" || timer) return;
    const hours = Math.max(1, Number(env.FOOD_INGEST_INTERVAL_HOURS) || 6);
    timer = setInterval(run, hours * 60 * 60 * 1000);
    timer.unref?.();
    run();
  }
  return { run, schedule, status: () => ({ ...state, enabled: env.FOOD_INGEST_ENABLED === "true" }) };
}

module.exports = { createFoodDeals, createPipelineRunner, dealValidity, metres, sgClock };
