import { describe, expect, it } from 'vitest';
import { buildSeedSnapshot } from './tour';
import { computeMatch, computeStandings } from '@/lib/scoring/engine';
import type { MatchOutcome } from '@/lib/scoring/engine';

/**
 * Locks the tournament points structure and the supplied handicap indexes.
 *
 * These numbers were specified exactly by the organiser, so a change to the
 * seed that silently alters them should fail the build rather than surface as
 * a wrong scoreboard mid-tour.
 */

const snapshot = buildSeedSnapshot();

describe('tournament points structure', () => {
  const byDay = (dayNo: number) => {
    const round = snapshot.rounds.find((r) => r.dayNo === dayNo)!;
    return snapshot.matches.filter((m) => m.roundId === round.id);
  };

  const pointsFor = (dayNo: number) =>
    byDay(dayNo).reduce((sum, m) => sum + m.pointsValue, 0);

  it('Day 1 is one 4-man scramble worth 2 points', () => {
    const matches = byDay(1);
    expect(matches).toHaveLength(1);
    expect(matches[0].format).toBe('team_scramble');
    expect(matches[0].pointsValue).toBe(2);
  });

  it('Day 2 is two better-ball matches worth 1 point each', () => {
    const matches = byDay(2);
    expect(matches).toHaveLength(2);
    expect(matches.every((m) => m.format === 'better_ball')).toBe(true);
    expect(matches.every((m) => m.pointsValue === 1)).toBe(true);
    expect(pointsFor(2)).toBe(2);
  });

  it('Day 3 is 4 singles at 0.25, 2 scrambles at 0.5 and 2 alternate shots at 0.5', () => {
    const matches = byDay(3);
    expect(matches).toHaveLength(8);

    const singles = matches.filter((m) => m.format === 'singles');
    expect(singles).toHaveLength(4);
    expect(singles.every((m) => m.pointsValue === 0.25)).toBe(true);
    expect(singles.every((m) => m.startHole === 1 && m.endHole === 6)).toBe(true);

    const scrambles = matches.filter((m) => m.format === 'two_man_scramble');
    expect(scrambles).toHaveLength(2);
    expect(scrambles.every((m) => m.pointsValue === 0.5)).toBe(true);
    expect(scrambles.every((m) => m.startHole === 7 && m.endHole === 12)).toBe(true);

    const foursomes = matches.filter((m) => m.format === 'foursomes');
    expect(foursomes).toHaveLength(2);
    expect(foursomes.every((m) => m.pointsValue === 0.5)).toBe(true);
    expect(foursomes.every((m) => m.startHole === 13 && m.endHole === 18)).toBe(true);

    expect(pointsFor(3)).toBe(3);
  });

  it('Day 4 is four singles worth 1 point each', () => {
    const matches = byDay(4);
    expect(matches).toHaveLength(4);
    expect(matches.every((m) => m.format === 'singles')).toBe(true);
    expect(pointsFor(4)).toBe(4);
  });

  it('the whole tour is worth exactly 11 points', () => {
    const total = snapshot.matches.reduce((sum, m) => sum + m.pointsValue, 0);
    expect(total).toBe(11);
  });

  it('the engine agrees that 11 points are on offer, and 6 wins the tour', () => {
    const outcomes: MatchOutcome[] = snapshot.matches.map((match) => {
      const round = snapshot.rounds.find((r) => r.id === match.roundId)!;
      return computeMatch({
        match,
        sides: snapshot.sides.filter((s) => s.matchId === match.id),
        players: snapshot.players,
        holes: snapshot.holes.filter((h) => h.courseId === round.courseId),
        tee: snapshot.tees.find((t) => t.id === round.teeId)!,
        scores: [],
        settings: snapshot.tour.settings,
      });
    });

    const sidesByMatch = new Map(
      snapshot.matches.map((m) => [m.id, snapshot.sides.filter((s) => s.matchId === m.id)]),
    );
    const standings = computeStandings(
      outcomes,
      sidesByMatch,
      snapshot.teams.map((t) => t.id),
    );

    expect(standings.pointsTotal).toBe(11);
    expect(standings.pointsRemaining).toBe(11);
    expect(standings.pointsToWin).toBe(6);
  });

  it('halves each match at exactly half its value', () => {
    const round = snapshot.rounds.find((r) => r.dayNo === 3)!;
    const match = snapshot.matches.find(
      (m) => m.roundId === round.id && m.format === 'singles',
    )!;
    const sides = snapshot.sides.filter((s) => s.matchId === match.id);
    const holes = snapshot.holes.filter((h) => h.courseId === round.courseId);

    // Halve every hole in the 6-hole match by giving both sides the same gross
    // with handicaps switched off.
    const scores = holes
      .filter((h) => h.holeNo >= match.startHole && h.holeNo <= match.endHole)
      .flatMap((hole) =>
        sides.map((side) => ({
          id: `${side.id}-${hole.holeNo}`,
          matchId: match.id,
          holeNo: hole.holeNo,
          sideId: side.id,
          playerId: side.playerIds[0],
          gross: hole.par,
          pickedUp: false,
          enteredBy: 'test',
          updatedAt: '2026-09-01T12:00:00.000Z',
        })),
      );

    const outcome = computeMatch({
      match,
      sides,
      players: snapshot.players,
      holes,
      tee: snapshot.tees.find((t) => t.id === round.teeId)!,
      scores,
      settings: { ...snapshot.tour.settings, handicapsEnabled: false },
    });

    expect(outcome.finalStatus).toBe('Halved');
    // 0.25-point match halved = 0.125 each, exactly as specified.
    expect(outcome.points[sides[0].id]).toBe(0.125);
    expect(outcome.points[sides[1].id]).toBe(0.125);
  });
});

describe('seeded handicap indexes', () => {
  const expected: Record<string, number> = {
    'Jason Dunbar': 11.3,
    'Andrew Rushmere': 4.0,
    'Alan Hector': 22.0,
    'Ryan Dahl': 8.8,
    'Jordy West': 9.6,
    'Connor Grealy': 9.3,
    'Nick Georgoulakis': 15.9,
    'Dan Kramer': 15.0,
  };

  it('seeds all eight indexes exactly as supplied', () => {
    expect(snapshot.players).toHaveLength(8);
    for (const [name, index] of Object.entries(expected)) {
      const player = snapshot.players.find((p) => p.name === name);
      expect(player, `${name} missing from the seed`).toBeDefined();
      expect(player!.handicapIndex).toBe(index);
    }
  });

  it('records them as manually entered, not HNA-synced', () => {
    for (const player of snapshot.players) {
      expect(player.handicapSource).toBe('manual');
      expect(player.handicapUpdatedAt).not.toBeNull();
    }
  });

  it('treats them as indexes, converting to a different course handicap per tee', () => {
    const round = snapshot.rounds.find((r) => r.dayNo === 1)!;
    const tee = snapshot.tees.find((t) => t.id === round.teeId)!;
    const match = snapshot.matches.find((m) => m.roundId === round.id)!;

    const outcome = computeMatch({
      match,
      sides: snapshot.sides.filter((s) => s.matchId === match.id),
      players: snapshot.players,
      holes: snapshot.holes.filter((h) => h.courseId === round.courseId),
      tee,
      scores: [],
      settings: snapshot.tour.settings,
    });

    // Alan plays off 22.0 but his course handicap is not 22 — it is the index
    // run through slope, rating and par.
    const alan = snapshot.players.find((p) => p.name === 'Alan Hector')!;
    const side = snapshot.sides.find(
      (s) => s.matchId === match.id && s.playerIds.includes(alan.id),
    )!;
    const courseHandicap = outcome.handicaps[side.id].courseHandicaps[alan.id];
    expect(courseHandicap).not.toBe(22);
    expect(courseHandicap).toBeGreaterThan(20);
    expect(courseHandicap).toBeLessThan(30);

    // Nobody is flagged as missing a handicap any more.
    expect(outcome.hasMissingHandicap).toBe(false);
  });
});

describe('rounds link to courses', () => {
  it('gives every round a real course and a tee on that course', () => {
    expect(snapshot.rounds).toHaveLength(4);
    for (const round of snapshot.rounds) {
      const course = snapshot.courses.find((c) => c.id === round.courseId);
      expect(course, `round ${round.name} has no course`).toBeDefined();
      const tee = snapshot.tees.find((t) => t.id === round.teeId);
      expect(tee, `round ${round.name} has no tee`).toBeDefined();
      expect(tee!.courseId).toBe(course!.id);
      expect(snapshot.holes.filter((h) => h.courseId === course!.id)).toHaveLength(18);
    }
  });

  it('plays the scheduled courses on the scheduled dates', () => {
    const expected: Array<[string, string]> = [
      ['2026-08-29', 'Faldo Course'],
      ['2026-08-30', 'Carya Golf Course'],
      ['2026-09-01', 'PGA Sultan'],
      ['2026-09-02', 'Montgomerie Maxx Royal'],
    ];
    for (const [date, courseName] of expected) {
      const round = snapshot.rounds.find((r) => r.date === date);
      expect(round, `no round on ${date}`).toBeDefined();
      const course = snapshot.courses.find((c) => c.id === round!.courseId)!;
      expect(course.name).toBe(courseName);
    }
  });

  it('runs all three Day 3 formats off one PGA Sultan card', () => {
    const round = snapshot.rounds.find((r) => r.dayNo === 3)!;
    const matches = snapshot.matches.filter((m) => m.roundId === round.id);
    // One course, one tee, three hole ranges.
    expect(new Set(matches.map(() => round.courseId)).size).toBe(1);
    expect([...new Set(matches.map((m) => `${m.startHole}-${m.endHole}`))].sort()).toEqual([
      '1-6',
      '13-18',
      '7-12',
    ]);
  });

  it('leaves every course unverified until a human checks it', () => {
    for (const course of snapshot.courses) {
      expect(course.dataVerified).toBe(false);
      expect(course.verifiedAt).toBeNull();
    }
  });
});
