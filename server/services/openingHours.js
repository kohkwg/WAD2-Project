// Whether a place is open at a time, from its OpenStreetMap opening_hours text (Geoapify passes
// it through). Covers the common forms: "24/7", "Mo-Fr 08:00-19:00; Sa,Su 09:00-18:00",
// "Su-Th 10:00-19:00; Fr-Sa 10:00-22:00", split hours "11:00-14:00,17:00-22:00", past midnight
// "18:00-02:00", and "off"/"closed" days. Anything else (months, dates, sunrise, week numbers)
// gives "unknown" rather than a guess. Times are Singapore local time.
//   openState("Mo-Su 07:30-21:00", Date.parse("2026-11-07T04:30:00Z")) -> "open"
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const DAY = /^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/;
const RANGE = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})\+?$/;

// Singapore day (0 = Sunday) and minutes past midnight
function sgDayMinutes(ms) {
  const d = new Date(ms + 8 * 60 * 60 * 1000);
  return { day: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

function daysOf(token) {
  const m = token.match(DAY);
  const from = DAYS.indexOf(m[1]);
  const to = m[2] ? DAYS.indexOf(m[2]) : from;
  const days = [];
  for (let i = from; ; i = (i + 1) % 7) { days.push(i); if (i === to) break; }
  return days;
}

// [{ days: number[] | null (every day), ranges: [[start, end]] (minutes; end may pass 24:00), closed }]
function parse(text) {
  const tokens = String(text).replace(/;/g, " ; ").replace(/,/g, " , ").split(/\s+/).filter(Boolean);
  const rules = [];
  let rule = null;
  const start = () => { rule = { days: null, ranges: [], closed: false }; rules.push(rule); };
  start();
  for (const token of tokens) {
    if (token === ";") { start(); continue; }
    if (token === ",") continue;
    if (token === "PH" || token === "SH") { if (!rule.days) rule.days = []; continue; } // holidays aren't checked
    if (DAY.test(token)) {
      // A day after this rule already has times (or is closed) begins a new rule
      if (rule.ranges.length || rule.closed) start();
      rule.days = [...(rule.days || []), ...daysOf(token)];
      continue;
    }
    const range = token.match(RANGE);
    if (range) {
      const from = Number(range[1]) * 60 + Number(range[2]);
      let to = Number(range[3]) * 60 + Number(range[4]);
      if (to <= from) to += 24 * 60; // past midnight
      if (from > 24 * 60 || to > 48 * 60) return null;
      rule.ranges.push([from, to]);
      continue;
    }
    if (token === "off" || token === "closed") { rule.closed = true; continue; }
    return null; // a form this reader doesn't understand
  }
  return rules.filter((r) => r.ranges.length || r.closed || (r.days && r.days.length));
}

// The rule in force on a day: the last one that names it (later rules replace earlier ones)
function ruleFor(rules, day) {
  let found = null;
  for (const r of rules) if (!r.days || r.days.includes(day)) found = r;
  return found;
}

function openState(text, atMs) {
  if (!text || !Number.isFinite(atMs)) return "unknown";
  if (String(text).trim() === "24/7") return "open";
  const rules = parse(text);
  if (!rules || !rules.length) return "unknown";
  const { day, minutes } = sgDayMinutes(atMs);
  const today = ruleFor(rules, day);
  if (today && !today.closed && today.ranges.some(([from, to]) => minutes >= from && minutes < to)) return "open";
  // Still open from last night (e.g. Fr 18:00-02:00 at 01:00 on Saturday)
  const yesterday = ruleFor(rules, (day + 6) % 7);
  if (yesterday && !yesterday.closed && yesterday.ranges.some(([, to]) => to > 24 * 60 && minutes < to - 24 * 60)) return "open";
  // Days the hours never mention count as closed only when every rule names its days
  if (!today && rules.some((r) => !r.days)) return "unknown";
  return "closed";
}

module.exports = { openState };
