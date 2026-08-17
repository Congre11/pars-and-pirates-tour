'use client';

import { useEffect, useState } from 'react';
import { PageHeader, SectionTitle } from '@/components/ui';
import { useTour } from '@/lib/data/provider';

interface Check {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
  optional?: boolean;
}

/**
 * A plain-English "is this thing actually set up?" screen.
 *
 * Written for a non-technical organiser: every line says what it means and
 * what to do about it, with no logs, no stack traces and no jargon.
 */
export default function SetupPage() {
  const { snapshot, mode } = useTour();
  const [checks, setChecks] = useState<Check[] | null>(null);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((data) => setChecks(data.checks as Check[]))
      .catch(() => setChecks([]));
  }, []);

  const missingHandicaps = snapshot.players.filter((p) => p.handicapIndex === null).length;
  const unverifiedCourses = snapshot.courses.filter((c) => !c.dataVerified).length;
  const missingHna = snapshot.players.filter((p) => !p.hnaId).length;

  const dataChecks: Check[] = [
    {
      key: 'handicaps',
      label: 'Handicap indexes',
      ok: missingHandicaps === 0,
      detail:
        missingHandicaps === 0
          ? `All ${snapshot.players.length} players have a handicap index. These are indexes, not course handicaps — the app converts them per course and tee.`
          : `${missingHandicaps} of ${snapshot.players.length} players still need one. Until then they are scored off scratch. Tour settings → Players.`,
    },
    {
      key: 'courses',
      label: 'Course scorecards verified',
      ok: unverifiedCourses === 0,
      detail:
        unverifiedCourses === 0
          ? 'All four courses have been checked against the real scorecard.'
          : `${unverifiedCourses} course(s) still use placeholder par / stroke index / rating data. Photograph the real card the evening before: Tour settings → Courses → Verify with a scorecard photo.`,
    },
    {
      key: 'tees',
      label: 'Tees chosen',
      ok: snapshot.rounds.every((r) => Boolean(r.teeId)),
      detail: 'Each round has a tee selected. Change them in Tour settings → Rounds.',
    },
    {
      key: 'points',
      label: 'Tournament points',
      ok: true,
      detail: 'Day 1 = 2, Day 2 = 2, Day 3 = 3, Day 4 = 4. 11 points in total; 6 wins the tour. Every match value is editable in Tour settings → Formats & pairings.',
    },
    {
      key: 'pairings',
      label: 'Pairings',
      ok: snapshot.matches.length > 0,
      detail:
        snapshot.matches.length > 0
          ? `${snapshot.matches.length} matches are set up across the four days. Anyone can change them in Tour settings → Formats & pairings.`
          : 'No matches yet.',
    },
    {
      key: 'hna_ids',
      label: 'HNA member numbers',
      ok: missingHna === 0,
      optional: true,
      detail:
        missingHna === 0
          ? 'All players have an HNA number stored.'
          : `${missingHna} players have no HNA number. Only needed if you connect HNA; handicaps work fine entered by hand.`,
    },
  ];

  return (
    <div className="space-y-4 pb-6">
      <PageHeader title="Setup checklist" back="/more" subtitle="What is connected and what is not" />

      {mode === 'demo' && (
        <div className="card border-brass-500/40 bg-brass-500/10 px-4 py-3.5 text-sm text-brass-300">
          <p className="font-bold">You are in demo mode.</p>
          <p className="mt-1.5 leading-snug">
            Everything works — you can score a full match, see the leaderboard update and walk
            through every screen. But the scores live only in this browser. Two phones will not see
            each other’s scores until Supabase is connected below.
          </p>
        </div>
      )}

      <SectionTitle>Connections</SectionTitle>
      {checks === null ? (
        <div className="h-32 animate-pulse rounded-2xl bg-white/5" />
      ) : (
        <div className="card divide-y divide-white/6">
          {checks.map((check) => (
            <CheckRow key={check.key} check={check} />
          ))}
        </div>
      )}

      <SectionTitle>Tour data</SectionTitle>
      <div className="card divide-y divide-white/6">
        {dataChecks.map((check) => (
          <CheckRow key={check.key} check={check} />
        ))}
      </div>

      <SectionTitle>How to switch on live scoring</SectionTitle>
      <ol className="card space-y-3 px-4 py-4 text-sm leading-snug text-chalk-200">
        <Step n={1}>
          Create a free project at <span className="text-fairway-300">supabase.com</span>.
        </Step>
        <Step n={2}>
          In the Supabase SQL editor, paste and run{' '}
          <code className="rounded bg-black/40 px-1">supabase/migrations/0001_init.sql</code>, then{' '}
          <code className="rounded bg-black/40 px-1">supabase/seed.sql</code>.
        </Step>
        <Step n={3}>
          Copy the project URL and the two API keys into your hosting provider’s environment
          variables (the names are listed in <code className="rounded bg-black/40 px-1">.env.example</code>).
        </Step>
        <Step n={4}>
          Set <code className="rounded bg-black/40 px-1">TOUR_PIN</code>,{' '}
          <code className="rounded bg-black/40 px-1">ADMIN_PIN</code> and{' '}
          <code className="rounded bg-black/40 px-1">SESSION_SECRET</code>, then redeploy.
        </Step>
        <Step n={5}>
          Come back to this page. Every line above should be green.
        </Step>
      </ol>

      <p className="text-center text-xs text-chalk-500">
        Full instructions are in <code className="rounded bg-black/40 px-1">SETUP.md</code> in the
        repository.
      </p>
    </div>
  );
}

function CheckRow({ check }: { check: Check }) {
  return (
    <div className="flex items-start gap-3 px-3.5 py-3">
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          check.ok
            ? 'bg-fairway-500 text-white'
            : check.optional
              ? 'bg-white/12 text-chalk-400'
              : 'bg-brass-500/30 text-brass-300'
        }`}
      >
        {check.ok ? '✓' : check.optional ? '–' : '!'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">
          {check.label}
          {check.optional && !check.ok && (
            <span className="ml-1.5 text-[0.65rem] font-normal text-chalk-500">optional</span>
          )}
        </span>
        <span className="mt-0.5 block text-xs leading-snug text-chalk-400">{check.detail}</span>
      </span>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fairway-500/25 text-xs font-bold text-fairway-300">
        {n}
      </span>
      <span className="flex-1">{children}</span>
    </li>
  );
}
