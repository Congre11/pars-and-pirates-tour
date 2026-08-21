import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseTourStore } from './supabase-store';
import type { TourSnapshot } from '@/lib/types';

/**
 * An admin edit in Supabase mode is written over HTTP and is NOT covered by
 * realtime: only four tables are subscribed, and widening that list is what
 * caused the load incident. So the store has to fold the change into its own
 * snapshot, or the write lands in Postgres and the screen goes on showing the
 * old number until someone reloads — which is exactly what happened to a
 * handicap saved from Tour settings.
 */

/** Capture what the store publishes to its subscribers. */
function watch(store: SupabaseTourStore) {
  const seen: TourSnapshot[] = [];
  const stop = store.subscribe((s) => seen.push(s));
  return { seen, stop, latest: () => seen[seen.length - 1] };
}

function mockFetch(responses: Array<{ ok?: boolean; body?: unknown; status?: number }>) {
  const calls: Array<{ method: string; body: unknown }> = [];
  let i = 0;
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    calls.push({ method: init.method ?? 'GET', body: JSON.parse(String(init.body ?? '{}')) });
    const next = responses[Math.min(i++, responses.length - 1)];
    return {
      ok: next.ok ?? true,
      status: next.status ?? 200,
      statusText: 'stub',
      json: async () => next.body ?? { ok: true },
    } as Response;
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('admin edits reach the screen without a reload', () => {
  it('adds an inserted row to the snapshot under the id Postgres gave it', async () => {
    const store = new SupabaseTourStore();
    const w = watch(store);
    mockFetch([{ body: { id: 'fine-1' } }]);

    const id = await store.insert('fines', { reason: 'Three-putt', amount: 20 });

    expect(id).toBe('fine-1');
    expect(w.latest().fines).toHaveLength(1);
    expect(w.latest().fines[0]).toMatchObject({ id: 'fine-1', reason: 'Three-putt', amount: 20 });
    w.stop();
  });

  it('applies an update, so a saved handicap is visible immediately', async () => {
    const store = new SupabaseTourStore();
    const w = watch(store);
    mockFetch([{ body: { id: 'p1' } }, { body: { ok: true } }]);

    await store.insert('players', { name: 'Jason Dunbar', handicapIndex: 11.3 });
    expect(w.latest().players[0].handicapIndex).toBe(11.3);

    await store.update('players', 'p1', { handicapIndex: 7.7, handicapSource: 'manual' });

    expect(w.latest().players[0].handicapIndex).toBe(7.7);
    expect(w.latest().players[0].handicapSource).toBe('manual');
    // The rest of the row survives the merge.
    expect(w.latest().players[0].name).toBe('Jason Dunbar');
    w.stop();
  });

  it('removes a deleted row', async () => {
    const store = new SupabaseTourStore();
    const w = watch(store);
    mockFetch([{ body: { id: 'f1' } }, { body: { ok: true } }]);

    await store.insert('fines', { reason: 'Lost ball', amount: 10 });
    await store.remove('fines', 'f1');

    expect(w.latest().fines).toEqual([]);
    w.stop();
  });

  it('publishes a NEW snapshot object, so React re-renders', async () => {
    const store = new SupabaseTourStore();
    const w = watch(store);
    mockFetch([{ body: { id: 'p1' } }, { body: { ok: true } }]);

    await store.insert('players', { name: 'Alan Hector', handicapIndex: 22 });
    const before = w.latest();
    await store.update('players', 'p1', { handicapIndex: 18 });

    expect(w.latest()).not.toBe(before);
    expect(w.latest().players).not.toBe(before.players);
  });

  it('leaves the snapshot alone when the write is rejected', async () => {
    const store = new SupabaseTourStore();
    const w = watch(store);
    mockFetch([{ body: { id: 'p1' } }, { ok: false, status: 500, body: { error: 'nope' } }]);

    await store.insert('players', { name: 'Ryan Dahl', handicapIndex: 8.8 });
    const before = w.latest().players[0].handicapIndex;

    await expect(store.update('players', 'p1', { handicapIndex: 99 })).rejects.toThrow('nope');

    // The screen keeps showing what is actually in the database.
    expect(w.latest().players[0].handicapIndex).toBe(before);
    w.stop();
  });

  it('sends the same request it always did', async () => {
    const store = new SupabaseTourStore();
    const calls = mockFetch([{ body: { ok: true } }]);

    await store.update('players', 'p1', { handicapIndex: 7.7 });

    expect(calls[0].method).toBe('PATCH');
    expect(calls[0].body).toEqual({
      entity: 'players',
      id: 'p1',
      patch: { handicapIndex: 7.7 },
    });
  });
});
