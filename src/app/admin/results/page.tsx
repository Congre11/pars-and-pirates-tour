'use client';

import { useState } from 'react';
import { useTour } from '@/lib/data/provider';
import { useSession } from '@/lib/auth/session-provider';
import { AdminShell } from '@/components/admin/AdminShell';
import { SectionTitle, Warning } from '@/components/ui';
import { halvesAwardNothing } from '@/lib/rounds/matchups';
import { pointsForMatch } from '@/lib/scoring/engine';
import { points as formatPoints } from '@/lib/format';
import type { ManualOutcome, MatchSide } from '@/lib/types';

/**
 * Official results, entered by hand.
 *
 * The fallback for a round the app could not score — a dead phone, no signal,
 * or the day it simply failed. Pick the winner and the leaderboard updates
 * exactly as if the match had been played out hole by hole, at the right stake
 * for the day, with no need to reconstruct a single score.
 *
 * A manual result is authoritative until an organiser clears it, and is
 * badged everywhere it appears so nobody mistakes it for live scoring.
 */
export default function AdminResultsPage() {
  const {
    snapshot,
    matchesForRound,
    sidesForMatch,
    teamById,
    playerById,
    manualResultFor,
    setMatchResult,
    outcomeFor,
  } = useTour();
  const { session } = useSession();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rounds = [...snapshot.rounds].sort((a, b) => a.sortOrder - b.sortOrder);

  const declare = async (matchId: string, outcome: ManualOutcome | null) => {
    setBusy(matchId);
    setError(null);
    try {
      await setMatchResult({
        matchId,
        outcome,
        enteredBy: session?.playerName ?? 'Organiser',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that result.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminShell title="Official results" subtitle="Set a match result without scoring every hole">
      <Warning>
        Only for a match the app could not score. Anything you set here overrides the hole-by-hole
        result on the leaderboard until you clear it, and is shown as an organiser result wherever
        it appears.
      </Warning>

      {error && (
        <p className="rounded-xl border border-pirate-400/40 bg-pirate-500/15 px-3 py-2.5 text-sm text-pirate-300">
          {error}
        </p>
      )}

      {rounds.map((round) => {
        const matches = matchesForRound(round.id);
        const burned = halvesAwardNothing(matches);

        return (
          <div key={round.id} className="space-y-2">
            <SectionTitle>
              Day {round.dayNo} · {round.name}
            </SectionTitle>

            {matches.map((match) => {
              const sides = sidesForMatch(match.id);
              const declared = manualResultFor(match.id);
              const outcome = outcomeFor(match.id);
              const stake = pointsForMatch(match.pointsValue, snapshot.tour.settings, burned);

              const nameOf = (side: MatchSide | undefined) =>
                side
                  ? side.playerIds.length && side.playerIds.length <= 2
                    ? side.playerIds.map((id) => playerById(id)?.name.split(' ')[0]).join(' & ')
                    : (teamById(side.teamId)?.name ?? 'Side')
                  : 'Side';

              const chosen: ManualOutcome | null = !declared
                ? null
                : declared.winnerTeamId === null
                  ? 'halved'
                  : declared.winnerTeamId === sides[0]?.teamId
                    ? 'home'
                    : 'away';

              const options: Array<{ key: ManualOutcome; label: string; detail: string }> = [
                {
                  key: 'home',
                  label: `${teamById(sides[0]?.teamId ?? '')?.name ?? 'Home'} win`,
                  detail: `${formatPoints(stake.win)} pt`,
                },
                {
                  key: 'away',
                  label: `${teamById(sides[1]?.teamId ?? '')?.name ?? 'Away'} win`,
                  detail: `${formatPoints(stake.win)} pt`,
                },
                {
                  key: 'halved',
                  label: 'Halved',
                  detail: burned
                    ? '0 to both — the half is burned'
                    : `${formatPoints(stake.half)} each`,
                },
              ];

              return (
                <div key={match.id} className="card space-y-2.5 px-3.5 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{match.name}</span>
                      <span className="block truncate text-xs text-chalk-500">
                        {nameOf(sides[0])} v {nameOf(sides[1])} · {formatPoints(match.pointsValue)}{' '}
                        pt
                      </span>
                    </span>
                    {declared ? (
                      <span className="chip shrink-0 bg-brass-500/25 text-brass-300">ORGANISER</span>
                    ) : outcome?.isComplete ? (
                      <span className="chip shrink-0 bg-fairway-500/25 text-fairway-300">
                        {outcome.finalStatus}
                      </span>
                    ) : undefined}
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    {options.map((option) => (
                      <button
                        key={option.key}
                        disabled={busy === match.id || sides.length < 2}
                        onClick={() => void declare(match.id, option.key)}
                        className={`tap rounded-lg border px-2 py-2 text-center transition-colors disabled:opacity-40 ${
                          chosen === option.key
                            ? 'border-fairway-300 bg-fairway-500/25'
                            : 'border-white/10 bg-white/5'
                        }`}
                      >
                        <span className="block text-xs font-bold leading-tight">
                          {option.label}
                        </span>
                        <span className="mt-0.5 block text-[0.65rem] text-chalk-400">
                          {option.detail}
                        </span>
                      </button>
                    ))}
                  </div>

                  {declared && (
                    <div className="flex items-center justify-between gap-2 text-xs text-chalk-500">
                      <span className="truncate">
                        Set by {declared.enteredBy ?? 'an organiser'}
                        {declared.enteredAt
                          ? ` on ${new Date(declared.enteredAt).toLocaleDateString()}`
                          : ''}
                      </span>
                      <button
                        disabled={busy === match.id}
                        onClick={() => void declare(match.id, null)}
                        className="tap shrink-0 font-semibold text-pirate-300 disabled:opacity-40"
                      >
                        Clear
                      </button>
                    </div>
                  )}

                  {sides.length < 2 && (
                    <p className="text-xs text-brass-300">
                      This match has no sides yet — set the matchups before declaring a result.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </AdminShell>
  );
}
