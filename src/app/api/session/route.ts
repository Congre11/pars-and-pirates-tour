import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, getSession, sessionCookieOptions, signSession } from '@/lib/auth/session';
import type { Session } from '@/lib/types';

export const runtime = 'nodejs';

/** Who am I? */
export async function GET() {
  const session = await getSession();
  return NextResponse.json({ session });
}

/**
 * Say which player is using this phone.
 *
 * No PIN. The tour is private because the link is private, so this only
 * records a name for attribution — it grants nothing.
 */
export async function POST(request: Request) {
  let body: { playerId?: string | null; playerName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const session: Session = {
    playerId: body.playerId ?? null,
    playerName: (body.playerName ?? '').slice(0, 60) || 'Guest',
    issuedAt: Date.now(),
  };

  const store = await cookies();
  store.set(SESSION_COOKIE, await signSession(session), sessionCookieOptions());

  return NextResponse.json({ session });
}

/** Switch to a different player on this device. */
export async function DELETE() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
