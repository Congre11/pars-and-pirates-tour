import { NextResponse } from 'next/server';
import { getSession, isPinRequired } from '@/lib/auth/session';
import { getServiceSupabase } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ScoreBody {
  matchId?: string;
  holeNo?: number;
  sideId?: string;
  playerId?: string | null;
  gross?: number | null;
  pickedUp?: boolean;
  enteredBy?: string;
  expectedUpdatedAt?: string | null;
}

/**
 * The live scoring write path.
 *
 * Every phone posts here. The route checks the tour cookie, then calls the
 * `set_score` Postgres function, which upserts the score and appends to the
 * audit trail in one transaction. Supabase Realtime then pushes the change to
 * every other open phone.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (isPinRequired() && !session) {
    return NextResponse.json({ error: 'Not signed in to this tour.' }, { status: 401 });
  }

  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: 'The database is not configured on the server.' },
      { status: 503 },
    );
  }

  let body: ScoreBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { matchId, holeNo, sideId } = body;
  if (!matchId || !sideId || typeof holeNo !== 'number') {
    return NextResponse.json({ error: 'matchId, sideId and holeNo are required' }, { status: 400 });
  }
  if (holeNo < 1 || holeNo > 18) {
    return NextResponse.json({ error: 'holeNo must be between 1 and 18' }, { status: 400 });
  }
  const gross = body.gross ?? null;
  if (gross !== null && (!Number.isInteger(gross) || gross < 1 || gross > 20)) {
    return NextResponse.json({ error: 'gross must be a whole number from 1 to 20' }, { status: 400 });
  }

  // Admins can overwrite anything; everyone else is subject to the optimistic
  // check, which is what stops two scorers silently clobbering each other.
  const expectedUpdatedAt = session?.isAdmin ? null : (body.expectedUpdatedAt ?? null);

  const { data, error } = await supabase.rpc('set_score', {
    p_match_id: matchId,
    p_hole_no: holeNo,
    p_side_id: sideId,
    p_player_id: body.playerId ?? null,
    p_gross: gross,
    p_picked_up: body.pickedUp ?? false,
    p_entered_by: (body.enteredBy || session?.playerName || 'Someone').slice(0, 60),
    p_expected_updated_at: expectedUpdatedAt,
  });

  if (error) {
    if (error.message?.includes('score_conflict')) {
      return NextResponse.json(
        { error: 'Someone else updated this hole while you were typing. Their score is shown.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ score: data });
}
