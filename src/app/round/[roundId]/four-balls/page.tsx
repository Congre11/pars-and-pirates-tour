'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useTour } from '@/lib/data/provider';
import { useSession } from '@/lib/auth/session-provider';
import { Avatar, EmptyState, PageHeader, SectionTitle } from '@/components/ui';
import {
  checkFourBalls,
  groupsForEditing,
  isDirty,
  movePlayer,
  swapPlayers,
  type DraftGroup,
} from '@/lib/rounds/four-balls';
import { describeRoundFormat } from '@/lib/rounds/format-plan';
import { describeConfirmation, groupsConfirmation } from '@/lib/rounds/confirmation';
import { sectionsForRound } from '@/lib/rounds/matchups';
import { derivePairingsFromDraft, describeBlock } from '@/lib/rounds/derived-pairings';
import { courseHandicap, sidePlayingHandicap } from '@/lib/scoring/handicap';
import { courseHandicapLabel } from '@/lib/format';
import { FIXED_ALLOWANCES, FORMAT_LABELS, allowanceForMatch } from '@/lib/types';

/**
 * Edit the day's 4-balls.
 *
 * Open to everyone, like the rest of the app. Rearranging who walks with whom
 * is a decision made on the first tee, not an organiser's job, so this screen
 * sits on the round itself rather than under Tour settings.
 *
 * What this screen does NOT change is who plays whom. That has its own editor
 * (`../matchups`), also open to everyone; this one only moves bodies between
 * buggies. The panel at the bottom spells the difference out, because the two
 * coincide on a better-ball day and diverge on every other.
 */
export default function FourBallsPage({ params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = use(params);
  const {
    snapshot,
    roundById,
    courseById,
    groupsForRound,
    saveGroups,
    matchesForRound,
    sidesForMatch,
    holesForCourse,
    teeById,
    playerById,
    teamById,
  } = useTour();
  const { session } = useSession();

  const round = roundById(roundId);
  const saved = groupsForRound(roundId);
  const matches = matchesForRound(roundId);
  const teams = [...snapshot.teams].sort((a, b) => a.sortOrder - b.sortOrder);

  // Everyone in this round's matches, falling back to the whole tour so a
  // round whose pairings are not set yet can still be grouped.
  const rosterIds = new Set(
    matches.flatMap((m) => sidesForMatch(m.id).flatMap((s) => s.playerIds)),
  );
  const roster =
    rosterIds.size > 0 ? snapshot.players.filter((p) => rosterIds.has(p.id)) : snapshot.players;

  const [draft, setDraft] = useState<DraftGroup[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'submitting' | 'saved' | 'error'>(
    'idle',
  );
  const [confirming, setConfirming] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  // The saved groups are the source of truth until this device edits them, so
  // another player's change arriving over realtime is picked up rather than
  // silently overwritten.
  const groups = draft ?? groupsForEditing(saved, roster, teams);
  const check = checkFourBalls(groups, roster, teams);
  const dirty = draft !== null && isDirty(groups, saved);

  if (!round) {
    return (
      <EmptyState
        title="Round not found"
        cta={
          <Link href="/itinerary" className="btn-ghost mt-2">
            Back to the schedule
          </Link>
        }
      />
    );
  }

  const course = courseById(round.courseId);

  /** Tap one player, then another: they swap. Tapping a group moves them in. */
  const tapPlayer = (playerId: string) => {
    setConfirming(false);
    if (selected === null) {
      setSelected(playerId);
      return;
    }
    if (selected === playerId) {
      setSelected(null);
      return;
    }
    setDraft(swapPlayers(groups, selected, playerId));
    setSelected(null);
  };

  const tapGroup = (groupIndex: number) => {
    if (selected === null) return;
    setConfirming(false);
    if (groups[groupIndex].playerIds.includes(selected)) {
      setSelected(null);
      return;
    }
    setDraft(movePlayer(groups, selected, groupIndex));
    setSelected(null);
  };

  const save = async (confirm = false) => {
    setSaveState(confirm ? 'submitting' : 'saving');
    setErrorText(null);
    try {
      await saveGroups({
        roundId: round.id,
        groups: groups.map((group, index) => ({
          id: group.id,
          name: group.name,
          playerIds: group.playerIds,
          sortOrder: index,
        })),
        updatedBy: session?.playerName || 'A player',
        confirm,
        ...(derived
          ? {
              pairings: {
                sides: derived.sides.map((s) => ({ id: s.sideId, playerIds: s.playerIds })),
                matchIds: derived.matchIds,
              },
            }
          : {}),
      });
      setSaveState('saved');
      setConfirming(false);
      setDraft(null); // fall back to the saved rows, now updated
      setTimeout(() => setSaveState('idle'), 1800);
    } catch (err) {
      setSaveState('error');
      setErrorText(err instanceof Error ? err.message : 'Could not save the 4-balls');
    }
  };

  const lastEdited = [...saved].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

  // --- Pairings that follow the 4-balls -------------------------------------
  // On a round with more than one hole-range section (Day 3), the 4-balls ARE
  // the pairings: the two Pars in a 4-ball are one side and the two Pirates
  // the other, in every section. Derived from the DRAFT so the teams and their
  // handicaps update as people are moved, before anything is saved.
  const tee = teeById(round.teeId);
  const holeCount = holesForCourse(round.courseId).length || 18;
  const sections = sectionsForRound(matches, holeCount);
  const derivation = derivePairingsFromDraft(
    sections,
    groups.map((g, i) => ({ ...g, sortOrder: i })),
    round.id,
    snapshot.players,
    teams,
    sidesForMatch,
  );
  const derived = derivation.pairings;

  /** floor(floor((CH1 + CH2) / 2) × 0.8) for a pair, off this round's tee. */
  const teamHandicap = (playerIds: string[]): number | null => {
    if (!tee) return null;
    const chs = playerIds.map((id) => {
      const index = playerById(id)?.handicapIndex;
      return index == null ? 0 : courseHandicap(index, tee);
    });
    return sidePlayingHandicap(chs, FIXED_ALLOWANCES.two_man_scramble!);
  };

  // One person submitting is enough — this confirms the 4-balls for the day,
  // it is not an approval chain. Any later plain save clears the stamp, so an
  // edit after a submission shows as a draft again.
  const confirmation = groupsConfirmation(saved);
  const busy = saveState === 'saving' || saveState === 'submitting';

  return (
    <div className="space-y-4 pb-6">
      <PageHeader
        title="4-balls"
        back={`/round/${round.id}`}
        subtitle={
          <>
            Day {round.dayNo}
            {course ? ` · ${course.name}` : ''}
            {round.teeTime ? ` · ${round.teeTime}` : ''}
          </>
        }
      />

      <p className="card px-3.5 py-3 text-sm leading-snug text-chalk-300">
        Who walks round together. Tap a player, then tap another to swap them. Anyone on the tour
        can change this, and everyone sees it within seconds.
      </p>

      {/* --- The groups ----------------------------------------------------- */}
      <div className="space-y-2">
        {groups.map((group, index) => {
          const counts = teams.map((team) => ({
            team,
            n: group.playerIds.filter((id) => playerById(id)?.teamId === team.id).length,
          }));
          const balanced = counts.every((c) => c.n === 2);

          return (
            <div key={group.id ?? index} className="card overflow-hidden">
              <button
                onClick={() => tapGroup(index)}
                disabled={selected === null}
                className="tap flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left disabled:cursor-default"
              >
                <span className="font-semibold">{group.name}</span>
                <span className="flex items-center gap-2 text-xs">
                  {counts.map(({ team, n }) => (
                    <span key={team.id} style={{ color: team.accent }}>
                      {n} {team.shortName}
                    </span>
                  ))}
                  {!balanced && <span className="text-brass-400">!</span>}
                </span>
              </button>

              <div className="grid grid-cols-2 gap-1.5 border-t border-white/6 p-2">
                {group.playerIds.map((id) => {
                  const player = playerById(id);
                  const team = player ? teamById(player.teamId) : undefined;
                  const isSelected = selected === id;
                  return (
                    <button
                      key={id}
                      onClick={() => tapPlayer(id)}
                      aria-pressed={isSelected}
                      className={`tap flex items-center gap-2 rounded-lg px-2 py-2 text-left transition-all ${
                        isSelected
                          ? 'ring-2 ring-brass-400'
                          : selected
                            ? 'opacity-60'
                            : ''
                      }`}
                      style={{ backgroundColor: `${team?.colour ?? '#333'}33` }}
                    >
                      {player && (
                        <Avatar
                          name={player.name}
                          initials={player.initials}
                          colour={team?.colour ?? '#333'}
                          photoUrl={player.photoUrl}
                          size={26}
                        />
                      )}
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                        {player?.name ?? 'Unknown'}
                      </span>
                    </button>
                  );
                })}
                {group.playerIds.length === 0 && (
                  <p className="col-span-2 px-1 py-2 text-center text-xs text-chalk-500">
                    Empty — tap a player, then tap this 4-ball.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selected && (
        <p className="rounded-xl border border-brass-500/35 bg-brass-500/10 px-3 py-2 text-center text-xs text-brass-300">
          {playerById(selected)?.name} selected — tap another player to swap, or a 4-ball to move
          them.
        </p>
      )}

      {/* --- What these 4-balls mean for the matches ------------------------ */}
      {sections.length > 1 && (
        <div className="card px-3.5 py-3">
          <div className="label mb-1">Pairings for all {holeCount} holes</div>
          {derived ? (
            <>
              <p className="mb-2.5 text-xs leading-snug text-chalk-400">
                These 4-balls set who plays whom for the whole round. The same two-man teams play{' '}
                {sections.map((sec) => `${FORMAT_LABELS[sec.format]} on ${sec.label.toLowerCase()}`).join(', ')}
                . Move a player and every section follows.
              </p>
              <ul className="space-y-2.5">
                {derived.pairs.map((pair) => (
                  <li key={pair.groupId ?? pair.groupName} className="rounded-xl bg-white/4 px-3 py-2.5">
                    <div className="label mb-1.5">{pair.groupName}</div>
                    {pair.teams.map((side, i) => {
                      const team = teamById(side.teamId);
                      const th = teamHandicap(side.playerIds);
                      return (
                        <div key={side.teamId}>
                          {i > 0 && (
                            <div className="my-1 text-center text-[0.6rem] font-bold text-chalk-600">
                              vs
                            </div>
                          )}
                          <div className="flex items-baseline justify-between gap-2 text-xs">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: team?.colour }}
                              />
                              <span className="truncate">
                                {side.playerIds
                                  .map((id) => playerById(id)?.name.split(' ')[0] ?? '?')
                                  .join(' & ')}
                              </span>
                            </span>
                            <span className="tabular shrink-0 font-bold text-brass-400">
                              Team {th === null ? '—' : courseHandicapLabel(th)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 border-t border-white/6 pt-2 text-xs leading-snug text-chalk-500">
                Team handicap is{' '}
                <span className="text-chalk-300">floor(floor((CH1 + CH2) / 2) × 0.8)</span>, used for
                the Scramble and the Shamble. Both pairs keep their own — nobody plays off zero, so
                both receive strokes. The Better Ball section uses the four individual course
                handicaps instead, with the lowest of them off zero.
              </p>
            </>
          ) : (
            <p className="text-xs leading-snug text-brass-300">
              {derivation.blockedBy ? describeBlock(derivation.blockedBy) : ''}
            </p>
          )}
        </div>
      )}

      {/* --- Anyone not in a group ------------------------------------------ */}
      {check.unassigned.length > 0 && (
        <div className="card px-3.5 py-3">
          <div className="label mb-2">Not in a 4-ball</div>
          <div className="grid grid-cols-2 gap-1.5">
            {check.unassigned.map((player) => {
              const team = teamById(player.teamId);
              return (
                <button
                  key={player.id}
                  onClick={() => tapPlayer(player.id)}
                  aria-pressed={selected === player.id}
                  className={`tap rounded-lg px-2 py-2 text-left text-xs font-semibold ${
                    selected === player.id ? 'ring-2 ring-brass-400' : ''
                  }`}
                  style={{ backgroundColor: `${team?.colour ?? '#333'}33` }}
                >
                  {player.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* --- What is wrong with it ------------------------------------------ */}
      {check.issues.length > 0 && (
        <ul className="card space-y-1.5 px-3.5 py-3">
          {check.issues.map((issue, index) => (
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

      {/* --- Save ------------------------------------------------------------ */}
      <div className="space-y-2">
        {confirming ? (
          <>
            <p className="text-center text-xs leading-snug text-brass-300">
              These 4-balls are not the usual shape. Save them anyway?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setConfirming(false)} className="btn-ghost">
                Go back
              </button>
              <button onClick={() => save(false)} className="btn-primary">
                Save anyway
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => (check.ok ? save(false) : setConfirming(true))}
                disabled={!dirty || busy}
                className="btn-ghost disabled:opacity-40"
              >
                {saveState === 'saving' ? 'Saving…' : dirty ? 'Save' : 'No changes'}
              </button>
              <button
                onClick={() => save(true)}
                disabled={!check.ok || busy || (confirmation.state === 'confirmed' && !dirty)}
                className="btn-primary disabled:opacity-40"
              >
                {saveState === 'submitting'
                  ? 'Submitting…'
                  : saveState === 'saved'
                    ? 'Saved ✓'
                    : confirmation.state === 'confirmed' && !dirty
                      ? 'Submitted ✓'
                      : derived
                        ? `Submit the pairings for all ${holeCount} holes`
                        : 'Submit the 4-balls'}
              </button>
            </div>
            <p className="text-center text-xs leading-snug text-chalk-500">
              {dirty && confirmation.state === 'confirmed'
                ? 'Edited since it was submitted — submit again to confirm.'
                : describeConfirmation(confirmation, 'these 4-balls')}
              {confirmation.state !== 'confirmed' && ' · one person submitting is enough.'}
            </p>
          </>
        )}

        {dirty && (
          <button
            onClick={() => {
              setDraft(null);
              setSelected(null);
              setConfirming(false);
            }}
            className="tap w-full py-1 text-center text-xs text-chalk-500"
          >
            Undo my changes
          </button>
        )}

        {errorText && (
          <p className="text-center text-xs text-pirate-300">{errorText}</p>
        )}
        {lastEdited && !dirty && (
          <p className="text-center text-xs text-chalk-500">
            Last changed by {lastEdited.updatedBy}
          </p>
        )}
      </div>

      {/* --- 4-balls are not matches ---------------------------------------- */}
      <SectionTitle>Who you are playing against</SectionTitle>
      <div className="card px-3.5 py-3">
        <p className="text-xs leading-snug text-chalk-400">
          {derived ? (
            <>
              Today is <span className="text-chalk-200">{describeRoundFormat(matches)}</span>, played
              by the same pairs the whole way round — so on this round the 4-balls above{' '}
              <span className="text-chalk-200">are</span> the matchups, and there is nothing separate
              to set.
            </>
          ) : (
            <>
              A 4-ball is who you walk with. It is not the same as the match. Today is{' '}
              <span className="text-chalk-200">{describeRoundFormat(matches)}</span>
              {matches.length > 1
                ? ', so a single 4-ball can contain more than one match.'
                : '.'}{' '}
              Changing the groups here does not change who is playing whom.
            </>
          )}
        </p>
        <ul className="mt-2.5 space-y-1.5 border-t border-white/6 pt-2.5">
          {matches.map((match) => (
            <li key={match.id} className="flex items-baseline justify-between gap-2 text-xs">
              <Link href={`/match/${match.id}`} className="min-w-0 truncate text-chalk-200 underline-offset-2 hover:underline">
                {match.name}
              </Link>
              <span className="shrink-0 text-chalk-500">
                H{match.startHole}–{match.endHole}
              </span>
            </li>
          ))}
          {matches.length === 0 && (
            <li className="text-xs text-chalk-500">No matches set up for this round yet.</li>
          )}
        </ul>
        {!derived && (
          <>
            <p className="mt-2 text-xs text-chalk-500">
              Who plays whom is edited separately, and is also open to everyone.
            </p>
            <Link href={`/round/${round.id}/matchups`} className="btn-ghost mt-2 w-full !py-2 text-xs">
              Edit matchups
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
