import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `set_score` rejects a stale write by raising with SQLSTATE `40001`.
 *
 * The client only treats a 409 as terminal; anything else is a transient
 * failure it will retry. So a conflict that reaches the browser as a 500 is
 * not a cosmetic problem — it puts a permanently-doomed write back into the
 * retry path. Matching the code as well as the message is what stops that:
 * the message is a string PostgREST may or may not carry through intact, the
 * SQLSTATE is not.
 */

const state = vi.hoisted(() => ({
  error: null as { code?: string; message?: string } | null,
}));

vi.mock('@/lib/auth/session', () => ({
  getSession: async () => ({ playerName: 'Alan' }),
}));

vi.mock('@/lib/supabase/admin', () => ({
  getServiceSupabase: () => ({
    rpc: async () => ({ data: state.error ? null : { id: 'score-1' }, error: state.error }),
  }),
}));

const { POST } = await import('./route');

const post = () =>
  POST(
    new Request('http://localhost/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        matchId: 'match-1',
        holeNo: 1,
        sideId: 'side-1',
        playerId: 'player-1',
        gross: 5,
        pickedUp: false,
        enteredBy: 'Alan',
        expectedUpdatedAt: '2026-08-27T10:00:00.000Z',
      }),
    }),
  );

beforeEach(() => {
  state.error = null;
});

describe('POST /api/scores', () => {
  it('answers 409 when Postgres raises SQLSTATE 40001', async () => {
    state.error = { code: '40001', message: 'unexpected wording from the pooler' };

    const response = await post();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('Someone else updated this hole'),
    });
  });

  it('answers 409 when the raised message names the conflict', async () => {
    state.error = {
      code: 'P0001',
      message: 'score_conflict: hole 1 was updated by Connor Grealy at 2026-08-27 10:05:00',
    };

    expect((await post()).status).toBe(409);
  });

  it('still answers 500 for a genuine failure, so it can be retried', async () => {
    state.error = { code: '08006', message: 'connection failure' };

    const response = await post();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'connection failure' });
  });

  it('answers 200 when the write lands', async () => {
    expect((await post()).status).toBe(200);
  });
});
