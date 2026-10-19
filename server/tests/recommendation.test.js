// Run from the server folder: node tests/recommendation.test.js
const assert = require("node:assert");
const { recommend, bumpInterestWeights } = require("../services/recommendation");

const inDays = (d) => new Date(Date.now() + d * 86400000).toISOString();

const events = [
  { id: "1", title: "Jazz Night",  category: "music",  tags: ["music"],  lat: 1.3521, lng: 103.8198, start_time: inDays(3),  confirmed_count: 30, spots_left: 20 },
  { id: "2", title: "Rock Fest",   category: "music",  tags: ["music"],  lat: 1.3500, lng: 103.8200, start_time: inDays(4),  confirmed_count: 50, spots_left: 5 },
  { id: "3", title: "5km Fun Run", category: "sports", tags: ["sports"], lat: 1.3000, lng: 103.8000, start_time: inDays(5),  confirmed_count: 10, spots_left: 40 },
  { id: "4", title: "Hackathon",   category: "tech",   tags: ["tech"],   lat: 1.4000, lng: 103.9000, start_time: inDays(20), confirmed_count: 5,  spots_left: 0 },
  { id: "5", title: "Past Event",  category: "music",  tags: ["music"],  lat: 1.35,   lng: 103.82,   start_time: inDays(-2), confirmed_count: 99, spots_left: 10 },
];

const profile = { interest_weights: { music: 2 }, lat: 1.3521, lng: 103.8198 };

// 1. past events are excluded
let out = recommend(events, profile, { limit: 5 });
assert(!out.find((e) => e.id === "5"), "past events must be excluded");

// 2. diversity: top 3 should not all be the same category
console.log("Ranking:");
out.forEach((e) => console.log(` - ${e.title} [${e.score.toFixed(2)}] ${e.reason}`));
assert.strictEqual(out[0].category, "music");
assert(out.slice(0, 3).some((e) => e.category !== "music"), "top 3 should be diverse");

// 3. already-RSVPed events are removed
out = recommend(events, profile, { excludeEventIds: new Set(["1"]) });
assert(!out.find((e) => e.id === "1"));

// 4. new user: no interests, no location
out = recommend(events, {}, { limit: 3 });
assert(out.length > 0);

// 5. adaptive weights
const w = bumpInterestWeights({ music: 1 }, ["music", "tech"], "rsvp");
assert.strictEqual(w.music, 1.5);
assert.strictEqual(w.tech, 0.5);
assert.strictEqual(bumpInterestWeights({ music: 4.9 }, ["music"], "attend").music, 5); // capped

console.log("All recommendation tests passed");
