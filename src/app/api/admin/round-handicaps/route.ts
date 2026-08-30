import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Manually entered course handicaps for one round.
 *
 * Scoped to a single round on purpose. A completed round is history — it was
 * played off particular numbers and keeps them — so a figure typed for Day 2
 * has no way of reaching Day 1. The route refuses a round that is complete for
 * exactly that reason.
 *
 * Entries with a null handicap are deleted rather than zeroed. There is no
 * fallback to the calculated figure anywhere in the app, so a deleted entry
 * leaves the round incomplete and scoring stays blocked until it is filled in
 * — which is the point.
 */
interface Body {
  roundId?: string;
  entries?: Array<{ playerId?: string; courseHandicap?: number | null }>;
  updatedBy?: string;
}

export async function POST(request: Request) {
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'The database is not configured.' }, { status: 503 });
  }

  const body: Body = await request.json().catch(() => ({}));
  const { roundId } = body;
  if (!roundId || !Array.isArray(body.entries)) {
    return NextResponse.json({ error: 'roundId and entries are required' }, { status: 400 });
  }

  const round = await supabase.from('rounds').select('id, status').eq('id', roundId).maybeSingle();
  if (round.error) return NextResponse.json({ error: round.error.message }, { status: 500 });
  if (!round.data) return NextResponse.json({ error: 'Round not found' }, { status: 404 });
  if (round.data.status === 'complete') {
    return NextResponse.json(
      { error: 'That round is complete. Its handicaps are what it was played off and cannot change.' },
      { status: 409 },
    );
  }

  const updatedBy = (body.updatedBy || 'Organiser').slice(0, 60);
  const upserts: Array<Record<string, unknown>> = [];
  const deletes: string[] = [];

  for (const entry of body.entries) {
    if (typeof entry?.playerId !== 'string') {
      return NextResponse.json({ error: 'Every entry needs a playerId' }, { status: 400 });
    }
    const value = entry.courseHandicap;
    if (value === null || value === undefined) {
      deletes.push(entry.playerId);
      continue;
    }
    if (!Number.isInteger(value) || value < -10 || value > 54) {
      return NextResponse.json(
        { error: 'A course handicap must be a whole number between -10 and 54' },
        { status: 400 },
      );
    }
    upserts.push({
      round_id: roundId,
      player_id: entry.playerId,
      course_handicap: value,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    });
  }

  if (upserts.length) {
    const { error } = await supabase
      .from('round_handicaps')
      .upsert(upserts, { onConflict: 'round_id,player_id' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (deletes.length) {
    const { error } = await supabase
      .from('round_handicaps')
      .delete()
      .eq('round_id', roundId)
      .in('player_id', deletes);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
