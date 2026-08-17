/**
 * The daily 4-balls — who physically walks round together.
 *
 * A 4-ball is not a match. The match structure (who competes against whom, in
 * what format, for how many points) lives in `matches` and is organiser-only.
 * The 4-ball is just the group that tees off together, it changes day to day,
 * and any player on the tour may rearrange it.
 *
 * Pure functions only, so the same rules run in the editor, in the tests, and
 * anywhere else that needs to know whether a grouping makes sense.
 */

import type { Player, RoundGroup, Team } from '@/lib/types';

/** The shape being edited on screen, before it has been saved. */
export interface DraftGroup {
  id?: string;
  name: string;
  playerIds: string[];
  sortOrder: number;
}

export interface FourBallIssue {
  /**
   * `error` — the grouping is wrong and someone will be missing or doubled up.
   * `warning` — playable, but not what this tour normally does (an uneven
   * team split, say). Neither blocks saving; both must be acknowledged.
   */
  level: 'error' | 'warning';
  message: string;
}

export interface FourBallCheck {
  issues: FourBallIssue[];
  /** No issues at all — safe to save without a second thought. */
  ok: boolean;
  /** Players in the round who are not in any group. */
  unassigned: Player[];
}

export const PLAYERS_PER_FOUR_BALL = 4;

/**
 * Check a proposed set of 4-balls.
 *
 * `roster` is everyone expected to play the round — normally all eight.
 */
export function checkFourBalls(
  groups: DraftGroup[],
  roster: Player[],
  teams: Team[],
): FourBallCheck {
  const issues: FourBallIssue[] = [];
  const playerById = new Map(roster.map((p) => [p.id, p]));
  const teamById = new Map(teams.map((t) => [t.id, t]));

  // --- Nobody twice ---------------------------------------------------------
  const seen = new Map<string, number>();
  for (const group of groups) {
    for (const id of group.playerIds) seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  const doubled = [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => playerById.get(id)?.name ?? 'Someone');
  if (doubled.length > 0) {
    issues.push({
      level: 'error',
      message: `${formatList(doubled)} ${doubled.length === 1 ? 'is' : 'are'} in more than one 4-ball.`,
    });
  }

  // --- Nobody left behind ---------------------------------------------------
  const unassigned = roster.filter((p) => !seen.has(p.id));
  if (unassigned.length > 0) {
    issues.push({
      level: 'error',
      message: `${formatList(unassigned.map((p) => p.name))} ${
        unassigned.length === 1 ? 'is' : 'are'
      } not in a 4-ball.`,
    });
  }

  // --- Four to a group ------------------------------------------------------
  for (const group of groups) {
    if (group.playerIds.length !== PLAYERS_PER_FOUR_BALL) {
      issues.push({
        level: 'error',
        message: `${group.name} has ${group.playerIds.length} player${
          group.playerIds.length === 1 ? '' : 's'
        }, not ${PLAYERS_PER_FOUR_BALL}.`,
      });
    }
  }

  // --- Two a side -----------------------------------------------------------
  // A warning rather than an error: an unbalanced group still plays, it is
  // just not how this tour normally sets a day up.
  for (const group of groups) {
    const counts = new Map<string, number>();
    for (const id of group.playerIds) {
      const teamId = playerById.get(id)?.teamId;
      if (teamId) counts.set(teamId, (counts.get(teamId) ?? 0) + 1);
    }
    const wanted = PLAYERS_PER_FOUR_BALL / 2;
    const balanced = teams.length === 2 && teams.every((t) => (counts.get(t.id) ?? 0) === wanted);
    if (!balanced && group.playerIds.length > 0) {
      const split = teams
        .map((t) => `${counts.get(t.id) ?? 0} ${t.shortName}`)
        .join(' / ');
      issues.push({
        level: 'warning',
        message: `${group.name} is ${split}. These 4-balls are normally ${wanted} and ${wanted}.`,
      });
    }
  }

  return { issues, ok: issues.length === 0, unassigned };
}

/** "Alan", "Alan and Ryan", "Alan, Ryan and Dan". */
function formatList(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Swap two players between (or within) groups.
 *
 * Swapping rather than moving is what keeps every group at exactly four
 * without the editor ever passing through an invalid in-between state.
 */
export function swapPlayers(
  groups: DraftGroup[],
  playerA: string,
  playerB: string,
): DraftGroup[] {
  if (playerA === playerB) return groups;
  return groups.map((group) => ({
    ...group,
    playerIds: group.playerIds.map((id) => {
      if (id === playerA) return playerB;
      if (id === playerB) return playerA;
      return id;
    }),
  }));
}

/**
 * Move one player into a group they are not already in.
 *
 * Used when a group is short — swapping needs a partner, this does not.
 */
export function movePlayer(
  groups: DraftGroup[],
  playerId: string,
  targetGroupIndex: number,
): DraftGroup[] {
  return groups.map((group, index) => {
    const without = group.playerIds.filter((id) => id !== playerId);
    if (index !== targetGroupIndex) return { ...group, playerIds: without };
    return { ...group, playerIds: [...without, playerId] };
  });
}

/**
 * The groups to show for a round: what is saved, or a sensible starting point
 * if this round has none yet.
 *
 * Falling back to a generated default means a round added after the tour was
 * seeded still opens with something editable rather than an empty screen.
 */
export function groupsForEditing(
  saved: RoundGroup[],
  roster: Player[],
  teams: Team[],
): DraftGroup[] {
  if (saved.length > 0) {
    return [...saved]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((group) => ({
        id: group.id,
        name: group.name,
        playerIds: [...group.playerIds],
        sortOrder: group.sortOrder,
      }));
  }
  return defaultGroups(roster, teams);
}

/**
 * Deal the roster into balanced 4-balls: two from each team per group, in
 * team order, so the default is always a legal grouping.
 */
export function defaultGroups(roster: Player[], teams: Team[]): DraftGroup[] {
  const groupCount = Math.max(1, Math.ceil(roster.length / PLAYERS_PER_FOUR_BALL));
  const groups: DraftGroup[] = Array.from({ length: groupCount }, (_, i) => ({
    name: `4-Ball ${i + 1}`,
    playerIds: [],
    sortOrder: i,
  }));

  const perTeamPerGroup = PLAYERS_PER_FOUR_BALL / Math.max(1, teams.length);
  for (const team of teams) {
    const members = roster
      .filter((p) => p.teamId === team.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    members.forEach((player, index) => {
      const target = Math.min(groupCount - 1, Math.floor(index / perTeamPerGroup));
      groups[target].playerIds.push(player.id);
    });
  }

  // Anyone whose team is not in `teams` still has to go somewhere.
  const placed = new Set(groups.flatMap((g) => g.playerIds));
  for (const player of roster) {
    if (placed.has(player.id)) continue;
    const smallest = groups.reduce((min, g) => (g.playerIds.length < min.playerIds.length ? g : min));
    smallest.playerIds.push(player.id);
  }

  return groups;
}

/** True when the draft differs from what is saved. */
export function isDirty(draft: DraftGroup[], saved: RoundGroup[]): boolean {
  const key = (groups: Array<{ name: string; playerIds: string[] }>) =>
    JSON.stringify(groups.map((g) => [g.name, [...g.playerIds].sort()]));
  const savedDraft = [...saved].sort((a, b) => a.sortOrder - b.sortOrder);
  return key(draft) !== key(savedDraft);
}
