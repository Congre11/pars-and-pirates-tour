'use client';

import { useTour } from '@/lib/data/provider';
import { AdminShell } from '@/components/admin/AdminShell';
import { Accordion, SelectField, TextField } from '@/components/admin/fields';
import { formatDate } from '@/lib/format';

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
          return (
            <Accordion
              key={round.id}
              title={round.name}
              subtitle={`${formatDate(round.date)} · ${round.teeTime ?? 'no tee time'} · ${course?.name ?? '—'}`}
              badge={
                round.status === 'live' ? (
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
                options={tees.map((tee) => ({
                  value: tee.id,
                  label: `${tee.name} — CR ${tee.courseRating} / Slope ${tee.slopeRating}`,
                }))}
                hint="This drives every course handicap in the round."
                onSave={(value) => update('rounds', round.id, { teeId: value })}
              />

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
                {matchesForRound(round.id).length} matches on this round. Edit them in Admin →
                Pairings.
              </p>
            </Accordion>
          );
        })}
    </AdminShell>
  );
}
