'use client';

import Link from 'next/link';
import { useTour } from '@/lib/data/provider';
import { FORMAT_SHORT_LABELS } from '@/lib/types';
import { Avatar } from './ui';

/**
 * One match, at a glance.
 *
 * Reads the way a Ryder Cup scoreboard does: each side on its own line with a
 * team-coloured bar, and the live status ("2 UP", "3&2", "AS thru 7") sitting
 * in the middle where your eye lands first.
 */
export function MatchTile({ matchId, showFormat = true }: { matchId: string; showFormat?: boolean }) {
  const { matchById, sidesForMatch, playerById, teamById, outcomeFor } = useTour();

  const match = matchById(matchId);
  const outcome = outcomeFor(matchId);
  const sides = sidesForMatch(matchId);
  if (!match || !outcome || sides.length < 2) return null;

  const statusText = outcome.isComplete
    ? outcome.finalStatus || 'Halved'
    : outcome.holesPlayed === 0
      ? 'Not started'
      : outcome.up === 0
        ? 'ALL SQUARE'
        : `${outcome.up} UP`;

  const thru = outcome.isComplete
    ? outcome.decidedOnHole
      ? `Finished on ${outcome.decidedOnHole}`
      : 'Final'
    : outcome.holesPlayed === 0
      ? `${outcome.totalHoles} holes`
      : `Thru ${outcome.holesPlayed}`;

  return (
    <Link href={`/match/${match.id}`} className="card tap block overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/6 px-3.5 py-2">
        <span className="truncate text-sm font-semibold text-chalk-200">{match.name}</span>
        <span className="flex items-center gap-2">
          {showFormat && (
            <span className="label !tracking-wider">{FORMAT_SHORT_LABELS[match.format]}</span>
          )}
          {outcome.isDormie && (
            <span className="chip bg-brass-500/20 text-brass-300">DORMIE</span>
          )}
          {!outcome.isComplete && outcome.holesPlayed > 0 && (
            <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-fairway-300" />
          )}
        </span>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3.5 py-3">
        <SideColumn sideId={sides[0].id} matchId={match.id} align="left" />

        <div className="min-w-[5.5rem] text-center">
          <div
            className={`display text-lg font-bold leading-none ${
              outcome.isComplete ? 'text-brass-400' : 'text-chalk-50'
            }`}
          >
            {statusText}
          </div>
          <div className="mt-1 text-[0.65rem] font-medium text-chalk-500">{thru}</div>
        </div>

        <SideColumn sideId={sides[1].id} matchId={match.id} align="right" />
      </div>

      {/* Team-coloured lead bar: which way the match is leaning, at a glance. */}
      <LeadBar />
    </Link>
  );

  function SideColumn({
    sideId,
    align,
  }: {
    sideId: string;
    matchId: string;
    align: 'left' | 'right';
  }) {
    const side = sides.find((s) => s.id === sideId);
    if (!side) return null;
    const team = teamById(side.teamId);
    const leading = outcome!.leaderSideId === sideId;
    const won = outcome!.isComplete && outcome!.winnerSideId === sideId;

    return (
      <div className={align === 'right' ? 'text-right' : 'text-left'}>
        <div
          className={`flex items-center gap-1.5 ${
            align === 'right' ? 'flex-row-reverse' : ''
          }`}
        >
          {side.playerIds.slice(0, 4).map((id) => {
            const player = playerById(id);
            if (!player) return null;
            return (
              <Avatar
                key={id}
                name={player.name}
                initials={player.initials}
                colour={team?.colour ?? '#333'}
                photoUrl={player.photoUrl}
                size={24}
              />
            );
          })}
        </div>
        <div
          className={`mt-1.5 text-sm font-semibold leading-tight ${
            won ? 'text-brass-400' : leading ? 'text-chalk-50' : 'text-chalk-400'
          }`}
        >
          {side.playerIds.length > 2
            ? (team?.name ?? 'Team')
            : side.playerIds
                .map((id) => playerById(id)?.name.split(' ')[0] ?? '?')
                .join(' & ')}
        </div>
      </div>
    );
  }

  function LeadBar() {
    const homeSide = sides[0];
    const awaySide = sides[1];
    const homeTeam = teamById(homeSide.teamId);
    const awayTeam = teamById(awaySide.teamId);

    // Convert the lead into a 0-100 split so the bar reads like a tug of war.
    const lead = outcome!.leaderSideId === homeSide.id ? outcome!.up : -outcome!.up;
    const maxSwing = Math.max(3, outcome!.totalHoles / 3);
    const homeShare = Math.min(90, Math.max(10, 50 + (lead / maxSwing) * 40));

    return (
      <div className="flex h-1.5 w-full">
        <span
          style={{ width: `${homeShare}%`, backgroundColor: homeTeam?.colour }}
          className="transition-all duration-500"
        />
        <span
          style={{ width: `${100 - homeShare}%`, backgroundColor: awayTeam?.colour }}
          className="transition-all duration-500"
        />
      </div>
    );
  }
}
