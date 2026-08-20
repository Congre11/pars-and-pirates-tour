import { beforeEach, describe, expect, it } from 'vitest';
import { LocalTourStore } from './local-store';
import { SEED_VERSION, buildSeedSnapshot } from '@/lib/seed/tour';
import type { TourSnapshot } from '@/lib/types';

/**
 * Demo mode keeps the whole tour in localStorage, so a device that has opened
 * the app once has its own copy of the seed. Without a version check that copy
 * is permanent: a returning preview device went on showing the superseded Day
 * 1 and the superseded handicap allowances long after both had changed, with
 * nothing in the code wrong and nothing on screen to say why.
 */

const KEY = 'pars-pirates:tour:v1';

/** A minimal localStorage, since these tests run without a DOM. */
function installStorage() {
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
  Object.defineProperty(globalThis, 'window', {
    value: { localStorage: storage },
    configurable: true,
    writable: true,
  });
  return map;
}

/** What a device stored before the seed changed. */
function staleSnapshot(): Record<string, unknown> {
  const seed = buildSeedSnapshot();
  const day1 = seed.rounds.find((r) => r.dayNo === 1)!;
  return {
    ...seed,
    seedVersion: 1,
    tour: {
      ...seed.tour,
      settings: {
        ...seed.tour.settings,
        allowances: {
          ...seed.tour.settings.allowances,
          two_man_scramble: { weights: [0.35, 0.15], rounding: 'nearest' },
          shamble: { weights: [0.9], rounding: 'nearest' },
        },
      },
    },
    // The superseded Day 1: one 4-man scramble worth 2.
    matches: [
      {
        ...seed.matches[0],
        name: 'The Scramble',
        format: 'team_scramble',
        pointsValue: 2,
      },
      ...seed.matches.filter((m) => m.roundId !== day1.id),
    ],
  };
}

let storage: Map<string, string>;
beforeEach(() => {
  storage = installStorage();
});

describe('demo-mode seed migration', () => {
  it('serves the stored copy untouched when the seed has not moved', async () => {
    const seed = buildSeedSnapshot();
    storage.set(KEY, JSON.stringify({ ...seed, seedVersion: SEED_VERSION }));

    const snapshot = await new LocalTourStore().load();
    expect(snapshot.matches).toHaveLength(seed.matches.length);
  });

  it('rebuilds the structure when the stored copy predates the current seed', async () => {
    storage.set(KEY, JSON.stringify(staleSnapshot()));

    const snapshot = await new LocalTourStore().load();

    // The superseded Day 1 is gone.
    expect(snapshot.matches.some((m) => m.format === 'team_scramble')).toBe(false);
    // And the superseded allowances with it.
    expect(snapshot.tour.settings.allowances.two_man_scramble).toEqual({
      weights: [0.5, 0.5],
      rounding: 'floor',
      then: { factor: 0.8, rounding: 'floor' },
    });
    expect(snapshot.matches).toHaveLength(buildSeedSnapshot().matches.length);
  });

  it('keeps scores that people actually entered', async () => {
    const stale = staleSnapshot();
    const seed = buildSeedSnapshot();
    const liveMatch = seed.matches.find((m) => m.format === 'better_ball')!;
    (stale as { scores: unknown[] }).scores = [
      {
        id: 's1',
        matchId: liveMatch.id,
        holeNo: 1,
        sideId: 'x',
        playerId: null,
        gross: 4,
        pickedUp: false,
        enteredBy: 'Alan',
        updatedAt: '2026-08-30T10:00:00.000Z',
      },
    ];
    storage.set(KEY, JSON.stringify(stale));

    const snapshot = await new LocalTourStore().load();
    expect(snapshot.scores).toHaveLength(1);
    expect(snapshot.scores[0].gross).toBe(4);
  });

  it('drops scores whose match the seed no longer has', async () => {
    const stale = staleSnapshot();
    (stale as { scores: unknown[] }).scores = [
      {
        id: 's1',
        matchId: 'a-match-that-no-longer-exists',
        holeNo: 1,
        sideId: 'x',
        playerId: null,
        gross: 4,
        pickedUp: false,
        enteredBy: 'Alan',
        updatedAt: '2026-08-29T10:00:00.000Z',
      },
    ];
    storage.set(KEY, JSON.stringify(stale));

    const snapshot = await new LocalTourStore().load();
    expect(snapshot.scores).toEqual([]);
  });

  it('writes the current version back, so it migrates once and not every load', async () => {
    storage.set(KEY, JSON.stringify(staleSnapshot()));
    await new LocalTourStore().load();

    const written = JSON.parse(storage.get(KEY)!) as TourSnapshot & { seedVersion: number };
    expect(written.seedVersion).toBe(SEED_VERSION);
  });

  it('treats a copy with no version at all as the original seed', async () => {
    const stale = staleSnapshot();
    delete (stale as { seedVersion?: number }).seedVersion;
    storage.set(KEY, JSON.stringify(stale));

    const snapshot = await new LocalTourStore().load();
    expect(snapshot.matches.some((m) => m.format === 'team_scramble')).toBe(false);
  });
});
