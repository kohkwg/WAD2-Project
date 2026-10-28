-- =============================================================================
-- Event platform schema for Supabase (audited revision)
-- Participants · Organisers · Helpers · Venue & floor plans
--
-- Target: Supabase Postgres 15+ (uses ON DELETE SET NULL (column) and pg_cron).
--
-- File storage:
--   Cloudflare R2     → images: avatars, floor-plan object images, finished floor-plan
--                       images. Postgres stores only the R2 object KEY; the app builds
--                       the URL. Uploads/deletes go through Express (holds the R2 keys).
--   Supabase Storage  → role-tagged helper documents only ('event-documents' bucket).
--   When a row pointing at a file is deleted, the file key is queued in
--   storage_cleanup_queue; Express (service role) drains the queue and deletes the files.
--
-- Auth: every RPC and RLS policy relies on auth.uid(). Express must call Supabase with
-- the signed-in user's JWT (per-request client), NOT the service-role key — the service
-- role bypasses RLS and makes auth.uid() null.
--
-- RSVP model (matches client/src/utils/api.js):
--   pending → confirmed | waitlisted | rejected       (organiser approval)
--   waitlisted → offered (24 h to answer) → confirmed | declined | expired
--   any active status → cancelled                     (participant)
--   A spot is held by 'confirmed' and 'offered' registrations.
--   Waitlist rank = live score (see _registration_scores; keep in sync with
--   client/src/utils/waitlistScore.js), ties broken by earliest sign-up.
--
-- Apply with the Supabase CLI (supabase/migrations/<timestamp>_init.sql)
-- or paste into Dashboard → SQL Editor and run once on an empty project.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. ENUMS
-- -----------------------------------------------------------------------------
create type public.event_status          as enum ('draft', 'published', 'cancelled', 'completed');
create type public.member_role           as enum ('organiser', 'helper');
create type public.registration_status   as enum ('pending', 'confirmed', 'waitlisted', 'offered',
                                                  'rejected', 'cancelled', 'declined', 'expired');
create type public.question_type         as enum ('short_text', 'long_text', 'single_choice', 'multi_choice', 'yes_no', 'number');
create type public.check_in_method       as enum ('personal_qr', 'scan_in_qr', 'barcode', 'manual', 'csv_import');
create type public.task_status           as enum ('todo', 'in_progress', 'done');
create type public.budget_kind           as enum ('income', 'expense');
create type public.announcement_audience as enum ('everyone', 'participants', 'helpers');
create type public.floor_plan_asset_kind as enum ('object', 'finished');   -- editor image vs exported floor plan


-- -----------------------------------------------------------------------------
-- 2. TABLES
-- -----------------------------------------------------------------------------

-- Users & interests ------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null default '' check (char_length(display_name) <= 80),
  avatar_key    text,                        -- R2 object key, e.g. avatars/<user_id>/<file>.png
  bio           text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.interests (
  id    bigint generated always as identity primary key,
  slug  text not null unique,
  name  text not null
);

create table public.profile_interests (
  profile_id   uuid   not null references public.profiles (id) on delete cascade,
  interest_id  bigint not null references public.interests (id) on delete cascade,
  primary key (profile_id, interest_id)
);

-- Club/group membership: an organiser account marks people as members.
-- Feeds the "member" part of the waitlist score.
create table public.organiser_members (
  organiser_id  uuid not null references public.profiles (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  added_at      timestamptz not null default now(),
  primary key (organiser_id, user_id),
  check (organiser_id <> user_id)
);

-- Venues (geocoded via OneMap on the client / edge function) -------------------
create table public.venues (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  address      text,
  postal_code  text,
  latitude     double precision check (latitude  is null or latitude  between -90  and 90),
  longitude    double precision check (longitude is null or longitude between -180 and 180),
  is_indoor    boolean not null default false,
  onemap_data  jsonb,                       -- raw OneMap search result, for reference
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  check ((latitude is null) = (longitude is null))
);

-- Events -----------------------------------------------------------------------
create table public.events (
  id                      uuid primary key default gen_random_uuid(),
  -- restrict: deleting an organiser account must not silently delete every event
  -- and every participant's registration / check-in history with it
  organiser_id            uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  title                   text not null check (btrim(title) <> '' and char_length(title) <= 200),
  description             text not null default '',
  category                text,
  starts_at               timestamptz not null,
  ends_at                 timestamptz not null,
  venue_id                uuid references public.venues (id) on delete set null,
  backup_venue_id         uuid references public.venues (id) on delete set null,
  using_backup            boolean not null default false,
  capacity                int check (capacity is null or capacity > 0),   -- null = unlimited
  requires_approval       boolean not null default false,
  registration_closes_at  timestamptz,
  status                  public.event_status not null default 'draft',
  published_at            timestamptz,
  search_vector           tsvector generated always as (
                            setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
                            setweight(to_tsvector('english', coalesce(category, '')), 'B') ||
                            setweight(to_tsvector('english', coalesce(description, '')), 'C')
                          ) stored,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  check (ends_at > starts_at),
  check (registration_closes_at is null or registration_closes_at <= ends_at),
  check (not using_backup or backup_venue_id is not null)
);

-- Kept in its own table so participants (who can read events) never see it.
create table public.event_secrets (
  event_id        uuid primary key references public.events (id) on delete cascade,
  checkin_secret  text not null default replace(gen_random_uuid()::text, '-', ''),
  rotated_at      timestamptz not null default now()
);

create table public.event_interests (
  event_id     uuid   not null references public.events (id) on delete cascade,
  interest_id  bigint not null references public.interests (id) on delete cascade,
  primary key (event_id, interest_id)
);

-- Team: organisers & helpers ---------------------------------------------------
create table public.helper_roles (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events (id) on delete cascade,
  name          text not null,                 -- e.g. "Registration desk", "Usher"
  description   text,
  instructions  text,                          -- shown only to helpers with this role
  colour        text check (colour is null or colour ~ '^#[0-9A-Fa-f]{6}$'),  -- for floor-plan markers
  created_at    timestamptz not null default now(),
  unique (event_id, name),
  unique (id, event_id)                        -- lets other tables require a role from the same event
);

create table public.event_members (
  event_id        uuid not null references public.events (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  member_role     public.member_role not null default 'helper',
  helper_role_id  uuid,
  added_at        timestamptz not null default now(),
  primary key (event_id, user_id),
  -- the helper role must belong to the same event
  foreign key (helper_role_id, event_id) references public.helper_roles (id, event_id)
    on delete set null (helper_role_id)
);

-- Registration -----------------------------------------------------------------
create table public.event_questions (
  id        uuid primary key default gen_random_uuid(),
  event_id  uuid not null references public.events (id) on delete cascade,
  prompt    text not null,
  type      public.question_type not null default 'short_text',
  options   jsonb not null default '[]'::jsonb,   -- choices for single/multi choice
  required  boolean not null default false,
  position  int not null default 0,
  check (case
           when jsonb_typeof(options) <> 'array' then false
           when type in ('single_choice', 'multi_choice') then jsonb_array_length(options) >= 2
           else true
         end)
);

create table public.registrations (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references public.events (id) on delete cascade,
  user_id           uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  status            public.registration_status not null default 'pending',
  offer_expires_at  timestamptz,                    -- set only while status = 'offered'
  late_cancel       boolean not null default false, -- cancelled a held spot < 24 h before start
  qr_token          text not null unique default replace(gen_random_uuid()::text, '-', ''),          -- personal QR
  ticket_code       text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), -- barcode
  decided_at        timestamptz,
  decided_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  unique (event_id, user_id),
  check ((status = 'offered') = (offer_expires_at is not null))
);

create table public.registration_answers (
  registration_id  uuid not null references public.registrations (id) on delete cascade,
  question_id      uuid not null references public.event_questions (id) on delete cascade,
  answer           jsonb,
  primary key (registration_id, question_id)
);

-- Check-in ---------------------------------------------------------------------
create table public.check_ins (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events (id) on delete cascade,
  registration_id  uuid not null unique references public.registrations (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  method           public.check_in_method not null,
  checked_in_at    timestamptz not null default now(),
  checked_in_by    uuid references public.profiles (id) on delete set null,  -- staff member, null for self check-in
  device_id        text,                -- stable per-device id sent by the app on self check-in
  latitude         double precision check (latitude  is null or latitude  between -90  and 90),
  longitude        double precision check (longitude is null or longitude between -180 and 180),
  fraud_flag       boolean not null default false,
  fraud_reasons    text[]  not null default '{}',
  fraud_reviewed   boolean not null default false
);

-- Event management dashboard ---------------------------------------------------
create table public.tasks (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events (id) on delete cascade,
  title           text not null,
  description     text,
  status          public.task_status not null default 'todo',
  helper_role_id  uuid,                -- visible to everyone with this role
  assignee_id     uuid,                -- or to one team member
  due_at          timestamptz,
  position        int not null default 0,
  created_by      uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (helper_role_id, event_id) references public.helper_roles (id, event_id)
    on delete set null (helper_role_id),
  -- assignee must be on this event's team; removing them from the team unassigns the task
  foreign key (event_id, assignee_id) references public.event_members (event_id, user_id)
    on delete set null (assignee_id)
);

create table public.budget_items (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references public.events (id) on delete cascade,
  kind              public.budget_kind not null default 'expense',
  category          text,
  description       text not null,
  estimated_amount  numeric(12, 2) not null default 0 check (estimated_amount >= 0),
  actual_amount     numeric(12, 2) check (actual_amount is null or actual_amount >= 0),
  created_by        uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.announcements (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events (id) on delete cascade,
  author_id     uuid default auth.uid() references public.profiles (id) on delete set null,
  title         text not null,
  body          text not null,
  audience      public.announcement_audience not null default 'everyone',
  is_automatic  boolean not null default false,   -- true for system posts (e.g. venue switch)
  created_at    timestamptz not null default now()
);

create table public.documents (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events (id) on delete cascade,
  helper_role_id  uuid,                   -- null = all helpers
  title           text not null,
  storage_path    text not null unique,   -- path inside the 'event-documents' bucket: <event_id>/<file>
  uploaded_by     uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  foreign key (helper_role_id, event_id) references public.helper_roles (id, event_id) on delete cascade
);

create table public.weather_checks (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid not null references public.events (id) on delete cascade,
  checked_at          timestamptz not null default now(),
  source              text,                -- e.g. 'NEA 2-hour forecast'
  forecast            jsonb,
  rain_expected       boolean not null default false,
  suggested_venue_id  uuid references public.venues (id) on delete set null
);

-- Venue, floor plan & programme ------------------------------------------------
-- Floor plans are team-only. Participants see a floor plan only through its finished
-- image in floor_plan_assets, and only when the organiser marks that image public.
create table public.floor_plans (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events (id) on delete cascade,
  venue_id         uuid references public.venues (id) on delete set null,
  name             text not null default 'Main floor',
  width            int not null default 1000 check (width  > 0),
  height           int not null default 700  check (height > 0),
  layout           jsonb not null default '{"elements": []}'::jsonb,  -- shapes, zones, labels from the editor
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, event_id)                 -- lets child tables require a matching event_id
);

-- Images stored in R2 for a floor plan: the organiser's object images (used in the
-- editor) and the one finished image exported from the editor.
-- R2 key layout (one "group" per floor plan): floorplans/<event_id>/<floor_plan_id>/<file>
-- Rows are written by Express after it uploads to R2. Deleting a row queues the R2 key
-- in storage_cleanup_queue (trigger below); Express deletes the file from R2.
create table public.floor_plan_assets (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events (id) on delete cascade,
  floor_plan_id  uuid not null,
  kind           public.floor_plan_asset_kind not null default 'object',
  name           text not null,
  r2_key         text not null unique,
  is_public      boolean not null default false,   -- organiser toggle; only meaningful for 'finished'
  uploaded_by    uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  -- the floor plan must belong to the same event as event_id (RLS checks event_id)
  foreign key (floor_plan_id, event_id) references public.floor_plans (id, event_id) on delete cascade,
  -- object images can never be made public
  check (kind = 'finished' or not is_public)
);

create table public.helper_placements (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events (id) on delete cascade,
  floor_plan_id  uuid not null,
  user_id        uuid not null,
  x              numeric not null,
  y              numeric not null,
  label          text,
  starts_at      timestamptz,
  ends_at        timestamptz,
  foreign key (floor_plan_id, event_id) references public.floor_plans (id, event_id) on delete cascade,
  -- only team members can be placed; removing them from the team removes their placements
  foreign key (event_id, user_id) references public.event_members (event_id, user_id) on delete cascade,
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table public.programme_items (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events (id) on delete cascade,
  title           text not null,
  description     text,
  starts_at       timestamptz not null,
  ends_at         timestamptz,
  location_label  text,
  floor_plan_id   uuid,
  zone_key        text,                  -- id of a zone inside floor_plans.layout
  position        int not null default 0,
  foreign key (floor_plan_id, event_id) references public.floor_plans (id, event_id)
    on delete set null (floor_plan_id),
  check (ends_at is null or ends_at > starts_at)
);

-- Files whose database row is gone. Express (service role) deletes each file from
-- R2 / Supabase Storage, then deletes the queue row. No API access (RLS, no policies).
create table public.storage_cleanup_queue (
  id          bigint generated always as identity primary key,
  backend     text not null check (backend in ('r2', 'supabase')),
  object_key  text not null,
  queued_at   timestamptz not null default now()
);


-- -----------------------------------------------------------------------------
-- 3. INDEXES
-- -----------------------------------------------------------------------------
create index on public.profile_interests (interest_id);
create index on public.organiser_members (user_id);
create index on public.events (status, starts_at);
create index on public.events (organiser_id);
create index events_search_idx on public.events using gin (search_vector);
create index on public.event_interests (interest_id);
create index on public.event_members (user_id);
create index on public.event_members (helper_role_id);
create index on public.helper_roles (event_id);
create index on public.event_questions (event_id, position);
create index on public.registrations (event_id, status);
create index on public.registrations (user_id);
-- offer-expiry sweep only ever looks at open offers
create index registrations_open_offers_idx
  on public.registrations (offer_expires_at) where status = 'offered';
create index on public.registration_answers (question_id);
create index on public.check_ins (event_id, checked_in_at desc);
create index on public.check_ins (event_id, device_id);
create index on public.check_ins (user_id);
create index on public.tasks (event_id, status);
create index on public.tasks (event_id, assignee_id);
create index on public.tasks (helper_role_id);
create index on public.budget_items (event_id);
create index on public.announcements (event_id, created_at desc);
create index on public.documents (event_id);
create index on public.documents (helper_role_id);
create index on public.weather_checks (event_id, checked_at desc);
create index on public.floor_plans (event_id);
create index on public.floor_plan_assets (floor_plan_id);
-- at most one finished image per floor plan (a new one replaces the old one)
create unique index floor_plan_assets_one_finished
  on public.floor_plan_assets (floor_plan_id) where kind = 'finished';
create index on public.helper_placements (floor_plan_id);
create index on public.helper_placements (event_id, user_id);
create index on public.programme_items (event_id, starts_at);
create index on public.programme_items (floor_plan_id);


-- -----------------------------------------------------------------------------
-- 4. ACCESS HELPERS (used by RLS policies)
--    security definer so they can read event_members without RLS recursion.
-- -----------------------------------------------------------------------------
create or replace function public.is_event_organiser(p_event_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.event_members m
    where m.event_id = p_event_id and m.user_id = auth.uid() and m.member_role = 'organiser'
  );
$$;

create or replace function public.is_event_staff(p_event_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.event_members m
    where m.event_id = p_event_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.my_helper_role(p_event_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select m.helper_role_id from public.event_members m
  where m.event_id = p_event_id and m.user_id = auth.uid();
$$;

create or replace function public.is_event_participant(p_event_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.registrations r
    where r.event_id = p_event_id and r.user_id = auth.uid()
      and r.status in ('confirmed', 'offered', 'pending', 'waitlisted')
  );
$$;

create or replace function public.can_view_event(p_event_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id and (e.status <> 'draft' or public.is_event_staff(e.id))
  );
$$;


-- -----------------------------------------------------------------------------
-- 5. UTILITY FUNCTIONS
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Great-circle distance in metres.
create or replace function public.distance_m(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
returns float8 language sql immutable set search_path = '' as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- Live waitlist score for every registration of one event. Keep in sync with
-- client/src/utils/waitlistScore.js:
--   score = 0.4 × member + 0.3 × interest match + 0.3 × show-up rate     (0 to 1)
--   member          1 if the event's organiser marked the person as a member
--   interest match  share of the event's interests that are on the person's profile
--   show-up rate    over past events the person held a spot at: attended weight minus
--                   0.5 × late-cancel weight, ÷ total weight; weight halves every 90 days.
--                   No history → 0.5. Never below 0.
-- waitlist_rank is set only for 'waitlisted' rows (1 = next to get an offer).
create or replace function public._registration_scores(p_event_id uuid)
returns table (
  registration_id uuid, user_id uuid, status public.registration_status, created_at timestamptz,
  is_member boolean, interest_match numeric, show_up_rate numeric, score numeric, waitlist_rank int
)
language sql stable security definer set search_path = '' as $$
  with ev as (
    select e.id, e.organiser_id,
           (select count(*) from public.event_interests ei where ei.event_id = e.id) as n_tags
    from public.events e
    where e.id = p_event_id
  ),
  parts as (
    select
      r.id         as reg_id,
      r.user_id    as reg_user,
      r.status     as reg_status,
      r.created_at as reg_created,
      exists (
        select 1 from public.organiser_members om
        where om.organiser_id = ev.organiser_id and om.user_id = r.user_id
      ) as member,
      case when ev.n_tags = 0 then 0::numeric else (
        select count(*)::numeric
        from public.event_interests ei
        join public.profile_interests pi on pi.interest_id = ei.interest_id and pi.profile_id = r.user_id
        where ei.event_id = ev.id
      ) / ev.n_tags end as interest,
      (
        select case
                 when sum(h.w) is null then 0.5
                 else greatest(0, sum(case when h.attended then h.w else 0 end)
                                  - sum(case when h.late_cancel then 0.5 * h.w else 0 end)) / sum(h.w)
               end
        from (
          select power(0.5, greatest(0, extract(epoch from (now() - pe.starts_at))::float8) / 86400 / 90) as w,
                 exists (select 1 from public.check_ins c where c.registration_id = pr.id) as attended,
                 pr.late_cancel
          from public.registrations pr
          join public.events pe on pe.id = pr.event_id
          where pr.user_id = r.user_id
            and pe.ends_at < now()
            and (pr.status = 'confirmed' or pr.late_cancel)
        ) h
      )::numeric as show_up
    from public.registrations r
    cross join ev
    where r.event_id = ev.id
  ),
  scored as (
    select p.*, 0.4 * p.member::int + 0.3 * p.interest + 0.3 * p.show_up as total
    from parts p
  )
  select s.reg_id, s.reg_user, s.reg_status, s.reg_created, s.member,
         round(s.interest, 4), round(s.show_up, 4), round(s.total, 4),
         case when s.reg_status = 'waitlisted' then
           (row_number() over (partition by s.reg_status = 'waitlisted'
                               order by s.total desc, s.reg_created asc))::int
         end
  from scored s;
$$;

-- Offer free spots to the waitlist, best score first (ties: earliest sign-up).
-- Each offer lasts 24 h; expire_offers() passes unanswered offers on.
create or replace function public._promote_waitlist(p_event_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_cap    int;
  v_status public.event_status;
  v_ends   timestamptz;
  v_spots  int;
  v_n      int := 0;
begin
  select capacity, status, ends_at into v_cap, v_status, v_ends
  from public.events where id = p_event_id for update;
  if not found or v_status <> 'published' or v_ends < now() then return 0; end if;

  if v_cap is null then
    update public.registrations set status = 'confirmed'
    where event_id = p_event_id and status = 'waitlisted';
    get diagnostics v_n = row_count;
    return v_n;
  end if;

  select v_cap - count(*) into v_spots
  from public.registrations where event_id = p_event_id and status in ('confirmed', 'offered');
  if v_spots <= 0 then return 0; end if;

  update public.registrations
     set status = 'offered', offer_expires_at = now() + interval '24 hours'
  where id in (
    select s.registration_id
    from public._registration_scores(p_event_id) s
    where s.status = 'waitlisted'
    order by s.waitlist_rank
    limit v_spots
  );
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Scheduled (pg_cron, section 11): expire unanswered offers. The registrations
-- trigger then offers each freed spot to the next person on the waitlist.
create or replace function public.expire_offers()
returns int language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  update public.registrations set status = 'expired'
  where status = 'offered' and offer_expires_at <= now();
  get diagnostics v_n = row_count;
  return v_n;
end $$;


-- -----------------------------------------------------------------------------
-- 6. TRIGGERS
-- -----------------------------------------------------------------------------

-- New auth user → profile (avatar_key starts empty; avatars are uploaded to R2 via Express)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1), ''), 80)
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at
create trigger profiles_updated_at     before update on public.profiles     for each row execute function public.set_updated_at();
create trigger tasks_updated_at        before update on public.tasks        for each row execute function public.set_updated_at();
create trigger budget_items_updated_at before update on public.budget_items for each row execute function public.set_updated_at();
create trigger floor_plans_updated_at  before update on public.floor_plans  for each row execute function public.set_updated_at();

-- Events: timestamps; owner and created_at cannot be changed after insert
create or replace function public.events_before_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.organiser_id := old.organiser_id;
    new.created_at   := old.created_at;
  end if;
  new.updated_at := now();
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end $$;

create trigger events_before_write
  before insert or update on public.events
  for each row execute function public.events_before_write();

-- Events: creator becomes organiser; create check-in secret
create or replace function public.events_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.event_members (event_id, user_id, member_role)
  values (new.id, new.organiser_id, 'organiser')
  on conflict (event_id, user_id) do update set member_role = 'organiser';

  insert into public.event_secrets (event_id) values (new.id);
  return null;
end $$;

create trigger events_after_insert
  after insert on public.events
  for each row execute function public.events_after_insert();

-- Events: capacity raised → offer the new spots to the waitlist
create or replace function public.events_after_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.capacity is null and old.capacity is not null)
     or (new.capacity is not null and old.capacity is not null and new.capacity > old.capacity) then
    perform public._promote_waitlist(new.id);
  end if;
  return null;
end $$;

create trigger events_after_update
  after update of capacity on public.events
  for each row execute function public.events_after_update();

-- Team: the event's owner always stays an organiser on its team
create or replace function public.event_members_protect_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.events e where e.id = old.event_id and e.organiser_id = old.user_id) then
    if tg_op = 'DELETE' then
      raise exception 'The event owner cannot be removed from the team';
    elsif new.member_role <> 'organiser' or new.user_id <> old.user_id or new.event_id <> old.event_id then
      raise exception 'The event owner must stay an organiser';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger event_members_protect_owner
  before update or delete on public.event_members
  for each row execute function public.event_members_protect_owner();

-- Registrations: lock identity columns, record decisions, track late cancels,
-- enforce capacity (a spot is held by 'confirmed' and 'offered')
create or replace function public.registrations_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_cap    int;
  v_start  timestamptz;
  v_held   int;
begin
  new.event_id    := old.event_id;
  new.user_id     := old.user_id;
  new.qr_token    := old.qr_token;
  new.ticket_code := old.ticket_code;

  if new.status is distinct from old.status then
    new.decided_at := now();
    new.decided_by := auth.uid();

    if new.status = 'offered' then
      new.offer_expires_at := coalesce(new.offer_expires_at, now() + interval '24 hours');
    else
      new.offer_expires_at := null;
    end if;

    if new.status = 'cancelled' then
      select starts_at into v_start from public.events where id = new.event_id;
      new.late_cancel := old.status in ('confirmed', 'offered') and now() > v_start - interval '24 hours';
    end if;

    if new.status in ('confirmed', 'offered') and old.status not in ('confirmed', 'offered') then
      select capacity into v_cap from public.events where id = new.event_id for update;
      if v_cap is not null then
        select count(*) into v_held from public.registrations
        where event_id = new.event_id and status in ('confirmed', 'offered') and id <> new.id;
        if v_held >= v_cap then
          raise exception 'Event is at capacity — set this registration to waitlisted instead';
        end if;
      end if;
    end if;
  end if;
  return new;
end $$;

create trigger registrations_before_update
  before update on public.registrations
  for each row execute function public.registrations_before_update();

-- Registrations: a held spot was freed → offer it to the waitlist
create or replace function public.registrations_after_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.status in ('confirmed', 'offered')
     and new.status not in ('confirmed', 'offered') then
    perform public._promote_waitlist(new.event_id);
  elsif tg_op = 'DELETE' and old.status in ('confirmed', 'offered') then
    perform public._promote_waitlist(old.event_id);
  end if;
  return null;
end $$;

create trigger registrations_after_change
  after update of status or delete on public.registrations
  for each row execute function public.registrations_after_change();

-- Check-ins: fraud heuristics for suspected proxy check-ins
create or replace function public.check_ins_flag_fraud()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  e public.events;
  v public.venues;
begin
  select * into e from public.events where id = new.event_id;

  -- 1. One phone checking in several different people (self scan-in only)
  if new.method = 'scan_in_qr' and new.device_id is not null then
    if exists (
      select 1 from public.check_ins c
      where c.event_id = new.event_id and c.device_id = new.device_id and c.user_id <> new.user_id
    ) then
      new.fraud_flag    := true;
      new.fraud_reasons := array_append(new.fraud_reasons, 'shared_device');
      update public.check_ins c
        set fraud_flag = true, fraud_reasons = array_append(c.fraud_reasons, 'shared_device')
      where c.event_id = new.event_id and c.device_id = new.device_id
        and not ('shared_device' = any (c.fraud_reasons));
    end if;
  end if;

  -- 2. Self check-in from more than 300 m away from the active venue
  if new.latitude is not null and new.longitude is not null then
    select * into v from public.venues
    where id = case when e.using_backup then e.backup_venue_id else e.venue_id end;
    if found and v.latitude is not null and v.longitude is not null
       and public.distance_m(new.latitude, new.longitude, v.latitude, v.longitude) > 300 then
      new.fraud_flag    := true;
      new.fraud_reasons := array_append(new.fraud_reasons, 'far_from_venue');
    end if;
  end if;

  -- 3. Checked in long before the event or after it ended
  if new.method <> 'csv_import'
     and (new.checked_in_at < e.starts_at - interval '2 hours' or new.checked_in_at > e.ends_at) then
    new.fraud_flag    := true;
    new.fraud_reasons := array_append(new.fraud_reasons, 'outside_event_window');
  end if;

  return new;
end $$;

create trigger check_ins_flag_fraud
  before insert on public.check_ins
  for each row execute function public.check_ins_flag_fraud();

-- Files: queue the object for deletion when the row pointing at it goes away
create or replace function public.queue_file_cleanup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'floor_plan_assets' then
    insert into public.storage_cleanup_queue (backend, object_key) values ('r2', old.r2_key);
  elsif tg_table_name = 'documents' then
    insert into public.storage_cleanup_queue (backend, object_key) values ('supabase', old.storage_path);
  elsif tg_table_name = 'profiles' and old.avatar_key is not null
        and (tg_op = 'DELETE' or new.avatar_key is distinct from old.avatar_key) then
    insert into public.storage_cleanup_queue (backend, object_key) values ('r2', old.avatar_key);
  end if;
  return null;
end $$;

create trigger floor_plan_assets_cleanup
  after delete on public.floor_plan_assets
  for each row execute function public.queue_file_cleanup();
create trigger documents_cleanup
  after delete on public.documents
  for each row execute function public.queue_file_cleanup();
create trigger profiles_avatar_cleanup
  after update of avatar_key or delete on public.profiles
  for each row execute function public.queue_file_cleanup();


-- -----------------------------------------------------------------------------
-- 7. RPC FUNCTIONS (call with supabase.rpc('name', { ... }))
-- -----------------------------------------------------------------------------

-- Discover: personalised "For you" list
create or replace function public.for_you_events(p_limit int default 20)
returns setof public.events language sql stable security invoker set search_path = '' as $$
  select e.*
  from public.events e
  left join lateral (
    select count(*) as matches
    from public.event_interests ei
    join public.profile_interests pi on pi.interest_id = ei.interest_id and pi.profile_id = auth.uid()
    where ei.event_id = e.id
  ) m on true
  where e.status = 'published'
    and e.starts_at > now()
    and not exists (
      select 1 from public.registrations r
      where r.event_id = e.id and r.user_id = auth.uid()
        and r.status not in ('cancelled', 'declined', 'expired')
    )
  order by
    m.matches * 10                                                                   -- interest overlap
    + greatest(0, 5 - extract(epoch from (e.starts_at - now())) / 86400 / 7) desc,   -- sooner = higher
    e.starts_at asc
  limit p_limit;
$$;

-- Public capacity info for one or many events in one call (participants can't read
-- other people's registrations). Pass the ids of every event shown on the page.
create or replace function public.event_availability(p_event_ids uuid[])
returns table (
  event_id uuid, capacity int, confirmed int, offered int, pending int, waitlisted int, spots_left int
)
language sql stable security definer set search_path = '' as $$
  select e.id, e.capacity,
         (count(r.id) filter (where r.status = 'confirmed'))::int,
         (count(r.id) filter (where r.status = 'offered'))::int,
         (count(r.id) filter (where r.status = 'pending'))::int,
         (count(r.id) filter (where r.status = 'waitlisted'))::int,
         case when e.capacity is null then null
              else greatest(e.capacity - count(r.id) filter (where r.status in ('confirmed', 'offered')), 0)::int
         end
  from public.events e
  left join public.registrations r on r.event_id = e.id
  where e.id = any (p_event_ids) and (e.status <> 'draft' or public.is_event_staff(e.id))
  group by e.id;
$$;

-- Organiser RSVP page: every registration with name, email, answers, member flag,
-- score breakdown and waitlist rank — one call instead of one query per person.
create or replace function public.event_registrations(p_event_id uuid)
returns table (
  registration_id uuid, user_id uuid, display_name text, email text,
  status public.registration_status, created_at timestamptz, offer_expires_at timestamptz,
  answers jsonb, is_member boolean, interest_match numeric, show_up_rate numeric,
  score numeric, waitlist_rank int
)
language sql stable security definer set search_path = '' as $$
  select s.registration_id, s.user_id, p.display_name, u.email::text,
         r.status, r.created_at, r.offer_expires_at,
         coalesce((
           select jsonb_object_agg(a.question_id::text, a.answer)
           from public.registration_answers a where a.registration_id = r.id
         ), '{}'::jsonb),
         s.is_member, s.interest_match, s.show_up_rate, s.score, s.waitlist_rank
  from public._registration_scores(p_event_id) s
  join public.registrations r on r.id = s.registration_id
  join public.profiles p      on p.id = r.user_id
  join auth.users u           on u.id = r.user_id
  where public.is_event_organiser(p_event_id)
  order by s.waitlist_rank nulls last, r.created_at;
$$;

-- RSVP with answers to custom questions.
-- p_answers: [{ "question_id": "...", "answer": <any json> }, ...]
create or replace function public.register_for_event(p_event_id uuid, p_answers jsonb default '[]'::jsonb)
returns public.registrations language plpgsql security definer set search_path = '' as $$
declare
  e        public.events;
  v_status public.registration_status;
  v_held   int;
  v_reg    public.registrations;
  q        record;
begin
  if auth.uid() is null then raise exception 'Sign in to register'; end if;

  select * into e from public.events where id = p_event_id for update;
  if not found or e.status <> 'published' then raise exception 'This event is not open for registration'; end if;
  if e.registration_closes_at is not null and now() > e.registration_closes_at then raise exception 'Registration has closed'; end if;
  if now() > e.ends_at then raise exception 'This event has ended'; end if;

  for q in select id, prompt from public.event_questions where event_id = p_event_id and required loop
    if not exists (
      select 1 from jsonb_array_elements(p_answers) a
      where a ->> 'question_id' = q.id::text and nullif(a ->> 'answer', '') is not null
    ) then
      raise exception 'Please answer: %', q.prompt;
    end if;
  end loop;

  select count(*) into v_held from public.registrations
  where event_id = p_event_id and status in ('confirmed', 'offered');

  v_status := case
    when e.requires_approval then 'pending'
    when e.capacity is not null and v_held >= e.capacity then 'waitlisted'
    else 'confirmed'
  end;

  insert into public.registrations (event_id, user_id, status)
  values (p_event_id, auth.uid(), v_status)
  on conflict (event_id, user_id) do update
    set status = excluded.status, offer_expires_at = null, late_cancel = false,
        created_at = now(), decided_at = null, decided_by = null
    -- signing up again after cancelling, declining or letting an offer expire
    where public.registrations.status in ('cancelled', 'declined', 'expired')
  returning * into v_reg;

  if not found then raise exception 'You already have an RSVP for this event'; end if;

  delete from public.registration_answers where registration_id = v_reg.id;
  insert into public.registration_answers (registration_id, question_id, answer)
  select v_reg.id, q2.id, a -> 'answer'
  from jsonb_array_elements(p_answers) a
  join public.event_questions q2 on q2.id::text = a ->> 'question_id' and q2.event_id = p_event_id;

  return v_reg;
end $$;

create or replace function public.cancel_registration(p_event_id uuid)
returns public.registrations language plpgsql security definer set search_path = '' as $$
declare v_reg public.registrations;
begin
  update public.registrations set status = 'cancelled'
  where event_id = p_event_id and user_id = auth.uid()
    and status in ('pending', 'confirmed', 'waitlisted', 'offered')
  returning * into v_reg;
  if not found then raise exception 'No active registration to cancel'; end if;
  return v_reg;
end $$;

-- Participant: answer a waitlist offer. accept = false passes the spot on.
create or replace function public.respond_to_offer(p_registration_id uuid, p_accept boolean)
returns public.registrations language plpgsql security definer set search_path = '' as $$
declare v_reg public.registrations;
begin
  select * into v_reg from public.registrations
  where id = p_registration_id and user_id = auth.uid()
  for update;
  if not found then raise exception 'Registration not found'; end if;
  if v_reg.status <> 'offered' or v_reg.offer_expires_at <= now() then
    raise exception 'This offer has expired or was already answered';
  end if;

  update public.registrations
     set status = case when p_accept then 'confirmed'::public.registration_status
                       else 'declined'::public.registration_status end
  where id = p_registration_id
  returning * into v_reg;
  return v_reg;
end $$;

-- Organiser: approve a pending registration → confirmed if there is room, else waitlisted
create or replace function public.approve_registration(p_registration_id uuid)
returns public.registrations language plpgsql security definer set search_path = '' as $$
declare
  v_reg  public.registrations;
  v_cap  int;
  v_held int;
begin
  select * into v_reg from public.registrations where id = p_registration_id;
  if not found then raise exception 'Registration not found'; end if;
  if not public.is_event_organiser(v_reg.event_id) then raise exception 'Only organisers can do this'; end if;

  -- lock the event first (same order as register_for_event / _promote_waitlist)
  select capacity into v_cap from public.events where id = v_reg.event_id for update;
  select count(*) into v_held from public.registrations
  where event_id = v_reg.event_id and status in ('confirmed', 'offered');

  update public.registrations
     set status = case when v_cap is null or v_held < v_cap then 'confirmed'::public.registration_status
                       else 'waitlisted'::public.registration_status end
  where id = p_registration_id and status = 'pending'
  returning * into v_reg;
  if not found then raise exception 'Only pending registrations can be approved'; end if;
  return v_reg;
end $$;

create or replace function public.reject_registration(p_registration_id uuid)
returns public.registrations language plpgsql security definer set search_path = '' as $$
declare v_reg public.registrations;
begin
  select * into v_reg from public.registrations where id = p_registration_id;
  if not found then raise exception 'Registration not found'; end if;
  if not public.is_event_organiser(v_reg.event_id) then raise exception 'Only organisers can do this'; end if;

  update public.registrations set status = 'rejected'
  where id = p_registration_id and status = 'pending'
  returning * into v_reg;
  if not found then raise exception 'Only pending registrations can be rejected'; end if;
  return v_reg;
end $$;

-- Organiser: manually run waitlist promotion
create or replace function public.promote_waitlist(p_event_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_event_organiser(p_event_id) then raise exception 'Only organisers can do this'; end if;
  return public._promote_waitlist(p_event_id);
end $$;

-- Organiser: add an organiser/helper by email, optionally with a helper role
create or replace function public.add_event_member_by_email(
  p_event_id uuid, p_email text,
  p_role public.member_role default 'helper', p_helper_role_id uuid default null
)
returns public.event_members language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  m      public.event_members;
begin
  if not public.is_event_organiser(p_event_id) then raise exception 'Only organisers can add team members'; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'No account found for %', p_email; end if;
  if p_helper_role_id is not null and not exists (
    select 1 from public.helper_roles where id = p_helper_role_id and event_id = p_event_id
  ) then raise exception 'That role does not belong to this event'; end if;

  insert into public.event_members (event_id, user_id, member_role, helper_role_id)
  values (p_event_id, v_user, p_role, p_helper_role_id)
  on conflict (event_id, user_id) do update
    set member_role = excluded.member_role, helper_role_id = excluded.helper_role_id
  returning * into m;
  return m;
end $$;

-- Weather: one-click switch to the backup venue (or back) + automatic announcement
create or replace function public.switch_event_venue(
  p_event_id uuid, p_use_backup boolean default true, p_message text default null
)
returns public.announcements language plpgsql security definer set search_path = '' as $$
declare
  e public.events;
  v public.venues;
  a public.announcements;
begin
  if not public.is_event_organiser(p_event_id) then raise exception 'Only organisers can switch venues'; end if;

  select * into e from public.events where id = p_event_id for update;
  if p_use_backup and e.backup_venue_id is null then raise exception 'No backup venue set for this event'; end if;
  if e.using_backup = p_use_backup then raise exception 'The event is already at that venue'; end if;

  update public.events set using_backup = p_use_backup where id = p_event_id;

  select * into v from public.venues
  where id = case when p_use_backup then e.backup_venue_id else e.venue_id end;
  if not found then raise exception 'That venue no longer exists'; end if;

  insert into public.announcements (event_id, author_id, title, body, audience, is_automatic)
  values (
    p_event_id, auth.uid(),
    'Venue change: ' || v.name,
    coalesce(p_message,
      case when p_use_backup
        then 'Because of the weather forecast, this event has moved to '
        else 'This event is back at its original venue, ' end
      || v.name || coalesce(' (' || v.address || ')', '') || '.'),
    'everyone', true
  )
  returning * into a;
  return a;
end $$;

-- Check-in: participant scans the event's QR (shown at the venue)
create or replace function public.self_check_in(
  p_event_id uuid, p_secret text,
  p_device_id text default null, p_lat double precision default null, p_lng double precision default null
)
returns public.check_ins language plpgsql security definer set search_path = '' as $$
declare
  r public.registrations;
  c public.check_ins;
begin
  if not exists (select 1 from public.event_secrets where event_id = p_event_id and checkin_secret = p_secret) then
    raise exception 'Invalid or expired check-in code';
  end if;

  select * into r from public.registrations
  where event_id = p_event_id and user_id = auth.uid() and status = 'confirmed';
  if not found then raise exception 'You do not have a confirmed registration for this event'; end if;

  insert into public.check_ins (event_id, registration_id, user_id, method, device_id, latitude, longitude)
  values (p_event_id, r.id, r.user_id, 'scan_in_qr', p_device_id, p_lat, p_lng)
  on conflict (registration_id) do nothing
  returning * into c;

  if not found then select * into c from public.check_ins where registration_id = r.id; end if;
  return c;
end $$;

-- Check-in: organiser/helper scans a personal QR, a barcode, or checks in manually.
-- p_code accepts the qr_token, the ticket_code or the registration id.
-- If the person is already checked in, the existing row is returned unchanged.
create or replace function public.staff_check_in(
  p_event_id uuid, p_code text, p_method public.check_in_method default 'personal_qr'
)
returns public.check_ins language plpgsql security definer set search_path = '' as $$
declare
  r public.registrations;
  c public.check_ins;
begin
  if not public.is_event_staff(p_event_id) then raise exception 'Only organisers and helpers can check people in'; end if;
  if p_method not in ('personal_qr', 'barcode', 'manual') then raise exception 'Use import_attendance or self_check_in for that method'; end if;

  -- each branch can use its own unique index
  select * into r from public.registrations
  where event_id = p_event_id and (qr_token = p_code or ticket_code = upper(p_code));
  if not found and p_code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into r from public.registrations
    where event_id = p_event_id and id = p_code::uuid;
  end if;
  if not found then raise exception 'Ticket not found for this event'; end if;
  if r.status <> 'confirmed' then raise exception 'This registration is %', r.status; end if;

  insert into public.check_ins (event_id, registration_id, user_id, method, checked_in_by)
  values (p_event_id, r.id, r.user_id, p_method, auth.uid())
  on conflict (registration_id) do nothing
  returning * into c;

  if not found then select * into c from public.check_ins where registration_id = r.id; end if;
  return c;
end $$;

-- Organiser/helper: rotate the scan-in QR secret (e.g. every few minutes on a screen)
create or replace function public.rotate_checkin_secret(p_event_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_secret text;
begin
  if not public.is_event_staff(p_event_id) then raise exception 'Not allowed'; end if;
  update public.event_secrets
    set checkin_secret = replace(gen_random_uuid()::text, '-', ''), rotated_at = now()
  where event_id = p_event_id
  returning checkin_secret into v_secret;
  return v_secret;
end $$;

-- Attendance export (turn the rows into CSV on the client). Organisers only: it
-- contains every participant's email address.
create or replace function public.export_attendance(p_event_id uuid)
returns table (
  registration_id uuid, display_name text, email text, ticket_code text,
  status public.registration_status, checked_in_at timestamptz, method public.check_in_method,
  fraud_flag boolean, fraud_reasons text[]
)
language sql stable security definer set search_path = '' as $$
  select r.id, p.display_name, u.email::text, r.ticket_code, r.status,
         c.checked_in_at, c.method, coalesce(c.fraud_flag, false), coalesce(c.fraud_reasons, '{}')
  from public.registrations r
  join public.profiles p on p.id = r.user_id
  join auth.users u      on u.id = r.user_id
  left join public.check_ins c on c.registration_id = r.id
  where r.event_id = p_event_id and public.is_event_organiser(p_event_id)
  order by p.display_name;
$$;

-- Attendance import from parsed CSV rows.
-- p_rows: [{ "email": "...", "ticket_code": "...", "checked_in_at": "optional ISO time" }, ...]
create or replace function public.import_attendance(p_event_id uuid, p_rows jsonb)
returns table (matched int, unmatched jsonb)
language plpgsql security definer set search_path = '' as $$
declare
  v_row       jsonb;
  v_reg       uuid;
  v_user      uuid;
  v_matched   int   := 0;
  v_unmatched jsonb := '[]'::jsonb;
begin
  if not public.is_event_staff(p_event_id) then raise exception 'Not allowed'; end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_reg := null;
    v_user := null;
    select r.id, r.user_id into v_reg, v_user
    from public.registrations r
    join auth.users u on u.id = r.user_id
    where r.event_id = p_event_id and r.status = 'confirmed'
      and (r.ticket_code = upper(v_row ->> 'ticket_code') or lower(u.email) = lower(trim(v_row ->> 'email')))
    limit 1;

    if v_reg is null then
      v_unmatched := v_unmatched || jsonb_build_array(v_row);
      continue;
    end if;

    insert into public.check_ins (event_id, registration_id, user_id, method, checked_in_by, checked_in_at)
    values (p_event_id, v_reg, v_user, 'csv_import', auth.uid(),
            coalesce(nullif(v_row ->> 'checked_in_at', '')::timestamptz, now()))
    on conflict (registration_id) do nothing;
    v_matched := v_matched + 1;
  end loop;

  return query select v_matched, v_unmatched;
end $$;

-- Internal functions must not be callable from the API
revoke execute on function public._promote_waitlist(uuid)     from public, anon, authenticated;
revoke execute on function public._registration_scores(uuid)  from public, anon, authenticated;
revoke execute on function public.expire_offers()             from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------
alter table public.profiles              enable row level security;
alter table public.interests             enable row level security;
alter table public.profile_interests     enable row level security;
alter table public.organiser_members     enable row level security;
alter table public.venues                enable row level security;
alter table public.events                enable row level security;
alter table public.event_secrets         enable row level security;
alter table public.event_interests       enable row level security;
alter table public.helper_roles          enable row level security;
alter table public.event_members         enable row level security;
alter table public.event_questions       enable row level security;
alter table public.registrations         enable row level security;
alter table public.registration_answers  enable row level security;
alter table public.check_ins             enable row level security;
alter table public.tasks                 enable row level security;
alter table public.budget_items          enable row level security;
alter table public.announcements         enable row level security;
alter table public.documents             enable row level security;
alter table public.weather_checks        enable row level security;
alter table public.floor_plans           enable row level security;
alter table public.floor_plan_assets     enable row level security;
alter table public.helper_placements     enable row level security;
alter table public.programme_items       enable row level security;
alter table public.storage_cleanup_queue enable row level security;   -- no policies: service role only

-- Column-level limits on top of RLS: through the API, organisers may change only a
-- registration's status, and staff may change only a check-in's fraud_reviewed flag.
revoke update on public.registrations from anon, authenticated;
grant  update (status) on public.registrations to authenticated;
revoke update on public.check_ins from anon, authenticated;
grant  update (fraud_reviewed) on public.check_ins to authenticated;

-- Profiles & interests
create policy "Profiles are visible to signed-in users" on public.profiles
  for select to authenticated using (true);
create policy "Users update their own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "Interests are public" on public.interests
  for select to anon, authenticated using (true);

create policy "Users read their own interests" on public.profile_interests
  for select to authenticated using (profile_id = (select auth.uid()));
create policy "Users add their own interests" on public.profile_interests
  for insert to authenticated with check (profile_id = (select auth.uid()));
create policy "Users remove their own interests" on public.profile_interests
  for delete to authenticated using (profile_id = (select auth.uid()));

create policy "Organisers see their members; users see their memberships" on public.organiser_members
  for select to authenticated using (organiser_id = (select auth.uid()) or user_id = (select auth.uid()));
create policy "Organisers add members" on public.organiser_members
  for insert to authenticated with check (organiser_id = (select auth.uid()));
create policy "Organisers remove members" on public.organiser_members
  for delete to authenticated using (organiser_id = (select auth.uid()));

-- Venues
create policy "Venues are public" on public.venues
  for select to anon, authenticated using (true);
create policy "Signed-in users add venues" on public.venues
  for insert to authenticated with check (created_by = (select auth.uid()));
create policy "Creators update their venues" on public.venues
  for update to authenticated using (created_by = (select auth.uid()));

-- Events
-- organiser_id check lets insert(...).select() return a new draft: the organiser's
-- event_members row is only added by the AFTER INSERT trigger.
create policy "Published events are public; drafts visible to the team" on public.events
  for select to anon, authenticated using (
    status <> 'draft' or organiser_id = (select auth.uid()) or public.is_event_staff(id)
  );
create policy "Signed-in users create events" on public.events
  for insert to authenticated with check (organiser_id = (select auth.uid()));
create policy "Organisers update events" on public.events
  for update to authenticated using (public.is_event_organiser(id));
create policy "Organisers delete events" on public.events
  for delete to authenticated using (public.is_event_organiser(id));

create policy "Team reads check-in secret" on public.event_secrets
  for select to authenticated using (public.is_event_staff(event_id));

create policy "Event interests follow event visibility" on public.event_interests
  for select to anon, authenticated using (public.can_view_event(event_id));
create policy "Organisers manage event interests" on public.event_interests
  for all to authenticated using (public.is_event_organiser(event_id)) with check (public.is_event_organiser(event_id));

-- Team
create policy "Team sees helper roles" on public.helper_roles
  for select to authenticated using (public.is_event_staff(event_id));
create policy "Organisers manage helper roles" on public.helper_roles
  for all to authenticated using (public.is_event_organiser(event_id)) with check (public.is_event_organiser(event_id));

create policy "Team sees team; users see their own membership" on public.event_members
  for select to authenticated using (user_id = (select auth.uid()) or public.is_event_staff(event_id));
create policy "Organisers manage team" on public.event_members
  for all to authenticated using (public.is_event_organiser(event_id)) with check (public.is_event_organiser(event_id));

-- Registration
create policy "Questions follow event visibility" on public.event_questions
  for select to anon, authenticated using (public.can_view_event(event_id));
create policy "Organisers manage questions" on public.event_questions
  for all to authenticated using (public.is_event_organiser(event_id)) with check (public.is_event_organiser(event_id));

-- Participants register/cancel/answer offers via RPCs (no direct writes).
create policy "Users see their registrations; team sees all for the event" on public.registrations
  for select to authenticated using (user_id = (select auth.uid()) or public.is_event_staff(event_id));
create policy "Organisers change registration status" on public.registrations
  for update to authenticated using (public.is_event_organiser(event_id)) with check (public.is_event_organiser(event_id));

create policy "Users see their answers; organisers see all" on public.registration_answers
  for select to authenticated using (
    exists (
      select 1 from public.registrations r
      where r.id = registration_id
        and (r.user_id = (select auth.uid()) or public.is_event_organiser(r.event_id))
    )
  );

-- Check-ins are created only through the check-in RPCs.
create policy "Users see their check-in; team sees all" on public.check_ins
  for select to authenticated using (user_id = (select auth.uid()) or public.is_event_staff(event_id));
create policy "Team reviews fraud flags" on public.check_ins
  for update to authenticated using (public.is_event_staff(event_id)) with check (public.is_event_staff(event_id));
create policy "Team undoes check-ins" on public.check_ins
  for delete to authenticated using (public.is_event_staff(event_id));

-- Task board: organisers see everything; helpers see tasks for their role, unassigned team tasks, or their own
create policy "Team sees relevant tasks" on public.tasks
  for select to authenticated using (
    public.is_event_organiser(event_id)
    or (public.is_event_staff(event_id) and (
         assignee_id = (select auth.uid())
         or helper_role_id = public.my_helper_role(event_id)
         or (helper_role_id is null and assignee_id is null)))
  );
create policy "Organisers create tasks" on public.tasks
  for insert to authenticated with check (public.is_event_organiser(event_id));
create policy "Organisers and responsible helpers update tasks" on public.tasks
  for update to authenticated using (
    public.is_event_organiser(event_id)
    or (public.is_event_staff(event_id) and (
         assignee_id = (select auth.uid()) or helper_role_id = public.my_helper_role(event_id)))
  );
create policy "Organisers delete tasks" on public.tasks
  for delete to authenticated using (public.is_event_organiser(event_id));

-- Budget: organisers only
create policy "Organisers manage budget" on public.budget_items
  for all to authenticated using (public.is_event_organiser(event_id)) with check (public.is_event_organiser(event_id));

-- Announcements
create policy "Team sees all; participants see public announcements" on public.announcements
  for select to authenticated using (
    public.is_event_staff(event_id)
    or (audience in ('everyone', 'participants') and public.is_event_participant(event_id))
  );
create policy "Organisers post announcements" on public.announcements
  for insert to authenticated with check (public.is_event_organiser(event_id) and author_id = (select auth.uid()));
create policy "Organisers edit announcements" on public.announcements
  for update to authenticated using (public.is_event_organiser(event_id));
create policy "Organisers delete announcements" on public.announcements
  for delete to authenticated using (public.is_event_organiser(event_id));

-- Role-tagged documents: never visible to participants
create policy "Helpers see documents for their role" on public.documents
  for select to authenticated using (
    public.is_event_organiser(event_id)
    or (public.is_event_staff(event_id) and (helper_role_id is null or helper_role_id = public.my_helper_role(event_id)))
  );
create policy "Organisers manage documents" on public.documents
  for all to authenticated using (public.is_event_organiser(event_id)) with check (public.is_event_organiser(event_id));

-- Weather log
create policy "Team sees weather checks" on public.weather_checks
  for select to authenticated using (public.is_event_staff(event_id));
create policy "Organisers record weather checks" on public.weather_checks
  for insert to authenticated with check (public.is_event_organiser(event_id));

-- Floor plans: editable by organisers, read-only for helpers. Participants never read
-- this table (it holds the editor layout); they see only the public finished image below.
create policy "Team reads floor plans" on public.floor_plans
  for select to authenticated using (public.is_event_staff(event_id));
create policy "Organisers edit floor plans" on public.floor_plans
  for all to authenticated using (public.is_event_organiser(event_id)) with check (public.is_event_organiser(event_id));

-- Floor-plan images (R2 keys): team sees all; everyone else only a finished image the
-- organiser has made public, on an event they can view. Only organisers add/change/remove.
create policy "Team sees all images; others see public finished image" on public.floor_plan_assets
  for select to anon, authenticated using (
    public.is_event_staff(event_id)
    or (kind = 'finished' and is_public and public.can_view_event(event_id))
  );
create policy "Organisers manage floor-plan images" on public.floor_plan_assets
  for all to authenticated using (public.is_event_organiser(event_id)) with check (public.is_event_organiser(event_id));

create policy "Team sees helper placements" on public.helper_placements
  for select to authenticated using (public.is_event_staff(event_id));
create policy "Organisers place helpers" on public.helper_placements
  for all to authenticated using (public.is_event_organiser(event_id)) with check (public.is_event_organiser(event_id));

create policy "Programme follows event visibility" on public.programme_items
  for select to anon, authenticated using (public.can_view_event(event_id));
create policy "Organisers edit programme" on public.programme_items
  for all to authenticated using (public.is_event_organiser(event_id)) with check (public.is_event_organiser(event_id));


-- -----------------------------------------------------------------------------
-- 9. STORAGE (Supabase Storage — documents only; images live in Cloudflare R2)
--    event-documents (private): <event_id>/<file>, readable per documents RLS
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('event-documents', 'event-documents', false) on conflict (id) do nothing;

create policy "Helpers download documents they can see" on storage.objects
  for select to authenticated using (
    bucket_id = 'event-documents'
    and exists (select 1 from public.documents d where d.storage_path = name)
  );
create policy "Organisers upload documents" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'event-documents' and public.is_event_organiser(((storage.foldername(name))[1])::uuid)
  );
create policy "Organisers delete documents" on storage.objects
  for delete to authenticated using (
    bucket_id = 'event-documents' and public.is_event_organiser(((storage.foldername(name))[1])::uuid)
  );


-- -----------------------------------------------------------------------------
-- 10. REALTIME (live check-in dashboard, RSVP list, announcements, task board)
-- -----------------------------------------------------------------------------
alter publication supabase_realtime add table
  public.check_ins, public.registrations, public.announcements, public.tasks, public.events;


-- -----------------------------------------------------------------------------
-- 11. SCHEDULED JOBS (pg_cron — or enable "Cron" under Dashboard → Integrations first)
-- -----------------------------------------------------------------------------
create extension if not exists pg_cron;

select cron.schedule('expire-waitlist-offers', '*/5 * * * *', 'select public.expire_offers()');


-- -----------------------------------------------------------------------------
-- 12. SEED DATA
-- -----------------------------------------------------------------------------
insert into public.interests (slug, name) values
  ('tech', 'Technology'), ('music', 'Music'), ('sports', 'Sports'), ('arts', 'Arts & Culture'),
  ('food', 'Food & Drink'), ('volunteering', 'Volunteering'), ('career', 'Career & Networking'),
  ('outdoors', 'Outdoors'), ('gaming', 'Gaming'), ('wellness', 'Health & Wellness')
on conflict (slug) do nothing;
