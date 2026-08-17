import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getServiceSupabase } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The uploaded scorecard photo, preserved against the course record.
 *
 * Kept in its own table rather than on `courses` so the (large) image never
 * loads with the tour snapshot — it is only fetched when someone opens the
 * course verification screen.
 */

/** Fetch the stored photo for a course. */
export async function GET(request: Request) {
  const courseId = new URL(request.url).searchParams.get('courseId');
  if (!courseId) return NextResponse.json({ error: 'courseId is required' }, { status: 400 });

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ image: null, demo: true });

  const { data, error } = await supabase
    .from('course_scorecards')
    .select('*')
    .eq('course_id', courseId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ image: null });

  return NextResponse.json({
    image: {
      id: data.id,
      courseId: data.course_id,
      imageData: data.image_data,
      mimeType: data.mime_type,
      uploadedBy: data.uploaded_by,
      notes: data.notes,
      createdAt: data.created_at,
    },
  });
}

/** Store an uploaded photo against a course. */
export async function POST(request: Request) {
  // No PIN. The session is read only to record who uploaded the photo.
  const session = await getSession();

  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: 'The database is not configured, so the photo cannot be stored.' },
      { status: 503 },
    );
  }

  const { courseId, imageData, mimeType, notes } = await request.json().catch(() => ({}));
  if (!courseId || !imageData || !mimeType) {
    return NextResponse.json({ error: 'courseId, imageData and mimeType are required' }, { status: 400 });
  }
  if (typeof imageData !== 'string' || imageData.length > 20_000_000) {
    return NextResponse.json({ error: 'That photo is too large.' }, { status: 413 });
  }

  const { data, error } = await supabase
    .from('course_scorecards')
    .insert({
      course_id: courseId,
      image_data: imageData,
      mime_type: mimeType,
      uploaded_by: (session?.playerName ?? 'Admin').slice(0, 60),
      notes: notes ?? null,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Point the course at the newest photo without touching verification state.
  await supabase.from('courses').update({ scorecard_image_id: data.id }).eq('id', courseId);

  return NextResponse.json({ id: data.id });
}
