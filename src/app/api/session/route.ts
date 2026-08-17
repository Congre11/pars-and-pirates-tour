import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  SESSION_COOKIE,
  checkPin,
  getSession,
  isPinRequired,
  sessionCookieOptions,
  signSession,
} from '@/lib/auth/session';
import type { Session } from '@/lib/types';

export const runtime = 'nodejs';

/** Who am I? */
export async function GET() {
  const session = await getSession();
  return NextResponse.json({ session, pinRequired: isPinRequired() });
}

/** Join the tour with the PIN (and optionally say which player you are). */
export async function POST(request: Request) {
  let body: { pin?: string; playerId?: string | null; playerName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const pinRequired = isPinRequired();
  let isAdmin = false;

  if (pinRequired) {
    const result = checkPin(body.pin ?? '');
    if (!result.ok) {
      return NextResponse.json({ error: 'That PIN is not right. Try again.' }, { status: 401 });
    }
    isAdmin = result.isAdmin;
  } else if (body.pin) {
    // Demo mode still honours the admin PIN if one happens to be set locally,
    // so captains can rehearse the admin screens before the database exists.
    isAdmin = checkPin(body.pin).isAdmin;
  }

  const session: Session = {
    playerId: body.playerId ?? null,
    playerName: (body.playerName ?? '').slice(0, 60) || 'Guest',
    isAdmin,
    issuedAt: Date.now(),
  };

  const store = await cookies();
  store.set(SESSION_COOKIE, await signSession(session), sessionCookieOptions());

  return NextResponse.json({ session });
}

/** Sign out of this device. */
export async function DELETE() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
