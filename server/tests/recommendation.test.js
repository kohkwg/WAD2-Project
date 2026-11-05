// Run from the server folder: node tests/recommendation.test.js
const { checkTrue, checkEqual, checkDeepEqual, checkThrows } = require('./checks');
const { recommend, scoreEvents } = require("../services/recommendation");

const { bumpInterestWeights } = require("../services/interestWeights");

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
checkTrue(!out.find((e) => e.id === "5"), "past events must be excluded");

// 2. diversity: top 3 should not all be the same category
console.log("Ranking:");
out.forEach((e) => console.log(` - ${e.title} [${e.score.toFixed(2)}] ${e.reason}`));
checkEqual(out[0].category, "music");
checkTrue(out.slice(0, 3).some((e) => e.category !== "music"), "top 3 should be diverse");

// 3. already-RSVPed events are removed
out = recommend(events, profile, { excludeEventIds: new Set(["1"]) });
checkTrue(!out.find((e) => e.id === "1"));

// 4. new user: no interests, no location
out = recommend(events, {}, { limit: 3 });
checkTrue(out.length > 0);

// 5. adaptive weights
const w = bumpInterestWeights({ music: 1 }, ["music", "tech"], "rsvp");
checkEqual(w.music, 1.5);
checkEqual(w.tech, 0.5);
checkEqual(bumpInterestWeights({ music: 4.9 }, ["music"], "attend").music, 5); // capped

// 6. Category-only events can match interests without a tags column.
const categoryOnly = { id: "category-only", title: "Futsal", category: "Sports", start_time: inDays(2), confirmed_count: 0, spots_left: 20 };
const matched = scoreEvents([categoryOnly], { interest_weights: { sports: 2 } })[0];
checkEqual(matched.reason, "Matches your interests: sports");
const duplicated = scoreEvents([{ ...categoryOnly, tags: ["Sports", "SPORTS"] }], { interest_weights: { sports: 2 } })[0];
checkTrue(Math.abs(matched.score - duplicated.score) < 0.00001, "duplicate category/tags must not count twice");
const unrelated = scoreEvents([categoryOnly], { interest_weights: { music: 2 } })[0];
checkTrue(matched.score > unrelated.score, "matching categories should receive a higher score");
const noCategory = scoreEvents([{ ...categoryOnly, category: null, tags: null }], { interest_weights: { sports: 2 } })[0];
checkTrue(Number.isFinite(noCategory.score), "events with no category or tags must still score safely");

console.log("All recommendation tests passed");
