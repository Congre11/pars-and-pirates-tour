import { describe, expect, it } from 'vitest';
import {
  describeConfirmation,
  groupsConfirmation,
  matchupsConfirmation,
  roundConfirmation,
} from './confirmation';
import type { Match, RoundGroup } from '@/lib/types';

/**
 * One person submitting is enough — that is the whole point of the rule, and
 * the thing most likely to be quietly turned into an approval chain by a later
 * change. These tests pin it down, along with the other half: any edit after a
 * submission drops it back to a draft.
 */

function group(overrides: Partial<RoundGroup> = {}): RoundGroup {
  return {
    id: 'g1',
    roundId: 'r1',
    name: '4-Ball 1',
    playerIds: ['p1', 'p2', 'p3', 'p4'],
    sortOrder: 0,
    updatedBy: 'Alan Hector',
    updatedAt: '2026-08-29T06:00:00.000Z',
    confirmedAt: null,
    confirmedBy: null,
    ...overrides,
  };
}

function match(overrides: Partial<Match> = {}): Match {
  return {
    id: 'm1',
    roundId: 'r1',
    name: 'Scramble 1',
    format: 'two_man_scramble',
    startHole: 1,
    endHole: 18,
    pointsValue: 1,
    allowanceOverride: null,
    pairingsConfirmedAt: null,
    pairingsConfirmedBy: null,
    status: 'upcoming',
    sortOrder: 0,
    ...overrides,
  };
}

describe('groupsConfirmation', () => {
  it('is not-set when a round has no 4-balls yet', () => {
    expect(groupsConfirmation([])).toEqual({ state: 'not-set', by: null, at: null });
  });

  it('is a draft while the 4-balls are saved but unsubmitted', () => {
    expect(groupsConfirmation([group(), group({ id: 'g2' })]).state).toBe('draft');
  });

  it('is confirmed once every group carries a stamp', () => {
    const stamped = { confirmedAt: '2026-08-29T07:00:00.000Z', confirmedBy: 'Alan Hector' };
    const result = groupsConfirmation([group(stamped), group({ id: 'g2', ...stamped })]);
    expect(result.state).toBe('confirmed');
    expect(result.by).toBe('Alan Hector');
  });

  it('needs one person, not several', () => {
    // The same name on both groups is a confirmation. Nothing counts votes.
    const result = groupsConfirmation([
      group({ confirmedAt: '2026-08-29T07:00:00.000Z', confirmedBy: 'Alan Hector' }),
      group({ id: 'g2', confirmedAt: '2026-08-29T07:00:00.000Z', confirmedBy: 'Alan Hector' }),
    ]);
    expect(result.state).toBe('confirmed');
  });

  it('falls back to a draft when one group has been edited since', () => {
    // The store clears the stamp on a plain save, so a half-stamped set is
    // exactly what an edit-after-submission looks like.
    const result = groupsConfirmation([
      group({ confirmedAt: '2026-08-29T07:00:00.000Z', confirmedBy: 'Alan Hector' }),
      group({ id: 'g2' }),
    ]);
    expect(result.state).toBe('draft');
    expect(result.by).toBeNull();
  });

  it('names whoever completed it, not whoever started', () => {
    const result = groupsConfirmation([
      group({ confirmedAt: '2026-08-29T07:00:00.000Z', confirmedBy: 'Alan Hector' }),
      group({ id: 'g2', confirmedAt: '2026-08-29T09:30:00.000Z', confirmedBy: 'Jordy West' }),
    ]);
    expect(result.by).toBe('Jordy West');
    expect(result.at).toBe('2026-08-29T09:30:00.000Z');
  });
});

describe('matchupsConfirmation', () => {
  it('reads the stamp off the matches', () => {
    expect(matchupsConfirmation([match()]).state).toBe('draft');
    expect(
      matchupsConfirmation([
        match({ pairingsConfirmedAt: '2026-08-29T07:00:00.000Z', pairingsConfirmedBy: 'Nick' }),
      ]).state,
    ).toBe('confirmed');
  });

  it('is not-set for a section with no matches in it', () => {
    expect(matchupsConfirmation([]).state).toBe('not-set');
  });

  it('treats one submitted section and one unsubmitted as a draft', () => {
    // Day 3's three six-hole sections are submitted separately, so the round
    // as a whole is only settled once all of them are.
    const result = matchupsConfirmation([
      match({ pairingsConfirmedAt: '2026-08-29T07:00:00.000Z', pairingsConfirmedBy: 'Nick' }),
      match({ id: 'm2' }),
    ]);
    expect(result.state).toBe('draft');
  });
});

describe('roundConfirmation', () => {
  const stampedGroup = group({
    confirmedAt: '2026-08-29T07:00:00.000Z',
    confirmedBy: 'Alan Hector',
  });
  const stampedMatch = match({
    pairingsConfirmedAt: '2026-08-29T08:00:00.000Z',
    pairingsConfirmedBy: 'Jordy West',
  });

  it('needs both the 4-balls and the matchups', () => {
    expect(roundConfirmation([stampedGroup], [stampedMatch]).state).toBe('confirmed');
    expect(roundConfirmation([stampedGroup], [match()]).state).toBe('draft');
    expect(roundConfirmation([group()], [stampedMatch]).state).toBe('draft');
  });

  it('reports the later of the two submissions', () => {
    const result = roundConfirmation([stampedGroup], [stampedMatch]);
    expect(result.by).toBe('Jordy West');
    expect(result.at).toBe('2026-08-29T08:00:00.000Z');
  });

  it('is not-set only when neither exists', () => {
    expect(roundConfirmation([], []).state).toBe('not-set');
    expect(roundConfirmation([group()], []).state).toBe('draft');
  });
});

describe('describeConfirmation', () => {
  it('names the person who submitted it', () => {
    expect(
      describeConfirmation({ state: 'confirmed', by: 'Alan Hector', at: 'x' }),
    ).toBe('Submitted by Alan Hector');
  });

  it('says what is missing when it is only a draft', () => {
    expect(describeConfirmation({ state: 'draft', by: null, at: null }, 'these 4-balls')).toBe(
      'Saved — nobody has submitted these 4-balls yet',
    );
  });

  it('says so plainly when nothing is set', () => {
    expect(describeConfirmation({ state: 'not-set', by: null, at: null })).toBe('Not set yet');
  });
});
