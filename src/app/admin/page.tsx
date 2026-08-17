'use client';

import Link from 'next/link';
import { useSession } from '@/lib/auth/session-provider';
import { useTour } from '@/lib/data/provider';
import { AdminLocked } from '@/components/admin/AdminShell';
import { LinkRow, PageHeader, SectionTitle } from '@/components/ui';

/** Admin hub. Every editable part of the tour hangs off here. */
export default function AdminPage() {
  const { session, pinRequired } = useSession();
  const { snapshot } = useTour();

  if (pinRequired && !session?.isAdmin) {
    return <AdminLocked title="Admin" />;
  }

  const missingHandicaps = snapshot.players.filter((p) => p.handicapIndex === null).length;
  const unverifiedCourses = snapshot.courses.filter((c) => !c.dataVerified).length;

  return (
    <div className="space-y-3 pb-6">
      <PageHeader title="Admin" back="/more" subtitle="Organiser & captains" />

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
