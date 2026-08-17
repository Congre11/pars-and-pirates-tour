'use client';

/**
 * The real store: Postgres reads over the anon key, live updates over Supabase
 * Realtime, and writes proxied through this app's own server API routes (which
 * hold the service_role key and check the PIN cookie).
 *
 * Reads and realtime are direct-to-Supabase because that is what makes updates
 * arrive in a second or two rather than after a poll.
 */

import { getBrowserSupabase } from '@/lib/supabase/client';
import {
  ROW_MAPPERS,
  SNAPSHOT_KEYS,
  fromActivityRow,
  fromCourseRow,
  fromFineRow,
  fromHoleRow,
  fromItineraryRow,
  fromMatchRow,
  fromPlayerRow,
  fromResultRow,
  fromGroupRow,
  fromRoundRow,
  fromScoreRow,
  fromSideRow,
  fromTeamRow,
  fromTeeRow,
  fromTourRow,
  type RealtimeTable,
} from './mappers';
import {
  cloneSnapshot,
  removeById,
  upsertById,
  ScoreConflictError,
  type AdminEntity,
  type AdminPatches,
  type SaveGroupsInput,
  type SetScoreInput,
  type StoreMode,
  type TourStore,
} from './store';
import type { Score, TourSnapshot } from '@/lib/types';

const EMPTY: TourSnapshot = {
  tour: {
    id: '',
    name: 'Pars & Pirates Tour',
    year: new Date().getFullYear(),
    startDate: '',
    endDate: '',
    location: '',
    status: 'upcoming',
    winningTeamId: null,
    trophyName: null,
    settings: {} as TourSnapshot['tour']['settings'],
  },
  teams: [],
  players: [],
  courses: [],
  tees: [],
  holes: [],
  rounds: [],
  groups: [],
  matches: [],
  sides: [],
  scores: [],
  results: [],
  itinerary: [],
  activity: [],
  fines: [],
};

export class SupabaseTourStore implements TourStore {
  readonly mode: StoreMode = 'supabase';

  private snapshot: TourSnapshot = EMPTY;
  private listeners = new Set<(snapshot: TourSnapshot) => void>();
  private channel: ReturnType<NonNullable<ReturnType<typeof getBrowserSupabase>>['channel']> | null =
    null;

  private emit(next: TourSnapshot): void {
    this.snapshot = next;
    for (const listener of this.listeners) listener(next);
  }

  async load(): Promise<TourSnapshot> {
    const supabase = getBrowserSupabase();
    if (!supabase) throw new Error('Supabase is not configured');

    // One round trip per table, all in parallel. The whole tour is a few
    // hundred rows, so this is a single fast load rather than a paged fetch.
    const [
      tours,
      teams,
      players,
      courses,
      tees,
      holes,
      rounds,
      groups,
      matches,
      sides,
      scores,
      results,
      itinerary,
      activity,
      fines,
    ] = await Promise.all([
      supabase.from('tours').select('*').order('year', { ascending: false }).limit(1),
      supabase.from('teams').select('*').order('sort_order'),
      supabase.from('players').select('*').order('sort_order'),
      supabase.from('courses').select('*'),
      supabase.from('tees').select('*'),
      supabase.from('holes').select('*').order('hole_no'),
      supabase.from('rounds').select('*').order('sort_order'),
      supabase.from('round_groups').select('*').order('sort_order'),
      supabase.from('matches').select('*').order('sort_order'),
      supabase.from('match_sides').select('*').order('sort_order'),
      supabase.from('scores').select('*'),
      supabase.from('match_results').select('*'),
      supabase.from('itinerary_items').select('*').order('date').order('sort_order'),
      supabase.from('activity').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('fines').select('*').order('created_at', { ascending: false }),
    ]);

    const firstError = [
      tours,
      teams,
      players,
      courses,
      tees,
      holes,
      rounds,
      groups,
      matches,
      sides,
      scores,
      results,
      itinerary,
      activity,
      fines,
    ].find((r) => r.error)?.error;
    if (firstError) throw new Error(`Could not load the tour: ${firstError.message}`);

    if (!tours.data?.length) {
      throw new Error(
        'No tour found in the database. Run supabase/seed.sql in the Supabase SQL editor.',
      );
    }

    const snapshot: TourSnapshot = {
      tour: fromTourRow(tours.data[0]),
      teams: (teams.data ?? []).map(fromTeamRow),
      players: (players.data ?? []).map(fromPlayerRow),
      courses: (courses.data ?? []).map(fromCourseRow),
      tees: (tees.data ?? []).map(fromTeeRow),
      holes: (holes.data ?? []).map(fromHoleRow),
      rounds: (rounds.data ?? []).map(fromRoundRow),
      groups: (groups.data ?? []).map(fromGroupRow),
      matches: (matches.data ?? []).map(fromMatchRow),
      sides: (sides.data ?? []).map(fromSideRow),
      scores: (scores.data ?? []).map(fromScoreRow),
      results: (results.data ?? []).map(fromResultRow),
      itinerary: (itinerary.data ?? []).map(fromItineraryRow),
      activity: (activity.data ?? []).map(fromActivityRow),
      fines: (fines.data ?? []).map(fromFineRow),
    };

    this.emit(snapshot);
    return snapshot;
  }

  /**
   * Apply one realtime row change into the in-memory snapshot.
   *
   * Applying the row directly (rather than refetching) is what keeps the
   * update latency down to the websocket round trip.
   */
  private applyChange(table: RealtimeTable, eventType: string, row: Record<string, unknown>): void {
    const next = cloneSnapshot(this.snapshot);
    const key = SNAPSHOT_KEYS[table];

    if (table === 'match_results') {
      const mapped = fromResultRow(row);
      next.results =
        eventType === 'DELETE'
          ? next.results.filter((r) => r.matchId !== mapped.matchId)
          : [...next.results.filter((r) => r.matchId !== mapped.matchId), mapped];
      this.emit(next);
      return;
    }

    const mapper = ROW_MAPPERS[table] as (r: Record<string, unknown>) => { id: string };
    const mapped = mapper(row);
    if (!mapped.id) return;

    const list = next[key] as Array<{ id: string }>;
    (next[key] as Array<{ id: string }>) =
      eventType === 'DELETE' ? removeById(list, mapped.id) : upsertById(list, mapped);

    this.emit(next);
  }

  subscribe(onChange: (snapshot: TourSnapshot) => void): () => void {
    this.listeners.add(onChange);

    const supabase = getBrowserSupabase();
    if (supabase && !this.channel) {
      const channel = supabase.channel('pars-pirates-live');
      for (const table of Object.keys(SNAPSHOT_KEYS) as RealtimeTable[]) {
        channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          (payload: { eventType: string; new: unknown; old: unknown }) => {
            const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as Record<
              string,
              unknown
            >;
            if (row) this.applyChange(table, payload.eventType, row);
          },
        );
      }
      channel.subscribe();
      this.channel = channel;
    }

    return () => {
      this.listeners.delete(onChange);
      if (this.listeners.size === 0 && this.channel) {
        this.channel.unsubscribe();
        this.channel = null;
      }
    };
  }

  /** Optimistically apply a score locally so the UI responds instantly. */
  applyScoreLocally(input: SetScoreInput): void {
    const next = cloneSnapshot(this.snapshot);
    const matches = (score: Score) =>
      score.matchId === input.matchId &&
      score.holeNo === input.holeNo &&
      score.sideId === input.sideId &&
      (score.playerId ?? null) === (input.playerId ?? null);

    if (input.gross === null && !input.pickedUp) {
      next.scores = next.scores.filter((s) => !matches(s));
    } else {
      const existing = next.scores.find(matches);
      const row: Score = {
        id: existing?.id ?? `pending-${input.matchId}-${input.holeNo}-${input.playerId ?? 'team'}`,
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
        ? next.scores.map((s) => (matches(s) ? row : s))
        : [...next.scores, row];
    }
    this.emit(next);
  }

  async setScore(input: SetScoreInput): Promise<void> {
    const response = await fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (response.status === 409) {
      const body = await response.json().catch(() => ({ error: 'Conflict' }));
      throw new ScoreConflictError(body.error ?? 'Someone else changed this hole.');
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(body.error ?? 'Could not save the score');
    }
  }

  async saveGroups(input: SaveGroupsInput): Promise<void> {
    const response = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(body.error ?? 'Could not save the 4-balls');
    }
  }

  async update<K extends AdminEntity>(
    entity: K,
    id: string,
    patch: AdminPatches[K],
  ): Promise<void> {
    const response = await fetch('/api/admin/entity', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity, id, patch }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(body.error ?? 'Could not save the change');
    }
  }

  async insert<K extends AdminEntity>(
    entity: K,
    row: AdminPatches[K] & { id?: string },
  ): Promise<string> {
    const response = await fetch('/api/admin/entity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity, row }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(body.error ?? 'Could not create the row');
    }
    const body = await response.json();
    return body.id as string;
  }

  async remove(entity: AdminEntity, id: string): Promise<void> {
    const response = await fetch('/api/admin/entity', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity, id }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(body.error ?? 'Could not delete the row');
    }
  }

  async resetScores(): Promise<void> {
    const response = await fetch('/api/admin/reset-scores', { method: 'POST' });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(body.error ?? 'Could not reset scores');
    }
  }
}
