/**
 * What a round's setup allows, once the round has been played.
 *
 * Day 1 was played and scored badly, and the fix for it is to enter the
 * official results — not to re-derive the round. So a completed round's
 * course, tee, ratings and handicaps become read-only, and the only thing
 * left editable is who won.
 *
 * Pure functions, so the rules are testable without a screen.
 */

import { isRoundLocked, type Player, type Round, type Tee } from '@/lib/types';

/** Completed rounds that play this course. Non-empty means "do not edit". */
export function lockedRoundsForCourse(rounds: Round[], courseId: string): Round[] {
  return rounds.filter((round) => round.courseId === courseId && isRoundLocked(round));
}

/** Completed rounds played off this tee. Non-empty means "do not edit". */
export function lockedRoundsForTee(rounds: Round[], teeId: string): Round[] {
  return rounds.filter((round) => round.teeId === teeId && isRoundLocked(round));
}

/** A sentence naming the rounds that have this locked, for a warning. */
export function lockedByLabel(rounds: Round[]): string {
  if (rounds.length === 0) return '';
  const names = rounds.map((round) => `Day ${round.dayNo}`);
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

export interface ManualHandicapStatus {
  /** True when this round is set to manual handicaps at all. */
  isManual: boolean;
  /** Players still without a manually entered course handicap. */
  missing: Player[];
  /** How many have one. */
  entered: number;
  /** How many need one. */
  required: number;
  /** Manual mode with every player entered — safe to score. */
  ready: boolean;
  /**
   * Manual mode with at least one player missing. Scoring must be blocked and
   * the reason shown: after a round was scored off the wrong tee, quietly
   * substituting a calculated number is the exact failure to avoid.
   */
  incomplete: boolean;
}

/**
 * Whether a round on manual handicaps is safe to score.
 *
 * Only players actually playing in the round are counted — someone sitting a
 * day out does not need a figure entered for it.
 */
export function manualHandicapStatus(
  round: Pick<Round, 'handicapSource'>,
  playersInRound: Player[],
  entered: Readonly<Record<string, number>>,
): ManualHandicapStatus {
  const isManual = round.handicapSource === 'manual';
  const missing = isManual
    ? playersInRound.filter((player) => entered[player.id] === undefined)
    : [];

  return {
    isManual,
    missing,
    entered: playersInRound.length - missing.length,
    required: playersInRound.length,
    ready: isManual && playersInRound.length > 0 && missing.length === 0,
    incomplete: isManual && missing.length > 0,
  };
}

/** The message shown when a manual round is not ready. Deliberately blunt. */
export const MANUAL_HANDICAPS_INCOMPLETE =
  'Manual Course Handicaps incomplete – scoring cannot start.';

/**
 * The label on the verify screen's save button.
 *
 * Named after the tee it is about to write to, because it once wrote White's
 * ratings onto the Yellow row while saying only "Save".
 */
export function saveToTeeLabel(tee: Tee | undefined): string {
  return tee ? `Save CR/Slope to ${tee.name.toUpperCase()} tees` : 'Choose a tee first';
}
