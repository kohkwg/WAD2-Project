// Checks every Supabase call Feature 3's pages make, against the real database.
// Run from server/ AFTER `pnpm seed:checkin`:   pnpm test:checkin
//
// Signs in as the seeded test users with the PUBLISHABLE key, so RLS and the
// database functions behave exactly like they do in the browser. Covers:
//   My Ticket query, staff scan (new / repeat / pending / wrong code / not staff),
//   venue secret read + rotate, self check-in (old secret / new secret / pending),
//   dashboard queries, Realtime INSERT events, CSV export (helper vs organiser),
//   CSV import (matched + unmatched).
// Deletes the test event's check-ins at the start and end, so it can be re-run.

const { createClient } = require("@supabase/supabase-js");

const env = process.env;
for (const name of ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"]) {
  if (!env[name]) {
    console.error(`Missing in server/.env: ${name}`);
    process.exit(1);
  }
}
const PASSWORD = env.SEED_PASSWORD || "Bookedz-test-2026";
const EVENT_TITLE = "[TEST] Check-in demo";

let failures = 0;
async function step(name, fn) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failures++;
    console.log(`  FAIL  ${name}\n        ${err.message}`);
  }
}
function check(condition, message) {
  if (!condition) throw new Error(message);
}
async function expectError(promise, fragment) {
  const { error } = await promise;
  check(error, `expected an error containing "${fragment}", got success`);
  check(error.message.includes(fragment), `expected "${fragment}", got "${error.message}"`);
}

async function signIn(who) {
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: `checkin-${who}@bookedz.test`,
    password: PASSWORD,
  });
  if (error) throw new Error(`sign in as ${who}: ${error.message} (did you run pnpm seed:checkin?)`);
  client.userId = data.user.id;
  return client;
}

async function main() {
  const [org, helper, p1, p2, p5] = await Promise.all(["organiser", "helper", "p1", "p2", "p5"].map(signIn));

  const { data: events } = await org.from("events").select("id").eq("title", EVENT_TITLE).eq("organiser_id", org.userId);
  check(events?.length, `"${EVENT_TITLE}" not found. Run pnpm seed:checkin first.`);
  const eventId = events[0].id;
  console.log(`Event ${eventId}\n`);

  const clearCheckIns = () => org.from("check_ins").delete().eq("event_id", eventId);
  await clearCheckIns();

  // tokens, read the same way the My Ticket page does (each user sees only their own)
  const myReg = async (client) =>
    (
      await client
        .from("registrations")
        .select("id, status, qr_token, ticket_code")
        .eq("event_id", eventId)
        .eq("user_id", client.userId)
        .maybeSingle()
    ).data;
  const r1 = await myReg(p1);
  const r5 = await myReg(p5);

  console.log("My Ticket");
  await step("participant reads own confirmed registration + qr_token", () => {
    check(r1?.status === "confirmed" && r1.qr_token, `got ${JSON.stringify(r1)}`);
  });
  await step("participant cannot read the venue secret (RLS)", async () => {
    const { data } = await p1.from("event_secrets").select("checkin_secret").eq("event_id", eventId);
    check(data?.length === 0, "participant could read event_secrets!");
  });

  // Realtime: listen like the dashboard does, before anything is inserted
  const realtimeInserts = [];
  const channel = org
    .channel(`check-${eventId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "check_ins", filter: `event_id=eq.${eventId}` }, (p) =>
      realtimeInserts.push(p.new),
    );
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Realtime did not subscribe within 10 s")), 10_000);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(t);
        setTimeout(resolve, 1000); // changes start flowing slightly after SUBSCRIBED
      }
    });
  }).catch((e) => console.log(`  WARN  ${e.message}`));

  console.log("\nStaff station");
  let firstRow;
  await step("helper scans a confirmed ticket -> checked in", async () => {
    const { data, error } = await helper.rpc("staff_check_in", { p_event_id: eventId, p_code: r1.qr_token, p_method: "personal_qr" });
    check(!error, error?.message);
    check(data.registration_id === r1.id && data.method === "personal_qr", JSON.stringify(data));
    firstRow = data;
  });
  await step("scanning the same ticket again returns the same row (no duplicate)", async () => {
    const { data, error } = await helper.rpc("staff_check_in", { p_event_id: eventId, p_code: r1.qr_token, p_method: "personal_qr" });
    check(!error, error?.message);
    check(data.id === firstRow.id, "a second check-in row was created");
  });
  await step("pending registration is refused", () =>
    expectError(helper.rpc("staff_check_in", { p_event_id: eventId, p_code: r5.qr_token, p_method: "personal_qr" }), "This registration is pending"),
  );
  await step("unknown code is refused", () =>
    expectError(helper.rpc("staff_check_in", { p_event_id: eventId, p_code: "not-a-real-token", p_method: "personal_qr" }), "Ticket not found"),
  );
  await step("a participant can't use the staff station", () =>
    expectError(p2.rpc("staff_check_in", { p_event_id: eventId, p_code: r1.qr_token, p_method: "personal_qr" }), "Only organisers and helpers"),
  );

  console.log("\nVenue QR + self check-in");
  let oldSecret;
  let newSecret;
  await step("organiser reads the venue secret", async () => {
    const { data, error } = await org.from("event_secrets").select("checkin_secret, rotated_at").eq("event_id", eventId).single();
    check(!error, error?.message);
    oldSecret = data.checkin_secret;
  });
  await step("rotating gives a new secret", async () => {
    const { data, error } = await helper.rpc("rotate_checkin_secret", { p_event_id: eventId });
    check(!error, error?.message);
    check(data && data !== oldSecret, "secret did not change");
    newSecret = data;
  });
  await step("a participant can't rotate the secret", () => expectError(p2.rpc("rotate_checkin_secret", { p_event_id: eventId }), "Not allowed"));
  await step("self check-in with the OLD secret is refused", () =>
    expectError(p2.rpc("self_check_in", { p_event_id: eventId, p_secret: oldSecret, p_device_id: "test-device-1", p_lat: 1.2973, p_lng: 103.8495 }), "Invalid or expired"),
  );
  await step("self check-in with the current secret works, stores device + location", async () => {
    const { data, error } = await p2.rpc("self_check_in", {
      p_event_id: eventId, p_secret: newSecret, p_device_id: "test-device-1", p_lat: 1.2973, p_lng: 103.8495,
    });
    check(!error, error?.message);
    check(data.method === "scan_in_qr" && data.device_id === "test-device-1" && data.latitude === 1.2973, JSON.stringify(data));
    check(data.fraud_flag === false, `unexpected fraud flag: ${data.fraud_reasons}`);
  });
  await step("pending participant can't self check-in", () =>
    expectError(p5.rpc("self_check_in", { p_event_id: eventId, p_secret: newSecret, p_device_id: "test-device-5", p_lat: null, p_lng: null }), "confirmed registration"),
  );

  console.log("\nDashboard");
  await step("confirmed registrations with names (4 confirmed in the seed)", async () => {
    const { data, error } = await org
      .from("registrations")
      .select("id, profiles!registrations_user_id_fkey(display_name)")
      .eq("event_id", eventId)
      .eq("status", "confirmed");
    check(!error, error?.message);
    check(data.length === 4, `expected 4, got ${data.length}`);
    check(data.every((r) => r.profiles?.display_name), "a display name is missing");
  });
  await step("check_ins list shows the 2 arrivals so far", async () => {
    const { data, error } = await org.from("check_ins").select("*").eq("event_id", eventId);
    check(!error, error?.message);
    check(data.length === 2, `expected 2, got ${data.length}`);
  });
  await step("Realtime delivered both INSERTs", async () => {
    await new Promise((r) => setTimeout(r, 2000));
    check(realtimeInserts.length === 2, `received ${realtimeInserts.length} event(s)`);
  });

  console.log("\nCSV");
  let exported = [];
  await step("helper export returns no rows (organisers only)", async () => {
    const { data, error } = await helper.rpc("export_attendance", { p_event_id: eventId });
    check(!error, error?.message);
    check(data.length === 0, `helper got ${data.length} rows with emails`);
  });
  await step("organiser export returns everyone, with emails", async () => {
    const { data, error } = await org.rpc("export_attendance", { p_event_id: eventId });
    check(!error, error?.message);
    check(data.length === 5 && data.every((r) => r.email), `got ${data.length} rows`);
    exported = data;
  });
  await step("import matches by email and by ticket code, reports the unmatched row", async () => {
    const chloe = exported.find((r) => r.display_name === "Chloe Ng");
    const daniel = exported.find((r) => r.display_name === "Daniel Koh");
    const rows = [
      { email: chloe.email.toUpperCase(), ticket_code: "", checked_in_at: "" },
      { email: "", ticket_code: daniel.ticket_code.toLowerCase(), checked_in_at: "" },
      { email: "nobody@example.com", ticket_code: "", checked_in_at: "" },
    ];
    const { data, error } = await org.rpc("import_attendance", { p_event_id: eventId, p_rows: rows });
    check(!error, error?.message);
    const { matched, unmatched } = data[0];
    check(matched === 2, `matched ${matched}`);
    check(unmatched.length === 1 && unmatched[0].email === "nobody@example.com", JSON.stringify(unmatched));
  });
  await step("all 4 confirmed participants are now checked in", async () => {
    const { count } = await org.from("check_ins").select("*", { count: "exact", head: true }).eq("event_id", eventId);
    check(count === 4, `expected 4, got ${count}`);
  });

  await org.removeChannel(channel);
  await clearCheckIns();
  console.log(failures ? `\n${failures} check(s) failed.` : "\nAll check-in checks passed.");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(`\nFailed: ${err.message}`);
  process.exit(1);
});
