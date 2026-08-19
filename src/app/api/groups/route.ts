import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getServiceSupabase } from '@/lib/supabase/admin';
import { toGroupRow } from '@/lib/data/mappers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface GroupsBody {
  roundId?: string;
  groups?: Array<{ id?: string; name?: string; playerIds?: string[]; sortOrder?: number }>;
  updatedBy?: string;
  /** True when this save is a submission, not a draft. */
  confirm?: boolean;
}

/** Rough UUID check, so a malformed id cannot reach Postgres as a uuid[]. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Save a round's 4-balls.
 *
 * Open to everyone, like the rest of the app.
 *
 * The whole set for a round is written at once. Groups only make sense
 * together — moving a player out of one always moves them into another — so a
 * partial write could leave someone in both groups or in neither.
 */
export async function POST(request: Request) {
  // No gate: every player may rearrange the 4-balls. The session is read only
  // to attribute the change to a name.
  const session = await getSession();

  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: 'The database is not configured on the server.' },
      { status: 503 },
    );
  }

  let body: GroupsBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { roundId, groups } = body;
  if (!roundId || !UUID.test(roundId) || !Array.isArray(groups)) {
    return NextResponse.json({ error: 'roundId and groups are required' }, { status: 400 });
  }
  // A round with a hundred groups is a bug or an attack, not a golf day.
  if (groups.length > 12) {
    return NextResponse.json({ error: 'That is too many groups for one round.' }, { status: 400 });
  }

  // Trust the signed cookie for attribution rather than the request body, so a
  // player cannot record a change against somebody else's name.
  const updatedBy = session?.playerName || body.updatedBy || 'A player';
  const updatedAt = new Date().toISOString();
  const confirmed = body.confirm === true;

  const rows = groups.map((group, index) => {
    const playerIds = Array.isArray(group.playerIds)
      ? group.playerIds.filter((id) => typeof id === 'string' && UUID.test(id))
      : [];
    return toGroupRow({
      ...(group.id && UUID.test(group.id) ? { id: group.id } : {}),
      roundId,
      name: (group.name ?? `4-Ball ${index + 1}`).slice(0, 60),
      playerIds,
      sortOrder: typeof group.sortOrder === 'number' ? group.sortOrder : index,
      updatedBy,
      updatedAt,
      // One person submitting is enough — this is a confirmation, not an
      // approval chain. A plain save writes nulls, which is what clears a
      // previous confirmation: the groups have moved since anyone agreed them.
      confirmedAt: confirmed ? updatedAt : null,
      confirmedBy: confirmed ? updatedBy : null,
    });
  });

  // Replace the round's set: upsert what was sent, then drop anything for this
  // round that was not. Upserting first means a failure leaves the old groups
  // in place rather than deleting them and then failing to write the new ones.
  const { data, error } = await supabase.from('round_groups').upsert(rows).select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const keptIds = (data ?? []).map((row) => row.id as string);
  if (keptIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('round_groups')
      .delete()
      .eq('round_id', roundId)
      .not('id', 'in', `(${keptIds.join(',')})`);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, ids: keptIds });
}
