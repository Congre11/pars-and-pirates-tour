'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useTour } from '@/lib/data/provider';
import { useSession } from '@/lib/auth/session-provider';
import { AdminShell } from '@/components/admin/AdminShell';
import { Avatar, EmptyState, SectionTitle, Warning } from '@/components/ui';
import { courseHandicap } from '@/lib/scoring/handicap';
import { MANUAL_HANDICAPS_INCOMPLETE, manualHandicapStatus } from '@/lib/rounds/round-setup';
import { isRoundLocked } from '@/lib/types';

/**
 * Course handicaps for one round, typed in by hand.
 *
 * Built after a round was scored off the wrong tee. Two rules make that
 * impossible to repeat quietly:
 *
 *   - nothing is prefilled. The calculated figure is shown beside the field as
 *     a reference, never inside it, so every number here was deliberately
 *     typed by a person.
 *   - there is no fallback. A player left blank does not silently score off
 *     the formula — the round refuses to start and says so.
 */
export default function RoundHandicapsPage({ params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = use(params);
  const {
    snapshot,
    roundById,
    teeById,
    courseById,
    matchesForRound,
    sidesForMatch,
    roundHandicapsFor,
    setRoundHandicaps,
    update,
  } = useTour();
  const { session } = useSession();

  const round = roundById(roundId);
  const entered = roundHandicapsFor(roundId);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!round) {
    return (
      <AdminShell title="Course handicaps">
        <EmptyState
          title="Round not found"
          cta={
            <Link href="/admin/rounds" className="btn-ghost mt-2">
              Back to rounds
            </Link>
          }
        />
      </AdminShell>
    );
  }

  const locked = isRoundLocked(round);
  const tee = teeById(round.teeId);
  const course = courseById(round.courseId);

  // Everyone actually playing this round, in team order.
  const playingIds = new Set(
    matchesForRound(roundId).flatMap((match) =>
      sidesForMatch(match.id).flatMap((side) => side.playerIds),
    ),
  );
  const players = snapshot.players.filter((player) => playingIds.has(player.id));
  const status = manualHandicapStatus(round, players, entered);

  const save = async (playerId: string, value: number | null) => {
    setBusy(playerId);
    setError(null);
    try {
      await setRoundHandicaps({
        roundId,
        entries: [{ playerId, courseHandicap: value }],
        updatedBy: session?.playerName ?? 'Organiser',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that handicap.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminShell title="Course handicaps" subtitle={`${round.name} · ${course?.name ?? ''}`}>
      {locked ? (
        <Warning>
          Day {round.dayNo} is complete. Its course handicaps are what the round was actually played
          off and cannot be changed. If the result is wrong, set it on{' '}
          <Link href="/admin/results" className="underline">
            official results
          </Link>{' '}
          instead.
        </Warning>
      ) : (
        <>
          {/* --- Mode ------------------------------------------------------- */}
          <SectionTitle>Where handicaps come from</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            {(['calculated', 'manual'] as const).map((source) => (
              <button
                key={source}
                onClick={() => update('rounds', round.id, { handicapSource: source })}
                className={`tap rounded-xl border px-3 py-3 text-left transition-colors ${
                  round.handicapSource === source
                    ? 'border-fairway-300 bg-fairway-500/20'
                    : 'border-white/10 bg-white/5'
                }`}
              >
                <span className="block text-sm font-bold">
                  {source === 'calculated' ? 'Calculated' : 'Manual'}
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-chalk-400">
                  {source === 'calculated'
                    ? `From the ${tee?.name ?? 'round'} tee: index × slope ÷ 113 + (CR − par)`
                    : 'Only the numbers typed in below'}
                </span>
              </button>
            ))}
          </div>

          {status.incomplete && (
            <Warning>
              <strong>{MANUAL_HANDICAPS_INCOMPLETE}</strong> {status.missing.length} of{' '}
              {status.required} still to enter:{' '}
              {status.missing.map((player) => player.name).join(', ')}.
            </Warning>
          )}
          {status.ready && (
            <p className="rounded-xl border border-fairway-400/30 bg-fairway-500/10 px-3 py-2.5 text-sm text-fairway-300">
              All {status.required} entered. These are the only handicaps this round scores off —
              verifying the course or changing the tee will not alter them.
            </p>
          )}
          {error && (
            <p className="rounded-xl border border-pirate-400/40 bg-pirate-500/15 px-3 py-2.5 text-sm text-pirate-300">
              {error}
            </p>
          )}
        </>
      )}

      <SectionTitle>
        {round.handicapSource === 'manual' && !locked ? 'Enter each player' : 'Players'}
      </SectionTitle>

      <div className="space-y-2">
        {players.map((player) => {
          const manual = entered[player.id];
          const calculated =
            player.handicapIndex !== null && tee ? courseHandicap(player.handicapIndex, tee) : null;

          return (
            <div key={player.id} className="card flex items-center gap-3 px-3.5 py-3">
              <Avatar
                name={player.name}
                initials={player.initials}
                colour="#555"
                photoUrl={player.photoUrl}
                size={34}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{player.name}</span>
                <span className="block text-xs text-chalk-500">
                  Index {player.handicapIndex ?? '—'}
                  {calculated !== null && ` · calculated CH ${calculated}`}
                </span>
              </span>

              {round.handicapSource === 'manual' && !locked ? (
                <ManualField
                  value={manual ?? null}
                  busy={busy === player.id}
                  onSave={(value) => save(player.id, value)}
                />
              ) : (
                <span className="tabular w-16 text-right text-lg font-bold">
                  {manual ?? calculated ?? '—'}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {players.length === 0 && (
        <EmptyState
          title="No players in this round yet"
          detail="Set the matchups first — the handicap list follows whoever is playing."
        />
      )}
    </AdminShell>
  );
}

/**
 * A blank course-handicap box.
 *
 * Deliberately NOT prefilled with the calculated figure. An empty box that has
 * to be filled in is the whole safety mechanism: a prefilled one saves the
 * app's guess the moment nobody looks closely, which is how the wrong numbers
 * got used in the first place.
 */
function ManualField({
  value,
  busy,
  onSave,
}: {
  value: number | null;
  busy: boolean;
  onSave: (value: number | null) => void;
}) {
  const [local, setLocal] = useState(value === null ? '' : String(value));
  const [dirty, setDirty] = useState(false);
  const [lastSeen, setLastSeen] = useState(value);

  if (lastSeen !== value) {
    setLastSeen(value);
    if (!dirty) setLocal(value === null ? '' : String(value));
  }

  return (
    <input
      className={`tabular w-16 rounded-lg border bg-ink-900 px-2 py-2 text-center text-lg font-bold focus:outline-none ${
        local.trim() === ''
          ? 'border-brass-400/60 focus:border-brass-300'
          : 'border-white/10 focus:border-fairway-400'
      } ${busy ? 'opacity-50' : ''}`}
      value={local}
      placeholder="—"
      inputMode="numeric"
      aria-label="Manual course handicap"
      onChange={(e) => {
        setDirty(true);
        setLocal(e.target.value);
      }}
      onBlur={() => {
        setDirty(false);
        const trimmed = local.trim();
        if (trimmed === '') {
          if (value !== null) onSave(null);
          return;
        }
        const parsed = Number(trimmed);
        if (!Number.isFinite(parsed)) {
          setLocal(value === null ? '' : String(value));
          return;
        }
        const rounded = Math.round(parsed);
        setLocal(String(rounded));
        if (rounded !== value) onSave(rounded);
      }}
    />
  );
}
