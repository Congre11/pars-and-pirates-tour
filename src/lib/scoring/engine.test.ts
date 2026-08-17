import { describe, expect, it } from 'vitest';
import { computeMatch, computeStandings, shortStatus } from './engine';
import { courseHandicap, sidePlayingHandicap, strokesOnHole } from './handicap';
import {
  DEFAULT_TOUR_SETTINGS,
  type Hole,
  type Match,
  type MatchSide,
  type Player,
  type Score,
  type Tee,
  type TourSettings,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEE: Tee = {
  id: 'tee-1',
  courseId: 'course-1',
  name: 'Yellow',
  colour: '#f2c53d',
  courseRating: 71.0,
  slopeRating: 130,
  par: 72,
  yardage: 6400,
};

/** A flat par-72 course with stroke indexes 1..18 in hole order. */
const HOLES: Hole[] = Array.from({ length: 18 }, (_, i) => ({
  id: `hole-${i + 1}`,
  courseId: 'course-1',
  holeNo: i + 1,
  par: 4,
  strokeIndex: i + 1,
  yardages: { 'tee-1': 400 },
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
    hnaId: null,
    handicapIndex,
    handicapSource: 'manual',
    handicapUpdatedAt: null,
    photoUrl: null,
    sortOrder: 0,
  };
}

function match(overrides: Partial<Match> = {}): Match {
  return {
    id: 'match-1',
    roundId: 'round-1',
    name: 'Match 1',
    format: 'singles',
    startHole: 1,
    endHole: 18,
    pointsValue: 1,
    status: 'live',
    sortOrder: 0,
    ...overrides,
  };
}

function sides(homePlayers: string[], awayPlayers: string[]): MatchSide[] {
  return [
    { id: 'side-a', matchId: 'match-1', teamId: 'team-a', playerIds: homePlayers, handicapOverride: null, sortOrder: 0 },
    { id: 'side-b', matchId: 'match-1', teamId: 'team-b', playerIds: awayPlayers, handicapOverride: null, sortOrder: 1 },
  ];
}

let scoreSeq = 0;
function score(
  sideId: string,
  holeNo: number,
  gross: number | null,
  playerId: string | null = null,
  pickedUp = false,
): Score {
  return {
    id: `score-${scoreSeq++}`,
    matchId: 'match-1',
    holeNo,
    sideId,
    playerId,
    gross,
    pickedUp,
    enteredBy: 'test',
    updatedAt: '2026-08-29T10:00:00.000Z',
  };
}

/** Scratch settings keep the tests focused on match logic, not handicaps. */
const SCRATCH: TourSettings = { ...DEFAULT_TOUR_SETTINGS, handicapsEnabled: false };

// ---------------------------------------------------------------------------
// Handicap maths
// ---------------------------------------------------------------------------

describe('courseHandicap', () => {
  it('applies the WHS formula: index x slope/113 + (rating - par)', () => {
    // 12.0 x 130/113 = 13.805... ; + (71 - 72) = 12.805... -> 13
    expect(courseHandicap(12.0, TEE)).toBe(13);
  });

  it('handles plus handicaps', () => {
    // -2.0 x 130/113 = -2.30 ; + (-1) = -3.30 -> -3
    expect(courseHandicap(-2.0, TEE)).toBe(-3);
  });

  it('handles a scratch index', () => {
    expect(courseHandicap(0, TEE)).toBe(-1);
  });
});

describe('strokesOnHole', () => {
  it('gives one stroke on holes up to the handicap', () => {
    expect(strokesOnHole(5, 1)).toBe(1);
    expect(strokesOnHole(5, 5)).toBe(1);
    expect(strokesOnHole(5, 6)).toBe(0);
    expect(strokesOnHole(5, 18)).toBe(0);
  });

  it('gives no strokes off scratch', () => {
    for (let si = 1; si <= 18; si++) expect(strokesOnHole(0, si)).toBe(0);
  });

  it('wraps for handicaps above 18', () => {
    // 22 shots: two on SI 1-4, one on the rest.
    expect(strokesOnHole(22, 1)).toBe(2);
    expect(strokesOnHole(22, 4)).toBe(2);
    expect(strokesOnHole(22, 5)).toBe(1);
    expect(strokesOnHole(22, 18)).toBe(1);
  });

  it('gives exactly the handicap in total strokes', () => {
    for (const ph of [1, 7, 14, 18, 19, 27, 36]) {
      let total = 0;
      for (let si = 1; si <= 18; si++) total += strokesOnHole(ph, si);
      expect(total).toBe(ph);
    }
  });

  it('takes strokes back from the easiest holes for plus handicaps', () => {
    expect(strokesOnHole(-2, 18)).toBe(-1);
    expect(strokesOnHole(-2, 17)).toBe(-1);
    expect(strokesOnHole(-2, 16)).toBe(0);
    expect(strokesOnHole(-2, 1)).toBe(0);
    let total = 0;
    for (let si = 1; si <= 18; si++) total += strokesOnHole(-3, si);
    expect(total).toBe(-3);
  });

  it('allocates over six holes when a match is six holes long', () => {
    // A 6-hole allocation is still driven by the full 18-hole stroke index,
    // which is what `strokeAllocation` does; this checks the explicit override.
    expect(strokesOnHole(6, 6, 6)).toBe(1);
    expect(strokesOnHole(12, 3, 6)).toBe(2);
  });
});

describe('sidePlayingHandicap', () => {
  it('applies the 2-man scramble 35/15 split low-to-high', () => {
    // low 10 -> 3.5, high 20 -> 3.0, total 6.5 -> 7 (round half away from zero)
    expect(
      sidePlayingHandicap([20, 10], { weights: [0.35, 0.15], rounding: 'nearest' }),
    ).toBe(7);
  });

  it('applies the 4-man scramble 20/15/10/5 split', () => {
    // 5*.2 + 10*.15 + 15*.1 + 20*.05 = 1 + 1.5 + 1.5 + 1 = 5
    expect(
      sidePlayingHandicap([20, 15, 10, 5], { weights: [0.2, 0.15, 0.1, 0.05], rounding: 'nearest' }),
    ).toBe(5);
  });

  it('applies foursomes 50% of combined', () => {
    expect(sidePlayingHandicap([10, 16], { weights: [0.5, 0.5], rounding: 'nearest' })).toBe(13);
  });

  it('applies a single weight to every player', () => {
    expect(sidePlayingHandicap([10], { weights: [0.9], rounding: 'nearest' })).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// Singles match play
// ---------------------------------------------------------------------------

describe('singles match play', () => {
  const players = [player('p1', 'team-a', null), player('p2', 'team-b', null)];

  function run(scores: Score[], m: Partial<Match> = {}) {
    return computeMatch({
      match: match({ format: 'singles', ...m }),
      sides: sides(['p1'], ['p2']),
      players,
      holes: HOLES,
      tee: TEE,
      scores,
      settings: SCRATCH,
    });
  }

  it('is all square before a ball is struck', () => {
    const outcome = run([]);
    expect(outcome.statusLabel).toBe('AS');
    expect(outcome.holesPlayed).toBe(0);
    expect(outcome.isComplete).toBe(false);
    expect(shortStatus(outcome)).toBe('—');
  });

  it('awards the hole to the lower score', () => {
    const outcome = run([score('side-a', 1, 4, 'p1'), score('side-b', 1, 5, 'p2')]);
    expect(outcome.holes[0].winnerSideId).toBe('side-a');
    expect(outcome.leaderSideId).toBe('side-a');
    expect(outcome.up).toBe(1);
    expect(outcome.statusLabel).toBe('1 UP');
    expect(outcome.holesRemaining).toBe(17);
  });

  it('halves a hole when the scores match', () => {
    const outcome = run([score('side-a', 1, 4, 'p1'), score('side-b', 1, 4, 'p2')]);
    expect(outcome.holes[0].halved).toBe(true);
    expect(outcome.holes[0].winnerSideId).toBeNull();
    expect(outcome.statusLabel).toBe('AS');
    expect(outcome.holesPlayed).toBe(1);
  });

  it('brings a lead back to all square', () => {
    const outcome = run([
      score('side-a', 1, 4, 'p1'),
      score('side-b', 1, 5, 'p2'),
      score('side-a', 2, 5, 'p1'),
      score('side-b', 2, 4, 'p2'),
    ]);
    expect(outcome.up).toBe(0);
    expect(outcome.leaderSideId).toBeNull();
    expect(outcome.statusLabel).toBe('AS');
  });

  it('flips the lead to the other side', () => {
    const outcome = run([
      score('side-a', 1, 4, 'p1'),
      score('side-b', 1, 5, 'p2'),
      score('side-a', 2, 5, 'p1'),
      score('side-b', 2, 4, 'p2'),
      score('side-a', 3, 6, 'p1'),
      score('side-b', 3, 4, 'p2'),
    ]);
    expect(outcome.leaderSideId).toBe('side-b');
    expect(outcome.up).toBe(1);
  });

  it('treats a picked-up ball as losing the hole', () => {
    const outcome = run([score('side-a', 1, 5, 'p1'), score('side-b', 1, null, 'p2', true)]);
    expect(outcome.holes[0].complete).toBe(true);
    expect(outcome.holes[0].winnerSideId).toBe('side-a');
  });

  it('halves the hole when both sides pick up', () => {
    const outcome = run([
      score('side-a', 1, null, 'p1', true),
      score('side-b', 1, null, 'p2', true),
    ]);
    expect(outcome.holes[0].halved).toBe(true);
    expect(outcome.holesPlayed).toBe(1);
  });

  it('closes out a match 3&2 and stops counting', () => {
    const scores: Score[] = [];
    // Side A wins holes 1-3, halves 4-6... needs 3 up with 2 to play => after 16.
    for (let hole = 1; hole <= 16; hole++) {
      const aWins = hole <= 3;
      scores.push(score('side-a', hole, aWins ? 4 : 4, 'p1'));
      scores.push(score('side-b', hole, aWins ? 5 : 4, 'p2'));
    }
    const outcome = run(scores);
    expect(outcome.isComplete).toBe(true);
    expect(outcome.winnerSideId).toBe('side-a');
    expect(outcome.finalStatus).toBe('3&2');
    expect(outcome.decidedOnHole).toBe(16);
    expect(outcome.points['side-a']).toBe(1);
    expect(outcome.points['side-b']).toBe(0);
  });

  it('reports a one-hole win on the 18th as "1 UP"', () => {
    const scores: Score[] = [];
    for (let hole = 1; hole <= 18; hole++) {
      const aWins = hole === 18;
      scores.push(score('side-a', hole, aWins ? 4 : 4, 'p1'));
      scores.push(score('side-b', hole, aWins ? 5 : 4, 'p2'));
    }
    const outcome = run(scores);
    expect(outcome.isComplete).toBe(true);
    expect(outcome.finalStatus).toBe('1 UP');
    expect(outcome.decidedOnHole).toBe(18);
  });

  it('halves the match when all square after 18', () => {
    const scores: Score[] = [];
    for (let hole = 1; hole <= 18; hole++) {
      scores.push(score('side-a', hole, 4, 'p1'));
      scores.push(score('side-b', hole, 4, 'p2'));
    }
    const outcome = run(scores);
    expect(outcome.isComplete).toBe(true);
    expect(outcome.winnerSideId).toBeNull();
    expect(outcome.finalStatus).toBe('Halved');
    expect(outcome.points['side-a']).toBe(0.5);
    expect(outcome.points['side-b']).toBe(0.5);
  });

  it('flags dormie', () => {
    const scores: Score[] = [];
    for (let hole = 1; hole <= 16; hole++) {
      const aWins = hole <= 2;
      scores.push(score('side-a', hole, 4, 'p1'));
      scores.push(score('side-b', hole, aWins ? 5 : 4, 'p2'));
    }
    const outcome = run(scores);
    expect(outcome.up).toBe(2);
    expect(outcome.holesRemaining).toBe(2);
    expect(outcome.isDormie).toBe(true);
    expect(outcome.isComplete).toBe(false);
  });

  it('does not advance the status past a hole that has not been scored', () => {
    // Hole 2 is missing; hole 3 is filled in.
    const outcome = run([
      score('side-a', 1, 4, 'p1'),
      score('side-b', 1, 5, 'p2'),
      score('side-a', 3, 4, 'p1'),
      score('side-b', 3, 5, 'p2'),
    ]);
    expect(outcome.holesPlayed).toBe(1);
    expect(outcome.up).toBe(1);
    // The out-of-order hole still counts for the stats.
    expect(outcome.holesWon['side-a']).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Six-hole matches (Day 3)
// ---------------------------------------------------------------------------

describe('six-hole matches', () => {
  const players = [player('p1', 'team-a', null), player('p2', 'team-b', null)];

  it('runs holes 7-12 and finishes on the 12th', () => {
    const scores: Score[] = [];
    for (let hole = 7; hole <= 12; hole++) {
      const aWins = hole === 7;
      scores.push(score('side-a', hole, 4, 'p1'));
      scores.push(score('side-b', hole, aWins ? 5 : 4, 'p2'));
    }
    const outcome = computeMatch({
      match: match({ format: 'singles', startHole: 7, endHole: 12 }),
      sides: sides(['p1'], ['p2']),
      players,
      holes: HOLES,
      tee: TEE,
      scores,
      settings: SCRATCH,
    });
    expect(outcome.totalHoles).toBe(6);
    expect(outcome.holes[0].holeNo).toBe(7);
    expect(outcome.isComplete).toBe(true);
    expect(outcome.finalStatus).toBe('1 UP');
    expect(outcome.decidedOnHole).toBe(12);
  });

  it('closes out a six-hole match 3&2 on the 16th of an H13-18 match', () => {
    const scores: Score[] = [];
    for (let hole = 13; hole <= 16; hole++) {
      const aWins = hole <= 15;
      scores.push(score('side-a', hole, 4, 'p1'));
      scores.push(score('side-b', hole, aWins ? 5 : 4, 'p2'));
    }
    const outcome = computeMatch({
      match: match({ format: 'singles', startHole: 13, endHole: 18 }),
      sides: sides(['p1'], ['p2']),
      players,
      holes: HOLES,
      tee: TEE,
      scores,
      settings: SCRATCH,
    });
    expect(outcome.isComplete).toBe(true);
    expect(outcome.finalStatus).toBe('3&2');
    expect(outcome.decidedOnHole).toBe(16);
  });
});

// ---------------------------------------------------------------------------
// Better ball
// ---------------------------------------------------------------------------

describe('better ball', () => {
  const players = [
    player('a1', 'team-a', 8),
    player('a2', 'team-a', 18),
    player('b1', 'team-b', 4),
    player('b2', 'team-b', 12),
  ];

  function run(scores: Score[], settings: TourSettings = SCRATCH) {
    return computeMatch({
      match: match({ format: 'better_ball' }),
      sides: sides(['a1', 'a2'], ['b1', 'b2']),
      players,
      holes: HOLES,
      tee: TEE,
      scores,
      settings,
    });
  }

  it('counts the lower net ball on the hole', () => {
    const outcome = run([
      score('side-a', 1, 6, 'a1'),
      score('side-a', 1, 4, 'a2'),
      score('side-b', 1, 5, 'b1'),
      score('side-b', 1, 5, 'b2'),
    ]);
    expect(outcome.holes[0].sides[0].net).toBe(4);
    expect(outcome.holes[0].sides[1].net).toBe(5);
    expect(outcome.holes[0].winnerSideId).toBe('side-a');
    const counting = outcome.holes[0].sides[0].balls.find((b) => b.counts);
    expect(counting?.playerId).toBe('a2');
  });

  it('settles the hole as soon as one ball is in', () => {
    const outcome = run([score('side-a', 1, 4, 'a1'), score('side-b', 1, 5, 'b1')]);
    expect(outcome.holes[0].complete).toBe(true);
    expect(outcome.holes[0].winnerSideId).toBe('side-a');
  });

  it('loses the hole when both partners pick up', () => {
    const outcome = run([
      score('side-a', 1, null, 'a1', true),
      score('side-a', 1, null, 'a2', true),
      score('side-b', 1, 6, 'b1'),
    ]);
    expect(outcome.holes[0].sides[0].noScore).toBe(true);
    expect(outcome.holes[0].winnerSideId).toBe('side-b');
  });

  it('applies strokes received off the low player in the match', () => {
    const outcome = run([], DEFAULT_TOUR_SETTINGS);
    // Course handicaps at 90%: a1 8 -> CH 8*130/113 - 1 = 8.20 -> 8, x0.9 = 7.2 -> 7
    //                          b1 4 -> CH 4*130/113 - 1 = 3.60 -> 4, x0.9 = 3.6 -> 4
    // Lowest in the match is b1 on 4, so everyone plays off the difference.
    expect(outcome.handicaps['side-b'].playerPlayingHandicaps['b1']).toBe(0);
    expect(outcome.handicaps['side-a'].playerPlayingHandicaps['a1']).toBe(3);
    // a2 (18) gets the most strokes of anyone.
    expect(outcome.handicaps['side-a'].playerPlayingHandicaps['a2']).toBeGreaterThan(
      outcome.handicaps['side-a'].playerPlayingHandicaps['a1'],
    );
  });

  it('nets the score using the strokes received on that hole', () => {
    const outcome = run(
      [
        score('side-a', 1, 5, 'a1'), // SI 1: a1 gets a stroke -> net 4
        score('side-b', 1, 4, 'b1'), // scratch -> net 4
      ],
      DEFAULT_TOUR_SETTINGS,
    );
    expect(outcome.holes[0].sides[0].strokesReceived).toBe(1);
    expect(outcome.holes[0].sides[0].net).toBe(4);
    expect(outcome.holes[0].halved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Shared-ball formats
// ---------------------------------------------------------------------------

describe('team scramble', () => {
  const players = [
    player('a1', 'team-a', 6),
    player('a2', 'team-a', 12),
    player('a3', 'team-a', 18),
    player('a4', 'team-a', 24),
    player('b1', 'team-b', 8),
    player('b2', 'team-b', 10),
    player('b3', 'team-b', 16),
    player('b4', 'team-b', 20),
  ];

  function run(scores: Score[], settings: TourSettings = SCRATCH) {
    return computeMatch({
      match: match({ format: 'team_scramble' }),
      sides: sides(['a1', 'a2', 'a3', 'a4'], ['b1', 'b2', 'b3', 'b4']),
      players,
      holes: HOLES,
      tee: TEE,
      scores,
      settings,
    });
  }

  it('takes one score per side per hole', () => {
    const outcome = run([score('side-a', 1, 4), score('side-b', 1, 5)]);
    expect(outcome.holes[0].sides[0].balls).toHaveLength(1);
    expect(outcome.holes[0].sides[0].balls[0].playerId).toBeNull();
    expect(outcome.holes[0].winnerSideId).toBe('side-a');
  });

  it('gives the higher-handicap team the difference in strokes', () => {
    const outcome = run([], DEFAULT_TOUR_SETTINGS);
    const a = outcome.handicaps['side-a'].playingHandicap;
    const b = outcome.handicaps['side-b'].playingHandicap;
    // One side must be off scratch in difference mode.
    expect(Math.min(a, b)).toBe(0);
    expect(Math.max(a, b)).toBeGreaterThanOrEqual(0);
  });
});

describe('foursomes', () => {
  const players = [
    player('a1', 'team-a', 10),
    player('a2', 'team-a', 16),
    player('b1', 'team-b', 6),
    player('b2', 'team-b', 8),
  ];

  it('plays one ball per side with a 50% combined allowance', () => {
    const outcome = computeMatch({
      match: match({ format: 'foursomes', startHole: 13, endHole: 18 }),
      sides: sides(['a1', 'a2'], ['b1', 'b2']),
      players,
      holes: HOLES,
      tee: TEE,
      scores: [score('side-a', 13, 5), score('side-b', 13, 4)],
      settings: DEFAULT_TOUR_SETTINGS,
    });
    expect(outcome.totalHoles).toBe(6);
    expect(outcome.holes[0].sides[0].balls).toHaveLength(1);
    // A pair on 10+16 gets shots from a pair on 6+8.
    expect(outcome.handicaps['side-a'].playingHandicap).toBeGreaterThan(0);
    expect(outcome.handicaps['side-b'].playingHandicap).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Points and standings
// ---------------------------------------------------------------------------

describe('standings', () => {
  const players = [player('p1', 'team-a', null), player('p2', 'team-b', null)];

  function completedMatch(id: string, winner: 'a' | 'b' | 'half') {
    const scores: Score[] = [];
    for (let hole = 1; hole <= 18; hole++) {
      let aScore = 4;
      let bScore = 4;
      if (winner === 'a' && hole === 1) bScore = 5;
      if (winner === 'b' && hole === 1) aScore = 5;
      scores.push({ ...score('side-a', hole, aScore, 'p1'), matchId: id });
      scores.push({ ...score('side-b', hole, bScore, 'p2'), matchId: id });
    }
    return computeMatch({
      match: match({ id, format: 'singles' }),
      sides: sides(['p1'], ['p2']).map((s) => ({ ...s, matchId: id })),
      players,
      holes: HOLES,
      tee: TEE,
      scores,
      settings: SCRATCH,
    });
  }

  it('adds up team points across matches', () => {
    const outcomes = [
      completedMatch('m1', 'a'),
      completedMatch('m2', 'a'),
      completedMatch('m3', 'b'),
      completedMatch('m4', 'half'),
    ];
    const sidesByMatch = new Map(
      outcomes.map((o) => [o.matchId, sides(['p1'], ['p2']).map((s) => ({ ...s, matchId: o.matchId }))]),
    );
    const standings = computeStandings(outcomes, sidesByMatch, ['team-a', 'team-b']);
    expect(standings.byTeam['team-a'].points).toBe(2.5);
    expect(standings.byTeam['team-b'].points).toBe(1.5);
    expect(standings.byTeam['team-a'].matchesWon).toBe(2);
    expect(standings.byTeam['team-a'].matchesHalved).toBe(1);
    expect(standings.byTeam['team-a'].matchesLost).toBe(1);
    expect(standings.pointsTotal).toBe(4);
    expect(standings.pointsRemaining).toBe(0);
    expect(standings.pointsToWin).toBe(2.5);
    expect(standings.leaderTeamId).toBe('team-a');
  });

  it('projects in-progress matches to the current leader', () => {
    const live = computeMatch({
      match: match({ id: 'm5', format: 'singles' }),
      sides: sides(['p1'], ['p2']).map((s) => ({ ...s, matchId: 'm5' })),
      players,
      holes: HOLES,
      tee: TEE,
      scores: [
        { ...score('side-a', 1, 4, 'p1'), matchId: 'm5' },
        { ...score('side-b', 1, 5, 'p2'), matchId: 'm5' },
      ],
      settings: SCRATCH,
    });
    expect(live.points['side-a']).toBe(0);
    expect(live.projectedPoints['side-a']).toBe(1);
    expect(live.projectedPoints['side-b']).toBe(0);

    const sidesByMatch = new Map([['m5', sides(['p1'], ['p2']).map((s) => ({ ...s, matchId: 'm5' }))]]);
    const standings = computeStandings([live], sidesByMatch, ['team-a', 'team-b']);
    expect(standings.byTeam['team-a'].points).toBe(0);
    expect(standings.byTeam['team-a'].projectedPoints).toBe(1);
    expect(standings.pointsRemaining).toBe(1);
  });

  it('honours configurable point values', () => {
    const settings: TourSettings = { ...SCRATCH, pointsPerWin: 2, pointsPerHalf: 1 };
    const scores: Score[] = [];
    for (let hole = 1; hole <= 18; hole++) {
      scores.push(score('side-a', hole, 4, 'p1'));
      scores.push(score('side-b', hole, 4, 'p2'));
    }
    const outcome = computeMatch({
      match: match({ format: 'singles', pointsValue: 2 }),
      sides: sides(['p1'], ['p2']),
      players,
      holes: HOLES,
      tee: TEE,
      scores,
      settings,
    });
    expect(outcome.finalStatus).toBe('Halved');
    expect(outcome.points['side-a']).toBe(1);
    expect(outcome.points['side-b']).toBe(1);
  });
});
