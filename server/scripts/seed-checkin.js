// Test data for Feature 3 (check-in). Safe to run more than once.
// Run from server/:   pnpm seed:checkin            create / refresh
//                     pnpm seed:checkin --reset    remove everything it made
//
// Creates (all clearly marked as test data):
//   - users  checkin-organiser@bookedz.test   organiser of the test event
//            checkin-helper@bookedz.test      helper (can scan, can't export emails)
//            checkin-p1..p4@bookedz.test      confirmed participants
//            checkin-p5@bookedz.test          pending participant (scan should be refused)
//   - venue  "[TEST] SMU SCIS 1" with coordinates (for the far_from_venue check later)
//   - event  "[TEST] Check-in demo", published, started 30 min ago, ends in 6 h,
//            so check-ins don't get the outside_event_window flag. Re-running moves
//            the times to "now" again.
// Password for every test user: SEED_PASSWORD in .env, or the default below.
//
// Uses the secret key (bypasses RLS) because only an admin can create confirmed
// users. The app itself never uses this key.

const { createClient } = require("@supabase/supabase-js");

const env = process.env;
for (const name of ["SUPABASE_URL", "SUPABASE_SECRET_KEY"]) {
  if (!env[name]) {
    console.error(`Missing in server/.env: ${name}`);
    process.exit(1);
  }
}

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PASSWORD = env.SEED_PASSWORD || "Bookedz-test-2026";
const EVENT_TITLE = "[TEST] Check-in demo";
const VENUE_NAME = "[TEST] SMU SCIS 1";

const USERS = [
  { key: "organiser", email: "checkin-organiser@bookedz.test", name: "Test Organiser" },
  { key: "helper", email: "checkin-helper@bookedz.test", name: "Test Helper" },
  { key: "p1", email: "checkin-p1@bookedz.test", name: "Alice Tan", status: "confirmed" },
  { key: "p2", email: "checkin-p2@bookedz.test", name: "Ben Lim", status: "confirmed" },
  { key: "p3", email: "checkin-p3@bookedz.test", name: "Chloe Ng", status: "confirmed" },
  { key: "p4", email: "checkin-p4@bookedz.test", name: "Daniel Koh", status: "confirmed" },
  { key: "p5", email: "checkin-p5@bookedz.test", name: "Esther Goh", status: "pending" },
];

function must({ data, error }, what) {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

// Finds our test users by email. Only ever returns the @bookedz.test accounts.
async function findTestUsers() {
  const wanted = new Set(USERS.map((u) => u.email));
  const found = new Map();
  for (let page = 1; ; page++) {
    const { users } = must(await admin.auth.admin.listUsers({ page, perPage: 1000 }), "list users");
    for (const u of users) if (wanted.has(u.email)) found.set(u.email, u);
    if (users.length < 1000) return found;
  }
}

async function findTestEvent(organiserId) {
  const rows = must(
    await admin.from("events").select("id").eq("title", EVENT_TITLE).eq("organiser_id", organiserId),
    "find event",
  );
  return rows[0] ?? null;
}

async function seed() {
  // 1. users (created confirmed, so no email is sent and they can log in straight away)
  const existing = await findTestUsers();
  const ids = {};
  for (const u of USERS) {
    let user = existing.get(u.email);
    if (!user) {
      user = must(
        await admin.auth.admin.createUser({
          email: u.email,
          password: PASSWORD,
          email_confirm: true,
          user_metadata: { full_name: u.name },
        }),
        `create ${u.email}`,
      ).user;
    } else {
      must(await admin.auth.admin.updateUserById(user.id, { password: PASSWORD }), `reset password ${u.email}`);
    }
    ids[u.key] = user.id;
  }

  // 2. venue
  let venue = must(await admin.from("venues").select("id").eq("name", VENUE_NAME), "find venue")[0];
  if (!venue) {
    venue = must(
      await admin
        .from("venues")
        .insert({
          name: VENUE_NAME,
          address: "80 Stamford Rd, Singapore 178902",
          postal_code: "178902",
          latitude: 1.2973,
          longitude: 103.8495,
          is_indoor: true,
          created_by: ids.organiser,
        })
        .select("id")
        .single(),
      "create venue",
    );
  }

  // 3. event: the insert trigger adds the organiser to event_members and creates event_secrets
  const startsAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const endsAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
  let event = await findTestEvent(ids.organiser);
  if (event) {
    must(await admin.from("events").update({ starts_at: startsAt, ends_at: endsAt }).eq("id", event.id), "update event");
  } else {
    event = must(
      await admin
        .from("events")
        .insert({
          organiser_id: ids.organiser,
          title: EVENT_TITLE,
          description: "Test event for Feature 3 check-in. Safe to delete.",
          starts_at: startsAt,
          ends_at: endsAt,
          venue_id: venue.id,
          capacity: 50,
          status: "published",
        })
        .select("id")
        .single(),
      "create event",
    );
  }

  // 4. helper on the team
  must(
    await admin
      .from("event_members")
      .upsert({ event_id: event.id, user_id: ids.helper, member_role: "helper" }, { onConflict: "event_id,user_id" }),
    "add helper",
  );

  // 5. registrations
  for (const u of USERS.filter((x) => x.status)) {
    must(
      await admin
        .from("registrations")
        .upsert({ event_id: event.id, user_id: ids[u.key], status: u.status }, { onConflict: "event_id,user_id" }),
      `register ${u.email}`,
    );
  }

  const regs = must(
    await admin.from("registrations").select("user_id, status, qr_token").eq("event_id", event.id),
    "read registrations",
  );
  const byUser = new Map(regs.map((r) => [r.user_id, r]));

  console.log(`\nSeeded "${EVENT_TITLE}"`);
  console.log(`  event id   ${event.id}`);
  console.log(`  password   ${PASSWORD}   (all test users)\n`);
  for (const u of USERS) {
    const r = byUser.get(ids[u.key]);
    const extra = r ? `${r.status.padEnd(9)} qr_token ${r.qr_token}` : u.key;
    console.log(`  ${u.email.padEnd(32)} ${u.name.padEnd(15)} ${extra}`);
  }
  console.log(`\nSign in at http://127.0.0.1:5173/login as the organiser or a participant.`);
  console.log(`Paste a qr_token into the staff station's "No camera?" box to test scanning.\n`);
}

async function reset() {
  const existing = await findTestUsers();
  const organiser = existing.get(USERS[0].email);
  if (organiser) {
    const event = await findTestEvent(organiser.id);
    // deleting the event cascades to registrations, check_ins, event_members, event_secrets
    if (event) must(await admin.from("events").delete().eq("id", event.id), "delete event");
  }
  must(await admin.from("venues").delete().eq("name", VENUE_NAME), "delete venue");
  for (const u of existing.values()) must(await admin.auth.admin.deleteUser(u.id), `delete ${u.email}`);
  console.log(`Removed the test event, venue and ${existing.size} test user(s).`);
}

(process.argv.includes("--reset") ? reset() : seed()).catch((err) => {
  console.error(`\nFailed: ${err.message}`);
  if (/Invalid API key/i.test(err.message)) {
    console.error("SUPABASE_SECRET_KEY in server/.env is wrong. It should start with sb_secret_.");
  }
  process.exit(1);
});
