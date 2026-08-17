/**
 * Generates `supabase/seed.sql` from the TypeScript seed data.
 *
 * Keeping one source of truth means the demo-mode tour you look at in the
 * browser and the rows you insert into Postgres are guaranteed to match. Run
 * it with `npm run seed:sql` after changing anything in `src/lib/seed/`.
 *
 * The output is idempotent: every insert is `on conflict (id) do update`, so
 * re-running it repairs the seeded structure without touching live scores.
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSeedSnapshot } from '../src/lib/seed/tour';

const snapshot = buildSeedSnapshot();

/** Quote a value for SQL. */
function q(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) {
    return `array[${value.map((v) => q(v)).join(', ')}]::uuid[]`;
  }
  if (typeof value === 'object') {
    return `${q(JSON.stringify(value))}::jsonb`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function insert(
  table: string,
  rows: Array<Record<string, unknown>>,
  conflictKey = 'id',
): string {
  if (rows.length === 0) return '';
  const columns = Object.keys(rows[0]);
  const updates = columns
    .filter((c) => c !== conflictKey)
    .map((c) => `  ${c} = excluded.${c}`)
    .join(',\n');

  const values = rows
    .map((row) => `  (${columns.map((column) => q(row[column])).join(', ')})`)
    .join(',\n');

  return [
    `insert into ${table} (${columns.join(', ')}) values`,
    values,
    `on conflict (${conflictKey}) do update set`,
    updates,
    ';',
    '',
  ].join('\n');
}

const parts: string[] = [
  '-- ===========================================================================',
  '-- Pars & Pirates Tour — seed data',
  '-- ===========================================================================',
  '-- GENERATED FILE — do not edit by hand.',
  '-- Regenerate with: npm run seed:sql',
  '-- Source of truth: src/lib/seed/tour.ts and src/lib/seed/courses.ts',
  '--',
  '-- Run this AFTER supabase/migrations/0001_init.sql and 0002_course_verification.sql.',
  '-- Safe to re-run: it updates the seeded rows in place and never touches',
  '-- the scores table, so you will not lose live scoring by re-seeding.',
  '-- ===========================================================================',
  '',
  'begin;',
  '',
  '-- Captain references are set after players exist.',
  'set constraints all deferred;',
  '',
];

// The tour row is written without winning_team_id so a re-seed never
// resets a finished tour's winner.
parts.push(
  insert('tours', [
    {
      id: snapshot.tour.id,
      name: snapshot.tour.name,
      year: snapshot.tour.year,
      start_date: snapshot.tour.startDate,
      end_date: snapshot.tour.endDate,
      location: snapshot.tour.location,
      status: snapshot.tour.status,
      trophy_name: snapshot.tour.trophyName,
      settings: snapshot.tour.settings,
    },
  ]),
);

parts.push(
  insert(
    'teams',
    snapshot.teams.map((team) => ({
      id: team.id,
      tour_id: team.tourId,
      name: team.name,
      short_name: team.shortName,
      colour: team.colour,
      accent: team.accent,
      crest: team.crest,
      captain_player_id: team.captainPlayerId,
      sort_order: team.sortOrder,
    })),
  ),
);

parts.push(
  insert(
    'players',
    snapshot.players.map((player) => ({
      id: player.id,
      tour_id: player.tourId,
      team_id: player.teamId,
      name: player.name,
      nickname: player.nickname,
      initials: player.initials,
      is_captain: player.isCaptain,
      hna_id: player.hnaId,
      handicap_index: player.handicapIndex,
      handicap_source: player.handicapSource,
      handicap_updated_at: player.handicapUpdatedAt,
      photo_url: player.photoUrl,
      sort_order: player.sortOrder,
    })),
  ),
);

parts.push(
  insert(
    'courses',
    snapshot.courses.map((course) => ({
      id: course.id,
      tour_id: course.tourId,
      name: course.name,
      location: course.location,
      source_url: course.sourceUrl,
      notes: course.notes,
      data_verified: course.dataVerified,
      verified_at: course.verifiedAt,
      verified_by: course.verifiedBy,
      source_notes: course.sourceNotes,
    })),
  ),
);

parts.push(
  insert(
    'tees',
    snapshot.tees.map((tee) => ({
      id: tee.id,
      course_id: tee.courseId,
      name: tee.name,
      colour: tee.colour,
      course_rating: tee.courseRating,
      slope_rating: tee.slopeRating,
      par: tee.par,
      yardage: tee.yardage,
      distance_unit: tee.distanceUnit,
    })),
  ),
);

parts.push(
  insert(
    'holes',
    snapshot.holes.map((hole) => ({
      id: hole.id,
      course_id: hole.courseId,
      hole_no: hole.holeNo,
      par: hole.par,
      stroke_index: hole.strokeIndex,
      yardages: hole.yardages,
    })),
  ),
);

parts.push(
  insert(
    'rounds',
    snapshot.rounds.map((round) => ({
      id: round.id,
      tour_id: round.tourId,
      day_no: round.dayNo,
      name: round.name,
      date: round.date,
      course_id: round.courseId,
      tee_id: round.teeId,
      format_label: round.formatLabel,
      tee_time: round.teeTime,
      status: round.status,
      notes: round.notes,
      sort_order: round.sortOrder,
    })),
  ),
);

parts.push(
  insert(
    'matches',
    snapshot.matches.map((match) => ({
      id: match.id,
      round_id: match.roundId,
      name: match.name,
      format: match.format,
      start_hole: match.startHole,
      end_hole: match.endHole,
      points_value: match.pointsValue,
      status: match.status,
      sort_order: match.sortOrder,
    })),
  ),
);

parts.push(
  insert(
    'match_sides',
    snapshot.sides.map((side) => ({
      id: side.id,
      match_id: side.matchId,
      team_id: side.teamId,
      player_ids: side.playerIds,
      handicap_override: side.handicapOverride,
      sort_order: side.sortOrder,
    })),
  ),
);

parts.push(
  insert(
    'itinerary_items',
    snapshot.itinerary.map((item) => ({
      id: item.id,
      tour_id: item.tourId,
      date: item.date,
      start_time: item.startTime,
      end_time: item.endTime,
      title: item.title,
      location: item.location,
      details: item.details,
      category: item.category,
      round_id: item.roundId,
      sort_order: item.sortOrder,
    })),
  ),
);

parts.push('commit;', '');
parts.push(
  '-- Sanity check — should report 2 teams, 8 players, 4 courses, 72 holes,',
  '-- 4 rounds and 15 matches (worth 11 points in total).',
  "select 'teams' as entity, count(*) from teams",
  "union all select 'players', count(*) from players",
  "union all select 'courses', count(*) from courses",
  "union all select 'holes', count(*) from holes",
  "union all select 'rounds', count(*) from rounds",
  "union all select 'matches', count(*) from matches",
  "union all select 'itinerary', count(*) from itinerary_items;",
  '',
);

const output = parts.filter(Boolean).join('\n');
const target = resolve(process.cwd(), 'supabase/seed.sql');
writeFileSync(target, output, 'utf8');

console.log(`Wrote ${target}`);
console.log(
  `  ${snapshot.teams.length} teams, ${snapshot.players.length} players, ` +
    `${snapshot.courses.length} courses, ${snapshot.holes.length} holes, ` +
    `${snapshot.rounds.length} rounds, ${snapshot.matches.length} matches, ` +
    `${snapshot.itinerary.length} itinerary items`,
);
