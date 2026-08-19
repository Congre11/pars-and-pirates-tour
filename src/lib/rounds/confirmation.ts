/**
 * Has the day been agreed yet?
 *
 * Both the 4-balls and the matchups are open to every player, so nothing stops
 * a grouping being half-arranged an hour before the tee. What tells the rest of
 * the tour it is settled is one person pressing submit — one confirmation is
 * enough, this is not an approval chain.
 *
 * Three states, deliberately:
 *
 *   not-set    — nobody has saved anything; what you see is the default
 *   draft      — saved, but nobody has said it is final
 *   confirmed  — somebody submitted it, and it has not been edited since
 *
 * Editing after a confirmation drops it back to `draft`, because the thing
 * that was agreed is no longer the thing on the screen. The stores clear the
 * stamp on any plain save, so that fall-back is automatic rather than
 * something this module has to infer.
 *
 * Pure functions only.
 */

import type { Match, RoundGroup } from '@/lib/types';

export type ConfirmationState = 'not-set' | 'draft' | 'confirmed';

export interface Confirmation {
  state: ConfirmationState;
  /** Who submitted it, when confirmed. */
  by: string | null;
  /** ISO timestamp of the confirmation, when confirmed. */
  at: string | null;
}

const NOT_SET: Confirmation = { state: 'not-set', by: null, at: null };

/**
 * Fold a set of stamps into one state.
 *
 * Everything in the set has to be confirmed for the whole to count as
 * confirmed — a round with one 4-ball submitted and one still being argued
 * over is a draft.
 */
function fold(stamps: Array<{ at: string | null; by: string | null }>): Confirmation {
  if (stamps.length === 0) return NOT_SET;
  if (stamps.some((s) => !s.at)) return { state: 'draft', by: null, at: null };

  // Report the last one in, so "confirmed by X at Y" names the person who
  // completed it rather than whoever happened to sort first.
  const latest = stamps.reduce((a, b) => ((b.at ?? '') > (a.at ?? '') ? b : a));
  return { state: 'confirmed', by: latest.by, at: latest.at };
}

/** Are this round's 4-balls submitted? */
export function groupsConfirmation(groups: RoundGroup[]): Confirmation {
  return fold(groups.map((g) => ({ at: g.confirmedAt, by: g.confirmedBy })));
}

/** Are these matches' pairings submitted? Pass one section's matches, or all. */
export function matchupsConfirmation(matches: Match[]): Confirmation {
  return fold(matches.map((m) => ({ at: m.pairingsConfirmedAt, by: m.pairingsConfirmedBy })));
}

/**
 * Is the round ready to play — both the 4-balls and every matchup submitted?
 *
 * The handicaps are computed from the verified course data regardless, so this
 * gates nothing; it is what the round screen shows so people know whether the
 * pairings in front of them are settled or still being moved about.
 */
export function roundConfirmation(groups: RoundGroup[], matches: Match[]): Confirmation {
  const g = groupsConfirmation(groups);
  const m = matchupsConfirmation(matches);
  if (g.state === 'not-set' && m.state === 'not-set') return NOT_SET;
  if (g.state === 'confirmed' && m.state === 'confirmed') {
    return (m.at ?? '') > (g.at ?? '') ? m : g;
  }
  return { state: 'draft', by: null, at: null };
}

/** "Confirmed by Alan Hector" / "Saved, not submitted" / "Not set yet". */
export function describeConfirmation(confirmation: Confirmation, noun = 'these'): string {
  switch (confirmation.state) {
    case 'confirmed':
      return `Submitted${confirmation.by ? ` by ${confirmation.by}` : ''}`;
    case 'draft':
      return `Saved — nobody has submitted ${noun} yet`;
    default:
      return 'Not set yet';
  }
}
