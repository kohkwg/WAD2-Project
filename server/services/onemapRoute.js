// OneMap (Singapore Land Authority) public-transport and walking routes.
// Credentials stay server-side (ONEMAP_EMAIL / ONEMAP_PASSWORD); tokens refresh before
// expiry. Results are cached by normalised endpoints, mode and 15-minute departure.
// Token: https://www.onemap.gov.sg/api/auth/post/getToken
// Route: https://www.onemap.gov.sg/api/public/routingsvc/route

const TOKEN_URL = "https://www.onemap.gov.sg/api/auth/post/getToken";
const ROUTE_URL = "https://www.onemap.gov.sg/api/public/routingsvc/route";
const BOUNDS = { south: 1.144, west: 103.535, north: 1.494, east: 104.131 };
const CACHE_LIMIT = 5000;
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const QUARTER_HOUR_MS = 15 * 60 * 1000;

class RouteError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function parsePoint(text) {
  if (typeof text !== "string" || !/^-?\d{1,3}(\.\d+)?,-?\d{1,3}(\.\d+)?$/.test(text)) return null;
  const [lat, lng] = text.split(",").map(Number);
  if (lat < BOUNDS.south || lat > BOUNDS.north || lng < BOUNDS.west || lng > BOUNDS.east) return null;
  return { lat, lng };
}

// OneMap expects Singapore local date (MM-DD-YYYY) and time (HH:MM:SS).
function singaporeParts(ms) {
  const d = new Date(ms + 8 * 60 * 60 * 1000);
  const pad = n => String(n).padStart(2, "0");
  return {
    date: `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}-${d.getUTCFullYear()}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00`,
  };
}

function createOneMapRouting({ fetchImpl = globalThis.fetch, env = process.env, now = Date.now, timeoutMs = 15000 } = {}) {
  let token = null;
  let tokenExpiresAt = 0;
  let pendingToken = null;
  const cache = new Map();

  const configured = () => Boolean(env.ONEMAP_EMAIL && env.ONEMAP_PASSWORD);

  async function timedFetch(url, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(url, { ...options, signal: controller.signal });
    } catch {
      throw new RouteError("unavailable", "OneMap could not be reached.");
    } finally {
      clearTimeout(timer);
    }
  }

  async function getToken() {
    // Refresh five minutes early so a request never uses an expiring token.
    if (token && now() < tokenExpiresAt - 5 * 60 * 1000) return token;
    if (!pendingToken) {
      pendingToken = (async () => {
        const response = await timedFetch(TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: env.ONEMAP_EMAIL, password: env.ONEMAP_PASSWORD }),
        });
        const body = response.ok ? await response.json().catch(() => null) : null;
        if (!body?.access_token) throw new RouteError("unavailable", "OneMap sign-in failed.");
        token = body.access_token;
        const expiry = Number(body.expiry_timestamp) * 1000;
        tokenExpiresAt = Number.isFinite(expiry) && expiry > now() ? expiry : now() + 60 * 60 * 1000;
        return token;
      })().finally(() => { pendingToken = null; });
    }
    return pendingToken;
  }

  function cacheKey(from, to, mode, departMs) {
    const point = p => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
    const slot = mode === "walk" ? "any" : Math.floor(departMs / QUARTER_HOUR_MS);
    return `${mode}|${point(from)}|${point(to)}|${slot}`;
  }

  async function route({ from, to, mode, departMs }) {
    if (!configured()) throw new RouteError("configuration", "OneMap routing is not configured.");
    const key = cacheKey(from, to, mode, departMs);
    const hit = cache.get(key);
    if (hit && now() - hit.at < CACHE_MAX_AGE_MS) return { ...hit.value, cached: true };

    const { date, time } = singaporeParts(departMs);
    const params = new URLSearchParams({ start: `${from.lat},${from.lng}`, end: `${to.lat},${to.lng}`, routeType: mode });
    if (mode === "pt") {
      params.set("date", date);
      params.set("time", time);
      params.set("mode", "TRANSIT");
      params.set("maxWalkDistance", "1000");
      params.set("numItineraries", "1");
    }
    const response = await timedFetch(`${ROUTE_URL}?${params}`, { headers: { Authorization: await getToken() } });
    if (response.status === 401) token = null;
    const body = response.ok ? await response.json().catch(() => null) : null;
    let value = null;
    if (mode === "pt") {
      const itinerary = body?.plan?.itineraries?.[0];
      if (Number.isFinite(itinerary?.duration)) {
        value = { minutes: Math.ceil(itinerary.duration / 60), mode: "transit", transfers: itinerary.transfers ?? null, walkMinutes: Number.isFinite(itinerary.walkTime) ? Math.round(itinerary.walkTime / 60) : null };
      }
    } else if (Number.isFinite(body?.route_summary?.total_time)) {
      value = { minutes: Math.ceil(body.route_summary.total_time / 60), mode: "walk", transfers: 0, walkMinutes: Math.ceil(body.route_summary.total_time / 60) };
    }
    if (!value) throw new RouteError("unavailable", "OneMap returned no route.");
    value.live = true;
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
    cache.set(key, { at: now(), value });
    return { ...value, cached: false };
  }

  // getToken is shared with the food-deal geocoder (OneMap search uses the same token).
  return { configured, route, getToken, cacheSize: () => cache.size };
}

module.exports = { createOneMapRouting, parsePoint, singaporeParts, RouteError };
