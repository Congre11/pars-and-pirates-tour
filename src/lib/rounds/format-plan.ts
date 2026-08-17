/**
 * A round's format plan — which format is played over which holes, by whom,
 * for how many points, off what allowance.
 *
 * Nothing about Day 3 is special. A round is simply a list of matches, each
 * covering a hole range, and the live scorecard walks whichever ranges it
 * finds. This module is what lets an admin rearrange that safely: it works out
 * what the current configuration actually says and, more usefully, what is
 * wrong with it.
 *
 * Pure functions only — no store, no React — so the rules can be unit tested
 * and the admin screen and the scorecard cannot disagree about them.
 */

import {
  FORMAT_LABELS,
  FORMAT_SHORT_LABELS,
  PLAYERS_PER_SIDE,
  allowanceForMatch,
  type HandicapAllowance,
  type Match,
  type MatchSide,
  type Player,
  type TourSettings,
} from '@/lib/types';

export interface PlanIssue {
  /**
   * `error` means the scorecard will misbehave until it is fixed — a hole with
   * two matches on it for the same player, or a range running off the card.
   * `warning` means it is unusual but playable, e.g. holes nobody is matched on.
   */
  level: 'error' | 'warning';
  message: string;
  /** Which matches the issue concerns, for highlighting in the UI. */
  matchIds: string[];
}

export interface PlanSegment {
  match: Match;
  label: string;
  shortLabel: string;
  holeCount: number;
  /** The allowance actually in force: the match's own, or the format default. */
  allowance: HandicapAllowance;
  /** True when this match carries its own allowance rather than the default. */
  hasOwnAllowance: boolean;
}

export interface RoundPlan {
  segments: PlanSegment[];
  /** Total points at stake across the round. */
  pointsTotal: number;
  issues: PlanIssue[];
  /** No errors. Warnings do not block play. */
  ok: boolean;
  /** Holes in 1..holeCount that no match covers. */
  uncoveredHoles: number[];
}

/** Compress [1,2,3,7,8] into "1–3, 7–8" for a readable message. */
export function describeHoleList(holes: number[]): string {
  const sorted = [...new Set(holes)].sort((a, b) => a - b);
  const runs: string[] = [];
  let start: number | null = null;
  let previous: number | null = null;

  for (const hole of sorted) {
    if (start === null || previous === null) {
      start = hole;
    } else if (hole !== previous + 1) {
      runs.push(start === previous ? `${start}` : `${start}–${previous}`);
      start = hole;
    }
    previous = hole;
  }
  if (start !== null && previous !== null) {
    runs.push(start === previous ? `${start}` : `${start}–${previous}`);
  }
  return runs.join(', ');
}

function holesIn(match: Match): number[] {
  const holes: number[] = [];
  for (let hole = match.startHole; hole <= match.endHole; hole += 1) holes.push(hole);
  return holes;
}

/**
 * Read a round's configuration and report on it.
 *
 * `holeCount` is the number of holes on the course, so a 9-hole card reports a
 * match running to hole 18 as an error rather than silently scoring nothing.
 */
export function planRound(
  matches: Match[],
  sidesByMatch: (matchId: string) => MatchSide[],
  options: { holeCount?: number; settings: TourSettings },
): RoundPlan {
  const { holeCount = 18, settings } = options;
  const ordered = [...matches].sort(
    (a, b) => a.startHole - b.startHole || a.sortOrder - b.sortOrder,
  );
  const issues: PlanIssue[] = [];

  const segments: PlanSegment[] = ordered.map((match) => ({
    match,
    label: FORMAT_LABELS[match.format],
    shortLabel: FORMAT_SHORT_LABELS[match.format],
    holeCount: Math.max(0, match.endHole - match.startHole + 1),
    allowance: allowanceForMatch(match, settings),
    hasOwnAllowance: match.allowanceOverride !== null,
  }));

  // --- Per-match sanity ----------------------------------------------------
  for (const match of ordered) {
    if (match.endHole < match.startHole) {
      issues.push({
        level: 'error',
        message: `${match.name} ends on hole ${match.endHole} but starts on hole ${match.startHole}.`,
        matchIds: [match.id],
      });
    }
    if (match.startHole < 1 || match.endHole > holeCount) {
      issues.push({
        level: 'error',
        message: `${match.name} covers holes ${match.startHole}–${match.endHole}, but this course has ${holeCount} holes.`,
        matchIds: [match.id],
      });
    }

    const sides = sidesByMatch(match.id);
    if (sides.length < 2) {
      issues.push({
        level: 'error',
        message: `${match.name} has ${sides.length} side${sides.length === 1 ? '' : 's'}. A match needs two.`,
        matchIds: [match.id],
      });
    }

    const wanted = PLAYERS_PER_SIDE[match.format];
    for (const side of sides) {
      if (side.playerIds.length !== wanted) {
        issues.push({
          level: 'warning',
          message: `${match.name}: a side has ${side.playerIds.length} player${
            side.playerIds.length === 1 ? '' : 's'
          }, but ${FORMAT_LABELS[match.format]} is played ${wanted} a side.`,
          matchIds: [match.id],
        });
      }
    }

    // The same player on both sides of one match cannot be scored at all.
    const seen = new Map<string, number>();
    for (const side of sides) {
      for (const id of side.playerIds) seen.set(id, (seen.get(id) ?? 0) + 1);
    }
    const doubled = [...seen.entries()].filter(([, count]) => count > 1).map(([id]) => id);
    if (doubled.length > 0) {
      issues.push({
        level: 'error',
        message: `${match.name} has the same player on both sides.`,
        matchIds: [match.id],
      });
    }
  }

  // --- Overlaps: the one that actually breaks the live scorecard -----------
  // The scorecard finds "the match covering this hole" for a player. If two
  // matches cover the same hole for the same player, one of them silently
  // never gets scored.
  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length; j += 1) {
      const a = ordered[i];
      const b = ordered[j];
      const overlapStart = Math.max(a.startHole, b.startHole);
      const overlapEnd = Math.min(a.endHole, b.endHole);
      if (overlapStart > overlapEnd) continue;

      const playersA = new Set(sidesByMatch(a.id).flatMap((s) => s.playerIds));
      const shared = sidesByMatch(b.id)
        .flatMap((s) => s.playerIds)
        .filter((id) => playersA.has(id));
      if (shared.length === 0) continue;

      const overlap: number[] = [];
      for (let hole = overlapStart; hole <= overlapEnd; hole += 1) overlap.push(hole);
      issues.push({
        level: 'error',
        message: `${a.name} and ${b.name} both cover hole${
          overlap.length === 1 ? '' : 's'
        } ${describeHoleList(overlap)} with the same player${
          shared.length === 1 ? '' : 's'
        } in both.`,
        matchIds: [a.id, b.id],
      });
    }
  }

  // --- Coverage ------------------------------------------------------------
  const covered = new Set(ordered.flatMap(holesIn));
  const uncoveredHoles: number[] = [];
  for (let hole = 1; hole <= holeCount; hole += 1) {
    if (!covered.has(hole)) uncoveredHoles.push(hole);
  }
  if (uncoveredHoles.length > 0 && ordered.length > 0) {
    issues.push({
      level: 'warning',
      message: `No match covers hole${uncoveredHoles.length === 1 ? '' : 's'} ${describeHoleList(
        uncoveredHoles,
      )}. Nothing will be scored there.`,
      matchIds: [],
    });
  }

  return {
    segments,
    pointsTotal: ordered.reduce((sum, match) => sum + match.pointsValue, 0),
    issues,
    ok: !issues.some((issue) => issue.level === 'error'),
    uncoveredHoles,
  };
}

/**
 * A round's format in one line, derived from the matches themselves.
 *
 * Used to keep the round's free-text label honest — a round configured as
 * singles then scramble then alternate shot should not still read
 * "Better Ball", however it was set up.
 */
export function describeRoundFormat(matches: Match[]): string {
  const ordered = [...matches].sort(
    (a, b) => a.startHole - b.startHole || a.sortOrder - b.sortOrder,
  );
  if (ordered.length === 0) return 'No matches yet';

  // Consecutive matches sharing a format are one phase of the round.
  const phases: Array<{ format: Match['format']; startHole: number; endHole: number }> = [];
  for (const match of ordered) {
    const last = phases[phases.length - 1];
    if (last && last.format === match.format) {
      last.startHole = Math.min(last.startHole, match.startHole);
      last.endHole = Math.max(last.endHole, match.endHole);
    } else {
      phases.push({ format: match.format, startHole: match.startHole, endHole: match.endHole });
    }
  }

  if (phases.length === 1) return FORMAT_LABELS[phases[0].format];
  return phases
    .map((phase) => `H${phase.startHole}–${phase.endHole} ${FORMAT_SHORT_LABELS[phase.format]}`)
    .join(' · ');
}

/**
 * Sensible values for a new match added to a round: it takes the holes left
 * over after the existing matches, or the whole card if there are none.
 */
export function suggestNewMatch(
  matches: Match[],
  options: { holeCount?: number; settings: TourSettings },
): { startHole: number; endHole: number; format: Match['format']; pointsValue: number } {
  const { holeCount = 18, settings } = options;
  const covered = new Set(matches.flatMap(holesIn));
  const free: number[] = [];
  for (let hole = 1; hole <= holeCount; hole += 1) {
    if (!covered.has(hole)) free.push(hole);
  }

  // Use the first unbroken run of free holes, so adding matches one at a time
  // fills the card rather than stacking everything on hole 1.
  let startHole = 1;
  let endHole = holeCount;
  if (free.length > 0) {
    startHole = free[0];
    endHole = free[0];
    for (const hole of free) {
      if (hole === endHole + 1) endHole = hole;
      else if (hole > endHole + 1) break;
    }
  } else if (matches.length > 0) {
    // Card is full: default to matching the last segment's range, which is what
    // adding a second match to the same range (another pairing) needs.
    const last = [...matches].sort((a, b) => b.startHole - a.startHole)[0];
    startHole = last.startHole;
    endHole = last.endHole;
  }

  // Copy the format and points of whichever match already covers these holes,
  // because a second match over the same range is nearly always the same game.
  const neighbour = matches.find((m) => startHole >= m.startHole && startHole <= m.endHole);
  return {
    startHole,
    endHole,
    format: neighbour?.format ?? 'singles',
    pointsValue: neighbour?.pointsValue ?? settings.pointsPerWin,
  };
}

/** Players in a round, in team order — the pool a new match picks from. */
export function playersInRound(
  matches: Match[],
  sidesByMatch: (matchId: string) => MatchSide[],
  allPlayers: Player[],
): Player[] {
  const ids = new Set(matches.flatMap((m) => sidesByMatch(m.id).flatMap((s) => s.playerIds)));
  return allPlayers.filter((p) => ids.has(p.id));
}
