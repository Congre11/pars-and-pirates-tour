import { describe, expect, it } from 'vitest';
import {
  applyManualResult,
  buildManualResult,
  computeMatch,
  computeStandings,
  pointsForMatch,
  type MatchOutcome,
} from './engine';
import { courseHandicap } from './handicap';
import {
  lockedByLabel,
  lockedRoundsForCourse,
  lockedRoundsForTee,
  manualHandicapStatus,
  saveToTeeLabel,
} from '@/lib/rounds/round-setup';
import {
  DEFAULT_TOUR_SETTINGS,
  isRoundLocked,
  type Hole,
  type Match,
  type MatchResult,
  type MatchSide,
  type Player,
  type Round,
  type Tee,
} from '@/lib/types';

/**
 * Day 1 was played, the app failed, and the fix has to work without disturbing
 * a single thing about the round that is already finished.
 *
 * Two mechanisms are under test:
 *
 *   - manual course handicaps, per round, with NO fallback. A round on manual
 *     handicaps scores off exactly what was typed in, and a player with
 *     nothing entered stops the round rather than being quietly given the
 *     formula's answer — which is how the wrong numbers got used before.
 *   - organiser match results, which award points at each day's own stake and
 *     halve rule without anyone rebuilding eighteen holes of scores.
 */

// --- Fixtures ---------------------------------------------------------------

const TEE: Tee = {
  id: 'tee-yellow',
  courseId: 'course-1',
  name: 'Yellow',
  colour: '#f2c53d',
  courseRating: 70.8,
  slopeRating: 131,
  par: 71,
  yardage: 6400,
  distanceUnit: 'yards',
};

const HOLES: Hole[] = Array.from({ length: 18 }, (_, i) => ({
  id: `hole-${i + 1}`,
  courseId: 'course-1',
  holeNo: i + 1,
  par: 4,
  strokeIndex: i + 1,
  yardages: { 'tee-yellow': 400 },
}));

function player(id: string, teamId: string, handicapIndex: number | null): Player {
  return {
    id,
    tourId: 'tour-1',
    teamId,
    name: id,
    nickname: null,
    initials: id.slice(0, 2).toUpperCase(),
    isCaptain: false,
    isOrganiser: false,
    hnaId: null,
    handicapIndex,
    handicapSource: 'manual',
    handicapUpdatedAt: null,
    photoUrl: null,
    sortOrder: 0,
  };
}

const JASON = player('jason', 'team-a', 11.3);
const ALAN = player('alan', 'team-a', 22);
const ANDREW = player('andrew', 'team-b', 4);
const RYAN = player('ryan', 'team-b', 8.8);
const PLAYERS = [JASON, ALAN, ANDREW, RYAN];

function match(overrides: Partial<Match> = {}): Match {
  return {
    id: 'match-1',
    roundId: 'round-1',
    name: 'Match 1',
    format: 'better_ball',
    startHole: 1,
    endHole: 18,
    pointsValue: 1,
    allowanceOverride: null,
    pairingsConfirmedAt: null,
    pairingsConfirmedBy: null,
    status: 'live',
    sortOrder: 0,
    ...overrides,
  };
}

function sides(home: string[], away: string[], matchId = 'match-1'): MatchSide[] {
  return [
    { id: `${matchId}-a`, matchId, teamId: 'team-a', playerIds: home, handicapOverride: null, sortOrder: 0 },
    { id: `${matchId}-b`, matchId, teamId: 'team-b', playerIds: away, handicapOverride: null, sortOrder: 1 },
  ];
}

function round(overrides: Partial<Round> = {}): Round {
  return {
    id: 'round-1',
    tourId: 'tour-1',
    dayNo: 2,
    name: 'Day 2',
    date: '2026-09-02',
    courseId: 'course-1',
    teeId: 'tee-yellow',
    formatLabel: 'Better Ball',
    teeTime: '09:00',
    status: 'upcoming',
    handicapSource: 'calculated',
    notes: null,
    sortOrder: 1,
    ...overrides,
  };
}

/** The manual figures the organiser types in — deliberately NOT the calculated ones. */
const MANUAL = { jason: 15, alan: 28, andrew: 6, ryan: 12 };

function run(overrides: Partial<Parameters<typeof computeMatch>[0]> = {}): MatchOutcome {
  return computeMatch({
    match: match(),
    sides: sides(['jason', 'alan'], ['andrew', 'ryan']),
    players: PLAYERS,
    holes: HOLES,
    tee: TEE,
    scores: [],
    settings: DEFAULT_TOUR_SETTINGS,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Manual course handicaps
// ---------------------------------------------------------------------------

describe('a round on manual course handicaps', () => {
  it('uses exactly what was typed in, not the formula', () => {
    // The formula off this tee gives 13 / 25 / 4 / 10. Nothing like the manual
    // figures, so there is no chance of the two being confused.
    expect(courseHandicap(11.3, TEE)).toBe(13);
    expect(courseHandicap(22, TEE)).toBe(25);

    const outcome = run({ manualCourseHandicaps: MANUAL });
    const ch = {
      ...outcome.handicaps['match-1-a'].courseHandicaps,
      ...outcome.handicaps['match-1-b'].courseHandicaps,
    };

    expect(ch).toEqual(MANUAL);
  });

  it('gives Better Ball each player their full manual handicap', () => {
    const outcome = run({ manualCourseHandicaps: MANUAL });
    const per = {
      ...outcome.handicaps['match-1-a'].playerPlayingHandicaps,
      ...outcome.handicaps['match-1-b'].playerPlayingHandicaps,
    };

    expect(per).toEqual(MANUAL); // 100%, nobody reduced, nobody off zero
  });

  it('gives Singles each player their full manual handicap', () => {
    const outcome = run({
      match: match({ format: 'singles' }),
      sides: sides(['jason'], ['andrew']),
      manualCourseHandicaps: MANUAL,
    });

    expect(outcome.handicaps['match-1-a'].playerPlayingHandicaps.jason).toBe(15);
    expect(outcome.handicaps['match-1-b'].playerPlayingHandicaps.andrew).toBe(6);
  });

  it('runs a Scramble pair off floor(floor((CH1 + CH2) / 2) x 0.8) of the manual figures', () => {
    const outcome = run({
      match: match({ format: 'two_man_scramble' }),
      manualCourseHandicaps: MANUAL,
    });

    // Jason 15 + Alan 28 -> floor(43/2) = 21 -> 21 x 0.8 = 16.8 -> 16
    expect(outcome.teamHandicaps['match-1-a']).toBe(16);
    // Andrew 6 + Ryan 12 -> floor(18/2) = 9 -> 9 x 0.8 = 7.2 -> 7
    expect(outcome.teamHandicaps['match-1-b']).toBe(7);
  });

  it('runs a Shamble pair off the same rule', () => {
    const outcome = run({
      match: match({ format: 'shamble', startHole: 7, endHole: 12 }),
      manualCourseHandicaps: MANUAL,
    });

    expect(outcome.teamHandicaps['match-1-a']).toBe(16);
    expect(outcome.teamHandicaps['match-1-b']).toBe(7);
  });

  it('never falls back to the calculated figure for a missing player', () => {
    // Alan has nothing entered. The formula would say 25.
    const partial = { jason: 15, andrew: 6, ryan: 12 };
    const outcome = run({ manualCourseHandicaps: partial });

    expect(outcome.handicaps['match-1-a'].courseHandicaps.alan).not.toBe(25);
    expect(outcome.handicaps['match-1-a'].courseHandicaps.alan).toBe(0);
    expect(outcome.missingManualPlayerIds).toEqual(['alan']);
  });

  it('reports every missing player, across both sides', () => {
    const outcome = run({ manualCourseHandicaps: { jason: 15, andrew: 6 } });
    expect(outcome.missingManualPlayerIds.sort()).toEqual(['alan', 'ryan']);
  });

  it('reports nobody missing when every player is entered', () => {
    expect(run({ manualCourseHandicaps: MANUAL }).missingManualPlayerIds).toEqual([]);
  });

  it('ignores the tee entirely, so editing CR or Slope cannot move a manual handicap', () => {
    const before = run({ manualCourseHandicaps: MANUAL });
    const after = computeMatch({
      match: match(),
      sides: sides(['jason', 'alan'], ['andrew', 'ryan']),
      players: PLAYERS,
      holes: HOLES,
      // A wildly different tee — the sort of change that broke Day 1.
      tee: { ...TEE, courseRating: 76.9, slopeRating: 155, par: 68 },
      scores: [],
      settings: DEFAULT_TOUR_SETTINGS,
      manualCourseHandicaps: MANUAL,
    });

    expect(after.handicaps['match-1-a'].courseHandicaps).toEqual(
      before.handicaps['match-1-a'].courseHandicaps,
    );
    expect(after.handicaps['match-1-b'].courseHandicaps).toEqual(
      before.handicaps['match-1-b'].courseHandicaps,
    );
  });
});

describe('a round left on calculated handicaps — Day 1 — is untouched', () => {
  it('produces exactly what it produced before manual handicaps existed', () => {
    const outcome = run(); // no manualCourseHandicaps at all
    const ch = {
      ...outcome.handicaps['match-1-a'].courseHandicaps,
      ...outcome.handicaps['match-1-b'].courseHandicaps,
    };

    expect(ch).toEqual({ jason: 13, alan: 25, andrew: 4, ryan: 10 });
    expect(outcome.missingManualPlayerIds).toEqual([]);
  });

  it('is not affected by handicaps entered against another round', () => {
    // The provider only passes a round's own figures, and a round on
    // 'calculated' is passed none. This is that contract, stated as a test.
    const dayOne = round({ id: 'round-day-1', dayNo: 1, status: 'complete' });
    expect(dayOne.handicapSource).toBe('calculated');

    const outcome = run({
      manualCourseHandicaps: dayOne.handicapSource === 'manual' ? MANUAL : null,
    });
    expect(outcome.handicaps['match-1-a'].courseHandicaps.jason).toBe(13);
  });

  it('treats a completed round as locked for setup', () => {
    expect(isRoundLocked(round({ status: 'complete' }))).toBe(true);
    expect(isRoundLocked(round({ status: 'live' }))).toBe(false);
    expect(isRoundLocked(round({ status: 'upcoming' }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Is the round safe to score?
// ---------------------------------------------------------------------------

describe('manualHandicapStatus', () => {
  it('says nothing is wrong for a calculated round', () => {
    const status = manualHandicapStatus(round(), PLAYERS, {});
    expect(status.isManual).toBe(false);
    expect(status.incomplete).toBe(false);
    expect(status.missing).toEqual([]);
  });

  it('blocks a manual round with anyone missing', () => {
    const status = manualHandicapStatus(round({ handicapSource: 'manual' }), PLAYERS, {
      jason: 15,
      andrew: 6,
    });

    expect(status.incomplete).toBe(true);
    expect(status.ready).toBe(false);
    expect(status.entered).toBe(2);
    expect(status.required).toBe(4);
    expect(status.missing.map((p) => p.id)).toEqual(['alan', 'ryan']);
  });

  it('clears a manual round once every player is entered', () => {
    const status = manualHandicapStatus(round({ handicapSource: 'manual' }), PLAYERS, MANUAL);
    expect(status.ready).toBe(true);
    expect(status.incomplete).toBe(false);
  });

  it('only asks for the players actually in the round', () => {
    const status = manualHandicapStatus(round({ handicapSource: 'manual' }), [JASON, ANDREW], {
      jason: 15,
      andrew: 6,
    });
    expect(status.ready).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Protecting a completed round's setup
// ---------------------------------------------------------------------------

describe('completed rounds lock their course and tee', () => {
  const dayOne = round({ id: 'r1', dayNo: 1, status: 'complete', courseId: 'course-1' });
  const dayTwo = round({ id: 'r2', dayNo: 2, status: 'upcoming', courseId: 'course-2' });

  it('locks a course a completed round was played on', () => {
    expect(lockedRoundsForCourse([dayOne, dayTwo], 'course-1')).toHaveLength(1);
    expect(lockedRoundsForCourse([dayOne, dayTwo], 'course-2')).toHaveLength(0);
  });

  it('locks the tee that round was played off', () => {
    expect(lockedRoundsForTee([dayOne, dayTwo], 'tee-yellow').map((r) => r.dayNo)).toEqual([1]);
  });

  it('names the days that hold the lock', () => {
    expect(lockedByLabel([dayOne])).toBe('Day 1');
    expect(lockedByLabel([dayOne, round({ dayNo: 3, status: 'complete' })])).toBe('Day 1 and Day 3');
    expect(lockedByLabel([])).toBe('');
  });
});

describe('the verify screen names the tee it will write to', () => {
  it('shouts the tee name once one is chosen', () => {
    expect(saveToTeeLabel({ ...TEE, name: 'White' })).toBe('Save CR/Slope to WHITE tees');
  });

  it('refuses to name one until a tee is chosen', () => {
    expect(saveToTeeLabel(undefined)).toBe('Choose a tee first');
  });
});

// ---------------------------------------------------------------------------
// Organiser match results
// ---------------------------------------------------------------------------

const DAY_1_MATCH = match({ id: 'd1', roundId: 'round-1', format: 'two_man_scramble', pointsValue: 1 });
const DAY_3_MATCH = match({ id: 'd3', roundId: 'round-3', format: 'shamble', pointsValue: 0.5 });

describe('what an organiser result pays', () => {
  it('pays a full point for a Day 1, 2 or 4 win', () => {
    expect(pointsForMatch(1, DEFAULT_TOUR_SETTINGS, false)).toEqual({ win: 1, half: 0.5 });
  });

  it('pays half a point each for a Day 1, 2 or 4 halve', () => {
    const result = buildManualResult({
      match: DAY_1_MATCH,
      sides: sides(['jason', 'alan'], ['andrew', 'ryan'], 'd1'),
      outcome: 'halved',
      settings: DEFAULT_TOUR_SETTINGS,
      halveAwardsNothing: false,
      enteredBy: 'Alan',
    });

    expect(result.pointsHome).toBe(0.5);
    expect(result.pointsAway).toBe(0.5);
    expect(result.winnerTeamId).toBeNull();
  });

  it('pays half a point for a Day 3 win', () => {
    expect(pointsForMatch(0.5, DEFAULT_TOUR_SETTINGS, true).win).toBe(0.5);
  });

  it('pays NOTHING to either side for a Day 3 halve', () => {
    const result = buildManualResult({
      match: DAY_3_MATCH,
      sides: sides(['jason'], ['andrew'], 'd3'),
      outcome: 'halved',
      settings: DEFAULT_TOUR_SETTINGS,
      halveAwardsNothing: true,
      enteredBy: 'Alan',
    });

    expect(result.pointsHome).toBe(0);
    expect(result.pointsAway).toBe(0);
  });

  it('records who entered it, so it can never be mistaken for live scoring', () => {
    const result = buildManualResult({
      match: DAY_1_MATCH,
      sides: sides(['jason'], ['andrew'], 'd1'),
      outcome: 'home',
      settings: DEFAULT_TOUR_SETTINGS,
      halveAwardsNothing: false,
      enteredBy: 'Alan',
    });

    expect(result.enteredBy).toBe('Alan');
    expect(result.enteredAt).not.toBeNull();
  });
});

describe('applying an organiser result to a match', () => {
  const MATCH_SIDES = sides(['jason', 'alan'], ['andrew', 'ryan']);

  const declared = (winnerTeamId: string | null): MatchResult => ({
    matchId: 'match-1',
    winnerTeamId,
    pointsHome: 0,
    pointsAway: 0,
    finalStatus: winnerTeamId ? 'Won' : 'Halved',
    decidedOnHole: null,
    createdAt: '2026-08-30T12:00:00.000Z',
    enteredBy: 'Alan',
    enteredAt: '2026-08-30T12:00:00.000Z',
  });

  it('completes a match that has no scores at all', () => {
    const outcome = applyManualResult(
      run(),
      declared('team-a'),
      MATCH_SIDES,
      DEFAULT_TOUR_SETTINGS,
      false,
    );

    expect(outcome.isComplete).toBe(true);
    expect(outcome.winnerSideId).toBe('match-1-a');
    expect(outcome.points['match-1-a']).toBe(1);
    expect(outcome.points['match-1-b']).toBe(0);
    expect(outcome.manualResult?.enteredBy).toBe('Alan');
  });

  it('splits a halve on a day that pays halves', () => {
    const outcome = applyManualResult(
      run(),
      declared(null),
      MATCH_SIDES,
      DEFAULT_TOUR_SETTINGS,
      false,
    );

    expect(outcome.points).toEqual({ 'match-1-a': 0.5, 'match-1-b': 0.5 });
  });

  it('burns a halve on Day 3 without shrinking the stake', () => {
    const base = run({ match: match({ pointsValue: 0.5 }) });
    const outcome = applyManualResult(
      base,
      declared(null),
      MATCH_SIDES,
      DEFAULT_TOUR_SETTINGS,
      true,
    );

    expect(outcome.points).toEqual({ 'match-1-a': 0, 'match-1-b': 0 });
    expect(outcome.pointsValue).toBe(0.5); // still on offer, simply unclaimed
  });

  it('leaves the hole detail and handicaps alone', () => {
    const base = run({ manualCourseHandicaps: MANUAL });
    const outcome = applyManualResult(
      base,
      declared('team-b'),
      MATCH_SIDES,
      DEFAULT_TOUR_SETTINGS,
      false,
    );

    expect(outcome.holes).toBe(base.holes);
    expect(outcome.handicaps).toBe(base.handicaps);
  });
});

describe('an organiser result on the leaderboard', () => {
  const sidesByMatch = new Map<string, MatchSide[]>([
    ['d1a', sides(['jason', 'alan'], ['andrew', 'ryan'], 'd1a')],
    ['d1b', sides(['jason'], ['andrew'], 'd1b')],
  ]);

  const declaredOutcome = (matchId: string, winnerTeamId: string | null, stake: number, burn: boolean) =>
    applyManualResult(
      computeMatch({
        match: match({ id: matchId, pointsValue: stake, format: 'two_man_scramble' }),
        sides: sidesByMatch.get(matchId)!,
        players: PLAYERS,
        holes: HOLES,
        tee: TEE,
        scores: [],
        settings: DEFAULT_TOUR_SETTINGS,
      }),
      {
        matchId,
        winnerTeamId,
        pointsHome: 0,
        pointsAway: 0,
        finalStatus: winnerTeamId ? 'Won' : 'Halved',
        decidedOnHole: null,
        createdAt: '',
        enteredBy: 'Alan',
        enteredAt: '',
      },
      sidesByMatch.get(matchId)!,
      DEFAULT_TOUR_SETTINGS,
      burn,
    );

  it('feeds the tour standings exactly as a played-out match would', () => {
    // Day 1's two scrambles: Pars win one, Pirates win the other.
    const standings = computeStandings(
      [
        declaredOutcome('d1a', 'team-a', 1, false),
        declaredOutcome('d1b', 'team-b', 1, false),
      ],
      sidesByMatch,
      ['team-a', 'team-b'],
    );

    expect(standings.byTeam['team-a'].points).toBe(1);
    expect(standings.byTeam['team-b'].points).toBe(1);
    expect(standings.byTeam['team-a'].matchesWon).toBe(1);
    expect(standings.byTeam['team-b'].matchesWon).toBe(1);
    expect(standings.pointsRemaining).toBe(0);
  });

  it('does not shrink the tour when a Day 3 half is burned', () => {
    const standings = computeStandings(
      [declaredOutcome('d1a', null, 0.5, true)],
      sidesByMatch,
      ['team-a', 'team-b'],
    );

    expect(standings.byTeam['team-a'].points).toBe(0);
    expect(standings.byTeam['team-b'].points).toBe(0);
    expect(standings.pointsTotal).toBe(0.5); // the stake still counts
  });

});
