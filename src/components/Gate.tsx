'use client';

import { useState } from 'react';
import { useSession } from '@/lib/auth/session-provider';
import { useTour } from '@/lib/data/provider';
import { AppShell } from './AppShell';

/**
 * The front door.
 *
 * No PIN: anyone with the link is in. All this asks is who you are, so scores
 * and changes to the 4-balls carry a name rather than "someone's phone", and
 * so "Start scoring" can open your card rather than making you find it.
 */
export function Gate({ children }: { children: React.ReactNode }) {
  const { session, loading, signIn } = useSession();
  const { snapshot, status, setScorerName } = useTour();

  const [playerId, setPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="text-center">
          <div className="display text-3xl font-bold tracking-tight">Pars &amp; Pirates</div>
          <div className="mt-2 text-sm text-chalk-500">Loading…</div>
        </div>
      </div>
    );
  }

  if (session) return <AppShell>{children}</AppShell>;

  const players = [...snapshot.players].sort((a, b) => a.sortOrder - b.sortOrder);
  const teamOf = (teamId: string) => snapshot.teams.find((t) => t.id === teamId);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const chosen = players.find((p) => p.id === playerId);
      await signIn({ playerId, playerName: chosen?.name ?? 'Guest' });
      if (chosen) setScorerName(chosen.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-10">
      <div className="animate-in text-center">
        <div className="mb-2 flex items-center justify-center gap-3 text-4xl">
          <span>⛳</span>
          <span className="text-chalk-500">vs</span>
          <span>🏴‍☠️</span>
        </div>
        <h1 className="display text-4xl font-bold leading-tight">
          Pars &amp; Pirates
          <span className="block text-brass-400">Tour {snapshot.tour.year || 2026}</span>
        </h1>
        <p className="mt-3 text-sm text-chalk-400">
          {snapshot.tour.location || 'Belek, Turkey'} · Private tour app
        </p>
      </div>

      <form onSubmit={submit} className="card-raised mt-8 space-y-5 p-5">
        <div>
          <span className="label mb-2 block">Who are you?</span>
          <div className="grid grid-cols-2 gap-2">
            {players.map((player) => {
              const team = teamOf(player.teamId);
              const selected = playerId === player.id;
              return (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => setPlayerId(selected ? null : player.id)}
                  className={`tap rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                    selected
                      ? 'border-transparent text-white'
                      : 'border-white/10 bg-white/5 text-chalk-200'
                  }`}
                  style={selected && team ? { backgroundColor: team.colour } : undefined}
                >
                  <span className="block truncate">{player.name}</span>
                  <span className="block text-[0.65rem] font-medium opacity-70">
                    {team?.shortName}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-chalk-500">
            Pick yourself so scores and 4-ball changes show who made them.
          </p>
        </div>

        {error && (
          <p className="rounded-lg bg-pirate-500/15 px-3 py-2 text-sm text-pirate-300">{error}</p>
        )}

        <button type="submit" className="btn-primary w-full text-base" disabled={busy || status === 'loading'}>
          {busy ? 'One moment…' : 'Enter the tour'}
        </button>

        <p className="text-center text-xs text-chalk-500">
          No PIN needed — this tour is private because the link is.
        </p>
      </form>
    </div>
  );
}
