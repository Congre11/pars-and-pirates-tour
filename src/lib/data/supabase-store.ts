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
  fromRoundHandicapRow,
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
  ENTITY_TO_KEY,
  cloneSnapshot,
  removeById,
  upsertById,
  isSameBall,
  ScoreConflictError,
  type AdminEntity,
  type BallRef,
  type AdminPatches,
  type SaveGroupsInput,
  type SaveMatchupsInput,
  type SetMatchResultInput,
  type SetRoundHandicapsInput,
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
  roundHandicaps: [],
  itinerary: [],
  activity: [],
  fines: [],
};

/**
 * The id given to a score that exists only on this device so far.
 *
 * A score is applied locally the instant it is tapped, before the server has
 * given the row an id. That placeholder has to be recognisable, because the
 * real row arrives over Realtime under a different (server-generated) id and
 * the two must not be allowed to coexist — see `applyChange`.
 */
const PENDING_SCORE_PREFIX = 'pending-';

function pendingScoreId(input: BallRef): string {
  // The side is part of the key: in a shared-ball format both sides score with
  // a null player id, so leaving it out would give the two teams' placeholders
  // the same id on every hole.
  return `${PENDING_SCORE_PREFIX}${input.matchId}-${input.holeNo}-${input.sideId}-${input.playerId ?? 'team'}`;
}

/**
 * The tables worth a live subscription.
 *
 * Every binding is registered again on each reconnect and re-checked against
 * Postgres for every row that changes, so subscribing to all fourteen tables
 * cost real database work for data that cannot move mid-round. These four are
 * the only ones that change while people are playing:
 *
 *   scores         — the hot path, every tap
 *   match_results  — written when a match closes out
 *   round_groups   — the 4-balls, rearranged on the first tee
 *   match_sides    — the matchups, re-paired between sections
 *
 * Courses, tees, holes, players, rounds, matches, itinerary, activity, fines
 * and the tour row are set up before play and arrive with the initial `load()`.
 * An edit to one of those shows up on other phones on their next load rather
 * than instantly, which is the right trade for a tour that is configured the
 * evening before and then left alone.
 */
const LIVE_TABLES = [
  'scores',
  'match_results',
  'round_groups',
  'match_sides',
] as const satisfies readonly RealtimeTable[];

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
      roundHandicaps,
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
      supabase.from('round_handicaps').select('*'),
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
      roundHandicaps,
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
      roundHandicaps: (roundHandicaps.data ?? []).map(fromRoundHandicapRow),
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

    let list = next[key] as Array<{ id: string }>;

    // The server's row for a ball supersedes this device's placeholder for it.
    // They carry different ids, so an upsert alone would leave both in the
    // snapshot: the real score AND a phantom holding this device's last tap.
    // Anything reading the ball by (match, hole, side, player) rather than by
    // id could then pick the phantom — including the `updatedAt` that the
    // conflict check is built on.
    if (table === 'scores') {
      const ball = mapped as unknown as Score;
      const phantomId = pendingScoreId(ball);
      list = list.filter((existing) => existing.id !== phantomId);
    }

    (next[key] as Array<{ id: string }>) =
      eventType === 'DELETE' ? removeById(list, mapped.id) : upsertById(list, mapped);

    this.emit(next);
  }

  subscribe(onChange: (snapshot: TourSnapshot) => void): () => void {
    this.listeners.add(onChange);

    const supabase = getBrowserSupabase();
    if (supabase && !this.channel) {
      const channel = supabase.channel('pars-pirates-live');
      for (const table of LIVE_TABLES) {
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
    const matches = (score: Score) => isSameBall(score, input);

    if (input.gross === null && !input.pickedUp) {
      next.scores = next.scores.filter((s) => !matches(s));
    } else {
      const existing = next.scores.find(matches);
      const row: Score = {
        id: existing?.id ?? pendingScoreId(input),
        matchId: input.matchId,
        holeNo: input.holeNo,
        sideId: input.sideId,
        playerId: input.playerId,
        gross: input.gross,
        pickedUp: input.pickedUp,
        enteredBy: input.enteredBy,
        // Only the database stamps a score. Inventing a client time here would
        // put this device's clock into the optimistic-concurrency check, so a
        // phone running a few minutes fast or slow would conflict with itself.
        // Carry the last known server time forward; null until there is one.
        updatedAt: existing?.updatedAt ?? null,
      };
      next.scores = existing
        ? next.scores.map((s) => (matches(s) ? row : s))
        : [...next.scores, row];
    }
    this.emit(next);
  }

  /**
   * Drop this device's placeholder for a ball after the server has refused it.
   *
   * Used when a write loses a conflict: the optimistic row is now known to be
   * wrong, and leaving it in place would keep the screen — and the next
   * `expectedUpdatedAt` — anchored to a score the database never accepted.
   * A row the server HAS accepted (a real id) is left alone; the correct
   * version of it arrives over Realtime.
   */
  discardPendingScore(input: BallRef): void {
    const phantomId = pendingScoreId(input);
    if (!this.snapshot.scores.some((s) => s.id === phantomId)) return;
    const next = cloneSnapshot(this.snapshot);
    next.scores = next.scores.filter((s) => s.id !== phantomId);
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

  /**
   * Save a round's manual course handicaps.
   *
   * Applied to the snapshot after the server accepts it, like an admin edit:
   * `round_handicaps` is not a realtime table — handicaps are set before play,
   * the same argument that keeps `players` off the live list — so without this
   * the screen would show the old numbers until a reload.
   */
  async setRoundHandicaps(input: SetRoundHandicapsInput): Promise<void> {
    const response = await fetch('/api/admin/round-handicaps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(body.error ?? 'Could not save the course handicaps');
    }

    const updatedAt = new Date().toISOString();
    const next = cloneSnapshot(this.snapshot);
    const kept = next.roundHandicaps.filter((h) => h.roundId === input.roundId);
    const byPlayer = new Map(kept.map((h) => [h.playerId, h]));
    for (const entry of input.entries) {
      if (entry.courseHandicap === null) byPlayer.delete(entry.playerId);
      else
        byPlayer.set(entry.playerId, {
          roundId: input.roundId,
          playerId: entry.playerId,
          courseHandicap: entry.courseHandicap,
          updatedBy: input.updatedBy,
          updatedAt,
        });
    }
    next.roundHandicaps = [
      ...next.roundHandicaps.filter((h) => h.roundId !== input.roundId),
      ...byPlayer.values(),
    ];
    this.emit(next);
  }

  /**
   * Declare or clear an organiser result.
   *
   * `match_results` IS a realtime table, so every other phone picks this up on
   * its own. The row the server returns is applied here too, so the device
   * that entered it does not wait on the round trip.
   */
  async setMatchResult(input: SetMatchResultInput): Promise<void> {
    const response = await fetch('/api/admin/match-result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const body = await response.json().catch(() => ({ error: response.statusText }));
    if (!response.ok) throw new Error(body.error ?? 'Could not save the result');

    const next = cloneSnapshot(this.snapshot);
    next.results = next.results.filter((r) => r.matchId !== input.matchId);
    if (body.result) next.results.push(fromResultRow(body.result));
    this.emit(next);
  }

  async saveMatchups(input: SaveMatchupsInput): Promise<void> {
    const response = await fetch('/api/matchups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(body.error ?? 'Could not save the matchups');
    }
  }

  /**
   * Fold an admin edit into the snapshot this device is holding.
   *
   * Realtime does not cover these. Only four tables are subscribed — scores,
   * match_results, round_groups and match_sides — because subscribing to all
   * fourteen cost real database work for rows that cannot move mid-round, and
   * widening that list again is what caused the load incident. Everything
   * else therefore arrives only on the next `load()`.
   *
   * Which meant an admin edit was written to Postgres and then invisible: a
   * handicap saved from Tour settings left every course-handicap figure,
   * strokes table and scorecard on the screen showing the old number until
   * someone reloaded the page, with no error to explain it.
   *
   * So the change is applied here, the same way `applyScoreLocally` applies a
   * score — the difference being that a score is applied optimistically before
   * the write, while these are applied after the server has accepted it. An
   * admin edit is not on the hot path, so there is nothing to gain by guessing
   * ahead of the answer, and a failed write leaves the screen truthful.
   */
  private applyEntityLocally(entity: AdminEntity, id: string, patch: object): void {
    const next = cloneSnapshot(this.snapshot);

    if (entity === 'tour') {
      next.tour = { ...next.tour, ...patch } as TourSnapshot['tour'];
    } else {
      const key = ENTITY_TO_KEY[entity] as Exclude<keyof TourSnapshot, 'tour'>;
      const list = next[key] as Array<{ id: string }>;
      (next[key] as Array<{ id: string }>) = list.map((row) =>
        row.id === id ? { ...row, ...patch } : row,
      );
    }

    this.emit(next);
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
    this.applyEntityLocally(entity, id, patch as object);
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
    const id = body.id as string;

    // The id comes back from Postgres, so the new row is added with the same
    // id the next `load()` will bring — no duplicate when the two meet.
    if (id && entity !== 'tour') {
      const next = cloneSnapshot(this.snapshot);
      const key = ENTITY_TO_KEY[entity] as Exclude<keyof TourSnapshot, 'tour'>;
      (next[key] as Array<{ id: string }>) = upsertById(next[key] as Array<{ id: string }>, {
        ...(row as object),
        id,
      } as { id: string });
      this.emit(next);
    }

    return id;
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

    // The tour row cannot be deleted; the route rejects it too.
    if (entity === 'tour') return;
    const next = cloneSnapshot(this.snapshot);
    const key = ENTITY_TO_KEY[entity] as Exclude<keyof TourSnapshot, 'tour'>;
    (next[key] as Array<{ id: string }>) = removeById(next[key] as Array<{ id: string }>, id);
    this.emit(next);
  }

  async resetScores(): Promise<void> {
    const response = await fetch('/api/admin/reset-scores', { method: 'POST' });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(body.error ?? 'Could not reset scores');
    }
  }
}
