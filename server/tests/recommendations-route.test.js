const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { rankEvents } = require("../services/rankEvents");

const filename = path.join(__dirname, "../routes/recommendations.js");
const localRequire = createRequire(filename);
const NOW = "2030-01-01T00:00:00Z";
const events = [
  { id: "music", title: "Music night", category: "music", tags: ["music"], start_time: "2030-01-02T00:00:00Z", capacity: 20, confirmed_count: 10, spots_left: 10, lat: 1.3, lng: 103.8 },
  { id: "arts", title: "Arts day", category: "arts", tags: ["arts"], start_time: "2030-01-03T00:00:00Z", capacity: 40, confirmed_count: 10, spots_left: 30 },
  { id: "registered", tags: ["music"], start_time: "2030-01-02T00:00:00Z" },
];

async function request({ profile = { interest_weights: { music: 3 }, lat: 1.3, lng: 103.8 }, limit = "8", failure } = {}) {
  const calls = [], tokens = [], rankingCalls = [];
  const client = { from(table) {
    const query = new Proxy({}, { get(_target, method) {
      if (method === "then") return resolve => resolve({
        data: table === "profiles" ? profile : table === "events_with_counts" ? events : [{ event_id: "registered" }],
        error: failure === table ? { message: "Read failed" } : null,
      });
      return (...args) => { calls.push({ table, method, args }); return query; };
    } });
    return query;
  } };
  const moduleStub = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module: moduleStub,
    require: name => name === "../lib/userSupabase" ? token => { tokens.push(token); return client; }
      : name === "../lib/requireAuth" ? (_req, _res, next) => next()
      : name === "../services/rankEvents" ? { rankEvents: (rows, user, options) => {
        rankingCalls.push({ rows, user, options });
        return rankEvents(rows, user, { ...options, now: NOW });
      } } : localRequire(name),
    console: { error() {} },
  }, { filename });
  const handler = moduleStub.exports.stack.find(layer => layer.route?.path === "/").route.stack.at(-1).handle;
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
  await handler({ query: { limit }, user: { id: "user-1" }, accessToken: "user-jwt" }, response);
  return { response, calls, tokens, rankingCalls };
}

test("recommendations use rankEvents while preserving the flat card response and caller JWT", async () => {
  const { response, calls, tokens, rankingCalls } = await request({ limit: "1" });
  assert.deepEqual(tokens, ["user-jwt"]);
  assert.equal(rankingCalls.length, 1);
  assert.equal(rankingCalls[0].options.limit, 1);
  assert.ok(rankingCalls[0].options.excludeEventIds.has("registered"));
  assert.equal(response.statusCode, 200);
  assert.deepEqual(Object.keys(response.body), ["events"]);
  const [event] = response.body.events;
  assert.equal(response.body.events.length, 1);
  assert.equal(event.id, "music");
  assert.equal(event.title, "Music night");
  assert.equal(event.reason, "Matches your interests: music");
  assert.equal(event.distance_km, 0);
  assert.ok(Number.isFinite(event.score));
  assert.ok(!("event" in event));
  assert.ok(calls.some(call => call.table === "profiles" && call.method === "eq" && call.args[1] === "user-1"));
  assert.ok(calls.some(call => call.table === "registrations" && call.method === "eq" && call.args[1] === "user-1"));
});

test("missing profile/location retains nullable distance, exclusion and the maximum limit", async () => {
  const { response, rankingCalls } = await request({ profile: null, limit: "100" });
  assert.equal(rankingCalls[0].options.limit, 24);
  assert.deepEqual(response.body.events.map(event => event.id), ["music", "arts"]);
  assert.ok(response.body.events.every(event => event.distance_km === null));
});

test("failed recommendation reads preserve the error response and skip ranking", async () => {
  for (const failure of ["profiles", "events_with_counts", "registrations"]) {
    const { response, rankingCalls } = await request({ failure });
    assert.equal(response.statusCode, 500);
    assert.equal(response.body.error, "Failed to build recommendations");
    assert.equal(rankingCalls.length, 0);
  }
});
