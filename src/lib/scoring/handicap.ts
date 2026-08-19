/**
 * Handicap mathematics.
 *
 * Everything here is a pure function so it can be unit tested without a
 * database, a browser or a golf course.
 */

import type { HandicapAllowance, Hole, MatchFormat, Player, Tee, TourSettings } from '@/lib/types';

function applyRounding(value: number, rounding: HandicapAllowance['rounding']): number {
  switch (rounding) {
    case 'floor':
      return Math.floor(value);
    case 'ceil':
      return Math.ceil(value);
    case 'nearest':
    default:
      // Math.round(-2.5) is -2 in JS; golf rounds half away from zero.
      return Math.sign(value) * Math.round(Math.abs(value));
  }
}

/**
 * World Handicap System course handicap:
 *
 *   Course Handicap = Handicap Index x (Slope / 113) + (Course Rating - Par)
 *
 * Returned unrounded so allowances can be applied before rounding once.
 */
export function courseHandicapRaw(handicapIndex: number, tee: Tee): number {
  return handicapIndex * (tee.slopeRating / 113) + (tee.courseRating - tee.par);
}

export function courseHandicap(handicapIndex: number, tee: Tee): number {
  return applyRounding(courseHandicapRaw(handicapIndex, tee), 'nearest');
}

/**
 * A side's playing handicap.
 *
 * `weights` are applied to the players' course handicaps sorted LOWEST FIRST.
 * A single weight is applied to every player (per-player formats); multiple
 * weights map positionally onto the sorted list (team formats).
 *
 * For per-player formats this returns the sum of one player's allowance, which
 * for singles/better ball is only ever called with a single player anyway —
 * see `playerPlayingHandicaps` for the per-player breakdown.
 */
export function sidePlayingHandicap(
  courseHandicaps: number[],
  allowance: HandicapAllowance,
): number {
  if (courseHandicaps.length === 0) return 0;
  const sorted = [...courseHandicaps].sort((a, b) => a - b);
  const { weights } = allowance;

  if (weights.length === 1) {
    // Per-player allowance: apply the same percentage to everyone and sum.
    // With one player (singles) this is simply that player's allowance.
    const total = sorted.reduce((sum, ch) => sum + ch * weights[0], 0);
    return applyRounding(total, allowance.rounding);
  }

  const total = sorted.reduce((sum, ch, i) => {
    const weight = weights[i] ?? weights[weights.length - 1];
    return sum + ch * weight;
  }, 0);
  return applyRounding(total, allowance.rounding);
}

/**
 * Strokes a handicap of `playingHandicap` receives on a hole of stroke index
 * `strokeIndex` (1 = hardest).
 *
 * Positive handicaps receive strokes from SI 1 upwards, wrapping for handicaps
 * above 18. Plus handicaps (negative) GIVE strokes back, starting at SI 18.
 */
export function strokesOnHole(playingHandicap: number, strokeIndex: number, holeCount = 18): number {
  if (playingHandicap === 0 || !Number.isFinite(playingHandicap)) return 0;

  if (playingHandicap > 0) {
    const base = Math.floor(playingHandicap / holeCount);
    const remainder = playingHandicap - base * holeCount;
    return base + (strokeIndex <= remainder ? 1 : 0);
  }

  const magnitude = -playingHandicap;
  const base = Math.floor(magnitude / holeCount);
  const remainder = magnitude - base * holeCount;
  // Plus players give shots back on the EASIEST holes first.
  const given = base + (strokeIndex >= holeCount + 1 - remainder ? 1 : 0);
  // `-0` would render as "-0" on a scorecard, so normalise it away.
  return given === 0 ? 0 : -given;
}

/**
 * Allocate strokes across exactly the holes being played.
 *
 * A match over six holes still owes the full stroke difference, but it can
 * only pay it over those six. Allocating against the raw 1..18 stroke index
 * silently loses most of it: Day 3's holes 1-6 at PGA Sultan carry stroke
 * indexes 5, 11, 15, 17, 1 and 9, so a side owed 8 strokes would receive
 * strokes only where SI <= 8 — two of the eight.
 *
 * So the holes in play are RANKED by their real stroke index (hardest first)
 * and the strokes are dealt out over that ranking. The eight above become
 * 2, 1, 1, 1, 2, 1: every hole gets one, and the two hardest get a second.
 *
 * Over a full 18 this is identical to the old behaviour, because ranking all
 * eighteen holes by stroke index reproduces the stroke index itself.
 */
export function strokesForHoles(
  playingHandicap: number,
  holes: Hole[],
): Record<number, number> {
  const allocation: Record<number, number> = {};
  if (holes.length === 0) return allocation;

  // Rank 1 = hardest hole of those being played.
  const rankByHole = new Map<number, number>();
  [...holes]
    .sort((a, b) => a.strokeIndex - b.strokeIndex)
    .forEach((hole, index) => rankByHole.set(hole.holeNo, index + 1));

  for (const hole of holes) {
    allocation[hole.holeNo] = strokesOnHole(
      playingHandicap,
      rankByHole.get(hole.holeNo) ?? hole.strokeIndex,
      holes.length,
    );
  }
  return allocation;
}

/** Full 18-hole stroke allocation, keyed by hole number. */
export function strokeAllocation(
  playingHandicap: number,
  holes: Hole[],
): Record<number, number> {
  return strokesForHoles(playingHandicap, holes);
}

export interface SideHandicapInput {
  players: Player[];
  handicapOverride: number | null;
}

export interface SideHandicapResult {
  /** Course handicap per player id, before the format allowance. */
  courseHandicaps: Record<string, number>;
  /** Allowance-adjusted handicap per player id (per-player formats). */
  playerPlayingHandicaps: Record<string, number>;
  /** The side's handicap before the match-play difference is applied. */
  rawPlayingHandicap: number;
  /** What the side actually plays off in this match. */
  playingHandicap: number;
  /** True when a player is missing a handicap index and was treated as 0. */
  hasMissingIndex: boolean;
}

/**
 * Compute both sides' handicaps for a match, including the match-play
 * "difference" adjustment where the lower side plays off scratch.
 */
export function computeMatchHandicaps(
  sides: SideHandicapInput[],
  format: MatchFormat,
  tee: Tee,
  settings: TourSettings,
  /** This match's own allowance, if an admin set one. Null uses the default. */
  allowanceOverride: HandicapAllowance | null = null,
): SideHandicapResult[] {
  const allowance = allowanceOverride ?? settings.allowances[format];

  const raw: SideHandicapResult[] = sides.map((side) => {
    const courseHandicaps: Record<string, number> = {};
    const playerPlayingHandicaps: Record<string, number> = {};
    let hasMissingIndex = false;

    for (const player of side.players) {
      if (player.handicapIndex === null) hasMissingIndex = true;
      const index = player.handicapIndex ?? 0;
      const ch = settings.handicapsEnabled ? courseHandicap(index, tee) : 0;
      courseHandicaps[player.id] = ch;
      playerPlayingHandicaps[player.id] = settings.handicapsEnabled
        ? applyRounding(ch * (allowance.weights[0] ?? 1), allowance.rounding)
        : 0;
    }

    const computed = settings.handicapsEnabled
      ? sidePlayingHandicap(Object.values(courseHandicaps), allowance)
      : 0;

    const rawPlayingHandicap = side.handicapOverride ?? computed;

    return {
      courseHandicaps,
      playerPlayingHandicaps,
      rawPlayingHandicap,
      playingHandicap: rawPlayingHandicap,
      hasMissingIndex,
    };
  });

  if (!settings.handicapsEnabled) return raw;

  if (settings.handicapMode === 'difference') {
    if (isPerPlayerFormat(format)) {
      // Everyone plays off the difference from the lowest player in the match.
      const all = raw.flatMap((side) => Object.values(side.playerPlayingHandicaps));
      const lowest = all.length ? Math.min(...all) : 0;
      for (const side of raw) {
        for (const id of Object.keys(side.playerPlayingHandicaps)) {
          side.playerPlayingHandicaps[id] -= lowest;
        }
        const values = Object.values(side.playerPlayingHandicaps);
        side.playingHandicap = values.length ? Math.min(...values) : 0;
      }
    } else {
      const lowest = Math.min(...raw.map((side) => side.rawPlayingHandicap));
      for (const side of raw) {
        side.playingHandicap = side.rawPlayingHandicap - lowest;
      }
    }
  }

  return raw;
}

/** Formats where each player carries their own strokes. */
export function isPerPlayerFormat(format: MatchFormat): boolean {
  // Formats where each player carries their OWN strokes off their own course
  // handicap. Everything else plays off one combined side handicap.
  //
  // A shamble is the interesting case: each player finishes their own ball, so
  // two scores are recorded, but the pair plays off a single team handicap of
  // floor((CH1 + CH2) / 2). Both balls are therefore netted against the same
  // side strokes — see `computeMatch`.
  return format === 'singles' || format === 'better_ball';
}
