import { todayIso } from '@/lib/format';
import type { MatchOutcome } from '@/lib/scoring/engine';
import type { Round, TourSnapshot } from '@/lib/types';

/**
 * Which round the app should be pointing at right now.
 *
 * Priority: a round explicitly marked live, then today's round, then the next
 * one in the future, then the last one played. This is what drives the Home
 * screen's "Next Course" card and the default target of the Score button.
 */
export function currentRound(
  snapshot: TourSnapshot,
  outcomes: Map<string, MatchOutcome>,
): Round | null {
  const rounds = [...snapshot.rounds].sort((a, b) => a.sortOrder - b.sortOrder);
  if (rounds.length === 0) return null;

  const live = rounds.find((r) => r.status === 'live');
  if (live) return live;

  const today = todayIso();
  const todays = rounds.find((r) => r.date === today);
  if (todays) return todays;

  // A round with scores in it but not finished is clearly the one in play.
  const inProgress = rounds.find((round) => {
    const matches = snapshot.matches.filter((m) => m.roundId === round.id);
    return matches.some((m) => {
      const outcome = outcomes.get(m.id);
      return outcome && outcome.holesPlayed > 0 && !outcome.isComplete;
    });
  });
  if (inProgress) return inProgress;

  const upcoming = rounds.find((r) => r.date >= today);
  if (upcoming) return upcoming;

  return rounds[rounds.length - 1];
}

/** Is every match in this round finished? */
export function isRoundComplete(
  roundId: string,
  snapshot: TourSnapshot,
  outcomes: Map<string, MatchOutcome>,
): boolean {
  const matches = snapshot.matches.filter((m) => m.roundId === roundId);
  if (matches.length === 0) return false;
  return matches.every((m) => outcomes.get(m.id)?.isComplete);
}

/**
 * The matches a given player is actually playing in a round — used to jump
 * straight to "your" scorecard rather than making you hunt for it.
 */
export function matchesForPlayer(
  playerId: string | null,
  roundId: string,
  snapshot: TourSnapshot,
): string[] {
  if (!playerId) return [];
  const matchIds = snapshot.matches.filter((m) => m.roundId === roundId).map((m) => m.id);
  return snapshot.sides
    .filter((side) => matchIds.includes(side.matchId) && side.playerIds.includes(playerId))
    .map((side) => side.matchId);
}

/**
 * Build the live activity feed from the scoring engine rather than storing it.
 *
 * Deriving it means the feed can never disagree with the scorecard, and a
 * corrected score silently corrects the feed too.
 */
export interface FeedEntry {
  id: string;
  matchId: string;
  message: string;
  detail: string;
  holeNo: number;
  tone: 'win' | 'complete' | 'neutral';
  teamColour?: string;
}

export function buildFeed(
  snapshot: TourSnapshot,
  outcomes: Map<string, MatchOutcome>,
  limit = 12,
): FeedEntry[] {
  const entries: FeedEntry[] = [];
  const teamById = new Map(snapshot.teams.map((t) => [t.id, t]));
  const sidesByMatch = new Map<string, TourSnapshot['sides']>();
  for (const side of snapshot.sides) {
    const list = sidesByMatch.get(side.matchId) ?? [];
    list.push(side);
    sidesByMatch.set(side.matchId, list);
  }

  for (const match of snapshot.matches) {
    const outcome = outcomes.get(match.id);
    if (!outcome) continue;
    const sides = sidesByMatch.get(match.id) ?? [];
    const nameOf = (sideId: string) => {
      const side = sides.find((s) => s.id === sideId);
      if (!side) return 'A side';
      const team = teamById.get(side.teamId);
      if (side.playerIds.length > 2) return team?.name ?? 'Team';
      return side.playerIds
        .map((id) => snapshot.players.find((p) => p.id === id)?.name.split(' ')[0] ?? '?')
        .join(' & ');
    };
    const colourOf = (sideId: string) =>
      teamById.get(sides.find((s) => s.id === sideId)?.teamId ?? '')?.colour;

    if (outcome.isComplete) {
      entries.push({
        id: `${match.id}:final`,
        matchId: match.id,
        holeNo: outcome.decidedOnHole ?? outcome.endHole,
        message: outcome.winnerSideId
          ? `${nameOf(outcome.winnerSideId)} win ${outcome.finalStatus}`
          : `${match.name} halved`,
        detail: match.name,
        tone: 'complete',
        teamColour: outcome.winnerSideId ? colourOf(outcome.winnerSideId) : undefined,
      });
    }

    for (const hole of outcome.holes) {
      if (!hole.complete || !hole.winnerSideId) continue;
      entries.push({
        id: `${match.id}:${hole.holeNo}`,
        matchId: match.id,
        holeNo: hole.holeNo,
        message: `${nameOf(hole.winnerSideId)} win the ${ordinal(hole.holeNo)}`,
        detail: `${match.name} · ${hole.statusAfter ?? ''}`,
        tone: 'win',
        teamColour: colourOf(hole.winnerSideId),
      });
    }
  }

  // Latest holes first; completed matches float to the top of their match.
  entries.sort((a, b) => {
    if (a.tone === 'complete' && b.tone !== 'complete') return -1;
    if (b.tone === 'complete' && a.tone !== 'complete') return 1;
    return b.holeNo - a.holeNo;
  });

  return entries.slice(0, limit);
}

/** 1 -> "1st", 12 -> "12th", 13 -> "13th", 21 -> "21st". */
export function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th';
  return `${n}${suffix}`;
}
