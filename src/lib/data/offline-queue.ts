/**
 * Offline resilience for score entry.
 *
 * Golf courses in Belek are not famous for their 5G. The spec makes offline
 * handling a MUST, so every score write is:
 *
 *   1. applied to the local snapshot immediately (the UI never waits),
 *   2. appended to a durable queue in localStorage,
 *   3. flushed to the server in order, retrying with backoff,
 *   4. removed from the queue only once the server has accepted it.
 *
 * If the phone dies mid-round the queue survives; reopening the app drains it.
 */

import type { SetScoreInput } from './store';

const QUEUE_KEY = 'pars-pirates:queue:v1';

export interface QueuedWrite extends SetScoreInput {
  queuedAt: number;
  attempts: number;
  /** Client-generated key so a retry cannot create a duplicate entry. */
  key: string;
}

export function queueKey(input: SetScoreInput): string {
  return `${input.matchId}:${input.holeNo}:${input.sideId}:${input.playerId ?? 'team'}`;
}

function readQueue(): QueuedWrite[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedWrite[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedWrite[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Nothing useful to do; the in-memory flush attempt still runs.
  }
}

/**
 * Add a write to the queue. A newer write for the same hole replaces the older
 * one — there is no value in sending "4" then "5" for the same hole, only "5".
 */
export function enqueue(input: SetScoreInput): QueuedWrite[] {
  const key = queueKey(input);
  const queue = readQueue().filter((item) => item.key !== key);
  queue.push({ ...input, key, queuedAt: Date.now(), attempts: 0 });
  writeQueue(queue);
  return queue;
}

export function peekQueue(): QueuedWrite[] {
  return readQueue();
}

export function dequeue(key: string): QueuedWrite[] {
  const queue = readQueue().filter((item) => item.key !== key);
  writeQueue(queue);
  return queue;
}

export function markAttempt(key: string): QueuedWrite[] {
  const queue = readQueue().map((item) =>
    item.key === key ? { ...item, attempts: item.attempts + 1 } : item,
  );
  writeQueue(queue);
  return queue;
}

export function clearQueue(): void {
  writeQueue([]);
}

export function queueLength(): number {
  return readQueue().length;
}
