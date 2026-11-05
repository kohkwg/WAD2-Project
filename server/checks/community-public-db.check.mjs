// isolated postgresql verification of docs/sql/community-public-browse-draft.sql. never reads .env or
// uses a database url. pass the path to a temporary pglite runtime module; no
// application dependency is added. usage:
//   node server/checks/community-public-db.check.mjs <tmp>/node_modules/@electric-sql/pglite/dist/index.js
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
if (!process.argv[2]) throw new Error('Pass the local path to the PGlite runtime module');

const {
  PGlite
} = await import(pathToFileURL(process.argv[2]).href);

const db = new PGlite();

let passed = 0,
  failed = 0;

function expect(value, message) {
  if (!value) throw new Error(message);
}

async function test(name, run) {
  try {
    await run();
    passed++;
    console.log('PASS', name);
  } catch (error) {
    failed++;
    console.log('FAIL', name, error.code || '', error.message);
  }
}

async function query(sql, params = []) {
  return (await db.query(sql, params)).rows;
}

async function rejects(sql, params, pattern) {
  try {
    await query(sql, params);
  } catch (error) {
    expect(pattern.test(error.message), `Unexpected rejection: ${error.message}`);
    return;
  }
  throw new Error('Expected SQL rejection');
}

const HOST = '20000000-0000-4000-8000-000000000001';

const BOB = '20000000-0000-4000-8000-000000000002';

const CARA = '20000000-0000-4000-8000-000000000003';

const DAN = '20000000-0000-4000-8000-000000000004';

async function asUser(id, role = 'authenticated') {
  await db.exec('reset role');
  await query("select set_config('request.jwt.claim.sub', $1, false)", [id || '']);
  await db.exec(`set role ${role}`);
}

async function admin() {
  await db.exec('reset role');
}

try {
  await db.exec(`
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}', created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
create schema storage;
create table storage.buckets(id text primary key, name text, public boolean);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
create schema cron;
create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;
create publication supabase_realtime;
`);
  const migrations = (await readdir(root + '/supabase/migrations')).filter(n => n.endsWith('.sql')).sort();
  for (const name of migrations) {
    await db.exec((await readFile(root + '/supabase/migrations/' + name, 'utf8')).replace('create extension if not exists pg_cron;', '-- local scheduling substitute'));
  }
  console.log(`Loaded all ${migrations.length} migrations; auth/storage/cron are local platform substitutes.`);
  await query(`insert into auth.users(id,email) values ($1,'host@example.invalid'),($2,'bob@example.invalid'),($3,'cara@example.invalid'),($4,'dan@example.invalid')`, [HOST, BOB, CARA, DAN]);
  await query(`update public.profiles set display_name = case id when $1 then 'Hana' when $2 then 'Bob' when $3 then 'Cara' else 'Dan' end`, [HOST, BOB, CARA]);
  await db.exec("insert into public.interests(slug,name) values ('music','Music'),('food','Food') on conflict(slug) do nothing");
  // an official event two days out, run by dan, that groups go to
  await asUser(DAN);
  const official = (await query(`insert into public.events(title,status,starts_at,ends_at,capacity) values ('[TEST] Jazz night','published',date_trunc('hour', now())+interval '2 days',date_trunc('hour', now())+interval '2 days 2 hours',50) returning id, starts_at, ends_at`))[0];
  await query("insert into public.event_interests(event_id, interest_id) select $1, id from public.interests where slug = 'music'", [official.id]);
  await admin();
  // only people with an rsvp can start a group; hana rsvps (after checking that rule)
  await asUser(HOST);
  await query('select public.register_for_event($1)', [official.id]);
  await admin();
  const create = args => query("select public.create_group($1,$2,$3,$4,$5,'{}'::uuid[]) as id", args).then(r => r[0].id);
  await db.exec(await readFile(root + '/docs/sql/community-public-browse-draft.sql', 'utf8'));
  await asUser(HOST);
  const pub = await create([official.id, '[TEST] Public meetup', 4, 'open', 'public']);
  const priv = await create([official.id, '[TEST] Private meetup', 4, 'approval', 'private']);
  await asUser(null, 'anon');
  await test('anonymous visitors browse public previews without private data', async () => {
    const rows = (await query('select public.group_list() as data'))[0].data;
    expect(rows.length === 1 && rows[0].id === pub, 'Public list wrong');
    expect(!('inviteToken' in rows[0]) && rows[0].myStatus === null, 'Private fields exposed');
    expect(rows[0].host.name === 'Hana', 'Public host missing');
    expect(!JSON.stringify(rows).includes(HOST), 'Account ID exposed');
    expect((await query('select public.group_view($1) as data', [pub]))[0].data.id === pub, 'Public detail unavailable');
    await rejects('select public.group_view($1)', [priv], /unavailable/);
  });
  await test('anonymous visitors cannot join, create, read private chats', async () => {
    await rejects('select public.join_group($1)', [pub], /permission denied/);
    await rejects("select public.create_group($1::uuid,''::text,4,'open'::text,'public'::text,'{}'::uuid[])", [official.id], /permission denied/);
    await rejects('select public.group_messages_list($1)', [pub], /permission denied/);
  });
  await test('signed-in host keeps private groups, member identity and invite access', async () => {
    await asUser(HOST);
    const rows = (await query('select public.group_list() as data'))[0].data;
    expect(rows.some(row => row.id === priv), 'Private host group missing');
    const group = (await query('select public.group_view($1) as data', [priv]))[0].data;
    expect(group.myStatus === 'host' && group.host.id === HOST && group.inviteToken, 'Signed-in details changed');
  });
  await test('hidden official events do not leak through public groups', async () => {
    await admin();
    await query("update public.events set status='draft' where id=$1", [official.id]);
    await asUser(null, 'anon');
    expect((await query('select public.group_list() as data'))[0].data.length === 0, 'Hidden event leaked');
    await rejects('select public.group_view($1)', [pub], /unavailable/);
  });
} finally {
  console.log(`${passed} passed, ${failed} failed`);
  await db.close();
  if (failed) process.exitCode = 1;
}
