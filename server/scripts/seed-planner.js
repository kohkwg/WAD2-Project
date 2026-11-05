// Sample past events for the automatic event planner. Safe to run more than once.
// Run from server/:   pnpm seed:planner           add the sample events (skips any already there)
//                     pnpm seed:planner --reset   remove everything it made
//
// It never creates users and needs no login: it uses the secret key, so it only has to
// know WHICH two existing accounts own the events. By default it takes the project's
// development test accounts from client/e2e-live/accounts.mjs:
//   organiser account    owns "your" past events (programme AND tasks), so sign in as
//                        this one to see the planner use your own history
//   participant account  owns the other organiser's events (the planner can only see
//                        their programme; their tasks stay private)
// To use other accounts, override either one (never commit real addresses):
//   --own-email=...  --community-email=...      or in server/.env:
//   SEED_PLANNER_OWN_EMAIL, SEED_PLANNER_COMMUNITY_EMAIL
//
// What it makes (all ended, so they stay out of Discover's upcoming list):
//   - 2 events for the first account: Coders Assembly, Hack Night (with tasks)
//   - 5 events for the second account: four tech meetups and one unrelated bake sale
// Titles start with "[TEST] " like the other test data; pass --plain-titles to drop it
// (for a demo where you type the exact name). Every event description ends with a
// marker, and --reset deletes only events carrying it that belong to those two accounts.
//
// Uses the secret key (bypasses RLS) like the other seed scripts. Run it only with the
// project owner's approval: it writes to the hosted database.

const { createClient } = require("@supabase/supabase-js");

const env = process.env;
const args = process.argv.slice(2);
const flag = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);

let admin;

const MARKER = " (sample data for the event planner)";
const PREFIX = args.includes("--plain-titles") ? "" : "[TEST] ";
const HOUR = 3600000;
const DAY = 86400000;

// programme: [title, startMinute, lengthMinutes, description]
const EVENTS = [
  {
    owner: "own", title: "Coders Assembly", category: "Tech", tags: ["tech"], capacity: 80, minutes: 240, daysAgo: 60,
    description: "A night of lightning talks, pizza and pair programming for student coders.",
    programme: [
      ["Registration and networking", 0, 30, "Check in, grab a name badge and meet people."],
      ["Opening remarks", 30, 15, "Welcome from the organisers."],
      ["Lightning talks", 45, 90, "Five-minute talks from students."],
      ["Pizza break", 135, 30, "Food and drinks."],
      ["Pair programming workshop", 165, 60, "Build something small in pairs."],
      ["Closing and mingle", 225, 15, "Wrap-up and photos."],
    ],
    tasks: [
      ["Book venue", "Confirm the room and the booking window."],
      ["Order pizza and drinks", "Count dietary needs first."],
      ["Print name badges", ""],
      ["Test AV equipment", "Projector, microphone and clicker."],
      ["Brief volunteers", "Roles, timings and the check-in process."],
      ["Send reminder email to attendees", "The day before."],
    ],
  },
  {
    owner: "own", title: "Hack Night", category: "Tech", tags: ["tech"], capacity: 60, minutes: 300, daysAgo: 120,
    description: "A build session where small teams ship a project in one evening.",
    programme: [
      ["Registration", 0, 30, ""],
      ["Kickoff and team forming", 30, 30, "Pitch ideas and form teams."],
      ["Hacking", 60, 180, "Build time with mentors on hand."],
      ["Demos", 240, 40, "Two minutes per team."],
      ["Awards and closing", 280, 20, ""],
    ],
    tasks: [
      ["Book venue", "Needs power sockets for every table."],
      ["Order dinner", ""],
      ["Print name badges", ""],
      ["Set up wifi and power strips", ""],
      ["Brief volunteers", ""],
    ],
  },
  ...[
    ["Python Meetup", 40, [["Registration", 0, 20, ""], ["Lightning talks", 20, 80, "Short talks on Python projects."], ["Live coding demo", 100, 30, ""], ["Networking", 150, 30, "Chat over snacks."]]],
    ["JavaScript Meetup", 75, [["Registration", 0, 20, ""], ["Lightning talks", 20, 80, ""], ["Q and A", 100, 20, ""], ["Networking", 150, 30, ""]]],
    ["Data Science Meetup", 110, [["Registration", 0, 20, ""], ["Lightning talks", 20, 90, ""], ["Networking", 150, 30, ""]]],
    ["AI Meetup", 160, [["Registration", 0, 20, ""], ["Lightning talks", 20, 80, ""], ["Panel discussion", 100, 40, ""], ["Networking", 150, 30, ""]]],
  ].map(([title, daysAgo, programme]) => ({
    owner: "community", title, category: "Tech", tags: ["tech", "career"], capacity: 50, minutes: 180, daysAgo,
    description: "A relaxed evening of short talks and networking for people who build software.",
    programme, tasks: [],
  })),
  {
    owner: "community", title: "Charity Bake Sale", category: "Food", tags: ["food", "volunteering"], capacity: 200, minutes: 240, daysAgo: 90,
    description: "Home-baked cakes and cookies sold in aid of a local charity.",
    programme: [["Setup", 0, 60, ""], ["Sales open", 60, 150, ""], ["Pack up", 210, 30, ""]],
    tasks: [],
  },
];

function must({ data, error }, what) {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

async function findUser(email) {
  for (let page = 1; ; page++) {
    const { users } = must(await admin.auth.admin.listUsers({ page, perPage: 1000 }), "list users");
    const match = users.find((user) => user.email === email);
    if (match) return match;
    if (users.length < 1000) throw new Error(`No existing account for ${email}. This script does not create users.`);
  }
}

async function interestIds(slugs) {
  const rows = must(await admin.from("interests").select("id, slug").in("slug", slugs), "load interests");
  return new Map(rows.map((row) => [row.slug, row.id]));
}

async function seed(owners) {
  const slugs = [...new Set(EVENTS.flatMap((event) => event.tags))];
  const interests = await interestIds(slugs);
  const now = Date.now();
  let created = 0;
  for (const spec of EVENTS) {
    const organiser = owners[spec.owner];
    const title = PREFIX + spec.title;
    const description = spec.description + MARKER;
    const existing = must(await admin.from("events").select("id").eq("organiser_id", organiser).eq("title", title).eq("description", description), "find event");
    if (existing.length) { console.log(`skip     ${title} (already there)`); continue; }

    const end = Math.floor((now - spec.daysAgo * DAY) / HOUR) * HOUR;
    const start = end - spec.minutes * 60000;
    // The insert trigger adds the organiser to event_members
    const event = must(await admin.from("events").insert({
      organiser_id: organiser, title, description, category: spec.category,
      starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString(),
      capacity: spec.capacity, status: "published", published_at: new Date(start - 14 * DAY).toISOString(),
    }).select("id").single(), `create ${title}`);

    const tagRows = spec.tags.filter((slug) => interests.has(slug)).map((slug) => ({ event_id: event.id, interest_id: interests.get(slug) }));
    if (tagRows.length) must(await admin.from("event_interests").insert(tagRows), `tag ${title}`);
    must(await admin.from("programme_items").insert(spec.programme.map(([name, at, length, text], index) => ({
      event_id: event.id, title: name, description: text || null, position: index,
      starts_at: new Date(start + at * 60000).toISOString(), ends_at: new Date(start + (at + length) * 60000).toISOString(),
    }))), `programme ${title}`);
    if (spec.tasks.length) {
      must(await admin.from("tasks").insert(spec.tasks.map(([name, text], index) => ({
        event_id: event.id, title: name, description: text || null, status: "done", position: index,
      }))), `tasks ${title}`);
    }
    created++;
    console.log(`created  ${title} (${spec.owner}, ${spec.programme.length} programme items, ${spec.tasks.length} tasks)`);
  }
  console.log(`Done: ${created} created.`);
}

async function reset(owners) {
  const ids = Object.values(owners);
  const rows = must(await admin.from("events").select("id, title").in("organiser_id", ids).like("description", `%${MARKER}`), "find sample events");
  for (const row of rows) {
    // deleting the event cascades to its programme, tasks, tags and members
    must(await admin.from("events").delete().eq("id", row.id), `delete ${row.title}`);
    console.log(`removed  ${row.title}`);
  }
  console.log(`Done: ${rows.length} removed.`);
}

// Which two accounts own the events: a flag, else server/.env, else the development
// test accounts listed in the repo. Returns emails (never printed) and where each came from.
async function chooseAccounts() {
  let defaults = {};
  try {
    ({ ACCOUNTS: defaults } = await import("../../client/e2e-live/accounts.mjs"));
  } catch {
    // not in this checkout: the flags or variables must be given
  }
  const own = flag("own-email") || env.SEED_PLANNER_OWN_EMAIL || defaults.organiser;
  const community = flag("community-email") || env.SEED_PLANNER_COMMUNITY_EMAIL || defaults.participant;
  const source = (explicit, fallback) => (explicit ? "your override" : fallback ? "client/e2e-live/accounts.mjs" : "missing");
  console.log(`Accounts: organiser events -> ${source(flag("own-email") || env.SEED_PLANNER_OWN_EMAIL, defaults.organiser)}, other organiser's events -> ${source(flag("community-email") || env.SEED_PLANNER_COMMUNITY_EMAIL, defaults.participant)}`);
  return { own, community };
}

async function main() {
  for (const name of ["SUPABASE_URL", "SUPABASE_SECRET_KEY"]) {
    if (!env[name]) {
      console.error(`Missing in server/.env: ${name}`);
      process.exit(1);
    }
  }
  const { own: OWN_EMAIL, community: COMMUNITY_EMAIL } = await chooseAccounts();
  if (!OWN_EMAIL || !COMMUNITY_EMAIL) {
    console.error("No test accounts found. Pass --own-email=... and --community-email=... (or set SEED_PLANNER_OWN_EMAIL and SEED_PLANNER_COMMUNITY_EMAIL).");
    process.exit(1);
  }
  if (OWN_EMAIL === COMMUNITY_EMAIL) {
    console.error("The two accounts must differ, or every event would count as your own.");
    process.exit(1);
  }

  admin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const owners = { own: (await findUser(OWN_EMAIL)).id, community: (await findUser(COMMUNITY_EMAIL)).id };
  if (args.includes("--reset")) await reset(owners);
  else await seed(owners);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { EVENTS }; // for tests/planSeed.test.js
