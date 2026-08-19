'use client';

import { use, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useTour } from '@/lib/data/provider';
import { useSession } from '@/lib/auth/session-provider';
import { ScoreEntry } from '@/components/ScoreEntry';
import { ScorecardTable } from '@/components/ScorecardTable';
import { PageHeader, SectionTitle, Warning } from '@/components/ui';
import { FORMAT_LABELS, allowanceForMatch } from '@/lib/types';
import { courseHandicapLabel, handicapLabel } from '@/lib/format';
import { ordinal } from '@/lib/tour-helpers';

/**
 * The live scorecard. This is the screen the app exists for.
 *
 * Layout, top to bottom: who is playing and the live status, a hole strip to
 * move between holes, the big score buttons for the current hole, then the
 * full card. Everything updates live from the shared store.
 */
export default function MatchPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = use(params);
  const {
    matchById,
    outcomeFor,
    sidesForMatch,
    teamById,
    playerById,
    roundById,
    courseById,
    teeById,
    snapshot,
  } = useTour();
  const { session } = useSession();

  const match = matchById(matchId);
  const outcome = outcomeFor(matchId);

  // Until someone taps a hole, the card follows the first unscored one. Keeping
  // the choice separate from the suggestion avoids syncing state in an effect.
  const [chosenHole, setChosenHole] = useState<number | null>(null);
  const [showCard, setShowCard] = useState(false);
  /** Deliberately reopened a hole the match has already moved past. */
  const [correcting, setCorrecting] = useState(false);
  const holeStripRef = useRef<HTMLDivElement>(null);

  const suggestedHole = useMemo(() => {
    if (!outcome) return 1;
    const next = outcome.holes.find((h) => !h.complete);
    return next?.holeNo ?? outcome.endHole;
  }, [outcome]);

  const activeHole = chosenHole ?? suggestedHole;
  const setActiveHole = setChosenHole;

  // Keep the current hole visible in the horizontal strip.
  useEffect(() => {
    const strip = holeStripRef.current;
    if (!strip) return;
    const button = strip.querySelector<HTMLElement>(`[data-hole="${activeHole}"]`);
    button?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeHole]);

  if (!match || !outcome) {
    return (
      <div className="card p-5 text-center">
        <p className="font-semibold">Match not found.</p>
        <Link href="/leaderboard" className="btn-ghost mt-3 w-full">
          Back to the leaderboard
        </Link>
      </div>
    );
  }

  const round = roundById(match.roundId);
  const course = round ? courseById(round.courseId) : undefined;
  const tee = round ? teeById(round.teeId) : undefined;
  const sides = sidesForMatch(match.id);
  const hole = outcome.holes.find((h) => h.holeNo === activeHole);

  // Locking: a hole is closed once the match has moved past it. This is a
  // guard against a stray tap in a pocket, not a permission — anyone can
  // correct a hole by tapping "Correct this hole" first, which makes the edit
  // deliberate rather than accidental.
  const furthestScored = outcome.holes.reduce(
    (max, h) => (h.complete ? Math.max(max, h.holeNo) : max),
    0,
  );
  const locked =
    snapshot.tour.settings.lockCompletedHoles &&
    !correcting &&
    hole != null &&
    hole.complete &&
    hole.holeNo < furthestScored;

  const statusText = outcome.isComplete
    ? outcome.winnerSideId
      ? `${sideName(outcome.winnerSideId)} win ${outcome.finalStatus}`
      : 'Match halved'
    : outcome.holesPlayed === 0
      ? 'Not started'
      : outcome.up === 0
        ? `All square thru ${outcome.holesPlayed}`
        : `${sideName(outcome.leaderSideId as string)} ${outcome.up} UP thru ${outcome.holesPlayed}`;

  return (
    <div className="space-y-4 pb-6">
      <PageHeader
        title={match.name}
        back={round ? `/round/${round.id}` : '/leaderboard'}
        subtitle={
          <>
            {FORMAT_LABELS[match.format]} · Holes {match.startHole}–{match.endHole}
            {course && ` · ${course.name}`}
          </>
        }
      />

      {/* --- Live status banner ------------------------------------------- */}
      <div
        className={`card-raised px-4 py-3.5 text-center ${
          outcome.isComplete ? 'border-brass-500/40' : ''
        }`}
      >
        <div className="display text-xl font-bold leading-tight">{statusText}</div>
        <div className="mt-1 flex items-center justify-center gap-2 text-xs text-chalk-500">
          {outcome.isComplete ? (
            <span className="chip bg-brass-500/20 text-brass-300">
              FINAL · {outcome.points[sides[0]?.id] ?? 0} – {outcome.points[sides[1]?.id] ?? 0} pts
            </span>
          ) : (
            <>
              <span>{outcome.holesRemaining} to play</span>
              {outcome.isDormie && (
                <span className="chip bg-brass-500/20 text-brass-300">DORMIE</span>
              )}
            </>
          )}
        </div>
      </div>

      {/* --- Handicaps in play -------------------------------------------- */}
      <div className="card px-3.5 py-3">
        <div className="label mb-2">Strokes in this match</div>
        <div className="space-y-1.5">
          {sides.map((side) => {
            const team = teamById(side.teamId);
            const handicap = outcome.handicaps[side.id];
            const perPlayer = match.format === 'singles' || match.format === 'better_ball';
            return (
              <div key={side.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: team?.colour }}
                  />
                  <span className="truncate">{sideName(side.id)}</span>
                </span>
                <span className="tabular shrink-0 font-semibold">
                  {perPlayer
                    ? side.playerIds
                        .map((id) =>
                          courseHandicapLabel(handicap?.playerPlayingHandicaps[id] ?? 0),
                        )
                        .join(' / ')
                    : courseHandicapLabel(handicap?.playingHandicap ?? 0)}
                  <span className="ml-1 text-xs font-normal text-chalk-500">shots</span>
                </span>
              </div>
            );
          })}
        </div>
        {tee && (
          <p className="mt-2 border-t border-white/6 pt-2 text-[0.68rem] text-chalk-500">
            {tee.name} tees · CR {tee.courseRating} / Slope {tee.slopeRating} ·{' '}
            {snapshot.tour.settings.handicapsEnabled
              ? `${Math.round((allowanceForMatch(match, snapshot.tour.settings).weights[0] ?? 1) * 100)}% allowance`
              : 'Playing off scratch'}
          </p>
        )}
      </div>

      {outcome.hasMissingHandicap && (
        <Warning href="/admin/players">
          A player in this match has no handicap index yet, so they are being treated as scratch.
        </Warning>
      )}
      {course && !course.dataVerified && (
        <Warning href={`/admin/courses`}>
          {course.name} still has placeholder par and stroke index data. Check it before this
          counts for real.
        </Warning>
      )}

      {/* --- Hole strip ---------------------------------------------------- */}
      <div>
        <SectionTitle>Holes</SectionTitle>
        <div ref={holeStripRef} className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {outcome.holes.map((h) => {
            const active = h.holeNo === activeHole;
            const winnerTeam = h.winnerSideId
              ? teamById(sides.find((s) => s.id === h.winnerSideId)?.teamId ?? '')
              : null;
            return (
              <button
                key={h.holeNo}
                data-hole={h.holeNo}
                onClick={() => setActiveHole(h.holeNo)}
                className={`tap flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl border text-sm font-bold transition-colors ${
                  active
                    ? 'border-fairway-300 bg-fairway-500/25'
                    : 'border-white/10 bg-white/5 text-chalk-300'
                }`}
              >
                <span>{h.holeNo}</span>
                {h.complete ? (
                  <span
                    className="mt-1 h-1.5 w-6 rounded-full"
                    style={{ backgroundColor: winnerTeam?.colour ?? '#5a6b62' }}
                  />
                ) : (
                  <span className="mt-1 text-[0.6rem] font-normal text-chalk-500">
                    par {h.par}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* --- Score entry ---------------------------------------------------- */}
      {hole && (
        <div className="animate-in space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="display text-xl font-bold">
                {ordinal(hole.holeNo)} hole
              </h2>
              <p className="text-sm text-chalk-400">
                Par {hole.par} · SI {hole.strokeIndex}
                {tee && course && yardageFor(hole.holeNo, course.id, tee.id)
                  ? ` · ${yardageFor(hole.holeNo, course.id, tee.id)} yds`
                  : ''}
              </p>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => setActiveHole(Math.max(match.startHole, activeHole - 1))}
                disabled={activeHole <= match.startHole}
                className="btn-ghost !px-3 disabled:opacity-30"
                aria-label="Previous hole"
              >
                ‹
              </button>
              <button
                onClick={() => setActiveHole(Math.min(match.endHole, activeHole + 1))}
                disabled={activeHole >= match.endHole}
                className="btn-ghost !px-3 disabled:opacity-30"
                aria-label="Next hole"
              >
                ›
              </button>
            </div>
          </div>

          {locked && (
            <button
              onClick={() => setCorrecting(true)}
              className="btn-ghost w-full !py-2 text-xs"
            >
              This hole is closed — tap to correct it
            </button>
          )}

          <ScoreEntry
            match={match}
            outcome={outcome}
            holeNo={activeHole}
            locked={Boolean(locked)}
            onScored={() => {
              // Releasing the explicit choice lets the card follow the first
              // unscored hole again — so finishing a hole steps you forward
              // with no extra tap. `hole.complete` is the state BEFORE this
              // tap, so correcting an old hole leaves you where you are.
              if (!hole.complete) {
                setTimeout(() => setChosenHole(null), 500);
              }
            }}
          />

          {hole.complete && (
            <div className="card px-3.5 py-2.5 text-center text-sm">
              {hole.halved ? (
                <span className="text-chalk-300">Hole halved</span>
              ) : (
                <span className="font-semibold" style={{ color: winnerColour(hole.winnerSideId) }}>
                  {sideName(hole.winnerSideId as string)} win the {ordinal(hole.holeNo)}
                </span>
              )}
              <span className="ml-2 text-chalk-500">· {hole.statusAfter}</span>
            </div>
          )}
        </div>
      )}

      {/* --- Full card ------------------------------------------------------ */}
      <div>
        <SectionTitle
          action={
            <button
              onClick={() => setShowCard((v) => !v)}
              className="text-xs font-semibold text-fairway-300"
            >
              {showCard ? 'Hide' : 'Show'}
            </button>
          }
        >
          Full scorecard
        </SectionTitle>
        {showCard && (
          <ScorecardTable
            match={match}
            outcome={outcome}
            activeHole={activeHole}
            onSelectHole={setActiveHole}
          />
        )}
      </div>

      {/* --- Who is playing --------------------------------------------------- */}
      <div>
        <SectionTitle>Players</SectionTitle>
        <div className="card divide-y divide-white/6">
          {sides.flatMap((side) =>
            side.playerIds.map((id) => {
              const player = playerById(id);
              const team = teamById(side.teamId);
              if (!player) return null;
              return (
                <div key={id} className="flex items-center gap-3 px-3.5 py-2.5">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: team?.colour }}
                  />
                  <span className="flex-1 truncate text-sm font-semibold">{player.name}</span>
                  <span className="tabular text-xs text-chalk-400">
                    HI {handicapLabel(player.handicapIndex)}
                    {player.handicapSource === 'hna' && (
                      <span className="ml-1 text-fairway-300">HNA</span>
                    )}
                  </span>
                </div>
              );
            }),
          )}
        </div>
      </div>
    </div>
  );

  function sideName(sideId: string): string {
    const side = sides.find((s) => s.id === sideId);
    if (!side) return 'A side';
    const team = teamById(side.teamId);
    if (side.playerIds.length > 2) return team?.name ?? 'Team';
    return side.playerIds.map((id) => playerById(id)?.name.split(' ')[0] ?? '?').join(' & ');
  }

  function winnerColour(sideId: string | null): string | undefined {
    if (!sideId) return undefined;
    return teamById(sides.find((s) => s.id === sideId)?.teamId ?? '')?.accent;
  }

  function yardageFor(holeNo: number, courseId: string, teeId: string): number | null {
    const record = snapshot.holes.find((h) => h.courseId === courseId && h.holeNo === holeNo);
    return record?.yardages?.[teeId] ?? null;
  }
}
