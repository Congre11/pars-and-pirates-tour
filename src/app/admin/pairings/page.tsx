'use client';

import { useState } from 'react';
import { useTour } from '@/lib/data/provider';
import { AdminShell } from '@/components/admin/AdminShell';
import { Accordion, NumberField, SelectField, TextField } from '@/components/admin/fields';
import { SectionTitle } from '@/components/ui';
import {
  FIXED_ALLOWANCE_HELP,
  FORMAT_LABELS,
  PLAYERS_PER_SIDE,
  allowanceFor,
  allowanceForMatch,
  isFixedAllowance,
  isTeamBallFormat,
  type HandicapAllowance,
  type Match,
  type MatchFormat,
  type Round,
} from '@/lib/types';
import { describeRoundFormat, planRound, suggestNewMatch } from '@/lib/rounds/format-plan';

/**
 * Formats and pairings.
 *
 * The captains' screen, and the one that makes the tour re-configurable: every
 * round is just a list of matches, each covering a hole range in a chosen
 * format for a chosen number of points off a chosen allowance. Add, remove and
 * rearrange them freely — Day 3's three-format shape is only the seeded
 * default, not a rule. The live scorecard reads the same rows, so a change
 * here is on every phone within seconds and needs no code change.
 */
export default function AdminPairingsPage() {
  const { snapshot } = useTour();

  return (
    <AdminShell title="Formats & pairings" subtitle="Who plays whom, over which holes, for what">
      <p className="card px-3.5 py-3 text-sm leading-snug text-chalk-300">
        A round is made of matches. Each match covers a range of holes in one format — so a day can
        change format as you walk, or stay the same for all 18. Change anything here and the live
        scorecard follows immediately.
      </p>

      {[...snapshot.rounds]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((round) => (
          <RoundEditor key={round.id} round={round} />
        ))}
    </AdminShell>
  );
}

// ---------------------------------------------------------------------------
// One round
// ---------------------------------------------------------------------------

function RoundEditor({ round }: { round: Round }) {
  const { snapshot, update, insert, matchesForRound, sidesForMatch, holesForCourse } = useTour();
  const [busy, setBusy] = useState(false);

  const matches = matchesForRound(round.id);
  const holeCount = holesForCourse(round.courseId).length || 18;
  const settings = snapshot.tour.settings;
  const plan = planRound(matches, sidesForMatch, { holeCount, settings });
  const derivedLabel = describeRoundFormat(matches);

  /** Add a match, with two empty sides, filling whatever holes are still free. */
  const addMatch = async () => {
    setBusy(true);
    try {
      const suggestion = suggestNewMatch(matches, { holeCount, settings });
      const teams = [...snapshot.teams].sort((a, b) => a.sortOrder - b.sortOrder);
      const matchId = await insert('matches', {
        roundId: round.id,
        name: `Match ${matches.length + 1}`,
        format: suggestion.format,
        startHole: suggestion.startHole,
        endHole: suggestion.endHole,
        pointsValue: suggestion.pointsValue,
        allowanceOverride: null,
        status: 'upcoming',
        sortOrder: matches.length,
      });
      // A match is unscoreable without two sides, so they are created with it.
      for (const [index, team] of teams.slice(0, 2).entries()) {
        await insert('sides', {
          matchId,
          teamId: team.id,
          playerIds: [],
          handicapOverride: null,
          sortOrder: index,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {/* Round names already read "Day 3 — Triple Threat", so no prefix here. */}
      <SectionTitle>{round.name}</SectionTitle>

      {/* --- What this round currently is ---------------------------------- */}
      <div className="card mb-2 px-3.5 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="label">Format plan</span>
          <span className="tabular text-xs text-chalk-500">
            {plan.pointsTotal} {plan.pointsTotal === 1 ? 'point' : 'points'} ·{' '}
            {matches.length} {matches.length === 1 ? 'match' : 'matches'}
          </span>
        </div>

        <CoverageBar plan={plan} holeCount={holeCount} />

        <p className="mt-2 text-xs leading-snug text-chalk-400">{derivedLabel}</p>

        {round.formatLabel !== derivedLabel && matches.length > 0 && (
          <button
            onClick={() => update('rounds', round.id, { formatLabel: derivedLabel })}
            className="btn-ghost mt-2 w-full !py-2 text-xs"
          >
            Round is still labelled “{round.formatLabel}” — use the formats above instead
          </button>
        )}

        {plan.issues.length > 0 && (
          <ul className="mt-2.5 space-y-1.5 border-t border-white/6 pt-2.5">
            {plan.issues.map((issue, index) => (
              <li
                key={index}
                className={`flex gap-2 text-xs leading-snug ${
                  issue.level === 'error' ? 'text-pirate-300' : 'text-brass-300'
                }`}
              >
                <span aria-hidden>{issue.level === 'error' ? '✕' : '!'}</span>
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        {plan.segments.map((segment) => (
          <MatchEditor key={segment.match.id} match={segment.match} holeCount={holeCount} />
        ))}
      </div>

      <button onClick={addMatch} disabled={busy} className="btn-ghost mt-2 w-full disabled:opacity-50">
        {busy ? 'Adding…' : '+ Add a match to Day ' + round.dayNo}
      </button>
    </div>
  );
}

/** Hole 1..N, coloured by which match covers it. Shows gaps and overlaps. */
function CoverageBar({
  plan,
  holeCount,
}: {
  plan: ReturnType<typeof planRound>;
  holeCount: number;
}) {
  const palette = ['#2f7d5a', '#b8863b', '#4a6fa5', '#8c5a9e', '#a8564a', '#3f8f8a'];
  // A hole may be covered by several matches (four parallel singles); colour it
  // by the first segment that reaches it, which is what the scorecard walks.
  const holes = Array.from({ length: holeCount }, (_, i) => i + 1);

  return (
    <div className="mt-2 flex gap-[2px]" aria-hidden>
      {holes.map((holeNo) => {
        const index = plan.segments.findIndex(
          (s) => holeNo >= s.match.startHole && holeNo <= s.match.endHole,
        );
        return (
          <span
            key={holeNo}
            className="h-2.5 flex-1 rounded-[2px]"
            style={{ backgroundColor: index === -1 ? 'rgba(255,255,255,0.08)' : palette[index % palette.length] }}
            title={`Hole ${holeNo}`}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One match
// ---------------------------------------------------------------------------

const FORMAT_OPTIONS = (Object.keys(FORMAT_LABELS) as MatchFormat[]).map((format) => ({
  value: format,
  label: FORMAT_LABELS[format],
}));

function MatchEditor({ match, holeCount }: { match: Match; holeCount: number }) {
  const { snapshot, update, remove, sidesForMatch, playerById, teamById, outcomeFor } = useTour();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const sides = sidesForMatch(match.id);
  const outcome = outcomeFor(match.id);
  const started = (outcome?.holesPlayed ?? 0) > 0;
  const scoreCount = snapshot.scores.filter((s) => s.matchId === match.id).length;

  return (
    <Accordion
      title={match.name}
      subtitle={
        <>
          H{match.startHole}–{match.endHole} · {FORMAT_LABELS[match.format]} ·{' '}
          {match.pointsValue} {match.pointsValue === 1 ? 'pt' : 'pts'}
        </>
      }
      badge={started ? <span className="chip bg-fairway-500/25 text-fairway-300">IN PLAY</span> : undefined}
    >
      <TextField
        label="Match name"
        value={match.name}
        onSave={(value) => update('matches', match.id, { name: value })}
      />

      <SelectField
        label="Format"
        value={match.format}
        options={FORMAT_OPTIONS}
        hint={`${PLAYERS_PER_SIDE[match.format]} player(s) per side. ${
          isTeamBallFormat(match.format)
            ? 'One score per side per hole.'
            : 'Every player records their own score.'
        }`}
        onSave={(value) => update('matches', match.id, { format: value })}
      />

      <div className="grid grid-cols-3 gap-2">
        <NumberField
          label="First hole"
          value={match.startHole}
          min={1}
          max={holeCount}
          onSave={(value) => update('matches', match.id, { startHole: value ?? 1 })}
        />
        <NumberField
          label="Last hole"
          value={match.endHole}
          min={1}
          max={holeCount}
          onSave={(value) => update('matches', match.id, { endHole: value ?? holeCount })}
        />
        <NumberField
          label="Points"
          value={match.pointsValue}
          step={0.25}
          min={0}
          onSave={(value) => update('matches', match.id, { pointsValue: value ?? 1 })}
        />
      </div>

      <AllowanceEditor match={match} />

      {sides.map((side) => {
        const team = teamById(side.teamId);
        const teamPlayers = snapshot.players.filter((p) => p.teamId === side.teamId);
        const wanted = PLAYERS_PER_SIDE[match.format];

        return (
          <div key={side.id}>
            <div className="label mb-1.5 flex items-center justify-between">
              <span style={{ color: team?.accent }}>{team?.name}</span>
              <span className={side.playerIds.length === wanted ? '' : 'text-brass-400'}>
                {side.playerIds.length}/{wanted}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {teamPlayers.map((player) => {
                const picked = side.playerIds.includes(player.id);
                return (
                  <button
                    key={player.id}
                    onClick={() => {
                      const next = picked
                        ? side.playerIds.filter((id) => id !== player.id)
                        : [...side.playerIds, player.id];
                      void update('sides', side.id, { playerIds: next });
                    }}
                    className={`tap rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition-colors ${
                      picked ? 'text-white' : 'bg-white/6 text-chalk-300'
                    }`}
                    style={picked ? { backgroundColor: team?.colour } : undefined}
                  >
                    {player.name}
                  </button>
                );
              })}
            </div>
            <div className="mt-2">
              <NumberField
                label="Playing handicap override"
                value={side.handicapOverride}
                allowEmpty
                hint="Leave blank to let the app work it out from the players' indexes and the allowance above."
                onSave={(value) => update('sides', side.id, { handicapOverride: value })}
              />
            </div>
          </div>
        );
      })}

      {/* --- Remove ---------------------------------------------------------- */}
      <div className="border-t border-white/6 pt-3">
        {confirmDelete ? (
          <div className="space-y-2">
            <p className="text-xs leading-snug text-pirate-300">
              Delete {match.name}?
              {scoreCount > 0
                ? ` This also deletes ${scoreCount} score${scoreCount === 1 ? '' : 's'} already entered against it, and cannot be undone.`
                : ' This cannot be undone.'}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setConfirmDelete(false)} className="btn-ghost !py-2 text-xs">
                Keep it
              </button>
              <button
                onClick={() => {
                  setConfirmDelete(false);
                  void remove('matches', match.id);
                }}
                className="btn-danger !py-2 text-xs"
              >
                Delete the match
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="tap w-full py-1 text-xs font-semibold text-pirate-300"
          >
            Remove this match
          </button>
        )}
      </div>
    </Accordion>
  );
}

// ---------------------------------------------------------------------------
// Per-match handicap allowance
// ---------------------------------------------------------------------------

function weightLabel(index: number, count: number): string {
  if (count === 1) return 'Percent';
  if (index === 0) return 'Lowest %';
  if (index === count - 1) return 'Highest %';
  return `#${index + 1} %`;
}

/**
 * A match's handicap allowance.
 *
 * Off by default: the match uses the tour's allowance for its format, so
 * changing "2-man scramble" in Admin -> Rules changes every scramble at once.
 * Switch it on to give this hole range its own, without disturbing the others.
 */
function AllowanceEditor({ match }: { match: Match }) {
  const { snapshot, update } = useTour();
  const settings = snapshot.tour.settings;
  const effective = allowanceForMatch(match, settings);
  const isOwn = match.allowanceOverride !== null;
  const formatDefault = allowanceFor(match.format, settings);

  const save = (allowance: HandicapAllowance | null) =>
    update('matches', match.id, { allowanceOverride: allowance });

  const percentages = effective.weights.map((w) => `${Math.round(w * 100)}%`).join(' / ');

  // Four formats are fixed tournament rules rather than settings. An override
  // on one of those would be stored and then ignored, which is worse than not
  // offering it — the screen would promise a change the engine never makes.
  if (isFixedAllowance(match.format)) {
    return (
      <div className="rounded-xl bg-white/4 px-3 py-3">
        <span className="block text-sm font-semibold">Handicap allowance</span>
        <span className="mt-0.5 block text-xs leading-snug text-chalk-500">
          {FIXED_ALLOWANCE_HELP[match.format]} Fixed by the tournament rules, so it is not editable
          here or in Rules.
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white/4 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Handicap allowance</span>
          <span className="mt-0.5 block text-xs leading-snug text-chalk-500">
            {isOwn
              ? `This match only: ${percentages}.`
              : `Using the tour default for ${FORMAT_LABELS[match.format]}: ${percentages}.`}
          </span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={isOwn}
          aria-label="Give this match its own handicap allowance"
          onClick={() =>
            save(
              isOwn
                ? null
                : // Start from the format default so switching it on changes nothing
                  // until a number is actually edited.
                  { weights: [...formatDefault.weights], rounding: formatDefault.rounding },
            )
          }
          className={`tap relative h-7 w-12 shrink-0 rounded-full transition-colors ${
            isOwn ? 'bg-fairway-500' : 'bg-white/15'
          }`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${
              isOwn ? 'left-6' : 'left-1'
            }`}
          />
        </button>
      </div>

      {isOwn && match.allowanceOverride && (
        <div className="mt-3 space-y-2">
          <div
            className={`grid gap-2 ${
              match.allowanceOverride.weights.length > 2 ? 'grid-cols-4' : 'grid-cols-2'
            }`}
          >
            {match.allowanceOverride.weights.map((weight, index) => (
              <NumberField
                key={index}
                label={weightLabel(index, match.allowanceOverride!.weights.length)}
                value={Math.round(weight * 100)}
                min={0}
                max={200}
                onSave={(value) => {
                  const weights = [...match.allowanceOverride!.weights];
                  weights[index] = (value ?? 0) / 100;
                  return save({ ...match.allowanceOverride!, weights });
                }}
              />
            ))}
          </div>
          <SelectField
            label="Rounding"
            value={match.allowanceOverride.rounding}
            options={[
              { value: 'nearest', label: 'Nearest whole shot (standard)' },
              { value: 'floor', label: 'Round down' },
              { value: 'ceil', label: 'Round up' },
            ]}
            onSave={(value) => save({ ...match.allowanceOverride!, rounding: value })}
          />
          <p className="text-xs leading-snug text-chalk-500">
            Applied to the course handicaps of one side, lowest first.
            {match.allowanceOverride.weights.length === 1
              ? ' A single percentage applies to each player individually.'
              : ''}
          </p>
        </div>
      )}
    </div>
  );
}
