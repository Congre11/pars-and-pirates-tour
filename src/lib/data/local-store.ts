/**
 * Demo-mode store.
 *
 * When no Supabase credentials are configured the app runs entirely in the
 * browser: the tour is seeded into localStorage and a BroadcastChannel gives
 * genuine live updates between tabs on the same device.
 *
 * This exists so the app is usable the moment you clone it — you can walk
 * through every screen and score a full match before touching a database.
 * It is NOT multi-device: two phones in demo mode each keep their own scores.
 */

import { buildSeedSnapshot } from '@/lib/seed/tour';
import {
  cloneSnapshot,
  removeById,
  upsertById,
  type AdminEntity,
  type AdminPatches,
  type SaveGroupsInput,
  type SaveMatchupsInput,
  type SetScoreInput,
  type StoreMode,
  type TourStore,
} from './store';
import type { RoundGroup, Score, TourSnapshot } from '@/lib/types';

const STORAGE_KEY = 'pars-pirates:tour:v1';
const CHANNEL_NAME = 'pars-pirates:sync';

/** Snapshot array keys, so `update`/`insert` can address them generically. */
const ENTITY_TO_KEY: Record<AdminEntity, keyof TourSnapshot> = {
  tour: 'tour',
  teams: 'teams',
  players: 'players',
  courses: 'courses',
  tees: 'tees',
  holes: 'holes',
  rounds: 'rounds',
  matches: 'matches',
  sides: 'sides',
  itinerary: 'itinerary',
  fines: 'fines',
};

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `local-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export class LocalTourStore implements TourStore {
  readonly mode: StoreMode = 'demo';

  private snapshot: TourSnapshot;
  private listeners = new Set<(snapshot: TourSnapshot) => void>();
  private channel: BroadcastChannel | null = null;

  constructor() {
    this.snapshot = this.read();
  }

  private read(): TourSnapshot {
    if (typeof window === 'undefined') return buildSeedSnapshot();
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as TourSnapshot;
        // Guard against a half-written or outdated payload.
        if (parsed?.tour?.id && Array.isArray(parsed.matches)) {
          // Always refresh the seeded structure but keep the live scores, so a
          // seed fix (e.g. a corrected stroke index) reaches existing devices.
          const seed = buildSeedSnapshot();
          return {
            ...parsed,
            tour: { ...seed.tour, ...parsed.tour, settings: parsed.tour.settings ?? seed.tour.settings },
          };
        }
      }
    } catch {
      // Corrupt storage — fall through and reseed.
    }
    const seeded = buildSeedSnapshot();
    this.write(seeded);
    return seeded;
  }

  private write(snapshot: TourSnapshot): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Storage full or blocked (private browsing). The in-memory copy still
      // works for this session, so scoring keeps going.
    }
  }

  private commit(next: TourSnapshot, broadcast = true): void {
    this.snapshot = next;
    this.write(next);
    for (const listener of this.listeners) listener(next);
    if (broadcast && this.channel) {
      try {
        this.channel.postMessage({ type: 'snapshot' });
      } catch {
        // Channel closed.
      }
    }
  }

  async load(): Promise<TourSnapshot> {
    this.snapshot = this.read();
    return this.snapshot;
  }

  subscribe(onChange: (snapshot: TourSnapshot) => void): () => void {
    this.listeners.add(onChange);

    if (!this.channel && typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = () => {
        // Another tab wrote — reload from storage and notify locally only.
        this.snapshot = this.read();
        for (const listener of this.listeners) listener(this.snapshot);
      };
    }

    return () => {
      this.listeners.delete(onChange);
      if (this.listeners.size === 0 && this.channel) {
        this.channel.close();
        this.channel = null;
      }
    };
  }

  async setScore(input: SetScoreInput): Promise<void> {
    const next = cloneSnapshot(this.snapshot);
    const matchIndex = (score: Score) =>
      score.matchId === input.matchId &&
      score.holeNo === input.holeNo &&
      score.sideId === input.sideId &&
      (score.playerId ?? null) === (input.playerId ?? null);

    const existing = next.scores.find(matchIndex);

    if (input.gross === null && !input.pickedUp) {
      next.scores = next.scores.filter((s) => !matchIndex(s));
    } else {
      const row: Score = {
        id: existing?.id ?? randomId(),
        matchId: input.matchId,
        holeNo: input.holeNo,
        sideId: input.sideId,
        playerId: input.playerId,
        gross: input.gross,
        pickedUp: input.pickedUp,
        enteredBy: input.enteredBy,
        updatedAt: new Date().toISOString(),
      };
      next.scores = existing
        ? next.scores.map((s) => (matchIndex(s) ? row : s))
        : [...next.scores, row];
    }

    this.commit(next);
  }

  async saveGroups(input: SaveGroupsInput): Promise<void> {
    const next = cloneSnapshot(this.snapshot);
    const updatedAt = new Date().toISOString();

    const saved: RoundGroup[] = input.groups.map((group, index) => ({
      id: group.id ?? randomId(),
      roundId: input.roundId,
      name: group.name,
      playerIds: [...group.playerIds],
      sortOrder: group.sortOrder ?? index,
      updatedBy: input.updatedBy,
      updatedAt,
      confirmedAt: input.confirm ? updatedAt : null,
      confirmedBy: input.confirm ? input.updatedBy : null,
    }));

    // Replace this round's set, exactly as the server route does.
    next.groups = [...next.groups.filter((g) => g.roundId !== input.roundId), ...saved];
    this.commit(next);
  }

  async saveMatchups(input: SaveMatchupsInput): Promise<void> {
    const next = cloneSnapshot(this.snapshot);
    const byId = new Map(input.sides.map((s) => [s.id, s.playerIds]));
    next.sides = next.sides.map((side) =>
      byId.has(side.id) ? { ...side, playerIds: [...byId.get(side.id)!] } : side,
    );

    // Confirming stamps the matches; a plain edit clears any previous stamp,
    // because the pairings have moved since anyone last agreed them.
    const touched = new Set(input.matchIds);
    const stamp = input.confirm ? new Date().toISOString() : null;
    next.matches = next.matches.map((m) =>
      touched.has(m.id)
        ? {
            ...m,
            pairingsConfirmedAt: stamp,
            pairingsConfirmedBy: stamp ? (input.confirmedBy ?? 'A player') : null,
          }
        : m,
    );
    this.commit(next);
  }

  async update<K extends AdminEntity>(
    entity: K,
    id: string,
    patch: AdminPatches[K],
  ): Promise<void> {
    const next = cloneSnapshot(this.snapshot);
    if (entity === 'tour') {
      next.tour = { ...next.tour, ...(patch as object) } as TourSnapshot['tour'];
    } else {
      const key = ENTITY_TO_KEY[entity] as Exclude<keyof TourSnapshot, 'tour'>;
      const list = next[key] as Array<{ id: string }>;
      (next[key] as Array<{ id: string }>) = list.map((row) =>
        row.id === id ? { ...row, ...(patch as object) } : row,
      );
    }
    this.commit(next);
  }

  async insert<K extends AdminEntity>(
    entity: K,
    row: AdminPatches[K] & { id?: string },
  ): Promise<string> {
    const id = row.id ?? randomId();
    const next = cloneSnapshot(this.snapshot);
    const key = ENTITY_TO_KEY[entity] as Exclude<keyof TourSnapshot, 'tour'>;
    const list = next[key] as Array<{ id: string }>;
    (next[key] as Array<{ id: string }>) = upsertById(list, {
      ...(row as object),
      id,
    } as { id: string });
    this.commit(next);
    return id;
  }

  async remove(entity: AdminEntity, id: string): Promise<void> {
    if (entity === 'tour') return;
    const next = cloneSnapshot(this.snapshot);
    const key = ENTITY_TO_KEY[entity] as Exclude<keyof TourSnapshot, 'tour'>;
    (next[key] as Array<{ id: string }>) = removeById(next[key] as Array<{ id: string }>, id);
    this.commit(next);
  }

  async resetScores(): Promise<void> {
    const next = cloneSnapshot(this.snapshot);
    next.scores = [];
    next.results = [];
    this.commit(next);
  }

  /** Demo-only: throw the seeded tour away and start again. */
  async reseed(): Promise<void> {
    const seeded = buildSeedSnapshot();
    this.commit(seeded);
  }
}
