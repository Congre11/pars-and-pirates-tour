-- ---------------------------------------------------------------------------
-- 0004 — daily 4-balls, and the organiser flag
--
-- Two unrelated-looking changes that share one theme: separating *who runs the
-- tour* and *who walks round with whom* from the competitive structure.
--
--   1. players.is_organiser — a label for who runs the tour. Admin access is
--      granted by the ADMIN_PIN and always has been; this column exists so the
--      app can name the organiser without implying captains are the only
--      people entitled to hold that PIN.
--
--   2. round_groups — the physical 4-balls. Editable by any signed-in player,
--      unlike matches, which stay admin-only.
--
-- Run after 0001, 0002 and 0003. Every statement is additive and idempotent.
-- ---------------------------------------------------------------------------

-- 1. Organiser label ---------------------------------------------------------
alter table players
  add column if not exists is_organiser boolean not null default false;

comment on column players.is_organiser is
  'Runs the tour. A label only — admin access is granted by the ADMIN_PIN.';

-- 2. The 4-balls -------------------------------------------------------------
create table if not exists round_groups (
  id          uuid primary key default gen_random_uuid(),
  round_id    uuid not null references rounds(id) on delete cascade,
  name        text not null,
  -- The players walking round together. Order within the group is not
  -- meaningful, so this is a plain array rather than a join table.
  player_ids  uuid[] not null default '{}',
  sort_order  integer not null default 0,
  updated_by  text not null default 'unknown',
  updated_at  timestamptz not null default now()
);

create index if not exists round_groups_round_idx on round_groups(round_id);

alter table round_groups enable row level security;

-- Reads follow the same rule as every other table: the anon key may select.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'round_groups' and policyname = 'round_groups_read'
  ) then
    create policy round_groups_read on round_groups for select using (true);
  end if;
end $$;

-- NOTE ON WRITES.
-- No insert/update policy is created, so the anon key still cannot write —
-- exactly like scores and matches. 4-ball edits go through this app's
-- /api/groups route, which holds the service_role key and requires a signed-in
-- session but NOT an admin one. That is the whole difference between a 4-ball
-- (any player may rearrange it) and a match (organiser only), and it is
-- enforced on the server rather than in the browser.

-- Live updates for everyone on the course.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'round_groups'
  ) then
    alter publication supabase_realtime add table round_groups;
  end if;
end $$;
