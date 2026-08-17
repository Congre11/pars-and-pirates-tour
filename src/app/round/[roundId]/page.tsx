'use client';

import { use } from 'react';
import Link from 'next/link';
import { useTour } from '@/lib/data/provider';
import { MatchTile } from '@/components/MatchTile';
import { StrokesTable } from '@/components/StrokesTable';
import { EmptyState, PageHeader, SectionTitle, Warning } from '@/components/ui';
import { useSession } from '@/lib/auth/session-provider';
import { formatDate, points as fmtPoints } from '@/lib/format';
import { FORMAT_LABELS } from '@/lib/types';

/**
 * A golf day: the course card, the day's points, and every match on it.
 *
 * Day 3 lands here with three groups of matches (H1–6, H7–12, H13–18) rather
 * than one, because that is genuinely three separate match-play contests on
 * one course.
 */
export default function RoundPage({ params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = use(params);
  const {
    roundById,
    courseById,
    teeById,
    matchesForRound,
    groupsForRound,
    playerById,
    holesForCourse,
    standingsForRound,
    snapshot,
  } = useTour();
  const { session } = useSession();

  const round = roundById(roundId);
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

  const course = courseById(round.courseId);
  const tee = teeById(round.teeId);
  const matches = matchesForRound(round.id);
  const fourBalls = groupsForRound(round.id);
  const holes = course ? holesForCourse(course.id) : [];
  const dayStandings = standingsForRound(round.id);
  const [home, away] = snapshot.teams;

  // Group by hole range so Day 3 reads as three contests, not eight matches.
  const groups = new Map<string, typeof matches>();
  for (const match of matches) {
    const key = `${match.startHole}-${match.endHole}`;
    groups.set(key, [...(groups.get(key) ?? []), match]);
  }

  return (
    <div className="space-y-4 pb-6">
      <PageHeader
        title={round.name}
        back="/leaderboard"
        subtitle={`${formatDate(round.date)} · ${round.formatLabel}`}
      />

      {/* --- Course card: tapping it is how you reach the scorecards ------- */}
      {course && (
        <Link href={`/course/${course.id}`} className="card-raised tap block overflow-hidden">
          <div className="px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="display truncate text-xl font-bold">{course.name}</h2>
                <p className="mt-0.5 truncate text-sm text-chalk-400">{course.location}</p>
              </div>
              <span className="chip shrink-0 bg-white/10 text-chalk-300">
                {round.teeTime ?? '—'}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
              <Fact label="Par" value={String(holes.reduce((s, h) => s + h.par, 0) || tee?.par || '—')} />
              <Fact label="Tees" value={tee?.name ?? '—'} />
              <Fact label="CR" value={tee ? String(tee.courseRating) : '—'} />
              <Fact label="Slope" value={tee ? String(tee.slopeRating) : '—'} />
            </div>
            <p className="mt-3 text-sm font-semibold text-fairway-300">
              View the course card →
            </p>
          </div>
        </Link>
      )}

      {/* --- Start scoring: opens this round's linked scorecard directly --- */}
      {matches.length > 0 && (
        <Link
          href={`/round/${round.id}/score${session?.playerId ? `?player=${session.playerId}` : ''}`}
          className="btn-primary w-full text-base"
        >
          Start scoring →
        </Link>
      )}

      {/* Anyone can rearrange the 4-balls — no admin PIN needed. */}
      <Link href={`/round/${round.id}/four-balls`} className="card tap block px-3.5 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0">
            <span className="block text-sm font-semibold">4-balls</span>
            <span className="block truncate text-xs text-chalk-500">
              {fourBalls.length > 0
                ? fourBalls
                    .map((group) =>
                      group.playerIds
                        .map((id) => playerById(id)?.name.split(' ')[0] ?? '?')
                        .join(', '),
                    )
                    .join('  ·  ')
                : 'Not set yet — tap to group the players'}
            </span>
          </span>
          <span className="shrink-0 text-chalk-500" aria-hidden>
            ›
          </span>
        </div>
      </Link>

      {course && !course.dataVerified && (
        <Warning href={`/admin/courses/${course.id}/verify`}>
          {course.name} is not verified yet — par, stroke index and ratings are still placeholders.
          Photograph the real card the evening before and verify it here.
        </Warning>
      )}
      {course?.dataVerified && course.verifiedAt && (
        <p className="rounded-xl border border-fairway-400/30 bg-fairway-500/10 px-3 py-2 text-xs text-fairway-300">
          ✓ Course verified{course.verifiedBy ? ` by ${course.verifiedBy}` : ''} on{' '}
          {formatDate(course.verifiedAt.slice(0, 10))}. Course handicaps below are live.
        </p>
      )}

      {/* --- Day score ------------------------------------------------------ */}
      {home && away && matches.length > 0 && (
        <div className="card flex items-center justify-around px-4 py-3">
          <DayScore team={home} value={dayStandings.byTeam[home.id]?.points ?? 0} />
          <div className="text-center">
            <div className="label">Day {round.dayNo}</div>
            <div className="mt-0.5 text-[0.65rem] text-chalk-500">
              {fmtPoints(dayStandings.pointsTotal)} pts on offer
            </div>
          </div>
          <DayScore team={away} value={dayStandings.byTeam[away.id]?.points ?? 0} />
        </div>
      )}

      {round.notes && (
        <div className="card px-3.5 py-3 text-sm text-chalk-300">{round.notes}</div>
      )}

      {/* --- Who gets shots, and where -------------------------------------- */}
      <SectionTitle>Handicaps &amp; strokes</SectionTitle>
      <StrokesTable round={round} />

      {/* --- Matches -------------------------------------------------------- */}
      {matches.length === 0 ? (
        <EmptyState
          title="No matches set up yet"
          detail="Captains can add the pairings in Admin → Formats & pairings."
          cta={
            <Link href="/admin/pairings" className="btn-ghost mt-2">
              Set up pairings
            </Link>
          }
        />
      ) : (
        [...groups.entries()].map(([key, groupMatches]) => {
          const first = groupMatches[0];
          const isFullRound = first.startHole === 1 && first.endHole === 18;
          return (
            <div key={key}>
              <SectionTitle>
                {isFullRound
                  ? FORMAT_LABELS[first.format]
                  : `Holes ${first.startHole}–${first.endHole} · ${FORMAT_LABELS[first.format]}`}
              </SectionTitle>
              <div className="space-y-2">
                {groupMatches.map((match) => (
                  <MatchTile key={match.id} matchId={match.id} showFormat={false} />
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  function DayScore({ team, value }: { team: (typeof snapshot.teams)[number]; value: number }) {
    return (
      <div className="text-center">
        <div className="text-lg">{team.crest}</div>
        <div className="tabular display text-2xl font-bold" style={{ color: team.accent }}>
          {fmtPoints(value)}
        </div>
        <div className="text-[0.6rem] font-bold uppercase tracking-wider text-chalk-500">
          {team.shortName}
        </div>
      </div>
    );
  }
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-black/25 px-1.5 py-2">
      <div className="tabular text-sm font-bold leading-none">{value}</div>
      <div className="label mt-1 !text-[0.6rem]">{label}</div>
    </div>
  );
}
