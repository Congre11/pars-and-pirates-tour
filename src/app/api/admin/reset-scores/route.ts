import { NextResponse } from 'next/server';
import { getSession, isPinRequired } from '@/lib/auth/session';
import { getServiceSupabase } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Wipe every score in the tour.
 *
 * Used to clear a practice run before the real thing. The audit trail in
 * `score_events` is deliberately NOT cleared, so there is still a record of
 * what happened.
 */
export async function POST() {
  const session = await getSession();
  if (isPinRequired() && !session?.isAdmin) {
    return NextResponse.json({ error: 'Admin PIN required.' }, { status: 403 });
  }

  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'The database is not configured.' }, { status: 503 });
  }

  const scores = await supabase.from('scores').delete().gte('hole_no', 1);
  if (scores.error) {
    return NextResponse.json({ error: scores.error.message }, { status: 500 });
  }
  const results = await supabase.from('match_results').delete().neq('final_status', '__none__');
  if (results.error) {
    return NextResponse.json({ error: results.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
