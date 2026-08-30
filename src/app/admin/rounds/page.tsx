'use client';

import Link from 'next/link';
import { useTour } from '@/lib/data/provider';
import { AdminShell } from '@/components/admin/AdminShell';
import { Accordion, SelectField, TextField } from '@/components/admin/fields';
import { formatDate } from '@/lib/format';
import { isRoundLocked } from '@/lib/types';

/** Rounds: date, tee time, course, tees and whether the round is live. */
export default function AdminRoundsPage() {
  const { snapshot, update, courseById, teesForCourse, matchesForRound } = useTour();

  return (
    <AdminShell title="Rounds" subtitle="Dates, tee times and which tees you are playing">
      {[...snapshot.rounds]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((round) => {
          const course = courseById(round.courseId);
          const tees = teesForCourse(round.courseId);
          const locked = isRoundLocked(round);
          const tee = tees.find((t) => t.id === round.teeId);
          return (
            <Accordion
              key={round.id}
              title={round.name}
              subtitle={`${formatDate(round.date)} · ${round.teeTime ?? 'no tee time'} · ${course?.name ?? '—'}`}
              badge={
                round.handicapSource === 'manual' ? (
                  <span className="chip bg-brass-500/25 text-brass-300">MANUAL CH</span>
                ) : round.status === 'live' ? (
                  <span className="chip bg-fairway-500/25 text-fairway-300">LIVE</span>
                ) : round.status === 'complete' ? (
                  <span className="chip bg-white/10 text-chalk-400">DONE</span>
                ) : undefined
              }
            >
              <TextField
                label="Round name"
                value={round.name}
                onSave={(value) => update('rounds', round.id, { name: value })}
              />
              <TextField
                label="Date"
                value={round.date}
                type="date"
                onSave={(value) => update('rounds', round.id, { date: value })}
              />
              <TextField
                label="Tee time"
                value={round.teeTime ?? ''}
                type="time"
                onSave={(value) => update('rounds', round.id, { teeTime: value || null })}
              />

              {locked ? (
                <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3">
                  <div className="label mb-1">Course and tees</div>
                  <p className="text-sm font-semibold">
                    {course?.name ?? '—'} · {tee?.name ?? '—'} tees
                  </p>
                  <p className="tabular mt-0.5 text-xs text-chalk-500">
                    CR {tee?.courseRating ?? '—'} · Slope {tee?.slopeRating ?? '—'} · Par{' '}
                    {tee?.par ?? '—'}
                  </p>
                  <p className="mt-2 text-xs leading-snug text-brass-300">
                    Day {round.dayNo} is complete, so this is what it was actually played off and
                    cannot be changed. To correct what the leaderboard shows, set the official
                    result instead.
                  </p>
                  <Link href="/admin/results" className="btn-ghost mt-2 w-full text-sm">
                    Official results
                  </Link>
                </div>
              ) : (
                <>
                  <SelectField
                    label="Course"
                    value={round.courseId}
                    options={snapshot.courses.map((c) => ({ value: c.id, label: c.name }))}
                    hint="Changing the course also changes which scorecard the round opens."
                    onSave={(value) => {
                      const firstTee = teesForCourse(value)[0];
                      return update('rounds', round.id, {
                        courseId: value,
                        ...(firstTee ? { teeId: firstTee.id } : {}),
                      });
                    }}
                  />

                  <SelectField
                    label="Tees"
                    value={round.teeId}
                    options={tees.map((t) => ({
                      value: t.id,
                      label: `${t.name} — CR ${t.courseRating} / Slope ${t.slopeRating}`,
                    }))}
                    hint="This drives every course handicap in the round, unless the round is on manual handicaps."
                    onSave={(value) => update('rounds', round.id, { teeId: value })}
                  />
                </>
              )}

              <Link
                href={`/admin/rounds/${round.id}/handicaps`}
                className="btn-ghost w-full text-sm"
              >
                {round.handicapSource === 'manual'
                  ? '✎ Course handicaps — manual'
                  : '✎ Course handicaps — calculated'}
              </Link>

              <SelectField
                label="Status"
                value={round.status}
                options={[
                  { value: 'upcoming', label: 'Upcoming' },
                  { value: 'live', label: 'Live — show on Home' },
                  { value: 'complete', label: 'Complete' },
                ]}
                onSave={(value) => update('rounds', round.id, { status: value })}
              />

              <TextField
                label="Format description"
                value={round.formatLabel}
                hint="Shown on the leaderboard and the day card."
                onSave={(value) => update('rounds', round.id, { formatLabel: value })}
              />

              <TextField
                label="Notes"
                value={round.notes ?? ''}
                onSave={(value) => update('rounds', round.id, { notes: value || null })}
              />

              <p className="text-xs text-chalk-500">
                {matchesForRound(round.id).length} matches on this round. Edit them in Tour settings →
                Pairings.
              </p>
            </Accordion>
          );
        })}
    </AdminShell>
  );
}
