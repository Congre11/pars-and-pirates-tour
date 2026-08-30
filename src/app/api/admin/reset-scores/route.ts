import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Wipe every score in the tour.
 *
 * Used to clear a practice run before the real thing. The audit trail in
 * `score_events` is deliberately NOT cleared, so there is still a record of
 * what happened.
 *
 * Organiser match results are NOT cleared either. Nothing in the app writes
 * one automatically, so every row in `match_results` was typed in by a person
 * about a round that has already been played — deleting them here could only
 * ever destroy data that rescoring cannot recreate. They are cleared one at a
 * time from the results screen instead.
 *
 * There is no PIN on this — there are no PINs anywhere any more. What keeps it
 * safe is that it lives on the Tour settings screen behind a typed
 * confirmation, well away from anything used on the course.
 */
export async function POST() {
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'The database is not configured.' }, { status: 503 });
  }

  const scores = await supabase.from('scores').delete().gte('hole_no', 1);
  if (scores.error) {
    return NextResponse.json({ error: scores.error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
