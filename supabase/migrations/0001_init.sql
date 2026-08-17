-- ===========================================================================
-- Pars & Pirates Tour — database schema
-- ===========================================================================
-- Run this once against a fresh Supabase project (SQL Editor -> New query ->
-- paste -> Run), then run `supabase/seed.sql`.
--
-- Requires PostgreSQL 15 or later (every current Supabase project qualifies).
--
-- Security model
-- --------------
-- Row Level Security is on for every table. The public (anon) key can only
-- READ. Every write goes through this app's server-side API routes using the
-- service_role key, which bypasses RLS, and those routes check the tour PIN
-- cookie first. That means a leaked anon key cannot be used to vandalise
-- scores — the worst it allows is reading a golf scorecard.
-- ===========================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tour
-- ---------------------------------------------------------------------------

create table if not exists tours (
  id              uuid primary key default gen_random_uuid(),
  name            text        not null,
  year            integer     not null,
  start_date      date        not null,
  end_date        date        not null,
  location        text        not null default '',
  status          text        not null default 'upcoming'
                    check (status in ('upcoming', 'live', 'complete')),
  winning_team_id uuid,
  trophy_name     text,
  -- Points values, handicap allowances and rule toggles. Edited in Admin.
  settings        jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists teams (
  id                uuid primary key default gen_random_uuid(),
  tour_id           uuid not null references tours(id) on delete cascade,
  name              text not null,
  short_name        text not null,
  colour            text not null default '#0f7a4d',
  accent            text not null default '#3ddc84',
  crest             text not null default '⛳',
  captain_player_id uuid,
  sort_order        integer not null default 0
);
create index if not exists teams_tour_idx on teams(tour_id);

create table if not exists players (
  id                   uuid primary key default gen_random_uuid(),
  tour_id              uuid not null references tours(id) on delete cascade,
  team_id              uuid not null references teams(id) on delete cascade,
  name                 text not null,
  nickname             text,
  initials             text not null default '',
  is_captain           boolean not null default false,
  -- Handicaps Network Africa membership number. Null until supplied.
  hna_id               text,
  -- WHS Handicap Index. Null means "not known yet"; the app warns and treats
  -- the player as scratch so scoring still works.
  handicap_index       numeric(4,1),
  handicap_source      text not null default 'manual'
                         check (handicap_source in ('manual', 'hna')),
  handicap_updated_at  timestamptz,
  photo_url            text,
  sort_order           integer not null default 0
);
create index if not exists players_tour_idx on players(tour_id);
create index if not exists players_team_idx on players(team_id);

alter table teams
  add constraint teams_captain_fk
  foreign key (captain_player_id) references players(id) on delete set null
  deferrable initially deferred;

-- ---------------------------------------------------------------------------
-- Courses
-- ---------------------------------------------------------------------------

create table if not exists courses (
  id            uuid primary key default gen_random_uuid(),
  tour_id       uuid not null references tours(id) on delete cascade,
  name          text not null,
  location      text,
  -- Optional link to the official published scorecard. Reference only — all
  -- live scoring happens inside this app.
  source_url    text,
  notes         text,
  -- False until a human has checked par / stroke index / rating against the
  -- real card. The app shows a warning while this is false.
  data_verified boolean not null default false
);
create index if not exists courses_tour_idx on courses(tour_id);

create table if not exists tees (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references courses(id) on delete cascade,
  name          text not null,
  colour        text not null default '#f2c53d',
  course_rating numeric(4,1) not null,
  slope_rating  integer not null check (slope_rating between 55 and 155),
  par           integer not null,
  yardage       integer
);
create index if not exists tees_course_idx on tees(course_id);

create table if not exists holes (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references courses(id) on delete cascade,
  hole_no      integer not null check (hole_no between 1 and 18),
  par          integer not null check (par between 3 and 6),
  stroke_index integer not null check (stroke_index between 1 and 18),
  -- Yardage per tee id: { "<tee uuid>": 412, ... }
  yardages     jsonb not null default '{}'::jsonb,
  unique (course_id, hole_no)
);
create index if not exists holes_course_idx on holes(course_id);

-- ---------------------------------------------------------------------------
-- Rounds, matches, sides
-- ---------------------------------------------------------------------------

create table if not exists rounds (
  id           uuid primary key default gen_random_uuid(),
  tour_id      uuid not null references tours(id) on delete cascade,
  day_no       integer not null,
  name         text not null,
  date         date not null,
  -- The link from the itinerary / home "Next Course" card to the live
  -- scorecard. Every round knows exactly which course and tee it is played on.
  course_id    uuid not null references courses(id),
  tee_id       uuid not null references tees(id),
  format_label text not null default '',
  tee_time     text,
  status       text not null default 'upcoming'
                 check (status in ('upcoming', 'live', 'complete')),
  notes        text,
  sort_order   integer not null default 0
);
create index if not exists rounds_tour_idx on rounds(tour_id);

create table if not exists matches (
  id           uuid primary key default gen_random_uuid(),
  round_id     uuid not null references rounds(id) on delete cascade,
  name         text not null,
  format       text not null check (format in (
                 'team_scramble', 'better_ball', 'singles',
                 'two_man_scramble', 'foursomes')),
  -- Six-hole matches (Day 3) simply set start_hole/end_hole to 1-6, 7-12, 13-18.
  start_hole   integer not null default 1 check (start_hole between 1 and 18),
  end_hole     integer not null default 18 check (end_hole between 1 and 18),
  points_value numeric(4,2) not null default 1,
  status       text not null default 'upcoming'
                 check (status in ('upcoming', 'live', 'complete')),
  sort_order   integer not null default 0,
  check (end_hole >= start_hole)
);
create index if not exists matches_round_idx on matches(round_id);

create table if not exists match_sides (
  id                 uuid primary key default gen_random_uuid(),
  match_id           uuid not null references matches(id) on delete cascade,
  team_id            uuid not null references teams(id) on delete cascade,
  player_ids         uuid[] not null default '{}',
  -- Manual override for the side's playing handicap. Null = compute it.
  handicap_override  integer,
  sort_order         integer not null default 0
);
create index if not exists match_sides_match_idx on match_sides(match_id);

-- ---------------------------------------------------------------------------
-- Scores — the hot path
-- ---------------------------------------------------------------------------

create table if not exists scores (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references matches(id) on delete cascade,
  hole_no    integer not null check (hole_no between 1 and 18),
  side_id    uuid not null references match_sides(id) on delete cascade,
  -- Null for shared-ball formats (scramble, alternate shot): one score per side.
  player_id  uuid references players(id) on delete cascade,
  gross      integer check (gross between 1 and 20),
  picked_up  boolean not null default false,
  entered_by text not null default 'unknown',
  updated_at timestamptz not null default now(),
  -- NULLS NOT DISTINCT makes the shared-ball rows (player_id is null) collide
  -- properly, so one ball per side per hole is enforced by the database.
  constraint scores_unique unique nulls not distinct (match_id, hole_no, side_id, player_id)
);
create index if not exists scores_match_idx on scores(match_id);

-- Append-only audit trail. Nothing is ever deleted from here, so a disputed
-- score can always be traced back to who typed what and when.
create table if not exists score_events (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references matches(id) on delete cascade,
  hole_no    integer not null,
  side_id    uuid not null,
  player_id  uuid,
  gross      integer,
  picked_up  boolean not null default false,
  action     text not null check (action in ('set', 'clear')),
  entered_by text not null default 'unknown',
  created_at timestamptz not null default now()
);
create index if not exists score_events_match_idx on score_events(match_id, created_at desc);

create table if not exists match_results (
  match_id        uuid primary key references matches(id) on delete cascade,
  winner_team_id  uuid references teams(id) on delete set null,
  points_home     numeric(4,2) not null default 0,
  points_away     numeric(4,2) not null default 0,
  final_status    text not null default '',
  decided_on_hole integer,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Itinerary, activity feed, fines
-- ---------------------------------------------------------------------------

create table if not exists itinerary_items (
  id         uuid primary key default gen_random_uuid(),
  tour_id    uuid not null references tours(id) on delete cascade,
  date       date not null,
  start_time text,
  end_time   text,
  title      text not null,
  location   text,
  details    text,
  category   text not null default 'social' check (category in (
               'golf', 'travel', 'meal', 'social', 'ceremony',
               'sport', 'rest', 'admin')),
  -- Deep-links a schedule entry to the round it belongs to.
  round_id   uuid references rounds(id) on delete set null,
  sort_order integer not null default 0
);
create index if not exists itinerary_tour_idx on itinerary_items(tour_id, date);

create table if not exists activity (
  id         uuid primary key default gen_random_uuid(),
  tour_id    uuid not null references tours(id) on delete cascade,
  match_id   uuid references matches(id) on delete cascade,
  player_id  uuid references players(id) on delete set null,
  type       text not null default 'note' check (type in (
               'hole_won', 'match_start', 'match_complete',
               'lead_change', 'score_edit', 'note')),
  message    text not null,
  created_at timestamptz not null default now()
);
create index if not exists activity_tour_idx on activity(tour_id, created_at desc);

create table if not exists fines (
  id         uuid primary key default gen_random_uuid(),
  tour_id    uuid not null references tours(id) on delete cascade,
  player_id  uuid not null references players(id) on delete cascade,
  reason     text not null,
  amount     numeric(8,2) not null default 0,
  status     text not null default 'open' check (status in ('open', 'paid', 'waived')),
  created_at timestamptz not null default now()
);
create index if not exists fines_tour_idx on fines(tour_id);

create table if not exists photos (
  id         uuid primary key default gen_random_uuid(),
  tour_id    uuid not null references tours(id) on delete cascade,
  uploader   text,
  image_url  text not null,
  caption    text,
  created_at timestamptz not null default now()
);
create index if not exists photos_tour_idx on photos(tour_id, created_at desc);

-- ===========================================================================
-- set_score — the atomic score write
-- ===========================================================================
-- One round trip that upserts the score AND records the audit event, so the
-- two can never disagree. Called by the app's server API route.
--
-- `p_expected_updated_at` gives optimistic conflict protection: pass the
-- updated_at the device last saw and the write is rejected if someone else
-- changed that hole in the meantime. Pass null to force the write (admin
-- correction).
-- ===========================================================================

create or replace function set_score(
  p_match_id   uuid,
  p_hole_no    integer,
  p_side_id    uuid,
  p_player_id  uuid,
  p_gross      integer,
  p_picked_up  boolean,
  p_entered_by text,
  p_expected_updated_at timestamptz default null
) returns scores
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing scores;
  v_result   scores;
begin
  select * into v_existing
  from scores
  where match_id = p_match_id
    and hole_no = p_hole_no
    and side_id = p_side_id
    and player_id is not distinct from p_player_id;

  if p_expected_updated_at is not null
     and v_existing.id is not null
     and v_existing.updated_at > p_expected_updated_at then
    raise exception 'score_conflict: hole % was updated by % at %',
      p_hole_no, v_existing.entered_by, v_existing.updated_at
      using errcode = '40001';
  end if;

  if p_gross is null and p_picked_up is not true then
    -- Clearing the hole.
    delete from scores
    where match_id = p_match_id
      and hole_no = p_hole_no
      and side_id = p_side_id
      and player_id is not distinct from p_player_id;

    insert into score_events (match_id, hole_no, side_id, player_id, gross, picked_up, action, entered_by)
    values (p_match_id, p_hole_no, p_side_id, p_player_id, null, false, 'clear', p_entered_by);

    return null;
  end if;

  insert into scores (match_id, hole_no, side_id, player_id, gross, picked_up, entered_by, updated_at)
  values (p_match_id, p_hole_no, p_side_id, p_player_id, p_gross, coalesce(p_picked_up, false), p_entered_by, now())
  on conflict (match_id, hole_no, side_id, player_id) do update
    set gross = excluded.gross,
        picked_up = excluded.picked_up,
        entered_by = excluded.entered_by,
        updated_at = now()
  returning * into v_result;

  insert into score_events (match_id, hole_no, side_id, player_id, gross, picked_up, action, entered_by)
  values (p_match_id, p_hole_no, p_side_id, p_player_id, p_gross, coalesce(p_picked_up, false), 'set', p_entered_by);

  return v_result;
end;
$$;

-- ===========================================================================
-- Row Level Security — read for everyone with the anon key, writes server-only
-- ===========================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'tours', 'teams', 'players', 'courses', 'tees', 'holes', 'rounds',
    'matches', 'match_sides', 'scores', 'score_events', 'match_results',
    'itinerary_items', 'activity', 'fines', 'photos'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format(
      'create policy %I on %I for select to anon, authenticated using (true)',
      t || '_read', t);
  end loop;
end $$;

-- ===========================================================================
-- Realtime — this is what makes every phone update within seconds
-- ===========================================================================
-- Adds the live tables to Supabase's realtime publication. `scores` is the one
-- that matters most; the rest keep pairings, handicaps and the itinerary in
-- sync when an admin edits them mid-round.

do $$
declare
  t text;
begin
  foreach t in array array[
    'scores', 'match_results', 'matches', 'match_sides', 'rounds',
    'activity', 'players', 'tours', 'holes', 'tees', 'courses',
    'itinerary_items', 'fines'
  ]
  loop
    -- REPLICA IDENTITY FULL so DELETE events carry enough data to apply.
    execute format('alter table %I replica identity full', t);
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception
      when duplicate_object then null;
      when undefined_object then
        raise notice 'publication supabase_realtime not found — enable Realtime in the Supabase dashboard';
    end;
  end loop;
end $$;
