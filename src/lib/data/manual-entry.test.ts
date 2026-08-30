import { beforeEach, describe, expect, it } from 'vitest';
import { LocalTourStore } from './local-store';
import { buildSeedSnapshot } from '@/lib/seed/tour';
import type { TourSnapshot } from '@/lib/types';

/**
 * The two write paths added after Day 1 was lost, driven through the real
 * store rather than around it.
 *
 * The thing being protected is Day 1. It has been played; its handicaps and
 * its course setup are what the round was actually contested off. Nothing
 * added for Days 2-4 may reach it, and the one change it does accept — the
 * official result — must not disturb a single score.
 */

function installStorage() {
  const map = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    value: {
      localStorage: {
        getItem: (k: string) => map.get(k) ?? null,
        setItem: (k: string, v: string) => void map.set(k, v),
        removeItem: (k: string) => void map.delete(k),
      },
    },
    configurable: true,
    writable: true,
  });
  return map;
}

let store: LocalTourStore;
let snapshot: TourSnapshot;

async function reload() {
  store = new LocalTourStore();
  snapshot = await store.load();
}

beforeEach(async () => {
  installStorage();
  await reload();
});

const dayOne = () => snapshot.rounds.find((r) => r.dayNo === 1)!;
const dayTwo = () => snapshot.rounds.find((r) => r.dayNo === 2)!;
const dayThree = () => snapshot.rounds.find((r) => r.dayNo === 3)!;

const latest = () => (store as unknown as { snapshot: TourSnapshot }).snapshot;

describe('manual course handicaps', () => {
  it('every seeded round starts on the calculated formula', () => {
    expect(snapshot.rounds.every((r) => r.handicapSource === 'calculated')).toBe(true);
    expect(snapshot.roundHandicaps).toEqual([]);
  });

  it('stores what was entered, against that round only', async () => {
    const [a, b] = snapshot.players;
    await store.setRoundHandicaps({
      roundId: dayTwo().id,
      entries: [
        { playerId: a.id, courseHandicap: 15 },
        { playerId: b.id, courseHandicap: 28 },
      ],
      updatedBy: 'Alan',
    });

    const stored = latest().roundHandicaps;
    expect(stored).toHaveLength(2);
    expect(stored.every((h) => h.roundId === dayTwo().id)).toBe(true);
    expect(stored.find((h) => h.playerId === a.id)?.courseHandicap).toBe(15);
    expect(stored.find((h) => h.playerId === a.id)?.updatedBy).toBe('Alan');
  });

  it('cannot reach another round', async () => {
    const player = snapshot.players[0];
    await store.setRoundHandicaps({
      roundId: dayTwo().id,
      entries: [{ playerId: player.id, courseHandicap: 15 }],
      updatedBy: 'Alan',
    });
    await store.setRoundHandicaps({
      roundId: dayThree().id,
      entries: [{ playerId: player.id, courseHandicap: 9 }],
      updatedBy: 'Alan',
    });

    const forDay1 = latest().roundHandicaps.filter((h) => h.roundId === dayOne().id);
    expect(forDay1).toEqual([]);

    const byRound = Object.fromEntries(
      latest()
        .roundHandicaps.filter((h) => h.playerId === player.id)
        .map((h) => [h.roundId, h.courseHandicap]),
    );
    expect(byRound[dayTwo().id]).toBe(15);
    expect(byRound[dayThree().id]).toBe(9);
  });

  it('clears an entry rather than zeroing it, so the round stays incomplete', async () => {
    const player = snapshot.players[0];
    await store.setRoundHandicaps({
      roundId: dayTwo().id,
      entries: [{ playerId: player.id, courseHandicap: 15 }],
      updatedBy: 'Alan',
    });
    await store.setRoundHandicaps({
      roundId: dayTwo().id,
      entries: [{ playerId: player.id, courseHandicap: null }],
      updatedBy: 'Alan',
    });

    expect(latest().roundHandicaps).toEqual([]);
  });

  it('survives a reload', async () => {
    const player = snapshot.players[0];
    await store.setRoundHandicaps({
      roundId: dayTwo().id,
      entries: [{ playerId: player.id, courseHandicap: 15 }],
      updatedBy: 'Alan',
    });

    await reload();
    expect(snapshot.roundHandicaps).toHaveLength(1);
    expect(snapshot.roundHandicaps[0].courseHandicap).toBe(15);
  });
});

describe('organiser match results', () => {
  const dayOneMatches = () => snapshot.matches.filter((m) => m.roundId === dayOne().id);
  const dayThreeMatches = () => snapshot.matches.filter((m) => m.roundId === dayThree().id);

  it("awards Day 1's full point to the declared winner", async () => {
    const match = dayOneMatches()[0];
    const home = snapshot.sides.find((s) => s.matchId === match.id && s.sortOrder === 0)!;

    await store.setMatchResult({ matchId: match.id, outcome: 'home', enteredBy: 'Alan' });

    const result = latest().results.find((r) => r.matchId === match.id)!;
    expect(match.pointsValue).toBe(1);
    expect(result.winnerTeamId).toBe(home.teamId);
    expect(result.pointsHome).toBe(1);
    expect(result.pointsAway).toBe(0);
    expect(result.enteredBy).toBe('Alan');
  });

  it('splits a Day 1 halve', async () => {
    const match = dayOneMatches()[1];
    await store.setMatchResult({ matchId: match.id, outcome: 'halved', enteredBy: 'Alan' });

    const result = latest().results.find((r) => r.matchId === match.id)!;
    expect(result.pointsHome).toBe(0.5);
    expect(result.pointsAway).toBe(0.5);
    expect(result.winnerTeamId).toBeNull();
  });

  it('burns a Day 3 halve — nothing to either side', async () => {
    const match = dayThreeMatches()[0];
    await store.setMatchResult({ matchId: match.id, outcome: 'halved', enteredBy: 'Alan' });

    const result = latest().results.find((r) => r.matchId === match.id)!;
    expect(match.pointsValue).toBe(0.5);
    expect(result.pointsHome).toBe(0);
    expect(result.pointsAway).toBe(0);
  });

  it('still pays half a point for a Day 3 win', async () => {
    const match = dayThreeMatches()[0];
    await store.setMatchResult({ matchId: match.id, outcome: 'away', enteredBy: 'Alan' });

    const result = latest().results.find((r) => r.matchId === match.id)!;
    expect(result.pointsAway).toBe(0.5);
    expect(result.pointsHome).toBe(0);
  });

  it('replaces rather than stacks when the organiser changes their mind', async () => {
    const match = dayOneMatches()[0];
    await store.setMatchResult({ matchId: match.id, outcome: 'home', enteredBy: 'Alan' });
    await store.setMatchResult({ matchId: match.id, outcome: 'away', enteredBy: 'Alan' });

    const rows = latest().results.filter((r) => r.matchId === match.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].pointsAway).toBe(1);
  });

  it('clears back to hole-by-hole scoring', async () => {
    const match = dayOneMatches()[0];
    await store.setMatchResult({ matchId: match.id, outcome: 'home', enteredBy: 'Alan' });
    await store.setMatchResult({ matchId: match.id, outcome: null, enteredBy: 'Alan' });

    expect(latest().results.filter((r) => r.matchId === match.id)).toEqual([]);
  });

  it('does not touch a single score', async () => {
    const before = JSON.stringify(latest().scores);
    for (const match of dayOneMatches()) {
      await store.setMatchResult({ matchId: match.id, outcome: 'home', enteredBy: 'Alan' });
    }
    expect(JSON.stringify(latest().scores)).toBe(before);
  });

  it('does not touch Day 1 pairings, course or tee', async () => {
    const seed = buildSeedSnapshot();
    const before = {
      sides: JSON.stringify(seed.sides.filter((s) => dayOneMatches().some((m) => m.id === s.matchId))),
      round: JSON.stringify(seed.rounds.find((r) => r.dayNo === 1)),
      tees: JSON.stringify(seed.tees),
      holes: JSON.stringify(seed.holes),
    };

    for (const match of dayOneMatches()) {
      await store.setMatchResult({ matchId: match.id, outcome: 'halved', enteredBy: 'Alan' });
    }

    const after = latest();
    expect(
      JSON.stringify(after.sides.filter((s) => dayOneMatches().some((m) => m.id === s.matchId))),
    ).toBe(before.sides);
    expect(JSON.stringify(after.rounds.find((r) => r.dayNo === 1))).toBe(before.round);
    expect(JSON.stringify(after.tees)).toBe(before.tees);
    expect(JSON.stringify(after.holes)).toBe(before.holes);
  });

  it('survives a reset of the practice scores', async () => {
    // Rescoring cannot recreate a result somebody typed in about a round that
    // has already been played, so wiping the scores must leave it alone.
    const match = dayOneMatches()[0];
    await store.setMatchResult({ matchId: match.id, outcome: 'home', enteredBy: 'Alan' });

    await store.resetScores();

    expect(latest().scores).toEqual([]);
    expect(latest().results.find((r) => r.matchId === match.id)?.pointsHome).toBe(1);
  });
});
