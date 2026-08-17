'use client';

import Link from 'next/link';
import { useTour } from '@/lib/data/provider';
import { LinkRow, PageHeader, SectionTitle } from '@/components/ui';

/**
 * Tour settings.
 *
 * Open to everyone — the app has no PINs. These screens are simply the ones
 * you set up once before the tour rather than use on the course, which is why
 * they live behind More rather than on the round screen. The things you
 * actually change day to day (4-balls, matchups) are on the round itself.
 */
export default function AdminPage() {
  const { snapshot } = useTour();

  const missingHandicaps = snapshot.players.filter((p) => p.handicapIndex === null).length;
  const unverifiedCourses = snapshot.courses.filter((c) => !c.dataVerified).length;

  return (
    <div className="space-y-3 pb-6">
      <PageHeader title="Tour settings" back="/more" subtitle="Set up once, before you play" />

      <p className="card px-3.5 py-3 text-sm leading-snug text-chalk-300">
        Looking for today&rsquo;s <strong>4-balls</strong> or <strong>matchups</strong>? Those are on the
        round itself — open the day from the Schedule or the Leaderboard. You do not need this
        screen for either.
      </p>

      <SectionTitle>Before the tour</SectionTitle>
      <div className="space-y-2">
        <LinkRow
          href="/admin/players"
          title="Players & handicaps"
          detail={
            missingHandicaps > 0
              ? `${missingHandicaps} handicap index${missingHandicaps === 1 ? '' : 'es'} still missing`
              : 'All handicaps set'
          }
          icon="🏌️"
          trailing={
            missingHandicaps > 0 ? (
              <span className="chip bg-brass-500/25 text-brass-300">{missingHandicaps}</span>
            ) : undefined
          }
        />
        <LinkRow
          href="/admin/courses"
          title="Courses & scorecards"
          detail={
            unverifiedCourses > 0
              ? `${unverifiedCourses} course${unverifiedCourses === 1 ? '' : 's'} unverified`
              : 'All course data checked'
          }
          icon="⛳"
          trailing={
            unverifiedCourses > 0 ? (
              <span className="chip bg-brass-500/25 text-brass-300">{unverifiedCourses}</span>
            ) : undefined
          }
        />
        <LinkRow href="/admin/rounds" title="Rounds & tee times" detail="Dates, tees, status" icon="🕘" />
        <LinkRow
          href="/admin/pairings"
          title="Pairings & matches"
          detail={`${snapshot.matches.length} matches across ${snapshot.rounds.length} days`}
          icon="🤝"
        />
        <LinkRow href="/admin/rules" title="Points & handicap rules" detail="Allowances, points, locking" icon="⚖️" />
        <LinkRow href="/admin/itinerary" title="Itinerary" detail={`${snapshot.itinerary.length} entries`} icon="🗓️" />
      </div>

      <SectionTitle>During the tour</SectionTitle>
      <div className="space-y-2">
        <LinkRow href="/admin/scores" title="Correct scores" detail="Fix any hole, reset a practice run" icon="✏️" />
        <LinkRow href="/fines" title="Fines" detail="Add and settle fines" icon="💸" />
      </div>

      <SectionTitle>Setup</SectionTitle>
      <div className="space-y-2">
        <LinkRow href="/more/setup" title="Setup checklist" detail="Database, PINs, HNA" icon="✅" />
      </div>
    </div>
  );
}
