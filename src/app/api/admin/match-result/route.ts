import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/admin';
import { buildManualResult } from '@/lib/scoring/engine';
import { halvesAwardNothing } from '@/lib/rounds/matchups';
import { fromMatchRow, fromSideRow, fromTourRow, toResultRow } from '@/lib/data/mappers';
import type { ManualOutcome } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OUTCOMES: ReadonlySet<string> = new Set<ManualOutcome>(['home', 'away', 'halved']);

/**
 * An organiser declaring who won a match.
 *
 * The client sends only "home", "away" or "halved" — never a scoreline. The
 * points are worked out here from the match's own stake and its round's halve
 * rule, using the same helper the scoring engine uses, so a manual result and
 * a played-out one can never award different amounts:
 *
 *   Day 1 / 2 / 4 — win 1, halve 0.5 each
 *   Day 3         — win 0.5, halve NOTHING to either side, the half burned
 *
 * A null outcome clears the override and hands the match back to hole-by-hole
 * scoring. Nothing here touches `scores`: a round scored on paper does not
 * need its holes reconstructing.
 */
export async function POST(request: Request) {
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'The database is not configured.' }, { status: 503 });
  }

  const { matchId, outcome, enteredBy } = await request.json().catch(() => ({}));
  if (typeof matchId !== 'string') {
    return NextResponse.json({ error: 'matchId is required' }, { status: 400 });
  }
  if (outcome !== null && !OUTCOMES.has(outcome)) {
    return NextResponse.json(
      { error: 'outcome must be "home", "away", "halved" or null' },
      { status: 400 },
    );
  }

  // Clearing: drop the row and let the engine speak for the match again.
  if (outcome === null) {
    const { error } = await supabase.from('match_results').delete().eq('match_id', matchId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, result: null });
  }

  const matchRow = await supabase.from('matches').select('*').eq('id', matchId).maybeSingle();
  if (matchRow.error) return NextResponse.json({ error: matchRow.error.message }, { status: 500 });
  if (!matchRow.data) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
  const match = fromMatchRow(matchRow.data);

  const [sideRows, roundMatchRows, tourRows] = await Promise.all([
    supabase.from('match_sides').select('*').eq('match_id', matchId).order('sort_order'),
    // The whole round, because the halve rule is a property of the round: a
    // round split across more than one hole range is Day 3, where a half pays
    // nobody.
    supabase.from('matches').select('*').eq('round_id', match.roundId),
    supabase.from('tours').select('*').order('year', { ascending: false }).limit(1),
  ]);

  const failure = [sideRows, roundMatchRows, tourRows].find((r) => r.error)?.error;
  if (failure) return NextResponse.json({ error: failure.message }, { status: 500 });

  const sides = (sideRows.data ?? []).map(fromSideRow);
  if (sides.length < 2) {
    return NextResponse.json(
      { error: 'That match has no sides yet, so there is nobody to award the points to.' },
      { status: 409 },
    );
  }
  if (!tourRows.data?.length) {
    return NextResponse.json({ error: 'No tour found' }, { status: 500 });
  }

  const result = buildManualResult({
    match,
    sides,
    outcome: outcome as ManualOutcome,
    settings: fromTourRow(tourRows.data[0]).settings,
    halveAwardsNothing: halvesAwardNothing((roundMatchRows.data ?? []).map(fromMatchRow)),
    enteredBy: (typeof enteredBy === 'string' && enteredBy.trim() ? enteredBy : 'Organiser').slice(
      0,
      60,
    ),
  });

  const { data, error } = await supabase
    .from('match_results')
    .upsert(toResultRow(result), { onConflict: 'match_id' })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, result: data });
}
