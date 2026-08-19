'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTour } from '@/lib/data/provider';
import { useSession } from '@/lib/auth/session-provider';
import { Avatar, EmptyState, PageHeader } from '@/components/ui';
import { describeConfirmation, matchupsConfirmation } from '@/lib/rounds/confirmation';
import { derivePairings } from '@/lib/rounds/derived-pairings';
import {
  assignToSide,
  checkMatchups,
  draftSidesFor,
  matchupsDirty,
  sectionsForRound,
  swapInSection,
  type DraftSide,
} from '@/lib/rounds/matchups';
import { PLAYERS_PER_SIDE } from '@/lib/types';

/**
 * Edit who is playing whom.
 *
 * Open to everyone — no PIN, like the rest of the app. Each hole range is
 * edited on its own, so Day 3's three six-hole sections can be paired
 * differently while the physical 4-balls stay exactly where they are.
 *
 * The route deliberately writes only the players on each side, so this screen
 * cannot change a format, a hole range or a points value.
 */
export default function MatchupsPage({ params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = use(params);
  const searchParams = useSearchParams();
  const {
    snapshot,
    roundById,
    courseById,
    matchesForRound,
    sidesForMatch,
    holesForCourse,
    groupsForRound,
    saveMatchups,
    playerById,
    teamById,
  } = useTour();
  const { session } = useSession();

  const round = roundById(roundId);
  const matches = matchesForRound(roundId);
  const course = round ? courseById(round.courseId) : undefined;
  const holeCount = course ? holesForCourse(course.id).length || 18 : 18;
  const sections = sectionsForRound(matches, holeCount);

  // On a round where the 4-balls ARE the pairings (Day 3), there is nothing to
  // edit here: one submission covers all three sections, made from the 4-ball
  // screen. Editing sections separately is what let them drift apart.
  const derived = derivePairings(
    sections,
    groupsForRound(roundId),
    snapshot.players,
    snapshot.teams,
    sidesForMatch,
  ).pairings;

  // Deep link from the round screen: ?section=7-12 opens that one expanded.
  const requested = searchParams.get('section');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const activeKey = openKey ?? requested ?? sections[0]?.key ?? null;

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

  return (
    <div className="space-y-4 pb-6">
      <PageHeader
        title="Matchups"
        back={`/round/${round.id}`}
        subtitle={
          <>
            Day {round.dayNo}
            {course ? ` · ${course.name}` : ''}
          </>
        }
      />

      {derived ? (
        <p className="card px-3.5 py-3 text-sm leading-snug text-chalk-300">
          On this round the same pairs play all {holeCount} holes — only the format changes between
          sections — so the matchups come straight from the 4-balls. Change the 4-balls and every
          section follows, in one submission for the whole day.
        </p>
      ) : (
        <p className="card px-3.5 py-3 text-sm leading-snug text-chalk-300">
          Who is competing against whom. Tap a player, then tap another from the{' '}
          <strong>same team</strong> to swap them. This does not change the 4-balls — who you walk
          with stays as it is.
        </p>
      )}

      {sections.length === 0 && (
        <EmptyState
          title="No matches on this round yet"
          detail="Matches are set up in More → Tour settings → Formats & pairings."
        />
      )}

      {/* A derived round shows its sections read-only: the editing happens on
          the 4-ball screen, so there is one decision and one submission. */}
      {derived
        ? sections.map((section) => (
            <ReadOnlySection
              key={section.key}
              section={section}
              sidesForMatch={sidesForMatch}
              playerById={playerById}
              teamById={teamById}
            />
          ))
        : sections.map((section) => (
        <SectionEditor
          key={section.key}
          section={section}
          open={activeKey === section.key}
          onToggle={() => setOpenKey(activeKey === section.key ? '' : section.key)}
          sidesForMatch={sidesForMatch}
          saveMatchups={saveMatchups}
          players={snapshot.players}
          teams={snapshot.teams}
          playerById={playerById}
          teamById={teamById}
          multiSection={sections.length > 1}
          me={session?.playerName || 'A player'}
        />
          ))}

      <Link href={`/round/${round.id}/four-balls`} className="btn-ghost w-full">
        {derived ? 'Edit the pairings on the 4-ball screen →' : 'Edit the 4-balls instead →'}
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------

type Section = ReturnType<typeof sectionsForRound>[number];

function SectionEditor({
  section,
  open,
  onToggle,
  sidesForMatch,
  saveMatchups,
  players,
  teams,
  playerById,
  teamById,
  multiSection,
  me,
}: {
  section: Section;
  open: boolean;
  onToggle: () => void;
  sidesForMatch: ReturnType<typeof useTour>['sidesForMatch'];
  saveMatchups: ReturnType<typeof useTour>['saveMatchups'];
  players: ReturnType<typeof useTour>['snapshot']['players'];
  teams: ReturnType<typeof useTour>['snapshot']['teams'];
  playerById: ReturnType<typeof useTour>['playerById'];
  teamById: ReturnType<typeof useTour>['teamById'];
  multiSection: boolean;
  /** The name a submission is recorded against. */
  me: string;
}) {
  const saved = draftSidesFor(section, sidesForMatch);
  const [draft, setDraft] = useState<DraftSide[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'saving' | 'submitting' | 'saved' | 'error'>('idle');
  const [errorText, setErrorText] = useState<string | null>(null);

  // Saved rows stay the source of truth until this device edits, so another
  // player's change arriving over realtime is picked up rather than clobbered.
  const sides = draft ?? saved;
  const dirty = draft !== null && matchupsDirty(sides, saved);

  // Only the players actually in this section need checking.
  const roster = players.filter((p) => saved.some((s) => s.playerIds.includes(p.id)));
  const check = checkMatchups(section, sides, roster, teams);

  const tapPlayer = (playerId: string) => {
    if (selected === null) {
      setSelected(playerId);
      return;
    }
    if (selected === playerId) {
      setSelected(null);
      return;
    }
    setDraft(swapInSection(sides, selected, playerId));
    setSelected(null);
  };

  const tapSide = (sideId: string) => {
    if (selected === null) return;
    const side = sides.find((s) => s.id === sideId);
    if (!side || side.playerIds.includes(selected)) {
      setSelected(null);
      return;
    }
    setDraft(assignToSide(sides, selected, sideId));
    setSelected(null);
  };

  // One person submitting is enough. Saving without submitting keeps the
  // section a draft, and editing a submitted section clears the stamp — the
  // stores do that, so nothing here has to remember to.
  const confirmation = matchupsConfirmation(section.matches);

  const save = async (confirm: boolean) => {
    setState(confirm ? 'submitting' : 'saving');
    setErrorText(null);
    try {
      await saveMatchups({
        sides: sides.map((s) => ({ id: s.id, playerIds: s.playerIds })),
        matchIds: section.matches.map((m) => m.id),
        confirm,
        confirmedBy: me,
      });
      setState('saved');
      setDraft(null);
      setTimeout(() => setState('idle'), 1800);
    } catch (err) {
      setState('error');
      setErrorText(err instanceof Error ? err.message : 'Could not save the matchups');
    }
  };

  return (
    <div className="card overflow-hidden">
      <button onClick={onToggle} className="tap flex w-full items-center gap-3 px-3.5 py-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{section.label}</span>
          <span className="block truncate text-xs text-chalk-500">
            {section.formatLabel}
            {section.mixedFormats ? ' (mixed)' : ''} · {section.matches.length}{' '}
            {section.matches.length === 1 ? 'match' : 'matches'}
          </span>
        </span>
        {dirty && <span className="chip bg-brass-500/25 text-brass-300">EDITED</span>}
        <span className={`text-chalk-500 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden>
          ›
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-white/6 px-3.5 py-3.5">
          {section.matches.map((match) => {
            const matchSides = sides.filter((s) => s.id !== undefined && s.matchId === match.id);
            return (
              <div key={match.id} className="rounded-xl bg-white/4 px-3 py-3">
                <div className="label mb-2 flex items-center justify-between">
                  <span>{match.name}</span>
                  <span className="text-chalk-500">
                    {match.pointsValue} {match.pointsValue === 1 ? 'pt' : 'pts'}
                  </span>
                </div>

                {matchSides.map((side, index) => {
                  const team = teamById(side.teamId);
                  const wanted = PLAYERS_PER_SIDE[match.format];
                  return (
                    <div key={side.id}>
                      {index > 0 && (
                        <div className="my-1.5 text-center text-[0.65rem] font-bold text-chalk-500">
                          vs
                        </div>
                      )}
                      {/* A plain container, not a button: nesting the player
                          buttons inside another button is invalid markup and
                          the browser swallows the inner taps. */}
                      <div
                        className="flex flex-wrap items-center gap-1.5 rounded-lg px-2 py-2"
                        style={{ backgroundColor: `${team?.colour ?? '#333'}26` }}
                      >
                        {side.playerIds.map((id) => {
                          const player = playerById(id);
                          const isSelected = selected === id;
                          return (
                            <button
                              key={id}
                              onClick={() => tapPlayer(id)}
                              aria-pressed={isSelected}
                              className={`tap flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-semibold transition-all ${
                                isSelected ? 'ring-2 ring-brass-400' : selected ? 'opacity-60' : ''
                              }`}
                              style={{ backgroundColor: `${team?.colour ?? '#333'}59` }}
                            >
                              {player && (
                                <Avatar
                                  name={player.name}
                                  initials={player.initials}
                                  colour={team?.colour ?? '#333'}
                                  photoUrl={player.photoUrl}
                                  size={20}
                                />
                              )}
                              {player?.name ?? 'Unknown'}
                            </button>
                          );
                        })}

                        {/* Moving into a short side needs no partner to swap
                            with, so it gets its own explicit target. */}
                        {selected && !side.playerIds.includes(selected) && (
                          <button
                            onClick={() => tapSide(side.id)}
                            className="tap rounded-md border border-dashed border-white/30 px-2 py-1 text-xs font-semibold text-chalk-300"
                          >
                            Move here
                          </button>
                        )}

                        {!selected && side.playerIds.length < wanted && (
                          <span className="text-xs text-chalk-500">
                            {side.playerIds.length === 0
                              ? 'Empty'
                              : `needs ${wanted - side.playerIds.length} more`}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {selected && (
            <p className="rounded-lg border border-brass-500/35 bg-brass-500/10 px-3 py-2 text-center text-xs text-brass-300">
              {playerById(selected)?.name} selected — tap another player to swap.
            </p>
          )}

          {check.issues.length > 0 && (
            <ul className="space-y-1.5">
              {check.issues.map((issue, i) => (
                <li
                  key={i}
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

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => save(false)}
              disabled={!dirty || state === 'saving' || state === 'submitting'}
              className="btn-ghost disabled:opacity-40"
            >
              {state === 'saving'
                ? 'Saving…'
                : dirty
                  ? multiSection
                    ? `Save ${section.label}`
                    : 'Save'
                  : 'No changes'}
            </button>
            <button
              onClick={() => save(true)}
              disabled={
                check.issues.some((i) => i.level === 'error') ||
                state === 'saving' ||
                state === 'submitting' ||
                (confirmation.state === 'confirmed' && !dirty)
              }
              className="btn-primary disabled:opacity-40"
            >
              {state === 'submitting'
                ? 'Submitting…'
                : state === 'saved'
                  ? 'Saved ✓'
                  : confirmation.state === 'confirmed' && !dirty
                    ? 'Submitted ✓'
                    : 'Submit'}
            </button>
          </div>

          <p className="text-center text-xs text-chalk-500">
            {dirty && confirmation.state === 'confirmed'
              ? 'Edited since it was submitted — submit again to confirm.'
              : describeConfirmation(confirmation, 'these matchups')}
            {confirmation.state !== 'confirmed' && ' · one person submitting is enough.'}
          </p>

          {dirty && (
            <button
              onClick={() => {
                setDraft(null);
                setSelected(null);
              }}
              className="tap w-full py-1 text-center text-xs text-chalk-500"
            >
              Undo my changes
            </button>
          )}

          {errorText && <p className="text-center text-xs text-pirate-300">{errorText}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * One section of a derived round, shown but not editable.
 *
 * The pairings here come from the 4-balls, so an editor on this screen would
 * be a second place to change the same thing — and the two would drift.
 */
function ReadOnlySection({
  section,
  sidesForMatch,
  playerById,
  teamById,
}: {
  section: Section;
  sidesForMatch: ReturnType<typeof useTour>['sidesForMatch'];
  playerById: ReturnType<typeof useTour>['playerById'];
  teamById: ReturnType<typeof useTour>['teamById'];
}) {
  const confirmation = matchupsConfirmation(section.matches);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-3 px-3.5 py-3">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{section.label}</span>
          <span className="block truncate text-xs text-chalk-500">{section.formatLabel}</span>
        </span>
        {confirmation.state === 'confirmed' && (
          <span className="chip bg-fairway-500/20 text-fairway-300">SUBMITTED</span>
        )}
      </div>

      <div className="space-y-2 border-t border-white/6 px-3.5 py-3">
        {section.matches.map((match) => (
          <div key={match.id} className="rounded-xl bg-white/4 px-3 py-2.5">
            <div className="label mb-1.5">{match.name}</div>
            {sidesForMatch(match.id).map((side, index) => {
              const team = teamById(side.teamId);
              return (
                <div key={side.id}>
                  {index > 0 && (
                    <div className="my-1 text-center text-[0.6rem] font-bold text-chalk-600">vs</div>
                  )}
                  <div className="flex items-center gap-1.5 text-xs">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: team?.colour }}
                    />
                    <span className="truncate">
                      {side.playerIds.map((id) => playerById(id)?.name ?? 'Unknown').join(' & ') ||
                        'Not set'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
