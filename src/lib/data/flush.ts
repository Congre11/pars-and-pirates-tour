/**
 * Draining the durable score queue.
 *
 * Kept out of the provider so the loop itself can be tested: the rules below
 * were written after a two-device scoring test produced tens of thousands of
 * rejected writes in minutes, and they are the part that must not regress.
 *
 *  - The work list is read ONCE per cycle and then iterated. The queue lives
 *    in localStorage and `dequeue` re-reads it, so taking the loop's next item
 *    from storage meant that a store which had stopped accepting writes (full,
 *    or refusing them in private browsing) made every removal invisible and
 *    the same two or three writes were posted over and over, with no delay and
 *    no cap. Iterating a fixed list costs at most one attempt per queued write
 *    however storage behaves.
 *
 *  - A `score_conflict` is terminal. It means another device has already
 *    changed that hole, so the write is stale by definition and re-sending it
 *    can only be rejected again. It is dropped and reported, never retried.
 *
 *  - Everything else (no signal, a 500, a dead server) is transient. The write
 *    stays queued and the cycle stops there, so a flat network costs one
 *    request per cycle rather than one per queued score.
 */

import { dequeue, markAttempt, peekQueue, type QueuedWrite } from './offline-queue';
import { ScoreConflictError, type BallRef } from './store';

/** How many transient failures a single write is given before it is dropped. */
export const MAX_ATTEMPTS = 8;

export interface DrainHandlers {
  /** Send one queued write. Rejects with `ScoreConflictError` on a conflict. */
  send: (item: QueuedWrite) => Promise<void>;
  /** A write was refused because the hole moved. It has already been dropped. */
  onConflict: (item: BallRef, message: string) => void;
  /** A write failed `MAX_ATTEMPTS` times and has been dropped. */
  onGaveUp: (item: BallRef) => void;
}

export interface DrainResult {
  /** How many writes were actually sent. Never more than the queue length. */
  attempted: number;
  /** Conflicts seen this cycle. */
  conflicts: number;
  /** Queue length to report to the UI. */
  remaining: number;
}

export async function drainScoreQueue(handlers: DrainHandlers): Promise<DrainResult> {
  const items: QueuedWrite[] = peekQueue();
  const result: DrainResult = { attempted: 0, conflicts: 0, remaining: items.length };

  for (const item of items) {
    result.attempted += 1;
    try {
      await handlers.send(item);
      result.remaining = dequeue(item.key).length;
    } catch (err) {
      if (err instanceof ScoreConflictError) {
        result.conflicts += 1;
        result.remaining = dequeue(item.key).length;
        handlers.onConflict(item, err.message);
        continue;
      }

      const queue = markAttempt(item.key);
      const attempts = queue.find((q) => q.key === item.key)?.attempts ?? 0;
      if (attempts >= MAX_ATTEMPTS) {
        result.remaining = dequeue(item.key).length;
        handlers.onGaveUp(item);
      } else {
        result.remaining = queue.length;
      }
      break; // Transient — a later cycle picks up where this one left off.
    }
  }

  return result;
}
