-- ---------------------------------------------------------------------------
-- 0006 — confirming the 4-balls and the matchups before a round
--
-- One person confirming is enough, so this is a simple stamp rather than an
-- approval workflow: who pressed the button, and when.
--
--   round_groups.confirmed_at / confirmed_by  — the 4-balls for that round
--   matches.pairings_confirmed_at / _by       — who is playing whom
--
-- The flag lives on `matches` rather than `rounds` so Day 3's three six-hole
-- sections can be confirmed independently: a section is just a set of matches
-- sharing a hole range.
--
-- Purely additive. No existing row changes, no data is rewritten, and the app
-- works unchanged if this has not been run — everything simply reads as
-- "not yet confirmed".
--
-- Run after 0001-0005.
-- ---------------------------------------------------------------------------

alter table round_groups
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by text;

comment on column round_groups.confirmed_at is
  'When someone confirmed this round''s 4-balls. Null = still a draft.';

alter table matches
  add column if not exists pairings_confirmed_at timestamptz,
  add column if not exists pairings_confirmed_by text;

comment on column matches.pairings_confirmed_at is
  'When someone confirmed who is playing whom in this match. Null = draft.';
