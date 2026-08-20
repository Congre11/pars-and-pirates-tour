'use client';

/**
 * The app's single source of live truth.
 *
 * Holds the tour snapshot, keeps it in sync (Supabase Realtime or, in demo
 * mode, a BroadcastChannel), runs the scoring engine over it and exposes the
 * results plus the one write method that matters: `setScore`.
 *
 * Scores are applied optimistically and queued durably, so tapping a score
 * feels instant and survives a dead patch of signal on the 14th.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { computeMatch, computeStandings, type MatchOutcome, type Standings } from '@/lib/scoring/engine';
import { halvesAwardNothing } from '@/lib/rounds/matchups';
import { LocalTourStore } from './local-store';
import { SupabaseTourStore } from './supabase-store';
import {
  dequeue,
  enqueue,
  markAttempt,
  peekQueue,
  queueKey,
  type QueuedWrite,
} from './offline-queue';
import {
  ScoreConflictError,
  type AdminEntity,
  type AdminPatches,
  type SaveGroupsInput,
  type SaveMatchupsInput,
  type SetScoreInput,
  type StoreMode,
  type TourStore,
} from './store';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import type {
  Course,
  Hole,
  Match,
  MatchSide,
  Player,
  Round,
  RoundGroup,
  Team,
  Tee,
  TourSnapshot,
} from '@/lib/types';

export interface TourContextValue {
  mode: StoreMode;
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  snapshot: TourSnapshot;

  // Lookups
  teamById: (id: string) => Team | undefined;
  playerById: (id: string) => Player | undefined;
  courseById: (id: string) => Course | undefined;
  teeById: (id: string) => Tee | undefined;
  holesForCourse: (courseId: string) => Hole[];
  roundById: (id: string) => Round | undefined;
  matchById: (id: string) => Match | undefined;
  /** The 4-balls for a round — who walks together, not who plays whom. */
  groupsForRound: (roundId: string) => RoundGroup[];
  /** Save a round's 4-balls. Open to everyone. */
  saveGroups: (input: SaveGroupsInput) => Promise<void>;
  /** Save who is playing whom. Open to everyone; only touches side line-ups. */
  saveMatchups: (input: SaveMatchupsInput) => Promise<void>;
  matchesForRound: (roundId: string) => Match[];
  sidesForMatch: (matchId: string) => MatchSide[];
  teesForCourse: (courseId: string) => Tee[];

  // Scoring
  outcomes: Map<string, MatchOutcome>;
  outcomeFor: (matchId: string) => MatchOutcome | undefined;
  standings: Standings;
  standingsForRound: (roundId: string) => Standings;

  // Writes
  setScore: (input: Omit<SetScoreInput, 'enteredBy'> & { enteredBy?: string }) => Promise<void>;
  update: <K extends AdminEntity>(entity: K, id: string, patch: AdminPatches[K]) => Promise<void>;
  insert: <K extends AdminEntity>(entity: K, row: AdminPatches[K] & { id?: string }) => Promise<string>;
  remove: (entity: AdminEntity, id: string) => Promise<void>;
  resetScores: () => Promise<void>;
  refresh: () => Promise<void>;

  // Connection health, shown in the header so nobody scores into a void.
  isOnline: boolean;
  pendingWrites: number;
  lastError: string | null;
  dismissError: () => void;
  /** Who this device attributes score entries to. */
  scorerName: string;
  setScorerName: (name: string) => void;
}

const TourContext = createContext<TourContextValue | null>(null);

function emptySnapshot(): TourSnapshot {
  return {
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
      settings: {
        pointsPerWin: 1,
        pointsPerHalf: 0.5,
        handicapMode: 'difference',
        handicapsEnabled: true,
        lockCompletedHoles: true,
        allowances: {
          team_scramble: { weights: [0.2, 0.15, 0.1, 0.05], rounding: 'nearest' },
          better_ball: { weights: [1], rounding: 'nearest' },
          singles: { weights: [1], rounding: 'nearest' },
          two_man_scramble: { weights: [0.5, 0.5], rounding: 'floor', then: { factor: 0.8, rounding: 'floor' } },
          shamble: { weights: [0.5, 0.5], rounding: 'floor', then: { factor: 0.8, rounding: 'floor' } },
          foursomes: { weights: [0.5, 0.5], rounding: 'nearest' },
        },
      },
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
}

/** Subscribe to the browser's own connectivity signal. */
function subscribeOnline(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

export function TourProvider({ children }: { children: ReactNode }) {
  // One store for the lifetime of the provider. A lazy useState initialiser
  // gives a stable instance without reading a ref during render.
  const [store] = useState<TourStore>(() =>
    isSupabaseConfigured ? new SupabaseTourStore() : new LocalTourStore(),
  );

  const [snapshot, setSnapshot] = useState<TourSnapshot>(emptySnapshot);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [pendingWrites, setPendingWrites] = useState(() =>
    typeof window === 'undefined' ? 0 : peekQueue().length,
  );
  // Read once at mount rather than syncing through an effect.
  const [scorerName, setScorerNameState] = useState(() =>
    typeof window === 'undefined'
      ? 'Someone'
      : (window.localStorage.getItem('pars-pirates:scorer') ?? 'Someone'),
  );

  // Connectivity is external state, so React reads it rather than mirroring it.
  const isOnline = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );

  const flushingRef = useRef(false);

  // --- Load + subscribe ---------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    const unsubscribe = store.subscribe((next) => {
      if (!cancelled) setSnapshot(next);
    });

    store
      .load()
      .then((next) => {
        if (cancelled) return;
        setSnapshot(next);
        setStatus('ready');
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setStatus('error');
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [store]);

  // --- Scorer name --------------------------------------------------------
  const setScorerName = useCallback((name: string) => {
    setScorerNameState(name);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('pars-pirates:scorer', name);
    }
  }, []);

  // --- Offline queue ------------------------------------------------------
  const flushQueue = useCallback(async () => {
    if (flushingRef.current) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    flushingRef.current = true;
    try {
      let queue: QueuedWrite[] = peekQueue();
      while (queue.length > 0) {
        const item = queue[0];
        try {
          await store.setScore(item);
          queue = dequeue(item.key);
        } catch (err) {
          if (err instanceof ScoreConflictError) {
            // Someone else's entry won. Drop ours and surface it — the fresh
            // value arrives over realtime, so the card stays truthful.
            queue = dequeue(item.key);
            setLastError(err.message);
          } else {
            queue = markAttempt(item.key);
            const attempts = queue.find((q) => q.key === item.key)?.attempts ?? 0;
            if (attempts >= 8) {
              queue = dequeue(item.key);
              setLastError('A score could not be saved after several attempts.');
            }
            break; // Stop; a later retry picks up where we left off.
          }
        }
      }
      setPendingWrites(queue.length);
    } finally {
      flushingRef.current = false;
    }
  }, [store]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const goOnline = () => void flushQueue();
    window.addEventListener('online', goOnline);
    // A steady retry catches the "phone says online but there is no signal"
    // case, which is the normal state of affairs on a golf course.
    const timer = window.setInterval(() => void flushQueue(), 8000);

    void flushQueue();

    return () => {
      window.removeEventListener('online', goOnline);
      window.clearInterval(timer);
    };
  }, [flushQueue]);

  // --- Writes -------------------------------------------------------------
  const setScore = useCallback(
    async (input: Omit<SetScoreInput, 'enteredBy'> & { enteredBy?: string }) => {
      const full: SetScoreInput = { ...input, enteredBy: input.enteredBy ?? scorerName };

      if (store instanceof SupabaseTourStore) {
        store.applyScoreLocally(full);
        const queue = enqueue(full);
        setPendingWrites(queue.length);
        try {
          await store.setScore(full);
          setPendingWrites(dequeue(queueKey(full)).length);
        } catch (err) {
          if (err instanceof ScoreConflictError) {
            setPendingWrites(dequeue(queueKey(full)).length);
            setLastError(err.message);
          }
          // Anything else stays queued for the retry loop.
        }
        return;
      }

      await store.setScore(full);
    },
    [scorerName, store],
  );

  const saveGroups = useCallback(
    (input: SaveGroupsInput) =>
      store.saveGroups(input).catch((err: Error) => {
        setLastError(err.message);
        throw err;
      }),
    [store],
  );

  const saveMatchups = useCallback(
    (input: SaveMatchupsInput) =>
      store.saveMatchups(input).catch((err: Error) => {
        setLastError(err.message);
        throw err;
      }),
    [store],
  );

  const update = useCallback(
    <K extends AdminEntity>(entity: K, id: string, patch: AdminPatches[K]) =>
      store.update(entity, id, patch).catch((err: Error) => {
        setLastError(err.message);
        throw err;
      }),
    [store],
  );

  const insert = useCallback(
    <K extends AdminEntity>(entity: K, row: AdminPatches[K] & { id?: string }) =>
      store.insert(entity, row).catch((err: Error) => {
        setLastError(err.message);
        throw err;
      }),
    [store],
  );

  const remove = useCallback(
    (entity: AdminEntity, id: string) =>
      store.remove(entity, id).catch((err: Error) => {
        setLastError(err.message);
        throw err;
      }),
    [store],
  );

  const resetScores = useCallback(() => store.resetScores(), [store]);
  const refresh = useCallback(async () => {
    const next = await store.load();
    setSnapshot(next);
  }, [store]);

  // --- Indexes ------------------------------------------------------------
  const indexes = useMemo(() => {
    const teams = new Map(snapshot.teams.map((t) => [t.id, t]));
    const players = new Map(snapshot.players.map((p) => [p.id, p]));
    const courses = new Map(snapshot.courses.map((c) => [c.id, c]));
    const tees = new Map(snapshot.tees.map((t) => [t.id, t]));
    const rounds = new Map(snapshot.rounds.map((r) => [r.id, r]));
    const matches = new Map(snapshot.matches.map((m) => [m.id, m]));

    const holesByCourse = new Map<string, Hole[]>();
    for (const hole of snapshot.holes) {
      const list = holesByCourse.get(hole.courseId) ?? [];
      list.push(hole);
      holesByCourse.set(hole.courseId, list);
    }
    for (const list of holesByCourse.values()) list.sort((a, b) => a.holeNo - b.holeNo);

    const teesByCourse = new Map<string, Tee[]>();
    for (const tee of snapshot.tees) {
      const list = teesByCourse.get(tee.courseId) ?? [];
      list.push(tee);
      teesByCourse.set(tee.courseId, list);
    }

    const groupsByRound = new Map<string, RoundGroup[]>();
    for (const group of snapshot.groups) {
      const list = groupsByRound.get(group.roundId) ?? [];
      list.push(group);
      groupsByRound.set(group.roundId, list);
    }
    for (const list of groupsByRound.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);

    const matchesByRound = new Map<string, Match[]>();
    for (const match of snapshot.matches) {
      const list = matchesByRound.get(match.roundId) ?? [];
      list.push(match);
      matchesByRound.set(match.roundId, list);
    }
    for (const list of matchesByRound.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);

    const sidesByMatch = new Map<string, MatchSide[]>();
    for (const side of snapshot.sides) {
      const list = sidesByMatch.get(side.matchId) ?? [];
      list.push(side);
      sidesByMatch.set(side.matchId, list);
    }
    for (const list of sidesByMatch.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);

    const scoresByMatch = new Map<string, typeof snapshot.scores>();
    for (const score of snapshot.scores) {
      const list = scoresByMatch.get(score.matchId) ?? [];
      list.push(score);
      scoresByMatch.set(score.matchId, list);
    }

    return {
      teams,
      players,
      courses,
      tees,
      rounds,
      matches,
      holesByCourse,
      teesByCourse,
      groupsByRound,
      matchesByRound,
      sidesByMatch,
      scoresByMatch,
    };
  }, [snapshot]);

  // --- Run the engine over every match -----------------------------------
  const outcomes = useMemo(() => {
    const result = new Map<string, MatchOutcome>();
    for (const match of snapshot.matches) {
      const round = indexes.rounds.get(match.roundId);
      if (!round) continue;
      const tee = indexes.tees.get(round.teeId);
      const holes = indexes.holesByCourse.get(round.courseId) ?? [];
      if (!tee || holes.length === 0) continue;

      result.set(
        match.id,
        computeMatch({
          match,
          sides: indexes.sidesByMatch.get(match.id) ?? [],
          players: snapshot.players,
          holes,
          tee,
          scores: indexes.scoresByMatch.get(match.id) ?? [],
          settings: snapshot.tour.settings,
          // A halve on a multi-section round (Day 3) pays nobody.
          halveAwardsNothing: halvesAwardNothing(indexes.matchesByRound.get(match.roundId) ?? []),
        }),
      );
    }
    return result;
  }, [snapshot, indexes]);

  const teamIds = useMemo(() => snapshot.teams.map((t) => t.id), [snapshot.teams]);

  const standings = useMemo(
    () => computeStandings([...outcomes.values()], indexes.sidesByMatch, teamIds),
    [outcomes, indexes.sidesByMatch, teamIds],
  );

  const standingsForRound = useCallback(
    (roundId: string) => {
      const roundMatches = indexes.matchesByRound.get(roundId) ?? [];
      const roundOutcomes = roundMatches
        .map((m) => outcomes.get(m.id))
        .filter((o): o is MatchOutcome => !!o);
      return computeStandings(roundOutcomes, indexes.sidesByMatch, teamIds);
    },
    [indexes.matchesByRound, indexes.sidesByMatch, outcomes, teamIds],
  );

  const value = useMemo<TourContextValue>(
    () => ({
      mode: store.mode,
      status,
      error,
      snapshot,
      teamById: (id) => indexes.teams.get(id),
      playerById: (id) => indexes.players.get(id),
      courseById: (id) => indexes.courses.get(id),
      teeById: (id) => indexes.tees.get(id),
      holesForCourse: (courseId) => indexes.holesByCourse.get(courseId) ?? [],
      teesForCourse: (courseId) => indexes.teesByCourse.get(courseId) ?? [],
      roundById: (id) => indexes.rounds.get(id),
      matchById: (id) => indexes.matches.get(id),
      groupsForRound: (roundId) => indexes.groupsByRound.get(roundId) ?? [],
      saveGroups,
      saveMatchups,
      matchesForRound: (roundId) => indexes.matchesByRound.get(roundId) ?? [],
      sidesForMatch: (matchId) => indexes.sidesByMatch.get(matchId) ?? [],
      outcomes,
      outcomeFor: (matchId) => outcomes.get(matchId),
      standings,
      standingsForRound,
      setScore,
      update,
      insert,
      remove,
      resetScores,
      refresh,
      isOnline,
      pendingWrites,
      lastError,
      dismissError: () => setLastError(null),
      scorerName,
      setScorerName,
    }),
    [
      store.mode,
      status,
      error,
      snapshot,
      indexes,
      outcomes,
      standings,
      standingsForRound,
      setScore,
      saveGroups,
      saveMatchups,
      update,
      insert,
      remove,
      resetScores,
      refresh,
      isOnline,
      pendingWrites,
      lastError,
      scorerName,
      setScorerName,
    ],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour(): TourContextValue {
  const context = useContext(TourContext);
  if (!context) throw new Error('useTour must be used inside <TourProvider>');
  return context;
}
