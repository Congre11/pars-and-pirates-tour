/**
 * The storage contract the whole app is written against.
 *
 * Two implementations exist:
 *
 *  - `local-store.ts`    — demo mode. Seeded data in the browser's own storage,
 *                          live-syncing between tabs. Needs no credentials.
 *  - `supabase-store.ts` — the real thing. Postgres + Supabase Realtime, so
 *                          every phone on the course updates within seconds.
 *
 * The UI never knows which one it is talking to.
 */

import type {
  Course,
  Fine,
  Hole,
  ItineraryItem,
  Match,
  MatchSide,
  Player,
  Round,
  Tee,
  Team,
  Tour,
  TourSnapshot,
} from '@/lib/types';

export type StoreMode = 'demo' | 'supabase';

export interface SetScoreInput {
  matchId: string;
  holeNo: number;
  sideId: string;
  /** Null for shared-ball formats (scramble, alternate shot). */
  playerId: string | null;
  /** Null + pickedUp false clears the entry. */
  gross: number | null;
  pickedUp: boolean;
  enteredBy: string;
  /**
   * The `updatedAt` this device last saw for the hole. When supplied the write
   * is rejected if someone else has changed it since — this is the conflict
   * protection the spec asks for. Admins pass null to force the correction.
   */
  expectedUpdatedAt?: string | null;
}

/** Everything an admin can edit, expressed as one narrow surface. */
export interface AdminPatches {
  tour: Partial<Tour>;
  teams: Partial<Team>;
  players: Partial<Player>;
  courses: Partial<Course>;
  tees: Partial<Tee>;
  holes: Partial<Hole>;
  rounds: Partial<Round>;
  matches: Partial<Match>;
  sides: Partial<MatchSide>;
  itinerary: Partial<ItineraryItem>;
  fines: Partial<Fine>;
}

export type AdminEntity = keyof AdminPatches;

export interface TourStore {
  readonly mode: StoreMode;
  /** Load the whole tour. Small enough (a few hundred rows) to fetch at once. */
  load(): Promise<TourSnapshot>;
  /**
   * Watch for changes. The callback receives a fresh snapshot; the store is
   * responsible for applying incoming realtime rows efficiently.
   * Returns an unsubscribe function.
   */
  subscribe(onChange: (snapshot: TourSnapshot) => void): () => void;
  /** The hot path. Must be fast and safe to call optimistically. */
  setScore(input: SetScoreInput): Promise<void>;
  /** Admin edits. */
  update<K extends AdminEntity>(entity: K, id: string, patch: AdminPatches[K]): Promise<void>;
  /** Insert a new row (itinerary items, fines, matches, sides). */
  insert<K extends AdminEntity>(entity: K, row: AdminPatches[K] & { id?: string }): Promise<string>;
  remove(entity: AdminEntity, id: string): Promise<void>;
  /** Wipe every score in the tour. Admin-only, used to reset after a test run. */
  resetScores(): Promise<void>;
}

export class ScoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScoreConflictError';
  }
}

/** Deep-clone a snapshot so React sees a new reference on every change. */
export function cloneSnapshot(snapshot: TourSnapshot): TourSnapshot {
  return {
    tour: { ...snapshot.tour },
    teams: [...snapshot.teams],
    players: [...snapshot.players],
    courses: [...snapshot.courses],
    tees: [...snapshot.tees],
    holes: [...snapshot.holes],
    rounds: [...snapshot.rounds],
    matches: [...snapshot.matches],
    sides: [...snapshot.sides],
    scores: [...snapshot.scores],
    results: [...snapshot.results],
    itinerary: [...snapshot.itinerary],
    activity: [...snapshot.activity],
    fines: [...snapshot.fines],
  };
}

/** Insert-or-replace a row in an array keyed by `id`. */
export function upsertById<T extends { id: string }>(list: T[], row: T): T[] {
  const index = list.findIndex((item) => item.id === row.id);
  if (index === -1) return [...list, row];
  const next = [...list];
  next[index] = row;
  return next;
}

export function removeById<T extends { id: string }>(list: T[], id: string): T[] {
  return list.filter((item) => item.id !== id);
}
