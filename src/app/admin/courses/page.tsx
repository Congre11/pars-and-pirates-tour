'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTour } from '@/lib/data/provider';
import { AdminShell } from '@/components/admin/AdminShell';
import { Accordion, NumberField, TextField, ToggleField } from '@/components/admin/fields';
import { Warning } from '@/components/ui';

/**
 * Course data entry.
 *
 * This is the screen that turns the seeded placeholder cards into the real
 * ones. Par and stroke index drive every net score in the tour, so getting
 * them right matters more than anything else on this page.
 *
 * The stroke index checker below flags the two mistakes people actually make:
 * a duplicated index and a total par that does not match the tee.
 */
export default function AdminCoursesPage() {
  const { snapshot, update, teesForCourse, holesForCourse } = useTour();
  const [activeTee, setActiveTee] = useState<Record<string, string>>({});

  return (
    <AdminShell title="Courses" subtitle="Par, stroke index, yardage and ratings">
      <Warning>
        Every course was seeded with a plausible but UNVERIFIED card so the app works out of the
        box. The quickest way to fix one is to photograph the real card the evening before —
        tap a course, then “Verify with a scorecard photo”.
      </Warning>

      {snapshot.courses.map((course) => {
        const tees = teesForCourse(course.id);
        const holes = holesForCourse(course.id);
        const teeId = activeTee[course.id] ?? tees[0]?.id;
        const totalPar = holes.reduce((sum, h) => sum + h.par, 0);
        const indexes = holes.map((h) => h.strokeIndex).sort((a, b) => a - b);
        const duplicateIndexes = indexes.filter((si, i) => i > 0 && si === indexes[i - 1]);
        const teePar = tees.find((t) => t.id === teeId)?.par;

        return (
          <Accordion
            key={course.id}
            title={course.name}
            subtitle={`Par ${totalPar} · ${holes.length} holes · ${tees.length} tees`}
            badge={
              course.dataVerified ? (
                <span className="chip bg-fairway-500/25 text-fairway-300">OK</span>
              ) : (
                <span className="chip bg-brass-500/25 text-brass-300">CHECK</span>
              )
            }
          >
            <Link href={`/admin/courses/${course.id}/verify`} className="btn-primary w-full text-sm">
              📷 Verify with a scorecard photo
            </Link>
            {course.dataVerified && course.verifiedAt && (
              <p className="rounded-lg bg-fairway-500/10 px-3 py-2 text-xs text-fairway-300">
                Verified{course.verifiedBy ? ` by ${course.verifiedBy}` : ''} on{' '}
                {new Date(course.verifiedAt).toLocaleDateString()}
                {course.sourceNotes ? ` · ${course.sourceNotes}` : ''}
              </p>
            )}

            <ToggleField
              label="Data verified"
              value={course.dataVerified}
              hint="Set by the verification screen above. Turn it off here if the data turns out to be wrong."
              onSave={(value) =>
                update('courses', course.id, {
                  dataVerified: value,
                  verifiedAt: value ? new Date().toISOString() : null,
                })
              }
            />

            {duplicateIndexes.length > 0 && (
              <Warning>
                Stroke index {duplicateIndexes.join(', ')} is used more than once. Each of 1–18
                should appear exactly once, or strokes will be allocated wrongly.
              </Warning>
            )}
            {teePar != null && teePar !== totalPar && (
              <Warning>
                The holes add up to par {totalPar} but the selected tee says par {teePar}. Fix one
                of them — the course handicap formula uses the tee’s par.
              </Warning>
            )}

            <TextField
              label="Course name"
              value={course.name}
              onSave={(value) => update('courses', course.id, { name: value })}
            />
            <TextField
              label="Location"
              value={course.location ?? ''}
              onSave={(value) => update('courses', course.id, { location: value || null })}
            />
            <TextField
              label="Official scorecard link"
              value={course.sourceUrl ?? ''}
              placeholder="https://…"
              type="url"
              inputMode="url"
              hint="Reference only — a small link on the course screen. All scoring stays in this app."
              onSave={(value) => update('courses', course.id, { sourceUrl: value || null })}
            />

            {/* --- Tees --------------------------------------------------- */}
            <div>
              <div className="label mb-2">Tees</div>
              <div className="space-y-2">
                {tees.map((tee) => (
                  <div key={tee.id} className="rounded-xl bg-black/30 px-3 py-3">
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: tee.colour }}
                      />
                      <span className="text-sm font-bold">{tee.name}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <NumberField
                        label="Rating"
                        value={tee.courseRating}
                        step={0.1}
                        onSave={(value) => update('tees', tee.id, { courseRating: value ?? 72 })}
                      />
                      <NumberField
                        label="Slope"
                        value={tee.slopeRating}
                        min={55}
                        max={155}
                        onSave={(value) => update('tees', tee.id, { slopeRating: value ?? 113 })}
                      />
                      <NumberField
                        label="Par"
                        value={tee.par}
                        onSave={(value) => update('tees', tee.id, { par: value ?? 72 })}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* --- Hole-by-hole ------------------------------------------- */}
            <div>
              <div className="label mb-2">Holes</div>
              {tees.length > 1 && (
                <div className="mb-2 flex gap-1.5">
                  {tees.map((tee) => (
                    <button
                      key={tee.id}
                      onClick={() => setActiveTee((prev) => ({ ...prev, [course.id]: tee.id }))}
                      className={`tap flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold ${
                        teeId === tee.id ? 'bg-fairway-500 text-white' : 'bg-white/8 text-chalk-300'
                      }`}
                    >
                      {tee.name} yds
                    </button>
                  ))}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="tabular w-full min-w-[22rem] text-center text-xs">
                  <thead>
                    <tr className="text-[0.6rem] uppercase tracking-wider text-chalk-500">
                      <th className="py-1.5">Hole</th>
                      <th className="py-1.5">Par</th>
                      <th className="py-1.5">SI</th>
                      <th className="py-1.5">Yards</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holes.map((hole) => (
                      <tr key={hole.id} className="border-t border-white/6">
                        <td className="py-1 font-bold">{hole.holeNo}</td>
                        <td className="py-1">
                          <CellInput
                            value={hole.par}
                            min={3}
                            max={6}
                            onSave={(value) => update('holes', hole.id, { par: value })}
                          />
                        </td>
                        <td className="py-1">
                          <CellInput
                            value={hole.strokeIndex}
                            min={1}
                            max={18}
                            onSave={(value) => update('holes', hole.id, { strokeIndex: value })}
                          />
                        </td>
                        <td className="py-1">
                          <CellInput
                            value={teeId ? (hole.yardages[teeId] ?? 0) : 0}
                            min={0}
                            max={800}
                            wide
                            onSave={(value) =>
                              teeId
                                ? update('holes', hole.id, {
                                    yardages: { ...hole.yardages, [teeId]: value },
                                  })
                                : undefined
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-white/12 text-[0.7rem] font-bold">
                      <td className="py-2">Tot</td>
                      <td className="py-2">{totalPar}</td>
                      <td />
                      <td className="py-2">
                        {teeId
                          ? holes.reduce((sum, h) => sum + (h.yardages[teeId] ?? 0), 0)
                          : '—'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </Accordion>
        );
      })}
    </AdminShell>
  );
}

/** A compact numeric cell that commits on blur — good enough for 72 of them. */
function CellInput({
  value,
  onSave,
  min,
  max,
  wide,
}: {
  value: number;
  onSave: (value: number) => Promise<void> | void | undefined;
  min?: number;
  max?: number;
  wide?: boolean;
}) {
  const [local, setLocal] = useState(String(value));
  const [dirty, setDirty] = useState(false);
  const [lastSeen, setLastSeen] = useState(value);

  // Adopt values that arrive from elsewhere, but never while it is being typed.
  if (lastSeen !== value) {
    setLastSeen(value);
    if (!dirty) setLocal(String(value));
  }

  return (
    <input
      className={`tabular rounded-md border border-white/10 bg-ink-900 px-1 py-1.5 text-center text-xs ${
        wide ? 'w-16' : 'w-12'
      } focus:border-fairway-400 focus:outline-none`}
      value={local}
      inputMode="numeric"
      onChange={(e) => {
        setDirty(true);
        setLocal(e.target.value);
      }}
      onBlur={() => {
        setDirty(false);
        const parsed = Number(local);
        if (!Number.isFinite(parsed)) {
          setLocal(String(value));
          return;
        }
        const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, Math.round(parsed)));
        setLocal(String(clamped));
        if (clamped !== value) void onSave(clamped);
      }}
    />
  );
}
