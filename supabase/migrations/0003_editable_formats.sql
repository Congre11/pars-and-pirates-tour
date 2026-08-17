-- ---------------------------------------------------------------------------
-- 0003 — fully editable round formats
--
-- The format plan for a round (which format is played over which holes, for how
-- many points, off what allowance) was already stored per match rather than
-- hard-coded, but two things were missing:
--
--   1. a match could not carry its own handicap allowance, so changing the
--      Day 3 scramble allowance also changed every other scramble;
--   2. `start_hole`/`end_hole` were pinned to 1..18, which quietly assumed an
--      18-hole card.
--
-- Run this after 0001_init.sql and 0002_course_verification.sql. Every
-- statement is additive and safe to run twice.
-- ---------------------------------------------------------------------------

-- 1. Per-match handicap allowance -------------------------------------------
-- Null means "use the tour default for this format" (tours.settings.allowances),
-- which is what every seeded match does. Shape: {"weights":[0.35,0.15],
-- "rounding":"nearest"}.
alter table matches
  add column if not exists allowance_override jsonb;

comment on column matches.allowance_override is
  'Per-match handicap allowance. Null = use the tour default for this format.';

-- Reject a shape the scoring engine cannot use. A malformed override would
-- silently change everyone''s strokes, so it is refused at the door rather than
-- defaulted to something plausible.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'matches_allowance_override_shape'
  ) then
    alter table matches add constraint matches_allowance_override_shape check (
      allowance_override is null or (
        jsonb_typeof(allowance_override -> 'weights') = 'array'
        and jsonb_array_length(allowance_override -> 'weights') > 0
        and (
          allowance_override -> 'rounding' is null
          or allowance_override ->> 'rounding' in ('nearest', 'floor', 'ceil')
        )
      )
    );
  end if;
end $$;

-- 2. Let a round be any number of holes --------------------------------------
-- The 1..18 ceiling was an assumption about this tour, not a rule of golf. The
-- ordering check (end_hole >= start_hole) is the part that actually matters and
-- is kept.
alter table matches drop constraint if exists matches_start_hole_check;
alter table matches drop constraint if exists matches_end_hole_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'matches_start_hole_positive'
  ) then
    alter table matches add constraint matches_start_hole_positive check (start_hole >= 1);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'matches_end_hole_positive'
  ) then
    alter table matches add constraint matches_end_hole_positive check (end_hole >= 1);
  end if;
end $$;
