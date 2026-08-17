import { describe, expect, it } from 'vitest';
import {
  assignToSide,
  checkMatchups,
  draftSidesFor,
  matchupsDirty,
  sectionsForRound,
  swapInSection,
  type DraftSide,
} from './matchups';
import type { Match, MatchSide, Player, Team } from '@/lib/types';

/**
 * Matchups are editable by every player, so these rules are the only thing
 * standing between a mis-tap and a wrongly scored match.
 */

const TEAMS: Team[] = [
  { id: 'pars', tourId: 't', name: 'The Pars', shortName: 'PARS', colour: '#0b6', accent: '#0d8', crest: '⛳', captainPlayerId: null, sortOrder: 0 },
  { id: 'pirates', tourId: 't', name: 'Pin High Pirates', shortName: 'PIRATES', colour: '#b12', accent: '#e54', crest: '🏴‍☠️', captainPlayerId: null, sortOrder: 1 },
];

function player(id: string, teamId: string, name: string, sortOrder: number): Player {
  return {
    id, tourId: 't', teamId, name, nickname: null,
    initials: id.slice(0, 2).toUpperCase(), isCaptain: false, isOrganiser: false,
    hnaId: null, handicapIndex: 10, handicapSource: 'manual',
    handicapUpdatedAt: null, photoUrl: null, sortOrder,
  };
}

const ROSTER: Player[] = [
  player('jason', 'pars', 'Jason Dunbar', 0),
  player('alan', 'pars', 'Alan Hector', 1),
  player('andrew', 'pars', 'Andrew Rushmere', 2),
  player('ryan', 'pars', 'Ryan Dahl', 3),
  player('jordy', 'pirates', 'Jordy West', 4),
  player('connor', 'pirates', 'Connor Grealy', 5),
  player('nick', 'pirates', 'Nick Georgoulakis', 6),
  player('dan', 'pirates', 'Dan Kramer', 7),
];

let n = 0;
function match(overrides: Partial<Match> = {}): Match {
  n += 1;
  return {
    id: `m${n}`, roundId: 'r1', name: `Match ${n}`, format: 'better_ball',
    startHole: 1, endHole: 18, pointsValue: 1, allowanceOverride: null,
    status: 'upcoming', sortOrder: n, ...overrides,
  };
}

function sides(matchId: string, home: string[], away: string[]): MatchSide[] {
  return [
    { id: `${matchId}-a`, matchId, teamId: 'pars', playerIds: home, handicapOverride: null, sortOrder: 0 },
    { id: `${matchId}-b`, matchId, teamId: 'pirates', playerIds: away, handicapOverride: null, sortOrder: 1 },
  ];
}

describe('sectionsForRound', () => {
  it('gives a normal day one section', () => {
    const ms = [match({ format: 'singles' }), match({ format: 'singles' })];
    const sections = sectionsForRound(ms);
    expect(sections).toHaveLength(1);
    expect(sections[0].label).toBe('All 18 holes');
    expect(sections[0].matches).toHaveLength(2);
  });

  it('splits Day 3 into its three six-hole sections, in hole order', () => {
    const ms = [
      match({ format: 'better_ball', startHole: 13, endHole: 18 }),
      match({ format: 'two_man_scramble', startHole: 1, endHole: 6 }),
      match({ format: 'shamble', startHole: 7, endHole: 12 }),
      match({ format: 'two_man_scramble', startHole: 1, endHole: 6 }),
    ];
    const sections = sectionsForRound(ms);

    expect(sections.map((s) => s.key)).toEqual(['1-6', '7-12', '13-18']);
    expect(sections.map((s) => s.formatLabel)).toEqual([
      '2-Man Scramble',
      'Shamble',
      'Better Ball Match Play',
    ]);
    expect(sections[0].matches).toHaveLength(2);
    expect(sections.map((s) => s.label)).toEqual([
      'Holes 1–6',
      'Holes 7–12',
      'Holes 13–18',
    ]);
  });

  it('flags a hole range with more than one format on it', () => {
    const ms = [
      match({ format: 'singles', startHole: 1, endHole: 9 }),
      match({ format: 'better_ball', startHole: 1, endHole: 9 }),
    ];
    expect(sectionsForRound(ms)[0].mixedFormats).toBe(true);
  });
});

describe('checkMatchups', () => {
  const a = match({ format: 'better_ball', startHole: 1, endHole: 6 });
  const b = match({ format: 'better_ball', startHole: 1, endHole: 6 });
  const section = sectionsForRound([a, b])[0];
  const lookup = (id: string) =>
    id === a.id
      ? sides(a.id, ['jason', 'alan'], ['jordy', 'connor'])
      : sides(b.id, ['andrew', 'ryan'], ['nick', 'dan']);

  it('passes a correct set of pairings', () => {
    const draft = draftSidesFor(section, lookup);
    expect(checkMatchups(section, draft, ROSTER, TEAMS).issues).toEqual([]);
  });

  it('catches the same player in two matches over the same holes', () => {
    const draft = draftSidesFor(section, lookup).map((s) =>
      s.id === `${b.id}-a` ? { ...s, playerIds: ['jason', 'ryan'] } : s,
    );
    const result = checkMatchups(section, draft, ROSTER, TEAMS);
    expect(result.ok).toBe(false);
    expect(result.issues[0].message).toContain('Jason Dunbar is in two matches');
  });

  it('catches a side that is the wrong size for the format', () => {
    const draft = draftSidesFor(section, lookup).map((s) =>
      s.id === `${a.id}-a` ? { ...s, playerIds: ['jason'] } : s,
    );
    const result = checkMatchups(section, draft, ROSTER, TEAMS);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.message.includes('PARS has 1 player'))).toBe(true);
  });

  it('warns, without erroring, when someone sits a section out', () => {
    // Andrew dropped and nobody replaced him: a real possibility, not a bug.
    const draft = draftSidesFor(section, lookup).map((s) =>
      s.id === `${b.id}-a` ? { ...s, playerIds: ['ryan'] } : s,
    );
    const result = checkMatchups(section, draft, ROSTER, TEAMS);
    const warnings = result.issues.filter((i) => i.level === 'warning');
    expect(warnings.some((w) => w.message.includes('Andrew Rushmere'))).toBe(true);
  });
});

describe('swapInSection', () => {
  const draft: DraftSide[] = [
    { id: 's1', matchId: 'm', teamId: 'pars', playerIds: ['jason', 'alan'] },
    { id: 's2', matchId: 'm', teamId: 'pirates', playerIds: ['jordy', 'connor'] },
    { id: 's3', matchId: 'm2', teamId: 'pars', playerIds: ['andrew', 'ryan'] },
    { id: 's4', matchId: 'm2', teamId: 'pirates', playerIds: ['nick', 'dan'] },
  ];

  it('re-pairs two team-mates across matches without changing the counts', () => {
    // The singles example: swap Alan and Ryan so the matchups change but
    // exactly the same eight players are involved.
    const next = swapInSection(draft, 'alan', 'ryan');
    expect(next[0].playerIds).toEqual(['jason', 'ryan']);
    expect(next[2].playerIds).toEqual(['andrew', 'alan']);
    expect(next.every((s) => s.playerIds.length === 2)).toBe(true);
  });

  it('can swap opponents between matches too', () => {
    const next = swapInSection(draft, 'connor', 'dan');
    expect(next[1].playerIds).toEqual(['jordy', 'dan']);
    expect(next[3].playerIds).toEqual(['nick', 'connor']);
  });

  it('never duplicates or drops a player, whichever two are swapped', () => {
    const ids = ROSTER.map((p) => p.id);
    for (const x of ids) {
      for (const y of ids) {
        const flat = swapInSection(draft, x, y).flatMap((s) => s.playerIds);
        expect(new Set(flat).size).toBe(8);
      }
    }
  });

  it('is a no-op for the same player twice', () => {
    expect(swapInSection(draft, 'alan', 'alan')).toBe(draft);
  });
});

describe('assignToSide', () => {
  const draft: DraftSide[] = [
    { id: 's1', matchId: 'm', teamId: 'pars', playerIds: ['jason'] },
    { id: 's2', matchId: 'm', teamId: 'pirates', playerIds: ['jordy'] },
  ];

  it('moves a player and removes them from where they were', () => {
    const next = assignToSide(draft, 'jason', 's2');
    expect(next[0].playerIds).toEqual([]);
    expect(next[1].playerIds).toEqual(['jordy', 'jason']);
  });

  it('does not duplicate when assigning to the side they are on', () => {
    const next = assignToSide(draft, 'jason', 's1');
    expect(next[0].playerIds).toEqual(['jason']);
  });
});

describe('matchupsDirty', () => {
  const saved: DraftSide[] = [
    { id: 's1', matchId: 'm', teamId: 'pars', playerIds: ['jason', 'alan'] },
    { id: 's2', matchId: 'm', teamId: 'pirates', playerIds: ['jordy', 'connor'] },
  ];

  it('is false for an untouched draft, whatever order the names are in', () => {
    expect(matchupsDirty(saved, saved)).toBe(false);
    const reordered = saved.map((s) => ({ ...s, playerIds: [...s.playerIds].reverse() }));
    expect(matchupsDirty(reordered, saved)).toBe(false);
  });

  it('is true once a player actually moves', () => {
    expect(matchupsDirty(swapInSection(saved, 'alan', 'connor'), saved)).toBe(true);
  });
});
