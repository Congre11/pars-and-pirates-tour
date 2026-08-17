import { NextResponse } from 'next/server';
import { getSession, isPinRequired } from '@/lib/auth/session';
import { getServiceSupabase } from '@/lib/supabase/admin';
import {
  toCourseRow,
  toFineRow,
  toHoleRow,
  toItineraryRow,
  toMatchRow,
  toPlayerRow,
  toRoundRow,
  toSideRow,
  toTeamRow,
  toTeeRow,
  toTourRow,
} from '@/lib/data/mappers';
import type { AdminEntity } from '@/lib/data/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Generic admin write endpoint.
 *
 * The entity name is validated against a fixed allow-list and the payload is
 * put through the same mappers the reader uses, so a request can only ever
 * touch known tables and known columns.
 */
const TABLES: Record<AdminEntity, { table: string; map: (v: never) => Record<string, unknown> }> = {
  tour: { table: 'tours', map: toTourRow as (v: never) => Record<string, unknown> },
  teams: { table: 'teams', map: toTeamRow as (v: never) => Record<string, unknown> },
  players: { table: 'players', map: toPlayerRow as (v: never) => Record<string, unknown> },
  courses: { table: 'courses', map: toCourseRow as (v: never) => Record<string, unknown> },
  tees: { table: 'tees', map: toTeeRow as (v: never) => Record<string, unknown> },
  holes: { table: 'holes', map: toHoleRow as (v: never) => Record<string, unknown> },
  rounds: { table: 'rounds', map: toRoundRow as (v: never) => Record<string, unknown> },
  matches: { table: 'matches', map: toMatchRow as (v: never) => Record<string, unknown> },
  sides: { table: 'match_sides', map: toSideRow as (v: never) => Record<string, unknown> },
  itinerary: { table: 'itinerary_items', map: toItineraryRow as (v: never) => Record<string, unknown> },
  fines: { table: 'fines', map: toFineRow as (v: never) => Record<string, unknown> },
};

async function guard() {
  const session = await getSession();
  if (isPinRequired() && !session?.isAdmin) {
    return NextResponse.json(
      { error: 'Admin PIN required. Sign in again with the captains’ PIN.' },
      { status: 403 },
    );
  }
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'The database is not configured.' }, { status: 503 });
  }
  return supabase;
}

function resolve(entity: unknown) {
  if (typeof entity !== 'string' || !(entity in TABLES)) return null;
  return TABLES[entity as AdminEntity];
}

export async function PATCH(request: Request) {
  const supabase = await guard();
  if (supabase instanceof NextResponse) return supabase;

  const { entity, id, patch } = await request.json().catch(() => ({}));
  const target = resolve(entity);
  if (!target || typeof id !== 'string') {
    return NextResponse.json({ error: 'Unknown entity or missing id' }, { status: 400 });
  }

  const row = target.map(patch as never);
  delete row.id;
  if (Object.keys(row).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { error } = await supabase.from(target.table).update(row).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const supabase = await guard();
  if (supabase instanceof NextResponse) return supabase;

  const { entity, row } = await request.json().catch(() => ({}));
  const target = resolve(entity);
  if (!target) return NextResponse.json({ error: 'Unknown entity' }, { status: 400 });

  const mapped = target.map(row as never);
  const { data, error } = await supabase.from(target.table).insert(mapped).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data?.id });
}

export async function DELETE(request: Request) {
  const supabase = await guard();
  if (supabase instanceof NextResponse) return supabase;

  const { entity, id } = await request.json().catch(() => ({}));
  const target = resolve(entity);
  if (!target || typeof id !== 'string') {
    return NextResponse.json({ error: 'Unknown entity or missing id' }, { status: 400 });
  }
  if (entity === 'tour') {
    return NextResponse.json({ error: 'The tour cannot be deleted here.' }, { status: 400 });
  }

  const { error } = await supabase.from(target.table).delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
