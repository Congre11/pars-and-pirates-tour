'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useTour } from '@/lib/data/provider';
import { useSession } from '@/lib/auth/session-provider';
import { Scoreboard } from '@/components/Scoreboard';
import { MatchTile } from '@/components/MatchTile';
import { SectionTitle, Warning } from '@/components/ui';
import { buildFeed, currentRound, matchesForPlayer } from '@/lib/tour-helpers';
import { countdownLabel, formatDate, todayIso } from '@/lib/format';
import { FORMAT_LABELS } from '@/lib/types';

/**
 * Home / Tour Hub.
 *
 * Answers the four questions someone opens the app to ask, in order:
 * what's the score, what are we playing next, where do I enter my score, and
 * what just happened.
 */
export default function HomePage() {
  const {
    snapshot,
    outcomes,
    courseById,
    teeById,
    matchesForRound,
    holesForCourse,
  } = useTour();
  const { session } = useSession();

  const round = useMemo(() => currentRound(snapshot, outcomes), [snapshot, outcomes]);
  const feed = useMemo(() => buildFeed(snapshot, outcomes, 6), [snapshot, outcomes]);

  const course = round ? courseById(round.courseId) : undefined;
  const tee = round ? teeById(round.teeId) : undefined;
  const roundMatches = round ? matchesForRound(round.id) : [];
  const myMatches = round ? matchesForPlayer(session?.playerId ?? null, round.id, snapshot) : [];

  const missingHandicaps = snapshot.players.filter((p) => p.handicapIndex === null);
  const unverifiedCourses = snapshot.courses.filter((c) => !c.dataVerified);

  const todaysItinerary = snapshot.itinerary
    .filter((item) => item.date === todayIso())
    .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));

  return (
    <div className="space-y-5 pb-6">
      {/* --- Branding ------------------------------------------------------ */}
      <div className="pt-1 text-center">
        <h1 className="display text-3xl font-bold leading-none">
          Pars <span className="text-chalk-500">&amp;</span> Pirates
        </h1>
        <p className="mt-1 text-xs uppercase tracking-[0.22em] text-brass-400">
          {snapshot.tour.location} · {snapshot.tour.year}
        </p>
      </div>

      <Scoreboard projected={round?.dayNo === 4} />

      {/* --- Next course: the whole card opens the live scorecard ---------- */}
      {round && course && (
        <Link
          href={`/round/${round.id}`}
          className="card-raised tap block overflow-hidden"
        >
          <div className="flex items-center justify-between bg-fairway-500/15 px-4 py-2">
            <span className="label !text-fairway-300">
              {round.status === 'complete' ? 'Last played' : 'Next up'} · Day {round.dayNo}
            </span>
            <span className="text-[0.7rem] font-semibold text-chalk-300">
              {countdownLabel(round.date)}
            </span>
          </div>

          <div className="px-4 py-4">
            <h2 className="display text-2xl font-bold leading-tight">{course.name}</h2>
            <p className="mt-0.5 text-sm text-chalk-400">{course.location}</p>

            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Fact label="Tee time" value={round.teeTime ?? '—'} />
              <Fact label="Tees" value={tee?.name ?? '—'} />
              <Fact
                label="Par"
                value={String(
                  holesForCourse(course.id).reduce((sum, h) => sum + h.par, 0) || tee?.par || '—',
                )}
              />
            </div>

            <p className="mt-3 text-sm font-medium text-chalk-200">{round.formatLabel}</p>

            <div className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-fairway-300">
              Open the live scorecard <span aria-hidden>→</span>
            </div>
          </div>
        </Link>
      )}

      {/* --- Straight to my match ------------------------------------------ */}
      {myMatches.length > 0 && (
        <div className="grid gap-2">
          {myMatches.map((matchId) => (
            <Link key={matchId} href={`/match/${matchId}?score=1`} className="btn-primary w-full text-base">
              Enter scores · {snapshot.matches.find((m) => m.id === matchId)?.name}
            </Link>
          ))}
        </div>
      )}
      {myMatches.length === 0 && round && roundMatches.length > 0 && (
        <Link href={`/round/${round.id}`} className="btn-primary w-full text-base">
          Enter a score
        </Link>
      )}

      {/* --- Setup warnings ------------------------------------------------ */}
      {(missingHandicaps.length > 0 || unverifiedCourses.length > 0) && (
        <div className="space-y-2">
          {missingHandicaps.length > 0 && (
            <Warning href="/admin/players">
              {missingHandicaps.length} of {snapshot.players.length} players have no handicap index
              yet. They are being scored off scratch until one is entered.
            </Warning>
          )}
          {unverifiedCourses.length > 0 && (
            <Warning href="/admin/courses">
              {unverifiedCourses.length} course{unverifiedCourses.length === 1 ? '' : 's'} still
              have placeholder par / stroke index data. Check them against the real scorecard.
            </Warning>
          )}
        </div>
      )}

      {/* --- Today's matches ----------------------------------------------- */}
      {round && roundMatches.length > 0 && (
        <div>
          <SectionTitle
            action={
              <Link href={`/round/${round.id}`} className="text-xs font-semibold text-fairway-300">
                All matches
              </Link>
            }
          >
            {round.name}
          </SectionTitle>
          <div className="space-y-2">
            {roundMatches.slice(0, 4).map((match) => (
              <MatchTile key={match.id} matchId={match.id} />
            ))}
          </div>
        </div>
      )}

      {/* --- Live activity -------------------------------------------------- */}
      {feed.length > 0 && (
        <div>
          <SectionTitle>Latest</SectionTitle>
          <div className="card divide-y divide-white/6">
            {feed.map((entry) => (
              <Link
                key={entry.id}
                href={`/match/${entry.matchId}`}
                className="tap flex items-center gap-3 px-3.5 py-2.5"
              >
                <span
                  className="h-8 w-1 shrink-0 rounded-full"
                  style={{ backgroundColor: entry.teamColour ?? '#3a4a42' }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{entry.message}</span>
                  <span className="block truncate text-xs text-chalk-500">{entry.detail}</span>
                </span>
                {entry.tone === 'complete' && (
                  <span className="chip bg-brass-500/20 text-brass-300">FINAL</span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* --- Today's schedule ----------------------------------------------- */}
      {todaysItinerary.length > 0 && (
        <div>
          <SectionTitle
            action={
              <Link href="/itinerary" className="text-xs font-semibold text-fairway-300">
                Full itinerary
              </Link>
            }
          >
            Today · {formatDate(todayIso())}
          </SectionTitle>
          <div className="card divide-y divide-white/6">
            {todaysItinerary.map((item) => (
              <div key={item.id} className="flex gap-3 px-3.5 py-2.5">
                <span className="tabular w-12 shrink-0 text-sm font-bold text-brass-400">
                  {item.startTime ?? '—'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{item.title}</span>
                  {item.location && (
                    <span className="block truncate text-xs text-chalk-500">{item.location}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- Quick links ----------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-2">
        <Link href="/formats" className="card tap px-3 py-3 text-center text-sm font-semibold">
          📖 Formats &amp; rules
        </Link>
        <Link href="/teams" className="card tap px-3 py-3 text-center text-sm font-semibold">
          👥 Teams &amp; handicaps
        </Link>
      </div>

      {round && (
        <p className="pb-2 text-center text-xs text-chalk-500">
          Day {round.dayNo} · {FORMAT_LABELS[matchesForRound(round.id)[0]?.format ?? 'singles']} ·{' '}
          {formatDate(round.date)}
        </p>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-black/25 px-2 py-2">
      <div className="tabular text-base font-bold leading-none">{value}</div>
      <div className="label mt-1">{label}</div>
    </div>
  );
}
