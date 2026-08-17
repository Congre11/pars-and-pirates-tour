'use client';

import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTour } from '@/lib/data/provider';
import { useSession } from '@/lib/auth/session-provider';
import { AdminShell } from '@/components/admin/AdminShell';
import { EmptyState, SectionTitle, Warning } from '@/components/ui';
import { formatBytes, prepareScorecardImage } from '@/lib/courses/image';
import { summariseMissing, type Confidence, type ExtractedScorecard } from '@/lib/courses/extraction';
import type { DistanceUnit } from '@/lib/types';

/**
 * Course verification — the evening-before workflow.
 *
 *   1. Open tomorrow's course.
 *   2. Photograph the official scorecard and upload it.
 *   3. The photo is read into editable fields (never saved automatically).
 *   4. Review every value on this screen; uncertain readings are highlighted.
 *   5. Correct anything wrong by typing over it.
 *   6. Save, then "Confirm & mark course as verified".
 *   7. Course handicaps recalculate immediately, everywhere.
 *
 * Two rules are enforced rather than merely documented: extraction never sets
 * `dataVerified`, and re-verifying an already-verified course asks first.
 */

interface DraftHole {
  holeNo: number;
  par: number | null;
  strokeIndex: number | null;
  distance: number | null;
  confidence: Confidence;
}

interface Draft {
  courseName: string;
  teeName: string;
  distanceUnit: DistanceUnit;
  par: number | null;
  courseRating: number | null;
  slopeRating: number | null;
  sourceNotes: string;
  holes: DraftHole[];
  /** Which fields came from a photo and were flagged as uncertain. */
  uncertain: Set<string>;
  extractionNotes: string | null;
}

export default function VerifyCoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = use(params);
  const { snapshot, courseById, teesForCourse, holesForCourse, update, mode } = useTour();
  const { session } = useSession();

  const course = courseById(courseId);
  const tees = teesForCourse(courseId);
  const holes = holesForCourse(courseId);

  const roundsHere = snapshot.rounds.filter((r) => r.courseId === courseId);
  const defaultTeeId = roundsHere[0]?.teeId ?? tees[0]?.id ?? '';
  const [teeId, setTeeId] = useState<string>('');
  const activeTeeId = teeId || defaultTeeId;
  const activeTee = tees.find((t) => t.id === activeTeeId);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [image, setImage] = useState<{ dataUrl: string; mimeType: string; bytes: number } | null>(null);
  const [storedImage, setStoredImage] = useState<string | null>(null);
  const [busy, setBusy] = useState<'idle' | 'reading' | 'saving'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [extractorReady, setExtractorReady] = useState<boolean | null>(null);
  const [extractorMessage, setExtractorMessage] = useState<string>('');
  const [confirmReverify, setConfirmReverify] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Is photo reading switched on for this deployment?
  useEffect(() => {
    fetch('/api/courses/extract-scorecard')
      .then((r) => r.json())
      .then((data: { configured: boolean; message: string }) => {
        setExtractorReady(data.configured);
        setExtractorMessage(data.message);
      })
      .catch(() => setExtractorReady(false));
  }, []);

  // Any photo already stored against this course.
  useEffect(() => {
    fetch(`/api/courses/scorecard-image?courseId=${encodeURIComponent(courseId)}`)
      .then((r) => r.json())
      .then((data: { image?: { imageData: string } | null }) => {
        if (data.image?.imageData) setStoredImage(data.image.imageData);
      })
      .catch(() => undefined);
  }, [courseId]);

  /** Seed the editable draft from whatever is currently saved. */
  const draftFromCourse = (): Draft | null => {
    if (!course || !activeTee) return null;
    return {
      courseName: course.name,
      teeName: activeTee.name,
      distanceUnit: activeTee.distanceUnit,
      par: activeTee.par,
      courseRating: activeTee.courseRating,
      slopeRating: activeTee.slopeRating,
      sourceNotes: course.sourceNotes ?? '',
      holes: holes.map((hole) => ({
        holeNo: hole.holeNo,
        par: hole.par,
        strokeIndex: hole.strokeIndex,
        distance: hole.yardages[activeTee.id] ?? null,
        confidence: 'high' as Confidence,
      })),
      uncertain: new Set<string>(),
      extractionNotes: null,
    };
  };

  const currentDraft = draft ?? draftFromCourse();

  // Cheap enough (18 holes) to recompute on render; the React Compiler
  // memoizes it, and a manual useMemo here would key off a mutable Set.
  const missing = currentDraft
    ? summariseMissing({
        courseRating: currentDraft.courseRating,
        slopeRating: currentDraft.slopeRating,
        par: currentDraft.par,
        holes: currentDraft.holes,
      })
    : { blocking: [] as string[], warnings: [] as string[], canVerify: false };

  if (!course) {
    return (
      <AdminShell title="Verify course">
        <EmptyState
          title="Course not found"
          cta={
            <Link href="/admin/courses" className="btn-ghost mt-2">
              Back to courses
            </Link>
          }
        />
      </AdminShell>
    );
  }

  const patchDraft = (patch: Partial<Draft>) => {
    const base = currentDraft;
    if (!base) return;
    setDraft({ ...base, ...patch });
    setNotice(null);
  };

  const patchHole = (holeNo: number, patch: Partial<DraftHole>) => {
    const base = currentDraft;
    if (!base) return;
    setDraft({
      ...base,
      holes: base.holes.map((h) => (h.holeNo === holeNo ? { ...h, ...patch } : h)),
    });
    setNotice(null);
  };

  // --- Step 2: upload the photo -------------------------------------------
  const onPickFile = async (file: File) => {
    setError(null);
    setNotice(null);
    try {
      const prepared = await prepareScorecardImage(file);
      setImage({ dataUrl: prepared.dataUrl, mimeType: prepared.mimeType, bytes: prepared.approxBytes });

      // Preserve the photo against the course record for later reference.
      if (mode === 'supabase') {
        await fetch('/api/courses/scorecard-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            courseId,
            imageData: prepared.dataUrl,
            mimeType: prepared.mimeType,
          }),
        }).catch(() => undefined);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that image.');
    }
  };

  // --- Step 3: extract into editable fields --------------------------------
  const extract = async () => {
    if (!image) return;
    setBusy('reading');
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/courses/extract-scorecard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageData: image.dataUrl,
          mimeType: image.mimeType,
          courseHint: course.name,
          teeHint: activeTee?.name,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? 'Could not read the photo.');
        return;
      }

      const extracted = body.extracted as ExtractedScorecard;
      const base = currentDraft ?? draftFromCourse();
      if (!base) return;

      // Extracted values fill the draft. Anything the reader could not see
      // stays as whatever was already saved rather than being wiped.
      const flagged = (key: string, confidence: Confidence): string[] =>
        confidence === 'high' ? [] : [key];

      const nextHoles = base.holes.map((hole) => {
        const read = extracted.holes.find((h) => h.holeNo === hole.holeNo);
        if (!read) return hole;
        return {
          holeNo: hole.holeNo,
          par: read.par,
          strokeIndex: read.strokeIndex,
          distance: read.distance,
          confidence: read.confidence,
        };
      });

      const uncertain = new Set<string>([
        ...flagged('courseName', extracted.confidence.courseName),
        ...flagged('teeName', extracted.confidence.teeName),
        ...flagged('distanceUnit', extracted.confidence.distanceUnit),
        ...flagged('par', extracted.confidence.par),
        ...flagged('courseRating', extracted.confidence.courseRating),
        ...flagged('slopeRating', extracted.confidence.slopeRating),
        ...nextHoles.filter((h) => h.confidence !== 'high').map((h) => `hole-${h.holeNo}`),
      ]);

      setDraft({
        ...base,
        courseName: extracted.courseName ?? base.courseName,
        teeName: extracted.teeName ?? base.teeName,
        distanceUnit: extracted.distanceUnit ?? base.distanceUnit,
        par: extracted.par ?? base.par,
        courseRating: extracted.courseRating,
        slopeRating: extracted.slopeRating,
        holes: nextHoles,
        uncertain,
        extractionNotes: extracted.notes,
      });

      setNotice(
        'Read from the photo. Nothing has been saved yet — check every value below, especially the highlighted ones.',
      );
    } catch {
      setError('Could not reach the reader. Check the connection and try again.');
    } finally {
      setBusy('idle');
    }
  };

  // --- Step 5/6: save (never verifies on its own) --------------------------
  const save = async (): Promise<boolean> => {
    if (!currentDraft || !activeTee) return false;
    setBusy('saving');
    setError(null);
    try {
      await update('courses', course.id, {
        name: currentDraft.courseName.trim() || course.name,
        sourceNotes: currentDraft.sourceNotes.trim() || null,
      });
      await update('tees', activeTee.id, {
        name: currentDraft.teeName.trim() || activeTee.name,
        distanceUnit: currentDraft.distanceUnit,
        par: currentDraft.par ?? activeTee.par,
        courseRating: currentDraft.courseRating ?? activeTee.courseRating,
        slopeRating: currentDraft.slopeRating ?? activeTee.slopeRating,
        yardage: currentDraft.holes.reduce((sum, h) => sum + (h.distance ?? 0), 0) || null,
      });
      for (const hole of currentDraft.holes) {
        const existing = holes.find((h) => h.holeNo === hole.holeNo);
        if (!existing) continue;
        await update('holes', existing.id, {
          par: hole.par ?? existing.par,
          strokeIndex: hole.strokeIndex ?? existing.strokeIndex,
          yardages:
            hole.distance === null
              ? existing.yardages
              : { ...existing.yardages, [activeTee.id]: hole.distance },
        });
      }
      setNotice('Saved. The course is still marked unverified until you confirm it below.');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
      return false;
    } finally {
      setBusy('idle');
    }
  };

  // --- Step 9: the explicit verify action ----------------------------------
  const confirmAndVerify = async () => {
    if (!missing.canVerify) return;
    const saved = await save();
    if (!saved) return;
    await update('courses', course.id, {
      dataVerified: true,
      verifiedAt: new Date().toISOString(),
      verifiedBy: session?.playerName ?? 'Admin',
    });
    setConfirmReverify(false);
    setNotice(
      'Course verified. Every player’s course handicap for this round has been recalculated.',
    );
  };

  const unverify = async () => {
    await update('courses', course.id, { dataVerified: false, verifiedAt: null, verifiedBy: null });
    setNotice('Course marked unverified again.');
  };

  const isUncertain = (key: string) => currentDraft?.uncertain.has(key) ?? false;

  return (
    <AdminShell title="Verify course" subtitle={course.name}>
      {/* --- Status ---------------------------------------------------------- */}
      {course.dataVerified ? (
        <div className="card border-fairway-400/40 bg-fairway-500/10 px-4 py-3 text-sm text-fairway-300">
          <p className="font-bold">✓ Verified</p>
          <p className="mt-1 leading-snug">
            Checked{course.verifiedBy ? ` by ${course.verifiedBy}` : ''}
            {course.verifiedAt ? ` on ${new Date(course.verifiedAt).toLocaleString()}` : ''}.
            {course.sourceNotes ? ` Source: ${course.sourceNotes}` : ''}
          </p>
        </div>
      ) : (
        <Warning>
          Not verified yet. Par, stroke index and ratings are placeholders until you confirm them,
          and the app warns about it on every scorecard.
        </Warning>
      )}

      {notice && (
        <p className="rounded-xl border border-fairway-400/30 bg-fairway-500/10 px-3 py-2.5 text-sm text-fairway-300">
          {notice}
        </p>
      )}
      {error && (
        <p className="rounded-xl border border-pirate-400/40 bg-pirate-500/15 px-3 py-2.5 text-sm text-pirate-300">
          {error}
        </p>
      )}

      {/* --- Which tee ------------------------------------------------------- */}
      <SectionTitle>1 · Which tee are you playing?</SectionTitle>
      <div className="flex gap-2">
        {tees.map((tee) => (
          <button
            key={tee.id}
            onClick={() => {
              setTeeId(tee.id);
              setDraft(null);
            }}
            className={`tap flex-1 rounded-xl border px-2 py-2.5 text-center transition-colors ${
              activeTeeId === tee.id
                ? 'border-fairway-300 bg-fairway-500/20'
                : 'border-white/10 bg-white/5'
            }`}
          >
            <span
              className="mx-auto mb-1 block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: tee.colour }}
            />
            <span className="block text-sm font-bold">{tee.name}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-chalk-500">
        Everything below applies to the {activeTee?.name ?? 'selected'} tee. Change the round’s tee
        in Tour settings → Rounds.
      </p>

      {/* --- Photo ------------------------------------------------------------ */}
      <SectionTitle>2 · Photograph the official scorecard</SectionTitle>
      <div className="card space-y-3 px-3.5 py-3.5">
        <p className="text-sm leading-snug text-chalk-300">
          Take a photo of the real card at the pro shop, or upload a screenshot. Lay it flat, fill
          the frame, and make sure the par, stroke index and distance rows are all readable.
        </p>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onPickFile(file);
          }}
        />
        <button onClick={() => fileRef.current?.click()} className="btn-ghost w-full">
          {image ? 'Choose a different photo' : '📷 Take or choose a photo'}
        </button>

        {(image || storedImage) && (
          <div className="overflow-hidden rounded-xl border border-white/10">
            {/* Local blob/data URLs — a plain img avoids an image-host allow-list. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image?.dataUrl ?? storedImage ?? ''}
              alt="Uploaded scorecard"
              className="max-h-72 w-full bg-white object-contain"
            />
            <p className="bg-black/40 px-3 py-1.5 text-[0.68rem] text-chalk-500">
              {image
                ? `New photo · ${formatBytes(image.bytes)} · kept against this course`
                : 'Previously uploaded photo, kept for reference'}
            </p>
          </div>
        )}

        {extractorReady === false && (
          <p className="rounded-lg bg-brass-500/10 px-3 py-2 text-xs text-brass-300">
            {extractorMessage}
          </p>
        )}

        {image && extractorReady !== false && (
          <button onClick={extract} disabled={busy !== 'idle'} className="btn-primary w-full">
            {busy === 'reading' ? 'Reading the card…' : '3 · Read the scorecard from this photo'}
          </button>
        )}
        <p className="text-xs leading-snug text-chalk-500">
          Reading a photo only fills in the boxes below. Nothing is saved and the course is never
          marked verified until you press the button at the bottom yourself.
        </p>
      </div>

      {currentDraft?.extractionNotes && (
        <Warning>Reader’s note: {currentDraft.extractionNotes}</Warning>
      )}

      {/* --- Review ----------------------------------------------------------- */}
      <SectionTitle>4 · Check and correct every value</SectionTitle>

      {currentDraft && (
        <>
          <div className="card space-y-3 px-3.5 py-3.5">
            <Field label="Course name" flagged={isUncertain('courseName')}>
              <input
                className="field"
                value={currentDraft.courseName}
                onChange={(e) => patchDraft({ courseName: e.target.value })}
              />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Tee name" flagged={isUncertain('teeName')}>
                <input
                  className="field"
                  value={currentDraft.teeName}
                  onChange={(e) => patchDraft({ teeName: e.target.value })}
                />
              </Field>
              <Field label="Distance unit" flagged={isUncertain('distanceUnit')}>
                <select
                  className="field"
                  value={currentDraft.distanceUnit}
                  onChange={(e) => patchDraft({ distanceUnit: e.target.value as DistanceUnit })}
                >
                  <option value="yards">Yards</option>
                  <option value="metres">Metres</option>
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Field label="Par" flagged={isUncertain('par')}>
                <NumberBox
                  value={currentDraft.par}
                  onChange={(v) => patchDraft({ par: v })}
                  placeholder="72"
                />
              </Field>
              <Field label="Course Rating" flagged={isUncertain('courseRating')}>
                <NumberBox
                  value={currentDraft.courseRating}
                  onChange={(v) => patchDraft({ courseRating: v })}
                  step={0.1}
                  placeholder="—"
                />
              </Field>
              <Field label="Slope" flagged={isUncertain('slopeRating')}>
                <NumberBox
                  value={currentDraft.slopeRating}
                  onChange={(v) => patchDraft({ slopeRating: v })}
                  placeholder="—"
                />
              </Field>
            </div>

            <Field label="Source / notes">
              <input
                className="field"
                placeholder="e.g. photographed the card at the pro shop, 31 Aug"
                value={currentDraft.sourceNotes}
                onChange={(e) => patchDraft({ sourceNotes: e.target.value })}
              />
            </Field>
          </div>

          {/* --- Holes ---------------------------------------------------- */}
          <div className="card overflow-hidden">
            <div className="border-b border-white/8 px-3.5 py-2.5">
              <div className="label">Holes 1–18</div>
              <p className="mt-0.5 text-xs text-chalk-500">
                Amber rows are ones the reader was unsure about. Stroke index is the 1–18 difficulty
                ranking, not the hole number.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="tabular w-full min-w-[24rem] text-center text-xs">
                <thead>
                  <tr className="text-[0.6rem] uppercase tracking-wider text-chalk-500">
                    <th className="py-2">Hole</th>
                    <th className="py-2">Par</th>
                    <th className="py-2">SI</th>
                    <th className="py-2">
                      {currentDraft.distanceUnit === 'metres' ? 'Metres' : 'Yards'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {currentDraft.holes.map((hole) => {
                    const flagged = isUncertain(`hole-${hole.holeNo}`);
                    return (
                      <tr
                        key={hole.holeNo}
                        className={`border-t border-white/6 ${flagged ? 'bg-brass-500/10' : ''}`}
                      >
                        <td className="py-1 font-bold">
                          {hole.holeNo}
                          {flagged && <span className="ml-1 text-brass-400">!</span>}
                        </td>
                        <td className="py-1">
                          <NumberCell
                            value={hole.par}
                            onChange={(v) => patchHole(hole.holeNo, { par: v })}
                          />
                        </td>
                        <td className="py-1">
                          <NumberCell
                            value={hole.strokeIndex}
                            onChange={(v) => patchHole(hole.holeNo, { strokeIndex: v })}
                          />
                        </td>
                        <td className="py-1">
                          <NumberCell
                            wide
                            value={hole.distance}
                            onChange={(v) => patchHole(hole.holeNo, { distance: v })}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-white/12 text-[0.7rem] font-bold">
                    <td className="py-2">Tot</td>
                    <td className="py-2">
                      {currentDraft.holes.reduce((sum, h) => sum + (h.par ?? 0), 0)}
                    </td>
                    <td />
                    <td className="py-2">
                      {currentDraft.holes.reduce((sum, h) => sum + (h.distance ?? 0), 0) || '—'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* --- What is still missing ------------------------------------ */}
          <SectionTitle>5 · What is still needed</SectionTitle>
          {missing.blocking.length === 0 && missing.warnings.length === 0 ? (
            <p className="rounded-xl border border-fairway-400/30 bg-fairway-500/10 px-3 py-2.5 text-sm text-fairway-300">
              Everything needed to calculate course handicaps is here.
            </p>
          ) : (
            <div className="space-y-2">
              {missing.blocking.length > 0 && (
                <div className="card border-pirate-400/40 bg-pirate-500/10 px-3.5 py-3">
                  <p className="text-sm font-bold text-pirate-300">
                    Still needed before this course can be verified
                  </p>
                  <ul className="mt-1.5 space-y-1 text-sm text-chalk-200">
                    {missing.blocking.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {missing.warnings.map((item) => (
                <p key={item} className="rounded-xl bg-white/5 px-3 py-2 text-xs text-chalk-400">
                  {item}
                </p>
              ))}
            </div>
          )}

          {/* --- Save / verify ---------------------------------------------- */}
          <div className="space-y-2 pt-1">
            <button onClick={() => void save()} disabled={busy !== 'idle'} className="btn-ghost w-full">
              {busy === 'saving' ? 'Saving…' : 'Save without verifying'}
            </button>

            {course.dataVerified && !confirmReverify ? (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setConfirmReverify(true)} className="btn-ghost text-xs">
                  Re-verify with these values
                </button>
                <button onClick={() => void unverify()} className="btn-ghost text-xs">
                  Mark unverified
                </button>
              </div>
            ) : course.dataVerified && confirmReverify ? (
              <div className="card border-brass-500/40 bg-brass-500/10 px-3.5 py-3">
                <p className="text-sm text-brass-300">
                  This course is already verified. Overwrite the confirmed data with what is on
                  screen?
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button onClick={() => setConfirmReverify(false)} className="btn-ghost text-xs">
                    Cancel
                  </button>
                  <button
                    onClick={() => void confirmAndVerify()}
                    disabled={!missing.canVerify || busy !== 'idle'}
                    className="btn-primary text-xs"
                  >
                    Yes, overwrite
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => void confirmAndVerify()}
                disabled={!missing.canVerify || busy !== 'idle'}
                className="btn-primary w-full text-base"
              >
                ✓ Confirm &amp; mark course as verified
              </button>
            )}

            {!missing.canVerify && !course.dataVerified && (
              <p className="text-center text-xs text-chalk-500">
                Fill in the items listed above to enable verification.
              </p>
            )}
            <p className="text-center text-xs text-chalk-500">
              Verifying recalculates every player’s course handicap for rounds on this course.
            </p>
          </div>
        </>
      )}
    </AdminShell>
  );
}

function Field({
  label,
  flagged,
  children,
}: {
  label: string;
  flagged?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="label mb-1 flex items-center gap-1.5">
        {label}
        {flagged && (
          <span className="chip bg-brass-500/25 !px-1.5 !py-0.5 !text-[0.55rem] text-brass-300">
            CHECK
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

function NumberBox({
  value,
  onChange,
  step = 1,
  placeholder,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  step?: number;
  placeholder?: string;
}) {
  return (
    <input
      className="field tabular"
      type="number"
      inputMode="decimal"
      step={step}
      placeholder={placeholder}
      value={value === null ? '' : String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw.trim() === '') return onChange(null);
        const parsed = Number(raw);
        onChange(Number.isFinite(parsed) ? parsed : null);
      }}
    />
  );
}

function NumberCell({
  value,
  onChange,
  wide,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  wide?: boolean;
}) {
  return (
    <input
      className={`tabular rounded-md border border-white/10 bg-ink-900 px-1 py-1.5 text-center text-xs focus:border-fairway-400 focus:outline-none ${
        wide ? 'w-16' : 'w-12'
      }`}
      inputMode="numeric"
      placeholder="—"
      value={value === null ? '' : String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw.trim() === '') return onChange(null);
        const parsed = Number(raw);
        onChange(Number.isFinite(parsed) ? Math.round(parsed) : null);
      }}
    />
  );
}
