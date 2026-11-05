const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createFoodPlaces, metres } = require("../services/foodPlaces");

// 2026-11-07 is a Saturday; 12:30 in Singapore is 04:30Z
const SAT_LUNCH = Date.parse("2026-11-07T04:30:00Z");
const place = (name, distance, opening_hours) => ({ properties: { name, lat: 1.3, lon: 103.85, distance, opening_hours, categories: ["catering.cafe"], place_id: name } });

test("metres measures short distances", () => {
  const d = metres({ lat: 1.3, lng: 103.85 }, { lat: 1.301, lng: 103.85 });
  assert.ok(d > 100 && d < 120);
});

test("without a Geoapify key there are no places and the status says so", async () => {
  const food = createFoodPlaces({ fetchImpl: async () => { throw new Error("should not fetch"); }, env: {}, cacheDir: mkdtempSync(path.join(os.tmpdir(), "food-")) });
  const result = await food.nearby({ lat: 1.3, lng: 103.85, radius: 800, atMs: SAT_LUNCH });
  assert.deepEqual(result, { places: [], status: { places: "unconfigured" } });
});

test("nearby places hide ones closed at the meal time and list the rest nearest first", async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ features: [
    place("Far open", 600, "Mo-Su 08:00-22:00"),
    place("Closed weekends", 50, "Mo-Fr 08:00-19:00, Sa-Su closed"),
    place("Near, no hours", 120, undefined),
    place("Middle open", 300, "24/7"),
  ] }) });
  const food = createFoodPlaces({ fetchImpl, env: { GEOAPIFY_API_KEY: "test" }, cacheDir: mkdtempSync(path.join(os.tmpdir(), "food-")) });
  const { places, status } = await food.nearby({ lat: 1.3, lng: 103.85, radius: 800, atMs: SAT_LUNCH });
  assert.equal(status.places, "ok");
  assert.deepEqual(places.map(p => [p.name, p.openAt]), [["Near, no hours", "unknown"], ["Middle open", "open"], ["Far open", "open"]]);
});

test("places are cached per area, so a second time asks Geoapify once", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return { ok: true, json: async () => ({ features: [place("Cafe", 100, "Mo-Fr 08:00-19:00")] }) }; };
  const food = createFoodPlaces({ fetchImpl, env: { GEOAPIFY_API_KEY: "test" }, cacheDir: mkdtempSync(path.join(os.tmpdir(), "food-")) });
  const weekday = await food.nearby({ lat: 1.3, lng: 103.85, radius: 800, atMs: Date.parse("2026-11-06T04:30:00Z") });
  const saturday = await food.nearby({ lat: 1.3, lng: 103.85, radius: 800, atMs: SAT_LUNCH });
  assert.equal(calls, 1);
  assert.equal(weekday.places.length, 1);
  assert.equal(saturday.places.length, 0); // same cached place, closed at the weekend
});

test("a place whose name is a number comes back as text", async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ features: [{ properties: { name: 1988, lat: 1.3, lon: 103.85, distance: 40, categories: ["catering.cafe"], place_id: "n" } }] }) });
  const food = createFoodPlaces({ fetchImpl, env: { GEOAPIFY_API_KEY: "test" }, cacheDir: mkdtempSync(path.join(os.tmpdir(), "food-")) });
  const { places } = await food.nearby({ lat: 1.3, lng: 103.85, radius: 800, atMs: SAT_LUNCH });
  assert.equal(places[0].name, "1988");
});
