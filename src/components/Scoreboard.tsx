'use client';

import { useTour } from '@/lib/data/provider';
import { points as fmtPoints } from '@/lib/format';

/**
 * The headline scoreboard: PARS x — y PIRATES, with the tug-of-war bar and
 * the "first to N points" marker that makes a Ryder Cup format legible.
 */
export function Scoreboard({
  projected = false,
  compact = false,
}: {
  /** Also show where the score lands if every live match finished as it stands. */
  projected?: boolean;
  compact?: boolean;
}) {
  const { snapshot, standings } = useTour();
  const [home, away] = snapshot.teams;
  if (!home || !away) return null;

  const homeStat = standings.byTeam[home.id];
  const awayStat = standings.byTeam[away.id];
  if (!homeStat || !awayStat) return null;

  const total = standings.pointsTotal || 1;
  const homeShare = (homeStat.points / total) * 100;
  const awayShare = (awayStat.points / total) * 100;
  const winLine = (standings.pointsToWin / total) * 100;

  return (
    <div className={`card-raised overflow-hidden ${compact ? '' : 'pb-1'}`}>
      <div className="grid grid-cols-3 items-center gap-2 px-4 pt-4">
        <TeamSide team={home} value={homeStat.points} align="left" />
        <div className="text-center">
          <div className="label">
            {standings.pointsRemaining > 0 ? 'Points won' : 'Final'}
          </div>
          <div className="mt-1 text-[0.65rem] text-chalk-500">
            {fmtPoints(standings.pointsToWin)} to win
          </div>
        </div>
        <TeamSide team={away} value={awayStat.points} align="right" />
      </div>

      {/* Tug-of-war bar. The neutral centre band is everything still to play for. */}
      <div className="relative mt-4 mx-4 h-3 overflow-hidden rounded-full bg-white/8">
        <span
          className="absolute inset-y-0 left-0 transition-all duration-700"
          style={{ width: `${homeShare}%`, backgroundColor: home.colour }}
        />
        <span
          className="absolute inset-y-0 right-0 transition-all duration-700"
          style={{ width: `${awayShare}%`, backgroundColor: away.colour }}
        />
        <span
          className="absolute inset-y-0 w-px bg-brass-400"
          style={{ left: `${winLine}%` }}
          aria-hidden
        />
      </div>

      {projected && standings.pointsRemaining > 0 && (
        <div className="mx-4 mt-3 flex items-center justify-between rounded-xl bg-black/25 px-3 py-2">
          <span className="label">Projected final</span>
          <span className="tabular text-sm font-bold">
            <span style={{ color: home.accent }}>{fmtPoints(homeStat.projectedPoints)}</span>
            <span className="mx-1.5 text-chalk-500">–</span>
            <span style={{ color: away.accent }}>{fmtPoints(awayStat.projectedPoints)}</span>
          </span>
        </div>
      )}

      {!compact && (
        <div className="mt-3 flex items-center justify-between border-t border-white/6 px-4 py-2.5 text-[0.7rem] text-chalk-500">
          <span>
            {homeStat.matchesWon}W · {homeStat.matchesHalved}H · {homeStat.matchesLost}L
          </span>
          <span>
            {fmtPoints(standings.pointsRemaining)} of {fmtPoints(standings.pointsTotal)} still to
            play for
          </span>
          <span>
            {awayStat.matchesWon}W · {awayStat.matchesHalved}H · {awayStat.matchesLost}L
          </span>
        </div>
      )}
    </div>
  );

  function TeamSide({
    team,
    value,
    align,
  }: {
    team: (typeof snapshot.teams)[number];
    value: number;
    align: 'left' | 'right';
  }) {
    const leading = standings.leaderTeamId === team.id;
    return (
      <div className={align === 'right' ? 'text-right' : 'text-left'}>
        <div className="flex items-center gap-1.5" style={{ justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
          <span className="text-lg">{team.crest}</span>
          <span
            className="truncate text-[0.68rem] font-black uppercase tracking-wider"
            style={{ color: team.accent }}
          >
            {team.shortName}
          </span>
        </div>
        <div
          className={`display tabular mt-0.5 text-4xl font-bold leading-none ${
            leading ? '' : 'text-chalk-200'
          }`}
          style={leading ? { color: team.accent } : undefined}
        >
          {fmtPoints(value)}
        </div>
      </div>
    );
  }
}
