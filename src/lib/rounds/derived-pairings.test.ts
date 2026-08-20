import { describe, expect, it } from 'vitest';
import { derivePairings, describeBlock } from './derived-pairings';
import { sectionsForRound } from './matchups';
import { buildSeedSnapshot } from '@/lib/seed/tour';
import { computeMatch } from '@/lib/scoring/engine';
import { courseHandicap } from '@/lib/scoring/handicap';
import type { MatchSide, RoundGroup } from '@/lib/types';

/**
 * Day 3 is one 4-ball playing three formats over 18 holes. The pairings are
 * the 4-balls, so moving a player has to reach all three sections and the
 * handicaps have to follow whoever actually ends up in the pairing — nothing
 * here may depend on a particular player being in a particular slot.
 */

const snapshot = buildSeedSnapshot();
const round3 = snapshot.rounds.find((r) => r.dayNo === 3)!;
const tee3 = snapshot.tees.find((t) => t.id === round3.teeId)!;
const holes3 = snapshot.holes.filter((h) => h.courseId === round3.courseId);
const matches3 = snapshot.matches.filter((m) => m.roundId === round3.id);
const sections3 = sectionsForRound(matches3, holes3.length);

const byName = (name: string) => snapshot.players.find((p) => p.name.startsWith(name))!;
const sidesFor = (sides: MatchSide[]) => (matchId: string) =>
  sides.filter((s) => s.matchId === matchId);

/** Course handicap off the Day 3 tee, so the tests never hard-code a number. */
const ch = (name: string) => courseHandicap(byName(name).handicapIndex ?? 0, tee3);

function groups(fourBalls: string[][]): RoundGroup[] {
  return fourBalls.map((names, i) => ({
    id: `g${i}`,
    roundId: round3.id,
    name: `4-Ball ${i + 1}`,
    playerIds: names.map((n) => byName(n).id),
    sortOrder: i,
    updatedBy: 'test',
    updatedAt: '2026-09-01T06:00:00.000Z',
    confirmedAt: null,
    confirmedBy: null,
  }));
}

const SEEDED = groups([
  ['Jason', 'Alan', 'Jordy', 'Connor'],
  ['Andrew', 'Ryan', 'Nick', 'Dan'],
]);

describe('derivePairings on Day 3', () => {
  const run = (g: RoundGroup[]) =>
    derivePairings(sections3, g, snapshot.players, snapshot.teams, sidesFor(snapshot.sides));

  it('covers every match in all three sections', () => {
    const { pairings } = run(SEEDED);
    expect(pairings).not.toBeNull();
    // 3 sections x 2 matches, 2 sides each.
    expect(pairings!.matchIds).toHaveLength(6);
    expect(pairings!.sides).toHaveLength(12);
    expect(new Set(pairings!.matchIds).size).toBe(6);
  });

  it('splits each 4-ball into 2 Pars against 2 Pirates', () => {
    const { pairings } = run(SEEDED);
    for (const pair of pairings!.pairs) {
      expect(pair.teams).toHaveLength(2);
      expect(pair.teams.every((t) => t.playerIds.length === 2)).toBe(true);
      expect(new Set(pair.teams.map((t) => t.teamId)).size).toBe(2);
    }
  });

  it('gives every section the same two-man teams', () => {
    const { pairings } = run(SEEDED);
    const bySide = new Map(pairings!.sides.map((s) => [s.sideId, s.playerIds.join(',')]));

    // Group the derived sides by which match they belong to, then check that
    // the set of pairs is identical in each section.
    const perSection = sections3.map((section) =>
      section.matches
        .flatMap((m) => sidesFor(snapshot.sides)(m.id))
        .map((s) => bySide.get(s.id))
        .filter(Boolean)
        .sort(),
    );
    expect(perSection[1]).toEqual(perSection[0]);
    expect(perSection[2]).toEqual(perSection[0]);
  });

  it('follows a changed 4-ball into every section', () => {
    // The organiser's example: swap Alan out for Ryan, and Jordy for Nick.
    const changed = groups([
      ['Jason', 'Ryan', 'Connor', 'Nick'],
      ['Andrew', 'Alan', 'Jordy', 'Dan'],
    ]);
    const { pairings } = run(changed);
    expect(pairings).not.toBeNull();

    const wanted = [
      [byName('Jason').id, byName('Ryan').id].sort().join(','),
      [byName('Connor').id, byName('Nick').id].sort().join(','),
    ].sort();

    // Every section's first match must be exactly those two new pairs.
    for (const section of sections3) {
      const first = [...section.matches].sort((a, b) => a.sortOrder - b.sortOrder)[0];
      const got = pairings!.sides
        .filter((s) => s.matchId === first.id)
        .map((s) => [...s.playerIds].sort().join(','))
        .sort();
      expect(got).toEqual(wanted);
    }
  });
});

describe('derivePairings refuses shapes it does not recognise', () => {
  const run = (g: RoundGroup[], sections = sections3, sides = snapshot.sides) =>
    derivePairings(sections, g, snapshot.players, snapshot.teams, sidesFor(sides));

  it('leaves a single-section round alone', () => {
    const round4 = snapshot.rounds.find((r) => r.dayNo === 4)!;
    const singles = sectionsForRound(
      snapshot.matches.filter((m) => m.roundId === round4.id),
      18,
    );
    expect(singles).toHaveLength(1);
    const result = run(SEEDED, singles);
    expect(result.pairings).toBeNull();
    expect(result.blockedBy).toBe('single-section');
  });

  it('refuses a 3/1 team split rather than guessing', () => {
    const lopsided = groups([
      ['Jason', 'Alan', 'Andrew', 'Jordy'],
      ['Ryan', 'Connor', 'Nick', 'Dan'],
    ]);
    const result = run(lopsided);
    expect(result.pairings).toBeNull();
    expect(result.blockedBy).toBe('team-split');
  });

  it('refuses when a section has a different number of matches', () => {
    // Someone added a seventh match to holes 7-12 only.
    const extra = { ...matches3[2], id: 'extra', sortOrder: 99 };
    const drifted = sectionsForRound([...matches3, extra], holes3.length);
    const result = run(SEEDED, drifted);
    expect(result.pairings).toBeNull();
    expect(result.blockedBy).toBe('match-count');
  });

  it('refuses when there are no 4-balls yet', () => {
    expect(run([]).blockedBy).toBe('no-groups');
  });

  it('has a sentence for every reason it can refuse', () => {
    for (const block of [
      'single-section',
      'no-groups',
      'match-count',
      'side-count',
      'team-split',
      'side-size',
    ] as const) {
      expect(describeBlock(block).length).toBeGreaterThan(10);
    }
  });
});

describe('handicaps follow whoever is actually in the pairing', () => {
  /** Apply a derivation to the seed's sides, then run the engine on Day 3. */
  function outcomesFor(fourBalls: string[][]) {
    const { pairings } = derivePairings(
      sections3,
      groups(fourBalls),
      snapshot.players,
      snapshot.teams,
      sidesFor(snapshot.sides),
    );
    const byId = new Map(pairings!.sides.map((s) => [s.sideId, s.playerIds]));
    const sides = snapshot.sides.map((s) =>
      byId.has(s.id) ? { ...s, playerIds: byId.get(s.id)! } : s,
    );
    return matches3.map((match) =>
      computeMatch({
        match,
        sides: sides.filter((s) => s.matchId === match.id),
        players: snapshot.players,
        holes: holes3,
        tee: tee3,
        scores: [],
        settings: snapshot.tour.settings,
      }),
    );
  }

  type Outcome = ReturnType<typeof outcomesFor>[number];

  /** Find the side made up of exactly these players, by course-handicap keys. */
  function sideFor(outcome: Outcome, names: string[]) {
    const wanted = names.map((n) => byName(n).id).sort().join(',');
    const id = Object.keys(outcome.handicaps).find(
      (sideId) => Object.keys(outcome.handicaps[sideId].courseHandicaps).sort().join(',') === wanted,
    );
    expect(id, `no side for ${names.join(' + ')}`).toBeDefined();
    return {
      team: outcome.teamHandicaps[id!],
      plays: outcome.handicaps[id!].playingHandicap,
    };
  }

  const first = (outcomes: Outcome[], format: string) =>
    outcomes.find((o) => o.format === format)!;

  it('matches the organiser’s worked example on the seeded 4-balls', () => {
    // Asserted as course handicaps first, so this fails loudly if the tee or
    // the WHS formula moves rather than silently agreeing with itself.
    expect(ch('Jason')).toBe(14);
    expect(ch('Alan')).toBe(26);
    expect(ch('Jordy')).toBe(12);
    expect(ch('Connor')).toBe(12);

    const outcomes = outcomesFor([
      ['Jason', 'Alan', 'Jordy', 'Connor'],
      ['Andrew', 'Ryan', 'Nick', 'Dan'],
    ]);
    const scramble = first(outcomes, 'two_man_scramble');

    // floor(floor((14 + 26) / 2) x 0.8) = floor(20 x 0.8) = 16.
    // floor(floor((12 + 12) / 2) x 0.8) = floor(12 x 0.8) =  9.
    // Both pairs keep their own: 16 against 9, not 7 against 0.
    expect(sideFor(scramble, ['Jason', 'Alan'])).toEqual({ team: 16, plays: 16 });
    expect(sideFor(scramble, ['Jordy', 'Connor'])).toEqual({ team: 9, plays: 9 });
  });

  it('gives the Shamble the same team handicaps as the Scramble', () => {
    const outcomes = outcomesFor([
      ['Jason', 'Alan', 'Jordy', 'Connor'],
      ['Andrew', 'Ryan', 'Nick', 'Dan'],
    ]);
    const scramble = first(outcomes, 'two_man_scramble');
    const shamble = first(outcomes, 'shamble');

    // Same players, same course handicaps, therefore the same team handicap.
    expect(sideFor(shamble, ['Jason', 'Alan'])).toEqual({ team: 16, plays: 16 });
    expect(sideFor(shamble, ['Jordy', 'Connor'])).toEqual({ team: 9, plays: 9 });
    expect(sideFor(shamble, ['Jason', 'Alan'])).toEqual(sideFor(scramble, ['Jason', 'Alan']));
    expect(sideFor(shamble, ['Jordy', 'Connor'])).toEqual(sideFor(scramble, ['Jordy', 'Connor']));
  });

  it('recomputes from the new players when the 4-ball changes', () => {
    // The organiser's example: 4-ball 1 becomes Jason + Ryan v Connor + Nick.
    const outcomes = outcomesFor([
      ['Jason', 'Ryan', 'Connor', 'Nick'],
      ['Andrew', 'Alan', 'Jordy', 'Dan'],
    ]);
    const scramble = first(outcomes, 'two_man_scramble');
    const shamble = first(outcomes, 'shamble');

    const pairRule = (a: number, b: number) => Math.floor(Math.floor((a + b) / 2) * 0.8);
    const pars = pairRule(ch('Jason'), ch('Ryan'));
    const pirates = pairRule(ch('Connor'), ch('Nick'));

    expect(sideFor(scramble, ['Jason', 'Ryan']).team).toBe(pars);
    expect(sideFor(scramble, ['Connor', 'Nick']).team).toBe(pirates);

    // Both keep their own — neither side is dragged to zero.
    expect(sideFor(scramble, ['Jason', 'Ryan']).plays).toBe(pars);
    expect(sideFor(scramble, ['Connor', 'Nick']).plays).toBe(pirates);

    // The shamble is identical, because the players have not changed.
    expect(sideFor(shamble, ['Jason', 'Ryan'])).toEqual(sideFor(scramble, ['Jason', 'Ryan']));
    expect(sideFor(shamble, ['Connor', 'Nick'])).toEqual(sideFor(scramble, ['Connor', 'Nick']));
  });

  it('switches Better Ball to the four individual course handicaps', () => {
    const outcomes = outcomesFor([
      ['Jason', 'Alan', 'Jordy', 'Connor'],
      ['Andrew', 'Ryan', 'Nick', 'Dan'],
    ]);
    const bb = first(outcomes, 'better_ball');

    // No team handicap at all: each plays their own ball off their own.
    expect(Object.values(bb.teamHandicaps).every((v) => v === null)).toBe(true);

    const all = Object.values(bb.handicaps).flatMap((h) => Object.entries(h.courseHandicaps));
    expect(all).toHaveLength(4);
    const lowest = Math.min(...all.map(([, v]) => v));

    // Every player is on their own course handicap minus the lowest of the
    // four — 100%, no allowance taken off.
    for (const [playerId, courseHc] of all) {
      const side = Object.values(bb.handicaps).find((h) => playerId in h.playerPlayingHandicaps)!;
      expect(side.playerPlayingHandicaps[playerId]).toBe(courseHc - lowest);
    }
    expect(
      Object.values(bb.handicaps)
        .flatMap((h) => Object.values(h.playerPlayingHandicaps))
        .filter((v) => v === 0),
    ).toHaveLength(all.filter(([, v]) => v === lowest).length);
  });

  it('uses the same pairs for Better Ball as for the other two sections', () => {
    const outcomes = outcomesFor([
      ['Jason', 'Ryan', 'Connor', 'Nick'],
      ['Andrew', 'Alan', 'Jordy', 'Dan'],
    ]);
    const bb = first(outcomes, 'better_ball');
    // The pair exists as a side even though it plays off individual handicaps.
    expect(sideFor(bb, ['Jason', 'Ryan']).team).toBeNull();
    expect(sideFor(bb, ['Connor', 'Nick']).team).toBeNull();
  });
});
