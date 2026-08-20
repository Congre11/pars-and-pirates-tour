'use client';

import Link from 'next/link';
import { useTour } from '@/lib/data/provider';
import { PageHeader, SectionTitle } from '@/components/ui';
import { points as fmtPoints } from '@/lib/format';
import { FORMAT_LABELS, allowanceFor, type MatchFormat } from '@/lib/types';

/** Plain-English rules for each format, plus the handicap allowance in force. */
const RULES: Record<MatchFormat, { how: string; strokes: string }> = {
  team_scramble: {
    how: 'All four players tee off. Pick the best shot, everyone plays their next from there, and you keep going until it is holed. One score per team per hole.',
    strokes:
      'The team gets a combined allowance off the four course handicaps. The lower team plays off scratch and the other receives the difference.',
  },
  better_ball: {
    how: 'Two-a-side, everyone plays their own ball. On each hole, the lower net score in each pair is that pair’s score. Lower pair score wins the hole.',
    strokes:
      'Each player gets their own strokes off their course handicap, allocated by stroke index. The lowest player in the match plays off scratch.',
  },
  singles: {
    how: 'Head to head, own ball. Each hole is won, lost or halved on net score.',
    strokes:
      'The higher handicapper receives the difference between the two course handicaps, allocated by stroke index.',
  },
  two_man_scramble: {
    how: 'Both players hit, pick the better shot, both play again from there until holed. One score per pair per hole.',
    strokes:
      'One team handicap for the pair: floor(floor((CH1 + CH2) / 2) × 0.8). Both pairs keep their own and both receive strokes — nobody plays off scratch.',
  },
  shamble: {
    how: 'Both players tee off and the pair takes the better drive. From there each player plays their OWN ball to the hole. The lower net of the two counts for the pair.',
    strokes:
      'One team handicap for the pair, exactly as in the Scramble: floor(floor((CH1 + CH2) / 2) × 0.8). Two balls are recorded, but both net against that same figure.',
  },
  foursomes: {
    how: 'One ball per pair, alternating shots. One player tees off the odd holes, the other the even holes, and you alternate all the way to the hole.',
    strokes: 'Half of the combined course handicaps, taken as a difference between pairs.',
  },
};

/**
 * Formats screen: how each game works, what it is worth, and exactly what
 * handicap allowance the app is applying — so nobody has to take the scoring
 * on trust.
 */
export default function FormatsPage() {
  const { snapshot, matchesForRound, standingsForRound } = useTour();
  const settings = snapshot.tour.settings;

  const rounds = [...snapshot.rounds].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-4 pb-6">
      <PageHeader
        title="Formats &amp; Rules"
        subtitle={`${fmtPoints(settings.pointsPerWin)} point for a win · ${fmtPoints(settings.pointsPerHalf)} each for a half`}
      />

      <div className="card px-4 py-3 text-sm text-chalk-300">
        Most cumulative points after Day 4 wins the tour. If the points are level at the end, the
        captains’ agreed tiebreak applies — a playoff or closest-to-pin.
      </div>

      {/* --- Points at stake per day ---------------------------------------- */}
      <SectionTitle>Points at stake</SectionTitle>
      <div className="card divide-y divide-white/6">
        {rounds.map((round) => {
          const matches = matchesForRound(round.id);
          const total = matches.reduce((sum, m) => sum + m.pointsValue, 0);
          const dayStandings = standingsForRound(round.id);
          return (
            <Link
              key={round.id}
              href={`/round/${round.id}`}
              className="tap flex items-center gap-3 px-3.5 py-3"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Day {round.dayNo} · {round.name.replace(/^Day \d+ — /, '')}</span>
                <span className="block truncate text-xs text-chalk-500">{round.formatLabel}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="tabular block text-lg font-bold text-brass-400">
                  {fmtPoints(total)}
                </span>
                <span className="block text-[0.6rem] uppercase tracking-wider text-chalk-500">
                  {matches.length} match{matches.length === 1 ? '' : 'es'}
                </span>
              </span>
              {dayStandings.pointsRemaining === 0 && dayStandings.pointsTotal > 0 && (
                <span className="chip bg-white/10 text-chalk-400">DONE</span>
              )}
            </Link>
          );
        })}
      </div>
      <p className="text-xs leading-snug text-chalk-500">
        Eleven points in all, and six wins the tour. Day 3 is six short matches worth half a point
        each, so it carries three.
      </p>
      <p className="rounded-xl border border-brass-500/30 bg-brass-500/10 px-3 py-2.5 text-xs leading-snug text-brass-300">
        <span className="font-semibold">Day 3 halves are burned.</span> A halved match on Day 3
        awards nothing to either side — win 0.5, lose 0, halve 0 each. The tour is still played for
        eleven points with six to win, so a burned half simply goes unclaimed. Every other day
        splits a halved match as usual.
      </p>

      {/* --- The formats ------------------------------------------------------ */}
      <SectionTitle>How each format works</SectionTitle>
      <div className="space-y-3">
        {(Object.keys(RULES) as MatchFormat[]).map((format) => {
          const allowance = allowanceFor(format, settings);
          const used = snapshot.matches.some((m) => m.format === format);
          return (
            <div key={format} className={`card px-4 py-3.5 ${used ? '' : 'opacity-60'}`}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="display text-base font-bold">{FORMAT_LABELS[format]}</h3>
                <span className="chip bg-white/8 text-chalk-400">
                  {allowance.then
                    ? // A two-stage rule: showing only the weights would claim
                      // 50 / 50 for a figure that is really 80% of the average.
                      `avg × ${Math.round(allowance.then.factor * 100)}%`
                    : allowance.weights.length === 1
                      ? `${Math.round(allowance.weights[0] * 100)}%`
                      : allowance.weights.map((w) => `${Math.round(w * 100)}%`).join(' / ')}
                </span>
              </div>
              <p className="mt-1.5 text-sm leading-snug text-chalk-200">{RULES[format].how}</p>
              <p className="mt-2 text-xs leading-snug text-chalk-500">{RULES[format].strokes}</p>
            </div>
          );
        })}
      </div>

      {/* --- Handicap settings in force -------------------------------------- */}
      <SectionTitle>Handicap settings</SectionTitle>
      <div className="card divide-y divide-white/6 text-sm">
        <Row label="Handicaps">
          {settings.handicapsEnabled ? 'On — net scoring' : 'Off — everything off scratch'}
        </Row>
        <Row label="Match play style">
          {settings.handicapMode === 'difference'
            ? 'Better Ball and Singles: the lowest player in the match plays off scratch. Scramble and Shamble: each pair plays off its own team handicap in full.'
            : 'Full allowance for every side'}
        </Row>
        <Row label="Course handicap">Index × (Slope ÷ 113) + (Course Rating − Par)</Row>
        <Row label="Completed holes">
          {settings.lockCompletedHoles
            ? 'Locked once the match moves on (captains can still correct)'
            : 'Always editable'}
        </Row>
      </div>

      <Link href="/admin/rules" className="btn-ghost w-full">
        Change the rules (captains)
      </Link>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3.5 py-2.5">
      <span className="shrink-0 text-chalk-500">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}
