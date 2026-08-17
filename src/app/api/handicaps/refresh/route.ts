import { NextResponse } from 'next/server';
import { getSession, isPinRequired } from '@/lib/auth/session';
import { getServiceSupabase } from '@/lib/supabase/admin';
import { fetchHandicapIndex, hnaStatus, isHnaConfigured } from '@/lib/hna/adapter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Report whether HNA is wired up, so Admin can tell the truth on screen. */
export async function GET() {
  return NextResponse.json(hnaStatus());
}

/**
 * "Refresh handicaps before the round."
 *
 * Only touches players who have an HNA member number on file, and only when
 * official credentials are configured. Players updated by hand are left alone
 * and keep `handicap_source = 'manual'`, so the Teams screen can always show
 * where a number came from and when.
 */
export async function POST() {
  const session = await getSession();
  if (isPinRequired() && !session?.isAdmin) {
    return NextResponse.json({ error: 'Admin PIN required.' }, { status: 403 });
  }

  if (!isHnaConfigured()) {
    return NextResponse.json(
      {
        error:
          'HNA is not connected. Handicap indexes are entered manually in Admin → Players — the app works fully without it.',
        ...hnaStatus(),
      },
      { status: 501 },
    );
  }

  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'The database is not configured.' }, { status: 503 });
  }

  const { data: players, error } = await supabase
    .from('players')
    .select('id, name, hna_id')
    .not('hna_id', 'is', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const updated: string[] = [];
  const failed: Array<{ name: string; reason: string }> = [];

  for (const player of players ?? []) {
    const result = await fetchHandicapIndex(player.hna_id as string);
    if (result.handicapIndex === null) {
      failed.push({ name: player.name as string, reason: result.error ?? 'Unknown error' });
      continue;
    }
    const { error: updateError } = await supabase
      .from('players')
      .update({
        handicap_index: result.handicapIndex,
        handicap_source: 'hna',
        handicap_updated_at: new Date().toISOString(),
      })
      .eq('id', player.id);

    if (updateError) failed.push({ name: player.name as string, reason: updateError.message });
    else updated.push(player.name as string);
  }

  return NextResponse.json({ updated, failed, checked: players?.length ?? 0 });
}
