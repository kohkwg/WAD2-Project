-- Sample people, venues and ~60 upcoming events (6 Nov to 17 Dec 2026) for testing Discover with a
-- full list, map and calendar. Requested 5 November 2026 and kept as sample content; applied to the
-- hosted Bookerz project. Ids are derived from names (md5), so running it again changes nothing.
-- Sample people have no password and can't sign in; their emails use example.invalid.
begin;
create temp table seed_people(name text, username text, interests text[], postal text, lat float8, lng float8, bio text) on commit drop;
create temp table seed_venues(name text, address text, postal text, lat float8, lng float8, indoor boolean, idx int) on commit drop;
create temp table seed_events(title text, tags text[], venue int, starts timestamptz, ends timestamptz, cap int, approval boolean, hide boolean, descr text, host text, fill float8) on commit drop;
insert into seed_people values
('Marcus Lee','marcus_lee',array['tech', 'gaming'],'179103',1.2966,103.8502,'Year 3 SCIS. Hackathons and board games.'),
('Priya Nair','priya_n',array['arts', 'music'],'188065',1.299,103.854,'Runs the campus open mic. Always sketching.'),
('Jun Hao Tan','junhao_t',array['sports', 'outdoors'],'528523',1.3496,103.9568,'Futsal on Tuesdays, cycling on Sundays.'),
('Siti Rahmah','siti_r',array['volunteering', 'food'],'310190',1.3332,103.8478,'Food rescue volunteer and hawker hunter.'),
('Ethan Goh','ethan_goh',array['career', 'tech'],'018989',1.2789,103.8536,'Ex-intern at a fintech. Happy to review resumes.'),
('Clara Wong','clara_w',array['wellness', 'arts'],'238859',1.3048,103.8318,'Yoga instructor in training.'),
('Ravi Kumar','ravi_k',array['music', 'food'],'208539',1.3066,103.8563,'Plays bass in a jazz trio.'),
('Hui Min Lim','huimin_l',array['outdoors', 'wellness'],'679940',1.3792,103.7639,'Trail runner. Bukit Timah most weekends.'),
('Daniel Ong','daniel_ong',array['gaming', 'tech'],'039594',1.293,103.8572,'Speedrunner and esports club treasurer.'),
('Nur Aisyah','nur_aisyah',array['volunteering', 'career'],'150158',1.2864,103.8262,'Mentors secondary school students.'),
('Kevin Chua','kevin_chua',array['sports', 'food'],'437438',1.3061,103.9054,'Badminton and supper, in that order.'),
('Amelia Tan','amelia_tan',array['arts', 'others'],'049483',1.2848,103.8597,'Museum nerd. Free entry days are my thing.'),
('Farhan Ismail','farhan_i',array['outdoors', 'sports'],'098585',1.2659,103.8186,'Kayaking and sunrise hikes.'),
('Grace Teo','grace_teo',array['music', 'wellness'],'259569',1.3128,103.8162,'Choir alto. Coffee before everything.'),
('Zhi Wei Koh','zhiwei_k',array['tech', 'career'],'138632',1.2998,103.7876,'Product designer, ex-startup.'),
('Lakshmi Iyer','lakshmi_i',array['food', 'arts'],'228208',1.3006,103.8395,'Weekend baker and food photographer.');
insert into seed_venues values
('SMU Campus Green','81 Victoria St','188065',1.2963,103.8502,false,0),
('SMU School of Computing and Information Systems','80 Stamford Rd','178902',1.2975,103.8494,true,1),
('National Library Building','100 Victoria St','188064',1.2977,103.8545,true,2),
('Esplanade Outdoor Theatre','1 Esplanade Dr','038981',1.2897,103.8556,false,3),
('Gardens by the Bay, Supertree Grove','18 Marina Gardens Dr','018953',1.2816,103.8636,false,4),
('Fort Canning Park','River Valley Rd','179037',1.2944,103.8456,false,5),
('Our Tampines Hub','1 Tampines Walk','528523',1.353,103.9401,true,6),
('Lau Pa Sat','18 Raffles Quay','048582',1.2806,103.8504,false,7),
('MacRitchie Reservoir Park','Lornie Rd','298717',1.3418,103.8335,false,8),
('East Coast Park, Area C','East Coast Park Service Rd','449876',1.3008,103.9122,false,9),
('National Gallery Singapore','1 St Andrew''s Rd','178957',1.2903,103.8515,true,10),
('ArtScience Museum','6 Bayfront Ave','018974',1.2863,103.8593,true,11),
('Kallang Wave Mall','1 Stadium Pl','397628',1.3027,103.8752,true,12),
('Chinatown Complex Food Centre','335 Smith St','050335',1.2823,103.843,false,13),
('Bukit Timah Nature Reserve','177 Hindhede Dr','589333',1.35,103.7764,false,14),
('Singapore Botanic Gardens','1 Cluny Rd','259569',1.3138,103.8159,false,15),
('The Projector, Golden Mile Tower','6001 Beach Rd','199589',1.3026,103.8637,true,16),
('Kampong Glam, Haji Lane','Haji Ln','189217',1.3007,103.859,false,17),
('Punggol Waterway Park','Sentul Cres','828879',1.4097,103.9046,false,18),
('NUS University Town','2 College Ave West','138607',1.3053,103.7737,true,19),
('Sentosa, Siloso Beach','Siloso Beach Walk','099981',1.2547,103.81,false,20),
('Tiong Bahru Market','30 Seng Poh Rd','168898',1.2851,103.8326,false,21);
insert into seed_events values
('Hack Night: Build a Discord Bot',array['tech', 'gaming'],1,'2026-11-06T19:30:00+08:00','2026-11-06T22:30:00+08:00',40,false,false,'Bring a laptop; we pair beginners with mentors. Pizza from 7.','marcus_lee',0.2),
('Sunrise Run at MacRitchie',array['outdoors', 'sports', 'wellness'],8,'2026-11-06T07:00:00+08:00','2026-11-06T09:00:00+08:00',30,false,false,'Easy 6 km loop, pace groups for everyone. Meet at the kiosk.','priya_n',0.2),
('Open Mic: Acoustic Sets',array['music', 'arts'],0,'2026-11-07T19:30:00+08:00','2026-11-07T22:30:00+08:00',80,false,false,'Sign up on the night. Five minutes each, one cover allowed.','junhao_t',0.05),
('Resume Clinic with Alumni',array['career'],2,'2026-11-08T10:00:00+08:00','2026-11-08T12:00:00+08:00',24,true,false,'One-to-one reviews. Bring a printed copy; we approve sign-ups to match mentors.','siti_r',0.3),
('Hawker Crawl: Chinatown',array['food'],13,'2026-11-09T20:00:00+08:00','2026-11-09T23:00:00+08:00',16,false,false,'Six stalls, shared plates, about $15 each. Vegetarian route available.','ethan_goh',0.4),
('Beach Clean-up at East Coast',array['volunteering', 'outdoors'],9,'2026-11-09T19:00:00+08:00','2026-11-09T22:00:00+08:00',60,false,false,'Gloves and bags provided. Wear shoes you don''t mind getting sandy.','clara_w',0.05),
('Board Game Cafe Social',array['gaming', 'others'],12,'2026-11-10T19:00:00+08:00','2026-11-10T23:00:00+08:00',20,false,false,'Catan, Codenames and Wingspan tables. Newcomers welcome.','ravi_k',0.4),
('Yoga in the Gardens',array['wellness'],15,'2026-11-10T12:30:00+08:00','2026-11-10T14:00:00+08:00',35,false,false,'Gentle flow for all levels. Bring a mat and water.','huimin_l',0.05),
('Jazz by the Bay',array['music'],3,'2026-11-11T19:30:00+08:00','2026-11-11T22:00:00+08:00',null,false,false,'Free outdoor jazz. Grab a spot on the steps.','daniel_ong',0.45),
('Intro to Figma for Non-Designers',array['tech', 'career', 'arts'],1,'2026-11-12T12:00:00+08:00','2026-11-12T14:00:00+08:00',30,false,false,'Wireframe your first app screen in two hours.','nur_aisyah',0.1),
('Futsal Pick-up Games',array['sports'],6,'2026-11-13T19:30:00+08:00','2026-11-13T21:30:00+08:00',20,false,false,'Mixed teams, rotating every 10 minutes.','kevin_chua',0.8),
('Sketch Walk: Kampong Glam',array['arts', 'outdoors'],17,'2026-11-13T19:00:00+08:00','2026-11-13T21:00:00+08:00',18,false,false,'Draw shophouses and murals with a group. Any materials.','amelia_tan',1.0),
('Startup Pitch Night',array['career', 'tech'],2,'2026-11-14T19:00:00+08:00','2026-11-14T22:00:00+08:00',100,true,false,'Five student teams pitch; investors give feedback. Approval needed for pitching slots.','farhan_i',0.05),
('Food Rescue Run',array['volunteering', 'food'],21,'2026-11-14T09:00:00+08:00','2026-11-14T11:30:00+08:00',12,true,false,'Collect unsold produce from market stalls and pack it for families.','grace_teo',1.0),
('Night Cycling: Punggol Waterway',array['outdoors', 'sports'],18,'2026-11-15T19:00:00+08:00','2026-11-15T22:00:00+08:00',25,false,false,'Bring your own bike or rent nearby. Lights required.','zhiwei_k',0.1),
('Gallery Late: Southeast Asian Modern',array['arts'],10,'2026-11-17T19:30:00+08:00','2026-11-17T21:30:00+08:00',50,false,true,'Guided tour after hours, then drinks on the rooftop.','lakshmi_i',0.05),
('Indie Film Screening and Q&A',array['arts', 'others'],16,'2026-11-16T20:00:00+08:00','2026-11-16T23:00:00+08:00',90,false,false,'Local short films, director Q&A after.','marcus_lee',0.1),
('Coffee and Code (Beginners)',array['tech'],19,'2026-11-17T20:00:00+08:00','2026-11-17T22:00:00+08:00',25,false,false,'Evening Python practice in pairs, laptops out.','priya_n',0.3),
('Mental Health First Aid Workshop',array['wellness', 'volunteering'],2,'2026-11-18T12:00:00+08:00','2026-11-18T15:00:00+08:00',30,true,false,'Certified trainers. Seats confirmed on approval.','junhao_t',0.2),
('Supertree Light Show Meetup',array['others', 'outdoors'],4,'2026-11-19T19:30:00+08:00','2026-11-19T21:00:00+08:00',null,false,false,'Meet by the grove for Garden Rhapsody, then supper.','siti_r',0.35),
('Bukit Timah Summit Hike',array['outdoors'],14,'2026-11-21T08:00:00+08:00','2026-11-21T11:00:00+08:00',20,false,false,'Moderate pace, some steep bits. Back by lunch.','ethan_goh',0.8),
('Valorant Campus Cup',array['gaming'],12,'2026-11-21T09:00:00+08:00','2026-11-21T14:00:00+08:00',64,true,false,'5v5 bracket. Register as a team; approval confirms your slot.','clara_w',0.1),
('Baking Basics: Sourdough',array['food', 'others'],null,'2026-11-21T15:00:00+08:00','2026-11-21T17:00:00+08:00',40,false,false,'Online class. Ingredient list sent after you RSVP.','ravi_k',0.05),
('Choir Taster Session',array['music'],2,'2026-11-22T15:00:00+08:00','2026-11-22T16:30:00+08:00',30,false,false,'No auditions. Learn one song in an hour.','huimin_l',0.1),
('Career Talk: Product Management',array['career'],1,'2026-11-22T14:00:00+08:00','2026-11-22T15:30:00+08:00',60,false,false,'What PMs actually do, with three speakers from local tech.','daniel_ong',0.3),
('Kayak the Reservoir',array['outdoors', 'sports'],8,'2026-11-23T19:30:00+08:00','2026-11-23T22:30:00+08:00',14,true,false,'Basic swimming needed. Approval confirms kayak availability.','nur_aisyah',0.4),
('Pottery Wheel Drop-in',array['arts'],null,'2026-11-24T12:00:00+08:00','2026-11-24T14:00:00+08:00',10,false,true,'Online demo plus a kit you collect from campus.','kevin_chua',0.4),
('Charity 5K Fun Run',array['sports', 'volunteering'],9,'2026-11-24T18:00:00+08:00','2026-11-24T20:00:00+08:00',200,false,false,'All proceeds to a children''s charity. Costumes encouraged.','amelia_tan',0.05),
('Street Photography Walk',array['arts', 'outdoors'],7,'2026-11-26T17:30:00+08:00','2026-11-26T20:00:00+08:00',20,false,false,'Golden hour around the CBD. Phone cameras welcome.','farhan_i',0.2),
('Mahjong Night',array['gaming', 'others'],12,'2026-11-25T19:00:00+08:00','2026-11-25T22:00:00+08:00',16,false,false,'Teaching table for first-timers.','grace_teo',0.4),
('Climate Action Town Hall',array['volunteering', 'others'],2,'2026-11-26T19:00:00+08:00','2026-11-26T21:00:00+08:00',120,false,false,'Hear from student groups, then breakouts.','zhiwei_k',0.1),
('Salsa for Beginners',array['music', 'wellness'],12,'2026-11-28T14:00:00+08:00','2026-11-28T15:30:00+08:00',30,false,false,'No partner needed; we rotate.','lakshmi_i',0.1),
('Hawker Breakfast: Tiong Bahru',array['food'],21,'2026-11-28T07:30:00+08:00','2026-11-28T09:00:00+08:00',12,false,false,'Chwee kueh, kaya toast and kopi.','marcus_lee',0.4),
('Data Viz Workshop with Python',array['tech', 'career'],19,'2026-11-28T14:00:00+08:00','2026-11-28T17:00:00+08:00',35,false,false,'Matplotlib and Plotly from zero. Laptop required.','priya_n',0.2),
('Sunset Paddle at Sentosa',array['outdoors', 'wellness'],20,'2026-11-29T17:00:00+08:00','2026-11-29T19:00:00+08:00',16,true,false,'Stand-up paddleboarding; instructor included.','junhao_t',0.6),
('Poetry Slam',array['arts', 'music'],16,'2026-11-29T15:00:00+08:00','2026-11-29T17:30:00+08:00',70,false,false,'Read your own or just listen. Judges pick a winner.','siti_r',0.1),
('Volunteer Tutoring Orientation',array['volunteering', 'career'],null,'2026-11-30T19:00:00+08:00','2026-11-30T20:30:00+08:00',50,false,false,'Online briefing for the term''s tutoring programme.','ethan_goh',0.1),
('Badminton Social',array['sports'],6,'2026-12-01T20:00:00+08:00','2026-12-01T22:00:00+08:00',24,false,false,'Doubles rotation. Bring your racket; shuttles provided.','clara_w',0.1),
('ArtScience After Dark',array['arts', 'tech'],11,'2026-12-01T20:30:00+08:00','2026-12-01T23:00:00+08:00',40,false,true,'Late entry to the digital art exhibition.','ravi_k',0.1),
('LeetCode Grind Session',array['tech', 'career'],1,'2026-12-03T18:00:00+08:00','2026-12-03T21:00:00+08:00',30,false,false,'Mock interviews in pairs, two problems each.','huimin_l',0.3),
('Food Photography 101',array['food', 'arts'],7,'2026-12-03T19:00:00+08:00','2026-12-03T21:00:00+08:00',15,false,false,'Shoot dishes at Lau Pa Sat; editing tips after.','daniel_ong',0.6),
('Botanic Gardens Picnic',array['food', 'outdoors', 'others'],15,'2026-12-04T19:00:00+08:00','2026-12-04T22:00:00+08:00',null,false,false,'Potluck. Bring something to share.','nur_aisyah',0.26),
('Speedcubing Meetup',array['gaming', 'others'],2,'2026-12-05T15:00:00+08:00','2026-12-05T17:00:00+08:00',20,false,false,'Timers out. All levels from 2 minutes to sub-10.','kevin_chua',0.8),
('Meditation and Tea',array['wellness'],null,'2026-12-05T09:00:00+08:00','2026-12-05T10:00:00+08:00',30,false,false,'Online guided session, 20 minutes sitting, then chat.','amelia_tan',0.1),
('Christmas Market Volunteers',array['volunteering', 'food'],5,'2026-12-06T14:00:00+08:00','2026-12-06T18:00:00+08:00',40,true,false,'Help run charity stalls at Fort Canning.','farhan_i',0.1),
('Battle of the Bands',array['music'],3,'2026-12-06T19:00:00+08:00','2026-12-06T23:00:00+08:00',null,false,false,'Six student bands, one stage.','grace_teo',0.4),
('UX Research in the Wild',array['tech', 'career'],0,'2026-12-08T12:00:00+08:00','2026-12-08T14:00:00+08:00',20,false,false,'Run guerrilla interviews on campus with a template.','zhiwei_k',0.6),
('Lantern-Making Workshop',array['arts', 'others'],10,'2026-12-08T20:30:00+08:00','2026-12-08T22:30:00+08:00',25,false,false,'Paper lanterns for the festive season. Materials provided.','lakshmi_i',0.2),
('Night Market Food Tour',array['food'],17,'2026-12-09T19:30:00+08:00','2026-12-09T22:00:00+08:00',18,false,false,'Kampong Glam eats, from murtabak to teh tarik.','marcus_lee',1.0),
('Rock Climbing Taster',array['sports', 'outdoors'],12,'2026-12-09T19:00:00+08:00','2026-12-09T21:00:00+08:00',12,true,false,'Bouldering basics. Approval confirms gear sizing.','priya_n',1.0),
('Women in Tech Breakfast',array['career', 'tech'],2,'2026-12-11T07:00:00+08:00','2026-12-11T08:30:00+08:00',40,false,false,'Short talks and networking. Everyone welcome.','junhao_t',0.05),
('Retro Gaming Arcade Night',array['gaming'],16,'2026-12-11T19:00:00+08:00','2026-12-11T22:00:00+08:00',50,false,false,'CRTs, consoles and a Street Fighter bracket.','siti_r',0.2),
('Wildlife Spotting Walk',array['outdoors', 'volunteering'],14,'2026-12-11T19:00:00+08:00','2026-12-11T21:30:00+08:00',15,false,false,'With a nature guide. Bring binoculars if you have them.','ethan_goh',0.2),
('Calligraphy Basics',array['arts', 'wellness'],2,'2026-12-12T14:00:00+08:00','2026-12-12T16:00:00+08:00',20,false,false,'Brush lettering with ink and rice paper.','clara_w',0.6),
('End-of-Term Mixer',array['others', 'music'],0,'2026-12-13T15:30:00+08:00','2026-12-13T18:30:00+08:00',150,false,false,'DJ, snacks and games on the green.','ravi_k',0.2),
('Cycling Round the Island (Part 1)',array['sports', 'outdoors'],9,'2026-12-13T15:00:00+08:00','2026-12-13T20:00:00+08:00',20,true,false,'60 km east loop. Approval after a short fitness check-in.','huimin_l',0.6),
('Open Source Contribution Day',array['tech', 'volunteering'],19,'2026-12-12T10:00:00+08:00','2026-12-12T16:00:00+08:00',40,false,false,'Pick a good-first-issue; maintainers on hand.','daniel_ong',0.3),
('Hot Pot Social',array['food', 'others'],13,'2026-12-14T18:00:00+08:00','2026-12-14T20:30:00+08:00',10,false,false,'Shared pots, split the bill.','nur_aisyah',1.0),
('Year-End Charity Concert',array['music', 'volunteering'],3,'2026-12-16T20:00:00+08:00','2026-12-16T22:30:00+08:00',null,false,false,'Student ensembles raising funds for eldercare.','kevin_chua',0.42),
('New Year Goals Workshop',array['wellness', 'career'],null,'2026-12-16T19:00:00+08:00','2026-12-16T20:30:00+08:00',60,false,false,'Online: plan your next semester with a coach.','amelia_tan',0.3);

-- People: the auth row creates the profile (handle_new_user); then fill in the profile
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', md5('seed-person:' || username)::uuid, 'authenticated', 'authenticated', username || '@example.invalid', '',
  now(), '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', name), now() - interval '20 days', now(), '', '', '', ''
from seed_people on conflict (id) do nothing;
update public.profiles p set display_name = s.name, username = s.username, bio = s.bio, postal_code = s.postal, lat = s.lat, lng = s.lng
from seed_people s where p.id = md5('seed-person:' || s.username)::uuid and p.username is null;
insert into public.profile_interests (profile_id, interest_id)
select md5('seed-person:' || s.username)::uuid, i.id from seed_people s cross join unnest(s.interests) t(slug) join public.interests i on i.slug = t.slug
on conflict do nothing;

-- Venues
insert into public.venues (id, name, address, postal_code, latitude, longitude, is_indoor, created_by)
select md5('seed-venue:' || v.name)::uuid, v.name, v.address, v.postal, v.lat, v.lng, v.indoor,
  md5('seed-person:' || (select username from seed_people order by username offset (v.idx % 16) limit 1))::uuid
from seed_venues v on conflict (id) do nothing;

-- Events: published, official; venue null means online
insert into public.events (id, organiser_id, title, description, category, starts_at, ends_at, venue_id, capacity, requires_approval, join_mode,
  status, kind, is_online, hide_capacity)
select md5('seed-event:' || e.title)::uuid, md5('seed-person:' || e.host)::uuid, e.title, e.descr, initcap(e.tags[1]), e.starts, e.ends,
  (select md5('seed-venue:' || v.name)::uuid from seed_venues v where v.idx = e.venue), e.cap, e.approval,
  (case when e.approval then 'approval' else 'auto' end)::public.join_mode, 'published', 'official', e.venue is null, e.hide
from seed_events e on conflict (id) do nothing;
insert into public.event_interests (event_id, interest_id)
select md5('seed-event:' || e.title)::uuid, i.id from seed_events e cross join unnest(e.tags) t(slug) join public.interests i on i.slug = t.slug
on conflict do nothing;

-- RSVPs from sample people (never the host): enough to show counts, popularity and full events;
-- approval events keep their last two as pending requests
insert into public.registrations (event_id, user_id, status, created_at)
select md5('seed-event:' || title)::uuid, md5('seed-person:' || username)::uuid,
  (case when approval and rn > wanted - 2 then 'pending' else 'confirmed' end)::public.registration_status,
  now() - make_interval(hours => 1 + (abs(hashtext(title || username)) % 96))
from (
  select e.title, e.approval, p.username,
    row_number() over (partition by e.title order by md5(e.title || p.username)) as rn,
    least(15, greatest(1, case when e.cap is null then round(15 * e.fill) else round(e.cap * e.fill) end))::int as wanted
  from seed_events e join seed_people p on p.username <> e.host
) x where rn <= wanted
on conflict (event_id, user_id) do nothing;

-- Checks: any failure raises an error, which rolls back the whole seed
do $$
declare v_people int; v_venues int; v_events int; v_over int; v_past int; v_tagless int;
begin
  select count(*) into v_people from public.profiles p join seed_people s on p.id = md5('seed-person:' || s.username)::uuid and p.username = s.username;
  select count(*) into v_venues from public.venues v join seed_venues s on v.id = md5('seed-venue:' || s.name)::uuid;
  select count(*) into v_events from public.events e join seed_events s on e.id = md5('seed-event:' || s.title)::uuid and e.status = 'published';
  select count(*) into v_over from public.events e join seed_events s on e.id = md5('seed-event:' || s.title)::uuid
    where e.capacity is not null and (select count(*) from public.registrations r where r.event_id = e.id and r.status in ('confirmed', 'offered')) > e.capacity;
  select count(*) into v_past from seed_events where starts <= now();
  select count(*) into v_tagless from public.events e join seed_events s on e.id = md5('seed-event:' || s.title)::uuid
    where not exists (select 1 from public.event_interests ei where ei.event_id = e.id);
  if v_people <> 16 or v_venues <> 22 or v_events <> 60 or v_over > 0 or v_past > 0 or v_tagless > 0 then
    raise exception 'Seed check failed: people %, venues %, events %, over capacity %, in the past %, without tags %',
      v_people, v_venues, v_events, v_over, v_past, v_tagless;
  end if;
  raise notice 'Seed OK: 16 people, 22 venues, 60 events';
end $$;

commit;
