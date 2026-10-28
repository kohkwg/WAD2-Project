-- =============================================================================
-- OpenJio planning schema: hangouts, availability, itineraries, deals, places.
-- See docs/IDEATION-PLAN.md §9. Not applied to the hosted project yet; the app
-- uses the demo backend (client/src/utils/planningMockApi.js) until it is.
--
-- Ingestion tables (raw_posts, ingest_runs, review_queue) are left for the
-- scraping work (F8) and are intentionally not created here.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. ENUMS
-- -----------------------------------------------------------------------------
create type public.hangout_mode        as enum ('group', 'solo');
create type public.hangout_status      as enum ('collecting', 'slot_locked', 'planned', 'cancelled');
create type public.hangout_role        as enum ('host', 'member');
create type public.availability_source as enum ('gcal', 'grid');
create type public.availability_kind   as enum ('busy', 'free');
create type public.itinerary_origin    as enum ('auto', 'manual');
create type public.itinerary_status    as enum ('draft', 'voting', 'final');
create type public.stop_kind           as enum ('activity', 'meal', 'transit');
create type public.stop_ref_type       as enum ('event', 'external_event', 'deal', 'place', 'custom');


-- -----------------------------------------------------------------------------
-- 2. TABLES
-- -----------------------------------------------------------------------------

-- Deals and outside events (filled by seed data now, by ingestion later) -------
create table public.deals (
  id            uuid primary key default gen_random_uuid(),
  merchant      text not null,
  title         text not null,
  description   text,
  conditions    text[] not null default '{}',
  category      text,
  date_from     date,
  date_to       date,
  days_of_week  smallint[] not null default '{}',   -- 0 = Sunday … 6 = Saturday; empty = every day
  time_windows  jsonb not null default '[]',         -- [{ "start": "12:00", "end": "15:00" }]
  price_text    text,
  source_url    text,
  source_name   text,
  created_at    timestamptz not null default now(),
  check (date_to is null or date_from is null or date_to >= date_from)
);

create table public.deal_outlets (
  id        uuid primary key default gen_random_uuid(),
  deal_id   uuid not null references public.deals (id) on delete cascade,
  name      text not null,
  address   text,
  latitude  double precision,
  longitude double precision
);
create index deal_outlets_deal_id_idx on public.deal_outlets (deal_id);

create table public.external_events (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  venue_name   text,
  latitude     double precision,
  longitude    double precision,
  price_text   text,
  category     text,
  source_url   text,
  source_name  text,
  created_at   timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);

-- OpenStreetMap places cache ---------------------------------------------------
create table public.places (
  id             uuid primary key default gen_random_uuid(),
  osm_id         text unique,
  name           text not null,
  kind           text not null,                    -- e.g. restaurant, cafe, museum, park
  latitude       double precision not null,
  longitude      double precision not null,
  opening_hours  text,                             -- raw OSM opening_hours string
  fetched_at     timestamptz not null default now()
);

-- Hangouts ---------------------------------------------------------------------
create table public.hangouts (
  id                 uuid primary key default gen_random_uuid(),
  host_id            uuid not null references public.profiles (id) on delete cascade,
  title              text not null check (char_length(title) between 1 and 120),
  mode               public.hangout_mode not null default 'group',
  status             public.hangout_status not null default 'collecting',
  date_from          date not null,
  date_to            date not null,
  min_duration_mins  integer not null default 180 check (min_duration_mins between 30 and 1440),
  area_name          text,
  area_lat           double precision,
  area_lng           double precision,
  vibe               text[] not null default '{}',  -- interest slugs
  locked_slot_start  timestamptz,
  locked_slot_end    timestamptz,
  invite_code        text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  created_at         timestamptz not null default now(),
  check (date_to >= date_from),
  check (locked_slot_end is null or locked_slot_end > locked_slot_start)
);

create table public.hangout_members (
  hangout_id           uuid not null references public.hangouts (id) on delete cascade,
  user_id              uuid not null references public.profiles (id) on delete cascade,
  role                 public.hangout_role not null default 'member',
  required             boolean not null default false,
  availability_source  public.availability_source,
  arrival_at           timestamptz,
  joined_at            timestamptz not null default now(),
  primary key (hangout_id, user_id)
);
create index hangout_members_user_id_idx on public.hangout_members (user_id);

create table public.availability_blocks (
  id          uuid primary key default gen_random_uuid(),
  hangout_id  uuid not null,
  user_id     uuid not null,
  kind        public.availability_kind not null,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  foreign key (hangout_id, user_id) references public.hangout_members (hangout_id, user_id) on delete cascade,
  check (ends_at > starts_at)
);
create index availability_blocks_member_idx on public.availability_blocks (hangout_id, user_id);

-- Itineraries --------------------------------------------------------------------
create table public.itineraries (
  id            uuid primary key default gen_random_uuid(),
  hangout_id    uuid not null references public.hangouts (id) on delete cascade,
  version       integer not null default 1,
  generated_by  public.itinerary_origin not null,
  status        public.itinerary_status not null default 'draft',
  created_at    timestamptz not null default now(),
  unique (hangout_id, version)
);

create table public.itinerary_stops (
  id                     uuid primary key default gen_random_uuid(),
  itinerary_id           uuid not null references public.itineraries (id) on delete cascade,
  seq                    integer not null,
  kind                   public.stop_kind not null,
  ref_type               public.stop_ref_type not null default 'custom',
  ref_id                 uuid,
  title                  text not null,
  starts_at              timestamptz not null,
  ends_at                timestamptz not null,
  latitude               double precision,
  longitude              double precision,
  travel_mins_from_prev  integer,
  unique (itinerary_id, seq),
  check (ends_at > starts_at)
);

create table public.stop_alternatives (
  id        uuid primary key default gen_random_uuid(),
  stop_id   uuid not null references public.itinerary_stops (id) on delete cascade,
  ref_type  public.stop_ref_type not null,
  ref_id    uuid,
  title     text not null,
  score     numeric
);
create index stop_alternatives_stop_id_idx on public.stop_alternatives (stop_id);

create table public.stop_votes (
  stop_id  uuid not null references public.itinerary_stops (id) on delete cascade,
  user_id  uuid not null references public.profiles (id) on delete cascade,
  value    smallint not null check (value in (-1, 1)),
  voted_at timestamptz not null default now(),
  primary key (stop_id, user_id)
);


-- -----------------------------------------------------------------------------
-- 3. HELPERS
-- -----------------------------------------------------------------------------
create or replace function public.is_hangout_member(p_hangout_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.hangout_members m
    where m.hangout_id = p_hangout_id and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_hangout_host(p_hangout_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.hangouts h
    where h.id = p_hangout_id and h.host_id = (select auth.uid())
  );
$$;


-- -----------------------------------------------------------------------------
-- 4. ROW-LEVEL SECURITY
-- -----------------------------------------------------------------------------
alter table public.deals               enable row level security;
alter table public.deal_outlets        enable row level security;
alter table public.external_events     enable row level security;
alter table public.places              enable row level security;
alter table public.hangouts            enable row level security;
alter table public.hangout_members     enable row level security;
alter table public.availability_blocks enable row level security;
alter table public.itineraries         enable row level security;
alter table public.itinerary_stops     enable row level security;
alter table public.stop_alternatives   enable row level security;
alter table public.stop_votes          enable row level security;

-- Public catalogue data; writes come from the service role (ingestion) only.
create policy "Deals are public" on public.deals
  for select to anon, authenticated using (true);
create policy "Deal outlets are public" on public.deal_outlets
  for select to anon, authenticated using (true);
create policy "External events are public" on public.external_events
  for select to anon, authenticated using (true);
create policy "Places are public" on public.places
  for select to anon, authenticated using (true);

-- Hangouts: members read, host writes.
create policy "Members read their hangouts" on public.hangouts
  for select to authenticated using (public.is_hangout_member(id) or host_id = (select auth.uid()));
create policy "Users create hangouts they host" on public.hangouts
  for insert to authenticated with check (host_id = (select auth.uid()));
create policy "Hosts update their hangouts" on public.hangouts
  for update to authenticated using (host_id = (select auth.uid())) with check (host_id = (select auth.uid()));
create policy "Hosts delete their hangouts" on public.hangouts
  for delete to authenticated using (host_id = (select auth.uid()));

-- Joining by invite code goes through an RPC (to be written); members manage their own row.
create policy "Members see who is in their hangout" on public.hangout_members
  for select to authenticated using (public.is_hangout_member(hangout_id));
create policy "Hosts add themselves to their hangout" on public.hangout_members
  for insert to authenticated with check (user_id = (select auth.uid()) and public.is_hangout_host(hangout_id));
create policy "Members update their own membership" on public.hangout_members
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Members leave, hosts remove" on public.hangout_members
  for delete to authenticated using (user_id = (select auth.uid()) or public.is_hangout_host(hangout_id));

create policy "Members read availability in their hangout" on public.availability_blocks
  for select to authenticated using (public.is_hangout_member(hangout_id));
create policy "Members write their own availability" on public.availability_blocks
  for all to authenticated
  using (user_id = (select auth.uid()) and public.is_hangout_member(hangout_id))
  with check (user_id = (select auth.uid()) and public.is_hangout_member(hangout_id));

create policy "Members read itineraries" on public.itineraries
  for select to authenticated using (public.is_hangout_member(hangout_id));
create policy "Hosts write itineraries" on public.itineraries
  for all to authenticated using (public.is_hangout_host(hangout_id)) with check (public.is_hangout_host(hangout_id));

create policy "Members read stops" on public.itinerary_stops
  for select to authenticated using (exists (
    select 1 from public.itineraries i where i.id = itinerary_id and public.is_hangout_member(i.hangout_id)));
create policy "Hosts write stops" on public.itinerary_stops
  for all to authenticated
  using (exists (select 1 from public.itineraries i where i.id = itinerary_id and public.is_hangout_host(i.hangout_id)))
  with check (exists (select 1 from public.itineraries i where i.id = itinerary_id and public.is_hangout_host(i.hangout_id)));

create policy "Members read alternatives" on public.stop_alternatives
  for select to authenticated using (exists (
    select 1 from public.itinerary_stops s join public.itineraries i on i.id = s.itinerary_id
    where s.id = stop_id and public.is_hangout_member(i.hangout_id)));
create policy "Hosts write alternatives" on public.stop_alternatives
  for all to authenticated
  using (exists (select 1 from public.itinerary_stops s join public.itineraries i on i.id = s.itinerary_id
                 where s.id = stop_id and public.is_hangout_host(i.hangout_id)))
  with check (exists (select 1 from public.itinerary_stops s join public.itineraries i on i.id = s.itinerary_id
                      where s.id = stop_id and public.is_hangout_host(i.hangout_id)));

create policy "Members read votes" on public.stop_votes
  for select to authenticated using (exists (
    select 1 from public.itinerary_stops s join public.itineraries i on i.id = s.itinerary_id
    where s.id = stop_id and public.is_hangout_member(i.hangout_id)));
create policy "Members cast their own vote" on public.stop_votes
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.itinerary_stops s join public.itineraries i on i.id = s.itinerary_id
    where s.id = stop_id and public.is_hangout_member(i.hangout_id)));
