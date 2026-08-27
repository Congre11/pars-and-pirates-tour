import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drainScoreQueue } from './flush';
import { clearQueue, enqueue, peekQueue } from './offline-queue';
import { ScoreConflictError, findBallScore, type SetScoreInput } from './store';
import { SupabaseTourStore } from './supabase-store';
import type { Score, TourSnapshot } from '@/lib/types';

/**
 * The two-device scoring incident.
 *
 * A laptop and a phone scored the same holes. The phone lost the optimistic
 * concurrency check, and within minutes Supabase had logged 43,000+ `40001`
 * `score_conflict` errors — the same two or three holes, over and over.
 *
 * Two defects combined to do that:
 *
 *   1. the flush loop took its next item from localStorage on every pass, so
 *      once a removal stopped persisting it re-sent the same writes forever;
 *   2. the optimistic row a device draws for a ball carried a different id
 *      from the server's row for that ball, so the two coexisted and the
 *      device kept sending its own clock as `expectedUpdatedAt` — a value the
 *      database could never agree with.
 *
 * Everything below exists to keep both shut.
 */

// --- a localStorage that can be told to stop accepting writes --------------
let storageWritesWork = true;
const cells = new Map<string, string>();

beforeEach(() => {
  storageWritesWork = true;
  cells.clear();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => cells.get(key) ?? null,
      setItem: (key: string, value: string) => {
        // Safari in private browsing, and any full store, throws here.
        if (!storageWritesWork) throw new Error('QuotaExceededError');
        cells.set(key, value);
      },
      removeItem: (key: string) => void cells.delete(key),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  cells.clear();
});

const write = (holeNo: number, overrides: Partial<SetScoreInput> = {}): SetScoreInput => ({
  matchId: 'match-1',
  holeNo,
  sideId: 'side-1',
  playerId: 'player-1',
  gross: 5,
  pickedUp: false,
  enteredBy: 'Alan',
  expectedUpdatedAt: '2026-08-27T10:00:00.000Z',
  ...overrides,
});

const CONFLICT = (holeNo: number) =>
  new ScoreConflictError(`score_conflict: hole ${holeNo} was updated by Connor Grealy`);

/** A `send` that always conflicts, and screams if it is called absurdly often. */
function conflictingSend(limit = 50) {
  const sent: number[] = [];
  return {
    sent,
    send: async (item: SetScoreInput) => {
      sent.push(item.holeNo);
      if (sent.length > limit) throw new Error(`runaway: ${sent.length} writes`);
      throw CONFLICT(item.holeNo);
    },
  };
}

const noHandlers = { onConflict: () => {}, onGaveUp: () => {} };

describe('the flush cycle cannot become a retry storm', () => {
  it('sends each queued write at most once when a dequeue never persists', async () => {
    for (const hole of [1, 2, 3]) enqueue(write(hole));
    expect(peekQueue()).toHaveLength(3);

    // From here every removal is silently lost, which is what turned the loop
    // into `hole 1, hole 2, hole 1, hole 2, ...` at full network speed.
    storageWritesWork = false;
    const { sent, send } = conflictingSend();

    const result = await drainScoreQueue({ send, ...noHandlers });

    expect(sent).toEqual([1, 2, 3]);
    expect(result.attempted).toBe(3);
    expect(result.conflicts).toBe(3);
  });

  it('costs one attempted write per cycle for one queued conflict', async () => {
    enqueue(write(7));
    const { sent, send } = conflictingSend();

    const result = await drainScoreQueue({ send, ...noHandlers });

    expect(sent).toEqual([7]);
    expect(result.attempted).toBe(1);
    expect(result.remaining).toBe(0);
  });

  it('never retries a conflict on later cycles', async () => {
    enqueue(write(4));
    const { sent, send } = conflictingSend();

    for (let cycle = 0; cycle < 20; cycle += 1) {
      await drainScoreQueue({ send, ...noHandlers });
    }

    expect(sent).toEqual([4]); // dropped on the first rejection, never resent
    expect(peekQueue()).toHaveLength(0);
  });

  it('still retries a transient failure, and gives up after eight attempts', async () => {
    enqueue(write(9));
    let sends = 0;
    const send = async () => {
      sends += 1;
      throw new Error('Failed to fetch');
    };
    const gaveUp: unknown[] = [];

    for (let cycle = 0; cycle < 20; cycle += 1) {
      await drainScoreQueue({ send, onConflict: () => {}, onGaveUp: (i) => gaveUp.push(i) });
    }

    expect(sends).toBe(8);
    expect(gaveUp).toHaveLength(1);
    expect(peekQueue()).toHaveLength(0);
  });

  it('stops the cycle at a transient failure instead of hammering the rest', async () => {
    for (const hole of [1, 2, 3]) enqueue(write(hole));
    let sends = 0;
    const send = async () => {
      sends += 1;
      throw new Error('Failed to fetch');
    };

    await drainScoreQueue({ send, ...noHandlers });

    expect(sends).toBe(1);
    expect(peekQueue()).toHaveLength(3);
  });

  it('keeps one queued write per ball however often it is re-tapped', () => {
    clearQueue();
    enqueue(write(1, { gross: 4 }));
    enqueue(write(1, { gross: 5 }));
    enqueue(write(1, { gross: 6 }));

    expect(peekQueue()).toHaveLength(1);
    expect(peekQueue()[0].gross).toBe(6);
  });
});

// ---------------------------------------------------------------------------

/** The row Postgres would broadcast for a ball. */
const serverRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'score-uuid-1',
  match_id: 'match-1',
  hole_no: 1,
  side_id: 'side-1',
  player_id: 'player-1',
  gross: 4,
  picked_up: false,
  entered_by: 'Connor Grealy',
  updated_at: '2026-08-27T10:05:00.000Z',
  ...overrides,
});

/** Reach the store's realtime handler without standing up a websocket. */
function realtime(store: SupabaseTourStore, eventType: string, row: Record<string, unknown>) {
  (
    store as unknown as {
      applyChange: (t: string, e: string, r: Record<string, unknown>) => void;
    }
  ).applyChange('scores', eventType, row);
}

const snapshotOf = (store: SupabaseTourStore) =>
  (store as unknown as { snapshot: TourSnapshot }).snapshot;

const ball = { matchId: 'match-1', holeNo: 1, sideId: 'side-1', playerId: 'player-1' };

describe('the optimistic row never outlives the server row', () => {
  it('replaces the pending row when the real one arrives over realtime', () => {
    const store = new SupabaseTourStore();
    store.applyScoreLocally(write(1, { gross: 6 }));

    const pending = snapshotOf(store).scores;
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toMatch(/^pending-/);

    realtime(store, 'INSERT', serverRow({ gross: 6, entered_by: 'Alan' }));

    const after = snapshotOf(store).scores;
    expect(after).toHaveLength(1); // not two rows for one ball
    expect(after[0].id).toBe('score-uuid-1');
  });

  it('leaves nothing behind when the server row is deleted', () => {
    const store = new SupabaseTourStore();
    store.applyScoreLocally(write(1, { gross: 6 }));
    realtime(store, 'DELETE', serverRow());

    expect(snapshotOf(store).scores).toHaveLength(0);
  });

  it('keeps the two sides of a shared ball apart', () => {
    const store = new SupabaseTourStore();
    store.applyScoreLocally(write(1, { playerId: null, sideId: 'side-1', gross: 4 }));
    store.applyScoreLocally(write(1, { playerId: null, sideId: 'side-2', gross: 5 }));

    const ids = snapshotOf(store).scores.map((s) => s.id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe('expectedUpdatedAt comes from the database, never the device', () => {
  it('is null while the score exists only on this device', () => {
    const store = new SupabaseTourStore();
    store.applyScoreLocally(write(1, { gross: 6 }));

    // This is what ScoreEntry reads and sends as `expectedUpdatedAt`.
    const found = findBallScore(snapshotOf(store).scores, ball);
    expect(found?.updatedAt).toBeNull();
  });

  it('is the server timestamp once the row has been broadcast', () => {
    const store = new SupabaseTourStore();
    store.applyScoreLocally(write(1, { gross: 6 }));
    realtime(store, 'INSERT', serverRow({ updated_at: '2026-08-27T10:05:00.000Z' }));

    expect(findBallScore(snapshotOf(store).scores, ball)?.updatedAt).toBe(
      '2026-08-27T10:05:00.000Z',
    );
  });

  it('follows the other device when they correct the hole', () => {
    const store = new SupabaseTourStore();
    store.applyScoreLocally(write(1, { gross: 6 }));
    realtime(store, 'INSERT', serverRow({ gross: 6, updated_at: '2026-08-27T10:00:00.000Z' }));
    realtime(store, 'UPDATE', serverRow({ gross: 4, updated_at: '2026-08-27T10:05:00.000Z' }));

    const found = findBallScore(snapshotOf(store).scores, ball);
    expect(found?.gross).toBe(4);
    expect(found?.updatedAt).toBe('2026-08-27T10:05:00.000Z');
  });

  it('re-tapping a hole does not stamp a client time onto the row', () => {
    const store = new SupabaseTourStore();
    realtime(store, 'INSERT', serverRow({ updated_at: '2026-08-27T10:05:00.000Z' }));
    store.applyScoreLocally(write(1, { gross: 7 }));

    const found = findBallScore(snapshotOf(store).scores, ball);
    expect(found?.gross).toBe(7);
    expect(found?.updatedAt).toBe('2026-08-27T10:05:00.000Z');
  });
});

describe('two devices on the same hole', () => {
  it('costs the losing device one write, then nothing', async () => {
    const store = new SupabaseTourStore();

    // The phone taps a 6 on hole 1 — applied locally, queued durably.
    store.applyScoreLocally(write(1, { gross: 6 }));
    enqueue(write(1, { gross: 6 }));

    // The laptop's 4 lands first and arrives over realtime.
    realtime(store, 'INSERT', serverRow({ gross: 4, updated_at: '2026-08-27T10:05:00.000Z' }));

    // The phone's write is now stale, so the server refuses it.
    const sent: number[] = [];
    const send = async (item: SetScoreInput) => {
      sent.push(item.holeNo);
      if (sent.length > 20) throw new Error('runaway');
      throw CONFLICT(item.holeNo);
    };
    const messages: string[] = [];

    for (let cycle = 0; cycle < 20; cycle += 1) {
      await drainScoreQueue({
        send,
        onConflict: (item, message) => {
          store.discardPendingScore(item);
          messages.push(message);
        },
        onGaveUp: () => {},
      });
    }

    expect(sent).toEqual([1]); // one attempt in total, across twenty cycles
    expect(messages).toEqual(['score_conflict: hole 1 was updated by Connor Grealy']);
    expect(peekQueue()).toHaveLength(0);

    // And the phone is now showing the laptop's score, with the server's time.
    const rows: Score[] = snapshotOf(store).scores;
    expect(rows).toHaveLength(1);
    expect(rows[0].gross).toBe(4);
    expect(findBallScore(rows, ball)?.updatedAt).toBe('2026-08-27T10:05:00.000Z');
  });

  it('stays bounded even when the phone cannot persist the dequeue', async () => {
    // The pathological case: the losing device is also the one whose storage
    // has stopped accepting writes, so the queued write can never be removed.
    // That must degrade to one attempt per cycle, not an open-ended loop.
    const store = new SupabaseTourStore();
    store.applyScoreLocally(write(1, { gross: 6 }));
    enqueue(write(1, { gross: 6 }));
    realtime(store, 'INSERT', serverRow({ gross: 4 }));
    storageWritesWork = false;

    const { sent, send } = conflictingSend(30);
    const CYCLES = 20;
    for (let cycle = 0; cycle < CYCLES; cycle += 1) {
      await drainScoreQueue({
        send,
        onConflict: (item) => store.discardPendingScore(item),
        onGaveUp: () => {},
      });
    }

    expect(sent).toHaveLength(CYCLES); // one per cycle — never more
  });

  it('drops the losing optimistic row even when the hole was blank before', async () => {
    const store = new SupabaseTourStore();
    store.applyScoreLocally(write(1, { gross: 6 }));
    enqueue(write(1, { gross: 6 }));
    expect(snapshotOf(store).scores).toHaveLength(1);

    await drainScoreQueue({
      send: async (item) => {
        throw CONFLICT(item.holeNo);
      },
      onConflict: (item) => store.discardPendingScore(item),
      onGaveUp: () => {},
    });

    // Nothing rejected is left on screen pretending to be saved.
    expect(snapshotOf(store).scores).toHaveLength(0);
  });
});

describe('a 409 from the write route is a conflict, not a retryable error', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('throws ScoreConflictError so the queue drops the write', async () => {
    const store = new SupabaseTourStore();
    vi.stubGlobal(
      'fetch',
      async () =>
        ({
          ok: false,
          status: 409,
          statusText: 'Conflict',
          json: async () => ({ error: 'Someone else updated this hole while you were typing.' }),
        }) as Response,
    );

    await expect(store.setScore(write(1))).rejects.toBeInstanceOf(ScoreConflictError);
  });
});
