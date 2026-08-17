/**
 * Competitive matchups — who is playing whom.
 *
 * Distinct from the 4-balls (`four-balls.ts`), which say who physically walks
 * together. A round is divided into *sections* by hole range: Day 4 is one
 * section over 18 holes, Day 3 is three six-hole sections. Each section holds
 * its own matches, and each section can be re-paired without touching the
 * others or the 4-balls.
 *
 * Pure functions only.
 */

import {
  FORMAT_LABELS,
  PLAYERS_PER_SIDE,
  type Match,
  type MatchSide,
  type Player,
  type Team,
} from '@/lib/types';

/** One hole range within a round, with the matches played over it. */
export interface MatchupSection {
  /** Stable key for the range, e.g. "1-6". */
  key: string;
  startHole: number;
  endHole: number;
  /** The format played here. Sections are grouped by range, so this is the
   * format of the first match; a mixed range is flagged by `mixedFormats`. */
  format: Match['format'];
  formatLabel: string;
  mixedFormats: boolean;
  matches: Match[];
  /** "Holes 1–6" or "All 18 holes". */
  label: string;
}

/** The editable state of one side of one match. */
export interface DraftSide {
  id: string;
  matchId: string;
  teamId: string;
  playerIds: string[];
}

export interface MatchupIssue {
  level: 'error' | 'warning';
  message: string;
}

export interface MatchupCheck {
  issues: MatchupIssue[];
  ok: boolean;
}

/**
 * Split a round's matches into hole-range sections.
 *
 * Day 3 comes out as three sections; a normal day as one. Nothing here knows
 * which day it is — it reads the hole ranges the matches actually carry.
 */
export function sectionsForRound(matches: Match[], holeCount = 18): MatchupSection[] {
  const byRange = new Map<string, Match[]>();
  for (const match of matches) {
    const key = `${match.startHole}-${match.endHole}`;
    byRange.set(key, [...(byRange.get(key) ?? []), match]);
  }

  return [...byRange.entries()]
    .map(([key, group]) => {
      const ordered = [...group].sort((a, b) => a.sortOrder - b.sortOrder);
      const first = ordered[0];
      const formats = new Set(ordered.map((m) => m.format));
      const isWholeRound = first.startHole === 1 && first.endHole === holeCount;
      return {
        key,
        startHole: first.startHole,
        endHole: first.endHole,
        format: first.format,
        formatLabel: FORMAT_LABELS[first.format],
        mixedFormats: formats.size > 1,
        matches: ordered,
        label: isWholeRound
          ? `All ${holeCount} holes`
          : `Holes ${first.startHole}–${first.endHole}`,
      };
    })
    .sort((a, b) => a.startHole - b.startHole);
}

/**
 * Check one section's matchups.
 *
 * The rules are per section, because a player quite legitimately appears in
 * every section of Day 3 — once each.
 */
export function checkMatchups(
  section: MatchupSection,
  sides: DraftSide[],
  roster: Player[],
  teams: Team[],
): MatchupCheck {
  const issues: MatchupIssue[] = [];
  const playerById = new Map(roster.map((p) => [p.id, p]));
  const wanted = PLAYERS_PER_SIDE[section.format];

  // --- Nobody playing twice in the same section ----------------------------
  const seen = new Map<string, number>();
  for (const side of sides) {
    for (const id of side.playerIds) seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  const doubled = [...seen.entries()]
    .filter(([, n]) => n > 1)
    .map(([id]) => playerById.get(id)?.name ?? 'Someone');
  if (doubled.length > 0) {
    issues.push({
      level: 'error',
      message: `${formatList(doubled)} ${
        doubled.length === 1 ? 'is' : 'are'
      } in two matches over these holes.`,
    });
  }

  // --- Side sizes -----------------------------------------------------------
  for (const match of section.matches) {
    const matchSides = sides.filter((s) => s.matchId === match.id);
    for (const side of matchSides) {
      if (side.playerIds.length !== wanted) {
        const team = teams.find((t) => t.id === side.teamId);
        issues.push({
          level: 'error',
          message: `${match.name}: ${team?.shortName ?? 'a side'} has ${
            side.playerIds.length
          } player${side.playerIds.length === 1 ? '' : 's'}, but ${
            section.formatLabel
          } is ${wanted} a side.`,
        });
      }
    }
  }

  // --- Everyone left out ----------------------------------------------------
  const missing = roster.filter((p) => !seen.has(p.id));
  if (missing.length > 0) {
    issues.push({
      level: 'warning',
      message: `${formatList(missing.map((p) => p.name))} ${
        missing.length === 1 ? 'is' : 'are'
      } not in a match over these holes.`,
    });
  }

  return { issues, ok: issues.length === 0 };
}

function formatList(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Swap two players wherever they appear in this section.
 *
 * As with the 4-balls, swapping rather than moving means side sizes stay
 * correct at every step: exchanging two players from the same team re-pairs
 * the matches, and the counts cannot drift.
 */
export function swapInSection(sides: DraftSide[], playerA: string, playerB: string): DraftSide[] {
  if (playerA === playerB) return sides;
  return sides.map((side) => ({
    ...side,
    playerIds: side.playerIds.map((id) => {
      if (id === playerA) return playerB;
      if (id === playerB) return playerA;
      return id;
    }),
  }));
}

/** Put a player onto a specific side, taking them off any other side here. */
export function assignToSide(
  sides: DraftSide[],
  playerId: string,
  targetSideId: string,
): DraftSide[] {
  return sides.map((side) => {
    const without = side.playerIds.filter((id) => id !== playerId);
    if (side.id !== targetSideId) return { ...side, playerIds: without };
    return { ...side, playerIds: [...without, playerId] };
  });
}

/** The editable copy of a section's sides. */
export function draftSidesFor(
  section: MatchupSection,
  sidesForMatch: (matchId: string) => MatchSide[],
): DraftSide[] {
  return section.matches.flatMap((match) =>
    [...sidesForMatch(match.id)]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((side) => ({
        id: side.id,
        matchId: match.id,
        teamId: side.teamId,
        playerIds: [...side.playerIds],
      })),
  );
}

/** True when the draft differs from what is saved. */
export function matchupsDirty(draft: DraftSide[], saved: DraftSide[]): boolean {
  const key = (sides: DraftSide[]) =>
    JSON.stringify(
      [...sides]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((s) => [s.id, [...s.playerIds].sort()]),
    );
  return key(draft) !== key(saved);
}
