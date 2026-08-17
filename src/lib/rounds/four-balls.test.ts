import { describe, expect, it } from 'vitest';
import {
  checkFourBalls,
  defaultGroups,
  groupsForEditing,
  isDirty,
  movePlayer,
  swapPlayers,
  type DraftGroup,
} from './four-balls';
import type { Player, RoundGroup, Team } from '@/lib/types';

/**
 * The 4-balls are editable by everyone, so the rules that stop a grouping
 * being nonsense are the only safety net. They are tested here directly.
 */

const TEAMS: Team[] = [
  {
    id: 'pars',
    tourId: 't',
    name: 'The Pars',
    shortName: 'PARS',
    colour: '#0b6',
    accent: '#0d8',
    crest: '⛳',
    captainPlayerId: 'jason',
    sortOrder: 0,
  },
  {
    id: 'pirates',
    tourId: 't',
    name: 'Pin High Pirates',
    shortName: 'PIRATES',
    colour: '#b12',
    accent: '#e54',
    crest: '🏴‍☠️',
    captainPlayerId: 'jordy',
    sortOrder: 1,
  },
];

function player(id: string, teamId: string, sortOrder: number, name = id): Player {
  return {
    id,
    tourId: 't',
    teamId,
    name,
    nickname: null,
    initials: id.slice(0, 2).toUpperCase(),
    isCaptain: false,
    isOrganiser: false,
    hnaId: null,
    handicapIndex: 10,
    handicapSource: 'manual',
    handicapUpdatedAt: null,
    photoUrl: null,
    sortOrder,
  };
}

const ROSTER: Player[] = [
  player('jason', 'pars', 0, 'Jason Dunbar'),
  player('alan', 'pars', 1, 'Alan Hector'),
  player('andrew', 'pars', 2, 'Andrew Rushmere'),
  player('ryan', 'pars', 3, 'Ryan Dahl'),
  player('jordy', 'pirates', 4, 'Jordy West'),
  player('connor', 'pirates', 5, 'Connor Grealy'),
  player('nick', 'pirates', 6, 'Nick Georgoulakis'),
  player('dan', 'pirates', 7, 'Dan Kramer'),
];

/** The grouping from the spec. */
const VALID: DraftGroup[] = [
  { name: '4-Ball 1', playerIds: ['jason', 'alan', 'jordy', 'connor'], sortOrder: 0 },
  { name: '4-Ball 2', playerIds: ['andrew', 'ryan', 'nick', 'dan'], sortOrder: 1 },
];

describe('checkFourBalls', () => {
  it('passes the intended 2 Pars + 2 Pirates grouping', () => {
    const result = checkFourBalls(VALID, ROSTER, TEAMS);
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.unassigned).toEqual([]);
  });

  it('catches a player in both 4-balls, and names them', () => {
    const groups: DraftGroup[] = [
      { name: '4-Ball 1', playerIds: ['jason', 'alan', 'jordy', 'connor'], sortOrder: 0 },
      { name: '4-Ball 2', playerIds: ['jason', 'ryan', 'nick', 'dan'], sortOrder: 1 },
    ];
    const result = checkFourBalls(groups, ROSTER, TEAMS);
    expect(result.ok).toBe(false);
    const messages = result.issues.map((i) => i.message).join(' ');
    expect(messages).toContain('Jason Dunbar is in more than one 4-ball');
    // Andrew fell out when Jason took his place.
    expect(messages).toContain('Andrew Rushmere is not in a 4-ball');
  });

  it('catches a player left out entirely', () => {
    const groups: DraftGroup[] = [
      { name: '4-Ball 1', playerIds: ['jason', 'alan', 'jordy', 'connor'], sortOrder: 0 },
      { name: '4-Ball 2', playerIds: ['andrew', 'ryan', 'nick'], sortOrder: 1 },
    ];
    const result = checkFourBalls(groups, ROSTER, TEAMS);
    expect(result.ok).toBe(false);
    expect(result.unassigned.map((p) => p.id)).toEqual(['dan']);
    expect(result.issues.some((i) => i.message.includes('Dan Kramer is not in a 4-ball'))).toBe(true);
    expect(result.issues.some((i) => i.message.includes('has 3 players, not 4'))).toBe(true);
  });

  it('errors on the wrong group size', () => {
    const groups: DraftGroup[] = [
      { name: '4-Ball 1', playerIds: ['jason', 'alan', 'jordy', 'connor', 'nick'], sortOrder: 0 },
      { name: '4-Ball 2', playerIds: ['andrew', 'ryan', 'dan'], sortOrder: 1 },
    ];
    const result = checkFourBalls(groups, ROSTER, TEAMS);
    expect(result.issues.filter((i) => i.level === 'error').length).toBeGreaterThan(0);
    const messages = result.issues.map((i) => i.message).join(' ');
    expect(messages).toContain('has 5 players, not 4');
    expect(messages).toContain('has 3 players, not 4');
  });

  it('warns — but does not error — on a 3/1 team split', () => {
    // Everyone is playing and every group has four; it is just lopsided.
    const groups: DraftGroup[] = [
      { name: '4-Ball 1', playerIds: ['jason', 'alan', 'andrew', 'jordy'], sortOrder: 0 },
      { name: '4-Ball 2', playerIds: ['ryan', 'connor', 'nick', 'dan'], sortOrder: 1 },
    ];
    const result = checkFourBalls(groups, ROSTER, TEAMS);
    expect(result.ok).toBe(false);
    expect(result.issues.every((i) => i.level === 'warning')).toBe(true);
    expect(result.issues[0].message).toContain('3 PARS / 1 PIRATES');
    expect(result.issues[0].message).toContain('normally 2 and 2');
  });
});

describe('swapPlayers', () => {
  it('exchanges two players across groups, keeping both at four', () => {
    const next = swapPlayers(VALID, 'alan', 'ryan');
    expect(next[0].playerIds).toEqual(['jason', 'ryan', 'jordy', 'connor']);
    expect(next[1].playerIds).toEqual(['andrew', 'alan', 'nick', 'dan']);
    expect(checkFourBalls(next, ROSTER, TEAMS).ok).toBe(true);
  });

  it('is a no-op when a player is swapped with themselves', () => {
    expect(swapPlayers(VALID, 'alan', 'alan')).toBe(VALID);
  });

  it('can never produce a duplicate or a missing player', () => {
    // Every possible swap of the eight players leaves a valid grouping.
    const ids = ROSTER.map((p) => p.id);
    for (const a of ids) {
      for (const b of ids) {
        const next = swapPlayers(VALID, a, b);
        const flat = next.flatMap((g) => g.playerIds);
        expect(new Set(flat).size).toBe(8);
        expect(next.every((g) => g.playerIds.length === 4)).toBe(true);
      }
    }
  });
});

describe('movePlayer', () => {
  it('moves a player into another group and out of their old one', () => {
    const next = movePlayer(VALID, 'alan', 1);
    expect(next[0].playerIds).toEqual(['jason', 'jordy', 'connor']);
    expect(next[1].playerIds).toEqual(['andrew', 'ryan', 'nick', 'dan', 'alan']);
  });

  it('does not duplicate when moving into the group they are already in', () => {
    const next = movePlayer(VALID, 'alan', 0);
    expect(next[0].playerIds.filter((id) => id === 'alan')).toHaveLength(1);
    expect(next[0].playerIds).toHaveLength(4);
  });
});

describe('defaultGroups', () => {
  it('deals eight players into two balanced 4-balls', () => {
    const groups = defaultGroups(ROSTER, TEAMS);
    expect(groups).toHaveLength(2);
    expect(checkFourBalls(groups, ROSTER, TEAMS).ok).toBe(true);
  });

  it('leaves nobody out with an awkward roster size', () => {
    const six = ROSTER.slice(0, 3).concat(ROSTER.slice(4, 7));
    const groups = defaultGroups(six, TEAMS);
    const flat = groups.flatMap((g) => g.playerIds);
    expect(new Set(flat).size).toBe(six.length);
  });
});

describe('groupsForEditing', () => {
  const saved: RoundGroup[] = [
    {
      id: 'g2',
      roundId: 'r',
      name: '4-Ball 2',
      playerIds: ['andrew', 'ryan', 'nick', 'dan'],
      sortOrder: 1,
      updatedBy: 'Alan',
      updatedAt: '2026-08-29T06:00:00.000Z',
    },
    {
      id: 'g1',
      roundId: 'r',
      name: '4-Ball 1',
      playerIds: ['jason', 'alan', 'jordy', 'connor'],
      sortOrder: 0,
      updatedBy: 'Alan',
      updatedAt: '2026-08-29T06:00:00.000Z',
    },
  ];

  it('uses what is saved, in sort order', () => {
    const groups = groupsForEditing(saved, ROSTER, TEAMS);
    expect(groups.map((g) => g.name)).toEqual(['4-Ball 1', '4-Ball 2']);
    expect(groups[0].id).toBe('g1');
  });

  it('falls back to a valid default when a round has none yet', () => {
    const groups = groupsForEditing([], ROSTER, TEAMS);
    expect(groups).toHaveLength(2);
    expect(checkFourBalls(groups, ROSTER, TEAMS).ok).toBe(true);
  });
});

describe('isDirty', () => {
  const saved: RoundGroup[] = VALID.map((g, i) => ({
    id: `g${i}`,
    roundId: 'r',
    name: g.name,
    playerIds: g.playerIds,
    sortOrder: g.sortOrder,
    updatedBy: 'seed',
    updatedAt: '2026-08-29T06:00:00.000Z',
  }));

  it('is false for an untouched draft', () => {
    expect(isDirty(VALID, saved)).toBe(false);
  });

  it('ignores the order players were listed in', () => {
    const reordered: DraftGroup[] = [
      { ...VALID[0], playerIds: ['connor', 'jordy', 'alan', 'jason'] },
      VALID[1],
    ];
    expect(isDirty(reordered, saved)).toBe(false);
  });

  it('is true once someone actually moves', () => {
    expect(isDirty(swapPlayers(VALID, 'alan', 'ryan'), saved)).toBe(true);
  });
});
