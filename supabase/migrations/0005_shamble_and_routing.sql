-- ---------------------------------------------------------------------------
-- 0005 — the shamble format, and course routing
--
--   1. `shamble` joins the allowed match formats. Both players tee off, the
--      pair takes the better drive, then each plays their own ball in and the
--      lower net counts. Day 3's middle six holes are played this way.
--
--   2. `courses.routing` describes which nines are played and in what order,
--      so the Faldo round can say "Queen's loop (1-9) then Prince's loop
--      (10-18)" rather than just "Faldo Course".
--
-- Run after 0001-0004. Additive and safe to run twice.
-- ---------------------------------------------------------------------------

-- 1. Allow the shamble format -----------------------------------------------
-- The original constraint was created inline and so is named
-- matches_format_check by Postgres. Drop and re-add with the new value.
alter table matches drop constraint if exists matches_format_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'matches_format_allowed'
  ) then
    alter table matches add constraint matches_format_allowed check (format in (
      'team_scramble', 'better_ball', 'singles',
      'two_man_scramble', 'shamble', 'foursomes'
    ));
  end if;
end $$;

-- 2. Remove the superseded Day 3 matches -------------------------------------
-- Day 3 used to be four singles (H1-6) and two alternate shot (H13-18). Those
-- matches are gone from the seed, but `seed.sql` only inserts and updates, so
-- a database seeded earlier would keep them alongside the new ones — Day 3
-- would show fourteen matches and the wrong points total.
--
-- These are the exact ids the old seed generated (`npx tsx scripts/stale-ids.ts`
-- regenerates them). Nothing else is touched: any match you added yourself has
-- a different id and is left alone. match_sides, scores and results cascade.
delete from matches where id in (
  'c72bcb14-7807-47a6-82d3-b7d0988425ce',  -- Singles 1 (H1-6)
  'ca2bcfcd-7707-4613-85d3-bc899784243b',  -- Singles 2 (H1-6)
  'c92bce3a-7607-4480-84d3-baf6968422a8',  -- Singles 3 (H1-6)
  'c42bc65b-7d07-4f85-87d3-bfaf9d842dad',  -- Singles 4 (H1-6)
  'caf7f5fd-8c37-4557-86b3-83a10cb2a79f',  -- Alternate Shot 1 (H13-18)
  'c7f7f144-8d37-46ea-83b3-7ee80db2a932'   -- Alternate Shot 2 (H13-18)
);

-- 3. Course routing ----------------------------------------------------------
alter table courses
  add column if not exists routing text;

comment on column courses.routing is
  'Which nines are played and in what order, e.g. "Queen''s loop (1-9), then Prince''s loop (10-18)".';

-- The two loop names, front first, so the scorecard can label its halves
-- "Out · Queen''s" and "In · Prince''s" rather than parsing the sentence above.
alter table courses
  add column if not exists nine_names text[];
