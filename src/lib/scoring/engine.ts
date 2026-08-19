/**
 * The match-play scoring engine.
 *
 * Given a match, its sides, the course holes and the raw score entries, this
 * produces everything the UI needs: net scores, strokes received, hole winners,
 * live match status (AS / 2 UP / dormie), the final result in golf notation
 * (3&2) and the points each team earns.
 *
 * Pure functions only — no I/O, no React, no Supabase. This file is the part
 * of the app that absolutely must be correct, so it is fully unit tested in
 * `engine.test.ts`.
 */

import {
  computeMatchHandicaps,
  isPerPlayerFormat,
  strokesForHoles,
  type SideHandicapResult,
} from './handicap';
import {
  isTeamBallFormat,
  type Hole,
  type Match,
  type MatchSide,
  type Player,
  type Score,
  type Tee,
  type TourSettings,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Result shapes
// ---------------------------------------------------------------------------

/** One ball played on one hole. */
export interface BallDetail {
  playerId: string | null;
  gross: number | null;
  pickedUp: boolean;
  strokesReceived: number;
  net: number | null;
  /** True when this ball is the one that counts for the side on this hole. */
  counts: boolean;
}

export interface SideHoleDetail {
  sideId: string;
  balls: BallDetail[];
  /** Gross of the counting ball. */
  gross: number | null;
  /** Net of the counting ball. Null = no score (everyone picked up). */
  net: number | null;
  /** Strokes the side receives on this hole (team formats) or the counting ball. */
  strokesReceived: number;
  /** True once this side has a usable outcome for the hole. */
  complete: boolean;
  /** True when the side has entries but all of them were pick-ups. */
  noScore: boolean;
}

export interface HoleOutcome {
  holeNo: number;
  par: number;
  strokeIndex: number;
  sides: SideHoleDetail[];
  /** Null when halved or not yet complete. */
  winnerSideId: string | null;
  halved: boolean;
  complete: boolean;
  /** Match status AFTER this hole, e.g. "2 UP". Only set for complete holes. */
  statusAfter: string | null;
  /** Side leading after this hole. */
  leaderSideIdAfter: string | null;
}

export interface MatchOutcome {
  matchId: string;
  format: Match['format'];
  startHole: number;
  endHole: number;
  totalHoles: number;
  holes: HoleOutcome[];
  /** Handicap detail per side id. */
  handicaps: Record<string, SideHandicapResult>;
  /** Stroke allocation per side id (team formats) keyed by hole number. */
  sideStrokes: Record<string, Record<number, number>>;
  /** Stroke allocation per player id keyed by hole number. */
  playerStrokes: Record<string, Record<number, number>>;
  /**
   * The combined side handicap, before the match-play difference, for formats
   * that play off one — floor((CH1 + CH2) / 2) for a scramble or shamble.
   * Null for singles and better ball, where each player carries their own.
   */
  teamHandicaps: Record<string, number | null>;

  holesPlayed: number;
  holesRemaining: number;
  /** Side currently ahead, or null when all square. */
  leaderSideId: string | null;
  /** How many holes the leader is up. 0 when all square. */
  up: number;
  /** "AS", "1 UP", "3 UP" — live status from the leader's point of view. */
  statusLabel: string;
  /** Leader is up by exactly the number of holes remaining. */
  isDormie: boolean;
  isComplete: boolean;

  winnerSideId: string | null;
  /** Golf notation: "3&2", "2 UP", "Halved". Empty while in progress. */
  finalStatus: string;
  decidedOnHole: number | null;

  /** Points actually earned. Zero for both sides until the match completes. */
  points: Record<string, number>;
  /**
   * Points this match is on course to deliver: the leader takes the lot, an
   * all-square match splits. Used for the Day 4 projected scoreboard.
   */
  projectedPoints: Record<string, number>;

  /** Holes won by each side, for stats. */
  holesWon: Record<string, number>;
  /** True when a player in this match has no handicap index on file. */
  hasMissingHandicap: boolean;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export interface ComputeMatchInput {
  match: Match;
  sides: MatchSide[];
  players: Player[];
  holes: Hole[];
  tee: Tee;
  scores: Score[];
  settings: TourSettings;
}

export function computeMatch(input: ComputeMatchInput): MatchOutcome {
  const { match, sides, players, holes, tee, scores, settings } = input;

  const playerById = new Map(players.map((p) => [p.id, p]));
  const orderedSides = [...sides].sort((a, b) => a.sortOrder - b.sortOrder);
  const holesInRange = holes
    .filter((h) => h.holeNo >= match.startHole && h.holeNo <= match.endHole)
    .sort((a, b) => a.holeNo - b.holeNo);
  const totalHoles = holesInRange.length;

  // --- Handicaps ----------------------------------------------------------
  const handicapResults = computeMatchHandicaps(
    orderedSides.map((side) => ({
      players: side.playerIds.map((id) => playerById.get(id)).filter((p): p is Player => !!p),
      handicapOverride: side.handicapOverride,
    })),
    match.format,
    tee,
    settings,
    match.allowanceOverride,
  );

  const handicaps: Record<string, SideHandicapResult> = {};
  const teamHandicaps: Record<string, number | null> = {};
  const sideStrokes: Record<string, Record<number, number>> = {};
  const playerStrokes: Record<string, Record<number, number>> = {};
  let hasMissingHandicap = false;

  orderedSides.forEach((side, i) => {
    const result = handicapResults[i];
    handicaps[side.id] = result;
    if (result.hasMissingIndex) hasMissingHandicap = true;

    // Strokes are dealt across the holes this match actually plays, ranked by
    // their real stroke index — so a six-hole block pays the whole difference
    // rather than only the part that happens to fall under SI 6.
    sideStrokes[side.id] = strokesForHoles(result.playingHandicap, holesInRange);

    const perPlayer = isPerPlayerFormat(match.format);
    teamHandicaps[side.id] = perPlayer ? null : result.rawPlayingHandicap;

    for (const playerId of side.playerIds) {
      playerStrokes[playerId] = perPlayer
        ? strokesForHoles(result.playerPlayingHandicaps[playerId] ?? 0, holesInRange)
        : // One combined handicap for the side: a scramble has a single ball,
          // and a shamble has two balls that both play off the team handicap.
          { ...sideStrokes[side.id] };
    }
  });

  const teamBall = isTeamBallFormat(match.format);

  // --- Index the score entries -------------------------------------------
  // key: `${sideId}:${holeNo}:${playerId ?? 'team'}`
  const scoreIndex = new Map<string, Score>();
  for (const score of scores) {
    if (score.matchId !== match.id) continue;
    scoreIndex.set(`${score.sideId}:${score.holeNo}:${score.playerId ?? 'team'}`, score);
  }

  // --- Walk the holes -----------------------------------------------------
  const holeOutcomes: HoleOutcome[] = [];
  const holesWon: Record<string, number> = Object.fromEntries(orderedSides.map((s) => [s.id, 0]));

  let up = 0;
  let leaderSideId: string | null = null;
  let holesPlayed = 0;
  let decidedOnHole: number | null = null;
  let winnerSideId: string | null = null;
  let finalStatus = '';
  let sequentiallyComplete = true;

  for (const hole of holesInRange) {
    const sideDetails: SideHoleDetail[] = orderedSides.map((side) => {
      const balls: BallDetail[] = [];

      if (teamBall) {
        const entry = scoreIndex.get(`${side.id}:${hole.holeNo}:team`);
        const strokes = sideStrokes[side.id][hole.holeNo] ?? 0;
        balls.push({
          playerId: null,
          gross: entry?.gross ?? null,
          pickedUp: entry?.pickedUp ?? false,
          strokesReceived: strokes,
          net: entry?.gross != null ? entry.gross - strokes : null,
          counts: true,
        });
      } else {
        for (const playerId of side.playerIds) {
          const entry = scoreIndex.get(`${side.id}:${hole.holeNo}:${playerId}`);
          const strokes = playerStrokes[playerId]?.[hole.holeNo] ?? 0;
          balls.push({
            playerId,
            gross: entry?.gross ?? null,
            pickedUp: entry?.pickedUp ?? false,
            strokesReceived: strokes,
            net: entry?.gross != null ? entry.gross - strokes : null,
            counts: false,
          });
        }
      }

      // The counting ball is the lowest net among balls that have a score.
      const scored = balls.filter((b) => b.net != null);
      let best: BallDetail | null = null;
      for (const ball of scored) {
        if (!best || (ball.net as number) < (best.net as number)) best = ball;
      }
      if (best) best.counts = true;

      const everyBallResolved = balls.every((b) => b.gross != null || b.pickedUp);
      const noScore = scored.length === 0 && everyBallResolved && balls.length > 0;
      // A side is settled as soon as one ball is in the hole (that ball can
      // only be beaten by a lower one, and in better ball the lowest counts),
      // or when every ball has been picked up.
      const complete = scored.length > 0 || noScore;

      return {
        sideId: side.id,
        balls,
        gross: best?.gross ?? null,
        net: best?.net ?? null,
        strokesReceived: teamBall
          ? (sideStrokes[side.id][hole.holeNo] ?? 0)
          : (best?.strokesReceived ?? 0),
        complete,
        noScore,
      };
    });

    const holeComplete = sideDetails.length > 0 && sideDetails.every((s) => s.complete);

    let holeWinner: string | null = null;
    let halved = false;

    if (holeComplete) {
      const withScores = sideDetails.filter((s) => s.net != null);
      if (withScores.length === 0) {
        halved = true; // Everyone picked up.
      } else if (withScores.length === 1) {
        holeWinner = withScores[0].sideId; // Opponents all picked up.
      } else {
        const best = Math.min(...withScores.map((s) => s.net as number));
        const winners = withScores.filter((s) => s.net === best);
        if (winners.length === 1) holeWinner = winners[0].sideId;
        else halved = true;
      }
    }

    // --- Update running match state ---------------------------------------
    let statusAfter: string | null = null;
    let leaderAfter: string | null = null;

    if (holeComplete && sequentiallyComplete) {
      holesPlayed += 1;
      if (holeWinner) {
        holesWon[holeWinner] = (holesWon[holeWinner] ?? 0) + 1;
        if (leaderSideId === holeWinner) {
          up += 1;
        } else if (leaderSideId === null) {
          leaderSideId = holeWinner;
          up = 1;
        } else {
          up -= 1;
          if (up === 0) leaderSideId = null;
          else if (up < 0) {
            leaderSideId = holeWinner;
            up = 1;
          }
        }
      }
      statusAfter = up === 0 ? 'AS' : `${up} UP`;
      leaderAfter = leaderSideId;

      const remaining = totalHoles - holesPlayed;
      if (decidedOnHole === null && up > remaining) {
        decidedOnHole = hole.holeNo;
        winnerSideId = leaderSideId;
        finalStatus = remaining > 0 ? `${up}&${remaining}` : `${up} UP`;
      }
    } else if (holeComplete) {
      // Scored out of order — count it for stats but don't advance the match
      // status until the gap ahead of it is filled in.
      if (holeWinner) holesWon[holeWinner] = (holesWon[holeWinner] ?? 0) + 1;
    } else {
      sequentiallyComplete = false;
    }

    holeOutcomes.push({
      holeNo: hole.holeNo,
      par: hole.par,
      strokeIndex: hole.strokeIndex,
      sides: sideDetails,
      winnerSideId: holeWinner,
      halved,
      complete: holeComplete,
      statusAfter,
      leaderSideIdAfter: leaderAfter,
    });
  }

  const holesRemaining = Math.max(0, totalHoles - holesPlayed);

  // All holes played without an early decision.
  if (decidedOnHole === null && holesPlayed === totalHoles && totalHoles > 0) {
    decidedOnHole = holesInRange[holesInRange.length - 1].holeNo;
    if (up === 0) {
      winnerSideId = null;
      finalStatus = 'Halved';
    } else {
      winnerSideId = leaderSideId;
      finalStatus = `${up} UP`;
    }
  }

  const isComplete = decidedOnHole !== null;
  const isDormie = !isComplete && up > 0 && up === holesRemaining;

  // --- Points -------------------------------------------------------------
  const halfRatio =
    settings.pointsPerWin > 0 ? settings.pointsPerHalf / settings.pointsPerWin : 0.5;
  const winPoints = match.pointsValue;
  const halfPoints = match.pointsValue * halfRatio;

  const points: Record<string, number> = Object.fromEntries(orderedSides.map((s) => [s.id, 0]));
  const projectedPoints: Record<string, number> = { ...points };

  if (isComplete) {
    if (winnerSideId) {
      points[winnerSideId] = winPoints;
    } else {
      for (const side of orderedSides) points[side.id] = halfPoints;
    }
    Object.assign(projectedPoints, points);
  } else if (holesPlayed > 0) {
    if (leaderSideId) {
      projectedPoints[leaderSideId] = winPoints;
    } else {
      for (const side of orderedSides) projectedPoints[side.id] = halfPoints;
    }
  } else {
    // Not started: assume a half so projections stay sane before tee off.
    for (const side of orderedSides) projectedPoints[side.id] = halfPoints;
  }

  return {
    matchId: match.id,
    format: match.format,
    startHole: match.startHole,
    endHole: match.endHole,
    totalHoles,
    holes: holeOutcomes,
    handicaps,
    sideStrokes,
    playerStrokes,
    teamHandicaps,
    holesPlayed,
    holesRemaining,
    leaderSideId,
    up,
    statusLabel: up === 0 ? 'AS' : `${up} UP`,
    isDormie,
    isComplete,
    winnerSideId,
    finalStatus,
    decidedOnHole,
    points,
    projectedPoints,
    holesWon,
    hasMissingHandicap: hasMissingHandicap && settings.handicapsEnabled,
  };
}

// ---------------------------------------------------------------------------
// Aggregation across a whole tour
// ---------------------------------------------------------------------------

export interface TeamPoints {
  teamId: string;
  points: number;
  projectedPoints: number;
  matchesWon: number;
  matchesHalved: number;
  matchesLost: number;
}

export interface Standings {
  byTeam: Record<string, TeamPoints>;
  /** Points still to be decided across all matches. */
  pointsRemaining: number;
  /** Total points available across the whole tour. */
  pointsTotal: number;
  /** Points needed to be mathematically certain of winning the tour. */
  pointsToWin: number;
  leaderTeamId: string | null;
  isTied: boolean;
}

export function computeStandings(
  outcomes: MatchOutcome[],
  sidesByMatch: Map<string, MatchSide[]>,
  teamIds: string[],
): Standings {
  const byTeam: Record<string, TeamPoints> = Object.fromEntries(
    teamIds.map((id) => [
      id,
      { teamId: id, points: 0, projectedPoints: 0, matchesWon: 0, matchesHalved: 0, matchesLost: 0 },
    ]),
  );

  let pointsTotal = 0;
  let pointsRemaining = 0;

  for (const outcome of outcomes) {
    const sides = sidesByMatch.get(outcome.matchId) ?? [];
    const teamOf = new Map(sides.map((s) => [s.id, s.teamId]));
    const matchPoints = Object.values(outcome.points).reduce((a, b) => a + b, 0);
    const stake = Math.max(
      matchPoints,
      Object.values(outcome.projectedPoints).reduce((a, b) => a + b, 0),
    );
    pointsTotal += stake;
    if (!outcome.isComplete) pointsRemaining += stake;

    for (const [sideId, value] of Object.entries(outcome.points)) {
      const teamId = teamOf.get(sideId);
      if (!teamId || !byTeam[teamId]) continue;
      byTeam[teamId].points += value;
    }
    for (const [sideId, value] of Object.entries(outcome.projectedPoints)) {
      const teamId = teamOf.get(sideId);
      if (!teamId || !byTeam[teamId]) continue;
      byTeam[teamId].projectedPoints += value;
    }

    if (outcome.isComplete) {
      for (const side of sides) {
        const record = byTeam[side.teamId];
        if (!record) continue;
        if (outcome.winnerSideId === null) record.matchesHalved += 1;
        else if (outcome.winnerSideId === side.id) record.matchesWon += 1;
        else record.matchesLost += 1;
      }
    }
  }

  const ranked = Object.values(byTeam).sort((a, b) => b.points - a.points);
  const isTied = ranked.length > 1 && ranked[0].points === ranked[1].points;

  return {
    byTeam,
    pointsRemaining,
    pointsTotal,
    pointsToWin: pointsTotal / 2 + 0.5,
    leaderTeamId: ranked.length && !isTied ? ranked[0].teamId : null,
    isTied,
  };
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** "3&2", "2 UP", "Halved" or the live status. */
export function describeMatch(outcome: MatchOutcome, sideName: (sideId: string) => string): string {
  if (outcome.isComplete) {
    if (!outcome.winnerSideId) return 'Halved';
    return `${sideName(outcome.winnerSideId)} ${outcome.finalStatus}`;
  }
  if (outcome.holesPlayed === 0) return 'Not started';
  if (outcome.up === 0) return `All square thru ${outcome.holesPlayed}`;
  return `${sideName(outcome.leaderSideId as string)} ${outcome.up} UP thru ${outcome.holesPlayed}`;
}

/** Short status for a match tile: "2 UP", "AS", "3&2". */
export function shortStatus(outcome: MatchOutcome): string {
  if (outcome.isComplete) return outcome.finalStatus || 'Halved';
  if (outcome.holesPlayed === 0) return '—';
  return outcome.statusLabel;
}

export function scoreToPar(gross: number, par: number): string {
  const diff = gross - par;
  if (diff === 0) return 'Par';
  if (diff === -1) return 'Birdie';
  if (diff === -2) return 'Eagle';
  if (diff <= -3) return 'Albatross';
  if (diff === 1) return 'Bogey';
  if (diff === 2) return 'Double';
  return `+${diff}`;
}

export function formatPoints(points: number): string {
  if (Number.isInteger(points)) return String(points);
  return points.toFixed(1).replace(/\.0$/, '');
}
