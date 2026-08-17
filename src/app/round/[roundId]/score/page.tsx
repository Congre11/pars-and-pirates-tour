'use client';

import { use, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTour } from '@/lib/data/provider';
import { useSession } from '@/lib/auth/session-provider';
import { ScoreEntry } from '@/components/ScoreEntry';
import { Avatar, EmptyState, PageHeader, Warning } from '@/components/ui';
import { FORMAT_LABELS, FORMAT_SHORT_LABELS } from '@/lib/types';
import { courseHandicapLabel } from '@/lib/format';
import { ordinal } from '@/lib/tour-helpers';

/**
 * The round scorecard — what "Start Scoring" opens.
 *
 * One continuous 18-hole card for a chosen player, already loaded with that
 * round's linked course. On Day 3 the FORMAT CHANGES AS YOU WALK: holes 1–6
 * are singles, 7–12 a two-man scramble, 13–18 alternate shot. The card looks
 * up which match covers the current hole and switches the scoring controls
 * automatically, so nobody has to pick a course or hunt for the right match.
 */
export default function RoundScorePage({ params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = use(params);
  const searchParams = useSearchParams();
  const {
    roundById,
    courseById,
    teeById,
    matchesForRound,
    sidesForMatch,
    holesForCourse,
    outcomeFor,
    playerById,
    teamById,
    snapshot,
  } = useTour();
  const { session } = useSession();

  const round = roundById(roundId);
  const matches = useMemo(() => (round ? matchesForRound(round.id) : []), [round, matchesForRound]);

  // Which player's card are we scoring? The signed-in player by default.
  const requestedPlayer = searchParams.get('player');
  const playersInRound = useMemo(() => {
    const ids = new Set<string>();
    for (const match of matches) {
      for (const side of sidesForMatch(match.id)) {
        for (const id of side.playerIds) ids.add(id);
      }
    }
    return snapshot.players.filter((p) => ids.has(p.id));
  }, [matches, sidesForMatch, snapshot.players]);

  const defaultPlayerId =
    requestedPlayer && playersInRound.some((p) => p.id === requestedPlayer)
      ? requestedPlayer
      : playersInRound.some((p) => p.id === session?.playerId)
        ? (session?.playerId as string)
        : (playersInRound[0]?.id ?? null);

  const [chosenPlayerId, setChosenPlayerId] = useState<string | null>(null);
  const playerId = chosenPlayerId ?? defaultPlayerId;

  const course = round ? courseById(round.courseId) : undefined;
  const tee = round ? teeById(round.teeId) : undefined;
  const holes = useMemo(
    () => (course ? holesForCourse(course.id) : []),
    [course, holesForCourse],
  );

  /**
   * The player's card: every match they play in this round, in hole order.
   * A player has at most one match covering any given hole, which is what
   * makes the format switch unambiguous.
   */
  const lane = useMemo(() => {
    if (!playerId) return [];
    return matches
      .filter((match) => sidesForMatch(match.id).some((s) => s.playerIds.includes(playerId)))
      .sort((a, b) => a.startHole - b.startHole);
  }, [matches, sidesForMatch, playerId]);

  const playableHoles = useMemo(
    () => holes.filter((h) => lane.some((m) => h.holeNo >= m.startHole && h.holeNo <= m.endHole)),
    [holes, lane],
  );

  /** The first hole on this card that still needs a score. */
  const suggestedHole = useMemo(() => {
    for (const hole of playableHoles) {
      const match = lane.find((m) => hole.holeNo >= m.startHole && hole.holeNo <= m.endHole);
      if (!match) continue;
      const outcome = outcomeFor(match.id);
      const detail = outcome?.holes.find((h) => h.holeNo === hole.holeNo);
      if (!detail?.complete) return hole.holeNo;
    }
    return playableHoles[playableHoles.length - 1]?.holeNo ?? 1;
  }, [playableHoles, lane, outcomeFor]);

  const [chosenHole, setChosenHole] = useState<number | null>(null);
  const activeHole = chosenHole ?? suggestedHole;
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const button = stripRef.current?.querySelector<HTMLElement>(`[data-hole="${activeHole}"]`);
    button?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeHole]);

  if (!round) {
    return (
      <EmptyState
        title="Round not found"
        cta={
          <Link href="/leaderboard" className="btn-ghost mt-2">
            Back to the leaderboard
          </Link>
        }
      />
    );
  }

  if (!course || !tee || holes.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title={round.name} back={`/round/${round.id}`} />
        <Warning href="/admin/rounds">
          This round has no course or tee data loaded yet, so there is nothing to score against.
        </Warning>
      </div>
    );
  }

  if (!playerId || lane.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title="Start scoring" back={`/round/${round.id}`} subtitle={course.name} />
        <EmptyState
          title="Whose card are you keeping?"
          detail="Pick a player to open their scorecard for this round."
        />
        <div className="grid grid-cols-2 gap-2">
          {playersInRound.map((player) => {
            const team = teamById(player.teamId);
            return (
              <button
                key={player.id}
                onClick={() => setChosenPlayerId(player.id)}
                className="card tap px-3 py-3 text-left text-sm font-semibold"
              >
                <span className="block truncate">{player.name}</span>
                <span className="block text-xs" style={{ color: team?.accent }}>
                  {team?.shortName}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // The match that covers the hole in front of us — this is the format switch.
  const activeMatch = lane.find((m) => activeHole >= m.startHole && activeHole <= m.endHole);
  const activeOutcome = activeMatch ? outcomeFor(activeMatch.id) : undefined;
  const activeHoleDetail = activeOutcome?.holes.find((h) => h.holeNo === activeHole);
  const hole = holes.find((h) => h.holeNo === activeHole);
  const player = playerById(playerId);
  const playerTeam = player ? teamById(player.teamId) : undefined;
  const segmented = lane.length > 1;

  // A guard against stray taps, not a permission — the match screen has an
  // explicit "correct this hole" action open to everyone.
  const locked =
    snapshot.tour.settings.lockCompletedHoles &&
    activeOutcome != null &&
    activeHoleDetail?.complete === true &&
    activeHole <
      activeOutcome.holes.reduce((max, h) => (h.complete ? Math.max(max, h.holeNo) : max), 0);

  return (
    <div className="space-y-4 pb-6">
      <PageHeader
        title={course.name}
        back={`/round/${round.id}`}
        subtitle={
          <>
            Day {round.dayNo} · {tee.name} tees
            {round.teeTime ? ` · ${round.teeTime}` : ''}
          </>
        }
      />

      {!course.dataVerified && (
        <Warning href={`/admin/courses/${course.id}/verify`}>
          {course.name} has not been verified yet, so the par, stroke index and ratings driving
          these strokes are still placeholders.
        </Warning>
      )}

      {/* --- Whose card ---------------------------------------------------- */}
      <div className="card flex items-center gap-3 px-3.5 py-3">
        {player && (
          <Avatar
            name={player.name}
            initials={player.initials}
            colour={playerTeam?.colour ?? '#333'}
            photoUrl={player.photoUrl}
            size={34}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="label">Scoring</div>
          <div className="truncate font-semibold">{player?.name}</div>
        </div>
        <select
          value={playerId}
          onChange={(e) => {
            setChosenPlayerId(e.target.value);
            setChosenHole(null);
          }}
          className="field w-auto max-w-[9rem] text-sm"
          aria-label="Change player"
        >
          {playersInRound.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* --- Format segments ------------------------------------------------ */}
      {segmented && (
        <div className="card overflow-hidden">
          <div className="label px-3.5 pt-3">This round changes format as you go</div>
          <div className="flex gap-1.5 px-3.5 pb-3 pt-2">
            {lane.map((match) => {
              const isActive = activeMatch?.id === match.id;
              return (
                <button
                  key={match.id}
                  onClick={() => setChosenHole(match.startHole)}
                  className={`tap flex-1 rounded-lg px-2 py-2 text-center transition-colors ${
                    isActive ? 'bg-fairway-500 text-white' : 'bg-white/6 text-chalk-300'
                  }`}
                >
                  <span className="block text-[0.68rem] font-bold">
                    H{match.startHole}–{match.endHole}
                  </span>
                  <span className="block text-[0.6rem] opacity-80">
                    {FORMAT_SHORT_LABELS[match.format]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* --- Hole strip ------------------------------------------------------ */}
      <div ref={stripRef} className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {playableHoles.map((h) => {
          const match = lane.find((m) => h.holeNo >= m.startHole && h.holeNo <= m.endHole);
          const outcome = match ? outcomeFor(match.id) : undefined;
          const detail = outcome?.holes.find((x) => x.holeNo === h.holeNo);
          const winnerSide = detail?.winnerSideId
            ? sidesForMatch(match!.id).find((s) => s.id === detail.winnerSideId)
            : undefined;
          const active = h.holeNo === activeHole;
          // A new format starting on this hole gets a marker.
          const segmentStart = segmented && lane.some((m) => m.startHole === h.holeNo);
          return (
            <button
              key={h.holeNo}
              data-hole={h.holeNo}
              onClick={() => setChosenHole(h.holeNo)}
              className={`tap flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl border text-sm font-bold transition-colors ${
                active
                  ? 'border-fairway-300 bg-fairway-500/25'
                  : segmentStart
                    ? 'border-brass-500/50 bg-white/5 text-chalk-300'
                    : 'border-white/10 bg-white/5 text-chalk-300'
              }`}
            >
              <span>{h.holeNo}</span>
              {detail?.complete ? (
                <span
                  className="mt-1 h-1.5 w-6 rounded-full"
                  style={{
                    backgroundColor: winnerSide
                      ? teamById(winnerSide.teamId)?.colour
                      : '#5a6b62',
                  }}
                />
              ) : (
                <span className="mt-1 text-[0.6rem] font-normal text-chalk-500">par {h.par}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* --- The hole ------------------------------------------------------- */}
      {activeMatch && activeOutcome && hole && (
        <div className="animate-in space-y-3">
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <h2 className="display text-xl font-bold">{ordinal(hole.holeNo)} hole</h2>
              <p className="text-sm text-chalk-400">
                Par {hole.par} · SI {hole.strokeIndex}
                {hole.yardages[tee.id]
                  ? ` · ${hole.yardages[tee.id]} ${tee.distanceUnit === 'metres' ? 'm' : 'yds'}`
                  : ''}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-fairway-300">
                {FORMAT_LABELS[activeMatch.format]}
              </p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <button
                onClick={() => {
                  const prev = [...playableHoles].reverse().find((h) => h.holeNo < activeHole);
                  if (prev) setChosenHole(prev.holeNo);
                }}
                disabled={playableHoles[0]?.holeNo === activeHole}
                className="btn-ghost !px-3 disabled:opacity-30"
                aria-label="Previous hole"
              >
                ‹
              </button>
              <button
                onClick={() => {
                  const next = playableHoles.find((h) => h.holeNo > activeHole);
                  if (next) setChosenHole(next.holeNo);
                }}
                disabled={playableHoles[playableHoles.length - 1]?.holeNo === activeHole}
                className="btn-ghost !px-3 disabled:opacity-30"
                aria-label="Next hole"
              >
                ›
              </button>
            </div>
          </div>

          {/* Live status of whichever match this hole belongs to. */}
          <Link href={`/match/${activeMatch.id}`} className="card tap block px-3.5 py-2.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate font-semibold">{activeMatch.name}</span>
              <span className="shrink-0 font-bold text-brass-400">
                {activeOutcome.isComplete
                  ? activeOutcome.finalStatus || 'Halved'
                  : activeOutcome.holesPlayed === 0
                    ? 'Not started'
                    : `${activeOutcome.statusLabel} thru ${activeOutcome.holesPlayed}`}
              </span>
            </div>
          </Link>

          <ScoreEntry
            match={activeMatch}
            outcome={activeOutcome}
            holeNo={activeHole}
            locked={Boolean(locked)}
            onScored={() => {
              if (!activeHoleDetail?.complete) setTimeout(() => setChosenHole(null), 500);
            }}
          />

          {activeHoleDetail?.complete && (
            <div className="card px-3.5 py-2.5 text-center text-sm">
              {activeHoleDetail.halved ? (
                <span className="text-chalk-300">Hole halved</span>
              ) : (
                <span className="font-semibold">
                  {(() => {
                    const side = sidesForMatch(activeMatch.id).find(
                      (s) => s.id === activeHoleDetail.winnerSideId,
                    );
                    const team = side ? teamById(side.teamId) : undefined;
                    const names =
                      side && side.playerIds.length > 2
                        ? (team?.name ?? 'Team')
                        : (side?.playerIds
                            .map((id) => playerById(id)?.name.split(' ')[0])
                            .join(' & ') ?? '');
                    return (
                      <span style={{ color: team?.accent }}>{names} win the {ordinal(activeHole)}</span>
                    );
                  })()}
                </span>
              )}
              <span className="ml-2 text-chalk-500">· {activeHoleDetail.statusAfter}</span>
            </div>
          )}
        </div>
      )}

      {/* --- Strokes on this card ------------------------------------------- */}
      {activeMatch && activeOutcome && (
        <div className="card px-3.5 py-3">
          <div className="label mb-2">Strokes in this match</div>
          <div className="space-y-1.5 text-sm">
            {sidesForMatch(activeMatch.id).map((side) => {
              const team = teamById(side.teamId);
              const handicap = activeOutcome.handicaps[side.id];
              const perPlayer =
                activeMatch.format === 'singles' || activeMatch.format === 'better_ball';
              return (
                <div key={side.id} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: team?.colour }}
                    />
                    <span className="truncate">
                      {side.playerIds.length > 2
                        ? team?.name
                        : side.playerIds.map((id) => playerById(id)?.name.split(' ')[0]).join(' & ')}
                    </span>
                  </span>
                  <span className="tabular shrink-0 font-semibold">
                    {perPlayer
                      ? side.playerIds
                          .map((id) => courseHandicapLabel(handicap?.playerPlayingHandicaps[id] ?? 0))
                          .join(' / ')
                      : courseHandicapLabel(handicap?.playingHandicap ?? 0)}
                    <span className="ml-1 text-xs font-normal text-chalk-500">shots</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
