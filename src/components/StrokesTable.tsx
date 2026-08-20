'use client';

import { useTour } from '@/lib/data/provider';
import { courseHandicap, isPerPlayerFormat, strokesOnHole } from '@/lib/scoring/handicap';
import { courseHandicapLabel, handicapLabel } from '@/lib/format';
import { FORMAT_LABELS, type Round } from '@/lib/types';

/**
 * "Who gets shots, and where."
 *
 * Once a course is verified — rating, slope, par and stroke indexes all present
 * — this is the answer to the question everyone asks on the first tee. It reads
 * straight off the same handicap functions the scoring engine uses, so it can
 * never disagree with what the scorecard actually awards.
 *
 * These are COURSE handicaps off the round's selected tee, before the
 * format-specific allowance. The per-match strokes, after that allowance, are
 * shown on each scorecard.
 */
export function StrokesTable({ round }: { round: Round }) {
  const { snapshot, teeById, holesForCourse, teamById } = useTour();

  const tee = teeById(round.teeId);
  const holes = holesForCourse(round.courseId);
  if (!tee || holes.length === 0) return null;

  const players = [...snapshot.players].sort((a, b) => a.sortOrder - b.sortOrder);
  const front = holes.filter((h) => h.holeNo <= 9);
  const back = holes.filter((h) => h.holeNo > 9);

  const rows = players.map((player) => {
    const team = teamById(player.teamId);
    const index = player.handicapIndex;
    const ch = index === null ? 0 : courseHandicap(index, tee);
    return {
      player,
      team,
      index,
      courseHandicap: ch,
      strokes: Object.fromEntries(
        holes.map((hole) => [hole.holeNo, strokesOnHole(ch, hole.strokeIndex, holes.length)]),
      ) as Record<number, number>,
    };
  });

  const anyMissing = rows.some((row) => row.index === null);

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-white/8 px-3.5 py-2.5">
        <div className="label">Strokes received</div>
        <p className="mt-0.5 text-xs text-chalk-500">
          Off the {tee.name} tees (CR {tee.courseRating} / Slope {tee.slopeRating}). Dots mark the
          holes where each player gets a shot.
        </p>
      </div>

      {anyMissing && (
        <p className="border-b border-white/8 bg-brass-500/10 px-3.5 py-2 text-xs text-brass-300">
          Players without a handicap index are shown off scratch.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="tabular w-full min-w-[32rem] text-center text-xs">
          <thead>
            <tr className="border-b border-white/10 text-[0.6rem] uppercase tracking-wider text-chalk-500">
              <th className="sticky left-0 z-10 bg-ink-900 px-2 py-2 text-left">Player</th>
              <th className="px-1.5 py-2">CH</th>
              {holes.map((hole) => (
                <th key={hole.holeNo} className="px-1 py-2 font-bold text-chalk-300">
                  {hole.holeNo}
                </th>
              ))}
            </tr>
            <tr className="border-b border-white/10 text-[0.58rem] text-chalk-600">
              <th className="sticky left-0 z-10 bg-ink-900 px-2 py-1 text-left font-normal">SI</th>
              <th />
              {holes.map((hole) => (
                <th key={hole.holeNo} className="px-1 py-1 font-normal">
                  {hole.strokeIndex}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ player, team, index, courseHandicap: ch, strokes }) => (
              <tr key={player.id} className="border-b border-white/5">
                <td className="sticky left-0 z-10 bg-ink-900 px-2 py-2 text-left">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: team?.colour }}
                    />
                    <span className="truncate font-semibold">{player.name.split(' ')[0]}</span>
                    <span className="text-[0.6rem] text-chalk-600">{handicapLabel(index)}</span>
                  </span>
                </td>
                <td className="px-1.5 py-2 font-bold text-brass-400">
                  {courseHandicapLabel(ch)}
                </td>
                {holes.map((hole) => {
                  const shots = strokes[hole.holeNo] ?? 0;
                  return (
                    <td key={hole.holeNo} className="px-1 py-2">
                      {shots > 0 ? (
                        <span className="inline-flex gap-0.5">
                          {Array.from({ length: Math.min(3, shots) }).map((_, i) => (
                            <span key={i} className="h-1.5 w-1.5 rounded-full bg-brass-400" />
                          ))}
                        </span>
                      ) : shots < 0 ? (
                        <span className="text-[0.6rem] font-bold text-pirate-300">{shots}</span>
                      ) : (
                        <span className="text-chalk-700">·</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-white/12 text-[0.6rem] text-chalk-500">
              <td className="sticky left-0 z-10 bg-ink-900 px-2 py-2 text-left">Out / In</td>
              <td />
              <td colSpan={front.length} className="py-2">
                Front nine
              </td>
              <td colSpan={back.length} className="py-2">
                Back nine
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/**
 * What each side actually plays off in each match.
 *
 * The table above is course handicaps — the raw number off the tee. This is the
 * next step, and the one people argue about on the first tee: after the format
 * allowance, what each side actually plays off. Nothing is subtracted at this
 * step, so nobody appears on zero unless their handicap is zero.
 *
 * Two shapes, because the formats genuinely differ:
 *
 *   scramble / shamble — the pair play off ONE combined handicap,
 *                        floor(floor((CH1 + CH2) / 2) x 0.8), and BOTH pairs
 *                        keep their own, so both receive strokes.
 *   better ball / singles — every player carries their own 100% course
 *                        handicap IN FULL. Nobody is reduced to the lowest
 *                        player: 4, 11, 15 and 22 play as 4 / 11 / 15 / 22.
 *
 * Every number here comes from the engine's own outcome, not a re-computation,
 * so it cannot drift from what the scorecard awards.
 */
export function MatchHandicaps({ round }: { round: Round }) {
  const { matchesForRound, sidesForMatch, outcomeFor, playerById, teamById } = useTour();

  const matches = matchesForRound(round.id);
  if (matches.length === 0) return null;

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-white/8 px-3.5 py-2.5">
        <div className="label">Playing handicaps</div>
        <p className="mt-0.5 text-xs text-chalk-500">
          Everyone plays off their handicap in full. Scramble and Shamble pairs use one team
          handicap each; Better Ball and Singles use each player’s own course handicap. Nobody
          plays off zero.
        </p>
      </div>

      <ul className="divide-y divide-white/6">
        {matches.map((match) => {
          const outcome = outcomeFor(match.id);
          const sides = sidesForMatch(match.id);
          const perPlayer = isPerPlayerFormat(match.format);

          return (
            <li key={match.id} className="px-3.5 py-2.5">
              <div className="label mb-1.5 flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate">{match.name}</span>
                <span className="shrink-0 font-normal text-chalk-500">
                  {FORMAT_LABELS[match.format]}
                </span>
              </div>

              {sides.map((side) => {
                const team = teamById(side.teamId);
                const handicaps = outcome?.handicaps[side.id];
                const teamHandicap = outcome?.teamHandicaps[side.id] ?? null;
                const plays = handicaps?.playingHandicap ?? 0;
                return (
                  <div
                    key={side.id}
                    className="flex items-baseline justify-between gap-2 py-1 text-xs"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: team?.colour }}
                      />
                      <span className="truncate">
                        {side.playerIds
                          .map((id) => {
                            const name = playerById(id)?.name.split(' ')[0] ?? '?';
                            const ch = handicaps?.courseHandicaps[id];
                            return ch === undefined ? name : `${name} ${courseHandicapLabel(ch)}`;
                          })
                          .join(' & ') || 'Not set'}
                      </span>
                    </span>
                    <span className="shrink-0 tabular font-bold text-brass-400">
                      {perPlayer
                        ? side.playerIds
                            .map((id) =>
                              courseHandicapLabel(handicaps?.playerPlayingHandicaps[id] ?? 0),
                            )
                            .join(' / ')
                        : // A pair plays off its team handicap in full, so there is
                          // one number, not a "before and after the difference" pair.
                          `Team ${courseHandicapLabel(teamHandicap ?? plays)}`}
                    </span>
                  </div>
                );
              })}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
