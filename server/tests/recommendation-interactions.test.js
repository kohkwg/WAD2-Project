const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

const filename = path.join(__dirname, "../routes/recommendations.js");
const source = fs.readFileSync(filename, "utf8");
const localRequire = createRequire(filename);

async function runInteraction({ eventError, profileError, type = "rsvp" } = {}) {
  const calls = [];
  const client = { from(table) {
    const query = new Proxy({}, { get(_target, method) {
      if (method === "then") return resolve => resolve(table === "events"
        ? { data: { category: "Sports" }, error: eventError }
        : { data: { interest_weights: { sports: 1, music: 2 } }, error: profileError });
      return (...args) => { calls.push({ table, method, args }); return query; };
    } });
    return query;
  } };
  const moduleStub = { exports: {} };
  vm.runInNewContext(source, {
    module: moduleStub,
    require: name => name === "../lib/supabase" ? client
      : name === "../lib/requireAuth" ? (_req, _res, next) => next()
        : localRequire(name),
    console: { error() {} },
  }, { filename });
  const handler = moduleStub.exports.stack.find(layer => layer.route?.path === "/interactions").route.stack.at(-1).handle;
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
  await handler({ body: { eventId: "event-1", type }, user: { id: "user-1" } }, response);
  return { calls, response };
}

test("interaction reads category and increments its lowercase weight without discarding other interests", async () => {
  for (const [type, expected] of [["rsvp", 1.5], ["attend", 2]]) {
    const { calls, response } = await runInteraction({ type });
    assert.equal(response.statusCode, 200);
    assert.equal(calls.find(call => call.table === "events" && call.method === "select").args[0], "category");
    const saved = calls.find(call => call.method === "upsert").args[0];
    assert.equal(saved.id, "user-1");
    assert.equal(saved.interest_weights.sports, expected);
    assert.equal(saved.interest_weights.music, 2);
  }
});

test("failed event/profile reads never overwrite interest weights", async () => {
  for (const errors of [{ eventError: { message: "Event unavailable" } }, { profileError: { message: "Profile unavailable" } }]) {
    const { calls, response } = await runInteraction(errors);
    assert.equal(response.statusCode, 500);
    assert.ok(!calls.some(call => call.method === "upsert"));
  }
});
