-- ---------------------------------------------------------------------------
-- 0007 — manual course handicaps, and organiser match results
--
-- Two things a live round needs when the technology lets you down.
--
--   round_handicaps        one course handicap per player per round, typed in
--   rounds.handicap_source whether a round uses those or the WHS formula
--   match_results.entered_by / entered_at
--                          who declared an official result by hand
--
-- WHY per round rather than per player: Day 1 is finished. It was played off
-- particular numbers and must keep them. A manual figure entered for Day 2
-- cannot reach a round it was not entered against.
--
-- PURELY ADDITIVE. There is no UPDATE, no DELETE and no reseed anywhere in
-- this file. `create table if not exists` and `add column if not exists ...
-- default` leave every existing row byte-for-byte as it is, and every round
-- that exists today keeps `handicap_source = 'calculated'`, which is the
-- behaviour it has now. Running this changes nothing about how the app
-- behaves until someone deliberately switches a round to manual or enters a
-- result.
--
-- `round_handicaps` is NOT added to the realtime publication. Handicaps are
-- set before play, like `players`, and widening the live table list is what
-- caused the earlier load incident.
--
-- Run after 0001-0006.
-- ---------------------------------------------------------------------------

-- --- Manual course handicaps ------------------------------------------------

create table if not exists round_handicaps (
  round_id        uuid not null references rounds(id) on delete cascade,
  player_id       uuid not null references players(id) on delete cascade,
  course_handicap integer not null,
  updated_by      text,
  updated_at      timestamptz not null default now(),
  primary key (round_id, player_id)
);

comment on table round_handicaps is
  'A course handicap typed in by hand for one player in one round. Used only when rounds.handicap_source = ''manual''.';

create index if not exists round_handicaps_round_idx on round_handicaps(round_id);

alter table rounds
  add column if not exists handicap_source text not null default 'calculated';

do $$
begin
  alter table rounds
    add constraint rounds_handicap_source_check
    check (handicap_source in ('calculated', 'manual'));
exception
  when duplicate_object then null;
end $$;

comment on column rounds.handicap_source is
  '''calculated'' = WHS formula off the round''s tee. ''manual'' = round_handicaps only, with no fallback.';

-- --- Organiser match results ------------------------------------------------

alter table match_results
  add column if not exists entered_by text,
  add column if not exists entered_at timestamptz;

comment on column match_results.entered_by is
  'Who declared this result by hand. Every row in this table is an organiser override — nothing in the app writes one automatically.';

-- --- Read access, matching every other table --------------------------------

alter table round_handicaps enable row level security;
drop policy if exists round_handicaps_read on round_handicaps;
create policy round_handicaps_read on round_handicaps
  for select to anon, authenticated using (true);
