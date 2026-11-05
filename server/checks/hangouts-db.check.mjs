// isolated postgresql verification of supabase/migrations/20261103120000_hangouts.sql. never reads .env or
// uses a database url. pass the path to a temporary pglite runtime module; no
// application dependency is added. usage:
//   node server/checks/hangouts-db.check.mjs <tmp>/node_modules/@electric-sql/pglite/dist/index.js
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

const sgDate = days => new Date(Date.now() + 8 * 3600e3 + days * 864e5).toISOString().slice(0, 10);

const sg = (date, time) => new Date(`${date}T${time}:00+08:00`).toISOString();

const venue = {
  name: 'Bugis Junction',
  address: '200 Victoria St',
  lat: 1.2995,
  lng: 103.8545
};
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
  console.log(`Loaded all ${migrations.length} existing migrations; auth/storage/cron are local platform substitutes.`);
  await query(`insert into auth.users(id,email) values ($1,'host@example.invalid'),($2,'bob@example.invalid'),($3,'cara@example.invalid'),($4,'dan@example.invalid')`, [HOST, BOB, CARA, DAN]);
  await db.exec("insert into public.interests(slug,name) values ('music','Music'),('food','Food') on conflict(slug) do nothing");
  // an official event, to prove existing rsvp behaviour is kept.
  await asUser(HOST);
  const official = (await query(`insert into public.events(title,status,starts_at,ends_at,capacity) values ('[TEST] gig','published',now()+interval '1 day',now()+interval '1 day 2 hours',1) returning id`))[0].id;
  await admin();
  let group, token;
  const day1 = sgDate(2),
    day2 = sgDate(3);
  await test('Official RSVPs keep auto-confirm then waitlist; Open refuses when full', async () => {
    await asUser(BOB);
    expect((await query('select status from public.register_for_event($1)', [official]))[0].status === 'confirmed', 'first RSVP confirms');
    await asUser(CARA);
    expect((await query('select status from public.register_for_event($1)', [official]))[0].status === 'waitlisted', 'full auto event waitlists');
    await asUser(HOST);
    const open = (await query(`insert into public.events(title,status,starts_at,ends_at,capacity,join_mode) values ('[TEST] open','published',now()+interval '1 day',now()+interval '1 day 1 hour',1,'open') returning id`))[0].id;
    await asUser(BOB);
    await query('select public.register_for_event($1)', [open]);
    await asUser(CARA);
    await rejects('select public.register_for_event($1)', [open], /full/);
    await asUser(HOST);
    await query("update public.events set kind = 'hangout' where id = $1", [official]);
    expect((await query('select kind from public.events where id = $1', [official]))[0].kind === 'official', 'kind is immutable');
  });
  await test('creating a group hangout validates input and hides it from public reads', async () => {
    await asUser(HOST);
    await rejects('select public.create_hangout($1)', [JSON.stringify({
      mode: 'group',
      title: '',
      tags: ['food'],
      capacity: 4,
      dateStart: day1,
      dateEnd: day2,
      venue
    })], /title/);
    await rejects('select public.create_hangout($1)', [JSON.stringify({
      mode: 'group',
      title: 'x',
      tags: ['food'],
      capacity: 9,
      dateStart: day1,
      dateEnd: day2,
      venue
    })], /2 to 8/);
    await rejects('select public.create_hangout($1)', [JSON.stringify({
      mode: 'group',
      title: 'x',
      tags: ['food'],
      capacity: 4,
      dateStart: day1,
      dateEnd: sgDate(12),
      venue
    })], /7 days/);
    group = (await query('select public.create_hangout($1) as id', [JSON.stringify({
      mode: 'group',
      title: '[TEST] Makan',
      tags: ['food'],
      capacity: 4,
      joinMode: 'open',
      dateStart: day1,
      dateEnd: day2,
      venue
    })]))[0].id;
    token = (await query('select public.hangout_invite_token($1) as t', [group]))[0].t;
    expect(/^[0-9a-f]{32}$/.test(token), 'host reads the invite token');
    expect((await query('select id from public.events_with_counts where id = $1', [group])).length === 1, 'host sees own hangout');
    for (const [id, role] of [[null, 'anon'], [CARA, 'authenticated']]) {
      await asUser(id, role);
      expect((await query('select id from public.events where id = $1', [group])).length === 0, `${role} must not see a private hangout`);
      expect((await query('select id from public.events_with_counts where id = $1', [group])).length === 0, `${role} must not list it`);
    }
    await asUser(CARA);
    expect((await query('select public.hangout_invite_token($1) as t', [group]))[0].t === null, 'non-host gets no token');
    await rejects('select invite_token from public.hangouts', [], /permission denied/);
  });
  await test('invites preview without joining; joining needs the token', async () => {
    await asUser(null, 'anon');
    const preview = (await query('select public.preview_hangout_invite($1) as p', [token]))[0].p;
    expect(preview.title === '[TEST] Makan' && preview.confirmed === 0 && preview.joinMode === 'open' && preview.isHost === false && preview.mode === 'group', 'anon preview shows limited facts');
    expect((await query("select public.preview_hangout_invite('nope') as p"))[0].p === null, 'bad token previews nothing');
    await asUser(BOB);
    await rejects('select public.register_for_event($1)', [group], /invite link/);
    expect((await query('select status from public.join_hangout_by_invite($1)', [token]))[0].status === 'confirmed', 'open invite join confirms');
    await rejects('select public.join_hangout_by_invite($1)', [token], /already/);
    expect((await query('select id from public.events where id = $1', [group])).length === 1, 'member now sees the hangout');
    await asUser(CARA);
    await query('select public.join_hangout_by_invite($1)', [token]);
    const people = await query('select user_id, role, required from public.hangout_members($1)', [group]);
    expect(people.length === 3 && people.filter(p => p.role === 'host').length === 1 && people.find(p => p.role === 'host').required, 'members list host plus two members');
    const counts = (await query('select confirmed, spots_left from public.event_availability($1)', [[group]]))[0];
    expect(counts.confirmed === 2 && counts.spots_left === 1, 'capacity 4 = host + 2 members + 1 place');
    await asUser(DAN);
    expect((await query('select * from public.hangout_members($1)', [group])).length === 0, 'non-members see no people');
    expect((await query('select * from public.event_availability($1)', [[group]])).length === 0, 'non-members get no counts');
  });
  await test('free times are private to their owner; the group sees aggregate counts only', async () => {
    await asUser(BOB);
    await query('select public.save_hangout_availability($1,$2)', [group, JSON.stringify([{
      start: sg(day1, '12:00'),
      end: sg(day1, '14:00')
    }, {
      start: sg(day1, '14:00'),
      end: sg(day1, '18:00')
    }, {
      start: sg(sgDate(1), '10:00'),
      end: sg(sgDate(1), '12:00')
    }])]);
    const mine = await query('select starts_at, ends_at from public.hangout_free_blocks');
    expect(mine.length === 1 && new Date(mine[0].starts_at).toISOString() === sg(day1, '12:00') && new Date(mine[0].ends_at).toISOString() === sg(day1, '18:00'), 'touching blocks merge; outside the range is clipped');
    await asUser(HOST);
    await query('select public.save_hangout_availability($1,$2)', [group, JSON.stringify([{
      start: sg(day1, '13:00'),
      end: sg(day1, '20:00')
    }])]);
    expect((await query('select * from public.hangout_free_blocks where user_id = $1', [BOB])).length === 0, 'host cannot read Bob’s raw times');
    const cells = await query('select cell_start, free_count from public.hangout_heatmap($1)', [group]);
    const at = t => cells.find(c => new Date(c.cell_start).toISOString() === sg(day1, t)).free_count;
    expect(cells.length === 2 * 48 && at('12:00') === 1 && at('13:00') === 2 && at('19:00') === 1, 'heatmap counts whole-cell coverage');
    expect((await query('select user_id from public.hangout_replies')).length === 2, 'members see who replied');
    await asUser(DAN);
    await rejects('select * from public.hangout_heatmap($1)', [group], /Join/);
    await rejects('select public.save_hangout_availability($1, $2)', [group, '[]'], /Join/);
  });
  await test('locking requires every required person who replied to be free', async () => {
    await asUser(BOB);
    await rejects('select public.lock_hangout_slot($1,$2,$3)', [group, sg(day1, '13:00'), sg(day1, '17:00')], /host/);
    await asUser(HOST);
    await query('select public.set_hangout_required($1,$2,true)', [group, CARA]);
    await rejects('select public.lock_hangout_slot($1,$2,$3)', [group, sg(day1, '13:00'), sg(day1, '17:00')], /no reply/);
    await query('select public.set_hangout_required($1,$2,false)', [group, CARA]);
    await query('select public.set_hangout_required($1,$2,true)', [group, BOB]);
    await rejects('select public.lock_hangout_slot($1,$2,$3)', [group, sg(day1, '17:00'), sg(day1, '19:00')], /bob/);
    await rejects('select public.lock_hangout_slot($1,$2,$3)', [group, sg(day1, '13:00'), sg(day1, '13:30')], /1 and 12 hours/);
    await query('select public.lock_hangout_slot($1,$2,$3)', [group, sg(day1, '13:00'), sg(day1, '17:00')]);
    const row = (await query('select h.stage, e.starts_at from public.hangouts h join public.events e on e.id = h.event_id where h.event_id = $1', [group]))[0];
    expect(row.stage === 'voting' && new Date(row.starts_at).toISOString() === sg(day1, '13:00'), 'lock sets stage and event time');
    await asUser(BOB);
    await rejects('select public.save_hangout_availability($1,$2)', [group, '[]'], /locked/);
  });
  await test('plans use real events or own places, with revisions, versioned votes and confirmation', async () => {
    await asUser(HOST);
    const other = (await query(`select id from public.events where title = '[TEST] open'`))[0].id;
    await admin();
    await query('update public.events set starts_at = $2, ends_at = $3 where id = $1', [other, sg(day1, '14:00'), sg(day1, '15:00')]);
    await asUser(HOST);
    const place = (await query('select public.add_hangout_place($1,$2) as id', [group, JSON.stringify({
      name: 'Kopi',
      lat: 1.3,
      lng: 103.855,
      minutes: 60,
      kind: 'meal'
    })]))[0].id;
    await rejects('select public.add_hangout_place($1,$2)', [group, JSON.stringify({
      name: 'Far',
      lat: 51.5,
      lng: -0.1,
      minutes: 60
    })], /check constraint/);
    let rev = (await query('select revision from public.hangouts where event_id = $1', [group]))[0].revision;
    rev = (await query('select public.set_hangout_stops($1,$2,$3) as r', [group, JSON.stringify([{
      place
    }, {
      event: other
    }]), rev]))[0].r;
    await rejects('select public.set_hangout_stops($1,$2,$3)', [group, JSON.stringify([{
      place
    }]), rev - 1], /conflict/);
    await rejects('select public.set_hangout_stops($1,$2,$3)', [group, JSON.stringify([{
      event: group
    }]), rev], /isn't available/);
    await asUser(BOB);
    await rejects('select public.set_hangout_stops($1,$2,$3)', [group, JSON.stringify([]), rev], /host/);
    const stops = await query('select id, ref_place_id, version from public.hangout_stops order by position');
    await query('select public.vote_hangout_stop($1, 1)', [stops[0].id]);
    expect((await query('select keep, mine from public.hangout_vote_counts($1) where stop_id = $2', [group, stops[0].id]))[0].keep === 1, 'vote counted');
    await asUser(HOST);
    rev = (await query('select public.set_hangout_stops($1,$2,$3) as r', [group, JSON.stringify([{
      event: other
    }, {
      place
    }]), rev]))[0].r;
    const moved = (await query('select version from public.hangout_stops where id = $1', [stops[0].id]))[0].version;
    expect(moved === 2, 'moved stop gets a new version');
    expect((await query('select keep from public.hangout_vote_counts($1) where stop_id = $2', [group, stops[0].id]))[0].keep === 0, 'stale vote ignored');
    await query('select public.finalize_hangout_plan($1,$2)', [group, rev]);
    await asUser(BOB);
    await rejects('select public.vote_hangout_stop($1, 1)', [stops[0].id], /closed/);
    await asUser(HOST);
    rev = (await query('select revision from public.hangouts where event_id = $1', [group]))[0].revision;
    await query('select public.set_hangout_stops($1,$2,$3)', [group, JSON.stringify([{
      event: other
    }]), rev]);
    const after = (await query('select stage, plan_ever_final from public.hangouts where event_id = $1', [group]))[0];
    expect(after.stage === 'voting' && after.plan_ever_final, 'editing a confirmed plan reopens voting');
    await query("select public.set_hangout_meeting_point($1, 'Bugis MRT Exit C')", [group]);
    await rejects('select public.set_hangout_meeting_point($1,$2)', [group, 'x'.repeat(121)], /120/);
  });
  await test('Open Jios are listed publicly; solo plans are private and unjoinable', async () => {
    await asUser(HOST);
    const pub = (await query('select public.create_hangout($1) as id', [JSON.stringify({
      mode: 'public',
      title: '[TEST] Open Jio',
      tags: ['music'],
      capacity: 2,
      joinMode: 'open',
      startTime: sg(day1, '18:00'),
      endTime: sg(day1, '21:00'),
      venue
    })]))[0].id;
    const solo = (await query('select public.create_hangout($1) as id', [JSON.stringify({
      mode: 'solo',
      title: '[TEST] Me time',
      tags: ['music'],
      startTime: sg(day1, '18:00'),
      endTime: sg(day1, '20:00'),
      venue
    })]))[0].id;
    await asUser(null, 'anon');
    const listed = await query('select id, kind, join_mode from public.events_with_counts where id in ($1, $2)', [pub, solo]);
    expect(listed.length === 1 && listed[0].id === pub && listed[0].kind === 'hangout' && listed[0].join_mode === 'open', 'only the Open Jio is listed, labelled');
    await asUser(BOB);
    await query('select public.register_for_event($1)', [pub]);
    await asUser(CARA);
    await rejects('select public.register_for_event($1)', [pub], /full/);
    await rejects('select public.register_for_event($1)', [solo], /invite link/);
    await asUser(HOST);
    const venueId = (await query('select venue_id from public.events where id = $1', [solo]))[0].venue_id;
    await query('delete from public.events where id = $1', [solo]);
    await admin();
    expect((await query('select id from public.venues where id = $1', [venueId])).length === 0, 'deleting a hangout removes its start-area venue');
  });
} finally {
  console.log(`${passed} passed, ${failed} failed`);
  await db.close();
  if (failed) process.exitCode = 1;
}
