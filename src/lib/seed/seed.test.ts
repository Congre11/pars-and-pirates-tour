import { describe, expect, it } from 'vitest';
import { buildSeedSnapshot } from './tour';
import { computeMatch, computeStandings } from '@/lib/scoring/engine';
import type { MatchOutcome } from '@/lib/scoring/engine';
import { describeRoundFormat, planRound } from '@/lib/rounds/format-plan';
import { checkFourBalls } from '@/lib/rounds/four-balls';
import { halvesAwardNothing } from '@/lib/rounds/matchups';
import { courseHandicap } from '@/lib/scoring/handicap';

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

  it('Day 1 is two 2-man scrambles worth 1 point each', () => {
    const matches = byDay(1);
    expect(matches).toHaveLength(2);
    expect(matches.every((m) => m.format === 'two_man_scramble')).toBe(true);
    expect(matches.every((m) => m.pointsValue === 1)).toBe(true);
    expect(matches.every((m) => m.startHole === 1 && m.endHole === 18)).toBe(true);
    // Two physical 4-balls, each of which is one match — so Day 1 is still 2.
    expect(pointsFor(1)).toBe(2);
  });

  it('has no 4-man scramble left anywhere', () => {
    // The format Day 1 used to use. If it reappears the round has silently
    // reverted to the old single-match specification.
    expect(snapshot.matches.some((m) => m.format === 'team_scramble')).toBe(false);
  });

  it('each Day 1 scramble is 2 Pars against 2 Pirates', () => {
    for (const match of byDay(1)) {
      const sides = snapshot.sides.filter((s) => s.matchId === match.id);
      expect(sides).toHaveLength(2);
      expect(sides.every((s) => s.playerIds.length === 2)).toBe(true);
      expect(new Set(sides.map((s) => s.teamId)).size).toBe(2);
    }
  });

  it('Day 2 is two better-ball matches worth 1 point each', () => {
    const matches = byDay(2);
    expect(matches).toHaveLength(2);
    expect(matches.every((m) => m.format === 'better_ball')).toBe(true);
    expect(matches.every((m) => m.pointsValue === 1)).toBe(true);
    expect(pointsFor(2)).toBe(2);
  });

  it('Day 3 is Scramble H1–6, Shamble H7–12 and Better Ball H13–18', () => {
    const matches = byDay(3);
    expect(matches).toHaveLength(6);

    const scrambles = matches.filter((m) => m.format === 'two_man_scramble');
    expect(scrambles).toHaveLength(2);
    expect(scrambles.every((m) => m.pointsValue === 0.5)).toBe(true);
    expect(scrambles.every((m) => m.startHole === 1 && m.endHole === 6)).toBe(true);

    const shambles = matches.filter((m) => m.format === 'shamble');
    expect(shambles).toHaveLength(2);
    expect(shambles.every((m) => m.pointsValue === 0.5)).toBe(true);
    expect(shambles.every((m) => m.startHole === 7 && m.endHole === 12)).toBe(true);

    const betterBall = matches.filter((m) => m.format === 'better_ball');
    expect(betterBall).toHaveLength(2);
    expect(betterBall.every((m) => m.pointsValue === 0.5)).toBe(true);
    expect(betterBall.every((m) => m.startHole === 13 && m.endHole === 18)).toBe(true);

    // Day 3 is still worth 3, so the tour still totals 11.
    expect(pointsFor(3)).toBe(3);
  });

  it('has no singles or alternate shot left on Day 3', () => {
    // The formats Day 3 used to use. If either reappears the round has
    // silently reverted to the old specification.
    const formats = new Set(byDay(3).map((m) => m.format));
    expect(formats.has('singles')).toBe(false);
    expect(formats.has('foursomes')).toBe(false);
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
        halveAwardsNothing: halvesAwardNothing(
          snapshot.matches.filter((m) => m.roundId === round.id),
        ),
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
    // A per-player Day 3 match, so one score per side settles each hole.
    const match = snapshot.matches.find(
      (m) => m.roundId === round.id && m.format === 'better_ball',
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
    // A 0.5-point match halved is 0.25 each — the value splits exactly,
    // whatever it is.
    expect(match.pointsValue).toBe(0.5);
    expect(outcome.points[sides[0].id]).toBe(0.25);
    expect(outcome.points[sides[1].id]).toBe(0.25);
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
      ['2026-08-29', 'Faldo — Queen’s + Prince’s'],
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

describe('organiser and captains are separate roles', () => {
  const byName = (name: string) => snapshot.players.find((p) => p.name === name)!;

  it('makes Connor the organiser without making him a captain', () => {
    const connor = byName('Connor Grealy');
    expect(connor.isOrganiser).toBe(true);
    expect(connor.isCaptain).toBe(false);
  });

  it('keeps Jason and Jordy as captains', () => {
    expect(byName('Jason Dunbar').isCaptain).toBe(true);
    expect(byName('Jordy West').isCaptain).toBe(true);
  });

  it('does not make the captains organisers', () => {
    expect(byName('Jason Dunbar').isOrganiser).toBe(false);
    expect(byName('Jordy West').isOrganiser).toBe(false);
  });

  it('leaves every other player as a normal player', () => {
    const ordinary = snapshot.players.filter(
      (p) => !['Connor Grealy', 'Jason Dunbar', 'Jordy West'].includes(p.name),
    );
    expect(ordinary).toHaveLength(5);
    for (const player of ordinary) {
      expect(player.isCaptain).toBe(false);
      expect(player.isOrganiser).toBe(false);
    }
  });

  it('still points each team at its captain', () => {
    const pars = snapshot.teams.find((t) => t.name === 'The Pars')!;
    const pirates = snapshot.teams.find((t) => t.name === 'Pin High Pirates')!;
    expect(pars.captainPlayerId).toBe(byName('Jason Dunbar').id);
    expect(pirates.captainPlayerId).toBe(byName('Jordy West').id);
  });
});

describe('seeded 4-balls', () => {
  const roundGroups = (dayNo: number) => {
    const round = snapshot.rounds.find((r) => r.dayNo === dayNo)!;
    return snapshot.groups.filter((g) => g.roundId === round.id);
  };

  it('gives every round two 4-balls of four', () => {
    for (const round of snapshot.rounds) {
      const groups = snapshot.groups.filter((g) => g.roundId === round.id);
      expect(groups, `Day ${round.dayNo}`).toHaveLength(2);
      for (const group of groups) expect(group.playerIds).toHaveLength(4);
    }
  });

  it('passes its own validation: 8 players, no duplicates, 2 and 2', () => {
    for (const round of snapshot.rounds) {
      const groups = snapshot.groups
        .filter((g) => g.roundId === round.id)
        .map((g) => ({ id: g.id, name: g.name, playerIds: g.playerIds, sortOrder: g.sortOrder }));
      const check = checkFourBalls(groups, snapshot.players, snapshot.teams);
      expect(check.issues, `Day ${round.dayNo}`).toEqual([]);
    }
  });

  it('seeds the groupings the organiser specified', () => {
    const name = (id: string) => snapshot.players.find((p) => p.id === id)!.name;
    const groups = roundGroups(1).sort((a, b) => a.sortOrder - b.sortOrder);
    expect(groups[0].playerIds.map(name).sort()).toEqual([
      'Alan Hector',
      'Connor Grealy',
      'Jason Dunbar',
      'Jordy West',
    ]);
    expect(groups[1].playerIds.map(name).sort()).toEqual([
      'Andrew Rushmere',
      'Dan Kramer',
      'Nick Georgoulakis',
      'Ryan Dahl',
    ]);
  });

  it('stores 4-balls apart from the competitive matchups', () => {
    // Day 4 is four singles matches inside two 4-balls: proof that a group is
    // not a match. If these ever became the same table this would fail.
    const round = snapshot.rounds.find((r) => r.dayNo === 4)!;
    const matches = snapshot.matches.filter((m) => m.roundId === round.id);
    const groups = snapshot.groups.filter((g) => g.roundId === round.id);
    expect(matches).toHaveLength(4);
    expect(groups).toHaveLength(2);
  });

  it('keeps one set of 4-balls across all three Day 3 formats', () => {
    // The physical group walks 18 holes while the format changes three times.
    const round = snapshot.rounds.find((r) => r.dayNo === 3)!;
    expect(snapshot.groups.filter((g) => g.roundId === round.id)).toHaveLength(2);
    expect(snapshot.matches.filter((m) => m.roundId === round.id)).toHaveLength(6);
  });
});

describe('the seeded format plan is a default, not a fixture', () => {
  it('stores every round as ordinary editable matches, Day 3 included', () => {
    // Nothing marks Day 3 as special: it is six rows differing only in the
    // hole range and format they carry, exactly like every other day.
    const round = snapshot.rounds.find((r) => r.dayNo === 3)!;
    const matches = snapshot.matches.filter((m) => m.roundId === round.id);

    expect(matches).toHaveLength(6);
    for (const match of matches) {
      expect(match.roundId).toBe(round.id);
      expect(typeof match.startHole).toBe('number');
      expect(typeof match.endHole).toBe('number');
      expect(match.pointsValue).toBeGreaterThan(0);
    }
  });

  it('seeds no per-match allowance, so Admin → Rules governs every match', () => {
    for (const match of snapshot.matches) {
      expect(match.allowanceOverride).toBeNull();
    }
  });

  it('every round is validly configured out of the box', () => {
    const sidesFor = (matchId: string) => snapshot.sides.filter((s) => s.matchId === matchId);

    for (const round of snapshot.rounds) {
      const matches = snapshot.matches.filter((m) => m.roundId === round.id);
      const holeCount = snapshot.holes.filter((h) => h.courseId === round.courseId).length;
      const plan = planRound(matches, sidesFor, {
        holeCount,
        settings: snapshot.tour.settings,
      });

      expect(plan.issues.filter((i) => i.level === 'error')).toEqual([]);
      expect(plan.ok, `Day ${round.dayNo} has a broken format plan`).toBe(true);
    }
  });

  it('labels each round with what its matches actually say', () => {
    // A stale label is how a reconfigured round misleads people, so the seed
    // must already agree with the derivation.
    for (const round of snapshot.rounds) {
      const matches = snapshot.matches.filter((m) => m.roundId === round.id);
      expect(round.formatLabel, `Day ${round.dayNo}`).toBe(describeRoundFormat(matches));
    }
  });

  it('no match name hard-codes a hole range that editing would falsify', () => {
    for (const match of snapshot.matches) {
      expect(match.name, `${match.name} embeds a hole range`).not.toMatch(/H\d+\s*[–-]\s*\d+/);
    }
  });
});

describe('the captains’ revised handicap and points rules', () => {
  const round = (dayNo: number) => snapshot.rounds.find((r) => r.dayNo === dayNo)!;
  const matchesOn = (dayNo: number) =>
    snapshot.matches
      .filter((m) => m.roundId === round(dayNo).id)
      .sort((a, b) => a.sortOrder - b.sortOrder);

  function outcome(match: (typeof snapshot.matches)[number]) {
    const r = snapshot.rounds.find((x) => x.id === match.roundId)!;
    return computeMatch({
      match,
      sides: snapshot.sides.filter((s) => s.matchId === match.id),
      players: snapshot.players,
      holes: snapshot.holes.filter((h) => h.courseId === r.courseId),
      tee: snapshot.tees.find((t) => t.id === r.teeId)!,
      scores: [],
      settings: snapshot.tour.settings,
      halveAwardsNothing: halvesAwardNothing(
        snapshot.matches.filter((m) => m.roundId === r.id),
      ),
    });
  }

  /** The agreed rule, written out longhand so the test is not the code. */
  const pairRule = (ch1: number, ch2: number) => Math.floor(Math.floor((ch1 + ch2) / 2) * 0.8);

  const pairFormats = ['two_man_scramble', 'shamble'] as const;

  it('plays every scramble and shamble off floor(floor((CH1+CH2)/2) × 0.8)', () => {
    const checked: string[] = [];
    for (const dayNo of [1, 3]) {
      const r = round(dayNo);
      const tee = snapshot.tees.find((t) => t.id === r.teeId)!;
      for (const match of matchesOn(dayNo)) {
        if (!pairFormats.includes(match.format as (typeof pairFormats)[number])) continue;
        const o = outcome(match);
        for (const side of snapshot.sides.filter((s) => s.matchId === match.id)) {
          const chs = side.playerIds.map(
            (id) =>
              courseHandicap(snapshot.players.find((p) => p.id === id)!.handicapIndex ?? 0, tee),
          );
          expect(o.teamHandicaps[side.id]).toBe(pairRule(chs[0], chs[1]));
          checked.push(`${dayNo}:${match.name}`);
        }
      }
    }
    // Day 1's two scrambles and Day 3's two scrambles + two shambles, 2 sides each.
    expect(checked).toHaveLength(12);
  });

  it('lets both pairs keep their own handicap — nobody is dragged to zero', () => {
    for (const dayNo of [1, 3]) {
      for (const match of matchesOn(dayNo)) {
        if (!pairFormats.includes(match.format as (typeof pairFormats)[number])) continue;
        const o = outcome(match);
        for (const side of snapshot.sides.filter((s) => s.matchId === match.id)) {
          expect(o.handicaps[side.id].playingHandicap).toBe(o.teamHandicaps[side.id]);
          expect(o.handicaps[side.id].playingHandicap).toBeGreaterThan(0);
        }
      }
    }
  });

  it('deals each side’s own strokes across only the holes it plays', () => {
    for (const match of matchesOn(3)) {
      if (!pairFormats.includes(match.format as (typeof pairFormats)[number])) continue;
      const o = outcome(match);
      for (const side of snapshot.sides.filter((s) => s.matchId === match.id)) {
        const alloc = o.sideStrokes[side.id];
        const holeNos = Object.keys(alloc).map(Number);
        expect(holeNos).toHaveLength(6);
        expect(holeNos.every((n) => n >= match.startHole && n <= match.endHole)).toBe(true);
        expect(Object.values(alloc).reduce((a, b) => a + b, 0)).toBe(
          o.handicaps[side.id].playingHandicap,
        );
      }
    }
  });

  it('gives the Shamble the same team handicaps as the Scramble', () => {
    // Same pairs, same course, same tee — so the same figure, section by section.
    const byPair = new Map<string, number[]>();
    for (const match of matchesOn(3)) {
      if (!pairFormats.includes(match.format as (typeof pairFormats)[number])) continue;
      const o = outcome(match);
      for (const side of snapshot.sides.filter((s) => s.matchId === match.id)) {
        const key = [...side.playerIds].sort().join(',');
        byPair.set(key, [...(byPair.get(key) ?? []), o.teamHandicaps[side.id]!]);
      }
    }
    expect(byPair.size).toBe(4);
    for (const [, values] of byPair) {
      expect(values).toHaveLength(2); // one scramble, one shamble
      expect(values[0]).toBe(values[1]);
    }
  });

  /** Every per-player format plays each player off their FULL course handicap. */
  function expectFullIndividualHandicaps(dayNo: number) {
    const r = round(dayNo);
    const tee = snapshot.tees.find((t) => t.id === r.teeId)!;
    for (const match of matchesOn(dayNo)) {
      if (match.format !== 'better_ball' && match.format !== 'singles') continue;
      const o = outcome(match);
      // Nobody carries a team handicap, and nobody is reduced to anyone else.
      expect(Object.values(o.teamHandicaps).every((v) => v === null)).toBe(true);
      for (const side of snapshot.sides.filter((s) => s.matchId === match.id)) {
        for (const id of side.playerIds) {
          const ch = courseHandicap(
            snapshot.players.find((p) => p.id === id)!.handicapIndex ?? 0,
            tee,
          );
          expect(o.handicaps[side.id].playerPlayingHandicaps[id]).toBe(ch);
        }
      }
    }
  }

  it('plays Day 3 Better Ball off full individual course handicaps', () => {
    expectFullIndividualHandicaps(3);
  });

  it('plays Day 2 Better Ball and Day 4 Singles off full individual handicaps', () => {
    for (const dayNo of [2, 4]) expectFullIndividualHandicaps(dayNo);
  });

  it('never puts anybody off zero on any day', () => {
    // The rule the captains were most explicit about: 4, 11, 15 and 22 play as
    // 4 / 11 / 15 / 22, and 8 against 13 plays 8 against 13.
    for (const match of snapshot.matches) {
      const o = outcome(match);
      const all = [
        ...Object.values(o.handicaps).flatMap((h) => Object.values(h.playerPlayingHandicaps)),
        ...Object.values(o.teamHandicaps).filter((v): v is number => v !== null),
      ];
      expect(all.every((v) => v > 0)).toBe(true);
    }
  });

  it('leaves Day 2 and Day 4 splitting a halved match as usual', () => {
    for (const dayNo of [2, 4]) expect(halvesAwardNothing(matchesOn(dayNo))).toBe(false);
  });

  it('burns a halved Day 3 match but keeps the tour advertised as 11 points', () => {
    const outcomes = snapshot.matches.map((m) => {
      const o = outcome(m);
      const isDay3 = m.roundId === round(3).id;
      // Force every Day 3 match to have finished level.
      return isDay3
        ? {
            ...o,
            isComplete: true,
            winnerSideId: null,
            finalStatus: 'Halved',
            points: Object.fromEntries(Object.keys(o.points).map((id) => [id, 0])),
            projectedPoints: Object.fromEntries(Object.keys(o.points).map((id) => [id, 0])),
          }
        : o;
    });

    const standings = computeStandings(
      outcomes,
      new Map(
        snapshot.matches.map((m) => [m.id, snapshot.sides.filter((s) => s.matchId === m.id)]),
      ),
      snapshot.teams.map((t) => t.id),
    );

    expect(standings.pointsTotal).toBe(11);
    expect(standings.pointsToWin).toBe(6);
    // The 3 Day 3 points went unclaimed rather than being shared out.
    for (const team of snapshot.teams) expect(standings.byTeam[team.id].points).toBe(0);
    expect(standings.pointsRemaining).toBe(8);
  });
});
