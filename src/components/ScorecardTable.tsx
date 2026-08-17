'use client';

import { useTour } from '@/lib/data/provider';
import type { MatchOutcome } from '@/lib/scoring/engine';
import type { Match } from '@/lib/types';

/**
 * The full card: hole, par, stroke index, each side's gross and net, the hole
 * winner and the running match status — exactly the columns the spec asks for.
 *
 * Scrolls horizontally inside its own container so the page body never does.
 */
export function ScorecardTable({
  match,
  outcome,
  onSelectHole,
  activeHole,
}: {
  match: Match;
  outcome: MatchOutcome;
  onSelectHole?: (holeNo: number) => void;
  activeHole?: number;
}) {
  const { sidesForMatch, teamById, playerById } = useTour();
  const sides = sidesForMatch(match.id);

  const sideLabel = (sideId: string) => {
    const side = sides.find((s) => s.id === sideId);
    if (!side) return '';
    const team = teamById(side.teamId);
    if (side.playerIds.length > 2) return team?.shortName ?? 'TEAM';
    return side.playerIds
      .map((id) => playerById(id)?.name.split(' ')[0]?.slice(0, 4) ?? '?')
      .join('/');
  };

  const totals = sides.map((side) => {
    let gross = 0;
    let holes = 0;
    for (const hole of outcome.holes) {
      const detail = hole.sides.find((s) => s.sideId === side.id);
      if (detail?.gross != null) {
        gross += detail.gross;
        holes += 1;
      }
    }
    return { sideId: side.id, gross, holes };
  });

  return (
    <div className="card overflow-x-auto">
      <table className="tabular w-full min-w-[30rem] text-center text-sm">
        <thead>
          <tr className="border-b border-white/10 text-[0.65rem] uppercase tracking-wider text-chalk-500">
            <th className="sticky left-0 z-10 bg-ink-900 px-2 py-2 text-left">Hole</th>
            <th className="px-1.5 py-2">Par</th>
            <th className="px-1.5 py-2">SI</th>
            {sides.map((side) => (
              <th key={side.id} className="px-1.5 py-2">
                <span style={{ color: teamById(side.teamId)?.accent }}>{sideLabel(side.id)}</span>
              </th>
            ))}
            <th className="px-2 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {outcome.holes.map((hole) => {
            const isActive = hole.holeNo === activeHole;
            return (
              <tr
                key={hole.holeNo}
                onClick={() => onSelectHole?.(hole.holeNo)}
                className={`border-b border-white/5 transition-colors ${
                  onSelectHole ? 'cursor-pointer' : ''
                } ${isActive ? 'bg-fairway-500/15' : hole.complete ? '' : 'opacity-60'}`}
              >
                <td className="sticky left-0 z-10 bg-ink-900 px-2 py-2 text-left font-bold">
                  {hole.holeNo}
                </td>
                <td className="px-1.5 py-2 text-chalk-400">{hole.par}</td>
                <td className="px-1.5 py-2 text-chalk-500">{hole.strokeIndex}</td>
                {sides.map((side) => {
                  const detail = hole.sides.find((s) => s.sideId === side.id);
                  const won = hole.winnerSideId === side.id;
                  const team = teamById(side.teamId);
                  return (
                    <td key={side.id} className="px-1.5 py-1.5">
                      {detail?.gross != null ? (
                        <span className="inline-flex flex-col items-center leading-none">
                          <span
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                              won ? 'text-white' : 'text-chalk-100'
                            }`}
                            style={won ? { backgroundColor: team?.colour } : undefined}
                          >
                            {detail.gross}
                          </span>
                          {detail.strokesReceived !== 0 && (
                            <span className="mt-0.5 text-[0.6rem] text-brass-400">
                              net {detail.net}
                            </span>
                          )}
                        </span>
                      ) : detail?.noScore ? (
                        <span className="text-chalk-600">✕</span>
                      ) : (
                        <span className="text-chalk-600">·</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-2 py-2 text-xs font-semibold">
                  {hole.statusAfter ? (
                    <span
                      style={{
                        color: hole.leaderSideIdAfter
                          ? teamById(
                              sides.find((s) => s.id === hole.leaderSideIdAfter)?.teamId ?? '',
                            )?.accent
                          : undefined,
                      }}
                      className={hole.statusAfter === 'AS' ? 'text-chalk-400' : ''}
                    >
                      {hole.statusAfter}
                    </span>
                  ) : (
                    <span className="text-chalk-600">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-white/12 text-xs font-bold">
            <td className="sticky left-0 z-10 bg-ink-900 px-2 py-2.5 text-left">Total</td>
            <td className="px-1.5 py-2.5 text-chalk-400">
              {outcome.holes.reduce((sum, h) => sum + h.par, 0)}
            </td>
            <td />
            {totals.map((total) => (
              <td key={total.sideId} className="px-1.5 py-2.5">
                {total.holes > 0 ? total.gross : '—'}
              </td>
            ))}
            <td className="px-2 py-2.5 text-brass-400">
              {outcome.isComplete ? outcome.finalStatus : outcome.statusLabel}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
