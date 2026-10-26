const test = require("node:test");
const assert = require("node:assert/strict");
const { rankEvents, RANKING_CONFIG } = require("../services/rankEvents");

const NOW = "2026-10-20T00:00:00.000Z";
const daysFromNow = days => new Date(Date.parse(NOW) + days * 86400000).toISOString();
const sampleEvents = [
  { id: "jazz", title: "Jazz Night", category: "music", tags: ["music"], start_time: daysFromNow(1), capacity: 100, confirmed_count: 60, spots_left: 40, lat: 1.3, lng: 103.8 },
  { id: "rock", title: "Rock Night", category: "music", tags: ["music"], start_time: daysFromNow(2), capacity: 100, confirmed_count: 70, spots_left: 30, lat: 1.31, lng: 103.81 },
  { id: "run", title: "Fun Run", category: "sports", tags: ["sports"], start_time: daysFromNow(1), capacity: 50, confirmed_count: 25, spots_left: 25, lat: 1.4, lng: 103.9 },
  { id: "tech", title: "Tech Meetup", category: "tech", tags: ["tech"], start_time: daysFromNow(14), capacity: 100, confirmed_count: 100, spots_left: 0 },
  { id: "arts", title: "Arts Afternoon", category: "arts", tags: ["arts"], start_time: daysFromNow(5), capacity: null, confirmed_count: 20, spots_left: null },
  { id: "past", title: "Past Concert", category: "music", tags: ["music"], start_time: daysFromNow(-1), capacity: 100, confirmed_count: 100, spots_left: 0 },
];
const profile = { interest_weights: { music: 3, sports: 1 }, lat: 1.3, lng: 103.8 };
const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
const rankOne = (event, user = profile) => rankEvents([event], user, { now: NOW })[0];

test("six-event fixture ranks upcoming candidates and returns the promised shape", () => {
  const ranked = rankEvents(sampleEvents, profile, { now: NOW, limit: 6 });
  assert.equal(ranked.length, 5);
  assert.equal(ranked[0].event.id, "jazz");
  assert.ok(!ranked.some(result => result.event.id === "past"));
  for (const result of ranked) {
    assert.deepEqual(Object.keys(result), ["event", "score", "reason"]);
    assert.ok(result.score >= 0 && result.score <= 1);
    assert.ok(result.reason.length);
  }
});

test("weights and each signal follow the requested normalized formulas", () => {
  assert.deepEqual(RANKING_CONFIG.weights, { interest: .4, recency: .2, popularity: .15, distance: .15, spots: .1 });
  const jazz = rankOne(sampleEvents[0]);
  closeTo(jazz.score, .4 * .7634349199257851 + .2 * Math.exp(-1 / 14) + .15 * .6 + .15 + .1 * .4);
  assert.equal(jazz.reason, "Matches your interests: music");
  const full = rankOne(sampleEvents[3]);
  closeTo(full.score, (.2 * Math.exp(-1) + .15) / .85);
});

test("missing coordinates on either side drop distance and redistribute its weight", () => {
  const event = { ...sampleEvents[0], lat: null, lng: null };
  const expected = (.4 * .7634349199257851 + .2 * Math.exp(-1 / 14) + .15 * .6 + .1 * .4) / .85;
  closeTo(rankOne(event).score, expected);
  closeTo(rankOne(sampleEvents[0], { interest_weights: profile.interest_weights }).score, expected);
  closeTo(rankOne({ ...event, lat: "", lng: "" }).score, expected);
});

test("distance uses 1 / (1 + km / 5), including latitude/longitude venue coordinates", () => {
  const km = 6371 * Math.PI / 180; // One degree along the equator.
  const event = { ...sampleEvents[0], lat: null, lng: null, venue: { latitude: 0, longitude: 1 } };
  const result = rankOne(event, { ...profile, latitude: 0, longitude: 0, lat: undefined, lng: undefined });
  closeTo(result.score, .4 * .7634349199257851 + .2 * Math.exp(-1 / 14) + .15 * .6 + .15 / (1 + km / 5) + .1 * .4);
});

test("cold start uses recency and popularity only, even with location and open spots", () => {
  const event = sampleEvents[0];
  const expected = (.2 * Math.exp(-1 / 14) + .15 * .6) / .35;
  closeTo(rankOne(event, {}).score, expected);
  closeTo(rankOne({ ...event, spots_left: 0 }, { lat: 1.3, lng: 103.8 }).score, expected);
  assert.equal(rankOne(event, {}).reason, "Starting soon");
});

test("selected interests work without learned weights; duplicate tags count once", () => {
  const user = { interests: ["music", "sports", "music"] };
  const single = rankOne(sampleEvents[0], user);
  const duplicate = rankOne({ ...sampleEvents[0], tags: ["music", "music"] }, user);
  closeTo(single.score, duplicate.score);
  closeTo(single.score, (.4 * .4467346701436833 + .2 * Math.exp(-1 / 14) + .15 * .6 + .1 * .4) / .85);
});

test("greedy diversity applies a maximum tag-overlap penalty", () => {
  const equal = { start_time: NOW, capacity: 10, confirmed_count: 5, spots_left: 5 };
  const events = [
    { ...equal, id: "a", tags: ["music"] },
    { ...equal, id: "b", tags: ["music"] },
    { ...equal, id: "c", tags: ["sports"], confirmed_count: 1 },
    { ...equal, id: "d", tags: ["music"] },
    { ...equal, id: "e", tags: ["arts"], start_time: daysFromNow(1), confirmed_count: 0 },
  ];
  assert.equal(RANKING_CONFIG.diversityPenalty, .3);
  assert.deepEqual(rankEvents(events, {}, { now: NOW }).map(r => r.event.id), ["a", "c", "b", "d", "e"]);
});

test("invalid/unlimited capacities and malformed values never produce NaN scores", () => {
  for (const capacity of [0, -1, null, undefined, Infinity]) {
    const result = rankOne({ ...sampleEvents[0], capacity });
    closeTo(result.score, .4 * .7634349199257851 + .2 * Math.exp(-1 / 14) + .15);
  }
  const result = rankOne({ ...sampleEvents[0], confirmed_count: Infinity, spots_left: NaN }, { interest_weights: { music: NaN, sports: -1 } });
  assert.ok(Number.isFinite(result.score));
});

test("signals are clamped when counts exceed capacity or are negative", () => {
  const result = rankOne({ ...sampleEvents[0], confirmed_count: 500, spots_left: -5 });
  closeTo(result.score, .4 * .7634349199257851 + .2 * Math.exp(-1 / 14) + .15 + .15);
});

test("empty input, limits, exclusions, invalid dates, and stable ties are supported", () => {
  assert.deepEqual(rankEvents([], profile, { now: NOW }), []);
  assert.deepEqual(rankEvents(sampleEvents, profile, { now: NOW, limit: 0 }), []);
  assert.equal(rankEvents(sampleEvents, profile, { now: NOW, limit: 2 }).length, 2);
  assert.ok(!rankEvents(sampleEvents, profile, { now: NOW, excludeEventIds: ["jazz"] }).some(r => r.event.id === "jazz"));
  assert.deepEqual(rankEvents([{ id: "invalid", start_time: "bad" }], profile, { now: NOW }), []);
  const twins = ["one", "two"].map(id => ({ ...sampleEvents[0], id, category: null }));
  assert.deepEqual(rankEvents(twins, profile, { now: NOW }).map(r => r.event.id), ["one", "two"]);
  assert.throws(() => rankEvents([], {}, { now: "bad" }), /valid date/);
  assert.throws(() => rankEvents([], {}, { limit: -1 }), /non-negative integer/);
});

test("ranking does not mutate events, tags, profile, options, or configuration", () => {
  const deepFreeze = object => {
    Object.values(object).forEach(value => { if (value && typeof value === "object") deepFreeze(value); });
    return Object.freeze(object);
  };
  const events = deepFreeze(structuredClone(sampleEvents));
  const user = deepFreeze(structuredClone(profile));
  const options = Object.freeze({ now: NOW, limit: 3 });
  assert.equal(rankEvents(events, user, options).length, 3);
  assert.deepEqual(events, sampleEvents);
  assert.deepEqual(user, profile);
  assert.ok(Object.isFrozen(RANKING_CONFIG.weights));
});
