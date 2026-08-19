/**
 * Turning a round's 4-balls into its competitive pairings.
 *
 * Day 3 plays three formats over one 18 holes — Scramble on 1–6, Shamble on
 * 7–12, Better Ball on 13–18 — with the *same* people in the same buggy the
 * whole way round. Editing three separate sets of pairings for what is really
 * one decision is both tedious and a way to end up with holes 7–12 quietly
 * disagreeing with holes 1–6.
 *
 * So for a round with more than one section, the 4-balls ARE the pairings:
 *
 *   4-ball  =  the four people playing together
 *              inside it, the 2 Pars are one side and the 2 Pirates the other
 *   section =  a hole range with its own format
 *
 * One 4-ball becomes one match in every section, with the same two sides. Move
 * somebody between 4-balls and all three sections follow, and the handicaps
 * recompute from whoever is actually in the pairing — nothing is hard-coded to
 * a particular player.
 *
 * Single-section rounds (Days 1, 2 and 4) are untouched: `derivePairings`
 * returns null for them and the matchups editor works as it always has. That
 * keeps Day 4 correct, where one 4-ball holds two singles matches and a
 * 2-Pars-versus-2-Pirates split would be wrong.
 *
 * Pure functions only.
 */

import { PLAYERS_PER_SIDE, type Match, type MatchSide, type Player, type RoundGroup, type Team } from '@/lib/types';
import type { MatchupSection } from './matchups';

/** One side's new player list. */
export interface DerivedSide {
  sideId: string;
  matchId: string;
  playerIds: string[];
}

export interface DerivedPairings {
  sides: DerivedSide[];
  /** Every match the derivation covers — what a submission is stamped on. */
  matchIds: string[];
  /** The two-player teams, in 4-ball order, for display. */
  pairs: Array<{
    groupId: string | undefined;
    groupName: string;
    teams: Array<{ teamId: string; playerIds: string[] }>;
  }>;
}

/** Why a round cannot have its pairings derived from its 4-balls. */
export type DerivationBlock =
  | 'single-section'
  | 'no-groups'
  | 'match-count'
  | 'side-count'
  | 'team-split'
  | 'side-size';

export interface DerivationResult {
  pairings: DerivedPairings | null;
  /** Set when `pairings` is null. Null means it derived cleanly. */
  blockedBy: DerivationBlock | null;
}

/**
 * Split one 4-ball into its two competing sides.
 *
 * Returns null unless it is exactly two teams with the same number of players
 * each — the "2 Pars and 2 Pirates" shape every 4-ball on this tour has.
 */
function splitByTeam(
  group: RoundGroup,
  playerById: Map<string, Player>,
  teams: Team[],
): Array<{ teamId: string; playerIds: string[] }> | null {
  const byTeam = new Map<string, string[]>();
  for (const id of group.playerIds) {
    const player = playerById.get(id);
    if (!player) return null;
    byTeam.set(player.teamId, [...(byTeam.get(player.teamId) ?? []), id]);
  }
  if (byTeam.size !== 2) return null;

  const sizes = [...byTeam.values()].map((ids) => ids.length);
  if (sizes[0] !== sizes[1]) return null;

  // Report in the tour's own team order so side 0 is always the same team.
  const ordered = teams
    .filter((t) => byTeam.has(t.id))
    .map((t) => ({ teamId: t.id, playerIds: byTeam.get(t.id)! }));
  return ordered.length === 2 ? ordered : null;
}

/**
 * Derive every section's pairings from the round's 4-balls.
 *
 * Deliberately conservative: any shape it does not recognise returns null with
 * a reason rather than guessing. A round whose sections have drifted out of
 * step — someone added a match to holes 7–12 only — falls back to the
 * per-section editor rather than writing a mapping that does not hold.
 */
export function derivePairings(
  sections: MatchupSection[],
  groups: RoundGroup[],
  players: Player[],
  teams: Team[],
  sidesForMatch: (matchId: string) => MatchSide[],
): DerivationResult {
  if (sections.length < 2) return { pairings: null, blockedBy: 'single-section' };
  if (groups.length === 0) return { pairings: null, blockedBy: 'no-groups' };

  // Every section must hold exactly one match per 4-ball, or there is no
  // one-to-one mapping to make.
  if (sections.some((s) => s.matches.length !== groups.length)) {
    return { pairings: null, blockedBy: 'match-count' };
  }

  const playerById = new Map(players.map((p) => [p.id, p]));
  const ordered = [...groups].sort((a, b) => a.sortOrder - b.sortOrder);

  const splits = ordered.map((g) => splitByTeam(g, playerById, teams));
  if (splits.some((s) => s === null)) return { pairings: null, blockedBy: 'team-split' };

  const sides: DerivedSide[] = [];
  const matchIds: string[] = [];

  for (const section of sections) {
    const matches = [...section.matches].sort((a, b) => a.sortOrder - b.sortOrder);
    const wanted = PLAYERS_PER_SIDE[section.format];

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const split = splits[i]!;
      const matchSides = [...sidesForMatch(match.id)].sort((a, b) => a.sortOrder - b.sortOrder);

      if (matchSides.length !== 2) return { pairings: null, blockedBy: 'side-count' };
      // A section that wants one player a side (singles) is not a 4-ball split.
      if (split.some((t) => t.playerIds.length !== wanted)) {
        return { pairings: null, blockedBy: 'side-size' };
      }

      for (const side of matchSides) {
        const forTeam = split.find((t) => t.teamId === side.teamId);
        if (!forTeam) return { pairings: null, blockedBy: 'team-split' };
        sides.push({ sideId: side.id, matchId: match.id, playerIds: [...forTeam.playerIds] });
      }
      matchIds.push(match.id);
    }
  }

  return {
    pairings: {
      sides,
      matchIds,
      pairs: ordered.map((g, i) => ({
        groupId: g.id,
        groupName: g.name,
        teams: splits[i]!,
      })),
    },
    blockedBy: null,
  };
}

/**
 * The same derivation from a draft that has not been saved yet.
 *
 * The 4-ball editor needs this so the team handicaps it shows update as people
 * are moved about, before anything is written.
 */
export function derivePairingsFromDraft(
  sections: MatchupSection[],
  draft: Array<{ id?: string; name: string; playerIds: string[]; sortOrder: number }>,
  roundId: string,
  players: Player[],
  teams: Team[],
  sidesForMatch: (matchId: string) => MatchSide[],
): DerivationResult {
  const asGroups: RoundGroup[] = draft.map((g, i) => ({
    id: g.id ?? `draft-${i}`,
    roundId,
    name: g.name,
    playerIds: g.playerIds,
    sortOrder: g.sortOrder ?? i,
    updatedBy: '',
    updatedAt: '',
    confirmedAt: null,
    confirmedBy: null,
  }));
  return derivePairings(sections, asGroups, players, teams, sidesForMatch);
}

/** Why the pairings could not be derived, in words for the screen. */
export function describeBlock(block: DerivationBlock): string {
  switch (block) {
    case 'single-section':
      return 'This round plays one format over all 18 holes, so its matchups are edited on their own.';
    case 'no-groups':
      return 'Set the 4-balls first — the pairings come from them.';
    case 'match-count':
      return 'The hole ranges do not hold the same number of matches as there are 4-balls, so each section is edited separately.';
    case 'side-count':
      return 'A match on this round does not have exactly two sides, so each section is edited separately.';
    case 'side-size':
      return 'A format on this round is not two players a side, so each section is edited separately.';
    case 'team-split':
      return 'Each 4-ball needs an equal split between the two teams — 2 and 2 — before the pairings can follow it.';
  }
}
