'use client';

import { useState } from 'react';
import { useTour } from '@/lib/data/provider';
import type { BallDetail, MatchOutcome } from '@/lib/scoring/engine';
import type { Match, MatchSide } from '@/lib/types';
import { isTeamBallFormat } from '@/lib/types';
import { Avatar } from './ui';

/**
 * Hole-by-hole score entry.
 *
 * Designed to be used one-handed while walking: every ball is scored with a
 * single tap on a large number button centred on the hole's par, with a
 * pick-up button for the times you have had enough. There is no Save — the tap
 * IS the save, applied optimistically and synced in the background.
 */
export function ScoreEntry({
  match,
  outcome,
  holeNo,
  locked,
  onScored,
}: {
  match: Match;
  outcome: MatchOutcome;
  holeNo: number;
  locked: boolean;
  onScored?: () => void;
}) {
  const { sidesForMatch, playerById, teamById, setScore, snapshot } = useTour();

  const sides = sidesForMatch(match.id);
  const hole = outcome.holes.find((h) => h.holeNo === holeNo);
  if (!hole) return null;

  const teamBall = isTeamBallFormat(match.format);
  const par = hole.par;

  // Numbers offered: two under par through four over. Anything wilder can be
  // reached with the "more" row, but this covers virtually every hole.
  const quickScores = Array.from({ length: 7 }, (_, i) => par - 2 + i).filter((n) => n >= 1);

  return (
    <div className="space-y-3">
      {sides.map((side) => {
        const team = teamById(side.teamId);
        const detail = hole.sides.find((s) => s.sideId === side.id);
        if (!detail) return null;

        return (
          <div
            key={side.id}
            className="card overflow-hidden"
            style={{ borderColor: `${team?.colour}55` }}
          >
            <div
              className="flex items-center justify-between px-3.5 py-2"
              style={{ backgroundColor: `${team?.colour}22` }}
            >
              <span className="flex items-center gap-2 text-sm font-bold">
                <span>{team?.crest}</span>
                <span className="truncate">
                  {side.playerIds.length > 2
                    ? team?.name
                    : side.playerIds.map((id) => playerById(id)?.name.split(' ')[0]).join(' & ')}
                </span>
              </span>
              <span className="tabular text-sm font-bold">
                {detail.net != null ? (
                  <>
                    <span className="text-chalk-500">net</span> {detail.net}
                  </>
                ) : (
                  <span className="text-chalk-500">—</span>
                )}
              </span>
            </div>

            <div className="space-y-3 px-3.5 py-3">
              {detail.balls.map((ball, index) => (
                <BallRow
                  key={ball.playerId ?? `team-${index}`}
                  ball={ball}
                  side={side}
                  teamColour={team?.colour ?? '#333'}
                />
              ))}
            </div>
          </div>
        );
      })}

      {locked && (
        <p className="rounded-xl bg-white/5 px-3 py-2 text-center text-xs text-chalk-400">
          This hole is locked because the match has moved on. A captain can still correct it from
          Admin.
        </p>
      )}
    </div>
  );

  function BallRow({
    ball,
    side,
    teamColour,
  }: {
    ball: BallDetail;
    side: MatchSide;
    teamColour: string;
  }) {
    const [busy, setBusy] = useState(false);
    const player = ball.playerId ? playerById(ball.playerId) : null;
    const existing = snapshot.scores.find(
      (s) =>
        s.matchId === match.id &&
        s.holeNo === holeNo &&
        s.sideId === side.id &&
        (s.playerId ?? null) === (ball.playerId ?? null),
    );

    const write = async (gross: number | null, pickedUp: boolean) => {
      if (locked || busy) return;
      setBusy(true);
      try {
        await setScore({
          matchId: match.id,
          holeNo,
          sideId: side.id,
          playerId: ball.playerId,
          gross,
          pickedUp,
          expectedUpdatedAt: existing?.updatedAt ?? null,
        });
        onScored?.();
      } finally {
        setBusy(false);
      }
    };

    return (
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            {player ? (
              <>
                <Avatar
                  name={player.name}
                  initials={player.initials}
                  colour={teamColour}
                  photoUrl={player.photoUrl}
                  size={26}
                />
                <span className="truncate text-sm font-semibold">{player.name}</span>
              </>
            ) : (
              <span className="text-sm font-semibold text-chalk-300">Team score</span>
            )}
            {/* One dot per stroke received on this hole. */}
            {ball.strokesReceived > 0 && (
              <span className="flex gap-0.5" title={`${ball.strokesReceived} stroke(s) received`}>
                {Array.from({ length: Math.min(3, ball.strokesReceived) }).map((_, i) => (
                  <span key={i} className="h-1.5 w-1.5 rounded-full bg-brass-400" />
                ))}
              </span>
            )}
            {ball.strokesReceived < 0 && (
              <span className="text-[0.65rem] font-bold text-pirate-300">
                {ball.strokesReceived}
              </span>
            )}
          </span>
          {ball.gross != null && (
            <span className="tabular shrink-0 text-xs text-chalk-500">
              net {ball.net}
              {ball.counts && <span className="ml-1 text-fairway-300">✓</span>}
            </span>
          )}
        </div>

        <div className="flex gap-1.5">
          {quickScores.map((value) => {
            const selected = ball.gross === value && !ball.pickedUp;
            return (
              <button
                key={value}
                type="button"
                disabled={locked || busy}
                onClick={() => write(selected ? null : value, false)}
                className={`tap flex-1 rounded-lg py-3 text-base font-bold tabular transition-colors disabled:opacity-40 ${
                  selected ? 'text-white' : 'bg-white/6 text-chalk-200 hover:bg-white/12'
                }`}
                style={selected ? { backgroundColor: teamColour } : undefined}
                aria-pressed={selected}
                aria-label={`${player?.name ?? 'Team'} scored ${value}`}
              >
                {value}
              </button>
            );
          })}
          <button
            type="button"
            disabled={locked || busy}
            onClick={() => write(null, !ball.pickedUp)}
            className={`tap w-11 rounded-lg text-sm font-bold transition-colors disabled:opacity-40 ${
              ball.pickedUp
                ? 'bg-pirate-500 text-white'
                : 'bg-white/6 text-chalk-400 hover:bg-white/12'
            }`}
            title="Picked up / conceded the hole"
            aria-label="Picked up"
          >
            ✕
          </button>
        </div>

        {/* Scores beyond the quick row. Rare, but a 10 happens. */}
        {ball.gross != null && ball.gross > quickScores[quickScores.length - 1] && (
          <p className="mt-1 text-center text-xs text-brass-400">Scored {ball.gross}</p>
        )}
        <div className="mt-1 flex justify-center">
          <button
            type="button"
            disabled={locked || busy}
            onClick={() => write((ball.gross ?? par) + 1 > 20 ? 20 : (ball.gross ?? par) + 1, false)}
            className="tap px-3 py-1 text-[0.68rem] font-semibold text-chalk-500 disabled:opacity-40"
          >
            +1 more
          </button>
          {(ball.gross != null || ball.pickedUp) && (
            <button
              type="button"
              disabled={locked || busy}
              onClick={() => write(null, false)}
              className="tap px-3 py-1 text-[0.68rem] font-semibold text-chalk-500 disabled:opacity-40"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    );
  }
}
