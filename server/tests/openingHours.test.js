import { test } from "vitest";
const assert = require("node:assert/strict");
const { openState } = require("../services/openingHours");

// Singapore local time to ms. 2026-11-06 is a Friday, 2026-11-07 a Saturday, 2026-11-08 a Sunday.
const sg = (date, time) => Date.parse(`${date}T${time}:00+08:00`);

test("every-day hours: open inside, closed outside", () => {
  assert.equal(openState("Mo-Su 07:30-21:00", sg("2026-11-07", "12:30")), "open");
  assert.equal(openState("Mo-Su 07:30-21:00", sg("2026-11-07", "21:00")), "closed");
  assert.equal(openState("Mo-Su 07:30-21:00", sg("2026-11-07", "07:00")), "closed");
});

test("weekday and weekend rules, including a closed weekend and holidays", () => {
  const hours = "Mo-Fr 08:00-19:00, Sa-Su, PH closed";
  assert.equal(openState(hours, sg("2026-11-06", "18:30")), "open");
  assert.equal(openState(hours, sg("2026-11-06", "19:30")), "closed");
  assert.equal(openState(hours, sg("2026-11-07", "12:00")), "closed");
});

test("wrap-around day ranges", () => {
  const hours = "Su-Th 10:00-19:00; Fr-Sa 10:00-22:00";
  assert.equal(openState(hours, sg("2026-11-08", "18:00")), "open"); // Sunday
  assert.equal(openState(hours, sg("2026-11-08", "20:00")), "closed");
  assert.equal(openState(hours, sg("2026-11-06", "21:00")), "open"); // Friday
});

test("split hours and past midnight", () => {
  assert.equal(openState("11:00-14:00,17:00-22:00", sg("2026-11-07", "15:00")), "closed");
  assert.equal(openState("11:00-14:00,17:00-22:00", sg("2026-11-07", "18:00")), "open");
  assert.equal(openState("Fr 18:00-02:00", sg("2026-11-07", "01:00")), "open"); // Saturday 1am
  assert.equal(openState("Fr 18:00-02:00", sg("2026-11-07", "03:00")), "closed");
});

test("24/7, missing and unreadable hours", () => {
  assert.equal(openState("24/7", sg("2026-11-07", "03:00")), "open");
  assert.equal(openState(null, sg("2026-11-07", "12:00")), "unknown");
  assert.equal(openState("Jan-Mar Mo-Fr 09:00-17:00", sg("2026-11-06", "12:00")), "unknown");
  assert.equal(openState("Mo-Fr 09:00-17:00; sunrise-sunset", sg("2026-11-06", "12:00")), "unknown");
});
