const express = require("express");
const supabaseForUser = require("../lib/userSupabase");
const requireAuth = require("../lib/requireAuth");
const { suggestPlan } = require("../services/planSuggest");

const router = express.Router();

const EVENT_COLUMNS = "id, organiser_id, title, description, category, starts_at, ends_at, capacity, event_interests(interests(slug))";
const PAST_STATUSES = ["published", "completed"];
const MAX_TEXT_MATCHES = 60;
const MAX_EXACT_MATCHES = 20;
const MAX_OWN_EVENTS = 100;

const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");

function readTarget(body) {
  const title = text(body?.title, 200);
  if (!title) return null;
  const capacity = Number.isInteger(body?.capacity) && body.capacity > 0 ? body.capacity : null;
  const date = value => (typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null);
  return {
    title,
    description: text(body?.description, 5000),
    category: text(body?.category, 100),
    tags: (Array.isArray(body?.tags) ? body.tags : []).filter(tag => typeof tag === "string").slice(0, 20).map(tag => tag.trim().slice(0, 50)),
    capacity,
    startsAt: date(body?.startsAt),
    endsAt: date(body?.endsAt),
  };
}

// OR of the target's words for Postgres full-text search (ASCII words only; other
// scripts are still found through the exact-title query).
function tsQuery(target) {
  const words = `${target.title} ${target.category} ${target.tags.join(" ")}`.toLowerCase().match(/[a-z0-9]{2,}/g) || [];
  return [...new Set(words)].slice(0, 12).join(" | ");
}

const escapeLike = value => value.replace(/[\\%_]/g, match => `\\${match}`);

function check({ data, error }) {
  if (error) throw error;
  return data || [];
}

async function loadCandidates(supabase, userId, target) {
  const nowIso = new Date().toISOString();
  const past = () => supabase.from("events").select(EVENT_COLUMNS).in("status", PAST_STATUSES).lt("ends_at", nowIso);
  const words = tsQuery(target);
  const [matches, exact, mine] = await Promise.all([
    words ? past().textSearch("search_vector", words, { config: "english" }).limit(MAX_TEXT_MATCHES) : { data: [] },
    past().ilike("title", escapeLike(target.title)).limit(MAX_EXACT_MATCHES),
    past().eq("organiser_id", userId).order("ends_at", { ascending: false }).limit(MAX_OWN_EVENTS),
  ]);
  const events = new Map();
  for (const row of [...check(matches), ...check(exact), ...check(mine)]) events.set(row.id, row);
  const ids = [...events.keys()];
  if (!ids.length) return [];
  const ownIds = ids.filter(id => events.get(id).organiser_id === userId);

  // Programme follows event visibility. Tasks, registrations and check-ins are only
  // read for the caller's own events (the database refuses the rest anyway).
  const [programme, tasks, registrations, checkIns] = await Promise.all([
    supabase.from("programme_items").select("event_id, title, description, starts_at, ends_at, position").in("event_id", ids),
    ownIds.length ? supabase.from("tasks").select("event_id, title, description, position").in("event_id", ownIds) : { data: [] },
    ownIds.length ? supabase.from("registrations").select("event_id").in("event_id", ownIds).eq("status", "confirmed") : { data: [] },
    ownIds.length ? supabase.from("check_ins").select("event_id").in("event_id", ownIds) : { data: [] },
  ]);
  const group = rows => check(rows).reduce((map, row) => map.set(row.event_id, [...(map.get(row.event_id) || []), row]), new Map());
  const programmeBy = group(programme), tasksBy = group(tasks), registeredBy = group(registrations), checkedBy = group(checkIns);

  return ids.map(id => {
    const row = events.get(id);
    const own = row.organiser_id === userId;
    const confirmed = (registeredBy.get(id) || []).length;
    return {
      id,
      title: row.title,
      description: row.description || "",
      category: row.category || "",
      tags: (row.event_interests || []).map(link => link.interests?.slug).filter(Boolean),
      capacity: row.capacity,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      own,
      attendance: own && confirmed > 0 ? Math.min(1, (checkedBy.get(id) || []).length / confirmed) : null,
      programme: (programmeBy.get(id) || []).sort((a, b) => a.position - b.position).map(item => ({ title: item.title, description: item.description, startsAt: item.starts_at, endsAt: item.ends_at })),
      tasks: own ? (tasksBy.get(id) || []).sort((a, b) => a.position - b.position).map(task => ({ title: task.title, notes: task.description, position: task.position })) : [],
    };
  });
}

// POST /api/plan-suggestions   { title, description?, category?, tags?, capacity?, startsAt?, endsAt? }
// Suggests programme items (as fractions of the event's length) and tasks from past events.
router.post("/", requireAuth, async (req, res) => {
  const target = readTarget(req.body);
  if (!target) return res.status(400).json({ error: "An event title is required." });
  try {
    const supabase = supabaseForUser(req.accessToken);
    const candidates = await loadCandidates(supabase, req.user.id, target);
    res.json(suggestPlan(target, candidates));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not build plan suggestions. Please try again." });
  }
});

module.exports = router;
