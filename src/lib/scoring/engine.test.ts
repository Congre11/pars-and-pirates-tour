import { describe, expect, it } from 'vitest';
import { computeMatch, computeStandings, shortStatus } from './engine';
import { courseHandicap, sidePlayingHandicap, strokesForHoles, strokesOnHole } from './handicap';
import {
  DEFAULT_TOUR_SETTINGS,
  FIXED_ALLOWANCES,
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
  distanceUnit: 'yards',
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
    isOrganiser: false,
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
    allowanceOverride: null,
    pairingsConfirmedAt: null,
    pairingsConfirmedBy: null,
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
    // Better ball is played off 100% of each player's course handicap:
    //   a1 8  -> 8*130/113 - 1 = 8.20  -> 8
    //   b1 4  -> 4*130/113 - 1 = 3.60  -> 4
    // Lowest in the match is b1 on 4, so everyone plays off the difference.
    expect(outcome.handicaps['side-b'].playerPlayingHandicaps['b1']).toBe(0);
    expect(outcome.handicaps['side-a'].playerPlayingHandicaps['a1']).toBe(4);
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

describe('per-match handicap allowance', () => {
  // Two players a side, so the allowance has something to bite on.
  const players = [
    player('a1', 'team-a', 4),
    player('a2', 'team-a', 20),
    player('b1', 'team-b', 6),
    player('b2', 'team-b', 8),
  ];

  // Foursomes, because the override only applies to formats WITHOUT a fixed
  // tournament rule. Scramble, shamble, better ball and singles ignore it —
  // see 'the four fixed allowances ignore stored settings' below.
  function run(allowanceOverride: Match['allowanceOverride']) {
    return computeMatch({
      match: match({ format: 'foursomes', allowanceOverride }),
      sides: sides(['a1', 'a2'], ['b1', 'b2']),
      players,
      holes: HOLES,
      tee: TEE,
      scores: [],
      settings: DEFAULT_TOUR_SETTINGS,
    });
  }

  // On this tee the indexes above convert to course handicaps 4, 22, 6 and 8.
  it('uses the tour default for the format when no override is set', () => {
    const outcome = run(null);
    // WHS foursomes is 50% of the combined total:
    //   (4 + 22) / 2 = 13;  (6 + 8) / 2 = 7.
    // Difference mode: the lower side plays off scratch.
    expect(outcome.handicaps['side-a'].rawPlayingHandicap).toBe(13);
    expect(outcome.handicaps['side-b'].rawPlayingHandicap).toBe(7);
    expect(outcome.handicaps['side-a'].playingHandicap).toBe(6);
    expect(outcome.handicaps['side-b'].playingHandicap).toBe(0);
  });

  it("applies the match's own allowance instead when one is set", () => {
    // Full combined handicaps rather than half.
    const outcome = run({ weights: [1, 1], rounding: 'nearest' });
    expect(outcome.handicaps['side-a'].rawPlayingHandicap).toBe(26);
    expect(outcome.handicaps['side-b'].rawPlayingHandicap).toBe(14);
    expect(outcome.handicaps['side-a'].playingHandicap).toBe(12);
    expect(outcome.handicaps['side-b'].playingHandicap).toBe(0);
  });

  it('changes the strokes actually received, not just the label', () => {
    const standard = run(null);
    const custom = run({ weights: [1, 1], rounding: 'nearest' });
    const strokesOn = (outcome: ReturnType<typeof run>, holeNo: number) =>
      outcome.sideStrokes['side-a'][holeNo];

    // Off 6 shots, side A gets a stroke on the six hardest holes only.
    expect(strokesOn(standard, 6)).toBe(1);
    expect(strokesOn(standard, 7)).toBe(0);
    // Off 12, it gets a stroke on SI 1-12.
    expect(strokesOn(custom, 1)).toBe(1);
    expect(strokesOn(custom, 12)).toBe(1);
    expect(strokesOn(custom, 13)).toBe(0);
  });

  it("honours the override's rounding rule", () => {
    const down = run({ weights: [0.5, 0.4], rounding: 'floor' });
    const up = run({ weights: [0.5, 0.4], rounding: 'ceil' });
    // 0.5*6 + 0.4*8 = 6.2 for side B.
    expect(down.handicaps['side-b'].rawPlayingHandicap).toBe(6);
    expect(up.handicaps['side-b'].rawPlayingHandicap).toBe(7);
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

// ---------------------------------------------------------------------------
// Handicaps as the organiser specified them
// ---------------------------------------------------------------------------

/** A six-hole block whose stroke indexes are scattered across the full card. */
const BLOCK: Hole[] = [5, 11, 15, 17, 1, 9].map((strokeIndex, i) => ({
  id: `block-${i + 1}`,
  courseId: 'course-1',
  holeNo: i + 1,
  par: 4,
  strokeIndex,
  yardages: { 'tee-1': 400 },
}));

describe('strokesForHoles', () => {
  it('gives out every stroke owed across a six-hole block', () => {
    // The bug this replaced: allocating by raw stroke index over six holes
    // only handed out the shots whose SI happened to be 1..6, so a player
    // owed 8 received 2. The full difference has to fall on the holes being
    // played, ranked by their own stroke index within the block.
    const allocation = strokesForHoles(8, BLOCK);
    expect(Object.values(allocation).reduce((a, b) => a + b, 0)).toBe(8);
    // Ranked within the block, SI 1 and SI 5 are the two hardest, so they take
    // the two extra shots on top of one each.
    expect(allocation).toEqual({ 1: 2, 2: 1, 3: 1, 4: 1, 5: 2, 6: 1 });
  });

  it('hands the single stroke to the hardest hole actually being played', () => {
    // SI 1 is hole 5 in this block. Allocating over 18 would give the stroke
    // to whichever hole carried SI 1 on the full card — here, the same hole,
    // but only by construction. Rank is what makes it reliable.
    expect(strokesForHoles(1, BLOCK)).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 1, 6: 0 });
  });

  it('gives nothing to anybody off scratch', () => {
    expect(Object.values(strokesForHoles(0, BLOCK)).every((n) => n === 0)).toBe(true);
  });

  it('reverses for a plus handicap, taking shots off the easiest holes', () => {
    // A plus-2 player gives shots back, and gives them back on the easiest
    // holes in the block: ranks 6 and 5, which are SI 17 (hole 4) and SI 15
    // (hole 3).
    expect(strokesForHoles(-2, BLOCK)).toEqual({ 1: 0, 2: 0, 3: -1, 4: -1, 5: 0, 6: 0 });
  });

  it('is a no-op on an empty hole list', () => {
    expect(strokesForHoles(10, [])).toEqual({});
  });
});

describe('team handicaps for scramble and shamble', () => {
  // Index 12.0 off this tee is CH 13; index 20.0 is CH 22; index 6.0 is CH 6.
  const players = [
    player('p1', 'team-a', 12.0),
    player('p2', 'team-a', 20.0),
    player('p3', 'team-b', 6.0),
    player('p4', 'team-b', 6.0),
  ];

  it('averages the pair and rounds down, then plays off the difference', () => {
    const outcome = computeMatch({
      match: match({ format: 'two_man_scramble' }),
      sides: sides(['p1', 'p2'], ['p3', 'p4']),
      players,
      holes: HOLES,
      tee: TEE,
      scores: [],
      settings: DEFAULT_TOUR_SETTINGS,
    });

    // floor((13 + 22) / 2) = 17 against floor((6 + 6) / 2) = 6.
    expect(outcome.teamHandicaps['side-a']).toBe(17);
    expect(outcome.teamHandicaps['side-b']).toBe(6);
    // The lower pair play off zero; the higher receive the difference.
    expect(outcome.handicaps['side-b'].playingHandicap).toBe(0);
    expect(outcome.handicaps['side-a'].playingHandicap).toBe(11);
  });

  it('nets both shamble balls against the one team handicap', () => {
    // A shamble records two scores per side but the pair still play off a
    // single combined handicap, so both balls get the same strokes.
    const outcome = computeMatch({
      match: match({ format: 'shamble' }),
      sides: sides(['p1', 'p2'], ['p3', 'p4']),
      players,
      holes: HOLES,
      tee: TEE,
      scores: [],
      settings: DEFAULT_TOUR_SETTINGS,
    });

    expect(outcome.teamHandicaps['side-a']).toBe(17);
    expect(outcome.playerStrokes['p1']).toEqual(outcome.sideStrokes['side-a']);
    expect(outcome.playerStrokes['p2']).toEqual(outcome.sideStrokes['side-a']);
  });
});

describe('better ball is played off full course handicaps', () => {
  const players = [
    player('p1', 'team-a', 12.0), // CH 13
    player('p2', 'team-a', 20.0), // CH 22
    player('p3', 'team-b', 6.0), // CH 6
    player('p4', 'team-b', 18.0), // CH 20
  ];

  it('gives every player 100% of their own handicap, off the lowest in the match', () => {
    const outcome = computeMatch({
      match: match({ format: 'better_ball' }),
      sides: sides(['p1', 'p2'], ['p3', 'p4']),
      players,
      holes: HOLES,
      tee: TEE,
      scores: [],
      settings: DEFAULT_TOUR_SETTINGS,
    });

    // No allowance is taken off: 100% means the course handicap itself.
    const a = outcome.handicaps['side-a'];
    const b = outcome.handicaps['side-b'];
    expect(a.courseHandicaps).toEqual({ p1: 13, p2: 22 });
    expect(b.courseHandicaps).toEqual({ p3: 6, p4: 20 });

    // p3 is the lowest of the four, so plays off zero and the other three
    // receive the difference from him.
    expect(b.playerPlayingHandicaps.p3).toBe(0);
    expect(a.playerPlayingHandicaps.p1).toBe(7);
    expect(a.playerPlayingHandicaps.p2).toBe(16);
    expect(b.playerPlayingHandicaps.p4).toBe(14);

    // Each plays their own ball, so nobody shares a side handicap.
    expect(outcome.teamHandicaps['side-a']).toBeNull();
    expect(outcome.teamHandicaps['side-b']).toBeNull();
  });

  it('takes the lowest from within this match, not the whole field', () => {
    // Same four players, but p3 is not in this match. p1 becomes the lowest.
    const outcome = computeMatch({
      match: match({ format: 'better_ball' }),
      sides: sides(['p1', 'p2'], ['p4', 'p4']),
      players,
      holes: HOLES,
      tee: TEE,
      scores: [],
      settings: DEFAULT_TOUR_SETTINGS,
    });
    expect(outcome.handicaps['side-a'].playerPlayingHandicaps.p1).toBe(0);
    expect(outcome.handicaps['side-a'].playerPlayingHandicaps.p2).toBe(9);
    expect(outcome.handicaps['side-b'].playerPlayingHandicaps.p4).toBe(7);
  });
});

describe('singles is played off full course handicaps', () => {
  it('puts the lower player off zero and gives the higher the difference', () => {
    const players = [player('p1', 'team-a', 12.0), player('p2', 'team-b', 20.0)];
    const outcome = computeMatch({
      match: match({ format: 'singles' }),
      sides: sides(['p1'], ['p2']),
      players,
      holes: HOLES,
      tee: TEE,
      scores: [],
      settings: DEFAULT_TOUR_SETTINGS,
    });
    // CH 13 against CH 22.
    expect(outcome.handicaps['side-a'].playerPlayingHandicaps.p1).toBe(0);
    expect(outcome.handicaps['side-b'].playerPlayingHandicaps.p2).toBe(9);
  });
});

describe('a six-hole match allocates over its own holes', () => {
  it('gives the full difference out between holes 13 and 18', () => {
    const players = [player('p1', 'team-a', 12.0), player('p2', 'team-b', 20.0)];
    const outcome = computeMatch({
      match: match({ format: 'singles', startHole: 13, endHole: 18 }),
      sides: sides(['p1'], ['p2']),
      players,
      holes: HOLES,
      tee: TEE,
      scores: [],
      settings: DEFAULT_TOUR_SETTINGS,
    });

    // p2 is owed 9 over six holes. On this card holes 13..18 carry SI 13..18,
    // so allocating by raw stroke index would have given him nothing at all.
    const strokes = outcome.playerStrokes.p2;
    expect(Object.keys(strokes).map(Number).sort((a, b) => a - b)).toEqual([13, 14, 15, 16, 17, 18]);
    expect(Object.values(strokes).reduce((a, b) => a + b, 0)).toBe(9);
    // Six holes, nine shots: everyone gets one and the three hardest get two.
    expect(strokes).toEqual({ 13: 2, 14: 2, 15: 2, 16: 1, 17: 1, 18: 1 });
  });
});

// ---------------------------------------------------------------------------
// Fixed allowances: a stored setting must not be able to change these
// ---------------------------------------------------------------------------

describe('the four fixed allowances ignore stored settings', () => {
  const players = [
    player('a1', 'team-a', 12.0), // CH 13
    player('a2', 'team-a', 20.0), // CH 22
    player('b1', 'team-b', 6.0), // CH 6
    player('b2', 'team-b', 6.0), // CH 6
  ];

  /** A settings record carrying the SUPERSEDED allowances. */
  const STALE: TourSettings = {
    ...DEFAULT_TOUR_SETTINGS,
    allowances: {
      ...DEFAULT_TOUR_SETTINGS.allowances,
      two_man_scramble: { weights: [0.35, 0.15], rounding: 'nearest' },
      shamble: { weights: [0.9], rounding: 'nearest' },
      better_ball: { weights: [0.9], rounding: 'nearest' },
      singles: { weights: [0.9], rounding: 'nearest' },
    },
  };

  const run = (format: Match['format'], settings: TourSettings, allowanceOverride = null) =>
    computeMatch({
      match: match({ format, allowanceOverride }),
      sides: sides(['a1', 'a2'], ['b1', 'b2']),
      players,
      holes: HOLES,
      tee: TEE,
      scores: [],
      settings,
    });

  it('scrambles off floor((CH1 + CH2) / 2) even when the record says 35/15', () => {
    // 35% of 13 + 15% of 22 would be 8; the rule gives floor(35/2) = 17.
    expect(run('two_man_scramble', STALE).teamHandicaps['side-a']).toBe(17);
    expect(run('two_man_scramble', STALE).teamHandicaps['side-b']).toBe(6);
  });

  it('shambles off the same rule even when the record says 90%', () => {
    // 90% of the combined 35 would be 32.
    expect(run('shamble', STALE).teamHandicaps['side-a']).toBe(17);
  });

  it('plays better ball off 100% even when the record says 90%', () => {
    const outcome = run('better_ball', STALE);
    // At 90% a1 would be 12 and a2 20, off a lowest of 5 -> 7 and 15.
    expect(outcome.handicaps['side-a'].playerPlayingHandicaps.a1).toBe(7);
    expect(outcome.handicaps['side-a'].playerPlayingHandicaps.a2).toBe(16);
    expect(outcome.handicaps['side-b'].playerPlayingHandicaps.b1).toBe(0);
  });

  it('plays singles off 100% even when the record says 90%', () => {
    const outcome = computeMatch({
      match: match({ format: 'singles' }),
      sides: sides(['a1'], ['b1']),
      players,
      holes: HOLES,
      tee: TEE,
      scores: [],
      settings: STALE,
    });
    // 13 against 6 at 100%; at 90% it would be 12 against 5, so still 7 —
    // check the raw course handicaps too so the numbers cannot coincide.
    expect(outcome.handicaps['side-a'].courseHandicaps.a1).toBe(13);
    expect(outcome.handicaps['side-a'].playerPlayingHandicaps.a1).toBe(7);
    expect(outcome.handicaps['side-b'].playerPlayingHandicaps.b1).toBe(0);
  });

  it('ignores a per-match override on a fixed format too', () => {
    // An override is persisted data and carries the same risk as a setting.
    const overridden = run('two_man_scramble', DEFAULT_TOUR_SETTINGS, {
      weights: [1, 1],
      rounding: 'nearest',
    } as never);
    expect(overridden.teamHandicaps['side-a']).toBe(17);
  });

  it('still honours the setting for a format with no fixed rule', () => {
    // team_scramble is unused by this tour, so it stays editable.
    const tweaked: TourSettings = {
      ...DEFAULT_TOUR_SETTINGS,
      allowances: {
        ...DEFAULT_TOUR_SETTINGS.allowances,
        foursomes: { weights: [1, 1], rounding: 'nearest' },
      },
    };
    expect(run('foursomes', tweaked).teamHandicaps['side-a']).toBe(35);
    expect(run('foursomes', DEFAULT_TOUR_SETTINGS).teamHandicaps['side-a']).toBe(18);
  });

  it('keeps the seeded defaults in step with the fixed rules', () => {
    // The defaults are still written to the database for the tour row. If they
    // drifted from FIXED_ALLOWANCES the Rules screen would show one number
    // while the engine applied another.
    for (const [format, fixed] of Object.entries(FIXED_ALLOWANCES)) {
      expect(DEFAULT_TOUR_SETTINGS.allowances[format as Match['format']]).toEqual(fixed);
    }
  });
});
