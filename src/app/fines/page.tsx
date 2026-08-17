'use client';

import { useState } from 'react';
import { useTour } from '@/lib/data/provider';
import { useSession } from '@/lib/auth/session-provider';
import { Avatar, EmptyState, PageHeader, SectionTitle } from '@/components/ui';

const SUGGESTIONS = [
  'Three-putt',
  'Lost ball',
  'Air shot',
  'In the water',
  'Late for the tee',
  'Bunker fail',
  'Phone on the tee',
  'Worst dressed',
];

/** The running tab. Deliberately simple and deliberately public. */
export default function FinesPage() {
  const { snapshot, insert, update, remove, playerById, teamById } = useTour();
  const { session } = useSession();

  const [playerId, setPlayerId] = useState('');
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('5');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!playerId || !reason.trim()) return;
    setBusy(true);
    try {
      await insert('fines', {
        tourId: snapshot.tour.id,
        playerId,
        reason: reason.trim(),
        amount: Number(amount) || 0,
        status: 'open',
      });
      setReason('');
    } finally {
      setBusy(false);
    }
  };

  const byPlayer = new Map<string, number>();
  for (const fine of snapshot.fines) {
    if (fine.status === 'waived') continue;
    byPlayer.set(fine.playerId, (byPlayer.get(fine.playerId) ?? 0) + fine.amount);
  }
  const worst = [...byPlayer.entries()].sort((a, b) => b[1] - a[1])[0];
  const total = snapshot.fines
    .filter((f) => f.status !== 'waived')
    .reduce((sum, f) => sum + f.amount, 0);

  return (
    <div className="space-y-4 pb-6">
      <PageHeader title="Fines" back="/more" subtitle="The running tab" />

      {total > 0 && (
        <div className="card-raised flex items-center gap-3 px-4 py-3.5">
          <span className="text-2xl">💸</span>
          <div className="min-w-0 flex-1">
            <div className="label">Total on the tab</div>
            {worst && (
              <div className="truncate text-sm text-chalk-400">
                Worst offender: {playerById(worst[0])?.name} ({worst[1]})
              </div>
            )}
          </div>
          <div className="tabular display text-3xl font-bold text-brass-400">{total}</div>
        </div>
      )}

      <div className="card space-y-3 px-3.5 py-3.5">
        <div className="label">Add a fine</div>
        <select
          className="field"
          value={playerId}
          onChange={(e) => setPlayerId(e.target.value)}
        >
          <option value="">Who…</option>
          {snapshot.players.map((player) => (
            <option key={player.id} value={player.id}>
              {player.name}
            </option>
          ))}
        </select>

        <input
          className="field"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="What did they do?"
        />
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => setReason(suggestion)}
              className="tap shrink-0 rounded-full bg-white/8 px-3 py-1.5 text-xs font-semibold text-chalk-300"
            >
              {suggestion}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            className="field tabular w-24"
            value={amount}
            inputMode="numeric"
            onChange={(e) => setAmount(e.target.value)}
            aria-label="Amount"
          />
          <button
            onClick={add}
            disabled={busy || !playerId || !reason.trim()}
            className="btn-primary flex-1"
          >
            Add fine
          </button>
        </div>
      </div>

      <SectionTitle>The list</SectionTitle>
      {snapshot.fines.length === 0 ? (
        <EmptyState title="Nothing yet" detail="Suspiciously clean. Give it until the 3rd hole." />
      ) : (
        <div className="card divide-y divide-white/6">
          {[...snapshot.fines]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((fine) => {
              const player = playerById(fine.playerId);
              const team = player ? teamById(player.teamId) : undefined;
              return (
                <div key={fine.id} className="flex items-center gap-3 px-3.5 py-2.5">
                  {player && (
                    <Avatar
                      name={player.name}
                      initials={player.initials}
                      colour={team?.colour ?? '#333'}
                      photoUrl={player.photoUrl}
                      size={30}
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-sm font-semibold ${
                        fine.status === 'waived' ? 'text-chalk-500 line-through' : ''
                      }`}
                    >
                      {fine.reason}
                    </span>
                    <span className="block truncate text-xs text-chalk-500">{player?.name}</span>
                  </span>
                  <span className="tabular shrink-0 font-bold text-brass-400">{fine.amount}</span>
                  {session?.isAdmin && (
                    <span className="flex shrink-0 gap-1">
                      <button
                        onClick={() =>
                          update('fines', fine.id, {
                            status: fine.status === 'paid' ? 'open' : 'paid',
                          })
                        }
                        className={`tap rounded-md px-2 py-1 text-[0.65rem] font-bold ${
                          fine.status === 'paid'
                            ? 'bg-fairway-500 text-white'
                            : 'bg-white/8 text-chalk-400'
                        }`}
                      >
                        PAID
                      </button>
                      <button
                        onClick={() => remove('fines', fine.id)}
                        className="tap rounded-md bg-white/8 px-2 py-1 text-[0.65rem] font-bold text-chalk-400"
                        aria-label="Delete fine"
                      >
                        ✕
                      </button>
                    </span>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
