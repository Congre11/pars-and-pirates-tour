'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useTour } from '@/lib/data/provider';
import { EmptyState, PageHeader, SectionTitle, Warning } from '@/components/ui';
import { FORMAT_LABELS } from '@/lib/types';

/**
 * Course screen.
 *
 * Shows the full 18-hole card the scoring engine is actually using, per tee,
 * plus a link straight into the live scorecards for the round played here.
 * The external "Official Scorecard" link is deliberately a reference only —
 * all scoring stays inside this app.
 */
export default function CoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = use(params);
  const { courseById, teesForCourse, holesForCourse, snapshot, matchesForRound } = useTour();

  const course = courseById(courseId);
  const tees = teesForCourse(courseId);
  const holes = holesForCourse(courseId);
  const [teeId, setTeeId] = useState<string | null>(null);

  if (!course) {
    return (
      <EmptyState
        title="Course not found"
        cta={
          <Link href="/itinerary" className="btn-ghost mt-2">
            Back to the itinerary
          </Link>
        }
      />
    );
  }

  const rounds = snapshot.rounds.filter((r) => r.courseId === courseId);
  const activeTee = tees.find((t) => t.id === teeId) ?? tees.find((t) => t.id === rounds[0]?.teeId) ?? tees[0];

  const front = holes.filter((h) => h.holeNo <= 9);
  const back = holes.filter((h) => h.holeNo > 9);
  const totalPar = holes.reduce((sum, h) => sum + h.par, 0);
  const totalYards = activeTee
    ? holes.reduce((sum, h) => sum + (h.yardages[activeTee.id] ?? 0), 0)
    : 0;

  return (
    <div className="space-y-4 pb-6">
      <PageHeader
        title={course.name}
        subtitle={
          course.routing ? (
            <>
              {course.location}
              <span className="block text-brass-300">{course.routing}</span>
            </>
          ) : (
            course.location
          )
        }
        back=""
      />

      {!course.dataVerified && (
        <Warning href="/admin/courses">
          Placeholder card. The par, stroke index, yardage and rating below have not been checked
          against the real scorecard yet — enter them in Tour settings → Courses.
        </Warning>
      )}

      {/* --- Rounds played here: the course-to-scorecard link -------------- */}
      {rounds.map((round) => {
        const matches = matchesForRound(round.id);
        return (
          <Link key={round.id} href={`/round/${round.id}`} className="card-raised tap block px-4 py-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="label !text-fairway-300">Day {round.dayNo}</div>
                <div className="mt-0.5 truncate font-semibold">{round.name}</div>
                <div className="truncate text-sm text-chalk-400">
                  {round.teeTime} · {round.formatLabel}
                </div>
              </div>
              <span className="chip shrink-0 bg-fairway-500/20 text-fairway-300">
                {matches.length} match{matches.length === 1 ? '' : 'es'}
              </span>
            </div>
            <p className="mt-2 text-sm font-semibold text-fairway-300">Open live scorecards →</p>
          </Link>
        );
      })}

      {/* --- Tee selector ---------------------------------------------------- */}
      {tees.length > 0 && (
        <div>
          <SectionTitle>Tees</SectionTitle>
          <div className="flex gap-2">
            {tees.map((tee) => {
              const selected = activeTee?.id === tee.id;
              return (
                <button
                  key={tee.id}
                  onClick={() => setTeeId(tee.id)}
                  className={`tap flex-1 rounded-xl border px-2 py-2.5 text-center transition-colors ${
                    selected ? 'border-fairway-300 bg-fairway-500/20' : 'border-white/10 bg-white/5'
                  }`}
                >
                  <span
                    className="mx-auto mb-1 block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: tee.colour }}
                  />
                  <span className="block text-sm font-bold">{tee.name}</span>
                  <span className="tabular block text-[0.62rem] text-chalk-500">
                    CR {tee.courseRating} / {tee.slopeRating}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* --- Scorecard ------------------------------------------------------- */}
      <div>
        <SectionTitle>Scorecard</SectionTitle>
        <div className="card overflow-x-auto">
          <table className="tabular w-full min-w-[34rem] text-center text-sm">
            <tbody>
              {/* Named loops where the club has several, so the card matches
                  the routing actually being played. */}
              <NineBlock
                label={course.nineNames?.[0] ? `Out · ${course.nineNames[0]}` : 'Out'}
                holes={front}
                teeId={activeTee?.id}
              />
              <NineBlock
                label={course.nineNames?.[1] ? `In · ${course.nineNames[1]}` : 'In'}
                holes={back}
                teeId={activeTee?.id}
              />
              <tr className="border-t border-white/12 text-xs font-bold">
                <td className="sticky left-0 bg-ink-900 px-2 py-2.5 text-left">TOTAL</td>
                <td colSpan={10} className="px-2 py-2.5 text-left">
                  Par {totalPar}
                  {totalYards > 0 && (
                    <span className="ml-2 font-normal text-chalk-400">{totalYards} yards</span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {course.notes && <p className="text-sm text-chalk-400">{course.notes}</p>}

      {course.sourceUrl ? (
        <a
          href={course.sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="btn-ghost w-full"
        >
          Official scorecard (opens externally) ↗
        </a>
      ) : (
        <p className="text-center text-xs text-chalk-500">
          No official scorecard link stored. Add one in Tour settings → Courses.
        </p>
      )}

      {rounds.length > 0 && (
        <p className="text-center text-xs text-chalk-500">
          {FORMAT_LABELS[matchesForRound(rounds[0].id)[0]?.format ?? 'singles']} · all live scoring
          happens inside this app.
        </p>
      )}
    </div>
  );
}

function NineBlock({
  label,
  holes,
  teeId,
}: {
  label: string;
  holes: ReturnType<typeof useTour>['snapshot']['holes'];
  teeId?: string;
}) {
  if (holes.length === 0) return null;
  const par = holes.reduce((sum, h) => sum + h.par, 0);
  const yards = teeId ? holes.reduce((sum, h) => sum + (h.yardages[teeId] ?? 0), 0) : 0;

  return (
    <>
      <tr className="border-b border-white/10 text-[0.62rem] uppercase tracking-wider text-chalk-500">
        <td className="sticky left-0 bg-ink-900 px-2 py-1.5 text-left font-bold">Hole</td>
        {holes.map((hole) => (
          <td key={hole.holeNo} className="px-1 py-1.5 font-bold text-chalk-200">
            {hole.holeNo}
          </td>
        ))}
        <td className="px-2 py-1.5 font-bold">{label}</td>
      </tr>
      <tr className="border-b border-white/5">
        <td className="sticky left-0 bg-ink-900 px-2 py-1.5 text-left text-xs text-chalk-500">Par</td>
        {holes.map((hole) => (
          <td key={hole.holeNo} className="px-1 py-1.5">
            {hole.par}
          </td>
        ))}
        <td className="px-2 py-1.5 font-bold">{par}</td>
      </tr>
      <tr className="border-b border-white/5">
        <td className="sticky left-0 bg-ink-900 px-2 py-1.5 text-left text-xs text-chalk-500">SI</td>
        {holes.map((hole) => (
          <td key={hole.holeNo} className="px-1 py-1.5 text-chalk-400">
            {hole.strokeIndex}
          </td>
        ))}
        <td />
      </tr>
      {teeId && (
        <tr className="border-b border-white/10">
          <td className="sticky left-0 bg-ink-900 px-2 py-1.5 text-left text-xs text-chalk-500">
            Yds
          </td>
          {holes.map((hole) => (
            <td key={hole.holeNo} className="px-1 py-1.5 text-xs text-chalk-400">
              {hole.yardages[teeId] ?? '—'}
            </td>
          ))}
          <td className="px-2 py-1.5 text-xs font-bold">{yards || '—'}</td>
        </tr>
      )}
    </>
  );
}
