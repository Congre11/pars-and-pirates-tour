-- ===========================================================================
-- Pars & Pirates Tour — course verification workflow
-- ===========================================================================
-- Run this AFTER 0001_init.sql, then re-run supabase/seed.sql.
--
-- Adds:
--   * an audit trail for course verification (who verified it, when, from what)
--   * a distance unit per tee (Belek cards are often in metres)
--   * storage for an uploaded photo of the official scorecard
--
-- Safe to run on a database that already has scores in it — every statement is
-- additive and idempotent.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Course verification audit
-- ---------------------------------------------------------------------------

alter table courses add column if not exists verified_at  timestamptz;
alter table courses add column if not exists verified_by  text;
-- Free text: "photographed the card at the pro shop, 31 Aug", a URL, etc.
alter table courses add column if not exists source_notes text;

comment on column courses.data_verified is
  'Only ever set true by an explicit "Mark course as verified" action. The scorecard photo reader never sets it.';

-- ---------------------------------------------------------------------------
-- Distance unit per tee
-- ---------------------------------------------------------------------------

alter table tees add column if not exists distance_unit text not null default 'yards';

do $$
begin
  alter table tees add constraint tees_distance_unit_check
    check (distance_unit in ('yards', 'metres'));
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Uploaded scorecard photos
-- ---------------------------------------------------------------------------
-- Kept in its own table rather than a column on `courses` so a multi-megabyte
-- image never rides along with the tour snapshot every phone loads at startup.
-- The image is fetched only when Admin opens the verification screen.

create table if not exists course_scorecards (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references courses(id) on delete cascade,
  -- Data URL. The browser downscales to ~2000px before uploading, which keeps
  -- a typical scorecard photo well under a megabyte.
  image_data  text not null,
  mime_type   text not null,
  uploaded_by text not null default 'unknown',
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists course_scorecards_course_idx
  on course_scorecards(course_id, created_at desc);

-- Pointer to the most recent photo, so the course screen can show it without
-- a second query. Added after the table so the FK resolves.
alter table courses add column if not exists scorecard_image_id uuid;

do $$
begin
  alter table courses add constraint courses_scorecard_image_fk
    foreign key (scorecard_image_id) references course_scorecards(id) on delete set null;
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Scorecard photos are readable by anyone signed in to the tour (same as the
-- rest of the course data); writes go through the server API as usual.

alter table course_scorecards enable row level security;
drop policy if exists course_scorecards_read on course_scorecards;
create policy course_scorecards_read on course_scorecards
  for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
-- `courses` and `tees` are already published by 0001. Verifying a course on one
-- phone therefore clears the "unverified" warning on every other phone live.

alter table course_scorecards replica identity full;
do $$
begin
  alter publication supabase_realtime add table course_scorecards;
exception
  when duplicate_object then null;
  when undefined_object then
    raise notice 'publication supabase_realtime not found — enable Realtime in the Supabase dashboard';
end $$;
