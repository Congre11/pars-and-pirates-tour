'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTour } from '@/lib/data/provider';
import { AdminShell } from '@/components/admin/AdminShell';
import { SectionTitle, Warning } from '@/components/ui';
import { relativeTime } from '@/lib/format';

/**
 * Score corrections.
 *
 * Two things live here: a way to see every score entered (who typed what and
 * when) and the nuclear option of wiping a practice run. Editing an individual
 * hole is done on the scorecard itself, where admins are never locked out.
 */
export default function AdminScoresPage() {
  const { snapshot, matchById, roundById, playerById, sidesForMatch, teamById, resetScores } =
    useTour();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const recent = [...snapshot.scores]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 60);

  const wipe = async () => {
    setBusy(true);
    try {
      await resetScores();
      setDone(true);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminShell title="Scores" subtitle="Corrections and audit trail">
      <div className="card px-3.5 py-3 text-sm leading-snug text-chalk-300">
        To fix one hole, open that match’s scorecard and tap the right number — as a captain you
        are never locked out of a completed hole, and your correction overwrites whatever was
        there.
      </div>

      <SectionTitle>Recent entries</SectionTitle>
      {recent.length === 0 ? (
        <p className="card px-4 py-6 text-center text-sm text-chalk-500">
          No scores entered yet.
        </p>
      ) : (
        <div className="card divide-y divide-white/6">
          {recent.map((score) => {
            const match = matchById(score.matchId);
            const round = match ? roundById(match.roundId) : undefined;
            const side = sidesForMatch(score.matchId).find((s) => s.id === score.sideId);
            const team = side ? teamById(side.teamId) : undefined;
            const who = score.playerId ? playerById(score.playerId)?.name : 'Team score';

            return (
              <Link
                key={score.id}
                href={`/match/${score.matchId}`}
                className="tap flex items-center gap-3 px-3.5 py-2.5"
              >
                <span
                  className="h-8 w-1 shrink-0 rounded-full"
                  style={{ backgroundColor: team?.colour ?? '#3a4a42' }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {who} · hole {score.holeNo} ·{' '}
                    {score.pickedUp ? 'picked up' : `scored ${score.gross}`}
                  </span>
                  <span className="block truncate text-xs text-chalk-500">
                    {round ? `Day ${round.dayNo} · ` : ''}
                    {match?.name} · entered by {score.enteredBy} {relativeTime(score.updatedAt)}
                  </span>
                </span>
                <span className="text-chalk-500" aria-hidden>
                  ›
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <SectionTitle>Reset</SectionTitle>
      {done && (
        <p className="rounded-xl border border-fairway-400/40 bg-fairway-500/10 px-3 py-2.5 text-sm text-fairway-300">
          All scores cleared. The audit trail was kept.
        </p>
      )}
      <Warning>
        This deletes every score in the tour. Use it to clear a practice round before the real
        thing — not during one.
      </Warning>
      {confirming ? (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setConfirming(false)} className="btn-ghost">
            Cancel
          </button>
          <button onClick={wipe} disabled={busy} className="btn-danger">
            {busy ? 'Clearing…' : 'Yes, delete all scores'}
          </button>
        </div>
      ) : (
        <button onClick={() => setConfirming(true)} className="btn-ghost w-full">
          Clear all scores…
        </button>
      )}
    </AdminShell>
  );
}
