// Checks that the server can do CRUD against Cloudflare R2 and Supabase.
// Run from server/:  npm run test:crud
//
// R2:       put → get → overwrite → signed GET link → delete → confirm gone
// Supabase: makes a throwaway confirmed user (secret key), signs in as them
//           (publishable key, so RLS applies like in the real app), then
//           create → read → update → delete an event, and checks that changing
//           avatar_key queues the old R2 key in storage_cleanup_queue.
// Everything it creates is removed at the end, even if a step fails.

const { randomUUID } = require("node:crypto");
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { createClient } = require("@supabase/supabase-js");

const env = process.env;
const required = [
  "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET",
  "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY",
];
const missing = required.filter((name) => !env[name]);
if (missing.length) {
  console.error(`Missing in server/.env: ${missing.join(", ")}`);
  process.exit(1);
}

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});
const Bucket = env.R2_BUCKET;

// Secret key: bypasses RLS. Only used here to make/remove the test user and
// read the cleanup queue (which has no policies).
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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
function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

async function r2Exists(Key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket, Key }));
    return true;
  } catch (err) {
    if (err.$metadata?.httpStatusCode === 404) return false;
    throw err;
  }
}

async function testR2() {
  console.log("\nR2");
  const Key = `crud-check/${randomUUID()}.txt`;

  try {
    await step("create (upload object)", async () => {
      await r2.send(new PutObjectCommand({ Bucket, Key, Body: "hello", ContentType: "text/plain" }));
    });

    await step("read (download object)", async () => {
      const res = await r2.send(new GetObjectCommand({ Bucket, Key }));
      const body = await res.Body.transformToString();
      check(body === "hello", `expected "hello", got "${body}"`);
    });

    await step("update (overwrite object)", async () => {
      await r2.send(new PutObjectCommand({ Bucket, Key, Body: "updated", ContentType: "text/plain" }));
      const res = await r2.send(new GetObjectCommand({ Bucket, Key }));
      const body = await res.Body.transformToString();
      check(body === "updated", `expected "updated", got "${body}"`);
    });

    await step("signed link works (how the browser will view images)", async () => {
      const url = await getSignedUrl(r2, new GetObjectCommand({ Bucket, Key }), { expiresIn: 60 });
      const res = await fetch(url);
      check(res.ok, `signed link returned HTTP ${res.status}`);
      check((await res.text()) === "updated", "signed link returned the wrong content");
    });

    await step("delete (remove object)", async () => {
      await r2.send(new DeleteObjectCommand({ Bucket, Key }));
      check(!(await r2Exists(Key)), "object still exists after delete");
    });
  } finally {
    await r2.send(new DeleteObjectCommand({ Bucket, Key })).catch(() => {});
  }
}

async function testSupabase() {
  console.log("\nSupabase");
  const email = `crud-check-${randomUUID()}@example.com`;
  const password = randomUUID();
  let userId;
  let eventId;
  let avatarKey;

  // Signed in as the test user — every query below goes through RLS.
  const user = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    await step("make test user and sign in", async () => {
      const created = unwrap(await admin.auth.admin.createUser({ email, password, email_confirm: true }));
      userId = created.user.id;
      unwrap(await user.auth.signInWithPassword({ email, password }));
    });
    if (!userId) return;

    await step("signup trigger created a profile", async () => {
      const profile = unwrap(await user.from("profiles").select("id").eq("id", userId).single());
      check(profile.id === userId, "profile id does not match user");
    });

    const startsAt = new Date(Date.now() + 7 * 864e5);
    const endsAt = new Date(startsAt.getTime() + 2 * 36e5);

    await step("create (insert event)", async () => {
      const event = unwrap(
        await user
          .from("events")
          .insert({ title: "CRUD check", starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() })
          .select("id, organiser_id, status")
          .single()
      );
      eventId = event.id;
      check(event.organiser_id === userId, "organiser_id was not set to the signed-in user");
      check(event.status === "draft", `expected status "draft", got "${event.status}"`);
    });

    await step("read (select event)", async () => {
      const event = unwrap(await user.from("events").select("title").eq("id", eventId).single());
      check(event.title === "CRUD check", `unexpected title "${event.title}"`);
    });

    await step("update (rename event)", async () => {
      const rows = unwrap(
        await user.from("events").update({ title: "CRUD check (updated)" }).eq("id", eventId).select("title")
      );
      check(rows.length === 1, "no row updated — RLS may be blocking the organiser");
      check(rows[0].title === "CRUD check (updated)", "title did not change");
    });

    await step("delete (remove event)", async () => {
      unwrap(await user.from("events").delete().eq("id", eventId));
      const rows = unwrap(await user.from("events").select("id").eq("id", eventId));
      check(rows.length === 0, "event still exists after delete");
      eventId = undefined;
    });

    await step("RLS blocks editing someone else's data", async () => {
      // The test user tries to rename a profile that is not theirs; RLS should match 0 rows.
      const rows = unwrap(
        await user.from("profiles").update({ display_name: "hacked" }).neq("id", userId).select("id")
      );
      check(rows.length === 0, `updated ${rows.length} other profile(s) — RLS is not working`);
    });

    await step("R2 + Supabase: changing avatar_key queues the old file for cleanup", async () => {
      avatarKey = `avatars/${userId}/${randomUUID()}.txt`;
      await r2.send(new PutObjectCommand({ Bucket, Key: avatarKey, Body: "avatar", ContentType: "text/plain" }));
      unwrap(await user.from("profiles").update({ avatar_key: avatarKey }).eq("id", userId));
      unwrap(await user.from("profiles").update({ avatar_key: null }).eq("id", userId));

      const queued = unwrap(
        await admin.from("storage_cleanup_queue").select("id").eq("backend", "r2").eq("object_key", avatarKey)
      );
      check(queued.length === 1, `expected 1 queue row for the old avatar, found ${queued.length}`);

      // What the real cleanup job will do: delete the file, then the queue row.
      await r2.send(new DeleteObjectCommand({ Bucket, Key: avatarKey }));
      unwrap(await admin.from("storage_cleanup_queue").delete().eq("id", queued[0].id));
      check(!(await r2Exists(avatarKey)), "avatar file still in R2");
    });
  } finally {
    if (eventId) await admin.from("events").delete().eq("id", eventId);
    if (avatarKey) {
      await r2.send(new DeleteObjectCommand({ Bucket, Key: avatarKey })).catch(() => {});
      await admin.from("storage_cleanup_queue").delete().eq("object_key", avatarKey);
    }
    if (userId) await admin.auth.admin.deleteUser(userId); // profile cascades
  }
}

(async () => {
  await testR2();
  await testSupabase();
  console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
  process.exit(failures ? 1 : 0);
})();
