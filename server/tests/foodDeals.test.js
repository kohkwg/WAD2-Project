const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, writeFileSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createFoodDeals, dealValidity, metres } = require("../services/foodDeals");

// 2026-11-07 is a Saturday; 12:30 in Singapore is 04:30Z
const SAT_LUNCH = Date.parse("2026-11-07T04:30:00Z");

test("dealValidity checks dates, days and time windows in Singapore time", () => {
  assert.equal(dealValidity({}, SAT_LUNCH), "unknown");
  assert.equal(dealValidity({ daysOfWeek: ["SAT", "SUN"] }, SAT_LUNCH), "valid");
  assert.equal(dealValidity({ daysOfWeek: ["MON"] }, SAT_LUNCH), "not-valid");
  assert.equal(dealValidity({ timeWindows: [{ start: "11:00", end: "14:00" }] }, SAT_LUNCH), "valid");
  assert.equal(dealValidity({ timeWindows: [{ start: "18:00", end: "21:00" }] }, SAT_LUNCH), "not-valid");
  assert.equal(dealValidity({ dateTo: "2026-11-06" }, SAT_LUNCH), "not-valid");
});

test("metres measures short distances", () => {
  const d = metres({ lat: 1.3, lng: 103.85 }, { lat: 1.309, lng: 103.85 });
  assert.ok(d > 950 && d < 1050);
});

test("nearby returns located deals within range and skips places without a key", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "food-"));
  const draftsFile = path.join(dir, "drafts.json");
  writeFileSync(draftsFile, JSON.stringify({
    a: { id: "a", type: "deal", category: "food", title: "1-for-1 lattes", outlets: [{ name: "Cafe", address: "1 Road Singapore 123456" }], validity: { daysOfWeek: ["SAT"] }, source: { name: "Telegram", url: "https://t.me/x/1" } },
    b: { id: "b", type: "deal", category: "food", title: "Weekday set", outlets: [{ name: "Far", address: "2 Road Singapore 654321" }], validity: { daysOfWeek: ["MON"] } },
    c: { id: "c", type: "event", title: "Not food" },
  }));
  const fetchImpl = async url => ({ ok: true, json: async () => ({ results: [String(url).includes("123456") ? { LATITUDE: "1.3005", LONGITUDE: "103.85" } : { LATITUDE: "1.3", LONGITUDE: "103.851" }] }) });
  const food = createFoodDeals({ fetchImpl, env: {}, draftsFile, cacheDir: dir });
  const first = await food.nearby({ lat: 1.3, lng: 103.85, radius: 800, atMs: SAT_LUNCH });
  assert.equal(first.status.places, "unconfigured");
  assert.deepEqual(first.places, []);
  // geocoding runs in the background; wait for it, then ask again
  await new Promise(resolve => setTimeout(resolve, 900));
  const second = await food.nearby({ lat: 1.3, lng: 103.85, radius: 800, atMs: SAT_LUNCH });
  assert.deepEqual(second.deals.map(d => d.id), ["a"]);
  assert.equal(second.deals[0].validAt, "valid");
  assert.ok(second.deals[0].distanceM < 100);
});
