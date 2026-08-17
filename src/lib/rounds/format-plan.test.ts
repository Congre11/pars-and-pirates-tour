import { describe, expect, it } from 'vitest';
import {
  describeHoleList,
  describeRoundFormat,
  planRound,
  suggestNewMatch,
} from './format-plan';
import { DEFAULT_TOUR_SETTINGS, type Match, type MatchFormat, type MatchSide } from '@/lib/types';

/**
 * The round's format plan is what makes Day 3 ordinary rather than special, so
 * these tests are written against arbitrary configurations, not the seeded one.
 */

let counter = 0;
function match(overrides: Partial<Match> = {}): Match {
  counter += 1;
  return {
    id: `m${counter}`,
    roundId: 'r1',
    name: `Match ${counter}`,
    format: 'singles',
    startHole: 1,
    endHole: 18,
    pointsValue: 1,
    allowanceOverride: null,
    status: 'upcoming',
    sortOrder: counter,
    ...overrides,
  };
}

function sides(matchId: string, home: string[], away: string[]): MatchSide[] {
  return [
    { id: `${matchId}-a`, matchId, teamId: 'pars', playerIds: home, handicapOverride: null, sortOrder: 0 },
    { id: `${matchId}-b`, matchId, teamId: 'pirates', playerIds: away, handicapOverride: null, sortOrder: 1 },
  ];
}

/** Build a `sidesByMatch` lookup from a plain map. */
function lookup(map: Record<string, MatchSide[]>) {
  return (matchId: string) => map[matchId] ?? [];
}

const settings = DEFAULT_TOUR_SETTINGS;

describe('describeHoleList', () => {
  it('collapses runs into ranges', () => {
    expect(describeHoleList([1, 2, 3, 7, 8])).toBe('1–3, 7–8');
    expect(describeHoleList([5])).toBe('5');
    expect(describeHoleList([])).toBe('');
    expect(describeHoleList([3, 1, 2])).toBe('1–3');
    expect(describeHoleList([1, 3, 5])).toBe('1, 3, 5');
  });
});

describe('planRound', () => {
  it('accepts an arbitrary three-segment round, not just the seeded one', () => {
    // Nothing here matches Day 3: four segments, different sizes, different order.
    const a = match({ format: 'foursomes', startHole: 1, endHole: 4, pointsValue: 0.5 });
    const b = match({ format: 'better_ball', startHole: 5, endHole: 12, pointsValue: 1 });
    const c = match({ format: 'singles', startHole: 13, endHole: 18, pointsValue: 0.25 });
    const map = {
      [a.id]: sides(a.id, ['p1', 'p2'], ['p3', 'p4']),
      [b.id]: sides(b.id, ['p1', 'p2'], ['p3', 'p4']),
      [c.id]: sides(c.id, ['p1'], ['p3']),
    };

    const plan = planRound([c, a, b], lookup(map), { settings });

    expect(plan.ok).toBe(true);
    expect(plan.issues).toEqual([]);
    // Sorted into hole order regardless of the order they were passed in.
    expect(plan.segments.map((s) => s.match.id)).toEqual([a.id, b.id, c.id]);
    expect(plan.segments.map((s) => s.holeCount)).toEqual([4, 8, 6]);
    expect(plan.pointsTotal).toBe(1.75);
    expect(plan.uncoveredHoles).toEqual([]);
  });

  it('flags the overlap that silently stops a hole being scored', () => {
    const a = match({ startHole: 1, endHole: 9 });
    const b = match({ startHole: 7, endHole: 18 });
    const map = { [a.id]: sides(a.id, ['p1'], ['p3']), [b.id]: sides(b.id, ['p1'], ['p3']) };

    const plan = planRound([a, b], lookup(map), { settings });

    expect(plan.ok).toBe(false);
    expect(plan.issues[0].level).toBe('error');
    expect(plan.issues[0].message).toContain('holes 7–9');
    expect(plan.issues[0].matchIds).toEqual([a.id, b.id]);
  });

  it('allows two matches over the same holes when no player is in both', () => {
    // Four singles matches all over 1-18 is the normal Day 4 shape.
    const a = match({ startHole: 1, endHole: 18 });
    const b = match({ startHole: 1, endHole: 18 });
    const map = { [a.id]: sides(a.id, ['p1'], ['p5']), [b.id]: sides(b.id, ['p2'], ['p6']) };

    expect(planRound([a, b], lookup(map), { settings }).ok).toBe(true);
  });

  it('warns about holes nobody is playing without blocking the round', () => {
    const a = match({ startHole: 1, endHole: 6 });
    const map = { [a.id]: sides(a.id, ['p1'], ['p3']) };

    const plan = planRound([a], lookup(map), { settings });

    expect(plan.ok).toBe(true);
    expect(plan.uncoveredHoles).toHaveLength(12);
    expect(plan.issues[0].level).toBe('warning');
    expect(plan.issues[0].message).toContain('holes 7–18');
  });

  it('rejects a range running off the end of the card', () => {
    const a = match({ startHole: 1, endHole: 18 });
    const map = { [a.id]: sides(a.id, ['p1'], ['p3']) };

    // Same match, nine-hole course.
    const plan = planRound([a], lookup(map), { holeCount: 9, settings });

    expect(plan.ok).toBe(false);
    expect(plan.issues.some((i) => i.message.includes('this course has 9 holes'))).toBe(true);
  });

  it('rejects a backwards range', () => {
    const a = match({ startHole: 12, endHole: 4 });
    const map = { [a.id]: sides(a.id, ['p1'], ['p3']) };

    const plan = planRound([a], lookup(map), { settings });
    expect(plan.ok).toBe(false);
    expect(plan.issues[0].message).toContain('ends on hole 4 but starts on hole 12');
  });

  it('rejects the same player on both sides', () => {
    const a = match({ startHole: 1, endHole: 18 });
    const map = { [a.id]: sides(a.id, ['p1'], ['p1']) };

    const plan = planRound([a], lookup(map), { settings });
    expect(plan.ok).toBe(false);
    expect(plan.issues.some((i) => i.message.includes('same player on both sides'))).toBe(true);
  });

  it('warns when a side is the wrong size for its format', () => {
    // Format switched to foursomes but the sides are still singles.
    const a = match({ format: 'foursomes', startHole: 1, endHole: 18 });
    const map = { [a.id]: sides(a.id, ['p1'], ['p3']) };

    const plan = planRound([a], lookup(map), { settings });
    expect(plan.ok).toBe(true); // playable, just odd
    expect(plan.issues.some((i) => i.message.includes('played 2 a side'))).toBe(true);
  });

  it('reports the allowance actually in force, override or not', () => {
    const standard = match({ format: 'two_man_scramble', startHole: 1, endHole: 9 });
    const custom = match({
      format: 'two_man_scramble',
      startHole: 10,
      endHole: 18,
      allowanceOverride: { weights: [0.5, 0.25], rounding: 'floor' },
    });
    const map = {
      [standard.id]: sides(standard.id, ['p1', 'p2'], ['p3', 'p4']),
      [custom.id]: sides(custom.id, ['p1', 'p2'], ['p3', 'p4']),
    };

    const plan = planRound([standard, custom], lookup(map), { settings });

    expect(plan.segments[0].hasOwnAllowance).toBe(false);
    expect(plan.segments[0].allowance.weights).toEqual([0.35, 0.15]);
    expect(plan.segments[1].hasOwnAllowance).toBe(true);
    expect(plan.segments[1].allowance).toEqual({ weights: [0.5, 0.25], rounding: 'floor' });
  });
});

describe('describeRoundFormat', () => {
  it('names a single-format round', () => {
    expect(describeRoundFormat([match({ format: 'better_ball' })])).toBe('Better Ball Match Play');
  });

  it('merges the parallel matches of one phase into a single label', () => {
    // Four singles matches over the same holes is one phase, not four.
    const ms = [1, 2, 3, 4].map(() => match({ format: 'singles', startHole: 1, endHole: 18 }));
    expect(describeRoundFormat(ms)).toBe('Singles Match Play');
  });

  it('describes a multi-format round from the matches themselves', () => {
    const ms: Match[] = [
      match({ format: 'singles', startHole: 1, endHole: 6 }),
      match({ format: 'singles', startHole: 1, endHole: 6 }),
      match({ format: 'two_man_scramble', startHole: 7, endHole: 12 }),
      match({ format: 'foursomes', startHole: 13, endHole: 18 }),
    ];
    expect(describeRoundFormat(ms)).toBe('H1–6 Singles · H7–12 Scramble · H13–18 Alt. Shot');
  });

  it('follows a reconfigured round rather than a stale label', () => {
    const reconfigured: Match[] = [
      match({ format: 'better_ball', startHole: 1, endHole: 9 }),
      match({ format: 'foursomes', startHole: 10, endHole: 18 }),
    ];
    expect(describeRoundFormat(reconfigured)).toBe('H1–9 Better Ball · H10–18 Alt. Shot');
  });

  it('copes with an empty round', () => {
    expect(describeRoundFormat([])).toBe('No matches yet');
  });
});

describe('suggestNewMatch', () => {
  it('offers the whole card for the first match of a round', () => {
    expect(suggestNewMatch([], { settings })).toMatchObject({ startHole: 1, endHole: 18 });
  });

  it('offers the first free run of holes', () => {
    const existing = [
      match({ startHole: 1, endHole: 6, format: 'singles' }),
      match({ startHole: 13, endHole: 18, format: 'foursomes' }),
    ];
    expect(suggestNewMatch(existing, { settings })).toMatchObject({ startHole: 7, endHole: 12 });
  });

  it('copies the neighbouring match when the card is already full', () => {
    // Adding a second pairing to an existing 18-hole singles round.
    const existing = [
      match({ startHole: 1, endHole: 18, format: 'singles', pointsValue: 0.25 }),
    ];
    const suggestion = suggestNewMatch(existing, { settings });
    expect(suggestion).toMatchObject({
      startHole: 1,
      endHole: 18,
      format: 'singles',
      pointsValue: 0.25,
    });
  });

  it('adopts the format already played over the holes it fills', () => {
    // A scramble over 7-12 with only one match; the next one should match it.
    const existing = [
      match({ startHole: 1, endHole: 6, format: 'singles' }),
      match({ startHole: 7, endHole: 12, format: 'two_man_scramble', pointsValue: 0.5 }),
    ];
    const suggestion = suggestNewMatch(existing, { settings });
    expect(suggestion.startHole).toBe(13);
    // Nothing covers 13-18 yet, so it falls back to the default rather than
    // guessing a format from an unrelated segment.
    expect(suggestion.format satisfies MatchFormat).toBe('singles');
  });
});
