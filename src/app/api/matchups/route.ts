import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface MatchupsBody {
  sides?: Array<{ id?: string; playerIds?: string[] }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Change who is playing whom.
 *
 * Deliberately narrow: this route updates `match_sides.player_ids` and nothing
 * else. It cannot alter a format, a hole range, a points value or a handicap
 * allowance — those are set up once in Tour settings. So opening the matchups
 * to every player, which is the point, does not also open the scoring rules.
 *
 * No PIN, like the rest of the app.
 */
export async function POST(request: Request) {
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: 'The database is not configured on the server.' },
      { status: 503 },
    );
  }

  let body: MatchupsBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const sides = Array.isArray(body.sides) ? body.sides : null;
  if (!sides || sides.length === 0) {
    return NextResponse.json({ error: 'sides are required' }, { status: 400 });
  }
  if (sides.length > 40) {
    return NextResponse.json({ error: 'Too many sides in one request.' }, { status: 400 });
  }

  for (const side of sides) {
    if (!side.id || !UUID.test(side.id)) {
      return NextResponse.json({ error: 'Every side needs a valid id.' }, { status: 400 });
    }
    const playerIds = Array.isArray(side.playerIds)
      ? side.playerIds.filter((id) => typeof id === 'string' && UUID.test(id))
      : [];

    // One column, one row. An update rather than an upsert so this can never
    // create a side, and `player_ids` is the only field named.
    const { error } = await supabase
      .from('match_sides')
      .update({ player_ids: playerIds })
      .eq('id', side.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
