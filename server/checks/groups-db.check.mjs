// Isolated PostgreSQL verification of supabase/migrations/20261104142907_go_together_groups.sql. Never reads .env or
// uses a database URL. Pass the path to a temporary PGlite runtime module; no
// application dependency is added. Usage:
//   node server/checks/groups-db.check.mjs <tmp>/node_modules/@electric-sql/pglite/dist/index.js
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
if (!process.argv[2]) throw new Error('Pass the local path to the PGlite runtime module');
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
let passed = 0, failed = 0;
function expect(value, message) { if (!value) throw new Error(message); }
async function test(name, run) {
  try { await run(); passed++; console.log('PASS', name); }
  catch (error) { failed++; console.log('FAIL', name, error.code || '', error.message); }
}
async function query(sql, params = []) { return (await db.query(sql, params)).rows; }
async function rejects(sql, params, pattern) {
  try { await query(sql, params); }
  catch (error) { expect(pattern.test(error.message), `Unexpected rejection: ${error.message}`); return; }
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
async function admin() { await db.exec('reset role'); }
const sgDate = days => new Date(Date.now() + 8 * 3600e3 + days * 864e5).toISOString().slice(0, 10);
const sg = (date, time) => new Date(`${date}T${time}:00+08:00`).toISOString();
const venue = { name: 'Bugis Junction', address: '200 Victoria St', lat: 1.2995, lng: 103.8545 };

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
// An Official event two days out, run by Dan, that groups go to
await asUser(DAN);
const official = (await query(`insert into public.events(title,status,starts_at,ends_at,capacity) values ('[TEST] Jazz night','published',date_trunc('hour', now())+interval '2 days',date_trunc('hour', now())+interval '2 days 2 hours',50) returning id, starts_at, ends_at`))[0];
await query("insert into public.event_interests(event_id, interest_id) select $1, id from public.interests where slug = 'music'", [official.id]);
await admin();
const create = (args) => query('select public.create_group($1,$2,$3,$4,$5) as id', args).then((r) => r[0].id);
const view = async (id, token = null) => (await query('select public.group_view($1,$2) as v', [id, token]))[0].v;
const list = async () => (await query('select public.group_list() as l'))[0].l;
const plan = async (id) => (await query('select public.group_plan($1) as p', [id]))[0].p;
const cell = (base, minutes) => new Date(new Date(base).getTime() + minutes * 60000).toISOString();
let pub, priv, fo;

await test('starting a group checks the event and the form, and copies time, venue and interests', async () => {
  await asUser(HOST);
  await rejects('select public.create_group($1,$2,$3,$4,$5)', [official.id, '', 9, 'open', 'public'], /2 to 8 spots/);
  await rejects('select public.create_group($1,$2,$3,$4,$5)', [official.id, 'x'.repeat(201), 4, 'open', 'public'], /200 characters/);
  await rejects('select public.create_group($1,$2,$3,$4,$5)', [official.id, '', 4, 'open', 'secret'], /who can see/);
  pub = await create([official.id, 'Meet at the gate', 3, 'open', 'public']);
  await rejects('select public.create_group($1,$2,$3,$4,$5)', [pub, '', 4, 'open', 'public'], /Choose the event/);
  const row = (await query('select kind::text, title, starts_at, ends_at, organiser_id from public.events where id = $1', [pub]))[0];
  expect(row.kind === 'group' && row.title === 'Going to [TEST] Jazz night' && row.organiser_id === HOST, 'group event row');
  expect(+row.starts_at === +official.starts_at && +row.ends_at === +official.ends_at, 'times copied');
  expect((await query('select 1 from public.event_interests where event_id = $1', [pub])).length === 1, 'interests copied');
  const v = await view(pub);
  expect(v.myStatus === 'host' && v.spotsLeft === 2 && v.eventId === official.id && v.host.name === 'Hana' && v.inviteToken, 'host view');
});

await test('public groups are listed for signed-in people; the tables stay closed to the browser', async () => {
  await asUser(CARA);
  const l = await list();
  expect(l.length === 1 && l[0].id === pub && l[0].inviteToken === null && l[0].myStatus === null, 'Cara sees the public group without its token');
  await rejects('select * from public.groups', [], /permission denied/);
  await rejects('select * from public.group_messages', [], /permission denied/);
  await rejects('insert into public.group_ideas(group_id, slot, kind, name, suggested_by) values ($1, $2, $3, $4, $5)', [pub, 'before', 'custom', 'x', CARA], /permission denied/);
  await asUser(null, 'anon');
  await rejects('select public.group_list()', [], /permission denied/);
});

await test('host holds a spot: a 3-spot open group takes two joins, then refuses', async () => {
  await asUser(BOB);
  expect((await query('select status from public.join_group($1)', [pub]))[0].status === 'confirmed', 'Bob joins');
  await rejects('select public.join_group($1)', [pub], /already in/);
  await asUser(CARA);
  expect((await query('select status from public.register_for_event($1)', [pub]))[0].status === 'confirmed', 'public groups also join through register_for_event');
  await asUser(DAN);
  await rejects('select public.join_group($1)', [pub], /full/);
  await asUser(HOST);
  await rejects('select public.join_group($1)', [pub], /host/);
  const v = await view(pub);
  expect(v.spotsLeft === 0 && v.members.map((m) => m.name).join() === 'Bob,Cara', 'members listed by name');
});

await test('private groups need the invite link to be seen or joined', async () => {
  await asUser(HOST);
  priv = await create([official.id, '', 4, 'approval', 'private']);
  const token = (await view(priv)).inviteToken;
  expect(/^[0-9a-f]{32}$/.test(token), 'host reads the token');
  await asUser(DAN);
  expect(!(await list()).some((g) => g.id === priv), 'not listed for others');
  expect((await query('select id from public.events where id = $1', [priv])).length === 0, 'event row hidden');
  await rejects('select public.group_view($1)', [priv], /host’s friends/);
  await rejects('select public.group_view(null, $1)', ['nope'], /isn’t valid/);
  const viaLink = await view(null, token);
  expect(viaLink.id === priv && viaLink.viaInvite === true && viaLink.inviteToken === null, 'link shows the group but not the token');
  await rejects('select public.register_for_event($1)', [priv], /invite link/);
  await rejects('select public.join_group($1)', [priv], /host’s friends/);
  expect((await query('select status from public.join_group($1,$2)', [priv, token]))[0].status === 'pending', 'approval group: request is pending');
  const mine = await view(priv);
  expect(mine.myStatus === 'pending' && mine.myRsvpId, 'Dan can see the group while waiting');
  await rejects('select public.group_plan($1)', [priv], /Join the group/);
  await asUser(HOST);
  expect((await view(priv)).pendingCount === 1, 'host sees the request');
  await query("update public.registrations set status = 'confirmed' where event_id = $1 and user_id = $2", [priv, DAN]);
  await asUser(DAN);
  const after = await view(priv);
  expect(after.myStatus === 'confirmed' && after.inviteToken === token, 'approved member reads the token');
  expect((await query('select id from public.events where id = $1', [priv])).length === 1, 'member sees the event row');
});

await test('chat: members post, signed-in people read public groups, only your own messages can be deleted', async () => {
  await asUser(DAN);
  await rejects('select public.add_group_message($1,$2)', [pub, 'hi'], /Join the group/);
  expect((await query('select * from public.group_messages_list($1)', [pub])).length === 0, 'non-member reads a public group chat');
  await asUser(BOB);
  await rejects('select public.add_group_message($1,$2)', [pub, '   '], /Write something/);
  await rejects('select public.add_group_message($1,$2)', [pub, 'x'.repeat(281)], /280/);
  const id = (await query('select public.add_group_message($1,$2) as id', [pub, 'See you at 7']))[0].id;
  await asUser(CARA);
  const rows = await query('select * from public.group_messages_list($1)', [pub]);
  expect(rows.length === 1 && rows[0].name === 'Bob' && rows[0].mine === false, 'Cara sees Bob’s message');
  await query('select public.delete_group_message($1)', [id]);
  expect((await query('select * from public.group_messages_list($1)', [pub])).length === 1, 'Cara can’t delete Bob’s message');
  await asUser(BOB);
  await query('select public.delete_group_message($1)', [id]);
  expect((await query('select * from public.group_messages_list($1)', [pub])).length === 0, 'Bob deletes his own');
  expect((await view(pub)).commentCount === 0, 'count follows');
  await asUser(CARA);
  await rejects('select * from public.group_messages_list($1)', [priv], /private/);
});

await test('before and after ideas: limits, votes, the host’s pick and removal', async () => {
  await asUser(BOB);
  const idea = (await query('select public.suggest_group_idea($1,$2,$3) as id', [pub, 'before', JSON.stringify({ kind: 'deal', refId: 'd1', name: 'Kopi Corner', detail: '1-for-1 lattes', priceText: '$4', lat: 1.297, lng: 103.851, sourceUrl: 'https://t.me/example/1' })]))[0].id;
  await rejects('select public.suggest_group_idea($1,$2,$3)', [pub, 'before', JSON.stringify({ name: 'kopi corner' })], /already suggested/);
  await rejects('select public.suggest_group_idea($1,$2,$3)', [pub, 'during', JSON.stringify({ name: 'x' })], /before or after/);
  for (let i = 1; i < 8; i++) await query('select public.suggest_group_idea($1,$2,$3)', [pub, 'before', JSON.stringify({ name: `Place ${i}` })]);
  await rejects('select public.suggest_group_idea($1,$2,$3)', [pub, 'before', JSON.stringify({ name: 'One more' })], /8 ideas/);
  await asUser(CARA);
  await query('select public.vote_group_idea($1,true)', [idea]);
  await query('select public.vote_group_idea($1,true)', [idea]);
  let p = await plan(pub);
  let k = p.ideas.find((i) => i.id === idea);
  expect(k.votes === 2 && k.myVote && k.suggestedByName === 'Bob' && k.priceText === '$4' && k.sourceUrl === 'https://t.me/example/1', 'votes count once each');
  await rejects('select public.choose_group_idea($1,$2,$3)', [pub, 'before', idea], /Only the host/);
  await rejects('select public.remove_group_idea($1)', [idea], /own ideas/);
  await asUser(HOST);
  await rejects('select public.choose_group_idea($1,$2,$3)', [pub, 'after', idea], /removed/);
  await query('select public.choose_group_idea($1,$2,$3)', [pub, 'before', idea]);
  expect((await plan(pub)).choices.before === idea, 'host picks it');
  await asUser(BOB);
  await query('select public.remove_group_idea($1)', [idea]);
  p = await plan(pub);
  expect(p.choices.before === null && !p.ideas.some((i) => i.id === idea), 'removing a picked idea clears the pick');
});

await test('availability: 15-minute cells inside each three-hour side; leavers stop counting', async () => {
  const before0 = cell(official.starts_at, -195), after0 = cell(official.ends_at, 15);
  await asUser(BOB);
  await query('select public.set_group_availability($1,$2,$3)', [pub, 'before', [cell(before0, 30), cell(before0, 15), cell(before0, 15)]]);
  await rejects('select public.set_group_availability($1,$2,$3)', [pub, 'before', [cell(before0, 180)]], /outside the planner/);
  await rejects('select public.set_group_availability($1,$2,$3)', [pub, 'after', [cell(after0, 7)]], /outside the planner/);
  await query('select public.set_group_availability($1,$2,$3)', [pub, 'after', []]);
  await asUser(CARA);
  await query('select public.set_group_availability($1,$2,$3)', [pub, 'before', [cell(before0, 15)]]);
  let p = await plan(pub);
  const bob = p.availability[BOB];
  expect(bob.before.length === 2 && +new Date(bob.before[0]) === +new Date(cell(before0, 15)) && bob.after.length === 0, 'cells deduplicated and sorted; empty means can’t make it');
  expect(p.members.length === 3 && p.availability[CARA], 'host, Bob and Cara are members');
  await asUser(HOST);
  await query("update public.registrations set status = 'cancelled' where event_id = $1 and user_id = $2", [pub, CARA]);
  await asUser(BOB);
  p = await plan(pub);
  expect(!p.availability[CARA] && p.members.length === 2, 'Cara left, so her times no longer count');
  await asUser(DAN);
  await rejects('select public.set_group_availability($1,$2,$3)', [pub, 'before', []], /Join the group/);
});

await test('friends only: the host’s friends see it, others need the link; quick add invites friends only', async () => {
  await admin();
  // Hana and Cara are friends; Dan has only asked
  await query("insert into public.profile_friendships(user_low,user_high,requester_id,status) values (least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid),$1,'accepted'), (least($1::uuid,$3::uuid),greatest($1::uuid,$3::uuid),$3,'pending')", [HOST, CARA, DAN]);
  await asUser(HOST);
  fo = (await query('select public.create_group($1,$2,$3,$4,$5,$6) as id', [official.id, 'Friends only', 4, 'approval', 'private', [CARA, DAN, BOB, HOST]]))[0].id;
  await admin();
  const invited = (await query('select user_id from public.group_invites where group_id = $1', [fo])).map((r) => r.user_id);
  expect(invited.length === 1 && invited[0] === CARA, 'only the accepted friend was invited');
  await asUser(BOB);
  expect(!(await list()).some((g) => g.id === fo), 'not listed for someone who is not a friend');
  await rejects('select public.group_view($1)', [fo], /host’s friends/);
  await rejects('select public.join_group($1)', [fo], /host’s friends/);
  await asUser(CARA);
  const seen = (await list()).find((g) => g.id === fo);
  expect(seen && seen.hostIsFriend === true && seen.myInvite?.from?.name === 'Hana', 'friend sees it, with the invite');
});

await test('an invite counts as approval; a join request carries a message the host reads', async () => {
  await asUser(CARA);
  const invites = (await query('select public.group_invites_list() as l'))[0].l;
  expect(invites.length === 1 && invites[0].id === fo && invites[0].group.visibility === 'private', 'invite listed');
  expect((await query('select status from public.respond_group_invite($1, true)', [fo]))[0].status === 'confirmed', 'accepting joins straight away in an approval group');
  await rejects('select public.respond_group_invite($1, true)', [fo], /isn’t open/);
  expect((await query('select public.group_invites_list() as l'))[0].l.length === 0, 'invite gone from the list');
  // Bob opens the link and asks to join with a message
  await asUser(HOST);
  const token = (await view(fo)).inviteToken;
  await asUser(BOB);
  await rejects('select public.join_group($1,$2,$3)', [fo, token, 'x'.repeat(201)], /200 characters/);
  expect((await query('select status from public.join_group($1,$2,$3)', [fo, token, '  Hi, I’m Cara’s classmate  ']))[0].status === 'pending', 'request pending');
  await asUser(HOST);
  const req = (await view(fo)).requests;
  expect(req.length === 1 && req[0].name === 'Bob' && req[0].message === 'Hi, I’m Cara’s classmate' && req[0].rsvpId, 'host sees the message');
  await asUser(CARA);
  expect((await view(fo)).requests.length === 0, 'members don’t see requests');
});

await test('host settings: visibility, who can join, spots and note, with checks', async () => {
  await asUser(CARA);
  await rejects('select public.update_group_settings($1,$2,$3,$4,$5)', [fo, 'public', 'open', 4, ''], /Only the host/);
  await asUser(HOST);
  await rejects('select public.update_group_settings($1,$2,$3,$4,$5)', [fo, 'public', 'open', 1, ''], /2 to 8/);
  await rejects('select public.update_group_settings($1,$2,$3,$4,$5)', [fo, 'secret', 'open', 4, ''], /who can see/);
  await query("update public.registrations set status = 'confirmed' where event_id = $1 and user_id = $2", [fo, BOB]);
  await rejects('select public.update_group_settings($1,$2,$3,$4,$5)', [fo, 'public', 'open', 2, ''], /3 people are already in/);
  await query('select public.update_group_settings($1,$2,$3,$4,$5)', [fo, 'public', 'open', 5, ' New note ']);
  const v = await view(fo);
  expect(v.visibility === 'public' && v.joinMode === 'open' && v.capacity === 5 && v.note === 'New note' && v.spotsLeft === 2, 'settings saved');
});

await test('deleting a group removes it and tells its people', async () => {
  await asUser(HOST);
  // Dan is invited after becoming a friend, so he gets a notice too
  await admin();
  await query("update public.profile_friendships set status = 'accepted' where requester_id = $1", [DAN]);
  await query("insert into public.group_invites(group_id,user_id,invited_by) values ($1,$2,$3)", [fo, DAN, HOST]);
  await asUser(CARA);
  await rejects('select public.delete_group($1)', [fo], /Only the host/);
  await asUser(HOST);
  await query('select public.delete_group($1)', [fo]);
  await admin();
  expect((await query('select id from public.events where id = $1', [fo])).length === 0, 'group event gone');
  expect((await query('select 1 from public.group_invites where group_id = $1', [fo])).length === 0, 'invites gone');
  const told = (await query('select user_id from public.group_notices order by user_id')).map((r) => r.user_id);
  expect(told.join() === [BOB, CARA, DAN].sort().join(), 'members, requesters and invited people are told; not the host');
  await asUser(CARA);
  const notices = (await query('select public.group_notices_list() as l'))[0].l;
  expect(notices.length === 1 && notices[0].hostName === 'Hana' && notices[0].eventTitle === '[TEST] Jazz night', 'notice text');
  await query('select public.dismiss_group_notice($1)', [notices[0].id]);
  expect((await query('select public.group_notices_list() as l'))[0].l.length === 0, 'dismissed');
  // A host deleting the group's event row directly (organiser rights) also works
  await asUser(HOST);
  const direct = await create([official.id, '', 3, 'open', 'public']);
  await query('delete from public.events where id = $1', [direct]);
  await admin();
  expect((await query('select 1 from public.groups where event_id = $1', [direct])).length === 0, 'groups row gone with its event');
});

await test('deleting the official event removes its groups', async () => {
  await asUser(DAN);
  await query('delete from public.events where id = $1', [official.id]);
  await admin();
  expect((await query('select id from public.events where id = any($1)', [[pub, priv]])).length === 0, 'group events gone');
  expect((await query('select 1 from public.group_ideas')).length === 0, 'their plans gone');
});
} finally {
  console.log(`${passed} passed, ${failed} failed`);
  await db.close();
  if (failed) process.exitCode = 1;
}
